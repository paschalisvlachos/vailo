import { collection, doc, getDoc, getDocs, query, where, limit } from 'firebase/firestore';
import { db } from './firebase';
import type {
  GuestAnonymousAnalyticsSummary,
  GuestStayAnalyticsEvent,
  GuestStayAnalyticsSummary,
} from './guestAnalytics';
import {
  EXCURSION_PROVIDER_COLLECTION,
  EXCURSION_SUBCOLLECTION,
} from './excursionProvider';

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
    assistant_escalation: 'Assistant escalation',
    ai_expert_user_message: 'AI expert question',
    ai_expert_reply: 'AI expert reply',
    ai_expert_selection: 'AI expert choice',
    ai_expert_plan: 'AI day plan',
    ai_expert_wizard_message: 'Live like a local (wizard)',
    ai_expert_chat_message: 'Live like a local (chat)',
    excursions_open: 'Excursions opened',
    book_arrange_open: 'Book & Arrange opened',
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

/** Soft accent used in admin analytics UI chips/timeline. */
export function eventTypeTone(
  type: string
): { bg: string; text: string; ring: string; bar: string } {
  if (type.startsWith('assistant_') || type.startsWith('ai_expert_')) {
    return {
      bg: 'bg-violet-50',
      text: 'text-violet-800',
      ring: 'ring-violet-100',
      bar: 'bg-violet-500',
    };
  }
  if (type.startsWith('excursion') || type === 'book_arrange_open' || type === 'excursions_open') {
    return {
      bg: 'bg-amber-50',
      text: 'text-amber-900',
      ring: 'ring-amber-100',
      bar: 'bg-amber-500',
    };
  }
  if (type.startsWith('gem_') || type.startsWith('live_like_local')) {
    return {
      bg: 'bg-emerald-50',
      text: 'text-emerald-900',
      ring: 'ring-emerald-100',
      bar: 'bg-emerald-500',
    };
  }
  if (type === 'guide_accordion_open') {
    return {
      bg: 'bg-sky-50',
      text: 'text-sky-900',
      ring: 'ring-sky-100',
      bar: 'bg-sky-500',
    };
  }
  return {
    bg: 'bg-teal-50',
    text: 'text-teal-900',
    ring: 'ring-teal-100',
    bar: 'bg-vailo-teal',
  };
}

export type ParsedAnalyticsPlanStop = {
  name: string;
  category?: string;
  description?: string;
  time?: string;
};

export type ParsedAnalyticsPlan = {
  title?: string;
  summary?: string;
  stops: ParsedAnalyticsPlanStop[];
};

/**
 * Resolve `providerId:excursionId` impression keys to human titles from the catalog.
 * Returns labels like "Sunset Cruise · Aegean Boats".
 */
export async function resolveExcursionTitlesByImpressionKeys(
  keys: string[]
): Promise<Record<string, string>> {
  const unique = [...new Set(keys.map((k) => String(k || '').trim()).filter(Boolean))];
  if (!unique.length) return {};

  const titles: Record<string, string> = {};
  const providerNameById: Record<string, string> = {};

  const loadProviderName = async (providerId: string) => {
    if (providerNameById[providerId] !== undefined) return providerNameById[providerId];
    try {
      const snap = await getDoc(doc(db, EXCURSION_PROVIDER_COLLECTION, providerId));
      const name = String(snap.data()?.businessName || '').trim();
      providerNameById[providerId] = name;
      return name;
    } catch {
      providerNameById[providerId] = '';
      return '';
    }
  };

  await Promise.all(
    unique.map(async (key) => {
      const colon = key.indexOf(':');
      if (colon <= 0) return;
      const providerId = key.slice(0, colon).trim();
      const excursionId = key.slice(colon + 1).trim();
      if (!providerId || !excursionId) return;
      try {
        const snap = await getDoc(
          doc(db, EXCURSION_PROVIDER_COLLECTION, providerId, EXCURSION_SUBCOLLECTION, excursionId)
        );
        if (!snap.exists()) return;
        const title = String(snap.data()?.title || '').trim();
        if (!title) return;
        const providerName = await loadProviderName(providerId);
        titles[key] = providerName ? `${title} · ${providerName}` : title;
        // Also index by bare excursion id for older/partial keys.
        if (!titles[excursionId]) titles[excursionId] = titles[key];
      } catch (err) {
        console.warn('Analytics excursion title lookup failed', key, err);
      }
    })
  );

  return titles;
}

/** Turn stored plan JSON into a readable structure for admin UI. */
export function parseAnalyticsPlanData(raw: unknown): ParsedAnalyticsPlan | null {
  if (raw == null) return null;
  let value: unknown = raw;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    try {
      value = JSON.parse(trimmed);
    } catch {
      return { title: 'Day plan', summary: trimmed.slice(0, 400), stops: [] };
    }
  }
  if (!value || typeof value !== 'object') return null;
  const obj = value as Record<string, unknown>;

  const title =
    String(obj.title || obj.name || obj.planTitle || '').trim() || undefined;
  const summary =
    String(obj.summary || obj.description || obj.intro || '').trim() || undefined;

  const stopArrays = [obj.stops, obj.places, obj.items, obj.itinerary, obj.days];
  let stopsRaw: unknown[] = [];
  for (const candidate of stopArrays) {
    if (Array.isArray(candidate) && candidate.length) {
      stopsRaw = candidate;
      break;
    }
  }

  // Some plans nest stops inside days[].
  if (!stopsRaw.length && Array.isArray(obj.days)) {
    stopsRaw = obj.days.flatMap((day) => {
      if (!day || typeof day !== 'object') return [];
      const d = day as Record<string, unknown>;
      const nested = d.stops || d.places || d.items;
      return Array.isArray(nested) ? nested : [];
    });
  }

  const stops: ParsedAnalyticsPlanStop[] = [];
  for (const row of stopsRaw) {
    if (typeof row === 'string' && row.trim()) {
      stops.push({ name: row.trim() });
      continue;
    }
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const name = String(r.name || r.title || r.placeName || r.label || '').trim();
    if (!name) continue;
    stops.push({
      name,
      category: String(r.category || r.type || r.tag || '').trim() || undefined,
      description: String(r.description || r.blurb || r.notes || '').trim() || undefined,
      time: String(r.time || r.startTime || r.when || '').trim() || undefined,
    });
  }

  if (!title && !summary && stops.length === 0) return null;
  return { title, summary, stops };
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
