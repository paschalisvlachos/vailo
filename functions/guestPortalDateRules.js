/**
 * Pure stay-date rules for open check-in lookup (no Firebase I/O).
 */

const { CheckInValidationError } = require("./guestPreArrivalSubmitRules");

function normalizeBookingDay(iso) {
  return String(iso || "").trim().slice(0, 10);
}

function parseIsoDay(iso) {
  const day = normalizeBookingDay(iso);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const parts = day.split("-").map(Number);
  if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return null;
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  d.setHours(0, 0, 0, 0);
  return d;
}

function bookingMatchesExactDates(booking, checkIn, checkOut) {
  if (!booking?.start || !booking?.end) return false;
  return (
    normalizeBookingDay(booking.start) === normalizeBookingDay(checkIn) &&
    normalizeBookingDay(booking.end) === normalizeBookingDay(checkOut)
  );
}

function parseGuestCheckInDates(checkIn, checkOut, options = {}) {
  const checkInDay = normalizeBookingDay(checkIn);
  const checkOutDay = normalizeBookingDay(checkOut);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkInDay) || !/^\d{4}-\d{2}-\d{2}$/.test(checkOutDay)) {
    throw new CheckInValidationError("Please enter valid check-in and check-out dates.");
  }
  const start = parseIsoDay(checkInDay);
  const end = parseIsoDay(checkOutDay);
  if (!start || !end) {
    throw new CheckInValidationError("Please enter valid check-in and check-out dates.");
  }
  if (options.requireUpcomingCheckIn) {
    let today;
    if (options.today) {
      today = parseIsoDay(options.today);
      if (!today) {
        today = new Date(options.today);
        today.setHours(0, 0, 0, 0);
      }
    } else {
      today = new Date();
      today.setHours(0, 0, 0, 0);
    }
    if (start.getTime() < today.getTime()) {
      throw new CheckInValidationError("Check-in must be today or a later date.");
    }
  }
  if (end.getTime() <= start.getTime()) {
    throw new CheckInValidationError("Check-out must be after check-in.");
  }
  return { checkInDay, checkOutDay };
}

/** Draft booking created when calendar sync is off and guest enters dates. */
function buildOnlineCheckInBookingDraft({ id, checkInDay, checkOutDay }) {
  return {
    id,
    start: checkInDay,
    end: checkOutDay,
    provider: "Online check-in",
    isInvited: false,
    guestDetailsComplete: false,
  };
}

function findExactDateMatches(bookings, checkInDay, checkOutDay) {
  return (Array.isArray(bookings) ? bookings : []).filter((b) =>
    bookingMatchesExactDates(b, checkInDay, checkOutDay)
  );
}

module.exports = {
  normalizeBookingDay,
  parseIsoDay,
  bookingMatchesExactDates,
  parseGuestCheckInDates,
  buildOnlineCheckInBookingDraft,
  findExactDateMatches,
};
