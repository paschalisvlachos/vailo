const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const {
  getBookingById,
  isBookingPortalAccessAllowed,
} = require("./guestPortalBookingAccess");

const MAX_EVENTS_PER_CALL = 25;
const MAX_TEXT_LEN = 16000;
const MAX_PLAN_DATA_LEN = 48000;

function truncateText(text, max = 8000) {
  const t = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return "";
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

function sanitizePayload(type, payload = {}) {
  const out = { ...payload };
  if (out.text) {
    const limit =
      type === "assistant_reply" ||
      type === "ai_expert_reply" ||
      type === "ai_expert_chat_message" ||
      type === "ai_expert_wizard_message"
        ? MAX_TEXT_LEN
        : 8000;
    out.text = truncateText(out.text, limit);
  }
  if (out.planData) {
    const raw = String(out.planData);
    out.planData =
      raw.length <= MAX_PLAN_DATA_LEN
        ? raw
        : `${raw.slice(0, MAX_PLAN_DATA_LEN)}…`;
  }
  if (Array.isArray(out.planCategories) && out.planCategories.length > 8) {
    out.planCategories = out.planCategories.slice(0, 8);
  }
  if (out.picksSummary) {
    out.picksSummary = truncateText(out.picksSummary, 2000);
  }
  if (out.excursionTitle) {
    out.excursionTitle = truncateText(out.excursionTitle, 200);
  }
  if (out.providerName) {
    out.providerName = truncateText(out.providerName, 120);
  }
  if (out.excursionId) {
    out.excursionId = String(out.excursionId).slice(0, 128);
  }
  if (out.providerId) {
    out.providerId = String(out.providerId).slice(0, 128);
  }
  if (out.bookingDate) {
    out.bookingDate = String(out.bookingDate).slice(0, 32);
  }
  if (out.bookingCurrency) {
    out.bookingCurrency = String(out.bookingCurrency).slice(0, 8);
  }
  delete out.undefined;
  return out;
}

async function getSession(firestore, propertyId, sessionId) {
  const ref = firestore
    .collection("properties")
    .doc(propertyId)
    .collection("guestPortalSessions")
    .doc(sessionId);
  const snap = await ref.get();
  if (!snap.exists) return null;
  return { sessionId: snap.id, ...snap.data() };
}

async function loadBookingMeta(firestore, propertyId, typeId, bookingId) {
  const typeSnap = await firestore
    .collection("properties")
    .doc(propertyId)
    .collection("propertyTypes")
    .doc(typeId)
    .get();
  if (!typeSnap.exists) return null;
  const bookings = typeSnap.data().syncedBookings || [];
  const booking = bookings.find((b) => b.id === bookingId);
  if (!booking) return null;
  return {
    guestName: booking.guestName || booking.summary || "Guest",
    guestEmail: booking.guestEmail || "",
    stayStart: booking.start || "",
    stayEnd: booking.end || "",
  };
}

function analyticsBasePath(firestore, propertyId, typeId) {
  return firestore
    .collection("properties")
    .doc(propertyId)
    .collection("propertyTypes")
    .doc(typeId);
}

function isValidVisitorId(id) {
  const trimmed = String(id || "").trim();
  return trimmed.length >= 8 && trimmed.length <= 128;
}

function sanitizeClientDevice(raw) {
  if (!raw || typeof raw !== "object") return null;
  const deviceTypeRaw = String(raw.deviceType || "").trim();
  const deviceType = ["mobile", "tablet", "desktop"].includes(deviceTypeRaw)
    ? deviceTypeRaw
    : "desktop";
  const osName = String(raw.osName || "Unknown")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 48) || "Unknown";
  const deviceLabel =
    String(raw.deviceLabel || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80) ||
    `${deviceType.charAt(0).toUpperCase()}${deviceType.slice(1)} · ${osName}`;
  return { deviceType, osName, deviceLabel };
}

function applyClientDeviceToSummary(summaryUpdate, summarySnap, clientDevice) {
  if (!clientDevice) return;
  summaryUpdate.lastDeviceType = clientDevice.deviceType;
  summaryUpdate.lastOsName = clientDevice.osName;
  summaryUpdate.lastDeviceLabel = clientDevice.deviceLabel;
  if (!summarySnap.exists) {
    summaryUpdate.firstDeviceType = clientDevice.deviceType;
    summaryUpdate.firstOsName = clientDevice.osName;
    summaryUpdate.firstDeviceLabel = clientDevice.deviceLabel;
  }
}

