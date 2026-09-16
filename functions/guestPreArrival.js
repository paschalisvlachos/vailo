const crypto = require("crypto");
const admin = require("firebase-admin");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const {
  getBookingById,
  isBookingPortalAccessAllowed,
} = require("./guestPortalBookingAccess");
const { requirePropertyGuestInviteAccess } = require("./guestPortalAccess");
const {
  resolveWrongDatesResetAction,
} = require("./guestPreArrivalRules");
const {
  CheckInValidationError,
  validateSubmissionInput,
  buildPreArrivalSubmissionRecord,
  buildCompletedCheckInBookingPatch,
  matchesBooking,
  patchBookingInList,
  buildBookingAfterPreArrivalRemoval,
  applyWrongDatesResetToBookings,
} = require("./guestPreArrivalSubmitRules");
const { upsertGuestProfileFromPreArrival } = require("./guestCrm");
const {
  encryptBuffer,
  decryptBuffer,
  ID_DOCUMENT_KEY_VERSION,
} = require("./guestIdDocumentCrypto");

const idDocEncryptionKey = defineSecret("GUEST_ID_DOCUMENT_ENCRYPTION_KEY");

const PRE_ARRIVAL_ID_MAX_BYTES = 5 * 1024 * 1024;
const PRE_ARRIVAL_TRANSFER_PRICE_MAX = 9999;
const ALLOWED_ID_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);
const ALLOWED_ID_DOCUMENT_TYPES = new Set(["passport", "national_id", "other"]);

async function getSession(firestore, propertyId, sessionId) {
  const snap = await firestore
    .collection("properties")
    .doc(propertyId)
    .collection("guestPortalSessions")
    .doc(sessionId)
    .get();
  if (!snap.exists) return null;
  return { sessionId: snap.id, ...snap.data() };
}

async function requireGuestSession(firestore, propertyId, typeId, sessionId) {
  if (!propertyId || !typeId || !sessionId) {
    throw new HttpsError("invalid-argument", "Missing session parameters.");
  }
  const session = await getSession(firestore, propertyId, sessionId);
  if (!session || session.typeId !== typeId) {
    throw new HttpsError("permission-denied", "Invalid session.");
  }
  if (Date.now() > new Date(session.accessUntil).getTime()) {
    throw new HttpsError("permission-denied", "Session expired.");
  }
  if (session.source === "admin_preview" || session.source === "tester") {
    return { session, previewMode: true };
  }
  if (!session.bookingId) {
    throw new HttpsError("failed-precondition", "No booking linked to session.");
  }
  const booking = await getBookingById(
    firestore,
    propertyId,
    typeId,
    session.bookingId
  );
  if (!isBookingPortalAccessAllowed(booking)) {
    throw new HttpsError("permission-denied", "Booking access not allowed.");
  }
  return { session, previewMode: false, booking };
}

async function persistBookings(typeRef, bookings) {
  await typeRef.set({ syncedBookings: bookings }, { merge: true });
}

function isPreArrivalCheckInEnabled(property) {
  if (property?.preArrivalCheckInEnabled === undefined) return true;
  return property.preArrivalCheckInEnabled !== false;
}

async function deleteStoredIdDocument(storagePath) {
  const path = String(storagePath || "").trim();
  if (!path || path.startsWith("preview/")) {
    return { deleted: false, skipped: true };
  }

  const bucket = admin.storage().bucket();
  const file = bucket.file(path);
  const [exists] = await file.exists();
  if (!exists) {
    return { deleted: false, missing: true };
  }
  await file.delete();
  return { deleted: true };
}

function normalizeTransferOffer(raw) {
  const enabled = raw?.enabled === true;
  const label = String(raw?.label || "Transfer from port / airport").trim();
  const price = Number(raw?.priceEur);
  const priceEur =
    Number.isFinite(price) && price >= 0 && price <= PRE_ARRIVAL_TRANSFER_PRICE_MAX
      ? Math.round(price * 100) / 100
      : 0;
  const paymentNote = String(raw?.paymentNote || "Pay in cash on arrival").trim();
  return {
    enabled,
    label: label || "Transfer from port / airport",
    priceEur,
    paymentNote: paymentNote || "Pay in cash on arrival",
  };
}

function resolveTransferFields(data, property) {
  const offer = normalizeTransferOffer(property?.preArrivalTransferOffer);
  const requested = data.transferRequested === true;
  if (!requested) {
    return {};
  }
  if (!offer.enabled) {
    throw new HttpsError(
      "failed-precondition",
      "Transfer is not offered for this property."
    );
  }
  return {
    transferRequested: true,
    transferOffer: {
      label: offer.label,
      priceEur: offer.priceEur,
      paymentNote: offer.paymentNote,
    },
  };
}

