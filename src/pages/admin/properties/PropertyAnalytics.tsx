import { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { collection, onSnapshot } from 'firebase/firestore';
import { BarChart3, X, Clock, MessageCircle, Sparkles, MapPin, BookOpen } from 'lucide-react';
import { db } from '../../../lib/firebase';
import { collectHouseGuests } from '../../../lib/houseGuests';
import {
  eventTypeLabel,
  fetchGuestStayEvents,
  fetchGuestStaySummariesForType,
} from '../../../lib/guestAnalyticsAdmin';
import type { GuestStayAnalyticsEvent, GuestStayAnalyticsSummary } from '../../../lib/guestAnalytics';
import { formatBookingDateRange } from '../../../lib/syncedBooking';

type Row = GuestStayAnalyticsSummary & { unitName: string; hasActivity: boolean };

export default function PropertyAnalytics() {
  const { propertyId } = useOutletContext<{ propertyId: string }>();
  const [propertyTypes, setPropertyTypes] = useState<
    { id: string; propertyTypeName?: string }[]
  >([]);
  const [filterTypeId, setFilterTypeId] = useState('all');
  const [summaries, setSummaries] = useState<GuestStayAnalyticsSummary[]>([]);
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
      setSummaries([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const all: GuestStayAnalyticsSummary[] = [];
      for (const typeId of typeIds) {
        const rows = await fetchGuestStaySummariesForType(propertyId, typeId);
        all.push(...rows);
      }
      if (!cancelled) {
        setSummaries(all);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [propertyId, typeIds]);

  const houseGuests = useMemo(
    () => collectHouseGuests(propertyTypes as Parameters<typeof collectHouseGuests>[0]),
    [propertyTypes]
  );

  const rows: Row[] = useMemo(() => {
    const byBooking = new Map(summaries.map((s) => [`${s.typeId}:${s.bookingId}`, s]));
    const merged: Row[] = [];

    for (const guest of houseGuests) {
      const key = `${guest.typeId}:${guest.id}`;
      const summary = byBooking.get(key);
      const unitName = guest.unitName;
      if (filterTypeId !== 'all' && guest.typeId !== filterTypeId) continue;

      if (summary) {
        merged.push({
          ...summary,
          unitName,
          hasActivity: true,
        });
      } else {
        merged.push({
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

    for (const summary of summaries) {
      if (!houseGuests.some((g) => g.typeId === summary.typeId && g.id === summary.bookingId)) {
        merged.push({
          ...summary,
          unitName:
            propertyTypes.find((t) => t.id === summary.typeId)?.propertyTypeName || 'Unit',
          hasActivity: true,
        });
      }
    }

    return merged.sort((a, b) => {
      const aT = a.lastSeenAt ? new Date(a.lastSeenAt).getTime() : 0;
      const bT = b.lastSeenAt ? new Date(b.lastSeenAt).getTime() : 0;
      return bT - aT;
    });
  }, [summaries, houseGuests, filterTypeId, propertyId, propertyTypes]);

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
      const ev = await fetchGuestStayEvents(propertyId, row.typeId, row.bookingId);
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
          Usage from house guests with an assigned booking session (invite or on-stay access). Admin
          preview and visitor codes are not tracked.
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
          { label: 'Guests active', value: totals.guestsWithActivity },
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
          <p className="text-gray-600 font-medium">No house guests to show yet</p>
          <p className="text-sm text-gray-500 mt-1">
            Add guest details on reservations, then have guests open the portal during their stay.
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
                  Stay
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
                <tr key={`${row.typeId}-${row.bookingId}`} className="hover:bg-gray-50/80">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-gray-900">{row.guestName}</p>
                    <p className="text-xs text-gray-500">{row.unitName}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                    {formatBookingDateRange(row.stayStart, row.stayEnd)}
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
                      className="text-vailo-teal text-xs font-bold hover:underline"
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
                  {selected.unitName} · {formatBookingDateRange(selected.stayStart, selected.stayEnd)}
                </p>
                {selected.lastSeenAt && (
                  <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                    <Clock size={12} />
                    Last active {new Date(selected.lastSeenAt).toLocaleString()}
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
                  <ul className="space-y-2 max-h-64 overflow-y-auto">
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
                        {ev.payload?.text && (
                          <p className="text-gray-600 mt-1 text-xs leading-relaxed">
                            {ev.payload.text}
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
                        {ev.type === 'ai_expert_plan' && ev.payload?.planStopCount != null && (
                          <p className="text-gray-500 mt-0.5 text-xs">
                            Plan with {ev.payload.planStopCount} stops
                          </p>
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
