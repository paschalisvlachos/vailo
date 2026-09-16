const admin = require("firebase-admin");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const {
  PRE_ARRIVAL_RETENTION_DAYS,
  hasRetainedIdDocumentData,
  isPreArrivalPurgeDue,
  stripIdDocumentFromBooking,
  stripPreArrivalFields,
  hasPreArrivalData,
} = require("./guestPreArrivalRules");

function utcDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

async function deleteStoredIdDocument(storagePath, logger, context) {
  const path = String(storagePath || "").trim();
  if (!path || path.startsWith("preview/")) {
    return { deleted: false, skipped: true };
  }

  try {
    const bucket = admin.storage().bucket();
    const file = bucket.file(path);
    const [exists] = await file.exists();
    if (!exists) {
      return { deleted: false, missing: true };
    }
    await file.delete();
    return { deleted: true };
  } catch (err) {
    logger.error("preArrivalPurge: storage delete failed", {
      ...context,
      storagePath: path,
      error: err?.message || String(err),
    });
    return { deleted: false, error: err?.message || String(err) };
  }
}

function registerGuestPreArrivalPurge({ firestore, logger, firebaseExports }) {
  if (!firebaseExports) {
    throw new Error("registerGuestPreArrivalPurge requires firebaseExports");
  }

  firebaseExports.purgeExpiredPreArrivalData = onSchedule(
    {
      schedule: "0 3 * * *",
      timeZone: "Europe/Athens",
      region: "us-central1",
    },
    async () => {
      const todayKey = utcDateKey(new Date());
      let purged = 0;
      let skipped = 0;
      let storageDeleted = 0;
      let storageMissing = 0;
      let storageFailed = 0;

      const propertiesSnap = await firestore.collection("properties").get();

      for (const propDoc of propertiesSnap.docs) {
        const typesSnap = await propDoc.ref.collection("propertyTypes").get();

        for (const typeDoc of typesSnap.docs) {
          const typeData = typeDoc.data() || {};
          const bookings = Array.isArray(typeData.syncedBookings)
            ? typeData.syncedBookings
            : [];

          let changed = false;
          const updatedBookings = [];

          for (const booking of bookings) {
            // Retention: remove passport/ID only — keep completed check-in + form answers.
            const shouldPurge =
              hasRetainedIdDocumentData(booking) && isPreArrivalPurgeDue(booking, todayKey);

            if (!shouldPurge) {
              updatedBookings.push(booking);
              skipped += 1;
              continue;
            }

            const storagePath = booking.preArrivalSubmission?.idDocument?.storagePath;
            let canPurgeBooking = true;

            if (storagePath) {
              const storageResult = await deleteStoredIdDocument(storagePath, logger, {
                propertyId: propDoc.id,
                typeId: typeDoc.id,
                bookingId: booking.id,
              });

              if (storageResult.deleted) storageDeleted += 1;
              else if (storageResult.missing) storageMissing += 1;
              else if (storageResult.error) {
                storageFailed += 1;
                canPurgeBooking = false;
              }
            }

            if (!canPurgeBooking) {
              updatedBookings.push(booking);
              continue;
            }

            updatedBookings.push(stripIdDocumentFromBooking(booking));
            changed = true;
            purged += 1;
          }

          if (changed) {
            try {
              await typeDoc.ref.set({ syncedBookings: updatedBookings }, { merge: true });
            } catch (err) {
              logger.error("preArrivalPurge: persist failed", {
                propertyId: propDoc.id,
                typeId: typeDoc.id,
                error: err?.message || String(err),
              });
            }
          }
        }
      }

      logger.info("preArrivalPurge: run complete", {
        todayKey,
        retentionDays: PRE_ARRIVAL_RETENTION_DAYS,
        purged,
        skipped,
        storageDeleted,
        storageMissing,
        storageFailed,
      });
    }
  );
}

module.exports = {
  registerGuestPreArrivalPurge,
  PRE_ARRIVAL_RETENTION_DAYS,
  isPreArrivalPurgeDue,
  hasPreArrivalData,
  hasRetainedIdDocumentData,
  stripPreArrivalFields,
  stripIdDocumentFromBooking,
};
