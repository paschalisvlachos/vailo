const {
  normalizeBookingDay,
  parseIsoDay,
  bookingMatchesExactDates,
  parseGuestCheckInDates,
  buildOnlineCheckInBookingDraft,
  findExactDateMatches,
} = require("../guestPortalDateRules");
const { CheckInValidationError } = require("../guestPreArrivalSubmitRules");

describe("guestPortalDateRules", () => {
  describe("normalizeBookingDay / parseIsoDay", () => {
    it("truncates ISO timestamps to YYYY-MM-DD", () => {
      expect(normalizeBookingDay("2026-09-14T15:00:00.000Z")).toBe("2026-09-14");
      expect(parseIsoDay("2026-09-14")).toBeInstanceOf(Date);
      expect(parseIsoDay("not-a-date")).toBeNull();
    });
  });

  describe("bookingMatchesExactDates / findExactDateMatches", () => {
    const bookings = [
      { id: "a", start: "2026-09-14", end: "2026-09-18" },
      { id: "b", start: "2026-09-14T00:00:00.000Z", end: "2026-09-20" },
      { id: "c", start: "2026-09-15", end: "2026-09-18" },
    ];

    it("matches exact stay dates ignoring time portion", () => {
      expect(bookingMatchesExactDates(bookings[0], "2026-09-14", "2026-09-18")).toBe(true);
      expect(bookingMatchesExactDates(bookings[1], "2026-09-14", "2026-09-20")).toBe(true);
      expect(bookingMatchesExactDates(bookings[2], "2026-09-14", "2026-09-18")).toBe(false);
    });

    it("filters the matching bookings", () => {
      expect(findExactDateMatches(bookings, "2026-09-14", "2026-09-18").map((b) => b.id)).toEqual([
        "a",
      ]);
    });
  });

  describe("parseGuestCheckInDates", () => {
    it("returns normalized days for a valid range", () => {
      expect(parseGuestCheckInDates("2026-09-14", "2026-09-18")).toEqual({
        checkInDay: "2026-09-14",
        checkOutDay: "2026-09-18",
      });
    });

    it("rejects invalid or inverted ranges", () => {
      expect(() => parseGuestCheckInDates("14-09-2026", "2026-09-18")).toThrow(
        CheckInValidationError
      );
      expect(() => parseGuestCheckInDates("2026-09-18", "2026-09-14")).toThrow(
        /after check-in/i
      );
    });

    it("optionally requires check-in on or after today", () => {
      expect(() =>
        parseGuestCheckInDates("2026-09-10", "2026-09-14", {
          requireUpcomingCheckIn: true,
          today: "2026-09-14",
        })
      ).toThrow(/today or a later date/i);

      expect(
        parseGuestCheckInDates("2026-09-14", "2026-09-18", {
          requireUpcomingCheckIn: true,
          today: "2026-09-14",
        })
      ).toEqual({
        checkInDay: "2026-09-14",
        checkOutDay: "2026-09-18",
      });
    });
  });

  describe("buildOnlineCheckInBookingDraft", () => {
    it("creates a guest Online check-in booking shell", () => {
      expect(
        buildOnlineCheckInBookingDraft({
          id: "CHECKIN-deadbeef",
          checkInDay: "2026-09-14",
          checkOutDay: "2026-09-18",
        })
      ).toEqual({
        id: "CHECKIN-deadbeef",
        start: "2026-09-14",
        end: "2026-09-18",
        provider: "Online check-in",
        isInvited: false,
        guestDetailsComplete: false,
      });
    });
  });
});
