const { onSchedule } = require("firebase-functions/v2/scheduler");
const { formatBookingDateRange } = require("./guestInviteEmail");
const { deliverPostStayThankYouEmail } = require("./postStayThankYouEmail");
const { resendApiKey } = require("./resendInbox");

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

function isThankYouDueToday(booking, todayKey) {
  const endIso = bookingEndIso(booking);
  if (!endIso) return false;
  const dueKey = addDaysToIsoDate(endIso, 1);
  return dueKey === todayKey;
}

function guestEmailValid(booking) {
  const email = String(booking?.guestEmail || "").trim();
  return email.includes("@");
}

function registerPostStayThankYou({ firestore, logger, firebaseExports }) {
  if (!firebaseExports) {
    throw new Error("registerPostStayThankYou requires firebaseExports");
  }

  firebaseExports.sendPostStayThankYouEmails = onSchedule(
    {
      schedule: "0 8 * * *",
      timeZone: "Europe/Athens",
      secrets: [resendApiKey],
      region: "us-central1",
    },
    async () => {
      const todayKey = utcDateKey(new Date());
      let sent = 0;
      let skipped = 0;
      let failed = 0;

      const propertiesSnap = await firestore.collection("properties").get();

      for (const propDoc of propertiesSnap.docs) {
        const property = propDoc.data() || {};
        const propertyName =
          String(property.propertyName || property.title || "").trim() || "Your stay";

        const typesSnap = await propDoc.ref.collection("propertyTypes").get();

        for (const typeDoc of typesSnap.docs) {
          const typeData = typeDoc.data() || {};
          const unitName = String(typeData.propertyTypeName || "").trim();
          const bookings = Array.isArray(typeData.syncedBookings)
            ? typeData.syncedBookings
            : [];

          let changed = false;
          const updatedBookings = [];

          for (const booking of bookings) {
            const shouldSend =
              isThankYouDueToday(booking, todayKey) &&
              guestEmailValid(booking) &&
              !booking.postStayThankYouSentAt;

            if (!shouldSend) {
              updatedBookings.push(booking);
              continue;
            }

            const payload = {
              guestName: String(booking.guestName || booking.summary || "").trim() || "Guest",
              propertyName,
              unitName,
              stayRangeLabel: formatBookingDateRange(booking.start, booking.end),
              hostLabel: propertyName,
            };

            try {
              const result = await deliverPostStayThankYouEmail(
                resendApiKey.value(),
                booking.guestEmail,
                payload
              );
              updatedBookings.push({
                ...booking,
                postStayThankYouSentAt: new Date().toISOString(),
                postStayThankYouResendId: result?.id || null,
              });
              changed = true;
              sent += 1;
            } catch (err) {
              failed += 1;
              logger.error("postStayThankYou: email failed", {
                propertyId: propDoc.id,
                typeId: typeDoc.id,
                bookingId: booking.id,
                guestEmail: booking.guestEmail,
                error: err?.message || String(err),
              });
              updatedBookings.push(booking);
            }
          }

          if (changed) {
            try {
              await typeDoc.ref.set({ syncedBookings: updatedBookings }, { merge: true });
            } catch (err) {
              logger.error("postStayThankYou: persist failed", {
                propertyId: propDoc.id,
                typeId: typeDoc.id,
                error: err?.message || String(err),
              });
            }
          } else {
            skipped += bookings.length;
          }
        }
      }

      logger.info("postStayThankYou: run complete", { todayKey, sent, failed, skipped });
    }
  );
}

module.exports = { registerPostStayThankYou };