async function assertPropertyTypeExists(firestore, propertyId, typeId) {
  const typeSnap = await analyticsBasePath(firestore, propertyId, typeId).get();
  if (!typeSnap.exists) {
    throw new HttpsError("not-found", "Property unit not found.");
  }
}

function applyEventToSummary(
  type,
  payload,
  summaryUpdate,
  accordionOpens,
  gemImpressions,
  excursionImpressions,
  liveLikeLocalPickSaves,
  liveLikeLocalPickUnsaves,
  liveLikeLocalPickLikes,
  liveLikeLocalPickDislikes,
  inc
) {
  switch (type) {
    case "portal_session":
      summaryUpdate.portalSessions = inc(1);
      break;
    case "live_like_local_open":
      summaryUpdate.liveLikeLocalOpens = inc(1);
      break;
    case "excursions_open":
      summaryUpdate.excursionsOpens = inc(1);
      break;
    case "guide_accordion_open": {
      const key = String(payload.sectionKey || "unknown").slice(0, 64);
      accordionOpens[key] = (accordionOpens[key] || 0) + 1;
      break;
    }
    case "gem_impression": {
      const gemId = String(payload.gemId || "").slice(0, 128);
      if (gemId) {
        const prev = gemImpressions[gemId] || 0;
        gemImpressions[gemId] = prev + 1;
        if (prev === 0) {
          summaryUpdate.uniqueGemsSeen = inc(1);
        }
      }
      break;
    }
    case "excursion_impression": {
      const providerId = String(payload.providerId || "").slice(0, 128);
      const excursionId = String(payload.excursionId || "").slice(0, 128);
      const key =
        providerId && excursionId ? `${providerId}:${excursionId}`.slice(0, 128) : "";
      if (key) {
        const prev = excursionImpressions[key] || 0;
        excursionImpressions[key] = prev + 1;
        if (prev === 0) {
          summaryUpdate.uniqueExcursionsSeen = inc(1);
        }
      }
      break;
    }
    case "excursion_detail_open":
      summaryUpdate.excursionDetailOpens = inc(1);
      break;
    case "excursion_booking_start":
      summaryUpdate.excursionBookingStarts = inc(1);
      break;
    case "excursion_booking_complete":
      summaryUpdate.excursionBookingsComplete = inc(1);
      break;
    case "gem_description_expand":
      break;
    case "live_like_local_pick_save": {
      const pickId = String(payload.gemId || "").slice(0, 128);
      if (pickId) {
        const prev = liveLikeLocalPickSaves[pickId] || 0;
        liveLikeLocalPickSaves[pickId] = prev + 1;
        if (prev === 0) {
          summaryUpdate.uniqueLiveLikeLocalPicksSaved = inc(1);
        }
      }
      break;
    }
    case "live_like_local_pick_unsave": {
      const pickId = String(payload.gemId || "").slice(0, 128);
      if (pickId) {
        liveLikeLocalPickUnsaves[pickId] = (liveLikeLocalPickUnsaves[pickId] || 0) + 1;
      }
      break;
    }
    case "live_like_local_pick_like": {
      const pickId = String(payload.gemId || "").slice(0, 128);
      if (pickId) {
        liveLikeLocalPickLikes[pickId] = (liveLikeLocalPickLikes[pickId] || 0) + 1;
      }
      break;
    }
    case "live_like_local_pick_dislike": {
      const pickId = String(payload.gemId || "").slice(0, 128);
      if (pickId) {
        liveLikeLocalPickDislikes[pickId] = (liveLikeLocalPickDislikes[pickId] || 0) + 1;
      }
      break;
    }
    case "assistant_user_message":
    case "assistant_reply":
      summaryUpdate.assistantTurns = inc(1);
      break;
    case "ai_expert_user_message":
    case "ai_expert_reply":
    case "ai_expert_selection":
    case "ai_expert_plan":
    case "ai_expert_wizard_message":
    case "ai_expert_chat_message":
      summaryUpdate.aiExpertTurns = inc(1);
      break;
    default:
      break;
  }
}

