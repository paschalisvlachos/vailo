import { collection, getDocs, query, where, limit } from 'firebase/firestore';
import { db } from './firebase';
import type {
  GuestAnonymousAnalyticsSummary,
  GuestStayAnalyticsEvent,
  GuestStayAnalyticsSummary,
} from './guestAnalytics';

function deviceFieldsFromDoc(data: Record<string, unknown>) {
  return {
    firstDeviceType: String(data.firstDeviceType || ''),
    firstOsName: String(data.firstOsName || ''),
    firstDeviceLabel: String(data.firstDeviceLabel || ''),
    lastDeviceType: String(data.lastDeviceType || ''),
    lastOsName: String(data.lastOsName || ''),
    lastDeviceLabel: String(data.lastDeviceLabel || ''),
  };
}

export async function fetchGuestStaySummariesForType(
  propertyId: string,
  typeId: string
): Promise<GuestStayAnalyticsSummary[]> {
  const snap = await getDocs(
    collection(db, 'properties', propertyId, 'propertyTypes', typeId, 'guestStayAnalytics')
  );
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      bookingId: d.id,
      typeId,
      propertyId,
      guestName: String(data.guestName || ''),
      guestEmail: String(data.guestEmail || ''),
      stayStart: String(data.stayStart || ''),
      stayEnd: String(data.stayEnd || ''),
      portalSessions: Number(data.portalSessions || 0),
      liveLikeLocalOpens: Number(data.liveLikeLocalOpens || 0),
      assistantTurns: Number(data.assistantTurns || 0),
      aiExpertTurns: Number(data.aiExpertTurns || 0),
      uniqueGemsSeen: Number(data.uniqueGemsSeen || 0),
      uniqueLiveLikeLocalPicksSaved: Number(data.uniqueLiveLikeLocalPicksSaved || 0),
      excursionsOpens: Number(data.excursionsOpens || 0),
      uniqueExcursionsSeen: Number(data.uniqueExcursionsSeen || 0),
      excursionDetailOpens: Number(data.excursionDetailOpens || 0),
      excursionBookingStarts: Number(data.excursionBookingStarts || 0),
      excursionBookingsComplete: Number(data.excursionBookingsComplete || 0),
      accordionOpens: (data.accordionOpens as Record<string, number>) || {},
      gemImpressions: (data.gemImpressions as Record<string, number>) || {},
      excursionImpressions: (data.excursionImpressions as Record<string, number>) || {},
      liveLikeLocalPickSaves: (data.liveLikeLocalPickSaves as Record<string, number>) || {},
      liveLikeLocalPickUnsaves: (data.liveLikeLocalPickUnsaves as Record<string, number>) || {},
      liveLikeLocalPickLikes: (data.liveLikeLocalPickLikes as Record<string, number>) || {},
      liveLikeLocalPickDislikes: (data.liveLikeLocalPickDislikes as Record<string, number>) || {},
      firstSeenAt: String(data.firstSeenAt || ''),
      lastSeenAt: String(data.lastSeenAt || ''),
      updatedAt: String(data.updatedAt || ''),
      subjectKind: 'booking',
      ...deviceFieldsFromDoc(data),
    };
  });
}

export async function fetchGuestAnonymousSummariesForType(
  propertyId: string,
  typeId: string
): Promise<GuestAnonymousAnalyticsSummary[]> {
  const snap = await getDocs(
    collection(db, 'properties', propertyId, 'propertyTypes', typeId, 'guestAnonymousAnalytics')
  );
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      visitorId: d.id,
      typeId,
      propertyId,
      portalSessions: Number(data.portalSessions || 0),
      liveLikeLocalOpens: Number(data.liveLikeLocalOpens || 0),
      assistantTurns: Number(data.assistantTurns || 0),
      aiExpertTurns: Number(data.aiExpertTurns || 0),
      uniqueGemsSeen: Number(data.uniqueGemsSeen || 0),
      uniqueLiveLikeLocalPicksSaved: Number(data.uniqueLiveLikeLocalPicksSaved || 0),
      excursionsOpens: Number(data.excursionsOpens || 0),
      uniqueExcursionsSeen: Number(data.uniqueExcursionsSeen || 0),
      excursionDetailOpens: Number(data.excursionDetailOpens || 0),
      excursionBookingStarts: Number(data.excursionBookingStarts || 0),
      excursionBookingsComplete: Number(data.excursionBookingsComplete || 0),
      accordionOpens: (data.accordionOpens as Record<string, number>) || {},
      gemImpressions: (data.gemImpressions as Record<string, number>) || {},
      excursionImpressions: (data.excursionImpressions as Record<string, number>) || {},
      liveLikeLocalPickSaves: (data.liveLikeLocalPickSaves as Record<string, number>) || {},
      liveLikeLocalPickUnsaves: (data.liveLikeLocalPickUnsaves as Record<string, number>) || {},
      liveLikeLocalPickLikes: (data.liveLikeLocalPickLikes as Record<string, number>) || {},
      liveLikeLocalPickDislikes: (data.liveLikeLocalPickDislikes as Record<string, number>) || {},
      firstSeenAt: String(data.firstSeenAt || ''),
      lastSeenAt: String(data.lastSeenAt || ''),
      updatedAt: String(data.updatedAt || ''),
      subjectKind: 'anonymous',
      ...deviceFieldsFromDoc(data),
    };
  });
}

