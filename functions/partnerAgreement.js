const { onCall, HttpsError } = require("firebase-functions/v2/https");
const crypto = require("crypto");
const { requirePlatformAdmin } = require("./platformAdmin");
const { resendApiKey } = require("./resendInbox");
const {
  buildPartnerAgreementUrl,
  deliverPartnerAgreementEmail,
} = require("./partnerAgreementEmail");

const AGREEMENT_KINDS = [
  {
    id: "property_owner",
    label: "Property owner agreement",
  },
  {
    id: "agency",
    label: "Agency agreement",
  },
  {
    id: "excursion_provider",
    label: "Excursion provider agreement",
  },
];

function normalizeOwnerRole(role) {
  if (role === "admin") return "admin";
  if (role === "agent") return "agent";
  if (role === "excursion_provider") return "excursion_provider";
  return "owner";
}

function ownerRoleToAgreementKind(role) {
  switch (normalizeOwnerRole(role)) {
    case "owner":
      return "property_owner";
    case "agent":
      return "agency";
    case "excursion_provider":
      return "excursion_provider";
    default:
      return null;
  }
}

function agreementKindLabel(kind) {
  return AGREEMENT_KINDS.find((k) => k.id === kind)?.label || "Partner agreement";
}

function generateToken() {
  return crypto.randomBytes(18).toString("hex");
}

function normalizeLocale(locale) {
  return String(locale || "en").trim().toLowerCase() || "en";
}

