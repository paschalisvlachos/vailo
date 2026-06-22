const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const {
  getBookingById,
  isBookingPortalAccessAllowed,
} = require("./guestPortalBookingAccess");

const MAX_EVENTS_PER_CALL = 25;
const MAX_TEXT_LEN = 16000;
const MAX_PLAN_DATA_LEN = 48000;

function truncateText(text, max = 8000) {
  const t = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return "";
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

function sanitizePayload(type, payload = {}) {
  const out = { ...payload };
  if (out.text) {
    const limit =
      type === "assistant_reply" ||
      type === "ai_expert_reply" ||
      type === "ai_expert_chat_message" ||
      type === "ai_expert_wizard_message"
        ? MAX_TEXT_LEN
        : 8000;
    out.text = truncateText(out.text, limit);
  }
  if (out.planData) {
    const raw = String(out.planData);
    out.planData =
      raw.length <= MAX_PLAN_DATA_LEN
        ? raw
        : `${raw.slice(0, MAX_PLAN_DATA_LEN)}…`;
  }
  if (Array.isArray(out.planCategories) && out.planCategories.length > 8) {
    out.planCategories = out.planCategories.slice(0, 8);
  }
  if (out.picksSummary) {
    out.picksSummary = truncateText(out.picksSummary, 2000);
  }
  delete out.undefined;
  return out;
}

async function getSession(firestore, propertyId, sessionId) {
  const ref = firestore
    .collection("properties")
    .doc(propertyId)
    .collection("guestPortalSessions")
    .doc(sessionId);
  const snap = await ref.get();
  if (!snap.exists) return null;
  return { sessionId: snap.id, ...snap.data() };
}

async function loadBookingMeta(firestore, propertyId, typeId, bookingId) {
  const typeSnap = await firestore
    .collection("properties")
    .doc(propertyId)
    .collection("propertyTypes")
    .doc(typeId)
    .get();
  if (!typeSnap.exists) return null;
  const bookings = typeSnap.data().syncedBookings || [];
  const booking = bookings.find((b) => b.id === bookingId);
  if (!booking) return null;
  return {
    guestName: booking.guestName || booking.summary || "Guest",
    guestEmail: booking.guestEmail || "",
    stayStart: booking.start || "",
    stayEnd: booking.end || "",
  };
}

function analyticsBasePath(firestore, propertyId, typeId) {
  return firestore
    .collection("properties")
    .doc(propertyId)
    .collection("propertyTypes")
    .doc(typeId);
}

function isValidVisitorId(id) {
  const trimmed = String(id || "").trim();
  return trimmed.length >= 8 && trimmed.length <= 128;
}

function sanitizeClientDevice(raw) {
  if (!raw || typeof raw !== "object") return null;
  const deviceTypeRaw = String(raw.deviceType || "").trim();
  const deviceType = ["mobile", "tablet", "desktop"].includes(deviceTypeRaw)
    ? deviceTypeRaw
    : "desktop";
  const osName = String(raw.osName || "Unknown")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 48) || "Unknown";
  const deviceLabel =
    String(raw.deviceLabel || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80) ||
    `${deviceType.charAt(0).toUpperCase()}${deviceType.slice(1)} · ${osName}`;
  return { deviceType, osName, deviceLabel };
}

function applyClientDeviceToSummary(summaryUpdate, summarySnap, clientDevice) {
  if (!clientDevice) return;
  summaryUpdate.lastDeviceType = clientDevice.deviceType;
  summaryUpdate.lastOsName = clientDevice.osName;
  summaryUpdate.lastDeviceLabel = clientDevice.deviceLabel;
  if (!summarySnap.exists) {
    summaryUpdate.firstDeviceType = clientDevice.deviceType;
    summaryUpdate.firstOsName = clientDevice.osName;
    summaryUpdate.firstDeviceLabel = clientDevice.deviceLabel;
  }
}

async function assertPropertyTypeExists(firestore, propertyId, typeId) {
  const typeSnap = await analyticsBasePath(firestore, propertyId, typeId).get();
  if (!typeSnap.exists) {
    throw new HttpsError("not-found", "Property unit not found.");
  }
}

function applyEventToSummary(type, payload, summaryUpdate, accordionOpens, gemImpressions, inc) {
  switch (type) {
    case "portal_session":
      summaryUpdate.portalSessions = inc(1);
      break;
    case "live_like_local_open":
      summaryUpdate.liveLikeLocalOpens = inc(1);
      break;
    case "guide_accordion_open": {
      const key = String(payload.sectionKey || "unknown").slice(0, 64);
      accordionOpens[key] = (accordionOpens[key] || 0) + 1;
      break;
    }
    case "gem_impression": {
      const gemId = String(payload.gemId || "").slice(0, 128);
      if (gemId) {
        const prev = gemImpressions[gemId] || 0;
        gemImpressions[gemId] = prev + 1;
        if (prev === 0) {
          summaryUpdate.uniqueGemsSeen = inc(1);
        }
      }
      break;
    }
    case "gem_description_expand":
      break;
    case "assistant_user_message":
    case "assistant_reply":
      summaryUpdate.assistantTurns = inc(1);
      break;
    case "ai_expert_user_message":
    case "ai_expert_reply":
    case "ai_expert_selection":
    case "ai_expert_plan":
    case "ai_expert_wizard_message":
    case "ai_expert_chat_message":
      summaryUpdate.aiExpertTurns = inc(1);
      break;
    default:
      break;
  }
}