export async function fetchGuestStayEvents(
  propertyId: string,
  typeId: string,
  bookingId: string,
  max = 150
): Promise<GuestStayAnalyticsEvent[]> {
  const snap = await getDocs(
    query(
      collection(db, 'properties', propertyId, 'propertyTypes', typeId, 'guestStayEvents'),
      where('bookingId', '==', bookingId),
      limit(max)
    )
  );
  return mapAnalyticsEvents(snap.docs);
}

export async function fetchGuestAnonymousEvents(
  propertyId: string,
  typeId: string,
  visitorId: string,
  max = 150
): Promise<GuestStayAnalyticsEvent[]> {
  const snap = await getDocs(
    query(
      collection(db, 'properties', propertyId, 'propertyTypes', typeId, 'guestAnonymousEvents'),
      where('visitorId', '==', visitorId),
      limit(max)
    )
  );
  return mapAnalyticsEvents(snap.docs);
}

function mapAnalyticsEvents(
  docs: { id: string; data: () => Record<string, unknown> }[]
): GuestStayAnalyticsEvent[] {
  const rows = docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      at: String(data.at || ''),
      type: data.type as GuestStayAnalyticsEvent['type'],
      payload: (data.payload as GuestStayAnalyticsEvent['payload']) || {},
    };
  });
  return rows.sort((a, b) => b.at.localeCompare(a.at));
}

export function eventTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    portal_session: 'Portal visit',
    live_like_local_open: 'Live like a local',
    guide_accordion_open: 'Guide section opened',
    gem_impression: 'Local gem seen',
    gem_description_expand: 'Gem description expanded',
    assistant_user_message: 'Assistant question',
    assistant_reply: 'Assistant reply',
    ai_expert_user_message: 'AI expert question',
    ai_expert_reply: 'AI expert reply',
    ai_expert_selection: 'AI expert choice',
    ai_expert_plan: 'AI day plan',
    ai_expert_wizard_message: 'Live like a local (wizard)',
    ai_expert_chat_message: 'Live like a local (chat)',
    excursions_open: 'Excursions opened',
    excursion_impression: 'Excursion seen in list',
    excursion_detail_open: 'Excursion detail viewed',
    excursion_booking_start: 'Excursion booking started',
    excursion_booking_complete: 'Excursion booked',
    live_like_local_pick_save: 'Live like a local pick saved',
    live_like_local_pick_unsave: 'Live like a local pick unsaved',
    live_like_local_pick_like: 'Live like a local pick liked',
    live_like_local_pick_dislike: 'Live like a local pick disliked',
  };
  return labels[type] || type;
}

export function formatAnalyticsSubjectLabel(row: {
  subjectKind?: string;
  guestName?: string;
  visitorId?: string;
}): string {
  if (row.subjectKind === 'anonymous') {
    const shortId = row.visitorId ? row.visitorId.slice(0, 8) : 'unknown';
    return `Anonymous visitor (${shortId})`;
  }
  return row.guestName || 'Guest';
}

export function formatAnalyticsDate(iso: string | undefined): string {
  if (!iso?.trim()) return '—';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatAnalyticsDateTime(iso: string | undefined): string {
  if (!iso?.trim()) return '—';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function analyticsTimestampMs(iso: string | undefined): number {
  if (!iso?.trim()) return 0;
  const parsed = new Date(iso).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function aggregateLatestAnalyticsByProperty(
  rows: { propertyId: string; lastSeenAt: string }[]
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const row of rows) {
    if (!row.propertyId || !row.lastSeenAt) continue;
    if (!map[row.propertyId] || row.lastSeenAt > map[row.propertyId]) {
      map[row.propertyId] = row.lastSeenAt;
    }
  }
  return map;
}

export function analyticsSummaryRowFromDoc(
  data: Record<string, unknown>
): { propertyId: string; lastSeenAt: string } | null {
  const propertyId = String(data.propertyId || '').trim();
  const lastSeenAt = String(data.lastSeenAt || '').trim();
  if (!propertyId || !lastSeenAt) return null;
  return { propertyId, lastSeenAt };
}
