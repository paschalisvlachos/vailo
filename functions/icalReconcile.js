/**
 * Pure iCal reconciliation rules (no Firebase I/O).
 *
 * Channel feeds re-publish the same period with new dates instead of a diff, so
 * matching only on start+end appends a duplicate every time a range moves. We
 * match on the calendar UID, update the stored range in place, and drop feed
 * rows that vanished from the feed — but never rows that carry host or guest
 * work (typed guest details, invites, portal access, check-in data, splits).
 */

const MANUAL_PROVIDERS = new Set(["Direct Booking", "Direct / Manual Booking"]);

function dayKey(iso) {
  return String(iso || "").trim().slice(0, 10);
}

function bookingsMatchByDates(a, b) {
  return Boolean(
    a?.start && a?.end && b?.start && b?.end && dayKey(a.start) === dayKey(b.start) && dayKey(a.end) === dayKey(b.end)
  );
}

function omitUndefined(obj) {
  const out = {};
  for (const [key, value] of Object.entries(obj || {})) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

/** Admin split the imported range into separate stays — leave the parts alone. */
function isSplitBooking(booking) {
  return Boolean(booking?.splitGroupId || booking?.splitPartIndex || booking?.splitFromRange);
}

function isSplitHandledICalEvent(existingBookings, iCalEvent) {
  if (!iCalEvent?.start || !iCalEvent?.end) return false;
  return existingBookings.some(
    (b) =>
      b?.splitFromRange?.start === iCalEvent.start && b?.splitFromRange?.end === iCalEvent.end
  );
}

/** Anything a host or guest already acted on must survive reconciliation. */
function hasHostOrGuestWork(booking) {
  if (!booking) return false;
  if (
    booking.preArrivalComplete ||
    booking.preArrivalSubmission ||
    booking.preArrivalSubmittedAt
  ) {
    return true;
  }
  if (booking.isInvited || booking.inviteToken || booking.invitePasswordHash) return true;
  if (booking.inviteStatus && booking.inviteStatus !== "not_sent") return true;
  if (booking.lastInvitedAt || booking.portalActivatedAt || booking.portalAccessUntil) return true;
  if (booking.postStayThankYouSentAt) return true;
  if (booking.guestDetailsComplete) return true;
  for (const field of ["guestName", "guestEmail", "guestPhone", "guestWhatsapp", "guestLocale"]) {
    if (String(booking[field] || "").trim()) return true;
  }
  return false;
}

/** Guest-entered stay (Online check-in) — never owned by the channel feed. */
function isGuestCreatedBooking(booking) {
  return (
    booking?.provider === "Online check-in" ||
    booking?.accessSource === "pre_arrival_dates" ||
    String(booking?.id || "").startsWith("CHECKIN-")
  );
}

function isManualBooking(booking) {
  const provider = String(booking?.provider || "").trim();
  if (!provider) return true;
  return MANUAL_PROVIDERS.has(provider);
}

/**
 * Safe to drop when the feed no longer lists it: imported, untouched, and not
 * a past stay (channels stop exporting completed stays, which are history).
 */
function canRemoveStaleBooking(booking, todayKey) {
  if (!booking) return false;
  if (isManualBooking(booking)) return false;
  if (isGuestCreatedBooking(booking)) return false;
  if (isSplitBooking(booking)) return false;
  if (hasHostOrGuestWork(booking)) return false;
  const end = dayKey(booking.end);
  if (!end) return false;
  return end >= dayKey(todayKey);
}

function findMatchIndex(bookings, taken, iCalEvent) {
  const uid = String(iCalEvent?.icalUid || "").trim();
  if (uid) {
    const byUid = bookings.findIndex(
      (b, i) => !taken.has(i) && !isSplitBooking(b) && String(b?.icalUid || "").trim() === uid
    );
    if (byUid >= 0) return byUid;
  }
  return bookings.findIndex(
    (b, i) =>
      !taken.has(i) &&
      !isSplitBooking(b) &&
      !String(b?.icalUid || "").trim() &&
      bookingsMatchByDates(b, iCalEvent)
  );
}

/**
 * @param {object[]} existingBookings stored syncedBookings
 * @param {object[]} iCalEvents parsed feed events
 * @param {{ today?: string, allowRemovals?: boolean }} options
 */
function reconcileICalBookings(existingBookings, iCalEvents, options = {}) {
  const bookings = (Array.isArray(existingBookings) ? existingBookings : []).map((b) => ({ ...b }));
  const events = Array.isArray(iCalEvents) ? iCalEvents : [];
  const todayKey = dayKey(options.today || new Date().toISOString());
  // An empty or failed feed must never be read as "everything was cancelled".
  const allowRemovals = options.allowRemovals !== false && events.length > 0;

  const taken = new Set();
  const addedBookings = [];
  let added = 0;
  let updated = 0;

  for (const iCalEvent of events) {
    if (!iCalEvent?.start || !iCalEvent?.end) continue;
    if (isSplitHandledICalEvent(bookings, iCalEvent)) continue;

    const index = findMatchIndex(bookings, taken, iCalEvent);
    if (index >= 0) {
      taken.add(index);
      const previous = bookings[index];
      const next = omitUndefined({
        ...previous,
        start: iCalEvent.start,
        end: iCalEvent.end,
        summary: iCalEvent.summary ?? previous.summary,
        provider: iCalEvent.provider ?? previous.provider,
        icalUid: String(iCalEvent.icalUid || "").trim() || previous.icalUid,
      });
      if (JSON.stringify(next) !== JSON.stringify(previous)) updated += 1;
      bookings[index] = next;
      continue;
    }

    const row = omitUndefined(iCalEvent);
    bookings.push(row);
    taken.add(bookings.length - 1);
    addedBookings.push(row);
    added += 1;
  }

  const removedBookings = [];
  const kept = bookings.filter((booking, index) => {
    if (taken.has(index)) return true;
    if (!allowRemovals) return true;
    if (!canRemoveStaleBooking(booking, todayKey)) return true;
    removedBookings.push(booking);
    return false;
  });

  return {
    bookings: kept,
    added,
    updated,
    removed: removedBookings.length,
    total: kept.length,
    addedBookings,
    removedBookings,
  };
}

module.exports = {
  bookingsMatchByDates,
  canRemoveStaleBooking,
  hasHostOrGuestWork,
  isSplitHandledICalEvent,
  reconcileICalBookings,
};