function initSummaryCounters(summaryUpdate, summarySnap) {
  if (!summarySnap.exists) {
    summaryUpdate.firstSeenAt = summaryUpdate.lastSeenAt;
    summaryUpdate.portalSessions = 0;
    summaryUpdate.liveLikeLocalOpens = 0;
    summaryUpdate.assistantTurns = 0;
    summaryUpdate.aiExpertTurns = 0;
    summaryUpdate.uniqueGemsSeen = 0;
    summaryUpdate.accordionOpens = {};
    summaryUpdate.gemImpressions = {};
  }
}

function registerGuestPortalAnalytics({ firestore, firebaseExports }) {
  if (!firebaseExports) {
    throw new Error("registerGuestPortalAnalytics requires firebaseExports");
  }
  const exp = firebaseExports;
  const inc = admin.firestore.FieldValue.increment;
  const serverTs = admin.firestore.FieldValue.serverTimestamp();

  exp.logGuestPortalAnalytics = onCall(async (request) => {
    const { propertyId, typeId, sessionId, visitorId, clientDevice: rawClientDevice, events } =
      request.data || {};
    if (!propertyId || !typeId || !Array.isArray(events)) {
      throw new HttpsError("invalid-argument", "Missing analytics parameters.");
    }
    if (!sessionId && !visitorId) {
      throw new HttpsError(
        "invalid-argument",
        "Provide sessionId (booking guest) or visitorId (anonymous)."
      );
    }
    if (events.length === 0) {
      return { ok: true, logged: 0 };
    }
    if (events.length > MAX_EVENTS_PER_CALL) {
      throw new HttpsError(
        "invalid-argument",
        `At most ${MAX_EVENTS_PER_CALL} events per request.`
      );
    }

    await assertPropertyTypeExists(firestore, propertyId, typeId);

    const nowIso = new Date().toISOString();
    let summaryRef;
    let eventsCollection;
    let summaryIdentity = {};
    let guestName = "Anonymous visitor";

    if (sessionId) {
      const session = await getSession(firestore, propertyId, sessionId);
      if (!session || session.typeId !== typeId) {
        throw new HttpsError("permission-denied", "Invalid session.");
      }
      if (Date.now() > new Date(session.accessUntil).getTime()) {
        throw new HttpsError("permission-denied", "Session expired.");
      }
      if (!session.bookingId) {
        return { ok: true, logged: 0, skipped: "no_booking" };
      }
      if (session.source === "admin_preview" || session.source === "tester") {
        return { ok: true, logged: 0, skipped: session.source };
      }

      const booking = await getBookingById(
        firestore,
        propertyId,
        typeId,
        session.bookingId
      );
      if (!isBookingPortalAccessAllowed(booking)) {
        throw new HttpsError(
          "permission-denied",
          "This reservation was cancelled. Guest portal access is no longer available."
        );
      }

      const bookingId = session.bookingId;
      const meta =
        (await loadBookingMeta(firestore, propertyId, typeId, bookingId)) || {
          guestName: session.guestName || "Guest",
          guestEmail: "",
          stayStart: "",
          stayEnd: "",
        };

      guestName = meta.guestName;
      summaryRef = analyticsBasePath(firestore, propertyId, typeId)
        .collection("guestStayAnalytics")
        .doc(bookingId);
      eventsCollection = analyticsBasePath(firestore, propertyId, typeId).collection(
        "guestStayEvents"
      );
      summaryIdentity = {
        bookingId,
        subjectKind: "booking",
        guestName: meta.guestName,
        guestEmail: meta.guestEmail,
        stayStart: meta.stayStart,
        stayEnd: meta.stayEnd,
      };
    } else {
      const trimmedVisitorId = String(visitorId).trim();
      if (!isValidVisitorId(trimmedVisitorId)) {
        throw new HttpsError("invalid-argument", "Invalid visitor id.");
      }

      summaryRef = analyticsBasePath(firestore, propertyId, typeId)
        .collection("guestAnonymousAnalytics")
        .doc(trimmedVisitorId);
      eventsCollection = analyticsBasePath(firestore, propertyId, typeId).collection(
        "guestAnonymousEvents"
      );
      summaryIdentity = {
        visitorId: trimmedVisitorId,
        subjectKind: "anonymous",
      };
    }

    const summarySnap = await summaryRef.get();
    const summaryUpdate = {
      ...summaryIdentity,
      typeId,
      propertyId,
      lastSeenAt: nowIso,
      updatedAt: serverTs,
    };
    initSummaryCounters(summaryUpdate, summarySnap);
    applyClientDeviceToSummary(
      summaryUpdate,
      summarySnap,
      sanitizeClientDevice(rawClientDevice)
    );

    const accordionOpens = {
      ...(summarySnap.exists ? summarySnap.data().accordionOpens || {} : {}),
    };
    const gemImpressions = {
      ...(summarySnap.exists ? summarySnap.data().gemImpressions || {} : {}),
    };

    const batch = firestore.batch();
    let logged = 0;

    for (const raw of events) {
      const type = String(raw?.type || "").trim();
      if (!type) continue;
      const payload = sanitizePayload(type, raw.payload || {});

      const eventRef = eventsCollection.doc();
      batch.set(eventRef, {
        ...summaryIdentity,
        typeId,
        propertyId,
        guestName,
        at: nowIso,
        type,
        payload,
      });
      logged += 1;

      applyEventToSummary(type, payload, summaryUpdate, accordionOpens, gemImpressions, inc);
    }

    summaryUpdate.accordionOpens = accordionOpens;
    summaryUpdate.gemImpressions = gemImpressions;
    batch.set(summaryRef, summaryUpdate, { merge: true });
    await batch.commit();

    return { ok: true, logged };
  });
}

module.exports = { registerGuestPortalAnalytics };
