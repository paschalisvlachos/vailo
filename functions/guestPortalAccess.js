const { onCall, HttpsError } = require("firebase-functions/v2/https");
const crypto = require("crypto");
const { resolveCallerOwnerProfile } = require("./platformAdmin");
const { resendApiKey } = require("./resendInbox");
const {
  getGuestPortalPublicOrigin,
  formatGuestSlug,
  getTypePublicSlug,
  buildInvitePortalUrl,
  formatBookingDateRange,
  buildGuestInviteEmailFromContext,
  deliverGuestInviteEmail,
} = require("./guestInviteEmail");
const {
  getBookingById,
  isBookingPortalAccessAllowed,
  resolveBookingGuestDisplayName,
} = require("./guestPortalBookingAccess");

function isPreArrivalCheckInEnabled(property) {
  if (property?.preArrivalCheckInEnabled === undefined) return true;
  return property.preArrivalCheckInEnabled !== false;
}

function isCalendarSyncEnabled(property) {
  if (property?.calendarSyncEnabled === undefined) return true;
  return property.calendarSyncEnabled !== false;
}

function parseIsoDay(iso) {
  if (!iso) return null;
  const day = String(iso).trim().slice(0, 10);
  const parts = day.split("-").map(Number);
  if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return null;
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  d.setHours(0, 0, 0, 0);
  return d;
}

function isWithinBookingStayDates(today, start, end) {
  const s = parseIsoDay(start);
  const e = parseIsoDay(end);
  if (!s || !e) return false;
  const t = today.getTime();
  return t >= s.getTime() && t <= e.getTime();
}

function normalizeBookingDay(iso) {
  return String(iso || "").trim().slice(0, 10);
}

function bookingMatchesExactDates(booking, checkIn, checkOut) {
  if (!booking?.start || !booking?.end) return false;
  return (
    normalizeBookingDay(booking.start) === normalizeBookingDay(checkIn) &&
    normalizeBookingDay(booking.end) === normalizeBookingDay(checkOut)
  );
}

async function findPreArrivalDateMatchesAcrossProperty(
  firestore,
  propertyId,
  checkInDay,
  checkOutDay
) {
  const typesSnap = await firestore
    .collection("properties")
    .doc(propertyId)
    .collection("propertyTypes")
    .get();

  const matches = [];
  for (const typeDoc of typesSnap.docs) {
    const typeData = typeDoc.data() || {};
    const typeName = String(typeData.propertyTypeName || "").trim() || "Unit";
    const bookings = Array.isArray(typeData.syncedBookings) ? typeData.syncedBookings : [];
    for (const booking of bookings) {
      if (
        !booking?.id ||
        !isBookingPortalAccessAllowed(booking) ||
        !bookingMatchesExactDates(booking, checkInDay, checkOutDay)
      ) {
        continue;
      }
      matches.push({
        typeId: typeDoc.id,
        typeName,
        bookingId: booking.id,
        booking,
      });
    }
  }
  return matches;
}

function assertUniqueListingMatches(matches) {
  const byType = new Map();
  for (const match of matches) {
    if (!byType.has(match.typeId)) byType.set(match.typeId, []);
    byType.get(match.typeId).push(match);
  }
  for (const list of byType.values()) {
    if (list.length > 1) {
      throw new HttpsError(
        "failed-precondition",
        "Multiple reservations match those dates on the same listing. Please contact your host."
      );
    }
  }
}

async function createPreArrivalDateSession(
  firestore,
  { propertyId, typeId, booking, checkInDay, checkOutDay }
) {
  const typeRef = firestore
    .collection("properties")
    .doc(propertyId)
    .collection("propertyTypes")
    .doc(typeId);
  const typeSnap = await typeRef.get();
  if (!typeSnap.exists) {
    throw new HttpsError("not-found", "Unit not found.");
  }

  const bookings = typeSnap.data().syncedBookings || [];
  const accessUntil = booking.portalAccessUntil || portalAccessUntilFromEnd(booking.end);
  if (!accessUntil) {
    throw new HttpsError("failed-precondition", "Invalid stay dates on booking.");
  }

  const updated = patchBookingInList(bookings, booking.id, {
    portalAccessUntil: accessUntil,
    accessSource: booking.accessSource || "pre_arrival_dates",
  });
  await persistBookings(typeRef, updated);

  const session = await createSession(firestore, {
    propertyId,
    typeId,
    bookingId: booking.id,
    accessUntil,
    source: "pre_arrival_dates",
    guestName: resolveBookingGuestDisplayName(booking),
    guestLocale: booking.guestLocale || null,
    checkIn: checkInDay,
    checkOut: checkOutDay,
  });

  return {
    session,
    bookingId: booking.id,
    checkIn: checkInDay,
    checkOut: checkOutDay,
  };
}

