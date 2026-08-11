const admin = require("firebase-admin");
const { onSchedule } = require("firebase-functions/v2/scheduler");

const PRE_ARRIVAL_RETENTION_DAYS = 7;

function utcDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function addDaysToIsoDate(isoDate, days) {
  const parts = String(isoDate || "")
    .split("-")
    .map(Number);
  if (parts.length < 3) return null;
  const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function bookingEndIso(booking) {
  const end = String(booking?.end || "").trim();
  if (!end) return null;
  return end.split("T")[0];
}

function hasPreArrivalData(booking) {
  return Boolean(
    booking?.preArrivalComplete ||
      booking?.preArrivalSubmittedAt ||
      booking?.preArrivalSubmission
  );
}

function isPreArrivalPurgeDue(booking, todayKey, retentionDays = PRE_ARRIVAL_RETENTION_DAYS) {
  const endIso = bookingEndIso(booking);
  if (!endIso) return false;
  const purgeOnOrAfterKey = addDaysToIsoDate(endIso, retentionDays);
  if (!purgeOnOrAfterKey) return false;
  return purgeOnOrAfterKey <= todayKey;
}

function stripPreArrivalFields(booking) {
  const {
    preArrivalComplete: _complete,
    preArrivalSubmittedAt: _submittedAt,
    preArrivalSubmission: _submission,
    ...rest
  } = booking;
  return rest;
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
            const shouldPurge =
              hasPreArrivalData(booking) && isPreArrivalPurgeDue(booking, todayKey);

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

            updatedBookings.push(stripPreArrivalFields(booking));
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
  stripPreArrivalFields,
};
