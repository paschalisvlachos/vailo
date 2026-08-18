/** Shared rules: house-guest portal access requires an active, non-revoked booking. */

async function getBookingById(firestore, propertyId, typeId, bookingId) {
  if (!propertyId || !typeId || !bookingId) return null;
  const typeSnap = await firestore
    .collection("properties")
    .doc(propertyId)
    .collection("propertyTypes")
    .doc(typeId)
    .get();
  if (!typeSnap.exists) return null;
  const bookings = typeSnap.data().syncedBookings || [];
  return bookings.find((b) => b.id && b.id === bookingId) || null;
}

function isBookingPortalAccessRevoked(booking) {
  return Boolean(booking?.portalAccessRevokedAt);
}

function isBookingPortalAccessAllowed(booking) {
  if (!booking) return false;
  if (isBookingPortalAccessRevoked(booking)) return false;
  return true;
}

function isPlaceholderBookingGuestName(name) {
  const trimmed = String(name || "").trim();
  if (!trimmed) return true;
  const lower = trimmed.toLowerCase();
  return (
    lower.includes("closed") ||
    lower.includes("blocked") ||
    lower.includes("not available") ||
    lower.includes("unavailable") ||
    lower === "blocked date"
  );
}

function resolveBookingGuestDisplayName(booking) {
  for (const value of [booking?.guestName, booking?.summary]) {
    const trimmed = String(value || "").trim();
    if (trimmed && !isPlaceholderBookingGuestName(trimmed)) {
      return trimmed;
    }
  }
  return null;
}

async function assertBookingPortalAccess(firestore, propertyId, typeId, bookingId) {
  const booking = await getBookingById(firestore, propertyId, typeId, bookingId);
  if (!isBookingPortalAccessAllowed(booking)) {
    return { ok: false, reason: "booking_cancelled" };
  }
  return { ok: true, booking };
}

module.exports = {
  getBookingById,
  isBookingPortalAccessRevoked,
  isBookingPortalAccessAllowed,
  assertBookingPortalAccess,
  isPlaceholderBookingGuestName,
  resolveBookingGuestDisplayName,
};