function initSummaryCounters(summaryUpdate, summarySnap) {
  if (!summarySnap.exists) {
    summaryUpdate.firstSeenAt = summaryUpdate.lastSeenAt;
    summaryUpdate.portalSessions = 0;
    summaryUpdate.liveLikeLocalOpens = 0;
    summaryUpdate.assistantTurns = 0;
    summaryUpdate.aiExpertTurns = 0;
    summaryUpdate.uniqueGemsSeen = 0;
    summaryUpdate.uniqueLiveLikeLocalPicksSaved = 0;
    summaryUpdate.excursionsOpens = 0;
    summaryUpdate.uniqueExcursionsSeen = 0;
    summaryUpdate.excursionDetailOpens = 0;
    summaryUpdate.excursionBookingStarts = 0;
    summaryUpdate.excursionBookingsComplete = 0;
    summaryUpdate.accordionOpens = {};
    summaryUpdate.gemImpressions = {};
    summaryUpdate.excursionImpressions = {};
    summaryUpdate.liveLikeLocalPickSaves = {};
    summaryUpdate.liveLikeLocalPickUnsaves = {};
    summaryUpdate.liveLikeLocalPickLikes = {};
    summaryUpdate.liveLikeLocalPickDislikes = {};
  }
}

async function resolveAnalyticsContext(firestore, propertyId, typeId, sessionId, visitorId) {
  if (sessionId) {
    const session = await getSession(firestore, propertyId, sessionId);
    if (!session || session.typeId !== typeId) {
      throw new HttpsError("permission-denied", "Invalid session.");
    }
    if (Date.now() > new Date(session.accessUntil).getTime()) {
      throw new HttpsError("permission-denied", "Session expired.");
    }
    if (!session.bookingId) {
      return { skipped: "no_booking" };
    }
    if (session.source === "admin_preview" || session.source === "tester") {
      return { skipped: session.source };
    }

    const booking = await getBookingById(
      firestore,
      propertyId,
      typeId,
      session.bookingId
    );
    if (!isBookingPortalAccessAllowed(booking)) {
      throw new HttpsError(
        "permission-denied",
        "This reservation was cancelled. Guest portal access is no longer available."
      );
    }

    const bookingId = session.bookingId;
    const meta =
      (await loadBookingMeta(firestore, propertyId, typeId, bookingId)) || {
        guestName: session.guestName || "Guest",
        guestEmail: "",
        stayStart: "",
        stayEnd: "",
      };

    return {
      summaryRef: analyticsBasePath(firestore, propertyId, typeId)
        .collection("guestStayAnalytics")
        .doc(bookingId),
      eventsCollection: analyticsBasePath(firestore, propertyId, typeId).collection(
        "guestStayEvents"
      ),
      summaryIdentity: {
        bookingId,
        subjectKind: "booking",
        guestName: meta.guestName,
        guestEmail: meta.guestEmail,
        stayStart: meta.stayStart,
        stayEnd: meta.stayEnd,
      },
      guestName: meta.guestName,
    };
  }

  const trimmedVisitorId = String(visitorId || "").trim();
  if (!isValidVisitorId(trimmedVisitorId)) {
    throw new HttpsError("invalid-argument", "Invalid visitor id.");
  }

  return {
    summaryRef: analyticsBasePath(firestore, propertyId, typeId)
      .collection("guestAnonymousAnalytics")
      .doc(trimmedVisitorId),
    eventsCollection: analyticsBasePath(firestore, propertyId, typeId).collection(
      "guestAnonymousEvents"
    ),
    summaryIdentity: {
      visitorId: trimmedVisitorId,
      subjectKind: "anonymous",
    },
    guestName: "Anonymous visitor",
  };
}

