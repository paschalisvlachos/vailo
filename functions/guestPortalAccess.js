const { onCall, HttpsError } = require("firebase-functions/v2/https");
const crypto = require("crypto");
const {
  getBookingById,
  isBookingPortalAccessAllowed,
} = require("./guestPortalBookingAccess");

function parseIsoDay(iso) {
  if (!iso) return null;
  const parts = String(iso).split("-").map(Number);
  if (parts.length < 3) return null;
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
  return Boolean(
    b.guestDetailsComplete &&
      String(b.guestName || "").trim() &&
      String(b.guestEmail || "").trim() &&
      String(b.guestLocale || "").trim()
  );
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
  };
}

async function houseGuestBookingAllowsAccess(firestore, session) {
  if (!session?.bookingId) return { allowed: true };
  const booking = await getBookingById(
    firestore,
    session.propertyId,
    session.typeId,
    session.bookingId
  );
  if (!isBookingPortalAccessAllowed(booking)) {
    return { allowed: false, reason: "booking_cancelled" };
  }
  return { allowed: true };
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

function registerGuestPortalAccess({ firestore, logger, firebaseExports }) {
  if (!firebaseExports) {
    throw new Error("registerGuestPortalAccess requires firebaseExports (index.js exports)");
  }
  const exp = firebaseExports;

  exp.validateGuestPortalSession = onCall(async (request) => {
    const { propertyId, typeId, sessionId } = request.data || {};
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
    return {
      valid: true,
      session: formatSessionPayload(session),
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

  exp.sendGuestInvite = onCall(async (request) => {
    const { propertyId, typeId, bookingId, reinvite } = request.data || {};
    if (!propertyId || !typeId || !bookingId) {
      throw new HttpsError("invalid-argument", "Missing booking reference.");
    }

    const propSnap = await firestore.collection("properties").doc(propertyId).get();
    if (!propSnap.exists) throw new HttpsError("not-found", "Property not found.");
    assertAccessEnabled(propSnap.data());

    const { typeRef, booking, bookings } = await findBookingByInviteToken(
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

    const token = target.inviteToken || generateToken();
    const password = generatePassword();
    const passwordHash = hashPassword(password);
    const now = new Date().toISOString();
    const accessUntil =
      target.portalAccessUntil || portalAccessUntilFromEnd(target.end);

    const updated = patchBookingInList(bookings, bookingId, {
      inviteToken: token,
      invitePasswordHash: passwordHash,
      inviteStatus: reinvite && target.inviteStatus === "opened" ? "opened" : "waiting",
      isInvited: true,
      lastInvitedAt: now,
      portalAccessUntil: accessUntil,
      portalAccessRevokedAt: null,
      portalActivatedAt: target.portalAccessRevokedAt ? null : target.portalActivatedAt,
      accessSource: target.portalAccessRevokedAt ? null : target.accessSource,
    });
    await persistBookings(typeRef, updated);

    return {
      inviteToken: token,
      invitePassword: password,
      inviteStatus: updated.find((b) => b.id === bookingId)?.inviteStatus,
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

    if (existingSessionId) {
      const existing = await getSession(firestore, propertyId, existingSessionId);
      if (
        existing &&
        existing.typeId === typeId &&
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

    const { typeRef, bookings } = await findBookingByInviteToken(
      firestore,
      propertyId,
      typeId,
      inviteToken
    );
    const booking = bookings.find((b) => b.inviteToken === inviteToken);
    if (!booking || !verifyPassword(password, booking.invitePasswordHash)) {
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
    });

    return { session };
  });

  exp.activateGuestOnSiteAccess = onCall(async (request) => {
    const { propertyId, typeId, existingSessionId } = request.data || {};
    if (!propertyId || !typeId) {
      throw new HttpsError("invalid-argument", "Missing property or unit.");
    }

    const propSnap = await firestore.collection("properties").doc(propertyId).get();
    if (!propSnap.exists) throw new HttpsError("not-found", "Property not found.");
    assertAccessEnabled(propSnap.data());

    if (existingSessionId) {
      const existing = await getSession(firestore, propertyId, existingSessionId);
      if (
        existing &&
        existing.typeId === typeId &&
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
}

module.exports = { registerGuestPortalAccess };
