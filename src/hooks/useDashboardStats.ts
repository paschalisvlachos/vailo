import { useEffect, useState } from 'react';
import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  getBookingInvitationStatus,
  isBookingGuestDetailsComplete,
  type SyncedBooking,
} from '../lib/syncedBooking';
import { EXCURSION_PROVIDER_COLLECTION } from '../lib/excursionProvider';
import { MAGIC_FILL_UNIT_COST } from './usePlatformUsage';

export type AreaBreakdown = { area: string; count: number };

export type UsageMonth = { month: string; label: string; magicFill: number };

export type DashboardStats = {
  propertyCount: number;
  listingCount: number;
  ownerCount: number;
  activeOwnerCount: number;
  agentCount: number;
  propertyOwnerCount: number;
  excursionProviderUserCount: number;
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
  invitesReady: number;
  invitesWaiting: number;
  invitesOpened: number;
  portalActiveGuests7d: number;
  portalActiveAnonymous7d: number;
  portalEngagedGuests: number;
  portalSessionsTotal: number;
  assistantTurnsTotal: number;
  liveLikeLocalOpensTotal: number;
  aiExpertTurnsTotal: number;
  excursionProviderCount: number;
  excursionProvidersActive: number;
  excursionCount: number;
  magicFill: number;
  magicFillEstimatedCost: number;
  usageHistory: UsageMonth[];
  excursionProvidersByStatus: { status: string; count: number }[];
  ownersByRole: { role: string; count: number }[];
};

