const { HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");

function normalizeAdminEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function platformAdminEmailsFromEnv() {
  return String(process.env.PLATFORM_ADMIN_EMAILS || "")
    .split(",")
    .map((e) => normalizeAdminEmail(e))
    .filter(Boolean);
}

async function requirePlatformAdmin(request, firestore) {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in as a platform admin.");
  }
  const rawEmail = String(request.auth.token?.email || "").trim();
  const email = normalizeAdminEmail(rawEmail);
  if (!email) {
    throw new HttpsError("permission-denied", "Account email required.");
  }

  const ownerId = String(request.data?.ownerId || "").trim();
  if (ownerId) {
    const doc = await firestore.collection("owners").doc(ownerId).get();
    if (doc.exists) {
      const data = doc.data();
      if (data.role === "admin" && normalizeAdminEmail(data.email) === email) {
        return { uid: request.auth.uid, email };
      }
    }
  }

  const emailCandidates = [...new Set([email, rawEmail.toLowerCase(), rawEmail].filter(Boolean))];
  for (const candidate of emailCandidates) {
    const snap = await firestore
      .collection("owners")
      .where("email", "==", candidate)
      .limit(1)
      .get();
    if (!snap.empty && snap.docs[0].data().role === "admin") {
      return { uid: request.auth.uid, email };
    }
  }

  if (platformAdminEmailsFromEnv().includes(email)) {
    return { uid: request.auth.uid, email };
  }

  logger.warn("requirePlatformAdmin: denied", { email, uid: request.auth.uid });
  throw new HttpsError("permission-denied", "Platform admin access required.");
}

module.exports = { requirePlatformAdmin, normalizeAdminEmail };
