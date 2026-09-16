/**
 * Pure online check-in submit rules (no Firebase I/O).
 */

const PRE_ARRIVAL_SPECIAL_REQUESTS_MAX = 2000;
const PRE_ARRIVAL_TAX_ID_MAX = 20;
const PRE_ARRIVAL_GUEST_COUNT_MAX = 30;

class CheckInValidationError extends Error {
  constructor(message, code = "invalid-argument") {
    super(message);
    this.name = "CheckInValidationError";
    this.code = code;
  }
}

function omitUndefinedDeep(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (Array.isArray(value)) {
    return value.map((item) => omitUndefinedDeep(item));
  }
  if (typeof value === "object") {
    const out = {};
    for (const [key, val] of Object.entries(value)) {
      if (val === undefined) continue;
      out[key] = omitUndefinedDeep(val);
    }
    return out;
  }
  return value;
}

function validateSubmissionInput(data) {
  const guestFirstName = String(data?.guestFirstName || "").trim();
  const guestLastName = String(data?.guestLastName || "").trim();
  if (guestFirstName.length < 2) {
    throw new CheckInValidationError("First name is required.");
  }
  if (guestLastName.length < 2) {
    throw new CheckInValidationError("Surname is required.");
  }
  if (guestFirstName.length > 80 || guestLastName.length > 80) {
    throw new CheckInValidationError("Name is too long.");
  }

  const guestCountry = String(data?.guestCountry || "").trim();
  if (guestCountry.length > 80) {
    throw new CheckInValidationError("Country name is too long.");
  }

  const guestLocale = String(data?.guestLocale || data?.houseRulesLocale || "").trim();
  if (!guestLocale) {
    throw new CheckInValidationError("Guest language is required.");
  }

  const expectedArrivalTime = String(data?.expectedArrivalTime || "").trim();
  if (!expectedArrivalTime || !/^\d{2}:\d{2}$/.test(expectedArrivalTime)) {
    throw new CheckInValidationError("Expected arrival time is required.");
  }

  const guestCount = Number(data?.guestCount);
  if (!Number.isFinite(guestCount) || guestCount < 1) {
    throw new CheckInValidationError("Guest count must be at least 1.");
  }
  if (guestCount > PRE_ARRIVAL_GUEST_COUNT_MAX) {
    throw new CheckInValidationError(
      `Guest count cannot exceed ${PRE_ARRIVAL_GUEST_COUNT_MAX}.`
    );
  }

  const contactPhone = String(data?.contactPhone || "").trim();
  if (contactPhone.length < 6) {
    throw new CheckInValidationError("A valid contact phone is required.");
  }

  const specialRequests = String(data?.specialRequests || "").trim();
  if (specialRequests.length > PRE_ARRIVAL_SPECIAL_REQUESTS_MAX) {
    throw new CheckInValidationError("Special requests are too long.");
  }

  if (data?.acceptedHouseRules !== true) {
    throw new CheckInValidationError("House rules must be accepted.");
  }

  const contactEmail = String(data?.contactEmail || "").trim();
  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
    throw new CheckInValidationError("Contact email is not valid.");
  }

  const dateOfBirth = String(data?.dateOfBirth || "").trim();
  if (dateOfBirth) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) {
      throw new CheckInValidationError("Date of birth must be YYYY-MM-DD.");
    }
    const dobDate = new Date(`${dateOfBirth}T12:00:00`);
    if (Number.isNaN(dobDate.getTime()) || dobDate.getTime() > Date.now()) {
      throw new CheckInValidationError("Date of birth is not valid.");
    }
  }

  const taxId = String(data?.taxId || "").trim().replace(/\s+/g, "");
  if (taxId) {
    if (taxId.length > PRE_ARRIVAL_TAX_ID_MAX || !/^[A-Za-z0-9./-]{5,20}$/.test(taxId)) {
      throw new CheckInValidationError(
        "Please enter a valid TIN / AFM, or leave the field empty."
      );
    }
  }

  return {
    guestFirstName,
    guestLastName,
    guestCountry: guestCountry || undefined,
    guestLocale,
    expectedArrivalTime,
    guestCount: Math.round(guestCount),
    contactPhone,
    contactEmail: contactEmail || undefined,
    dateOfBirth: dateOfBirth || undefined,
    taxId: taxId || undefined,
    specialRequests: specialRequests || undefined,
    houseRulesLocale: String(data?.houseRulesLocale || "").trim() || undefined,
    transferRequested: data?.transferRequested === true,
  };
}

