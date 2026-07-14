const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { FieldValue } = require("firebase-admin/firestore");
const { resendApiKey } = require("./resendInbox");
const {
  getBookingById,
  isBookingPortalAccessAllowed,
} = require("./guestPortalBookingAccess");
const {
  buildAssistantEscalationAdminUrl,
  deliverAssistantEscalationEmail,
} = require("./guestAssistantEscalationEmail");

const DEDUP_WINDOW_MS = 15 * 60 * 1000;
const MAX_ALERTS_PER_TYPE_PER_DAY = 10;
const MAX_QUESTION_LENGTH = 1000;
const MAX_AI_RESPONSE_LENGTH = 4000;

function normalizeQuestion(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function startOfUtcDayMs() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}

async function getSession(firestore, propertyId, sessionId) {
  const snap = await firestore
    .collection("properties")
    .doc(propertyId)
    .collection("guestPortalSessions")
    .doc(sessionId)
    .get();
  if (!snap.exists) return null;
  return { sessionId: snap.id, ...snap.data() };
}

async function requireGuestSession(firestore, propertyId, typeId, sessionId) {
  if (!propertyId || !typeId || !sessionId) {
    throw new HttpsError("invalid-argument", "Missing session parameters.");
  }
  const session = await getSession(firestore, propertyId, sessionId);
  if (!session || session.typeId !== typeId) {
    throw new HttpsError("permission-denied", "Invalid session.");
  }
  if (Date.now() > new Date(session.accessUntil).getTime()) {
    throw new HttpsError("permission-denied", "Session expired.");
  }
  if (session.source === "admin_preview" || session.source === "tester") {
    return { session, previewMode: true };
  }
  if (!session.bookingId) {
    throw new HttpsError("failed-precondition", "No booking linked to session.");
  }
  const booking = await getBookingById(
    firestore,
    propertyId,
    typeId,
    session.bookingId
  );
  if (!isBookingPortalAccessAllowed(booking)) {
    throw new HttpsError("permission-denied", "Booking access not allowed.");
  }
  return { session, previewMode: false };
}

async function resolveHostEmail(firestore, property) {
  const ownerId = String(property?.ownerId || "").trim();
  if (!ownerId) return null;
  const ownerSnap = await firestore.collection("owners").doc(ownerId).get();
  if (!ownerSnap.exists) return null;
  const email = String(ownerSnap.data()?.email || "").trim();
  return email.includes("@") ? email : null;
}

async function listRecentEscalations(firestore, propertyId) {
  const snap = await firestore
    .collection("properties")
    .doc(propertyId)
    .collection("guestIssues")
    .orderBy("createdAt", "desc")
    .limit(40)
    .get();
  return snap.docs;
}