async function createStandalonePreArrivalSession(
  firestore,
  { propertyId, typeId, checkInDay, checkOutDay, existingSessionId }
) {
  const typeRef = firestore
    .collection("properties")
    .doc(propertyId)
    .collection("propertyTypes")
    .doc(typeId);
  const typeSnap = await typeRef.get();
  if (!typeSnap.exists) {
    throw new HttpsError("not-found", "Unit not found.");
  }

  const bookings = Array.isArray(typeSnap.data().syncedBookings)
    ? typeSnap.data().syncedBookings
    : [];

  if (existingSessionId) {
    const existing = await getSession(firestore, propertyId, existingSessionId);
    if (
      existing &&
      existing.propertyId === propertyId &&
      existing.typeId === typeId &&
      existing.bookingId &&
      Date.now() < new Date(existing.accessUntil).getTime()
    ) {
      const existingBooking = bookings.find((b) => b.id === existing.bookingId);
      if (
        existingBooking &&
        isBookingPortalAccessAllowed(existingBooking) &&
        bookingMatchesExactDates(existingBooking, checkInDay, checkOutDay)
      ) {
        return {
          session: formatSessionPayload(existing),
          reused: true,
          bookingId: existing.bookingId,
          checkIn: checkInDay,
          checkOut: checkOutDay,
        };
      }
    }
  }

  const booking = {
    id: `CHECKIN-${crypto.randomBytes(6).toString("hex")}`,
    start: checkInDay,
    end: checkOutDay,
    provider: "Online check-in",
    isInvited: false,
    guestDetailsComplete: false,
  };
  await persistBookings(typeRef, [...bookings, booking]);

  return createPreArrivalDateSession(firestore, {
    propertyId,
    typeId,
    booking,
    checkInDay,
    checkOutDay,
  });
}

function parseGuestCheckInDates(checkIn, checkOut, options = {}) {
  const checkInDay = normalizeBookingDay(checkIn);
  const checkOutDay = normalizeBookingDay(checkOut);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkInDay) || !/^\d{4}-\d{2}-\d{2}$/.test(checkOutDay)) {
    throw new HttpsError("invalid-argument", "Please enter valid check-in and check-out dates.");
  }
  const start = parseIsoDay(checkInDay);
  const end = parseIsoDay(checkOutDay);
  if (!start || !end) {
    throw new HttpsError("invalid-argument", "Please enter valid check-in and check-out dates.");
  }
  if (options.requireUpcomingCheckIn) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (start.getTime() < today.getTime()) {
      throw new HttpsError("invalid-argument", "Check-in must be today or a later date.");
    }
  }
  if (end.getTime() <= start.getTime()) {
    throw new HttpsError("invalid-argument", "Check-out must be after check-in.");
  }
  return { checkInDay, checkOutDay };
}

function portalAccessUntilFromEnd(end) {
  const e = parseIsoDay(end);
  if (!e) return null;
  const until = new Date(e.getTime() + 2 * 24 * 60 * 60 * 1000);
  until.setHours(23, 59, 59, 999);
  return until.toISOString();
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !password) return false;
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const verify = crypto.scryptSync(password, salt, 32).toString("hex");
  return verify === hash;
}

function generateToken() {
  return crypto.randomBytes(18).toString("hex");
}

function generatePassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let pw = "";
  for (let i = 0; i < 8; i++) {
    pw += chars[Math.floor(Math.random() * chars.length)];
  }
  return pw;
}

function bookingGuestComplete(b) {
  const name = String(b.guestName || b.summary || "").trim();
  const locale = String(b.guestLocale || "").trim();
  if (!name || !locale) return false;
  if (b.guestDetailsComplete === false) return false;
  return true;
}

function matchesBooking(b, bookingId) {
  return b.id && bookingId && b.id === bookingId;
}

async function findBookingByInviteToken(firestore, propertyId, typeId, token) {
  const typeRef = firestore
    .collection("properties")
    .doc(propertyId)
    .collection("propertyTypes")
    .doc(typeId);
  const snap = await typeRef.get();
  if (!snap.exists) return { typeRef, booking: null, bookings: [] };
  const bookings = snap.data().syncedBookings || [];
  const booking = bookings.find((b) => b.inviteToken === token) || null;
  return { typeRef, booking, bookings, typeData: snap.data() };
}

