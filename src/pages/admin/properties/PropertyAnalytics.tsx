import { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { collection, onSnapshot } from 'firebase/firestore';
import { BarChart3, X, Clock, MessageCircle, Sparkles, MapPin, BookOpen, MonitorSmartphone } from 'lucide-react';
import { db } from '../../../lib/firebase';
import { collectHouseGuests } from '../../../lib/houseGuests';
import {
  eventTypeLabel,
  fetchGuestAnonymousEvents,
  fetchGuestAnonymousSummariesForType,
  fetchGuestStayEvents,
  fetchGuestStaySummariesForType,
  formatAnalyticsSubjectLabel,
} from '../../../lib/guestAnalyticsAdmin';
import type {
  GuestAnalyticsDeviceFields,
  GuestAnalyticsSubjectKind,
  GuestStayAnalyticsEvent,
} from '../../../lib/guestAnalytics';
import { formatBookingDateRange } from '../../../lib/syncedBooking';

function deviceDisplayLabel(row: GuestAnalyticsDeviceFields): string {
  if (row.lastDeviceLabel) return row.lastDeviceLabel;
  if (row.lastDeviceType && row.lastOsName) {
    const type =
      row.lastDeviceType.charAt(0).toUpperCase() + row.lastDeviceType.slice(1);
    return `${type} · ${row.lastOsName}`;
  }
  return '';
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
  accordionOpens: Record<string, number>;
  gemImpressions: Record<string, number>;
  firstSeenAt: string;
  lastSeenAt: string;
  updatedAt: string;
  unitName: string;
  hasActivity: boolean;
} & GuestAnalyticsDeviceFields;

export default function PropertyAnalytics() {
  const { propertyId } = useOutletContext<{ propertyId: string }>();
  const [propertyTypes, setPropertyTypes] = useState<
    { id: string; propertyTypeName?: string }[]
  >([]);
  const [filterTypeId, setFilterTypeId] = useState('all');
  const [bookingSummaries, setBookingSummaries] = useState<Row[]>([]);
  const [anonymousSummaries, setAnonymousSummaries] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Row | null>(null);
  const [events, setEvents] = useState<GuestStayAnalyticsEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);

  useEffect(() => {
    if (!propertyId) return;
    const unsub = onSnapshot(collection(db, 'properties', propertyId, 'propertyTypes'), (snap) => {
      setPropertyTypes(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [propertyId]);

  const typeIds = useMemo(
    () =>
      filterTypeId === 'all' ? propertyTypes.map((t) => t.id) : [filterTypeId],
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
            hasActivity: true,
          }))
        );
        const anon = await fetchGuestAnonymousSummariesForType(propertyId, typeId);
        anonRows.push(
          ...anon.map((s) => ({
            rowKey: `anonymous:${s.typeId}:${s.visitorId}`,
            subjectKind: 'anonymous' as const,
            bookingId: undefined,
            visitorId: s.visitorId,
            guestName: formatAnalyticsSubjectLabel(s),
            guestEmail: '',
            stayStart: '',
            stayEnd: '',
            typeId: s.typeId,
            propertyId: s.propertyId,
            portalSessions: s.portalSessions,
            liveLikeLocalOpens: s.liveLikeLocalOpens,
            assistantTurns: s.assistantTurns,
            aiExpertTurns: s.aiExpertTurns,
            uniqueGemsSeen: s.uniqueGemsSeen,
            accordionOpens: s.accordionOpens,
            gemImpressions: s.gemImpressions,
            firstSeenAt: s.firstSeenAt,
            lastSeenAt: s.lastSeenAt,
            updatedAt: s.updatedAt,
            unitName,
            hasActivity: s.portalSessions > 0 || s.lastSeenAt !== '',
          }))
        );
      }
      if (!cancelled) {
        setBookingSummaries(bookingRows);
        setAnonymousSummaries(anonRows);
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
      const unitName = guest.unitName;
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
          firstSeenAt: '',
          lastSeenAt: '',
          updatedAt: '',
          unitName,
          hasActivity: false,
        });
      }
    }

    for (const summary of bookingSummaries) {
      if (
        !houseGuests.some((g) => g.typeId === summary.typeId && g.id === summary.bookingId)
      ) {
        merged.push(summary);
      }
    }

    for (const anon of anonymousSummaries) {
      if (filterTypeId !== 'all' && anon.typeId !== filterTypeId) continue;
      merged.push(anon);
    }

    return merged.sort((a, b) => {
      const aT = a.lastSeenAt ? new Date(a.lastSeenAt).getTime() : 0;
      const bT = b.lastSeenAt ? new Date(b.lastSeenAt).getTime() : 0;
      return bT - aT;
    });
  }, [bookingSummaries, anonymousSummaries, houseGuests, filterTypeId, propertyId]);

  const totals = useMemo(() => {
    const active = rows.filter((r) => r.hasActivity);
    return {
      guestsWithActivity: active.length,
      sessions: active.reduce((n, r) => n + r.portalSessions, 0),
      liveLikeLocal: active.reduce((n, r) => n + r.liveLikeLocalOpens, 0),
      assistantTurns: active.reduce((n, r) => n + r.assistantTurns, 0),
      aiTurns: active.reduce((n, r) => n + r.aiExpertTurns, 0),
    };
  }, [rows]);

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
    } catch (err) {
      console.error(err);
      setEvents([]);
    } finally {
      setEventsLoading(false);
    }
  };

  const topAccordions = (row: Row) =>
    Object.entries(row.accordionOpens || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

  const topGems = (row: Row) =>
    Object.entries(row.gemImpressions || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <BarChart3 size={22} className="text-vailo-teal" />
          Analytics
        </h2>
        <p className="text-sm text-gray-500 mt-1 max-w-2xl">
          Usage from house guests with a booking session and from anonymous public browsing when the
          access gate is off. Includes full 24/7 assistant and Live like a local (wizard + chat)
          message logs. Admin preview and visitor tester codes are not tracked.
        </p>
      </div>

      <div className="mb-4">
        <select
          value={filterTypeId}
          onChange={(e) => setFilterTypeId(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium"
        >
          <option value="all">All units</option>
          {propertyTypes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.propertyTypeName}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {[
          { label: 'Sessions active', value: totals.guestsWithActivity },
          { label: 'Portal visits', value: totals.sessions },
          { label: 'Live like a local', value: totals.liveLikeLocal },
          { label: 'Assistant turns', value: totals.assistantTurns },
          { label: 'AI expert turns', value: totals.aiTurns },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm"
          >
            <p className="text-xs font-bold text-gray-500 uppercase">{kpi.label}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{kpi.value}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Loading analytics…</p>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 rounded-xl border border-dashed border-gray-200 bg-gray-50">
          <p className="text-gray-600 font-medium">No guest activity to show yet</p>
          <p className="text-sm text-gray-500 mt-1">
            Activity appears when guests open the portal during a stay or browse a public unit page.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm overflow-x-auto">
          <table className="min-w-full text-sm divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">
                  Guest
                </th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">
                  Stay / type
                </th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">
                  Device
                </th>
                <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase">
                  Visits
                </th>
                <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase">
                  Live local
                </th>
                <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase">
                  Assistant
                </th>
                <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase">
                  AI expert
                </th>
                <th className="px-4 py-3 text-center text-xs font-bold text-gray-500 uppercase">
                  Gems
                </th>
                <th className="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase">
                  Detail
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row) => (
                <tr key={row.rowKey} className="hover:bg-gray-50/80">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-gray-900">{row.guestName}</p>
                    <p className="text-xs text-gray-500">{row.unitName}</p>
                    {row.subjectKind === 'anonymous' && (
                      <span className="inline-block mt-1 text-[10px] font-bold uppercase tracking-wide text-amber-800 bg-amber-50 border border-amber-100 rounded px-1.5 py-0.5">
                        Anonymous
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                    {row.subjectKind === 'anonymous'
                      ? 'Public browsing'
                      : formatBookingDateRange(row.stayStart, row.stayEnd)}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {deviceDisplayLabel(row) ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-700">
                        <MonitorSmartphone size={14} className="text-gray-400 shrink-0" />
                        {deviceDisplayLabel(row)}
                      </span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center font-medium">{row.portalSessions}</td>
                  <td className="px-4 py-3 text-center font-medium">{row.liveLikeLocalOpens}</td>
                  <td className="px-4 py-3 text-center font-medium">{row.assistantTurns}</td>
                  <td className="px-4 py-3 text-center font-medium">{row.aiExpertTurns}</td>
                  <td className="px-4 py-3 text-center font-medium">{row.uniqueGemsSeen}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => void openDetail(row)}
                      disabled={!row.hasActivity}
                      className={`text-xs font-bold ${
                        row.hasActivity
                          ? 'text-vailo-teal hover:underline'
                          : 'text-gray-300 cursor-not-allowed'
                      }`}
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40"
          role="dialog"
          aria-modal="true"
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between p-5 border-b border-gray-100">
              <div>
                <h3 className="text-lg font-bold text-gray-900">{selected.guestName}</h3>
                <p className="text-sm text-gray-500">
                  {selected.unitName}
                  {selected.subjectKind === 'booking'
                    ? ` · ${formatBookingDateRange(selected.stayStart, selected.stayEnd)}`
                    : ' · Public browsing'}
                </p>
                {selected.lastSeenAt && (
                  <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                    <Clock size={12} />
                    Last active {new Date(selected.lastSeenAt).toLocaleString()}
                  </p>
                )}
                {deviceDisplayLabel(selected) && (
                  <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                    <MonitorSmartphone size={12} />
                    Last device: {deviceDisplayLabel(selected)}
                  </p>
                )}
                {selected.firstDeviceLabel &&
                  selected.firstDeviceLabel !== selected.lastDeviceLabel && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      First device: {selected.firstDeviceLabel}
                    </p>
                  )}
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="p-2 rounded-lg text-gray-400 hover:bg-gray-100"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-lg bg-gray-50 p-3 text-center">
                  <p className="text-xs text-gray-500">Visits</p>
                  <p className="text-lg font-bold">{selected.portalSessions}</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3 text-center">
                  <p className="text-xs text-gray-500 flex items-center justify-center gap-1">
                    <Sparkles size={12} /> Live local
                  </p>
                  <p className="text-lg font-bold">{selected.liveLikeLocalOpens}</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3 text-center">
                  <p className="text-xs text-gray-500 flex items-center justify-center gap-1">
                    <MessageCircle size={12} /> Assistant
                  </p>
                  <p className="text-lg font-bold">{selected.assistantTurns}</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3 text-center">
                  <p className="text-xs text-gray-500 flex items-center justify-center gap-1">
                    <Sparkles size={12} /> AI expert
                  </p>
                  <p className="text-lg font-bold">{selected.aiExpertTurns}</p>
                </div>
              </div>

              {topAccordions(selected).length > 0 && (
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1 mb-2">
                    <BookOpen size={14} /> Guide sections opened
                  </p>
                  <ul className="text-sm text-gray-700 space-y-1">
                    {topAccordions(selected).map(([key, count]) => (
                      <li key={key}>
                        {key.replace(/_/g, ' ')} — {count}×
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {topGems(selected).length > 0 && (
                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1 mb-2">
                    <MapPin size={14} /> Gems seen
                  </p>
                  <ul className="text-sm text-gray-700 space-y-1">
                    {topGems(selected).map(([gemId, count]) => (
                      <li key={gemId} className="font-mono text-xs">
                        {gemId.slice(0, 12)}… — {count}×
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <p className="text-xs font-bold text-gray-500 uppercase mb-2">Activity timeline</p>
                {eventsLoading ? (
                  <p className="text-sm text-gray-500">Loading events…</p>
                ) : events.length === 0 ? (
                  <p className="text-sm text-gray-500 italic">No events recorded yet.</p>
                ) : (
                  <ul className="space-y-2 max-h-96 overflow-y-auto">
                    {events.map((ev) => (
                      <li
                        key={ev.id}
                        className="text-sm border border-gray-100 rounded-lg px-3 py-2 bg-gray-50/80"
                      >
                        <div className="flex justify-between gap-2">
                          <span className="font-semibold text-gray-800">
                            {eventTypeLabel(ev.type)}
                          </span>
                          <span className="text-xs text-gray-400 shrink-0">
                            {new Date(ev.at).toLocaleString()}
                          </span>
                        </div>
                        {ev.payload?.wizardStep && (
                          <p className="text-gray-500 mt-0.5 text-xs">
                            Wizard step: {ev.payload.wizardStep}
                            {ev.payload.messageType ? ` · ${ev.payload.messageType}` : ''}
                          </p>
                        )}
                        {ev.payload?.text && (
                          <p className="text-gray-600 mt-1 text-xs leading-relaxed whitespace-pre-wrap">
                            {ev.payload.text}
                          </p>
                        )}
                        {ev.payload?.picksSummary && (
                          <p className="text-gray-500 mt-1 text-xs">
                            Picks: {ev.payload.picksSummary}
                          </p>
                        )}
                        {ev.payload?.sectionKey && (
                          <p className="text-gray-500 mt-0.5 text-xs">
                            Section: {ev.payload.sectionKey}
                          </p>
                        )}
                        {ev.payload?.gemName && (
                          <p className="text-gray-500 mt-0.5 text-xs">Gem: {ev.payload.gemName}</p>
                        )}
                        {(ev.type === 'ai_expert_plan' || ev.payload?.planData) &&
                          ev.payload?.planStopCount != null && (
                            <p className="text-gray-500 mt-0.5 text-xs">
                              Plan with {ev.payload.planStopCount} stops
                            </p>
                          )}
                        {ev.payload?.planData && (
                          <details className="mt-2">
                            <summary className="text-xs text-vailo-teal cursor-pointer font-semibold">
                              View plan JSON
                            </summary>
                            <pre className="mt-1 text-[10px] leading-snug text-gray-600 overflow-x-auto max-h-40 whitespace-pre-wrap">
                              {ev.payload.planData}
                            </pre>
                          </details>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