const EMPTY: DashboardStats = {
  propertyCount: 0,
  listingCount: 0,
  ownerCount: 0,
  activeOwnerCount: 0,
  agentCount: 0,
  propertyOwnerCount: 0,
  excursionProviderUserCount: 0,
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
  invitesReady: 0,
  invitesWaiting: 0,
  invitesOpened: 0,
  portalActiveGuests7d: 0,
  portalActiveAnonymous7d: 0,
  portalEngagedGuests: 0,
  portalSessionsTotal: 0,
  assistantTurnsTotal: 0,
  liveLikeLocalOpensTotal: 0,
  aiExpertTurnsTotal: 0,
  excursionProviderCount: 0,
  excursionProvidersActive: 0,
  excursionCount: 0,
  magicFill: 0,
  magicFillEstimatedCost: 0,
  usageHistory: [],
  excursionProvidersByStatus: [],
  ownersByRole: [],
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(iso: string, days: number) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function isWithinLastDays(iso: string | undefined, days: number) {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t <= days * 24 * 60 * 60 * 1000;
}

function sumAnalyticsField(data: Record<string, unknown>, field: string) {
  return Number(data[field] || 0);
}

function countGuestBookings(bookings: SyncedBooking[] | undefined) {
  const today = todayIso();
  const horizon = addDaysIso(today, 30);
  let inStay = 0;
  let upcoming = 0;
  let total = 0;
  let invitesReady = 0;
  let invitesWaiting = 0;
  let invitesOpened = 0;

  for (const booking of bookings || []) {
    if (!isBookingGuestDetailsComplete(booking)) continue;
    if (!booking.start || !booking.end) continue;
    total += 1;
    if (booking.start <= today && booking.end >= today) inStay += 1;
    else if (booking.start > today && booking.start <= horizon) upcoming += 1;

    const invitation = getBookingInvitationStatus(booking);
    if (invitation === 'ready_for_reservations') invitesReady += 1;
    else if (invitation === 'invited') {
      if (booking.inviteStatus === 'opened') invitesOpened += 1;
      else invitesWaiting += 1;
    }
  }

  return { inStay, upcoming, total, invitesReady, invitesWaiting, invitesOpened };
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
    let invitesReady = 0;
    let invitesWaiting = 0;
    let invitesOpened = 0;

    let ownerCount = 0;
    let activeOwnerCount = 0;
    let agentCount = 0;
    let propertyOwnerCount = 0;
    let excursionProviderUserCount = 0;
    const ownersByRoleMap = new Map<string, number>();

    let discoveredNew = 0;
    let discoveredReviewed = 0;

    let unseenGuestIssues = 0;
    let openGuestIssues = 0;

    let magicFill = 0;

    let portalActiveGuests7d = 0;
    let portalEngagedGuests = 0;
    let portalSessionsTotal = 0;
    let assistantTurnsTotal = 0;
    let liveLikeLocalOpensTotal = 0;
    let aiExpertTurnsTotal = 0;

    let portalActiveAnonymous7d = 0;

    let excursionProviderCount = 0;
    let excursionProvidersActive = 0;
    const providerStatusCounts = new Map<string, number>();

    let excursionCount = 0;

    const recompute = () => {
      const areaBreakdown = [...areaCounts.entries()]
        .map(([area, count]) => ({ area, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8);

      const excursionProvidersByStatus = [...providerStatusCounts.entries()]
        .map(([status, count]) => ({
          status: status.charAt(0).toUpperCase() + status.slice(1),
          count,
        }))
        .sort((a, b) => b.count - a.count);

      const ownersByRole = [...ownersByRoleMap.entries()]
        .map(([role, count]) => ({
          role:
            role === 'excursion_provider'
              ? 'Excursion providers'
              : role === 'admin'
                ? 'Admins'
                : role === 'agent'
                  ? 'Agents'
                  : 'Property owners',
          count,
        }))
        .sort((a, b) => b.count - a.count);

      setStats((prev) => ({
        ...prev,
        propertyCount,
        listingCount,
        ownerCount,
        activeOwnerCount,
        agentCount,
        propertyOwnerCount,
        excursionProviderUserCount,
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
        invitesReady,
        invitesWaiting,
        invitesOpened,
        portalActiveGuests7d,
        portalActiveAnonymous7d,
        portalEngagedGuests,
        portalSessionsTotal,
        assistantTurnsTotal,
        liveLikeLocalOpensTotal,
        aiExpertTurnsTotal,
        excursionProviderCount,
        excursionProvidersActive,
        excursionCount,
        magicFill,
        magicFillEstimatedCost: magicFill * MAGIC_FILL_UNIT_COST,
        excursionProvidersByStatus,
        ownersByRole,
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
      invitesReady = 0;
      invitesWaiting = 0;
      invitesOpened = 0;

      snap.docs.forEach((d) => {
        const counts = countGuestBookings(d.data().syncedBookings as SyncedBooking[] | undefined);
        guestsInStay += counts.inStay;
        upcomingGuests += counts.upcoming;
        totalHouseGuests += counts.total;
        invitesReady += counts.invitesReady;
        invitesWaiting += counts.invitesWaiting;
        invitesOpened += counts.invitesOpened;
      });

      recompute();
    });

    const unsubOwners = onSnapshot(collection(db, 'owners'), (snap) => {
      ownerCount = snap.size;
      activeOwnerCount = 0;
      agentCount = 0;
      propertyOwnerCount = 0;
      excursionProviderUserCount = 0;
      ownersByRoleMap.clear();

      snap.docs.forEach((d) => {
        const data = d.data();
        if (String(data.status || '').toLowerCase() === 'active') activeOwnerCount += 1;
        const role = String(data.role || 'owner');
        ownersByRoleMap.set(role, (ownersByRoleMap.get(role) || 0) + 1);
        if (role === 'agent') agentCount += 1;
        else if (role === 'owner') propertyOwnerCount += 1;
        else if (role === 'excursion_provider') excursionProviderUserCount += 1;
      });

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

    const unsubStayAnalytics = onSnapshot(collectionGroup(db, 'guestStayAnalytics'), (snap) => {
      portalActiveGuests7d = 0;
      portalEngagedGuests = 0;
      portalSessionsTotal = 0;
      assistantTurnsTotal = 0;
      liveLikeLocalOpensTotal = 0;
      aiExpertTurnsTotal = 0;

      snap.docs.forEach((d) => {
        const data = d.data();
        const lastSeenAt = String(data.lastSeenAt || '');
        const sessions = sumAnalyticsField(data, 'portalSessions');
        const engaged =
          sessions > 0 ||
          sumAnalyticsField(data, 'assistantTurns') > 0 ||
          sumAnalyticsField(data, 'aiExpertTurns') > 0 ||
          sumAnalyticsField(data, 'liveLikeLocalOpens') > 0;

        if (engaged) portalEngagedGuests += 1;
        if (isWithinLastDays(lastSeenAt, 7)) portalActiveGuests7d += 1;

        portalSessionsTotal += sessions;
        assistantTurnsTotal += sumAnalyticsField(data, 'assistantTurns');
        liveLikeLocalOpensTotal += sumAnalyticsField(data, 'liveLikeLocalOpens');
        aiExpertTurnsTotal += sumAnalyticsField(data, 'aiExpertTurns');
      });

      recompute();
    });

    const unsubAnonAnalytics = onSnapshot(collectionGroup(db, 'guestAnonymousAnalytics'), (snap) => {
      portalActiveAnonymous7d = 0;

      snap.docs.forEach((d) => {
        const data = d.data();
        if (isWithinLastDays(String(data.lastSeenAt || ''), 7)) {
          portalActiveAnonymous7d += 1;
        }
        portalSessionsTotal += sumAnalyticsField(data, 'portalSessions');
        assistantTurnsTotal += sumAnalyticsField(data, 'assistantTurns');
        liveLikeLocalOpensTotal += sumAnalyticsField(data, 'liveLikeLocalOpens');
        aiExpertTurnsTotal += sumAnalyticsField(data, 'aiExpertTurns');
      });

      recompute();
    });

    const unsubProviders = onSnapshot(collection(db, EXCURSION_PROVIDER_COLLECTION), (snap) => {
      excursionProviderCount = snap.size;
      excursionProvidersActive = 0;
      providerStatusCounts.clear();

      snap.docs.forEach((d) => {
        const status = String(d.data().status || 'draft');
        providerStatusCounts.set(status, (providerStatusCounts.get(status) || 0) + 1);
        if (status === 'active') excursionProvidersActive += 1;
      });

      recompute();
    });

    const unsubExcursions = onSnapshot(collectionGroup(db, 'excursions'), (snap) => {
      excursionCount = snap.size;
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
      unsubStayAnalytics();
      unsubAnonAnalytics();
      unsubProviders();
      unsubExcursions();
      unsubUsage();
    };
  }, []);

  return { stats, loading };
};
