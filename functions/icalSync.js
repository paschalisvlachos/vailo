const { onCall, HttpsError } = require("firebase-functions/v2/https");
const axios = require("axios");
const { resolveCallerOwnerProfile } = require("./platformAdmin");

function normalizeICalUrl(url) {
  const trimmed = String(url || "").trim();
  if (!trimmed) return "";
  return trimmed.replace(/^webcal:\/\//i, "https://");
}

function extractBookingProvider(summary, iCalUrl) {
  const lowerUrl = String(iCalUrl || "").toLowerCase();
  if (lowerUrl.includes("airbnb.com")) return "Airbnb";
  if (lowerUrl.includes("booking.com")) return "Booking.com";
  if (lowerUrl.includes("vrbo.com") || lowerUrl.includes("homeaway.com")) return "VRBO";
  if (lowerUrl.includes("expedia.com")) return "Expedia";

  const lowerSum = String(summary || "").toLowerCase();
  if (!lowerSum) return "Direct / Manual Booking";
  if (lowerSum.includes("airbnb")) return "Airbnb";
  if (lowerSum.includes("booking.com")) return "Booking.com";
  if (lowerSum.includes("vrbo") || lowerSum.includes("homeaway")) return "VRBO";
  if (lowerSum.includes("closed") || lowerSum.includes("blocked")) return "Blocked Date";

  const text = String(summary || "");
  return text.length > 20 ? `${text.substring(0, 20)}...` : text;
}

function unfoldICalLines(text) {
  const raw = String(text || "").split(/\r?\n/);
  const lines = [];
  for (const line of raw) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1);
    } else {
      lines.push(line);
    }
  }
  return lines;
}