function issueCreatedAtMs(data) {
  const createdAt = data?.createdAt;
  if (!createdAt) return 0;
  if (typeof createdAt.toDate === "function") return createdAt.toDate().getTime();
  const parsed = new Date(createdAt).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function findRecentDuplicate(docs, typeId, questionNorm) {
  const sinceMs = Date.now() - DEDUP_WINDOW_MS;
  for (const doc of docs) {
    const data = doc.data() || {};
    if (data.source !== "assistant_escalation") continue;
    if (String(data.propertyTypeId || "") !== typeId) continue;
    if (issueCreatedAtMs(data) < sinceMs) continue;
    const desc = normalizeQuestion(data.description);
    if (desc && desc === questionNorm) return doc;
  }
  return null;
}

function countAlertsToday(docs, typeId) {
  const sinceMs = startOfUtcDayMs();
  let count = 0;
  for (const doc of docs) {
    const data = doc.data() || {};
    if (data.source !== "assistant_escalation") continue;
    if (String(data.propertyTypeId || "") !== typeId) continue;
    if (data.hostNotifyStatus !== "sent") continue;
    if (issueCreatedAtMs(data) >= sinceMs) count += 1;
  }
  return count;
}

function registerGuestAssistantEscalation({ firestore, logger, firebaseExports }) {
  if (!firebaseExports) {
    throw new Error("registerGuestAssistantEscalation requires firebaseExports");
  }

  firebaseExports.escalateAssistantQuestion = onCall(
    {
      region: "us-central1",
      secrets: [resendApiKey],
      enforceAppCheck: false,
    },
    async (request) => {
      const data = request.data || {};
      const propertyId = String(data.propertyId || "").trim();
      const typeId = String(data.typeId || "").trim();
      const sessionId = String(data.sessionId || "").trim();
      const guestQuestion = String(data.guestQuestion || "").trim().slice(0, MAX_QUESTION_LENGTH);
      const aiResponse = String(data.aiResponse || "").trim().slice(0, MAX_AI_RESPONSE_LENGTH);

      if (!propertyId || !typeId || !sessionId) {
        throw new HttpsError("invalid-argument", "Missing escalation parameters.");
      }
      if (!guestQuestion) {
        throw new HttpsError("invalid-argument", "guestQuestion is required.");
      }

      const { previewMode } = await requireGuestSession(
        firestore,
        propertyId,
        typeId,
        sessionId
      );

      const questionNorm = normalizeQuestion(guestQuestion);
      const recentIssues = await listRecentEscalations(firestore, propertyId);
      const duplicate = findRecentDuplicate(recentIssues, typeId, questionNorm);
      if (duplicate) {
        const dupData = duplicate.data() || {};
        return {
          issueId: duplicate.id,
          hostEmailSent: dupData.hostNotifyStatus === "sent",
          deduped: true,
          previewMode,
        };
      }

      const propSnap = await firestore.collection("properties").doc(propertyId).get();
      if (!propSnap.exists) {
        throw new HttpsError("not-found", "Property not found.");
      }
      const property = propSnap.data() || {};

      const typeSnap = await firestore
        .collection("properties")
        .doc(propertyId)
        .collection("propertyTypes")
        .doc(typeId)
        .get();
      const typeData = typeSnap.exists ? typeSnap.data() : {};

      const propertyName =
        String(property.propertyName || property.title || "").trim() || "Your property";
      const unitName = String(typeData.propertyTypeName || "").trim();

      let hostNotifyStatus = "pending";
      let hostNotifiedAt = null;
      let hostEmailSent = false;

      const alertsToday = previewMode ? 0 : countAlertsToday(recentIssues, typeId);
      const rateLimited = !previewMode && alertsToday >= MAX_ALERTS_PER_TYPE_PER_DAY;

      const issueRef = firestore
        .collection("properties")
        .doc(propertyId)
        .collection("guestIssues")
        .doc();

      if (previewMode) {
        hostNotifyStatus = "skipped_preview";
      } else if (rateLimited) {
        hostNotifyStatus = "rate_limited";
      } else {
        const hostEmail = await resolveHostEmail(firestore, property);
        if (!hostEmail) {
          hostNotifyStatus = "skipped_no_email";
        } else {
          try {
            await deliverAssistantEscalationEmail(resendApiKey.value(), hostEmail, {
              propertyName,
              unitName,
              guestQuestion,
              aiResponse,
              adminUrl: buildAssistantEscalationAdminUrl(propertyId),
            });
            hostNotifyStatus = "sent";
            hostNotifiedAt = new Date().toISOString();
            hostEmailSent = true;
          } catch (err) {
            logger.error("Assistant escalation email failed", {
              propertyId,
              typeId,
              error: err?.message || String(err),
            });
            hostNotifyStatus = "failed";
          }
        }
      }

      await issueRef.set({
        description: guestQuestion,
        aiResponse: aiResponse || "",
        propertyTypeId: typeId,
        propertyTypeName: unitName,
        propertyName,
        source: "assistant_escalation",
        seenByHost: false,
        resolved: false,
        sessionId,
        hostNotifyStatus,
        hostNotifiedAt,
        createdAt: FieldValue.serverTimestamp(),
      });

      return {
        issueId: issueRef.id,
        hostEmailSent,
        deduped: false,
        rateLimited,
        previewMode,
        hostNotifyStatus,
      };
    }
  );
}

module.exports = { registerGuestAssistantEscalation };