function parseLocaleHtmlMap(raw) {
  if (!raw || typeof raw !== "object") return undefined;
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string" && value.trim()) {
      out[String(key).trim().toLowerCase()] = value;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function resolveLegalHtmlForLocale(byLocale, legacy, locale) {
  const code = normalizeLocale(locale);
  const fromMap = byLocale?.[code]?.trim();
  if (fromMap) return fromMap;
  const en = byLocale?.en?.trim();
  if (en) return en;
  const first = byLocale && Object.values(byLocale).find((h) => h?.trim());
  if (first) return first;
  return legacy || "";
}

function parseAgreementsByKind(raw) {
  if (!raw || typeof raw !== "object") return undefined;
  const out = {};
  for (const kind of AGREEMENT_KINDS) {
    const localeMap = parseLocaleHtmlMap(raw[kind.id]);
    if (localeMap) out[kind.id] = localeMap;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function parsePlatformLegal(data) {
  if (!data) {
    return {
      agreementsByKind: undefined,
      agreement: "",
      agreementByLocale: undefined,
      updatedAt: null,
    };
  }

  const legacyAgreement = typeof data.agreement === "string" ? data.agreement : "";
  let agreementByLocale = parseLocaleHtmlMap(data.agreementByLocale);
  if (legacyAgreement.trim() && !agreementByLocale?.en) {
    agreementByLocale = { ...(agreementByLocale || {}), en: legacyAgreement };
  }

  let agreementsByKind = parseAgreementsByKind(data.agreementsByKind);
  if (!agreementsByKind?.property_owner && (legacyAgreement.trim() || agreementByLocale)) {
    agreementsByKind = {
      ...(agreementsByKind || {}),
      property_owner: agreementByLocale || (legacyAgreement.trim() ? { en: legacyAgreement } : {}),
    };
  }

  let updatedAt = null;
  if (data.updatedAt && typeof data.updatedAt.toDate === "function") {
    updatedAt = data.updatedAt.toDate().toISOString();
  }

  return {
    agreementsByKind,
    agreement: legacyAgreement,
    agreementByLocale,
    updatedAt,
  };
}

function resolveAgreementForKind(content, kind, locale) {
  const byKind = content.agreementsByKind?.[kind];
  if (byKind && Object.keys(byKind).length > 0) {
    return resolveLegalHtmlForLocale(byKind, "", locale);
  }
  if (kind === "property_owner") {
    return resolveLegalHtmlForLocale(content.agreementByLocale, content.agreement, locale);
  }
  return "";
}

async function loadPlatformLegal(firestore) {
  const snap = await firestore.collection("platformSettings").doc("legal").get();
  return parsePlatformLegal(snap.exists ? snap.data() : null);
}

async function findOwnerByAgreementToken(firestore, token) {
  const trimmed = String(token || "").trim();
  if (!trimmed) return null;
  const snap = await firestore
    .collection("owners")
    .where("partnerAgreementInviteToken", "==", trimmed)
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, data: doc.data() };
}

async function sendPartnerAgreementInviteHandler(request, firestore) {
  await requirePlatformAdmin(request, firestore);

  const ownerId = String(request.data?.ownerId || "").trim();
  const locale = normalizeLocale(request.data?.locale);

  if (!ownerId) {
    throw new HttpsError("invalid-argument", "ownerId is required.");
  }

  const ownerRef = firestore.collection("owners").doc(ownerId);
  const ownerSnap = await ownerRef.get();
  if (!ownerSnap.exists) {
    throw new HttpsError("not-found", "User not found in Owners CRM.");
  }

  const ownerData = ownerSnap.data();
  const email = String(ownerData.email || "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    throw new HttpsError("failed-precondition", "This user does not have a valid email address.");
  }

  const agreementKind = ownerRoleToAgreementKind(ownerData.role);
  if (!agreementKind) {
    throw new HttpsError(
      "failed-precondition",
      "Platform admins do not require a partner agreement invite."
    );
  }

  const legal = await loadPlatformLegal(firestore);
  const agreementHtml = resolveAgreementForKind(legal, agreementKind, locale);
  if (!String(agreementHtml || "").trim()) {
    throw new HttpsError(
      "failed-precondition",
      `No ${agreementKindLabel(agreementKind)} content is published yet. Add it under Admin → Legal Documents first.`
    );
  }

  const token = generateToken();
  const sentAt = new Date().toISOString();
  const agreementUrl = buildPartnerAgreementUrl(token);
  const agreementLabel = agreementKindLabel(agreementKind).toLowerCase();

  let resendSentId = null;
  try {
    const sent = await deliverPartnerAgreementEmail(resendApiKey.value(), email, {
      recipientName: ownerData.fullName || ownerData.company || email,
      agreementLabel,
      agreementUrl,
    });
    resendSentId = sent?.id || null;
  } catch (error) {
    throw new HttpsError(
      "internal",
      error?.message || "Could not send agreement invitation email."
    );
  }

  await ownerRef.set(
    {
      partnerAgreementKind: agreementKind,
      partnerAgreementInviteToken: token,
      partnerAgreementInviteSentAt: sentAt,
      partnerAgreementInviteResendId: resendSentId,
      partnerAgreementAcceptedAt: null,
      partnerAgreementAcceptedLocale: null,
      partnerAgreementLegalUpdatedAt: legal.updatedAt || null,
      updatedAt: sentAt,
    },
    { merge: true }
  );

  return {
    ownerId,
    email,
    agreementKind,
    agreementUrl,
    inviteSentAt: sentAt,
    resendSentId,
  };
}

async function getPartnerAgreementInviteHandler(request, firestore) {
  const token = String(request.data?.token || "").trim();
  if (!token) {
    throw new HttpsError("invalid-argument", "token is required.");
  }

  const match = await findOwnerByAgreementToken(firestore, token);
  if (!match) {
    throw new HttpsError("not-found", "This agreement link is invalid or has expired.");
  }

  const { data } = match;
  const agreementKind =
    data.partnerAgreementKind || ownerRoleToAgreementKind(data.role);
  if (!agreementKind) {
    throw new HttpsError("failed-precondition", "No agreement applies to this account.");
  }

  const locale = normalizeLocale(request.data?.locale);
  const legal = await loadPlatformLegal(firestore);
  const agreementHtml = resolveAgreementForKind(legal, agreementKind, locale);
  if (!String(agreementHtml || "").trim()) {
    throw new HttpsError(
      "failed-precondition",
      "This agreement is not available yet. Please contact Vailo support."
    );
  }

  return {
    recipientName: String(data.fullName || "").trim() || "Partner",
    company: String(data.company || "").trim(),
    agreementKind,
    agreementLabel: agreementKindLabel(agreementKind),
    agreementHtml,
    locale,
    alreadyAccepted: Boolean(data.partnerAgreementAcceptedAt),
    acceptedAt: data.partnerAgreementAcceptedAt || null,
    inviteSentAt: data.partnerAgreementInviteSentAt || null,
  };
}

async function acceptPartnerAgreementHandler(request, firestore) {
  const token = String(request.data?.token || "").trim();
  if (!token) {
    throw new HttpsError("invalid-argument", "token is required.");
  }

  const match = await findOwnerByAgreementToken(firestore, token);
  if (!match) {
    throw new HttpsError("not-found", "This agreement link is invalid or has expired.");
  }

  const { id, data } = match;
  if (data.partnerAgreementAcceptedAt) {
    return {
      acceptedAt: data.partnerAgreementAcceptedAt,
      alreadyAccepted: true,
    };
  }

  const agreementKind =
    data.partnerAgreementKind || ownerRoleToAgreementKind(data.role);
  if (!agreementKind) {
    throw new HttpsError("failed-precondition", "No agreement applies to this account.");
  }

  const locale = normalizeLocale(request.data?.locale);
  const legal = await loadPlatformLegal(firestore);
  const agreementHtml = resolveAgreementForKind(legal, agreementKind, locale);
  if (!String(agreementHtml || "").trim()) {
    throw new HttpsError(
      "failed-precondition",
      "This agreement is not available yet. Please contact Vailo support."
    );
  }

  const acceptedAt = new Date().toISOString();
  await firestore.collection("owners").doc(id).set(
    {
      partnerAgreementAcceptedAt: acceptedAt,
      partnerAgreementAcceptedLocale: locale,
      partnerAgreementLegalUpdatedAt: legal.updatedAt || null,
      updatedAt: acceptedAt,
    },
    { merge: true }
  );

  return {
    acceptedAt,
    alreadyAccepted: false,
  };
}

function registerPartnerAgreement({ firestore, firebaseExports }) {
  firebaseExports.sendPartnerAgreementInvite = onCall(
    { secrets: [resendApiKey], enforceAppCheck: false },
    async (request) => sendPartnerAgreementInviteHandler(request, firestore)
  );

  firebaseExports.getPartnerAgreementInvite = onCall(
    { enforceAppCheck: false },
    async (request) => getPartnerAgreementInviteHandler(request, firestore)
  );

  firebaseExports.acceptPartnerAgreement = onCall(
    { enforceAppCheck: false },
    async (request) => acceptPartnerAgreementHandler(request, firestore)
  );
}

module.exports = {
  registerPartnerAgreement,
  ownerRoleToAgreementKind,
  agreementKindLabel,
};
