const {
  getGuestPortalPublicOrigin,
  formatGuestSlug,
  getTypePublicSlug,
  buildInvitePortalUrl,
  formatBookingDateRange,
  buildGuestInviteEmailFromContext,
  deliverGuestInviteEmail,
} = require("./guestInviteEmail");

function parseIsoDay(iso) {
  if (!iso) return null;
  const day = String(iso).trim().slice(0, 10);
  const parts = day.split("-").map(Number);
  if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return null;
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  d.setHours(0, 0, 0, 0);
  return d;
}

function isBookingCheckoutReached(booking) {
  const end = parseIsoDay(booking?.end);
  if (!end) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today.getTime() > end.getTime();
}

function bookingGuestComplete(booking) {
  const name = String(booking?.guestName || booking?.summary || "").trim();
  const locale = String(booking?.guestLocale || "").trim();
  if (!name || !locale) return false;
  if (booking?.guestDetailsComplete === false) return false;
  return true;
}

function isAutoInviteEligible(property, booking) {
  if (!property?.autoSendGuestInviteWhenReady) return false;
  if (booking?.isInvited) return false;
  if (booking?.portalAccessRevokedAt) return false;
  if (isBookingCheckoutReached(booking)) return false;
  if (!bookingGuestComplete(booking)) return false;
  const email = String(booking?.guestEmail || "").trim();
  if (!email.includes("@")) return false;
  return true;
}

function patchBookingInList(bookings, bookingId, patch) {
  return bookings.map((b) => (b.id === bookingId ? { ...b, ...patch } : b));
}

async function deliverGuestInviteForBooking(
  firestore,
  logger,
  resendKey,
  {
    propertyId,
    typeId,
    bookingId,
    property,
    typeData,
    bookings,
    typeRef,
    reinvite = false,
  }
) {
  const target = bookings.find((b) => b.id === bookingId);
  if (!target) {
    return { sent: false, reason: "booking_not_found" };
  }

  if (!isAutoInviteEligible(property, target) && !reinvite) {
    return { sent: false, reason: "not_eligible" };
  }

  const guestEmail = String(target.guestEmail || "").trim();
  if (!guestEmail.includes("@")) {
    return { sent: false, reason: "missing_email" };
  }

  const propSlug = formatGuestSlug(property.urlSlug);
  const unitSlug = getTypePublicSlug(typeData || {});
  if (!propSlug || !unitSlug) {
    return { sent: false, reason: "missing_slugs" };
  }

  const crypto = require("crypto");
  const generateToken = () => crypto.randomBytes(18).toString("hex");
  const generatePassword = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let pw = "";
    for (let i = 0; i < 8; i += 1) {
      pw += chars[Math.floor(Math.random() * chars.length)];
    }
    return pw;
  };
  const hashPassword = (password) => {
    const salt = crypto.randomBytes(16).toString("hex");
    const hash = crypto.scryptSync(password, salt, 32).toString("hex");
    return `${salt}:${hash}`;
  };
  const portalAccessUntilFromEnd = (end) => {
    const e = parseIsoDay(end);
    if (!e) return null;
    const until = new Date(e.getTime() + 2 * 24 * 60 * 60 * 1000);
    until.setHours(23, 59, 59, 999);
    return until.toISOString();
  };

  const token = target.inviteToken || generateToken();
  const password = generatePassword();
  const passwordHash = hashPassword(password);
  const now = new Date().toISOString();
  const accessUntil = target.portalAccessUntil || portalAccessUntilFromEnd(target.end);
  const origin = getGuestPortalPublicOrigin();
  const inviteUrl = buildInvitePortalUrl(
    origin,
    propSlug,
    unitSlug,
    token,
    typeId,
    target.guestLocale
  );

  const propertyName =
    String(property.propertyName || property.title || "").trim() || "Your stay";
  const unitName = String(typeData?.propertyTypeName || "").trim();
  const emailPayload = buildGuestInviteEmailFromContext({
    guestName: target.guestName,
    guestEmail,
    propertyName,
    unitName,
    stayRangeLabel: formatBookingDateRange(target.start, target.end),
    inviteUrl,
    accessPassword: password,
    reinvite: Boolean(reinvite),
    hostLabel: propertyName,
  });

  const updated = patchBookingInList(bookings, bookingId, {
    inviteToken: token,
    invitePasswordHash: passwordHash,
    inviteStatus: reinvite && target.inviteStatus === "opened" ? "opened" : "waiting",
    isInvited: true,
    lastInvitedAt: now,
    lastInviteChannel: "email",
    portalAccessUntil: accessUntil,
    portalAccessRevokedAt: null,
    portalActivatedAt: target.portalAccessRevokedAt ? null : target.portalActivatedAt,
    accessSource: target.portalAccessRevokedAt ? null : target.accessSource,
  });

  try {
    await typeRef.set({ syncedBookings: updated }, { merge: true });
  } catch (err) {
    logger.error("autoInvite: persist failed before email", {
      propertyId,
      typeId,
      bookingId,
      error: err?.message || String(err),
    });
    return { sent: false, reason: "persist_failed" };
  }

  try {
    const sent = await deliverGuestInviteEmail(resendKey, guestEmail, emailPayload);
    return {
      sent: true,
      bookingId,
      guestEmail,
      resendId: sent?.id || null,
    };
  } catch (err) {
    logger.error("autoInvite: email failed", {
      propertyId,
      typeId,
      bookingId,
      guestEmail,
      error: err?.message || String(err),
    });
    return { sent: false, reason: "email_failed" };
  }
}

async function tryAutoSendGuestInviteForBooking(
  firestore,
  logger,
  resendKey,
  { propertyId, typeId, bookingId }
) {
  const propSnap = await firestore.collection("properties").doc(propertyId).get();
  if (!propSnap.exists) return { sent: false, reason: "property_not_found" };
  const property = propSnap.data();

  const typeRef = firestore
    .collection("properties")
    .doc(propertyId)
    .collection("propertyTypes")
    .doc(typeId);
  const typeSnap = await typeRef.get();
  if (!typeSnap.exists) return { sent: false, reason: "type_not_found" };
  const typeData = typeSnap.data();
  const bookings = typeData.syncedBookings || [];
  const booking = bookings.find((b) => b.id === bookingId);
  if (!booking) return { sent: false, reason: "booking_not_found" };

  return deliverGuestInviteForBooking(firestore, logger, resendKey, {
    propertyId,
    typeId,
    bookingId,
    property,
    typeData,
    bookings,
    typeRef,
  });
}

module.exports = {
  isAutoInviteEligible,
  deliverGuestInviteForBooking,
  tryAutoSendGuestInviteForBooking,
};