function parseIdDocumentUpload(data) {
  const base64 = String(data.idDocumentBase64 || "").trim();
  if (!base64) return null;

  const contentType = String(data.idDocumentContentType || "").trim().toLowerCase();
  if (!ALLOWED_ID_CONTENT_TYPES.has(contentType)) {
    throw new HttpsError(
      "invalid-argument",
      "Unsupported ID document type. Use JPEG, PNG, WebP, or PDF."
    );
  }

  let buffer;
  try {
    buffer = Buffer.from(base64, "base64");
  } catch {
    throw new HttpsError("invalid-argument", "Invalid ID document data.");
  }

  if (!buffer.length) {
    throw new HttpsError("invalid-argument", "ID document is empty.");
  }
  if (buffer.length > PRE_ARRIVAL_ID_MAX_BYTES) {
    throw new HttpsError("invalid-argument", "ID document is too large (max 5 MB).");
  }

  return { buffer, contentType };
}

function parseOptionalIsoDate(value, label, options = {}) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new HttpsError("invalid-argument", `${label} must be YYYY-MM-DD.`);
  }
  const date = new Date(`${trimmed}T12:00:00`);
  if (Number.isNaN(date.getTime())) {
    throw new HttpsError("invalid-argument", `${label} is not valid.`);
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const time = date.getTime();
  if (options.allowFuture === false && time > today.getTime()) {
    throw new HttpsError("invalid-argument", `${label} cannot be in the future.`);
  }
  if (options.allowPast === false && time < today.getTime()) {
    throw new HttpsError("invalid-argument", `${label} cannot be in the past.`);
  }
  return trimmed;
}

function parseIdDetailsInput(data) {
  const documentType = String(data.idDocumentType || "").trim();
  const documentNumber = String(data.idDocumentNumber || "").trim();
  const issuingCountry = String(data.idIssuingCountry || "").trim();
  const issueDate = parseOptionalIsoDate(data.idIssueDate, "Issue date", {
    allowFuture: false,
  });
  const expiryDate = parseOptionalIsoDate(data.idExpiryDate, "Expiry date", {
    allowPast: false,
  });

  if (!documentType && !documentNumber && !issuingCountry && !issueDate && !expiryDate) {
    return null;
  }

  if (!ALLOWED_ID_DOCUMENT_TYPES.has(documentType)) {
    throw new HttpsError("invalid-argument", "Please choose a valid ID document type.");
  }
  if (documentNumber.length < 3) {
    throw new HttpsError("invalid-argument", "Please enter your ID document number.");
  }
  if (documentNumber.length > 40) {
    throw new HttpsError("invalid-argument", "ID document number is too long.");
  }
  if (issuingCountry.length < 2) {
    throw new HttpsError("invalid-argument", "Please enter the country that issued your ID.");
  }
  if (issuingCountry.length > 80) {
    throw new HttpsError("invalid-argument", "Issuing country name is too long.");
  }
  if (issueDate && expiryDate && issueDate >= expiryDate) {
    throw new HttpsError("invalid-argument", "Expiry date must be after the issue date.");
  }

  return {
    documentType,
    documentNumber,
    issuingCountry,
    ...(issueDate ? { issueDate } : {}),
    ...(expiryDate ? { expiryDate } : {}),
  };
}

async function resolveIdentityForSubmission(data, options) {
  const upload = parseIdDocumentUpload(data);
  const manual = parseIdDetailsInput(data);

  if (upload && manual) {
    throw new HttpsError(
      "invalid-argument",
      "Provide either an ID upload or ID details, not both."
    );
  }

  let idDocument = options.existingIdDocument;
  let idDetails = options.existingIdDetails;

  if (upload) {
    idDocument = await resolveIdDocumentForSubmission(data, options);
    idDetails = undefined;
    if (options.existingIdDocument?.storagePath) {
      await deleteStorageObjectIfExists(options.existingIdDocument.storagePath);
    }
    return { idDocument, idDetails };
  }

  if (manual) {
    idDetails = {
      ...manual,
      recordedAt: new Date().toISOString(),
    };
    idDocument = undefined;
    if (options.existingIdDocument?.storagePath) {
      await deleteStorageObjectIfExists(options.existingIdDocument.storagePath);
    }
    return { idDocument, idDetails };
  }

  if (!idDocument && !idDetails) {
    throw new HttpsError(
      "invalid-argument",
      "Please upload an ID document or enter your ID details."
    );
  }

  return { idDocument, idDetails };
}

