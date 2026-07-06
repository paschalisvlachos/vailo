import { doc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import {
  filterSyncedBookingsOutsideDateRange,
  type SyncedBooking,
} from './syncedBooking';

type PropertyTypeWithBookings = {
  id: string;
  syncedBookings?: SyncedBooking[];
};

/** Deletes all synced bookings overlapping [rangeStart, rangeEnd] for the given units. */
export async function resetPropertyBookingsInDateRange(
  propertyId: string,
  propertyTypes: PropertyTypeWithBookings[],
  typeIds: string[],
  rangeStart: string,
  rangeEnd: string
): Promise<number> {
  let removedTotal = 0;
  const writes: Promise<void>[] = [];

  for (const typeId of typeIds) {
    const type = propertyTypes.find((t) => t.id === typeId);
    if (!type) continue;

    const bookings = type.syncedBookings || [];
    const kept = filterSyncedBookingsOutsideDateRange(bookings, rangeStart, rangeEnd);
    const removed = bookings.length - kept.length;
    if (removed === 0) continue;

    removedTotal += removed;
    writes.push(
      setDoc(
        doc(db, 'properties', propertyId, 'propertyTypes', typeId),
        { syncedBookings: kept },
        { merge: true }
      )
    );
  }

  await Promise.all(writes);
  return removedTotal;
}