function extractDateFromICalLine(line) {
  const idx = line.indexOf(":");
  if (idx === -1) return null;
  const value = line.slice(idx + 1).trim();
  const dateMatch = value.match(/(\d{4})(\d{2})(\d{2})/);
  if (!dateMatch) return null;
  return `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
}

function parseICalBookings(text, iCalUrl) {
  const lines = unfoldICalLines(text);
  const events = [];
  let currentEvent = null;

  for (const line of lines) {
    const upper = line.toUpperCase();
    if (upper.startsWith("BEGIN:VEVENT")) {
      currentEvent = {};
    } else if (upper.startsWith("END:VEVENT")) {
      if (currentEvent?.start && currentEvent?.end) {
        currentEvent.id = Math.random().toString(36).slice(2, 11);
        currentEvent.provider = extractBookingProvider(currentEvent.summary || "", iCalUrl);
        currentEvent.isInvited = false;
        events.push(currentEvent);
      }
      currentEvent = null;
    } else if (currentEvent) {
      if (upper.startsWith("DTSTART")) {
        currentEvent.start = extractDateFromICalLine(line) || undefined;
      } else if (upper.startsWith("DTEND")) {
        currentEvent.end = extractDateFromICalLine(line) || undefined;
      } else if (upper.startsWith("SUMMARY")) {
        currentEvent.summary = line.slice(line.indexOf(":") + 1);
      }
    }
  }

  return events;
}

function bookingsMatchByDates(a, b) {
  return Boolean(a?.start && a?.end && b?.start && b?.end && a.start === b.start && a.end === b.end);
}

/** Keep existing DB rows (guest invites, etc.); append only new iCal events. */
function applyIncrementalICalSync(existingBookings, iCalEvents) {
  const updated = existingBookings.map((b) => ({ ...b }));
  let added = 0;

  for (const iCalEvent of iCalEvents) {
    const matchIndex = updated.findIndex((b) => bookingsMatchByDates(b, iCalEvent));
    if (matchIndex >= 0) {
      const existing = updated[matchIndex];
      updated[matchIndex] = omitUndefined({
        ...existing,
        summary: iCalEvent.summary ?? existing.summary,
        provider: iCalEvent.provider ?? existing.provider,
      });
    } else {
      updated.push(omitUndefined(iCalEvent));
      added += 1;
    }
  }

  return { bookings: updated, added, total: updated.length };
}

function omitUndefined(obj) {
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

async function fetchICalText(iCalUrl) {
  const normalized = normalizeICalUrl(iCalUrl);
  if (!normalized.startsWith("http://") && !normalized.startsWith("https://")) {
    throw new HttpsError("invalid-argument", "iCal URL must start with http(s):// or webcal://");
  }

  const noCacheUrl = normalized.includes("?")
    ? `${normalized}&nocache=${Date.now()}`
    : `${normalized}?nocache=${Date.now()}`;

  try {
    const response = await axios.get(noCacheUrl, {
      timeout: 25000,
      maxRedirects: 5,
      responseType: "text",
      headers: {
        "User-Agent": "Vailo-Calendar-Sync/1.0",
        Accept: "text/calendar, text/plain, */*",
      },
      validateStatus: (status) => status >= 200 && status < 400,
    });
    const text = String(response.data || "");
    if (!text.includes("BEGIN:VCALENDAR")) {
      throw new Error("Response is not a valid iCal feed.");
    }
    return text;
  } catch (error) {
    const message =
      error?.response?.status === 403 || error?.response?.status === 401
        ? "The booking channel blocked the calendar request. Check that the iCal link is still valid."
        : error?.message || "Failed to download iCal feed.";
    throw new HttpsError("unavailable", message);
  }
}

async function requirePropertyCalendarAccess(request, firestore, propertyId) {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in to sync calendars.");
  }

  const caller = await resolveCallerOwnerProfile(request, firestore);
  if (!caller) {
    throw new HttpsError("permission-denied", "Admin account required.");
  }
  if (caller.role === "excursion_provider") {
    throw new HttpsError("permission-denied", "Excursion providers cannot sync property calendars.");
  }
  if (caller.role === "admin") return caller;

  const propertySnap = await firestore.collection("properties").doc(propertyId).get();
  if (!propertySnap.exists) {
    throw new HttpsError("not-found", "Property not found.");
  }
  const property = propertySnap.data();

  if (caller.role === "agent" && property.ownerId === caller.id) {
    return caller;
  }

  if (caller.role === "owner") {
    if (property.ownerId === caller.id) return caller;
    const typesSnap = await firestore
      .collection("properties")
      .doc(propertyId)
      .collection("propertyTypes")
      .where("ownerId", "==", caller.id)
      .limit(1)
      .get();
    if (!typesSnap.empty) return caller;
  }

  throw new HttpsError("permission-denied", "You do not have access to this property.");
}

function registerICalSync({ firestore, firebaseExports }) {
  firebaseExports.syncPropertyTypeICal = onCall(async (request) => {
    const { propertyId, typeId, iCalUrl } = request.data || {};
    if (!propertyId || !typeId || !iCalUrl) {
      throw new HttpsError("invalid-argument", "propertyId, typeId, and iCalUrl are required.");
    }

    await requirePropertyCalendarAccess(request, firestore, propertyId);

    const typeRef = firestore
      .collection("properties")
      .doc(propertyId)
      .collection("propertyTypes")
      .doc(typeId);
    const typeSnap = await typeRef.get();
    if (!typeSnap.exists) {
      throw new HttpsError("not-found", "Property listing not found.");
    }

    const normalizedUrl = normalizeICalUrl(iCalUrl);
    const text = await fetchICalText(normalizedUrl);
    const events = parseICalBookings(text, normalizedUrl);
    const existingBookings = Array.isArray(typeSnap.data().syncedBookings)
      ? typeSnap.data().syncedBookings
      : [];

    const { bookings: syncedBookings, added, total } = applyIncrementalICalSync(
      existingBookings,
      events
    );

    await typeRef.set(
      {
        iCalUrl: normalizedUrl,
        syncedBookings,
        lastSyncedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    return { ok: true, count: total, added };
  });
}

module.exports = { registerICalSync, parseICalBookings, normalizeICalUrl, applyIncrementalICalSync };