function guestIdDocumentStoragePath(propertyId, typeId, bookingId) {
  return `guestIdDocuments/${propertyId}/${typeId}/${bookingId}/${crypto.randomUUID()}.enc`;
}

async function deleteStorageObjectIfExists(storagePath) {
  if (!storagePath) return;
  try {
    const bucket = admin.storage().bucket();
    await bucket.file(storagePath).delete({ ignoreNotFound: true });
  } catch {
    /* ignore cleanup errors */
  }
}

async function storeEncryptedIdDocument(plainBuffer, contentType, storagePath, encryptionKeyRaw) {
  const { encrypted, keyVersion } = encryptBuffer(plainBuffer, encryptionKeyRaw);
  const bucket = admin.storage().bucket();
  await bucket.file(storagePath).save(encrypted, {
    metadata: {
      contentType: "application/octet-stream",
      metadata: {
        vailoEncrypted: "true",
        vailoOriginalContentType: contentType,
        vailoKeyVersion: keyVersion,
      },
    },
  });
  return keyVersion;
}

async function resolveIdDocumentForSubmission(data, options) {
  const upload = parseIdDocumentUpload(data);
  if (!upload) {
    return options.existingIdDocument || undefined;
  }

  if (options.previewMode) {
    return {
      uploadedAt: new Date().toISOString(),
      storagePath: `preview/${options.bookingId || "guest"}/id-document.enc`,
      contentType: upload.contentType,
      sizeBytes: upload.buffer.length,
      encryptionKeyVersion: ID_DOCUMENT_KEY_VERSION,
    };
  }

  const encryptionKey =
    idDocEncryptionKey.value() || process.env.GUEST_ID_DOCUMENT_ENCRYPTION_KEY;
  if (!encryptionKey) {
    throw new HttpsError(
      "failed-precondition",
      "ID document upload is not configured on the server."
    );
  }

  const storagePath = guestIdDocumentStoragePath(
    options.propertyId,
    options.typeId,
    options.bookingId
  );
  const keyVersion = await storeEncryptedIdDocument(
    upload.buffer,
    upload.contentType,
    storagePath,
    encryptionKey
  );

  if (options.existingIdDocument?.storagePath) {
    await deleteStorageObjectIfExists(options.existingIdDocument.storagePath);
  }

  return {
    uploadedAt: new Date().toISOString(),
    storagePath,
    contentType: upload.contentType,
    sizeBytes: upload.buffer.length,
    encryptionKeyVersion: keyVersion,
  };
}

