const crypto = require("crypto");

function guestIdentityKey(booking, submission) {
  const email = String(submission?.contactEmail || booking?.guestEmail || "")
    .trim()
    .toLowerCase();
  if (email.includes("@")) return `email:${email}`;

  const phone = String(
    submission?.contactPhone || booking?.guestWhatsapp || booking?.guestPhone || ""
  ).replace(/\D/g, "");
  if (phone.length >= 6) return `phone:${phone}`;

  const name = String(booking?.guestName || booking?.summary || "")
    .trim()
    .toLowerCase();
  return `name:${name || booking?.id || "unknown"}`;
}

function profileDocId(identityKey) {
  return crypto.createHash("sha256").update(identityKey).digest("hex").slice(0, 40);
}

async function upsertGuestProfileFromPreArrival(
  firestore,
  {
    propertyId,
    typeId,
    unitName,
    booking,
    submission,
  }
) {
  if (!propertyId || !booking?.id || !submission) return null;

  const identityKey = guestIdentityKey(booking, submission);
  const profileId = profileDocId(identityKey);
  const ref = firestore
    .collection("properties")
    .doc(propertyId)
    .collection("guestProfiles")
    .doc(profileId);

  const snap = await ref.get();
  const existing = snap.exists ? snap.data() || {} : {};
  const bookingIds = Array.isArray(existing.bookingIds) ? [...existing.bookingIds] : [];
  if (!bookingIds.includes(booking.id)) {
    bookingIds.push(booking.id);
  }

  const payload = {
    identityKey,
    primaryName: String(booking.guestName || booking.summary || "").trim() || existing.primaryName || null,
    primaryEmail:
      String(submission.contactEmail || booking.guestEmail || "").trim() ||
      existing.primaryEmail ||
      null,
    primaryPhone:
      String(submission.contactPhone || booking.guestWhatsapp || booking.guestPhone || "").trim() ||
      existing.primaryPhone ||
      null,
    guestLocale: String(booking.guestLocale || "").trim() || existing.guestLocale || null,
    stayCount: bookingIds.length,
    lastBookingId: booking.id,
    lastTypeId: typeId,
    lastUnitName: String(unitName || "").trim() || null,
    lastStayStart: booking.start || null,
    lastStayEnd: booking.end || null,
    lastPreArrivalAt: submission.submittedAt || null,
    lastExpectedArrivalTime: submission.expectedArrivalTime || null,
    lastGuestCount: submission.guestCount || null,
    lastTransferRequested: submission.transferRequested === true,
    bookingIds: bookingIds.slice(-24),
    updatedAt: new Date().toISOString(),
  };

  await ref.set(payload, { merge: true });
  return { profileId, ...payload };
}

module.exports = {
  upsertGuestProfileFromPreArrival,
  guestIdentityKey,
  profileDocId,
};
