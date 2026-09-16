const {
  PRE_ARRIVAL_RETENTION_DAYS,
  addDaysToIsoDate,
  hasPreArrivalData,
  hasRetainedIdDocumentData,
  isGuestCreatedOnlineCheckInBooking,
  isPreArrivalPurgeDue,
  resolveWrongDatesResetAction,
  stripIdDocumentFromBooking,
  stripPreArrivalFields,
} = require("../guestPreArrivalRules");

describe("guestPreArrivalRules", () => {
  describe("isPreArrivalPurgeDue", () => {
    it(`is due ${PRE_ARRIVAL_RETENTION_DAYS} days after checkout`, () => {
      const booking = { end: "2026-09-01" };
      expect(isPreArrivalPurgeDue(booking, "2026-09-08")).toBe(true);
      expect(isPreArrivalPurgeDue(booking, "2026-09-07")).toBe(false);
      expect(isPreArrivalPurgeDue(booking, "2026-09-01")).toBe(false);
    });

    it("returns false when checkout date is missing", () => {
      expect(isPreArrivalPurgeDue({}, "2026-09-16")).toBe(false);
    });
  });

  describe("addDaysToIsoDate", () => {
    it("adds days across month boundaries", () => {
      expect(addDaysToIsoDate("2026-01-28", 7)).toBe("2026-02-04");
    });
  });

  describe("hasRetainedIdDocumentData / stripIdDocumentFromBooking", () => {
    const completedWithId = {
      id: "b1",
      start: "2026-09-01",
      end: "2026-09-05",
      preArrivalComplete: true,
      preArrivalSubmittedAt: "2026-09-02T10:00:00.000Z",
      guestName: "Ada Lovelace",
      preArrivalSubmission: {
        guestFirstName: "Ada",
        guestLastName: "Lovelace",
        contactPhone: "+301111",
        idDocument: { storagePath: "properties/p/id.bin", contentType: "image/jpeg" },
        idDetails: { documentType: "passport", documentNumber: "X123" },
      },
    };

    it("detects retained passport/ID data", () => {
      expect(hasRetainedIdDocumentData(completedWithId)).toBe(true);
      expect(
        hasRetainedIdDocumentData({
          preArrivalSubmission: { guestFirstName: "Ada" },
        })
      ).toBe(false);
    });

    it("strips only ID fields and keeps completed check-in", () => {
      const next = stripIdDocumentFromBooking(completedWithId);
      expect(next.preArrivalComplete).toBe(true);
      expect(next.guestName).toBe("Ada Lovelace");
      expect(next.preArrivalSubmission.guestFirstName).toBe("Ada");
      expect(next.preArrivalSubmission.contactPhone).toBe("+301111");
      expect(next.preArrivalSubmission.idDocument).toBeUndefined();
      expect(next.preArrivalSubmission.idDetails).toBeUndefined();
      expect(hasRetainedIdDocumentData(next)).toBe(false);
      expect(hasPreArrivalData(next)).toBe(true);
    });
  });

  describe("stripPreArrivalFields", () => {
    it("removes all pre-arrival fields for admin/wrong-dates clear", () => {
      const next = stripPreArrivalFields({
        id: "b1",
        start: "2026-09-01",
        end: "2026-09-05",
        guestName: "Ada",
        preArrivalComplete: true,
        preArrivalSubmittedAt: "2026-09-02T10:00:00.000Z",
        preArrivalSubmission: { guestFirstName: "Ada" },
      });
      expect(next).toEqual({
        id: "b1",
        start: "2026-09-01",
        end: "2026-09-05",
        guestName: "Ada",
      });
      expect(hasPreArrivalData(next)).toBe(false);
    });
  });

  describe("isGuestCreatedOnlineCheckInBooking", () => {
    it("detects Online check-in provider and CHECKIN- ids", () => {
      expect(
        isGuestCreatedOnlineCheckInBooking({
          id: "abc",
          provider: "Online check-in",
        })
      ).toBe(true);
      expect(isGuestCreatedOnlineCheckInBooking({ id: "CHECKIN-deadbeef" })).toBe(true);
      expect(
        isGuestCreatedOnlineCheckInBooking({
          id: "tg6mxvwxf",
          provider: "Booking.com",
        })
      ).toBe(false);
    });
  });

  describe("resolveWrongDatesResetAction", () => {
    it("removes guest-created Online check-in bookings", () => {
      expect(
        resolveWrongDatesResetAction({
          id: "CHECKIN-1",
          provider: "Online check-in",
          preArrivalComplete: true,
        })
      ).toBe("remove_booking");
    });

    it("clears check-in on calendar reservations", () => {
      expect(
        resolveWrongDatesResetAction({
          id: "tg6mxvwxf",
          provider: "Booking.com",
          preArrivalComplete: true,
          preArrivalSubmission: { guestFirstName: "Ada" },
        })
      ).toBe("clear_pre_arrival");
    });

    it("only ends the session when there is no check-in data", () => {
      expect(
        resolveWrongDatesResetAction({
          id: "tg6mxvwxf",
          provider: "Booking.com",
        })
      ).toBe("session_only");
    });
  });
});
