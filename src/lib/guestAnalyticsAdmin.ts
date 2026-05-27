import { collection, getDocs, query, where, limit } from 'firebase/firestore';
import { db } from './firebase';
import type { GuestStayAnalyticsEvent, GuestStayAnalyticsSummary } from './guestAnalytics';

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
      accordionOpens: (data.accordionOpens as Record<string, number>) || {},
      gemImpressions: (data.gemImpressions as Record<string, number>) || {},
      firstSeenAt: String(data.firstSeenAt || ''),
      lastSeenAt: String(data.lastSeenAt || ''),
      updatedAt: String(data.updatedAt || ''),
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
  const rows = snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      at: String(data.at || ''),
      type: data.type,
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
  };
  return labels[type] || type;
}