function buildPreArrivalSubmissionRecord(input, extras = {}) {
  return omitUndefinedDeep({
    submittedAt: extras.submittedAt,
    guestFirstName: input.guestFirstName,
    guestLastName: input.guestLastName,
    expectedArrivalTime: input.expectedArrivalTime,
    guestCount: input.guestCount,
    contactPhone: input.contactPhone,
    acceptedHouseRulesAt: extras.acceptedHouseRulesAt,
    ...(input.guestCountry ? { guestCountry: input.guestCountry } : {}),
    ...(input.contactEmail ? { contactEmail: input.contactEmail } : {}),
    ...(input.dateOfBirth ? { dateOfBirth: input.dateOfBirth } : {}),
    ...(input.taxId ? { taxId: input.taxId } : {}),
    ...(input.specialRequests ? { specialRequests: input.specialRequests } : {}),
    ...(input.houseRulesLocale ? { houseRulesLocale: input.houseRulesLocale } : {}),
    ...(extras.idDocument ? { idDocument: extras.idDocument } : {}),
    ...(extras.idDetails ? { idDetails: extras.idDetails } : {}),
    ...(extras.transferRequested
      ? {
          transferRequested: true,
          ...(extras.transferOffer ? { transferOffer: extras.transferOffer } : {}),
        }
      : {}),
  });
}

/** Patch applied to syncedBookings when a guest successfully submits check-in. */
function buildCompletedCheckInBookingPatch(input, submission, submittedAt) {
  const guestName = `${input.guestFirstName} ${input.guestLastName}`.trim();
  return omitUndefinedDeep({
    preArrivalComplete: true,
    preArrivalSubmittedAt: submittedAt,
    preArrivalSubmission: submission,
    guestName,
    guestPhone: input.contactPhone,
    guestWhatsapp: input.contactPhone,
    guestLocale: input.guestLocale,
    guestDetailsComplete: true,
    ...(input.contactEmail ? { guestEmail: input.contactEmail } : {}),
    ...(input.guestCountry ? { guestCountry: input.guestCountry } : {}),
  });
}

function matchesBooking(b, bookingId) {
  return b?.id && bookingId && b.id === bookingId;
}

function patchBookingInList(bookings, bookingId, patch) {
  return (Array.isArray(bookings) ? bookings : []).map((b) =>
    matchesBooking(b, bookingId) ? { ...b, ...patch } : b
  );
}

const { stripPreArrivalFields } = require("./guestPreArrivalRules");

function buildBookingAfterPreArrivalRemoval(booking) {
  const submission = booking?.preArrivalSubmission || null;
  const cleared = stripPreArrivalFields(booking);

  if (!submission) {
    return { ...cleared, guestDetailsComplete: false };
  }

  const checkInGuestName =
    submission.guestFirstName && submission.guestLastName
      ? `${String(submission.guestFirstName).trim()} ${String(submission.guestLastName).trim()}`.trim()
      : "";

  if (checkInGuestName && String(cleared.guestName || "").trim() === checkInGuestName) {
    delete cleared.guestName;
  }

  const phone = String(submission.contactPhone || "").trim();
  if (phone) {
    if (String(cleared.guestPhone || "").trim() === phone) delete cleared.guestPhone;
    if (String(cleared.guestWhatsapp || "").trim() === phone) delete cleared.guestWhatsapp;
  }

  const email = String(submission.contactEmail || "").trim();
  if (email && String(cleared.guestEmail || "").trim() === email) {
    delete cleared.guestEmail;
  }

  const country = String(submission.guestCountry || "").trim();
  if (country && String(cleared.guestCountry || "").trim() === country) {
    delete cleared.guestCountry;
  }

  cleared.guestDetailsComplete = false;
  return cleared;
}

/** Apply wrong-dates action to a bookings array (pure). */
function applyWrongDatesResetToBookings(bookings, bookingId, action) {
  const list = Array.isArray(bookings) ? bookings : [];
  if (action === "remove_booking") {
    return list.filter((b) => !matchesBooking(b, bookingId));
  }
  if (action === "clear_pre_arrival") {
    return list.map((b) =>
      matchesBooking(b, bookingId) ? buildBookingAfterPreArrivalRemoval(b) : b
    );
  }
  return list;
}

module.exports = {
  CheckInValidationError,
  PRE_ARRIVAL_SPECIAL_REQUESTS_MAX,
  PRE_ARRIVAL_TAX_ID_MAX,
  PRE_ARRIVAL_GUEST_COUNT_MAX,
  omitUndefinedDeep,
  validateSubmissionInput,
  buildPreArrivalSubmissionRecord,
  buildCompletedCheckInBookingPatch,
  matchesBooking,
  patchBookingInList,
  buildBookingAfterPreArrivalRemoval,
  applyWrongDatesResetToBookings,
};