function registerGuestPortalAnalytics({ firestore, firebaseExports }) {
  if (!firebaseExports) {
    throw new Error("registerGuestPortalAnalytics requires firebaseExports");
  }
  const exp = firebaseExports;
  const inc = admin.firestore.FieldValue.increment;
  const serverTs = admin.firestore.FieldValue.serverTimestamp();

  exp.logGuestPortalAnalytics = onCall(async (request) => {
    const { propertyId, typeId, sessionId, visitorId, clientDevice: rawClientDevice, events } =
      request.data || {};
    if (!propertyId || !typeId || !Array.isArray(events)) {
      throw new HttpsError("invalid-argument", "Missing analytics parameters.");
    }
    if (!sessionId && !visitorId) {
      throw new HttpsError(
        "invalid-argument",
        "Provide sessionId (booking guest) or visitorId (anonymous)."
      );
    }
    if (events.length > MAX_EVENTS_PER_CALL) {
      throw new HttpsError(
        "invalid-argument",
        `At most ${MAX_EVENTS_PER_CALL} events per request.`
      );
    }

    const clientDevice = sanitizeClientDevice(rawClientDevice);
    if (events.length === 0 && !clientDevice) {
      return { ok: true, logged: 0 };
    }

    await assertPropertyTypeExists(firestore, propertyId, typeId);

    const ctx = await resolveAnalyticsContext(
      firestore,
      propertyId,
      typeId,
      sessionId,
      visitorId
    );
    if (ctx.skipped) {
      return { ok: true, logged: 0, skipped: ctx.skipped };
    }

    const nowIso = new Date().toISOString();
    const summarySnap = await ctx.summaryRef.get();
    const summaryUpdate = {
      ...ctx.summaryIdentity,
      typeId,
      propertyId,
      lastSeenAt: nowIso,
      updatedAt: serverTs,
    };
    initSummaryCounters(summaryUpdate, summarySnap);
    applyClientDeviceToSummary(summaryUpdate, summarySnap, clientDevice);

    if (events.length === 0) {
      await ctx.summaryRef.set(summaryUpdate, { merge: true });
      return { ok: true, logged: 0, deviceUpdated: true };
    }

    const accordionOpens = {
      ...(summarySnap.exists ? summarySnap.data().accordionOpens || {} : {}),
    };
    const gemImpressions = {
      ...(summarySnap.exists ? summarySnap.data().gemImpressions || {} : {}),
    };
    const excursionImpressions = {
      ...(summarySnap.exists ? summarySnap.data().excursionImpressions || {} : {}),
    };
    const liveLikeLocalPickSaves = {
      ...(summarySnap.exists ? summarySnap.data().liveLikeLocalPickSaves || {} : {}),
    };
    const liveLikeLocalPickUnsaves = {
      ...(summarySnap.exists ? summarySnap.data().liveLikeLocalPickUnsaves || {} : {}),
    };
    const liveLikeLocalPickLikes = {
      ...(summarySnap.exists ? summarySnap.data().liveLikeLocalPickLikes || {} : {}),
    };
    const liveLikeLocalPickDislikes = {
      ...(summarySnap.exists ? summarySnap.data().liveLikeLocalPickDislikes || {} : {}),
    };

    const batch = firestore.batch();
    let logged = 0;

    for (const raw of events) {
      const type = String(raw?.type || "").trim();
      if (!type) continue;
      const payload = sanitizePayload(type, raw.payload || {});

      const eventRef = ctx.eventsCollection.doc();
      batch.set(eventRef, {
        ...ctx.summaryIdentity,
        typeId,
        propertyId,
        guestName: ctx.guestName,
        at: nowIso,
        type,
        payload,
        ...(clientDevice
          ? {
              deviceType: clientDevice.deviceType,
              osName: clientDevice.osName,
              deviceLabel: clientDevice.deviceLabel,
            }
          : {}),
      });
      logged += 1;

      applyEventToSummary(
        type,
        payload,
        summaryUpdate,
        accordionOpens,
        gemImpressions,
        excursionImpressions,
        liveLikeLocalPickSaves,
        liveLikeLocalPickUnsaves,
        liveLikeLocalPickLikes,
        liveLikeLocalPickDislikes,
        inc
      );
    }

    summaryUpdate.accordionOpens = accordionOpens;
    summaryUpdate.gemImpressions = gemImpressions;
    summaryUpdate.excursionImpressions = excursionImpressions;
    summaryUpdate.liveLikeLocalPickSaves = liveLikeLocalPickSaves;
    summaryUpdate.liveLikeLocalPickUnsaves = liveLikeLocalPickUnsaves;
    summaryUpdate.liveLikeLocalPickLikes = liveLikeLocalPickLikes;
    summaryUpdate.liveLikeLocalPickDislikes = liveLikeLocalPickDislikes;
    batch.set(ctx.summaryRef, summaryUpdate, { merge: true });
    await batch.commit();

    return { ok: true, logged };
  });
}

module.exports = { registerGuestPortalAnalytics };
