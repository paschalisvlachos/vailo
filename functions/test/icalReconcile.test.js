const { reconcileICalBookings, canRemoveStaleBooking } = require("../icalReconcile");
const { parseICalBookings } = require("../icalSync");

const TODAY = "2026-09-16";

function feedEvent(overrides = {}) {
  return {
    id: "new-id",
    start: "2028-01-01",
    end: "2028-01-06",
    summary: "CLOSED - Not available",
    provider: "Booking.com",
    icalUid: "block-2028@booking.com",
    isInvited: false,
    ...overrides,
  };
}

describe("parseICalBookings", () => {
  it("captures the calendar UID so moved ranges can be matched", () => {
    const feed = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "UID:block-2028@booking.com",
      "DTSTART;VALUE=DATE:20280101",
      "DTEND;VALUE=DATE:20280106",
      "SUMMARY:CLOSED - Not available",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    const events = parseICalBookings(feed, "https://admin.booking.com/ical.html?t=abc");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      icalUid: "block-2028@booking.com",
      start: "2028-01-01",
      end: "2028-01-06",
      summary: "CLOSED - Not available",
      provider: "Booking.com",
    });
  });
});

describe("reconcileICalBookings", () => {
  it("moves an existing range instead of appending a duplicate", () => {
    const stored = [
      {
        id: "b1",
        start: "2028-01-01",
        end: "2028-01-06",
        summary: "CLOSED - Not available",
        provider: "Booking.com",
        icalUid: "block-2028@booking.com",
      },
    ];

    const result = reconcileICalBookings(stored, [feedEvent({ end: "2028-03-15" })], {
      today: TODAY,
    });

    expect(result.bookings).toHaveLength(1);
    expect(result.bookings[0]).toMatchObject({ id: "b1", start: "2028-01-01", end: "2028-03-15" });
    expect(result).toMatchObject({ added: 0, updated: 1, removed: 0 });
  });

  it("adopts legacy rows without a UID by matching dates once", () => {
    const stored = [
      { id: "legacy", start: "2028-01-01", end: "2028-01-06", provider: "Booking.com" },
    ];

    const result = reconcileICalBookings(stored, [feedEvent()], { today: TODAY });

    expect(result.bookings).toHaveLength(1);
    expect(result.bookings[0].id).toBe("legacy");
    expect(result.bookings[0].icalUid).toBe("block-2028@booking.com");
    expect(result.added).toBe(0);
  });

  it("clears the stack of stale copies the append-only sync left behind", () => {
    const stored = [
      { id: "s1", start: "2028-01-01", end: "2028-01-06", provider: "Booking.com" },
      { id: "s2", start: "2028-01-01", end: "2028-02-20", provider: "Booking.com" },
      { id: "s3", start: "2028-01-01", end: "2028-03-05", provider: "Booking.com" },
      { id: "s4", start: "2028-01-01", end: "2028-03-15", provider: "Booking.com" },
    ];

    const result = reconcileICalBookings(stored, [feedEvent({ end: "2028-03-15" })], {
      today: TODAY,
    });

    // The row matching the feed's current dates survives; the older copies go.
    expect(result.bookings.map((b) => b.id)).toEqual(["s4"]);
    expect(result.bookings[0]).toMatchObject({
      end: "2028-03-15",
      icalUid: "block-2028@booking.com",
    });
    expect(result).toMatchObject({ added: 0, removed: 3 });
  });

  it("keeps stays with typed guest details, invites, or check-in data", () => {
    const stored = [
      { id: "named", start: "2027-05-01", end: "2027-05-08", provider: "Booking.com", guestName: "Ada Lovelace" },
      { id: "invited", start: "2027-06-01", end: "2027-06-08", provider: "Airbnb", isInvited: true },
      {
        id: "checked-in",
        start: "2027-07-01",
        end: "2027-07-08",
        provider: "Booking.com",
        preArrivalComplete: true,
      },
      { id: "manual", start: "2027-08-01", end: "2027-08-08", provider: "Direct Booking" },
      { id: "guest-dates", start: "2027-09-01", end: "2027-09-08", provider: "Online check-in" },
      {
        id: "split",
        start: "2027-10-01",
        end: "2027-10-04",
        provider: "Booking.com",
        splitGroupId: "g1",
        splitPartIndex: 1,
      },
    ];

    const result = reconcileICalBookings(stored, [feedEvent()], { today: TODAY });

    expect(result.bookings.map((b) => b.id)).toEqual([
      "named",
      "invited",
      "checked-in",
      "manual",
      "guest-dates",
      "split",
      "new-id",
    ]);
    expect(result).toMatchObject({ added: 1, removed: 0 });
  });

  it("never touches past stays, since channels stop exporting them", () => {
    const stored = [
      { id: "past", start: "2026-08-01", end: "2026-08-08", provider: "Booking.com" },
      { id: "future", start: "2026-10-01", end: "2026-10-08", provider: "Booking.com" },
    ];

    const result = reconcileICalBookings(stored, [feedEvent()], { today: TODAY });

    expect(result.bookings.map((b) => b.id)).toEqual(["past", "new-id"]);
    expect(result.removed).toBe(1);
  });

  it("treats an empty feed as a failure and removes nothing", () => {
    const stored = [{ id: "keep", start: "2028-01-01", end: "2028-01-06", provider: "Booking.com" }];

    const result = reconcileICalBookings(stored, [], { today: TODAY });

    expect(result.bookings.map((b) => b.id)).toEqual(["keep"]);
    expect(result).toMatchObject({ added: 0, updated: 0, removed: 0 });
  });

  it("leaves ranges an admin already split into separate stays alone", () => {
    const stored = [
      {
        id: "part1",
        start: "2028-01-01",
        end: "2028-01-03",
        provider: "Booking.com",
        splitFromRange: { start: "2028-01-01", end: "2028-01-06" },
        splitGroupId: "g2",
        splitPartIndex: 1,
      },
    ];

    const result = reconcileICalBookings(stored, [feedEvent()], { today: TODAY });

    expect(result.bookings).toHaveLength(1);
    expect(result).toMatchObject({ added: 0, updated: 0, removed: 0 });
  });
});

describe("canRemoveStaleBooking", () => {
  it("only allows removing untouched imported future rows", () => {
    expect(
      canRemoveStaleBooking({ start: "2027-01-01", end: "2027-01-06", provider: "Booking.com" }, TODAY)
    ).toBe(true);
    expect(canRemoveStaleBooking({ end: "2027-01-06" }, TODAY)).toBe(false);
    expect(canRemoveStaleBooking({ end: "", provider: "Booking.com" }, TODAY)).toBe(false);
    expect(canRemoveStaleBooking(null, TODAY)).toBe(false);
  });
});
