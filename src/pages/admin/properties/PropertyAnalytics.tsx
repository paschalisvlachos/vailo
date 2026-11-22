import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useOutletContext } from 'react-router-dom';
import { collection, getDocs, onSnapshot } from 'firebase/firestore';
import {
  BarChart3,
  X,
  Clock,
  MessageCircle,
  Sparkles,
  MapPin,
  BookOpen,
  MonitorSmartphone,
  Compass,
  Users,
  Eye,
  Heart,
  Activity,
  Smartphone,
  ChevronRight,
  CalendarRange,
  type LucideIcon,
} from 'lucide-react';
import AdminPageHeader, {
  AdminBadge,
  AdminButton,
  AdminCard,
  AdminEmptyState,
  AdminInput,
  AdminLabel,
  AdminSelect,
} from '../../../components/admin/AdminPageHeader';
import { db } from '../../../lib/firebase';
import { collectHouseGuests } from '../../../lib/houseGuests';
import {
  eventTypeLabel,
  eventTypeTone,
  fetchGuestAnonymousEvents,
  fetchGuestAnonymousSummariesForType,
  fetchGuestStayEvents,
  fetchGuestStaySummariesForType,
  formatAnalyticsDateTime,
  formatAnalyticsSubjectLabel,
  analyticsTimestampMs,
  parseAnalyticsPlanData,
  resolveExcursionTitlesByImpressionKeys,
} from '../../../lib/guestAnalyticsAdmin';
import type {
  GuestAnalyticsDeviceFields,
  GuestAnalyticsSubjectKind,
  GuestStayAnalyticsEvent,
} from '../../../lib/guestAnalytics';
import { formatBookingDateRange } from '../../../lib/syncedBooking';
import { usePropertyListingQuery } from '../../../hooks/usePropertyListingQuery';
import { HOUSE_GUIDE_CATEGORIES } from '../../../lib/houseGuideCategories';

function deviceDisplayLabel(row: GuestAnalyticsDeviceFields): string {
  if (row.lastDeviceLabel) return row.lastDeviceLabel;
  if (row.lastDeviceType && row.lastOsName) {
    const type = row.lastDeviceType.charAt(0).toUpperCase() + row.lastDeviceType.slice(1);
    return `${type} · ${row.lastOsName}`;
  }
  return '';
}

function guideSectionLabel(key: string): string {
  const normalized = key.trim();
  for (const cat of HOUSE_GUIDE_CATEGORIES) {
    if (cat.id === normalized) return cat.title.replace(/^\d+\.\s*/, '');
    const field = cat.fields.find((f) => f.id === normalized);
    if (field) return `${cat.title.replace(/^\d+\.\s*/, '')} · ${field.label}`;
  }
  return normalized.replace(/[_-]+/g, ' ');
}

const EMPTY_EXCURSION_COUNTERS = {
  excursionsOpens: 0,
  uniqueExcursionsSeen: 0,
  excursionDetailOpens: 0,
  excursionBookingStarts: 0,
  excursionBookingsComplete: 0,
  excursionImpressions: {} as Record<string, number>,
};

function summaryHasActivity(row: {
  portalSessions: number;
  liveLikeLocalOpens: number;
  assistantTurns: number;
  aiExpertTurns: number;
  uniqueGemsSeen: number;
  uniqueLiveLikeLocalPicksSaved?: number;
  excursionsOpens: number;
  uniqueExcursionsSeen: number;
  excursionDetailOpens: number;
  excursionBookingStarts: number;
  excursionBookingsComplete: number;
  accordionOpens: Record<string, number>;
}): boolean {
  return (
    row.portalSessions > 0 ||
    row.liveLikeLocalOpens > 0 ||
    row.assistantTurns > 0 ||
    row.aiExpertTurns > 0 ||
    row.uniqueGemsSeen > 0 ||
    (row.uniqueLiveLikeLocalPicksSaved ?? 0) > 0 ||
    row.excursionsOpens > 0 ||
    row.uniqueExcursionsSeen > 0 ||
    row.excursionDetailOpens > 0 ||
    row.excursionBookingStarts > 0 ||
    row.excursionBookingsComplete > 0 ||
    Object.keys(row.accordionOpens || {}).length > 0
  );
}

type Row = {
  rowKey: string;
  subjectKind: GuestAnalyticsSubjectKind;
  bookingId?: string;
  visitorId?: string;
  typeId: string;
  propertyId: string;
  guestName: string;
  guestEmail: string;
  stayStart: string;
  stayEnd: string;
  portalSessions: number;
  liveLikeLocalOpens: number;
  assistantTurns: number;
  aiExpertTurns: number;
  uniqueGemsSeen: number;
  uniqueLiveLikeLocalPicksSaved?: number;
  accordionOpens: Record<string, number>;
  gemImpressions: Record<string, number>;
  liveLikeLocalPickSaves?: Record<string, number>;
  excursionsOpens: number;
  uniqueExcursionsSeen: number;
  excursionDetailOpens: number;
  excursionBookingStarts: number;
  excursionBookingsComplete: number;
  excursionImpressions: Record<string, number>;
  firstSeenAt: string;
  lastSeenAt: string;
  updatedAt: string;
  unitName: string;
  hasActivity: boolean;
} & GuestAnalyticsDeviceFields;

type AnalyticsSort = 'stay_desc' | 'last_used_desc' | 'activity_desc';

const GUEST_PAGE_SIZE = 20;