async function persistBookings(typeRef, bookings) {
  await typeRef.set({ syncedBookings: bookings }, { merge: true });
}

function patchBookingInList(bookings, bookingId, patch) {
  return bookings.map((b) => (matchesBooking(b, bookingId) ? { ...b, ...patch } : b));
}

async function createSession(firestore, {
  propertyId,
  typeId,
  bookingId,
  testerId,
  accessUntil,
  source,
  guestName,
  guestLocale,
  inviteToken,
  checkIn,
  checkOut,
}) {
  const sessionRef = firestore
    .collection("properties")
    .doc(propertyId)
    .collection("guestPortalSessions")
    .doc();
  const session = {
    propertyId,
    typeId,
    bookingId: bookingId || null,
    testerId: testerId || null,
    accessUntil,
    source,
    guestName: guestName || null,
    guestLocale: guestLocale || null,
    inviteToken: inviteToken || null,
    checkIn: checkIn || null,
    checkOut: checkOut || null,
    createdAt: new Date().toISOString(),
  };
  await sessionRef.set(session);
  return { sessionId: sessionRef.id, ...session };
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

function formatSessionPayload(session) {
  return {
    sessionId: session.sessionId,
    propertyId: session.propertyId,
    typeId: session.typeId,
    bookingId: session.bookingId,
    testerId: session.testerId,
    accessUntil: session.accessUntil,
    source: session.source,
    guestName: session.guestName,
    guestLocale: session.guestLocale || null,
    inviteToken: session.inviteToken || null,
    checkIn: session.checkIn || null,
    checkOut: session.checkOut || null,
    preArrivalComplete: session.preArrivalComplete === true,
  };
}

async function sessionMatchesInviteToken(firestore, propertyId, typeId, session, inviteToken) {
  const token = String(inviteToken || "").trim();
  if (!token || !session?.bookingId) return false;
  const { booking } = await findBookingByInviteToken(firestore, propertyId, typeId, token);
  return Boolean(booking?.id && booking.id === session.bookingId);
}

async function houseGuestBookingAllowsAccess(firestore, session) {
  if (!session?.bookingId) return { allowed: true, booking: null };
  const booking = await getBookingById(
    firestore,
    session.propertyId,
    session.typeId,
    session.bookingId
  );
  if (!isBookingPortalAccessAllowed(booking)) {
    return { allowed: false, reason: "booking_cancelled", booking };
  }
  return { allowed: true, booking };
}

function isGuestPortalAccessControlEnabled(propertyData) {
  return propertyData?.guestPortalAccessRequired !== false;
}

function assertAccessEnabled(propertyData) {
  if (!isGuestPortalAccessControlEnabled(propertyData)) {
    throw new HttpsError(
      "failed-precondition",
      "Guest portal access control is not enabled for this property."
    );
  }
}

async function requirePropertyGuestInviteAccess(request, firestore, propertyId) {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in to send guest invites.");
  }

  const caller = await resolveCallerOwnerProfile(request, firestore);
  if (!caller) {
    throw new HttpsError("permission-denied", "Admin account required.");
  }
  if (caller.role === "excursion_provider") {
    throw new HttpsError("permission-denied", "Excursion providers cannot send guest invites.");
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

function registerGuestPortalAccess({ firestore, logger, firebaseExports }) {
  if (!firebaseExports) {
    throw new Error("registerGuestPortalAccess requires firebaseExports (index.js exports)");
  }
  const exp = firebaseExports;

  exp.validateGuestPortalSession = onCall(async (request) => {
    const { propertyId, typeId, sessionId, inviteToken } = request.data || {};
    if (!propertyId || !typeId || !sessionId) {
      throw new HttpsError("invalid-argument", "Missing session parameters.");
    }
    const session = await getSession(firestore, propertyId, sessionId);
    if (!session || session.typeId !== typeId) {
      return { valid: false };
    }
    if (Date.now() > new Date(session.accessUntil).getTime()) {
      return { valid: false, reason: "expired" };
    }
    const bookingAccess = await houseGuestBookingAllowsAccess(firestore, session);
    if (!bookingAccess.allowed) {
      return { valid: false, reason: bookingAccess.reason };
    }
    if (inviteToken) {
      const matches = await sessionMatchesInviteToken(
        firestore,
        propertyId,
        typeId,
        session,
        inviteToken
      );
      if (!matches) {
        return { valid: false, reason: "invite_mismatch" };
      }
    }
    return {
      valid: true,
      session: formatSessionPayload({
        ...session,
        preArrivalComplete: Boolean(
          bookingAccess.booking?.preArrivalComplete || session.preArrivalComplete
        ),
      }),
      preArrivalComplete: Boolean(
        bookingAccess.booking?.preArrivalComplete || session.preArrivalComplete
      ),
    };
  });

  exp.grantAdminGuestPortalPreview = onCall(async (request) => {
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "Sign in to the Vailo admin app in this browser to preview the guest portal."
      );
    }

    const { propertyId, typeId } = request.data || {};
    if (!propertyId || !typeId) {
      throw new HttpsError("invalid-argument", "Missing property or unit.");
    }

    const propSnap = await firestore.collection("properties").doc(propertyId).get();
    if (!propSnap.exists) {
      throw new HttpsError("not-found", "Property not found.");
    }

    const typeSnap = await firestore
      .collection("properties")
      .doc(propertyId)
      .collection("propertyTypes")
      .doc(typeId)
      .get();
    if (!typeSnap.exists) {
      throw new HttpsError("not-found", "Unit not found.");
    }

    const accessUntil = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();
    const session = await createSession(firestore, {
      propertyId,
      typeId,
      accessUntil,
      source: "admin_preview",
      guestName: "Admin preview",
    });

    return { session };
  });

  exp.sendGuestInvite = onCall(
    { region: "us-central1", secrets: [resendApiKey] },
    async (request) => {
      const { propertyId, typeId, bookingId, reinvite } = request.data || {};
      if (!propertyId || !typeId || !bookingId) {
        throw new HttpsError("invalid-argument", "Missing booking reference.");
      }

      await requirePropertyGuestInviteAccess(request, firestore, propertyId);

      const propSnap = await firestore.collection("properties").doc(propertyId).get();
      if (!propSnap.exists) throw new HttpsError("not-found", "Property not found.");
      const property = propSnap.data();

      const { typeRef, bookings, typeData } = await findBookingByInviteToken(
        firestore,
        propertyId,
        typeId,
        null
      );
      const target = bookings.find((b) => b.id === bookingId);
      if (!target) throw new HttpsError("not-found", "Booking not found.");
      if (!bookingGuestComplete(target)) {
        throw new HttpsError("failed-precondition", "Complete guest details first.");
      }

      const guestEmail = String(target.guestEmail || "").trim();
      if (!guestEmail.includes("@")) {
        throw new HttpsError("failed-precondition", "Guest email is required.");
      }

      const propSlug = formatGuestSlug(property.urlSlug);
      const unitSlug = getTypePublicSlug(typeData || {});
      if (!propSlug || !unitSlug) {
        throw new HttpsError(
          "failed-precondition",
          "Property and listing need public URL slugs before sending invites."
        );
      }

      const token = target.inviteToken || generateToken();
      const password = generatePassword();
      const passwordHash = hashPassword(password);
      const now = new Date().toISOString();
      const accessUntil =
        target.portalAccessUntil || portalAccessUntilFromEnd(target.end);
      const origin = getGuestPortalPublicOrigin();
      const inviteUrl = buildInvitePortalUrl(
        origin,
        propSlug,
        unitSlug,
        token,
        typeId,
        target.guestLocale
      );

      const propertyName =
        String(property.propertyName || property.title || "").trim() || "Your stay";
      const unitName = String(typeData?.propertyTypeName || "").trim();
      const emailPayload = buildGuestInviteEmailFromContext({
        guestName: target.guestName,
        guestEmail,
        propertyName,
        unitName,
        stayRangeLabel: formatBookingDateRange(target.start, target.end),
        inviteUrl,
        accessPassword: password,
        reinvite: Boolean(reinvite),
        hostLabel: propertyName,
        preArrivalCheckInEnabled: isPreArrivalCheckInEnabled(property),
        preArrivalComplete: Boolean(target.preArrivalComplete),
      });

      const updated = patchBookingInList(bookings, bookingId, {
        inviteToken: token,
        invitePasswordHash: passwordHash,
        inviteStatus: reinvite && target.inviteStatus === "opened" ? "opened" : "waiting",
        isInvited: true,
        lastInvitedAt: now,
        lastInviteChannel: "email",
        portalAccessUntil: accessUntil,
        portalAccessRevokedAt: null,
        portalActivatedAt: target.portalAccessRevokedAt ? null : target.portalActivatedAt,
        accessSource: target.portalAccessRevokedAt ? null : target.accessSource,
      });

      try {
        await persistBookings(typeRef, updated);
      } catch (persistErr) {
        logger.error("Guest invite persist failed before email", {
          propertyId,
          typeId,
          bookingId,
          error: persistErr?.message || String(persistErr),
        });
        throw new HttpsError(
          "internal",
          "Could not save invitation credentials. Please try again."
        );
      }

      let sent;
      try {
        sent = await deliverGuestInviteEmail(resendApiKey.value(), guestEmail, emailPayload);
      } catch (err) {
        logger.error("Guest invite email failed", {
          propertyId,
          typeId,
          bookingId,
          guestEmail,
          error: err?.message || String(err),
        });
        throw new HttpsError(
          "internal",
          "Invitation credentials were saved but the email could not be sent. Copy the invitation manually or try again."
        );
      }

      const emailed = patchBookingInList(updated, bookingId, {
        lastInviteEmailSentAt: now,
        lastInviteEmailResendId: sent?.id || null,
      });
      try {
        await persistBookings(typeRef, emailed);
      } catch (persistErr) {
        logger.error("Guest invite email sent but follow-up persist failed", {
          propertyId,
          typeId,
          bookingId,
          guestEmail,
          resendId: sent?.id || null,
          error: persistErr?.message || String(persistErr),
        });
      }

      return {
        inviteToken: token,
        invitePassword: password,
        inviteStatus: emailed.find((b) => b.id === bookingId)?.inviteStatus,
        emailSent: true,
        resendSentId: sent?.id || null,
        inviteUrl,
      };
    }
  );

  /** Generate portal link + password for clipboard sharing (no email). */
  exp.prepareGuestInviteCopy = onCall({ region: "us-central1" }, async (request) => {
    const { propertyId, typeId, bookingId } = request.data || {};
    if (!propertyId || !typeId || !bookingId) {
      throw new HttpsError("invalid-argument", "Missing booking reference.");
    }

    await requirePropertyGuestInviteAccess(request, firestore, propertyId);

    const propSnap = await firestore.collection("properties").doc(propertyId).get();
    if (!propSnap.exists) throw new HttpsError("not-found", "Property not found.");
    const property = propSnap.data();

    const { typeRef, bookings, typeData } = await findBookingByInviteToken(
      firestore,
      propertyId,
      typeId,
      null
    );
    const target = bookings.find((b) => b.id === bookingId);
    if (!target) throw new HttpsError("not-found", "Booking not found.");
    if (!bookingGuestComplete(target)) {
      throw new HttpsError("failed-precondition", "Complete guest details first.");
    }

    const propSlug = formatGuestSlug(property.urlSlug);
    const unitSlug = getTypePublicSlug(typeData || {});
    if (!propSlug || !unitSlug) {
      throw new HttpsError(
        "failed-precondition",
        "Property and listing need public URL slugs before copying an invitation."
      );
    }

    const token = target.inviteToken || generateToken();
    const password = generatePassword();
    const passwordHash = hashPassword(password);
    const accessUntil =
      target.portalAccessUntil || portalAccessUntilFromEnd(target.end);
    const origin = getGuestPortalPublicOrigin();
    const inviteUrl = buildInvitePortalUrl(
      origin,
      propSlug,
      unitSlug,
      token,
      typeId,
      target.guestLocale
    );

    const updated = patchBookingInList(bookings, bookingId, {
      inviteToken: token,
      invitePasswordHash: passwordHash,
      portalAccessUntil: accessUntil,
      portalAccessRevokedAt: null,
    });
    await persistBookings(typeRef, updated);

    return {
      inviteToken: token,
      invitePassword: password,
      inviteUrl,
    };
  });

  /** Mark invitation as sent outside email (e.g. WhatsApp) — same portal credentials & invited state. */
  exp.markGuestInviteSent = onCall({ region: "us-central1" }, async (request) => {
    const { propertyId, typeId, bookingId, channel } = request.data || {};
    if (!propertyId || !typeId || !bookingId) {
      throw new HttpsError("invalid-argument", "Missing booking reference.");
    }

    await requirePropertyGuestInviteAccess(request, firestore, propertyId);

    const propSnap = await firestore.collection("properties").doc(propertyId).get();
    if (!propSnap.exists) throw new HttpsError("not-found", "Property not found.");
    const property = propSnap.data();

    const { typeRef, bookings, typeData } = await findBookingByInviteToken(
      firestore,
      propertyId,
      typeId,
      null
    );
    const target = bookings.find((b) => b.id === bookingId);
    if (!target) throw new HttpsError("not-found", "Booking not found.");
    if (!bookingGuestComplete(target)) {
      throw new HttpsError("failed-precondition", "Complete guest details first.");
    }

    const propSlug = formatGuestSlug(property.urlSlug);
    const unitSlug = getTypePublicSlug(typeData || {});

    const inviteChannel = channel === "email" ? "email" : "whatsapp";
    const now = new Date().toISOString();
    const accessUntil =
      target.portalAccessUntil || portalAccessUntilFromEnd(target.end);
    if (!accessUntil || Date.now() > new Date(accessUntil).getTime()) {
      throw new HttpsError(
        "failed-precondition",
        "This stay has ended — invitation can no longer be marked as sent."
      );
    }

    const token = target.inviteToken || generateToken();
    let passwordPlain;
    let passwordHash = target.invitePasswordHash;
    if (!passwordHash) {
      passwordPlain = generatePassword();
      passwordHash = hashPassword(passwordPlain);
    }

    const origin = getGuestPortalPublicOrigin();
    const inviteUrl =
      propSlug && unitSlug
        ? buildInvitePortalUrl(
            origin,
            propSlug,
            unitSlug,
            token,
            typeId,
            target.guestLocale
          )
        : null;

    const updated = patchBookingInList(bookings, bookingId, {
      inviteToken: token,
      invitePasswordHash: passwordHash,
      inviteStatus:
        target.inviteStatus === "opened" ? "opened" : "waiting",
      isInvited: true,
      lastInvitedAt: now,
      lastInviteChannel: inviteChannel,
      portalAccessUntil: accessUntil,
      portalAccessRevokedAt: null,
      portalActivatedAt: target.portalAccessRevokedAt ? null : target.portalActivatedAt,
      accessSource: target.portalAccessRevokedAt ? "invite" : target.accessSource || "invite",
    });
    await persistBookings(typeRef, updated);

    return {
      inviteToken: token,
      invitePassword: passwordPlain || null,
      inviteUrl,
      alreadyInvited: Boolean(target.isInvited),
    };
  });

  exp.verifyGuestInvite = onCall(async (request) => {
    const { propertyId, typeId, inviteToken, password, existingSessionId } =
      request.data || {};
    if (!propertyId || !typeId || !inviteToken || !password) {
      throw new HttpsError("invalid-argument", "Missing invite credentials.");
    }

    const propSnap = await firestore.collection("properties").doc(propertyId).get();
    if (!propSnap.exists) throw new HttpsError("not-found", "Property not found.");
    assertAccessEnabled(propSnap.data());

    const { typeRef, booking, bookings } = await findBookingByInviteToken(
      firestore,
      propertyId,
      typeId,
      inviteToken
    );
    if (!booking) {
      throw new HttpsError("permission-denied", "Invalid invitation or password.");
    }

    if (existingSessionId) {
      const existing = await getSession(firestore, propertyId, existingSessionId);
      if (
        existing &&
        existing.typeId === typeId &&
        existing.bookingId === booking.id &&
        Date.now() < new Date(existing.accessUntil).getTime()
      ) {
        const bookingAccess = await houseGuestBookingAllowsAccess(
          firestore,
          existing
        );
        if (bookingAccess.allowed) {
          return { session: formatSessionPayload(existing) };
        }
      }
    }

    if (!verifyPassword(password, booking.invitePasswordHash)) {
      throw new HttpsError("permission-denied", "Invalid invitation or password.");
    }
    if (!isBookingPortalAccessAllowed(booking)) {
      throw new HttpsError(
        "permission-denied",
        "This reservation was cancelled. Guest portal access is no longer available."
      );
    }

    const now = new Date().toISOString();
    const accessUntil =
      booking.portalAccessUntil || portalAccessUntilFromEnd(booking.end);
    if (!accessUntil || Date.now() > new Date(accessUntil).getTime()) {
      throw new HttpsError("permission-denied", "This invitation has expired.");
    }

    const activatedAt = booking.portalActivatedAt || now;
    const updated = patchBookingInList(bookings, booking.id, {
      inviteStatus: "opened",
      portalActivatedAt: activatedAt,
      portalAccessUntil: accessUntil,
      accessSource: booking.accessSource || "invite",
      isInvited: true,
    });
    await persistBookings(typeRef, updated);

    const session = await createSession(firestore, {
      propertyId,
      typeId,
      bookingId: booking.id,
      accessUntil,
      source: "invite",
      guestName: booking.guestName,
      guestLocale: booking.guestLocale,
      inviteToken,
    });

    return { session };
  });

  exp.resolvePreArrivalBookingByDates = onCall(async (request) => {
    const {
      propertyId,
      typeId,
      checkIn,
      checkOut,
      existingSessionId,
      selectedTypeId,
      selectedBookingId,
    } = request.data || {};
    if (!propertyId || !typeId) {
      throw new HttpsError("invalid-argument", "Missing property or unit.");
    }

    const propSnap = await firestore.collection("properties").doc(propertyId).get();
    if (!propSnap.exists) throw new HttpsError("not-found", "Property not found.");
    const property = propSnap.data();
    if (!isPreArrivalCheckInEnabled(property)) {
      throw new HttpsError(
        "failed-precondition",
        "Online check-in is not enabled for this property."
      );
    }

    const calendarSyncEnabled = isCalendarSyncEnabled(property);
    const { checkInDay, checkOutDay } = parseGuestCheckInDates(checkIn, checkOut, {
      requireUpcomingCheckIn: !calendarSyncEnabled,
    });

    if (!calendarSyncEnabled) {
      return createStandalonePreArrivalSession(firestore, {
        propertyId,
        typeId,
        checkInDay,
        checkOutDay,
        existingSessionId,
      });
    }

    const matches = await findPreArrivalDateMatchesAcrossProperty(
      firestore,
      propertyId,
      checkInDay,
      checkOutDay
    );

    if (existingSessionId && !selectedTypeId && !selectedBookingId) {
      const existing = await getSession(firestore, propertyId, existingSessionId);
      const matchedBookingIds = new Set(matches.map((m) => m.bookingId).filter(Boolean));
      if (
        existing &&
        existing.propertyId === propertyId &&
        existing.bookingId &&
        matchedBookingIds.has(existing.bookingId) &&
        Date.now() < new Date(existing.accessUntil).getTime()
      ) {
        const bookingAccess = await houseGuestBookingAllowsAccess(firestore, existing);
        if (bookingAccess.allowed) {
          return {
            session: formatSessionPayload(existing),
            reused: true,
            bookingId: existing.bookingId,
          };
        }
      }
    }

    if (matches.length === 0) {
      throw new HttpsError(
        "not-found",
        "We could not find a reservation for those dates on this property. Please check your dates or contact your host."
      );
    }

    assertUniqueListingMatches(matches);

    const chosenTypeId = String(selectedTypeId || "").trim();
    const chosenBookingId = String(selectedBookingId || "").trim();

    if (chosenTypeId && chosenBookingId) {
      const selected = matches.find(
        (m) => m.typeId === chosenTypeId && m.bookingId === chosenBookingId
      );
      if (!selected) {
        throw new HttpsError(
          "failed-precondition",
          "That accommodation is not available for the dates you entered."
        );
      }
      return createPreArrivalDateSession(firestore, {
        propertyId,
        typeId: selected.typeId,
        booking: selected.booking,
        checkInDay,
        checkOutDay,
      });
    }

    if (matches.length === 1) {
      const match = matches[0];
      return createPreArrivalDateSession(firestore, {
        propertyId,
        typeId: match.typeId,
        booking: match.booking,
        checkInDay,
        checkOutDay,
      });
    }

    return {
      needsListingChoice: true,
      listingOptions: matches.map((m) => ({
        typeId: m.typeId,
        typeName: m.typeName,
        bookingId: m.bookingId,
      })),
      checkIn: checkInDay,
      checkOut: checkOutDay,
    };
  });

  exp.activateGuestOnSiteAccess = onCall(async (request) => {
    const { propertyId, typeId, existingSessionId } = request.data || {};
    if (!propertyId || !typeId) {
      throw new HttpsError("invalid-argument", "Missing property or unit.");
    }

    const propSnap = await firestore.collection("properties").doc(propertyId).get();
    if (!propSnap.exists) throw new HttpsError("not-found", "Property not found.");
    assertAccessEnabled(propSnap.data());

    const typeRef = firestore
      .collection("properties")
      .doc(propertyId)
      .collection("propertyTypes")
      .doc(typeId);
    const typeSnap = await typeRef.get();
    if (!typeSnap.exists) throw new HttpsError("not-found", "Unit not found.");

    const bookings = typeSnap.data().syncedBookings || [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const active = bookings.filter(
      (b) =>
        isBookingPortalAccessAllowed(b) &&
        bookingGuestComplete(b) &&
        isWithinBookingStayDates(today, b.start, b.end)
    );

    if (existingSessionId) {
      const existing = await getSession(firestore, propertyId, existingSessionId);
      const activeBookingIds = new Set(active.map((b) => b.id).filter(Boolean));
      if (
        existing &&
        existing.typeId === typeId &&
        existing.bookingId &&
        activeBookingIds.has(existing.bookingId) &&
        Date.now() < new Date(existing.accessUntil).getTime()
      ) {
        const bookingAccess = await houseGuestBookingAllowsAccess(
          firestore,
          existing
        );
        if (bookingAccess.allowed) {
          return {
            session: formatSessionPayload(existing),
            reused: true,
          };
        }
      }
    }

    if (active.length === 0) {
      throw new HttpsError(
        "permission-denied",
        "No active stay found for today. Use your invitation link or guest visitor access code."
      );
    }
    if (active.length > 1) {
      throw new HttpsError(
        "failed-precondition",
        "Multiple stays match today. Open the link from your invitation email."
      );
    }

    const booking = active[0];
    const now = new Date().toISOString();
    const accessUntil =
      booking.portalAccessUntil || portalAccessUntilFromEnd(booking.end);
    if (!accessUntil) {
      throw new HttpsError("failed-precondition", "Invalid stay dates on booking.");
    }

    const activatedAt = booking.portalActivatedAt || now;
    const updated = patchBookingInList(bookings, booking.id, {
      portalActivatedAt: activatedAt,
      portalAccessUntil: accessUntil,
      accessSource: booking.accessSource || "on_site",
      inviteStatus:
        booking.inviteStatus === "waiting" ? "opened" : booking.inviteStatus || "opened",
    });
    await persistBookings(typeRef, updated);

    const session = await createSession(firestore, {
      propertyId,
      typeId,
      bookingId: booking.id,
      accessUntil,
      source: booking.accessSource === "invite" ? "invite" : "on_site",
      guestName: booking.guestName,
      guestLocale: booking.guestLocale,
    });

    return { session, bookingId: booking.id };
  });

  exp.verifyGuestTesterCode = onCall(async (request) => {
    const { propertyId, typeId, accessCode } = request.data || {};
    if (!propertyId || !typeId || !accessCode) {
      throw new HttpsError("invalid-argument", "Missing visitor access code.");
    }

    const normalized = String(accessCode).trim().toUpperCase();
    const testersSnap = await firestore
      .collection("properties")
      .doc(propertyId)
      .collection("propertyTypes")
      .doc(typeId)
      .collection("testers")
      .where("accessCode", "==", normalized)
      .limit(1)
      .get();

    if (testersSnap.empty) {
      throw new HttpsError("permission-denied", "Invalid visitor access code.");
    }

    const testerDoc = testersSnap.docs[0];
    const tester = testerDoc.data();
    const now = Date.now();
    if (now < new Date(tester.validFrom).getTime()) {
      throw new HttpsError("permission-denied", "Visitor access is not active yet.");
    }
    if (tester.validUntil && now > new Date(tester.validUntil).getTime()) {
      throw new HttpsError("permission-denied", "Visitor access has expired.");
    }

    const accessUntil =
      tester.validUntil ||
      new Date(now + 365 * 24 * 60 * 60 * 1000).toISOString();

    const session = await createSession(firestore, {
      propertyId,
      typeId,
      testerId: testerDoc.id,
      accessUntil,
      source: "tester",
      guestName: tester.name,
    });

    return { session };
  });

  exp.maybeAutoSendGuestInvite = onCall(
    { region: "us-central1", secrets: [resendApiKey] },
    async (request) => {
      const { propertyId, typeId, bookingId } = request.data || {};
      if (!propertyId || !typeId || !bookingId) {
        throw new HttpsError("invalid-argument", "Missing booking reference.");
      }

      await requirePropertyGuestInviteAccess(request, firestore, propertyId);

      const { tryAutoSendGuestInviteForBooking } = require("./guestAutoInvite");
      const result = await tryAutoSendGuestInviteForBooking(
        firestore,
        logger,
        resendApiKey.value(),
        { propertyId, typeId, bookingId }
      );

      return result;
    }
  );
}

module.exports = { registerGuestPortalAccess, requirePropertyGuestInviteAccess };
