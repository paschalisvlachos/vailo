const {
  CheckInValidationError,
  validateSubmissionInput,
  buildPreArrivalSubmissionRecord,
  buildCompletedCheckInBookingPatch,
  matchesBooking,
  patchBookingInList,
  buildBookingAfterPreArrivalRemoval,
  applyWrongDatesResetToBookings,
} = require("../guestPreArrivalSubmitRules");

function validInput(overrides = {}) {
  return {
    guestFirstName: "Ada",
    guestLastName: "Lovelace",
    guestLocale: "en",
    expectedArrivalTime: "15:30",
    guestCount: 2,
    contactPhone: "+301234567890",
    acceptedHouseRules: true,
    ...overrides,
  };
}

describe("guestPreArrivalSubmitRules", () => {
  describe("validateSubmissionInput", () => {
    it("accepts a minimal valid payload", () => {
      expect(validateSubmissionInput(validInput())).toMatchObject({
        guestFirstName: "Ada",
        guestLastName: "Lovelace",
        guestLocale: "en",
        expectedArrivalTime: "15:30",
        guestCount: 2,
        contactPhone: "+301234567890",
      });
    });

    it("rejects missing names and phone", () => {
      expect(() => validateSubmissionInput(validInput({ guestFirstName: "A" }))).toThrow(
        CheckInValidationError
      );
      expect(() => validateSubmissionInput(validInput({ contactPhone: "12" }))).toThrow(
        /contact phone/i
      );
    });

    it("requires house rules acceptance", () => {
      expect(() =>
        validateSubmissionInput(validInput({ acceptedHouseRules: false }))
      ).toThrow(/house rules/i);
    });

    it("validates optional email and tax id", () => {
      expect(() =>
        validateSubmissionInput(validInput({ contactEmail: "not-an-email" }))
      ).toThrow(/email/i);
      expect(() => validateSubmissionInput(validInput({ taxId: "!!" }))).toThrow(/TIN|AFM/i);
      expect(
        validateSubmissionInput(validInput({ contactEmail: "ada@example.com", taxId: "EL123456789" }))
      ).toMatchObject({
        contactEmail: "ada@example.com",
        taxId: "EL123456789",
      });
    });
  });

  describe("buildCompletedCheckInBookingPatch", () => {
    it("marks booking complete and copies guest contact fields", () => {
      const input = validateSubmissionInput(
        validInput({ contactEmail: "ada@example.com", guestCountry: "Greece" })
      );
      const submission = buildPreArrivalSubmissionRecord(input, {
        submittedAt: "2026-09-10T12:00:00.000Z",
        acceptedHouseRulesAt: "2026-09-10T12:00:00.000Z",
      });
      const patch = buildCompletedCheckInBookingPatch(
        input,
        submission,
        "2026-09-10T12:00:00.000Z"
      );
      expect(patch).toMatchObject({
        preArrivalComplete: true,
        guestName: "Ada Lovelace",
        guestPhone: "+301234567890",
        guestWhatsapp: "+301234567890",
        guestEmail: "ada@example.com",
        guestCountry: "Greece",
        guestDetailsComplete: true,
        guestLocale: "en",
      });
      expect(patch.preArrivalSubmission).toEqual(submission);
    });
  });

  describe("patchBookingInList / applyWrongDatesResetToBookings", () => {
    const calendarBooking = {
      id: "tg6mxvwxf",
      provider: "Booking.com",
      guestName: "Ada Lovelace",
      guestPhone: "+301234567890",
      preArrivalComplete: true,
      preArrivalSubmission: {
        guestFirstName: "Ada",
        guestLastName: "Lovelace",
        contactPhone: "+301234567890",
      },
    };
    const onlineBooking = {
      id: "CHECKIN-abc",
      provider: "Online check-in",
      preArrivalComplete: true,
      preArrivalSubmission: { guestFirstName: "Ada", guestLastName: "Lovelace" },
    };

    it("patches the matching booking only", () => {
      const list = [{ id: "other" }, { id: "tg6mxvwxf", guestName: "Old" }];
      const next = patchBookingInList(list, "tg6mxvwxf", { guestName: "New" });
      expect(next[0]).toEqual({ id: "other" });
      expect(next[1].guestName).toBe("New");
      expect(matchesBooking(next[1], "tg6mxvwxf")).toBe(true);
    });

    it("removes Online check-in bookings on wrong dates", () => {
      const next = applyWrongDatesResetToBookings(
        [onlineBooking, calendarBooking],
        "CHECKIN-abc",
        "remove_booking"
      );
      expect(next).toEqual([calendarBooking]);
    });

    it("clears pre-arrival fields on calendar bookings", () => {
      const next = applyWrongDatesResetToBookings(
        [calendarBooking],
        "tg6mxvwxf",
        "clear_pre_arrival"
      );
      expect(next).toHaveLength(1);
      expect(next[0].preArrivalComplete).toBeUndefined();
      expect(next[0].preArrivalSubmission).toBeUndefined();
      expect(next[0].guestName).toBeUndefined();
      expect(next[0].guestDetailsComplete).toBe(false);
    });

    it("leaves bookings unchanged for session_only", () => {
      const list = [calendarBooking];
      expect(applyWrongDatesResetToBookings(list, "tg6mxvwxf", "session_only")).toBe(list);
    });
  });

  describe("buildBookingAfterPreArrivalRemoval", () => {
    it("keeps host-entered guest name that differs from check-in", () => {
      const next = buildBookingAfterPreArrivalRemoval({
        id: "b1",
        guestName: "Host Name",
        preArrivalComplete: true,
        preArrivalSubmission: {
          guestFirstName: "Ada",
          guestLastName: "Lovelace",
          contactPhone: "+30111",
        },
      });
      expect(next.guestName).toBe("Host Name");
      expect(next.preArrivalComplete).toBeUndefined();
      expect(next.guestDetailsComplete).toBe(false);
    });
  });
});
