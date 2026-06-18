import {
  collection,
  doc,
  runTransaction,
  type Firestore,
} from 'firebase/firestore';
import {
  EXCURSION_PROVIDER_COLLECTION,
  EXCURSION_SUBCOLLECTION,
} from './excursionProvider';
import { EXCURSION_AVAILABILITY_SUBCOLLECTION } from './excursionAvailability';
import { EXCURSION_DISCOUNTS_SUBCOLLECTION } from './excursionDiscount';
import {
  EXCURSION_BOOKINGS_SUBCOLLECTION,
  bookingConsumesCapacity,
  sanitizeBookingPayload,
  type ExcursionBooking,
  type ExcursionBookingStatus,
} from './excursionBooking';

function availabilityRef(
  db: Firestore,
  providerId: string,
  excursionId: string,
  dateIso: string
) {
  return doc(
    db,
    EXCURSION_PROVIDER_COLLECTION,
    providerId,
    EXCURSION_SUBCOLLECTION,
    excursionId,
    EXCURSION_AVAILABILITY_SUBCOLLECTION,
    dateIso
  );
}

function discountRef(
  db: Firestore,
  providerId: string,
  excursionId: string,
  discountId: string
) {
  return doc(
    db,
    EXCURSION_PROVIDER_COLLECTION,
    providerId,
    EXCURSION_SUBCOLLECTION,
    excursionId,
    EXCURSION_DISCOUNTS_SUBCOLLECTION,
    discountId
  );
}

function bookingDocRef(
  db: Firestore,
  providerId: string,
  excursionId: string,
  bookingId: string
) {
  return doc(
    db,
    EXCURSION_PROVIDER_COLLECTION,
    providerId,
    EXCURSION_SUBCOLLECTION,
    excursionId,
    EXCURSION_BOOKINGS_SUBCOLLECTION,
    bookingId
  );
}

export async function createExcursionBookingRecord(
  db: Firestore,
  booking: Omit<ExcursionBooking, 'id'>
): Promise<string> {
  const payload = sanitizeBookingPayload({
    ...booking,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  return runTransaction(db, async (transaction) => {
    if (bookingConsumesCapacity(booking.status)) {
      const availRef = availabilityRef(
        db,
        booking.providerId,
        booking.excursionId,
        booking.date
      );
      const availSnap = await transaction.get(availRef);
      if (!availSnap.exists() || availSnap.data().status !== 'open') {
        throw new Error('This date is no longer available.');
      }
      const capacityTotal = Number(availSnap.data().capacityTotal) || 0;
      const capacityBooked = Number(availSnap.data().capacityBooked) || 0;
      const nextBooked = capacityBooked + booking.participantCount;
      if (nextBooked > capacityTotal) {
        throw new Error('Not enough capacity for this booking.');
      }

      transaction.update(availRef, {
        capacityBooked: nextBooked,
        status: nextBooked >= capacityTotal ? 'sold_out' : 'open',
        updatedAt: new Date().toISOString(),
      });

      if (booking.pricing.promoDiscountId) {
        const promoRef = discountRef(
          db,
          booking.providerId,
          booking.excursionId,
          booking.pricing.promoDiscountId
        );
        const promoSnap = await transaction.get(promoRef);
        if (promoSnap.exists()) {
          transaction.update(promoRef, {
            usedCount: (Number(promoSnap.data().usedCount) || 0) + 1,
            updatedAt: new Date().toISOString(),
          });
        }
      }
    }

    const newRef = doc(
      collection(
        db,
        EXCURSION_PROVIDER_COLLECTION,
        booking.providerId,
        EXCURSION_SUBCOLLECTION,
        booking.excursionId,
        EXCURSION_BOOKINGS_SUBCOLLECTION
      )
    );
    transaction.set(newRef, payload);
    return newRef.id;
  });
}

export async function updateExcursionBookingStatus(
  db: Firestore,
  booking: ExcursionBooking,
  nextStatus: ExcursionBookingStatus
): Promise<void> {
  if (!booking.id) throw new Error('Booking id is required.');
  const prevStatus = booking.status;
  if (prevStatus === nextStatus) return;

  const wasConsuming = bookingConsumesCapacity(prevStatus);
  const willConsume = bookingConsumesCapacity(nextStatus);

  await runTransaction(db, async (transaction) => {
    const bRef = bookingDocRef(db, booking.providerId, booking.excursionId, booking.id!);
    const availRef = availabilityRef(
      db,
      booking.providerId,
      booking.excursionId,
      booking.date
    );

    if (!wasConsuming && willConsume) {
      const availSnap = await transaction.get(availRef);
      if (!availSnap.exists() || availSnap.data().status === 'closed') {
        throw new Error('This date is not open for booking.');
      }
      const capacityTotal = Number(availSnap.data().capacityTotal) || 0;
      const capacityBooked = Number(availSnap.data().capacityBooked) || 0;
      const nextBooked = capacityBooked + booking.participantCount;
      if (nextBooked > capacityTotal) {
        throw new Error('Not enough capacity to confirm this booking.');
      }
      transaction.update(availRef, {
        capacityBooked: nextBooked,
        status: nextBooked >= capacityTotal ? 'sold_out' : 'open',
        updatedAt: new Date().toISOString(),
      });

      if (booking.pricing.promoDiscountId) {
        const promoRef = discountRef(
          db,
          booking.providerId,
          booking.excursionId,
          booking.pricing.promoDiscountId
        );
        const promoSnap = await transaction.get(promoRef);
        if (promoSnap.exists()) {
          transaction.update(promoRef, {
            usedCount: (Number(promoSnap.data().usedCount) || 0) + 1,
            updatedAt: new Date().toISOString(),
          });
        }
      }
    }

    if (wasConsuming && !willConsume) {
      const availSnap = await transaction.get(availRef);
      if (availSnap.exists()) {
        const capacityBooked = Number(availSnap.data().capacityBooked) || 0;
        const nextBooked = Math.max(0, capacityBooked - booking.participantCount);
        transaction.update(availRef, {
          capacityBooked: nextBooked,
          status: 'open',
          updatedAt: new Date().toISOString(),
        });
      }

      if (booking.pricing.promoDiscountId) {
        const promoRef = discountRef(
          db,
          booking.providerId,
          booking.excursionId,
          booking.pricing.promoDiscountId
        );
        const promoSnap = await transaction.get(promoRef);
        if (promoSnap.exists()) {
          const usedCount = Number(promoSnap.data().usedCount) || 0;
          transaction.update(promoRef, {
            usedCount: Math.max(0, usedCount - 1),
            updatedAt: new Date().toISOString(),
          });
        }
      }
    }

    const patch: Record<string, unknown> = {
      status: nextStatus,
      updatedAt: new Date().toISOString(),
    };
    if (nextStatus === 'confirmed') {
      patch.confirmedAt = new Date().toISOString();
    }
    if (nextStatus === 'cancelled' || nextStatus === 'declined') {
      patch.cancelledAt = new Date().toISOString();
    }

    transaction.update(bRef, patch);
  });
}