function getScrollParent(el: HTMLElement | null): Element | null {
  let node = el?.parentElement ?? null;
  while (node) {
    const { overflowY } = window.getComputedStyle(node);
    if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

function analyticsStaySortKey(row: Row): number {
  if (row.subjectKind === 'booking' && row.stayStart) {
    return analyticsTimestampMs(row.stayStart);
  }
  return analyticsTimestampMs(row.lastSeenAt);
}

/** Inclusive YYYY-MM-DD activity / stay filter. */
function rowMatchesDateRange(row: Row, dateFrom: string, dateTo: string): boolean {
  if (!dateFrom && !dateTo) return true;
  const fromMs = dateFrom ? Date.parse(`${dateFrom}T00:00:00`) : Number.NEGATIVE_INFINITY;
  const toMs = dateTo ? Date.parse(`${dateTo}T23:59:59.999`) : Number.POSITIVE_INFINITY;
  if (Number.isNaN(fromMs) || Number.isNaN(toMs)) return true;

  if (row.lastSeenAt) {
    const seen = analyticsTimestampMs(row.lastSeenAt);
    if (seen >= fromMs && seen <= toMs) return true;
  }

  if (row.stayStart || row.stayEnd) {
    const stayStart = row.stayStart
      ? Date.parse(`${row.stayStart.slice(0, 10)}T00:00:00`)
      : Number.NEGATIVE_INFINITY;
    const stayEnd = row.stayEnd
      ? Date.parse(`${row.stayEnd.slice(0, 10)}T23:59:59.999`)
      : stayStart;
    if (!Number.isNaN(stayStart) && !Number.isNaN(stayEnd)) {
      return stayStart <= toMs && stayEnd >= fromMs;
    }
  }

  // No usable dates when a range is set → exclude.
  return false;
}

function activityScore(row: Row): number {
  return (
    row.portalSessions +
    row.liveLikeLocalOpens +
    row.assistantTurns +
    row.aiExpertTurns +
    row.uniqueGemsSeen +
    row.excursionsOpens +
    row.excursionBookingsComplete * 3
  );
}

function topEntries(map: Record<string, number> | undefined, limit = 6) {
  return Object.entries(map || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}

function mergeCountMaps(maps: Record<string, number>[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const map of maps) {
    for (const [key, value] of Object.entries(map || {})) {
      out[key] = (out[key] || 0) + Number(value || 0);
    }
  }
  return out;
}

function Kpi({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: number;
  hint?: string;
  icon: LucideIcon;
}) {
  return (
    <AdminCard className="p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-1">{label}</p>
          <p className="text-2xl font-bold text-vailo-dark tabular-nums">{value}</p>
          {hint ? <p className="text-xs text-gray-500 mt-1 leading-snug">{hint}</p> : null}
        </div>
        <span className="h-9 w-9 rounded-md bg-vailo-teal/10 text-vailo-teal flex items-center justify-center shrink-0">
          <Icon size={16} />
        </span>
      </div>
    </AdminCard>
  );
}

function splitExcursionDisplayLabel(label: string): { title: string; detail?: string } {
  const parts = label.split(' · ');
  if (parts.length < 2) return { title: label };
  return { title: parts[0], detail: parts.slice(1).join(' · ') };
}

function RankList({
  title,
  icon: Icon,
  rows,
  empty,
  compactLabels = false,
}: {
  title: string;
  icon: LucideIcon;
  rows: { label: string; value: number }[];
  empty: string;
  /** Smaller multi-line labels (used for long excursion titles). */
  compactLabels?: boolean;
}) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <AdminCard className="p-4 sm:p-5 h-full">
      <div className="flex items-center gap-2 mb-4">
        <span className="h-8 w-8 rounded-md bg-vailo-teal/10 text-vailo-teal flex items-center justify-center">
          <Icon size={16} />
        </span>
        <h3 className="text-sm font-bold text-vailo-dark">{title}</h3>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">{empty}</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((row, index) => {
            const display = compactLabels
              ? splitExcursionDisplayLabel(row.label)
              : { title: row.label };
            return (
              <li key={`${row.label}-${index}`}>
                <div className="flex items-start justify-between gap-3 mb-1.5">
                  <div className="min-w-0">
                    <p
                      className={`font-medium text-vailo-dark leading-snug line-clamp-2 ${
                        compactLabels ? 'text-xs' : 'text-sm'
                      }`}
                      title={row.label}
                    >
                      {display.title}
                    </p>
                    {display.detail ? (
                      <p className="text-[10px] text-gray-500 mt-0.5 truncate" title={display.detail}>
                        {display.detail}
                      </p>
                    ) : null}
                  </div>
                  <span className="tabular-nums text-gray-500 shrink-0 font-semibold text-xs">
                    {row.value}×
                  </span>
                </div>
                <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-vailo-teal"
                    style={{ width: `${Math.max(10, (row.value / max) * 100)}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </AdminCard>
  );
}

function MetricChip({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-[#e1e1e1] bg-white p-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 flex items-center gap-1">
        <Icon size={12} /> {label}
      </p>
      <p className="text-xl font-bold tabular-nums text-vailo-dark mt-1">{value}</p>
    </div>
  );
}

export default function PropertyAnalytics() {
  const { propertyId } = useOutletContext<{ propertyId: string }>();
  const [propertyTypes, setPropertyTypes] = useState<
    { id: string; propertyTypeName?: string }[]
  >([]);
  const propertyTypeIds = useMemo(() => propertyTypes.map((type) => type.id), [propertyTypes]);
  const { listingId: filterTypeId, setListingId: setFilterTypeId } = usePropertyListingQuery({
    allowAll: true,
    validTypeIds: propertyTypeIds,
  });
  const [sortBy, setSortBy] = useState<AnalyticsSort>('last_used_desc');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [visibleCount, setVisibleCount] = useState(GUEST_PAGE_SIZE);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const sortedRowsLengthRef = useRef(0);
  const [bookingSummaries, setBookingSummaries] = useState<Row[]>([]);
  const [anonymousSummaries, setAnonymousSummaries] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Row | null>(null);
  const [events, setEvents] = useState<GuestStayAnalyticsEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [gemNameById, setGemNameById] = useState<Record<string, string>>({});
  const [excursionTitleByKey, setExcursionTitleByKey] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!propertyId) return;
    const unsub = onSnapshot(collection(db, 'properties', propertyId, 'propertyTypes'), (snap) => {
      setPropertyTypes(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [propertyId]);

  const typeIds = useMemo(
    () => (filterTypeId === 'all' ? propertyTypes.map((t) => t.id) : [filterTypeId]),
    [filterTypeId, propertyTypes]
  );

  useEffect(() => {
    if (!propertyId || typeIds.length === 0) {
      setBookingSummaries([]);
      setAnonymousSummaries([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const bookingRows: Row[] = [];
      const anonRows: Row[] = [];
      const gemNames: Record<string, string> = {};
      const excursionKeys = new Set<string>();
      for (const typeId of typeIds) {
        const unitName =
          propertyTypes.find((t) => t.id === typeId)?.propertyTypeName || 'Unit';
        const stays = await fetchGuestStaySummariesForType(propertyId, typeId);
        bookingRows.push(
          ...stays.map((s) => ({
            ...s,
            rowKey: `booking:${s.typeId}:${s.bookingId}`,
            subjectKind: 'booking' as const,
            unitName,
            hasActivity: summaryHasActivity(s),
          }))
        );
        for (const stay of stays) {
          Object.keys(stay.excursionImpressions || {}).forEach((k) => excursionKeys.add(k));
        }
        const anon = await fetchGuestAnonymousSummariesForType(propertyId, typeId);
        anonRows.push(
          ...anon.map((s) => ({
            ...s,
            rowKey: `anonymous:${s.typeId}:${s.visitorId}`,
            subjectKind: 'anonymous' as const,
            bookingId: undefined,
            guestName: formatAnalyticsSubjectLabel(s),
            guestEmail: '',
            stayStart: '',
            stayEnd: '',
            unitName,
            hasActivity: summaryHasActivity(s),
          }))
        );
        for (const visitor of anon) {
          Object.keys(visitor.excursionImpressions || {}).forEach((k) => excursionKeys.add(k));
        }

        try {
          const gemsSnap = await getDocs(
            collection(db, 'properties', propertyId, 'propertyTypes', typeId, 'localGems')
          );
          for (const docSnap of gemsSnap.docs) {
            const name = String(docSnap.data().name || docSnap.data().title || '').trim();
            if (name) gemNames[docSnap.id] = name;
          }
        } catch (err) {
          console.warn('Analytics gem name lookup failed', err);
        }
      }

      let excursionTitles: Record<string, string> = {};
      try {
        excursionTitles = await resolveExcursionTitlesByImpressionKeys([...excursionKeys]);
      } catch (err) {
        console.warn('Analytics excursion title lookup failed', err);
      }

      if (!cancelled) {
        setBookingSummaries(bookingRows);
        setAnonymousSummaries(anonRows);
        setGemNameById(gemNames);
        setExcursionTitleByKey(excursionTitles);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [propertyId, typeIds, propertyTypes]);

  const houseGuests = useMemo(
    () => collectHouseGuests(propertyTypes as Parameters<typeof collectHouseGuests>[0]),
    [propertyTypes]
  );

  const rows: Row[] = useMemo(() => {
    const byBooking = new Map(
      bookingSummaries.map((s) => [`${s.typeId}:${s.bookingId}`, s])
    );
    const merged: Row[] = [];

    for (const guest of houseGuests) {
      const key = `${guest.typeId}:${guest.id}`;
      const summary = byBooking.get(key);
      if (filterTypeId !== 'all' && guest.typeId !== filterTypeId) continue;

      if (summary) {
        merged.push(summary);
      } else {
        merged.push({
          rowKey: `booking:${guest.typeId}:${guest.id}`,
          subjectKind: 'booking',
          bookingId: guest.id,
          typeId: guest.typeId,
          propertyId,
          guestName: guest.guestName,
          guestEmail: guest.guestEmail,
          stayStart: guest.start,
          stayEnd: guest.end,
          portalSessions: 0,
          liveLikeLocalOpens: 0,
          assistantTurns: 0,
          aiExpertTurns: 0,
          uniqueGemsSeen: 0,
          accordionOpens: {},
          gemImpressions: {},
          ...EMPTY_EXCURSION_COUNTERS,
          firstSeenAt: '',
          lastSeenAt: '',
          updatedAt: '',
          unitName: guest.unitName,
          hasActivity: false,
        });
      }
    }

    for (const summary of bookingSummaries) {
      if (!houseGuests.some((g) => g.typeId === summary.typeId && g.id === summary.bookingId)) {
        merged.push(summary);
      }
    }

    for (const anon of anonymousSummaries) {
      if (filterTypeId !== 'all' && anon.typeId !== filterTypeId) continue;
      merged.push(anon);
    }

    return merged;
  }, [bookingSummaries, anonymousSummaries, houseGuests, filterTypeId, propertyId]);

  const sortedRows = useMemo(() => {
    const list = rows.filter((row) => rowMatchesDateRange(row, dateFrom, dateTo));
    const byLatest = (a: Row, b: Row) => {
      const last =
        analyticsTimestampMs(b.lastSeenAt) - analyticsTimestampMs(a.lastSeenAt);
      if (last !== 0) return last;
      const updated =
        analyticsTimestampMs(b.updatedAt) - analyticsTimestampMs(a.updatedAt);
      if (updated !== 0) return updated;
      return analyticsStaySortKey(b) - analyticsStaySortKey(a);
    };

    if (sortBy === 'last_used_desc') {
      list.sort(byLatest);
      return list;
    }
    if (sortBy === 'activity_desc') {
      list.sort((a, b) => {
        const byActivity = activityScore(b) - activityScore(a);
        if (byActivity !== 0) return byActivity;
        return byLatest(a, b);
      });
      return list;
    }
    list.sort((a, b) => {
      const byStay = analyticsStaySortKey(b) - analyticsStaySortKey(a);
      if (byStay !== 0) return byStay;
      return byLatest(a, b);
    });
    return list;
  }, [rows, sortBy, dateFrom, dateTo]);

  const filtersAreDefault =
    filterTypeId === 'all' && sortBy === 'last_used_desc' && !dateFrom && !dateTo;

  const resetFilters = () => {
    setFilterTypeId('all');
    setSortBy('last_used_desc');
    setDateFrom('');
    setDateTo('');
  };

  useEffect(() => {
    setVisibleCount(GUEST_PAGE_SIZE);
  }, [filterTypeId, sortBy, dateFrom, dateTo, propertyId]);

  const visibleRows = useMemo(
    () => sortedRows.slice(0, visibleCount),
    [sortedRows, visibleCount]
  );
  const hasMoreRows = visibleCount < sortedRows.length;
  sortedRowsLengthRef.current = sortedRows.length;

  const loadMoreGuests = useCallback(() => {
    setVisibleCount((n) => {
      const max = sortedRowsLengthRef.current;
      if (n >= max) return n;
      return Math.min(n + GUEST_PAGE_SIZE, max);
    });
  }, []);

  const setLoadMoreNode = useCallback(
    (node: HTMLDivElement | null) => {
      loadMoreRef.current = node;
    },
    []
  );

  useEffect(() => {
    if (!hasMoreRows || loading) return;
    const node = loadMoreRef.current;
    if (!node) return;

    const root = getScrollParent(node);
    let cancelled = false;
    let queued = false;

    const loadIfVisible = () => {
      if (cancelled || queued) return;
      const rootRect =
        root instanceof Element
          ? root.getBoundingClientRect()
          : { top: 0, bottom: window.innerHeight };
      const rect = node.getBoundingClientRect();
      const inView = rect.top <= rootRect.bottom + 320 && rect.bottom >= rootRect.top - 80;
      if (!inView) return;
      queued = true;
      loadMoreGuests();
      // Allow another chunk on the next frame if the sentinel is still on screen.
      requestAnimationFrame(() => {
        queued = false;
      });
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadIfVisible();
      },
      { root: root ?? null, rootMargin: '320px 0px', threshold: 0 }
    );
    observer.observe(node);

    const scrollTarget: Element | Window = root ?? window;
    scrollTarget.addEventListener('scroll', loadIfVisible, { passive: true });
    window.addEventListener('resize', loadIfVisible);
    loadIfVisible();

    return () => {
      cancelled = true;
      observer.disconnect();
      scrollTarget.removeEventListener('scroll', loadIfVisible);
      window.removeEventListener('resize', loadIfVisible);
    };
  }, [hasMoreRows, loading, visibleCount, sortedRows.length, loadMoreGuests]);

  const activeRows = useMemo(() => sortedRows.filter((r) => r.hasActivity), [sortedRows]);

  const totals = useMemo(() => {
    return {
      guestsWithActivity: activeRows.length,
      sessions: activeRows.reduce((n, r) => n + r.portalSessions, 0),
      liveLikeLocal: activeRows.reduce((n, r) => n + r.liveLikeLocalOpens, 0),
      assistantTurns: activeRows.reduce((n, r) => n + r.assistantTurns, 0),
      aiTurns: activeRows.reduce((n, r) => n + r.aiExpertTurns, 0),
      gems: activeRows.reduce((n, r) => n + r.uniqueGemsSeen, 0),
      excursionsOpens: activeRows.reduce((n, r) => n + r.excursionsOpens, 0),
      excursionBookings: activeRows.reduce((n, r) => n + r.excursionBookingsComplete, 0),
      anonymous: activeRows.filter((r) => r.subjectKind === 'anonymous').length,
      bookedGuests: activeRows.filter((r) => r.subjectKind === 'booking').length,
    };
  }, [activeRows]);

  const resolveGemLabel = (id: string) => gemNameById[id] || id;
  const resolveExcursionLabel = (key: string) => {
    if (excursionTitleByKey[key]) return excursionTitleByKey[key];
    const colon = key.indexOf(':');
    if (colon > 0) {
      const bareId = key.slice(colon + 1);
      if (excursionTitleByKey[bareId]) return excursionTitleByKey[bareId];
    }
    return 'Untitled excursion';
  };

  const aggregateGuide = useMemo(() => {
    const merged = mergeCountMaps(activeRows.map((r) => r.accordionOpens));
    return topEntries(merged, 6).map(([key, value]) => ({
      label: guideSectionLabel(key),
      value,
    }));
  }, [activeRows]);

  const aggregateGems = useMemo(() => {
    const merged = mergeCountMaps(activeRows.map((r) => r.gemImpressions));
    return topEntries(merged, 6).map(([key, value]) => ({
      label: gemNameById[key] || key,
      value,
    }));
  }, [activeRows, gemNameById]);

  const aggregateExcursions = useMemo(() => {
    const merged = mergeCountMaps(activeRows.map((r) => r.excursionImpressions));
    return topEntries(merged, 6).map(([key, value]) => ({
      label: resolveExcursionLabel(key),
      value,
    }));
  }, [activeRows, excursionTitleByKey]);

  const openDetail = async (row: Row) => {
    setSelected(row);
    setEventsLoading(true);
    try {
      const ev =
        row.subjectKind === 'anonymous' && row.visitorId
          ? await fetchGuestAnonymousEvents(propertyId, row.typeId, row.visitorId, 250)
          : row.bookingId
            ? await fetchGuestStayEvents(propertyId, row.typeId, row.bookingId, 250)
            : [];
      setEvents(ev);

      const gemNames: Record<string, string> = {};
      const titlesFromEvents: Record<string, string> = {};
      const missingExcursionKeys = new Set<string>();
      for (const event of ev) {
        if (event.payload?.gemId && event.payload?.gemName) {
          gemNames[event.payload.gemId] = String(event.payload.gemName);
        }
        if (event.payload?.excursionId) {
          const provider = event.payload.providerId || '';
          const key = provider
            ? `${provider}:${event.payload.excursionId}`
            : event.payload.excursionId;
          if (event.payload.excursionTitle) {
            titlesFromEvents[key] = event.payload.providerName
              ? `${event.payload.excursionTitle} · ${event.payload.providerName}`
              : event.payload.excursionTitle;
          } else if (!excursionTitleByKey[key]) {
            missingExcursionKeys.add(key);
          }
        }
      }
      Object.keys(row.excursionImpressions || {}).forEach((k) => {
        if (!excursionTitleByKey[k] && !titlesFromEvents[k]) missingExcursionKeys.add(k);
      });
      if (Object.keys(gemNames).length) {
        setGemNameById((prev) => ({ ...prev, ...gemNames }));
      }
      let fetched: Record<string, string> = {};
      if (missingExcursionKeys.size) {
        fetched = await resolveExcursionTitlesByImpressionKeys([...missingExcursionKeys]);
      }
      if (Object.keys(titlesFromEvents).length || Object.keys(fetched).length) {
        setExcursionTitleByKey((prev) => ({ ...prev, ...fetched, ...titlesFromEvents }));
      }
    } catch (err) {
      console.error(err);
      setEvents([]);
    } finally {
      setEventsLoading(false);
    }
  };

  return (
    <div>
      <AdminPageHeader
        title="Analytics"
        description="See how booked guests and anonymous visitors use the portal — assistant chats, Live like a local, house guide sections, gems, and excursions."
        icon={<BarChart3 size={24} />}
      />

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 mb-5">
        <Kpi
          label="Active sessions"
          value={totals.guestsWithActivity}
          hint={`${totals.bookedGuests} booked · ${totals.anonymous} anonymous`}
          icon={Users}
        />
        <Kpi label="Portal visits" value={totals.sessions} icon={Eye} />
        <Kpi label="Live like a local" value={totals.liveLikeLocal} icon={Sparkles} />
        <Kpi
          label="Assistant turns"
          value={totals.assistantTurns + totals.aiTurns}
          hint={`${totals.assistantTurns} concierge · ${totals.aiTurns} AI expert`}
          icon={MessageCircle}
        />
        <Kpi label="Local gems seen" value={totals.gems} icon={MapPin} />
        <Kpi label="Excursions opened" value={totals.excursionsOpens} icon={Compass} />
        <Kpi label="Excursions booked" value={totals.excursionBookings} icon={Heart} />
        <Kpi
          label="Tracked guests"
          value={sortedRows.length}
          hint="Including stays with no portal use yet"
          icon={Activity}
        />
      </div>

      <AdminCard className="p-4 mb-5">
        <div className="flex flex-col lg:flex-row lg:items-end gap-3 lg:gap-4">
          <div className="flex-1 min-w-0">
            <AdminLabel htmlFor="analytics-listing">Listing</AdminLabel>
            <AdminSelect
              id="analytics-listing"
              value={filterTypeId}
              onChange={(e) => setFilterTypeId(e.target.value)}
            >
              <option value="all">All listings</option>
              {propertyTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.propertyTypeName}
                </option>
              ))}
            </AdminSelect>
          </div>
          <div className="flex-1 min-w-0">
            <AdminLabel htmlFor="analytics-sort">Sort</AdminLabel>
            <AdminSelect
              id="analytics-sort"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as AnalyticsSort)}
            >
              <option value="last_used_desc">Last used</option>
              <option value="activity_desc">Most active</option>
              <option value="stay_desc">Stay date</option>
            </AdminSelect>
          </div>
          <div className="flex-1 min-w-0">
            <AdminLabel htmlFor="analytics-from">From</AdminLabel>
            <div className="relative">
              <CalendarRange
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              />
              <AdminInput
                id="analytics-from"
                type="date"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={(e) => setDateFrom(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <AdminLabel htmlFor="analytics-to">To</AdminLabel>
            <AdminInput
              id="analytics-to"
              type="date"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>
          {!filtersAreDefault ? (
            <AdminButton type="button" variant="secondary" onClick={resetFilters} className="shrink-0">
              Reset filters
            </AdminButton>
          ) : null}
        </div>
      </AdminCard>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4 mb-5">
        <RankList
          title="Most opened guide sections"
          icon={BookOpen}
          rows={aggregateGuide}
          empty="No house guide opens recorded yet."
          compactLabels
        />
        <RankList
          title="Most viewed local gems"
          icon={MapPin}
          rows={aggregateGems}
          empty="No gem impressions yet."
          compactLabels
        />
        <RankList
          title="Most seen excursions"
          icon={Compass}
          rows={aggregateExcursions}
          empty="No excursion list views yet."
          compactLabels
        />
      </div>

      {loading ? (
        <AdminCard className="p-10 text-center text-sm text-gray-500">Loading analytics…</AdminCard>
      ) : sortedRows.length === 0 ? (
        <AdminEmptyState
          icon={<BarChart3 size={28} />}
          title={dateFrom || dateTo ? 'No guests in this date range' : 'No guest activity to show yet'}
          description={
            dateFrom || dateTo
              ? 'Try widening the From / To dates, or clear the range to see everyone.'
              : 'Activity appears when guests open the portal during a stay or browse a public listing page.'
          }
          action={
            !filtersAreDefault ? (
              <AdminButton type="button" variant="secondary" onClick={resetFilters}>
                Reset filters
              </AdminButton>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-bold text-vailo-dark">Guest activity</h3>
            <p className="text-xs text-gray-500">
              Showing {visibleRows.length} of {sortedRows.length}
              {dateFrom || dateTo ? ' in range' : ''}
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3">
            {visibleRows.map((row) => {
              const topGuide = topEntries(row.accordionOpens, 1)[0];
              const topGem = topEntries(row.gemImpressions, 1)[0];
              const topTrip = topEntries(row.excursionImpressions, 1)[0];
              const metrics = [
                { label: 'Visits', value: row.portalSessions },
                { label: 'Live local', value: row.liveLikeLocalOpens },
                { label: 'Chat', value: row.assistantTurns + row.aiExpertTurns },
                { label: 'Gems', value: row.uniqueGemsSeen },
                { label: 'Trips', value: row.excursionsOpens },
                { label: 'Booked', value: row.excursionBookingsComplete },
              ];
              return (
                <button
                  key={row.rowKey}
                  type="button"
                  onClick={() => {
                    if (row.hasActivity) void openDetail(row);
                  }}
                  disabled={!row.hasActivity}
                  className={`text-left transition-colors ${
                    row.hasActivity ? 'cursor-pointer' : 'cursor-default opacity-80'
                  }`}
                >
                  <AdminCard
                    className={`p-4 sm:p-5 ${
                      row.hasActivity ? 'hover:border-vailo-teal/40' : 'bg-gray-50'
                    }`}
                  >
                    <div className="flex flex-col gap-4">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-1.5">
                            {row.subjectKind === 'anonymous' ? (
                              <AdminBadge variant="gold">Anonymous</AdminBadge>
                            ) : (
                              <AdminBadge variant="teal">Booked guest</AdminBadge>
                            )}
                            {!row.hasActivity ? (
                              <AdminBadge variant="neutral">No portal use</AdminBadge>
                            ) : null}
                          </div>
                          <p className="text-lg font-bold text-vailo-dark leading-tight">
                            {row.guestName}
                          </p>
                          <p className="text-sm text-gray-600 mt-1">
                            <span className="font-medium text-vailo-dark">{row.unitName}</span>
                            <span className="text-gray-300 mx-1.5">·</span>
                            {row.subjectKind === 'anonymous'
                              ? 'Public browsing'
                              : formatBookingDateRange(row.stayStart, row.stayEnd)}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                            <span className="inline-flex items-center gap-1">
                              <Clock size={12} /> Last {formatAnalyticsDateTime(row.lastSeenAt)}
                            </span>
                            {deviceDisplayLabel(row) ? (
                              <span className="inline-flex items-center gap-1">
                                <Smartphone size={12} /> {deviceDisplayLabel(row)}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        {row.hasActivity ? (
                          <span className="inline-flex items-center gap-1 self-start text-vailo-teal text-xs font-bold shrink-0">
                            Details <ChevronRight size={14} />
                          </span>
                        ) : null}
                      </div>

                      {row.hasActivity ? (
                        <>
                          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                            {metrics.map((cell) => (
                              <div
                                key={cell.label}
                                className="rounded-lg border border-[#e1e1e1] bg-white px-2.5 py-2.5 text-center"
                              >
                                <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">
                                  {cell.label}
                                </p>
                                <p className="text-lg font-bold tabular-nums text-vailo-dark mt-0.5">
                                  {cell.value}
                                </p>
                              </div>
                            ))}
                          </div>
                          {(topGuide || topGem || topTrip) && (
                            <div className="flex flex-wrap gap-2 text-xs">
                              {topGuide ? (
                                <span
                                  className="inline-flex items-center gap-1.5 rounded-md bg-vailo-teal/10 text-vailo-dark border border-vailo-teal/20 px-2.5 py-1 max-w-full"
                                  title={guideSectionLabel(topGuide[0])}
                                >
                                  <BookOpen size={12} className="shrink-0 text-vailo-teal" />
                                  <span className="truncate">
                                    Top guide:{' '}
                                    {splitExcursionDisplayLabel(guideSectionLabel(topGuide[0])).title}
                                  </span>
                                </span>
                              ) : null}
                              {topGem ? (
                                <span
                                  className="inline-flex items-center gap-1.5 rounded-md bg-vailo-teal/10 text-vailo-dark border border-vailo-teal/20 px-2.5 py-1 max-w-full"
                                  title={resolveGemLabel(topGem[0])}
                                >
                                  <Sparkles size={12} className="shrink-0 text-vailo-teal" />
                                  <span className="truncate">
                                    Top gem: {resolveGemLabel(topGem[0])}
                                  </span>
                                </span>
                              ) : null}
                              {topTrip ? (
                                <span
                                  className="inline-flex items-center gap-1.5 rounded-md bg-vailo-teal/10 text-vailo-dark border border-vailo-teal/20 px-2.5 py-1 max-w-full"
                                  title={resolveExcursionLabel(topTrip[0])}
                                >
                                  <Compass size={12} className="shrink-0 text-vailo-teal" />
                                  <span className="truncate">
                                    Top trip:{' '}
                                    {splitExcursionDisplayLabel(resolveExcursionLabel(topTrip[0])).title}
                                  </span>
                                </span>
                              ) : null}
                            </div>
                          )}
                        </>
                      ) : null}
                    </div>
                  </AdminCard>
                </button>
              );
            })}
          </div>
          {hasMoreRows ? (
            <div ref={setLoadMoreNode} className="pt-1">
              <AdminButton
                type="button"
                variant="secondary"
                onClick={loadMoreGuests}
                className="w-full"
              >
                Load {Math.min(GUEST_PAGE_SIZE, sortedRows.length - visibleCount)} more
              </AdminButton>
            </div>
          ) : sortedRows.length > GUEST_PAGE_SIZE ? (
            <p className="text-center text-xs text-gray-400 py-2">
              All {sortedRows.length} guests loaded
            </p>
          ) : null}
        </div>
      )}

      {selected ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          role="dialog"
          aria-modal="true"
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-white rounded-lg w-full max-w-3xl max-h-[92vh] overflow-hidden shadow-[0_10px_10px_0_rgba(0,0,0,0.08)] flex flex-col border border-[#e1e1e1]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between p-5 sm:p-6 gap-4 border-b border-[#e1e1e1]">
              <div className="min-w-0">
                <div className="mb-2">
                  {selected.subjectKind === 'anonymous' ? (
                    <AdminBadge variant="gold">Anonymous visitor</AdminBadge>
                  ) : (
                    <AdminBadge variant="teal">Booked guest</AdminBadge>
                  )}
                </div>
                <h3 className="text-xl font-bold text-vailo-dark truncate">{selected.guestName}</h3>
                <p className="text-sm text-gray-600 mt-1">
                  {selected.unitName}
                  {selected.subjectKind === 'booking'
                    ? ` · ${formatBookingDateRange(selected.stayStart, selected.stayEnd)}`
                    : ' · Public browsing'}
                </p>
                <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-500">
                  {selected.firstSeenAt ? (
                    <span className="inline-flex items-center gap-1">
                      <Clock size={12} /> First {formatAnalyticsDateTime(selected.firstSeenAt)}
                    </span>
                  ) : null}
                  {selected.lastSeenAt ? (
                    <span className="inline-flex items-center gap-1">
                      <Clock size={12} /> Last {formatAnalyticsDateTime(selected.lastSeenAt)}
                    </span>
                  ) : null}
                  {deviceDisplayLabel(selected) ? (
                    <span className="inline-flex items-center gap-1">
                      <MonitorSmartphone size={12} /> {deviceDisplayLabel(selected)}
                    </span>
                  ) : null}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="p-2 rounded-md text-gray-400 hover:bg-black/[0.03] hover:text-vailo-dark"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-5 sm:p-6 overflow-y-auto space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                <MetricChip icon={Eye} label="Visits" value={selected.portalSessions} />
                <MetricChip icon={Sparkles} label="Live local" value={selected.liveLikeLocalOpens} />
                <MetricChip icon={MessageCircle} label="Assistant" value={selected.assistantTurns} />
                <MetricChip icon={Sparkles} label="AI expert" value={selected.aiExpertTurns} />
                <MetricChip
                  icon={Compass}
                  label="Excursions"
                  value={
                    <>
                      {selected.excursionsOpens}
                      <span className="block text-[10px] font-medium text-gray-500 normal-case tracking-normal">
                        {selected.excursionDetailOpens} views · {selected.excursionBookingStarts}{' '}
                        starts
                      </span>
                    </>
                  }
                />
                <MetricChip icon={Heart} label="Booked" value={selected.excursionBookingsComplete} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                <RankList
                  title="Guide sections"
                  icon={BookOpen}
                  rows={topEntries(selected.accordionOpens).map(([key, value]) => ({
                    label: guideSectionLabel(key),
                    value,
                  }))}
                  empty="No guide sections opened."
                  compactLabels
                />
                <RankList
                  title="Local gems"
                  icon={MapPin}
                  rows={topEntries(selected.gemImpressions).map(([key, value]) => ({
                    label: resolveGemLabel(key),
                    value,
                  }))}
                  empty="No gems viewed."
                  compactLabels
                />
                <RankList
                  title="Saved Live like a local picks"
                  icon={Sparkles}
                  rows={topEntries(selected.liveLikeLocalPickSaves).map(([key, value]) => ({
                    label: resolveGemLabel(key),
                    value,
                  }))}
                  empty="No saved picks."
                  compactLabels
                />
                <RankList
                  title="Excursions in list"
                  icon={Compass}
                  rows={topEntries(selected.excursionImpressions).map(([key, value]) => ({
                    label: resolveExcursionLabel(key),
                    value,
                  }))}
                  empty="No excursion impressions."
                  compactLabels
                />
              </div>

              <div>
                <p className="text-sm font-bold text-vailo-dark mb-3">Activity timeline</p>
                {eventsLoading ? (
                  <p className="text-sm text-gray-500">Loading events…</p>
                ) : events.length === 0 ? (
                  <p className="text-sm text-gray-500 italic">No events recorded yet.</p>
                ) : (
                  <ul className="space-y-2.5">
                    {events.map((ev) => {
                      const tone = eventTypeTone(ev.type);
                      const plan = parseAnalyticsPlanData(ev.payload?.planData);
                      return (
                        <li
                          key={ev.id}
                          className="rounded-lg border border-[#e1e1e1] bg-white p-3.5"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <span
                                className={`inline-flex text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md ${tone.bg} ${tone.text}`}
                              >
                                {eventTypeLabel(ev.type)}
                              </span>
                              <div className="mt-2 space-y-1 text-sm text-gray-700">
                                {ev.payload?.wizardStep ? (
                                  <p>
                                    Wizard step:{' '}
                                    <span className="font-semibold">{ev.payload.wizardStep}</span>
                                    {ev.payload.messageType
                                      ? ` · ${ev.payload.messageType}`
                                      : ''}
                                  </p>
                                ) : null}
                                {ev.payload?.text ? (
                                  <p className="leading-relaxed whitespace-pre-wrap">
                                    {ev.payload.text}
                                  </p>
                                ) : null}
                                {ev.payload?.picksSummary ? (
                                  <p className="text-gray-500 text-xs">
                                    Picks: {ev.payload.picksSummary}
                                  </p>
                                ) : null}
                                {ev.payload?.sectionKey ? (
                                  <p>
                                    Section:{' '}
                                    <span className="font-semibold">
                                      {guideSectionLabel(String(ev.payload.sectionKey))}
                                    </span>
                                  </p>
                                ) : null}
                                {ev.payload?.gemName ? (
                                  <p>
                                    Gem: <span className="font-semibold">{ev.payload.gemName}</span>
                                  </p>
                                ) : ev.payload?.gemId ? (
                                  <p>
                                    Gem:{' '}
                                    <span className="font-semibold">
                                      {resolveGemLabel(String(ev.payload.gemId))}
                                    </span>
                                  </p>
                                ) : null}
                                {ev.payload?.excursionId || ev.payload?.excursionTitle ? (
                                  <p>
                                    Excursion:{' '}
                                    <span className="font-semibold">
                                      {ev.payload.excursionTitle
                                        ? ev.payload.providerName
                                          ? `${ev.payload.excursionTitle} · ${ev.payload.providerName}`
                                          : ev.payload.excursionTitle
                                        : resolveExcursionLabel(
                                            ev.payload.providerId
                                              ? `${ev.payload.providerId}:${ev.payload.excursionId}`
                                              : String(ev.payload.excursionId)
                                          )}
                                    </span>
                                  </p>
                                ) : null}
                                {ev.payload?.bookingDate ? (
                                  <p className="text-gray-500 text-xs">
                                    Date: {ev.payload.bookingDate}
                                    {ev.payload.bookingStatus
                                      ? ` · ${ev.payload.bookingStatus}`
                                      : ''}
                                    {ev.payload.bookingTotal != null && ev.payload.bookingCurrency
                                      ? ` · ${ev.payload.bookingTotal} ${ev.payload.bookingCurrency}`
                                      : ''}
                                  </p>
                                ) : null}
                                {(ev.type === 'ai_expert_plan' || plan) &&
                                ev.payload?.planStopCount != null ? (
                                  <p className="text-gray-500 text-xs">
                                    Plan with {ev.payload.planStopCount} stops
                                  </p>
                                ) : null}
                              </div>

                              {plan ? (
                                <div className="mt-3 rounded-lg border border-vailo-teal/20 bg-vailo-teal/5 p-3">
                                  <p className="text-xs font-bold uppercase tracking-wide text-vailo-teal mb-1">
                                    {plan.title || 'Day plan'}
                                  </p>
                                  {plan.summary ? (
                                    <p className="text-sm text-vailo-dark/80 mb-2 leading-relaxed">
                                      {plan.summary}
                                    </p>
                                  ) : null}
                                  {plan.stops.length > 0 ? (
                                    <ol className="space-y-2">
                                      {plan.stops.map((stop, idx) => (
                                        <li
                                          key={`${stop.name}-${idx}`}
                                          className="flex gap-2 text-sm text-vailo-dark"
                                        >
                                          <span className="h-6 w-6 rounded-full bg-white border border-vailo-teal/20 text-vailo-teal text-xs font-bold flex items-center justify-center shrink-0">
                                            {idx + 1}
                                          </span>
                                          <span className="min-w-0">
                                            <span className="font-semibold">{stop.name}</span>
                                            {stop.time ? (
                                              <span className="text-gray-500"> · {stop.time}</span>
                                            ) : null}
                                            {stop.category ? (
                                              <span className="block text-xs text-gray-500">
                                                {stop.category}
                                              </span>
                                            ) : null}
                                            {stop.description ? (
                                              <span className="block text-xs text-gray-600 mt-0.5">
                                                {stop.description}
                                              </span>
                                            ) : null}
                                          </span>
                                        </li>
                                      ))}
                                    </ol>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                            <span className="text-[11px] text-gray-400 whitespace-nowrap shrink-0">
                              {new Date(ev.at).toLocaleString()}
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
