/**
 * Pure check-in rules (no Firebase I/O) — unit-tested in isolation.
 */

const PRE_ARRIVAL_RETENTION_DAYS = 7;

function addDaysToIsoDate(isoDate, days) {
  const parts = String(isoDate || "")
    .split("-")
    .map(Number);
  if (parts.length < 3) return null;
  const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function bookingEndIso(booking) {
  const end = String(booking?.end || "").trim();
  if (!end) return null;
  return end.split("T")[0];
}

function hasPreArrivalData(booking) {
  return Boolean(
    booking?.preArrivalComplete ||
      booking?.preArrivalSubmittedAt ||
      booking?.preArrivalSubmission
  );
}

/** True when the booking still stores passport / ID document or manual ID details. */
function hasRetainedIdDocumentData(booking) {
  const submission = booking?.preArrivalSubmission;
  if (!submission || typeof submission !== "object") return false;
  if (submission.idDocument) return true;
  if (submission.idDetails && typeof submission.idDetails === "object") {
    return Object.keys(submission.idDetails).length > 0;
  }
  return false;
}

function isPreArrivalPurgeDue(booking, todayKey, retentionDays = PRE_ARRIVAL_RETENTION_DAYS) {
  const endIso = bookingEndIso(booking);
  if (!endIso) return false;
  const purgeOnOrAfterKey = addDaysToIsoDate(endIso, retentionDays);
  if (!purgeOnOrAfterKey) return false;
  return purgeOnOrAfterKey <= todayKey;
}

/** Full wipe of pre-arrival fields (admin remove / wrong-dates on calendar bookings). */
function stripPreArrivalFields(booking) {
  const {
    preArrivalComplete: _complete,
    preArrivalSubmittedAt: _submittedAt,
    preArrivalSubmission: _submission,
    ...rest
  } = booking || {};
  return rest;
}

/**
 * Retention purge: remove only passport/ID payload.
 * Keeps preArrivalComplete and the rest of the check-in submission.
 */
function stripIdDocumentFromBooking(booking) {
  const source = booking && typeof booking === "object" ? booking : {};
  const submission = source.preArrivalSubmission;
  if (!submission || typeof submission !== "object") {
    return { ...source };
  }

  const { idDocument: _idDoc, idDetails: _idDetails, ...restSubmission } = submission;
  return {
    ...source,
    preArrivalSubmission: restSubmission,
  };
}

/** Guest-entered stay (no calendar sync) — booking exists only because of online check-in. */
function isGuestCreatedOnlineCheckInBooking(booking) {
  if (!booking) return false;
  if (String(booking.provider || "").trim() === "Online check-in") return true;
  return String(booking.id || "").startsWith("CHECKIN-");
}

/**
 * Wrong dates? restart:
 * - Online check-in booking → delete from admin
 * - Calendar booking with check-in data → clear check-in, keep reservation
 * - Otherwise → end session only
 */
function resolveWrongDatesResetAction(booking) {
  if (isGuestCreatedOnlineCheckInBooking(booking)) return "remove_booking";
  if (hasPreArrivalData(booking)) return "clear_pre_arrival";
  return "session_only";
}

module.exports = {
  PRE_ARRIVAL_RETENTION_DAYS,
  addDaysToIsoDate,
  bookingEndIso,
  hasPreArrivalData,
  hasRetainedIdDocumentData,
  isPreArrivalPurgeDue,
  stripPreArrivalFields,
  stripIdDocumentFromBooking,
  isGuestCreatedOnlineCheckInBooking,
  resolveWrongDatesResetAction,
};