function registerGuestPreArrival({ firestore, firebaseExports }) {
  if (!firebaseExports) {
    throw new Error("registerGuestPreArrival requires firebaseExports");
  }

  firebaseExports.submitPreArrivalCheckIn = onCall(
    {
      region: "us-central1",
      enforceAppCheck: false,
      secrets: [idDocEncryptionKey],
    },
    async (request) => {
      try {
      const data = request.data || {};
      const propertyId = String(data.propertyId || "").trim();
      const typeId = String(data.typeId || "").trim();
      const sessionId = String(data.sessionId || "").trim();

      if (!propertyId || !typeId || !sessionId) {
        throw new HttpsError("invalid-argument", "Missing pre-arrival parameters.");
      }

      let input;
      try {
        input = validateSubmissionInput(data);
      } catch (err) {
        if (err instanceof CheckInValidationError) {
          throw new HttpsError(err.code || "invalid-argument", err.message);
        }
        throw err;
      }
      const { session, previewMode, booking } = await requireGuestSession(
        firestore,
        propertyId,
        typeId,
        sessionId
      );

      const propSnap = await firestore.collection("properties").doc(propertyId).get();
      const property = propSnap.exists ? propSnap.data() : {};
      if (!previewMode && !isPreArrivalCheckInEnabled(property)) {
        throw new HttpsError(
          "failed-precondition",
          "Online check-in is not enabled for this property."
        );
      }
      const transferFields = resolveTransferFields(data, property);

      const bookingId = session.bookingId;

      let existingIdDocument;
      let existingIdDetails;
      if (!previewMode && bookingId) {
        const typeSnap = await firestore
          .collection("properties")
          .doc(propertyId)
          .collection("propertyTypes")
          .doc(typeId)
          .get();
        const bookings = typeSnap.exists ? typeSnap.data().syncedBookings || [] : [];
        const target = bookings.find((b) => matchesBooking(b, bookingId));
        existingIdDocument = target?.preArrivalSubmission?.idDocument;
        existingIdDetails = target?.preArrivalSubmission?.idDetails;
      }

      const { idDocument, idDetails } = await resolveIdentityForSubmission(data, {
        previewMode,
        propertyId,
        typeId,
        bookingId: bookingId || "preview",
        existingIdDocument,
        existingIdDetails,
      });

      const now = new Date().toISOString();
      const submission = buildPreArrivalSubmissionRecord(input, {
        submittedAt: now,
        acceptedHouseRulesAt: now,
        idDocument,
        idDetails,
        transferRequested: transferFields.transferRequested === true,
        transferOffer: transferFields.transferOffer,
      });

      if (previewMode) {
        return {
          previewMode: true,
          preArrivalComplete: true,
          preArrivalSubmittedAt: now,
          submission,
        };
      }

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
      const target = bookings.find((b) => matchesBooking(b, bookingId));
      if (!target) {
        throw new HttpsError("not-found", "Booking not found.");
      }

      const guestName = `${input.guestFirstName} ${input.guestLastName}`.trim();

      const updated = patchBookingInList(
        bookings,
        bookingId,
        buildCompletedCheckInBookingPatch(input, submission, now)
      );

      await persistBookings(typeRef, updated);

      await firestore
        .collection("properties")
        .doc(propertyId)
        .collection("guestPortalSessions")
        .doc(session.sessionId || sessionId)
        .set({ preArrivalComplete: true, guestName: guestName || session.guestName || null }, { merge: true });

      await upsertGuestProfileFromPreArrival(firestore, {
        propertyId,
        typeId,
        unitName: typeSnap.data()?.propertyTypeName || "",
        booking: {
          ...target,
          guestName,
          guestPhone: input.contactPhone,
          guestWhatsapp: input.contactPhone,
          guestLocale: input.guestLocale,
          guestDetailsComplete: true,
          ...(input.contactEmail ? { guestEmail: input.contactEmail } : {}),
          ...(input.guestCountry ? { guestCountry: input.guestCountry } : {}),
        },
        submission,
      });

      return {
        preArrivalComplete: true,
        preArrivalSubmittedAt: now,
        submission,
        bookingId,
        guestName: target.guestName || booking?.guestName || session.guestName || null,
      };
      } catch (error) {
        if (error instanceof HttpsError) throw error;
        console.error("submitPreArrivalCheckIn failed:", error);
        throw new HttpsError(
          "internal",
          error?.message || "Could not save your check-in. Please try again."
        );
      }
    }
  );

  firebaseExports.getPreArrivalIdDocumentForAdmin = onCall(
    {
      region: "us-central1",
      enforceAppCheck: false,
      secrets: [idDocEncryptionKey],
    },
    async (request) => {
      const data = request.data || {};
      const propertyId = String(data.propertyId || "").trim();
      const typeId = String(data.typeId || "").trim();
      const bookingId = String(data.bookingId || "").trim();

      if (!propertyId || !typeId || !bookingId) {
        throw new HttpsError("invalid-argument", "Missing booking reference.");
      }

      await requirePropertyGuestInviteAccess(request, firestore, propertyId);

      const booking = await getBookingById(firestore, propertyId, typeId, bookingId);
      if (!booking) {
        throw new HttpsError("not-found", "Booking not found.");
      }

      const idDocument = booking.preArrivalSubmission?.idDocument;
      const storagePath = String(idDocument?.storagePath || "").trim();
      if (!storagePath || storagePath.startsWith("preview/")) {
        throw new HttpsError("not-found", "No ID document on file for this reservation.");
      }

      const encryptionKey =
        idDocEncryptionKey.value() || process.env.GUEST_ID_DOCUMENT_ENCRYPTION_KEY;
      if (!encryptionKey) {
        throw new HttpsError(
          "failed-precondition",
          "ID document decryption is not configured on the server."
        );
      }

      const bucket = admin.storage().bucket();
      const file = bucket.file(storagePath);
      const [exists] = await file.exists();
      if (!exists) {
        throw new HttpsError("not-found", "ID document file not found.");
      }

      const [encryptedBuffer] = await file.download();
      const plain = decryptBuffer(Buffer.from(encryptedBuffer), encryptionKey);
      const contentType =
        idDocument.contentType ||
        file.metadata?.metadata?.vailoOriginalContentType ||
        "application/octet-stream";

      const ext =
        contentType === "application/pdf"
          ? "pdf"
          : contentType === "image/png"
            ? "png"
            : contentType === "image/webp"
              ? "webp"
              : "jpg";

      return {
        contentBase64: plain.toString("base64"),
        contentType,
        filename: `guest-id-${bookingId.slice(0, 8)}.${ext}`,
        uploadedAt: idDocument.uploadedAt || null,
        sizeBytes: plain.length,
      };
    }
  );

  firebaseExports.removePreArrivalCheckInForAdmin = onCall(
    {
      region: "us-central1",
      enforceAppCheck: false,
    },
    async (request) => {
      const data = request.data || {};
      const propertyId = String(data.propertyId || "").trim();
      const typeId = String(data.typeId || "").trim();
      const bookingId = String(data.bookingId || "").trim();

      if (!propertyId || !typeId || !bookingId) {
        throw new HttpsError("invalid-argument", "Missing booking reference.");
      }

      await requirePropertyGuestInviteAccess(request, firestore, propertyId);

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
      const target = bookings.find((b) => matchesBooking(b, bookingId));
      if (!target) {
        throw new HttpsError("not-found", "Booking not found.");
      }

      if (
        !target.preArrivalComplete &&
        !target.preArrivalSubmittedAt &&
        !target.preArrivalSubmission
      ) {
        throw new HttpsError("failed-precondition", "This booking has no check-in to remove.");
      }

      const storagePath = target.preArrivalSubmission?.idDocument?.storagePath;
      if (storagePath) {
        try {
          await deleteStoredIdDocument(storagePath);
        } catch (err) {
          console.error("removePreArrivalCheckInForAdmin: storage delete failed", {
            propertyId,
            typeId,
            bookingId,
            storagePath,
            error: err?.message || String(err),
          });
          throw new HttpsError(
            "internal",
            "Could not delete the stored ID document. Try again or contact support."
          );
        }
      }

      const clearedBooking = buildBookingAfterPreArrivalRemoval(target);
      const updated = bookings.map((b) =>
        matchesBooking(b, bookingId) ? clearedBooking : b
      );

      await persistBookings(typeRef, updated);

      return {
        removed: true,
        bookingId,
      };
    }
  );

  /**
   * Guest restarts check-in from the beginning (wrong dates).
   * Removes guest-created Online check-in bookings from admin, or clears
   * pre-arrival fields on calendar-synced reservations, then ends the session.
   */
  firebaseExports.resetGuestPreArrivalCheckIn = onCall(
    {
      region: "us-central1",
      enforceAppCheck: false,
    },
    async (request) => {
      const data = request.data || {};
      const propertyId = String(data.propertyId || "").trim();
      const typeId = String(data.typeId || "").trim();
      const sessionId = String(data.sessionId || "").trim();

      if (!propertyId || !typeId || !sessionId) {
        throw new HttpsError("invalid-argument", "Missing session parameters.");
      }

      const { session, previewMode, booking } = await requireGuestSession(
        firestore,
        propertyId,
        typeId,
        sessionId
      );

      if (previewMode) {
        return { reset: true, previewMode: true, bookingRemoved: false };
      }

      const bookingId = session.bookingId;
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
      const target = bookings.find((b) => matchesBooking(b, bookingId)) || booking;
      if (!target) {
        throw new HttpsError("not-found", "Booking not found.");
      }

      const storagePath = target.preArrivalSubmission?.idDocument?.storagePath;
      if (storagePath) {
        try {
          await deleteStoredIdDocument(storagePath);
        } catch (err) {
          console.error("resetGuestPreArrivalCheckIn: storage delete failed", {
            propertyId,
            typeId,
            bookingId,
            storagePath,
            error: err?.message || String(err),
          });
          throw new HttpsError(
            "internal",
            "Could not clear your previous check-in. Please try again."
          );
        }
      }

      const action = resolveWrongDatesResetAction(target);
      const updated = applyWrongDatesResetToBookings(bookings, bookingId, action);

      if (updated !== bookings) {
        await persistBookings(typeRef, updated);
      }

      await firestore
        .collection("properties")
        .doc(propertyId)
        .collection("guestPortalSessions")
        .doc(session.sessionId || sessionId)
        .delete();

      return {
        reset: true,
        bookingRemoved: action === "remove_booking",
        bookingId,
      };
    }
  );
}

module.exports = { registerGuestPreArrival, idDocEncryptionKey };
