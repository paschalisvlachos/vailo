import { useEffect, useState } from 'react';
import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { isBookingGuestDetailsComplete, type SyncedBooking } from '../lib/syncedBooking';
import { MAGIC_FILL_UNIT_COST } from './usePlatformUsage';

export type AreaBreakdown = { area: string; count: number };

export type UsageMonth = { month: string; label: string; magicFill: number };

export type DashboardStats = {
  propertyCount: number;
  listingCount: number;
  ownerCount: number;
  activeOwnerCount: number;
  hotelCount: number;
  villaCount: number;
  areaBreakdown: AreaBreakdown[];
  discoveredNew: number;
  discoveredReviewed: number;
  unseenGuestIssues: number;
  openGuestIssues: number;
  guestsInStay: number;
  upcomingGuests: number;
  totalHouseGuests: number;
  magicFill: number;
  magicFillEstimatedCost: number;
  usageHistory: UsageMonth[];
};

const EMPTY: DashboardStats = {
  propertyCount: 0,
  listingCount: 0,
  ownerCount: 0,
  activeOwnerCount: 0,
  hotelCount: 0,
  villaCount: 0,
  areaBreakdown: [],
  discoveredNew: 0,
  discoveredReviewed: 0,
  unseenGuestIssues: 0,
  openGuestIssues: 0,
  guestsInStay: 0,
  upcomingGuests: 0,
  totalHouseGuests: 0,
  magicFill: 0,
  magicFillEstimatedCost: 0,
  usageHistory: [],
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(iso: string, days: number) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function countGuestBookings(bookings: SyncedBooking[] | undefined) {
  const today = todayIso();
  const horizon = addDaysIso(today, 30);
  let inStay = 0;
  let upcoming = 0;
  let total = 0;

  for (const booking of bookings || []) {
    if (!isBookingGuestDetailsComplete(booking)) continue;
    if (!booking.start || !booking.end) continue;
    total += 1;
    if (booking.start <= today && booking.end >= today) inStay += 1;
    else if (booking.start > today && booking.start <= horizon) upcoming += 1;
  }

  return { inStay, upcoming, total };
}

function monthKeys(count: number) {
  const keys: string[] = [];
  const now = new Date();
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(d.toISOString().slice(0, 7));
  }
  return keys;
}

function monthLabel(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('en-US', {
    month: 'short',
    year: '2-digit',
  });
}

/** Platform-wide stats for the admin dashboard. */
export function useDashboardStats() {
  const [stats, setStats] = useState<DashboardStats>(EMPTY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let propertyCount = 0;
    let hotelCount = 0;
    let villaCount = 0;
    const areaCounts = new Map<string, number>();

    let listingCount = 0;
    let guestsInStay = 0;
    let upcomingGuests = 0;
    let totalHouseGuests = 0;

    let ownerCount = 0;
    let activeOwnerCount = 0;

    let discoveredNew = 0;
    let discoveredReviewed = 0;

    let unseenGuestIssues = 0;
    let openGuestIssues = 0;

    let magicFill = 0;

    const recompute = () => {
      const areaBreakdown = [...areaCounts.entries()]
        .map(([area, count]) => ({ area, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8);

      setStats((prev) => ({
        ...prev,
        propertyCount,
        listingCount,
        ownerCount,
        activeOwnerCount,
        hotelCount,
        villaCount,
        areaBreakdown,
        discoveredNew,
        discoveredReviewed,
        unseenGuestIssues,
        openGuestIssues,
        guestsInStay,
        upcomingGuests,
        totalHouseGuests,
        magicFill,
        magicFillEstimatedCost: magicFill * MAGIC_FILL_UNIT_COST,
      }));
      setLoading(false);
    };

    const unsubProperties = onSnapshot(collection(db, 'properties'), (snap) => {
      propertyCount = snap.size;
      hotelCount = 0;
      villaCount = 0;
      areaCounts.clear();

      snap.docs.forEach((d) => {
        const data = d.data();
        if (data.listingKind === 'hotel') hotelCount += 1;
        else villaCount += 1;

        const area = [data.area || data.city, data.country].filter(Boolean).join(', ');
        if (area) areaCounts.set(area, (areaCounts.get(area) || 0) + 1);
      });

      recompute();
    });

    const unsubTypes = onSnapshot(collectionGroup(db, 'propertyTypes'), (snap) => {
      listingCount = snap.size;
      guestsInStay = 0;
      upcomingGuests = 0;
      totalHouseGuests = 0;

      snap.docs.forEach((d) => {
        const counts = countGuestBookings(d.data().syncedBookings as SyncedBooking[] | undefined);
        guestsInStay += counts.inStay;
        upcomingGuests += counts.upcoming;
        totalHouseGuests += counts.total;
      });

      recompute();
    });

    const unsubOwners = onSnapshot(collection(db, 'owners'), (snap) => {
      ownerCount = snap.size;
      activeOwnerCount = snap.docs.filter(
        (d) => String(d.data().status || '').toLowerCase() === 'active'
      ).length;
      recompute();
    });

    const unsubDiscovered = onSnapshot(collectionGroup(db, 'discoveredPlaces'), (snap) => {
      discoveredNew = 0;
      discoveredReviewed = 0;
      snap.docs.forEach((d) => {
        const status = String(d.data().reviewStatus || '');
        if (status === 'new') discoveredNew += 1;
        else if (status === 'reviewed') discoveredReviewed += 1;
      });
      recompute();
    });

    const unsubIssues = onSnapshot(collectionGroup(db, 'guestIssues'), (snap) => {
      unseenGuestIssues = 0;
      openGuestIssues = 0;
      snap.docs.forEach((d) => {
        const data = d.data();
        if (!data.seenByHost) unseenGuestIssues += 1;
        if (!data.resolved) openGuestIssues += 1;
      });
      recompute();
    });

    const monthKey = new Date().toISOString().slice(0, 7);
    const unsubUsage = onSnapshot(doc(db, 'platformUsage', monthKey), (snap) => {
      magicFill = typeof snap.data()?.magicFill === 'number' ? snap.data()!.magicFill : 0;
      recompute();
    });

    const keys = monthKeys(6);
    void (async () => {
      const usageHistory: UsageMonth[] = [];
      for (const key of keys) {
        const snap = await getDoc(doc(db, 'platformUsage', key));
        const fill = typeof snap.data()?.magicFill === 'number' ? snap.data()!.magicFill : 0;
        usageHistory.push({ month: key, label: monthLabel(key), magicFill: fill });
      }
      setStats((prev) => ({ ...prev, usageHistory }));
    })();

    return () => {
      unsubProperties();
      unsubTypes();
      unsubOwners();
      unsubDiscovered();
      unsubIssues();
      unsubUsage();
    };
  }, []);

  return { stats, loading };
}
