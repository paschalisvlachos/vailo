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
  tone,
}: {
  label: string;
  value: number;
  hint?: string;
  icon: LucideIcon;
  tone: 'teal' | 'gold' | 'violet' | 'emerald' | 'sky' | 'amber';
}) {
  const tones = {
    teal: 'from-teal-50 to-white border-teal-100 text-teal-800',
    gold: 'from-amber-50 to-white border-amber-100 text-amber-900',
    violet: 'from-violet-50 to-white border-violet-100 text-violet-900',
    emerald: 'from-emerald-50 to-white border-emerald-100 text-emerald-900',
    sky: 'from-sky-50 to-white border-sky-100 text-sky-900',
    amber: 'from-orange-50 to-white border-orange-100 text-orange-900',
  };
  const iconTone = {
    teal: 'bg-teal-100 text-teal-700',
    gold: 'bg-amber-100 text-amber-700',
    violet: 'bg-violet-100 text-violet-700',
    emerald: 'bg-emerald-100 text-emerald-700',
    sky: 'bg-sky-100 text-sky-700',
    amber: 'bg-orange-100 text-orange-700',
  };
  return (
    <div
      className={`rounded-2xl border bg-gradient-to-br p-4 shadow-sm ${tones[tone]}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wide opacity-70">{label}</p>
          <p className="text-3xl font-bold tabular-nums text-slate-900 mt-1">{value}</p>
          {hint ? <p className="text-xs mt-1 opacity-70 leading-snug">{hint}</p> : null}
        </div>
        <span className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${iconTone[tone]}`}>
          <Icon size={18} />
        </span>
      </div>
    </div>
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
  tone = 'teal',
  compactLabels = false,
}: {
  title: string;
  icon: LucideIcon;
  rows: { label: string; value: number }[];
  empty: string;
  tone?: 'teal' | 'violet' | 'emerald' | 'amber' | 'sky';
  /** Smaller multi-line labels (used for long excursion titles). */
  compactLabels?: boolean;
}) {
  const bar = {
    teal: 'bg-vailo-teal',
    violet: 'bg-violet-500',
    emerald: 'bg-emerald-500',
    amber: 'bg-amber-500',
    sky: 'bg-sky-500',
  }[tone];
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm h-full">
      <div className="flex items-center gap-2 mb-4">
        <span className="h-8 w-8 rounded-lg bg-slate-50 text-slate-600 flex items-center justify-center">
          <Icon size={16} />
        </span>
        <h3 className="text-sm font-bold text-slate-900">{title}</h3>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">{empty}</p>
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
                      className={`font-medium text-slate-800 leading-snug line-clamp-2 ${
                        compactLabels ? 'text-xs' : 'text-sm'
                      }`}
                      title={row.label}
                    >
                      {display.title}
                    </p>
                    {display.detail ? (
                      <p className="text-[10px] text-slate-500 mt-0.5 truncate" title={display.detail}>
                        {display.detail}
                      </p>
                    ) : null}
                  </div>
                  <span className="tabular-nums text-slate-500 shrink-0 font-semibold text-xs">
                    {row.value}×
                  </span>
                </div>
                <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${bar}`}
                    style={{ width: `${Math.max(10, (row.value / max) * 100)}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function MetricChip({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  tone: string;
}) {
  return (
    <div className={`rounded-2xl border p-3 ${tone}`}>
      <p className="text-[11px] font-bold uppercase tracking-wide opacity-70 flex items-center gap-1">
        <Icon size={12} /> {label}
      </p>
      <p className="text-xl font-bold tabular-nums text-slate-900 mt-1">{value}</p>
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
    <div className="space-y-6">
      <div className="rounded-3xl border border-teal-100 bg-gradient-to-br from-teal-50 via-white to-amber-50/40 p-5 sm:p-6">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-teal-700 mb-1">
          Guest portal intelligence
        </p>
        <h2 className="text-2xl font-bold text-slate-900 font-luxury flex items-center gap-2">
          <BarChart3 size={24} className="text-vailo-teal" />
          Analytics
        </h2>
        <p className="text-sm text-slate-600 mt-2 max-w-2xl leading-relaxed">
          See how booked guests and anonymous visitors use the portal — assistant chats, Live like a
          local, house guide sections, gems, and excursions.
        </p>
        <div className="mt-4 max-w-3xl space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <select
              value={filterTypeId}
              onChange={(e) => setFilterTypeId(e.target.value)}
              className="w-full px-3 py-2.5 border border-teal-100 rounded-xl text-sm font-semibold bg-white shadow-sm"
            >
              <option value="all">All listings</option>
              {propertyTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.propertyTypeName}
                </option>
              ))}
            </select>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as AnalyticsSort)}
              className="w-full px-3 py-2.5 border border-teal-100 rounded-xl text-sm font-semibold bg-white shadow-sm"
            >
              <option value="last_used_desc">Last used</option>
              <option value="activity_desc">Most active</option>
              <option value="stay_desc">Stay date</option>
            </select>
            <label className="flex items-center gap-2 rounded-xl border border-teal-100 bg-white px-3 py-2.5 shadow-sm min-w-0">
              <CalendarRange size={16} className="text-teal-700 shrink-0" />
              <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500 shrink-0">
                From
              </span>
              <input
                type="date"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full min-w-0 px-2 py-1 border border-slate-200 rounded-lg text-sm font-semibold text-slate-800 bg-white"
              />
            </label>
            <label className="flex items-center gap-2 rounded-xl border border-teal-100 bg-white px-3 py-2.5 shadow-sm min-w-0">
              <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500 shrink-0">
                To
              </span>
              <input
                type="date"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full min-w-0 px-2 py-1 border border-slate-200 rounded-lg text-sm font-semibold text-slate-800 bg-white"
              />
            </label>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={resetFilters}
              disabled={filtersAreDefault}
              className={`text-sm font-semibold underline-offset-2 ${
                filtersAreDefault
                  ? 'text-slate-300 cursor-default no-underline'
                  : 'text-teal-800 hover:text-teal-950 hover:underline'
              }`}
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
        <Kpi
          label="Active sessions"
          value={totals.guestsWithActivity}
          hint={`${totals.bookedGuests} booked · ${totals.anonymous} anonymous`}
          icon={Users}
          tone="teal"
        />
        <Kpi label="Portal visits" value={totals.sessions} icon={Eye} tone="sky" />
        <Kpi label="Live like a local" value={totals.liveLikeLocal} icon={Sparkles} tone="violet" />
        <Kpi
          label="Assistant turns"
          value={totals.assistantTurns + totals.aiTurns}
          hint={`${totals.assistantTurns} concierge · ${totals.aiTurns} AI expert`}
          icon={MessageCircle}
          tone="emerald"
        />
        <Kpi label="Local gems seen" value={totals.gems} icon={MapPin} tone="gold" />
        <Kpi label="Excursions opened" value={totals.excursionsOpens} icon={Compass} tone="amber" />
        <Kpi
          label="Excursions booked"
          value={totals.excursionBookings}
          icon={Heart}
          tone="gold"
        />
        <Kpi
          label="Tracked guests"
          value={sortedRows.length}
          hint="Including stays with no portal use yet"
          icon={Activity}
          tone="teal"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <RankList
          title="Most opened guide sections"
          icon={BookOpen}
          rows={aggregateGuide}
          empty="No house guide opens recorded yet."
          tone="sky"
          compactLabels
        />
        <RankList
          title="Most viewed local gems"
          icon={MapPin}
          rows={aggregateGems}
          empty="No gem impressions yet."
          tone="emerald"
          compactLabels
        />
        <RankList
          title="Most seen excursions"
          icon={Compass}
          rows={aggregateExcursions}
          empty="No excursion list views yet."
          tone="amber"
          compactLabels
        />
      </div>

      {loading ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-16 text-center text-sm text-slate-500">
          Loading analytics…
        </div>
      ) : sortedRows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-16 text-center">
          <p className="text-slate-800 font-semibold">
            {dateFrom || dateTo ? 'No guests in this date range' : 'No guest activity to show yet'}
          </p>
          <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
            {dateFrom || dateTo
              ? 'Try widening the From / To dates, or clear the range to see everyone.'
              : 'Activity appears when guests open the portal during a stay or browse a public listing page.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-bold text-slate-900">Guest activity</h3>
            <p className="text-xs text-slate-500">
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
                {
                  label: 'Visits',
                  value: row.portalSessions,
                  tone: 'bg-teal-50 text-teal-900 border-teal-100',
                },
                {
                  label: 'Live local',
                  value: row.liveLikeLocalOpens,
                  tone: 'bg-violet-50 text-violet-900 border-violet-100',
                },
                {
                  label: 'Chat',
                  value: row.assistantTurns + row.aiExpertTurns,
                  tone: 'bg-emerald-50 text-emerald-900 border-emerald-100',
                },
                {
                  label: 'Gems',
                  value: row.uniqueGemsSeen,
                  tone: 'bg-amber-50 text-amber-900 border-amber-100',
                },
                {
                  label: 'Trips',
                  value: row.excursionsOpens,
                  tone: 'bg-orange-50 text-orange-900 border-orange-100',
                },
                {
                  label: 'Booked',
                  value: row.excursionBookingsComplete,
                  tone: 'bg-rose-50 text-rose-900 border-rose-100',
                },
              ];
              return (
                <button
                  key={row.rowKey}
                  type="button"
                  onClick={() => {
                    if (row.hasActivity) void openDetail(row);
                  }}
                  disabled={!row.hasActivity}
                  className={`text-left rounded-2xl border p-4 sm:p-5 transition-all ${
                    row.hasActivity
                      ? 'bg-white border-slate-100 shadow-sm hover:border-vailo-teal/40 hover:shadow-md cursor-pointer'
                      : 'bg-slate-50/80 border-slate-100 opacity-80 cursor-default'
                  }`}
                >
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1.5">
                          {row.subjectKind === 'anonymous' ? (
                            <span className="text-[10px] font-bold uppercase tracking-wide text-amber-800 bg-amber-50 border border-amber-100 rounded-full px-2 py-0.5">
                              Anonymous
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold uppercase tracking-wide text-teal-800 bg-teal-50 border border-teal-100 rounded-full px-2 py-0.5">
                              Booked guest
                            </span>
                          )}
                          {!row.hasActivity ? (
                            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500 bg-slate-100 rounded-full px-2 py-0.5">
                              No portal use
                            </span>
                          ) : null}
                        </div>
                        <p className="text-lg font-bold text-slate-900 leading-tight">
                          {row.guestName}
                        </p>
                        <p className="text-sm text-slate-600 mt-1">
                          <span className="font-medium text-slate-700">{row.unitName}</span>
                          <span className="text-slate-300 mx-1.5">·</span>
                          {row.subjectKind === 'anonymous'
                            ? 'Public browsing'
                            : formatBookingDateRange(row.stayStart, row.stayEnd)}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
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
                        <span className="inline-flex items-center gap-1 self-start rounded-full bg-teal-50 text-teal-800 border border-teal-100 px-3 py-1.5 text-xs font-bold shrink-0">
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
                              className={`rounded-xl border px-2.5 py-2.5 text-center ${cell.tone}`}
                            >
                              <p className="text-[10px] font-bold uppercase tracking-wide opacity-70">
                                {cell.label}
                              </p>
                              <p className="text-lg font-bold tabular-nums mt-0.5">{cell.value}</p>
                            </div>
                          ))}
                        </div>
                        {(topGuide || topGem || topTrip) && (
                          <div className="flex flex-wrap gap-2 text-xs">
                            {topGuide ? (
                              <span
                                className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 text-sky-900 border border-sky-100 px-2.5 py-1 max-w-full"
                                title={guideSectionLabel(topGuide[0])}
                              >
                                <BookOpen size={12} className="shrink-0" />
                                <span className="truncate">
                                  Top guide:{' '}
                                  {splitExcursionDisplayLabel(guideSectionLabel(topGuide[0])).title}
                                </span>
                              </span>
                            ) : null}
                            {topGem ? (
                              <span
                                className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 text-amber-900 border border-amber-100 px-2.5 py-1 max-w-full"
                                title={resolveGemLabel(topGem[0])}
                              >
                                <Sparkles size={12} className="shrink-0" />
                                <span className="truncate">
                                  Top gem: {resolveGemLabel(topGem[0])}
                                </span>
                              </span>
                            ) : null}
                            {topTrip ? (
                              <span
                                className="inline-flex items-center gap-1.5 rounded-full bg-orange-50 text-orange-900 border border-orange-100 px-2.5 py-1 max-w-full"
                                title={resolveExcursionLabel(topTrip[0])}
                              >
                                <Compass size={12} className="shrink-0" />
                                <span className="truncate">
                                  Top trip: {splitExcursionDisplayLabel(resolveExcursionLabel(topTrip[0])).title}
                                </span>
                              </span>
                            ) : null}
                          </div>
                        )}
                      </>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
          {hasMoreRows ? (
            <div ref={setLoadMoreNode} className="pt-1">
              <button
                type="button"
                onClick={loadMoreGuests}
                className="w-full rounded-2xl border border-dashed border-teal-200 bg-teal-50/60 py-3 text-sm font-semibold text-teal-800 hover:bg-teal-50 transition-colors"
              >
                Load {Math.min(GUEST_PAGE_SIZE, sortedRows.length - visibleCount)} more
              </button>
            </div>
          ) : sortedRows.length > GUEST_PAGE_SIZE ? (
            <p className="text-center text-xs text-slate-400 py-2">
              All {sortedRows.length} guests loaded
            </p>
          ) : null}
        </div>
      )}

      {selected ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/45 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-white rounded-3xl w-full max-w-3xl max-h-[92vh] overflow-hidden shadow-2xl flex flex-col border border-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative overflow-hidden border-b border-slate-100">
              <div className="absolute inset-0 bg-gradient-to-br from-teal-50 via-white to-amber-50/50" />
              <div className="relative flex items-start justify-between p-5 sm:p-6 gap-4">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-teal-700 mb-1">
                    {selected.subjectKind === 'anonymous' ? 'Anonymous visitor' : 'Booked guest'}
                  </p>
                  <h3 className="text-xl font-bold text-slate-900 truncate">{selected.guestName}</h3>
                  <p className="text-sm text-slate-600 mt-1">
                    {selected.unitName}
                    {selected.subjectKind === 'booking'
                      ? ` · ${formatBookingDateRange(selected.stayStart, selected.stayEnd)}`
                      : ' · Public browsing'}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
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
                  className="p-2 rounded-xl text-slate-400 hover:bg-white/80 hover:text-slate-700"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="p-5 sm:p-6 overflow-y-auto space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                <MetricChip
                  icon={Eye}
                  label="Visits"
                  value={selected.portalSessions}
                  tone="bg-teal-50 border-teal-100"
                />
                <MetricChip
                  icon={Sparkles}
                  label="Live local"
                  value={selected.liveLikeLocalOpens}
                  tone="bg-violet-50 border-violet-100"
                />
                <MetricChip
                  icon={MessageCircle}
                  label="Assistant"
                  value={selected.assistantTurns}
                  tone="bg-emerald-50 border-emerald-100"
                />
                <MetricChip
                  icon={Sparkles}
                  label="AI expert"
                  value={selected.aiExpertTurns}
                  tone="bg-sky-50 border-sky-100"
                />
                <MetricChip
                  icon={Compass}
                  label="Excursions"
                  value={
                    <>
                      {selected.excursionsOpens}
                      <span className="block text-[10px] font-medium text-slate-500 normal-case tracking-normal">
                        {selected.excursionDetailOpens} views · {selected.excursionBookingStarts}{' '}
                        starts
                      </span>
                    </>
                  }
                  tone="bg-amber-50 border-amber-100"
                />
                <MetricChip
                  icon={Heart}
                  label="Booked"
                  value={selected.excursionBookingsComplete}
                  tone="bg-rose-50 border-rose-100"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <RankList
                  title="Guide sections"
                  icon={BookOpen}
                  rows={topEntries(selected.accordionOpens).map(([key, value]) => ({
                    label: guideSectionLabel(key),
                    value,
                  }))}
                  empty="No guide sections opened."
                  tone="sky"
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
                  tone="emerald"
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
                  tone="violet"
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
                  tone="amber"
                  compactLabels
                />
              </div>

              <div>
                <p className="text-sm font-bold text-slate-900 mb-3">Activity timeline</p>
                {eventsLoading ? (
                  <p className="text-sm text-slate-500">Loading events…</p>
                ) : events.length === 0 ? (
                  <p className="text-sm text-slate-500 italic">No events recorded yet.</p>
                ) : (
                  <ul className="space-y-2.5">
                    {events.map((ev) => {
                      const tone = eventTypeTone(ev.type);
                      const plan = parseAnalyticsPlanData(ev.payload?.planData);
                      return (
                        <li
                          key={ev.id}
                          className={`rounded-2xl border border-slate-100 bg-white p-3.5 ring-1 ${tone.ring}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <span
                                className={`inline-flex text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${tone.bg} ${tone.text}`}
                              >
                                {eventTypeLabel(ev.type)}
                              </span>
                              <div className="mt-2 space-y-1 text-sm text-slate-700">
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
                                  <p className="text-slate-500 text-xs">
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
                                  <p className="text-slate-500 text-xs">
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
                                  <p className="text-slate-500 text-xs">
                                    Plan with {ev.payload.planStopCount} stops
                                  </p>
                                ) : null}
                              </div>

                              {plan ? (
                                <div className="mt-3 rounded-xl border border-violet-100 bg-violet-50/60 p-3">
                                  <p className="text-xs font-bold uppercase tracking-wide text-violet-800 mb-1">
                                    {plan.title || 'Day plan'}
                                  </p>
                                  {plan.summary ? (
                                    <p className="text-sm text-violet-950/80 mb-2 leading-relaxed">
                                      {plan.summary}
                                    </p>
                                  ) : null}
                                  {plan.stops.length > 0 ? (
                                    <ol className="space-y-2">
                                      {plan.stops.map((stop, idx) => (
                                        <li
                                          key={`${stop.name}-${idx}`}
                                          className="flex gap-2 text-sm text-slate-800"
                                        >
                                          <span className="h-6 w-6 rounded-full bg-white border border-violet-100 text-violet-700 text-xs font-bold flex items-center justify-center shrink-0">
                                            {idx + 1}
                                          </span>
                                          <span className="min-w-0">
                                            <span className="font-semibold">{stop.name}</span>
                                            {stop.time ? (
                                              <span className="text-slate-500"> · {stop.time}</span>
                                            ) : null}
                                            {stop.category ? (
                                              <span className="block text-xs text-slate-500">
                                                {stop.category}
                                              </span>
                                            ) : null}
                                            {stop.description ? (
                                              <span className="block text-xs text-slate-600 mt-0.5">
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
                            <span className="text-[11px] text-slate-400 whitespace-nowrap shrink-0">
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
