import { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { collection, onSnapshot } from 'firebase/firestore';
import { ClipboardCheck, Eye, Filter, Loader2, Trash2 } from 'lucide-react';
import PreArrivalSubmissionModal from '../../../components/admin/PreArrivalSubmissionModal';
import { useToast } from '../../../context/ToastContext';
import { httpsCallableMessage } from '../../../lib/callableError';
import { db } from '../../../lib/firebase';
import { removePreArrivalCheckInForAdminCallable } from '../../../lib/guestPortalCallables';
import { formatPreArrivalTimeDisplay } from '../../../lib/preArrivalSubmission';
import {
  formatBookingDateRange,
  isBookingPortalAccessAllowed,
  resolveGuestDisplayName,
  type SyncedBooking,
} from '../../../lib/syncedBooking';
import type { PropertyOutletContext } from './PropertyLayout';

type CheckInRow = SyncedBooking & { typeId: string; typeName: string };

type StatusFilter = 'all' | 'complete' | 'pending';

function guestDisplayName(row: CheckInRow): string {
  return (
    resolveGuestDisplayName({
      guestName: row.guestName,
      summary: row.summary,
    }) || '—'
  );
}

export default function CheckIns() {
  const { property, propertyId } = useOutletContext<PropertyOutletContext>();
  const toast = useToast();
  const [propertyTypes, setPropertyTypes] = useState<
    { id: string; propertyTypeName?: string; syncedBookings?: SyncedBooking[] }[]
  >([]);
  const [filterTypeId, setFilterTypeId] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [viewBooking, setViewBooking] = useState<CheckInRow | null>(null);
  const [removingKey, setRemovingKey] = useState<string | null>(null);

  useEffect(() => {
    if (!propertyId) return;
    const unsub = onSnapshot(collection(db, 'properties', propertyId, 'propertyTypes'), (snap) => {
      setPropertyTypes(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [propertyId]);

  const rows = useMemo(() => {
    const list: CheckInRow[] = [];
    for (const type of propertyTypes) {
      const bookings = Array.isArray(type.syncedBookings) ? type.syncedBookings : [];
      for (const booking of bookings) {
        if (!booking?.id || !isBookingPortalAccessAllowed(booking)) continue;
        list.push({
          ...booking,
          typeId: type.id,
          typeName: type.propertyTypeName || 'Unit',
        });
      }
    }
    return list.sort((a, b) => {
      const aStart = String(a.start || '');
      const bStart = String(b.start || '');
      return bStart.localeCompare(aStart);
    });
  }, [propertyTypes]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (filterTypeId !== 'all' && row.typeId !== filterTypeId) return false;
      if (statusFilter === 'complete' && !row.preArrivalComplete) return false;
      if (statusFilter === 'pending' && row.preArrivalComplete) return false;
      return true;
    });
  }, [rows, filterTypeId, statusFilter]);

  const stats = useMemo(() => {
    const complete = rows.filter((r) => r.preArrivalComplete).length;
    return { complete, pending: rows.length - complete, total: rows.length };
  }, [rows]);

  const handleRemoveCheckIn = async (row: CheckInRow) => {
    if (!row.id) {
      toast.error('This booking has no id.');
      return;
    }
    const bookingId = row.id;

    const guestLabel = guestDisplayName(row);
    const stayLabel = formatBookingDateRange(row.start, row.end) || 'this stay';
    if (
      !window.confirm(
        `Remove the check-in for ${guestLabel} (${stayLabel})?\n\nThe guest will be able to submit check-in details again. Contact details that were filled in from this check-in will be cleared.`
      )
    ) {
      return;
    }

    const rowKey = `${row.typeId}-${row.id}`;
    setRemovingKey(rowKey);
    try {
      await removePreArrivalCheckInForAdminCallable({
        propertyId,
        typeId: row.typeId,
        bookingId,
      });
      if (viewBooking?.id === bookingId && viewBooking?.typeId === row.typeId) {
        setViewBooking(null);
      }
      toast.success('Check-in removed. The guest can check in again.');
    } catch (err) {
      toast.error(
        httpsCallableMessage(err, 'Could not remove this check-in. Please try again.')
      );
    } finally {
      setRemovingKey(null);
    }
  };

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <ClipboardCheck size={22} className="text-vailo-teal" />
            Check-ins
          </h2>
          <p className="text-sm text-gray-500 mt-1 max-w-2xl">
            Online pre-arrival check-ins for all reservations on this property. Guests from the
            open portal invitation enter their stay dates, then complete check-in details here.
          </p>
          <p className="text-xs text-gray-400 mt-2">
            {stats.complete} checked in · {stats.pending} pending · {stats.total} total bookings
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase text-gray-500">
            <Filter size={14} />
            Filter
          </div>
          <select
            value={filterTypeId}
            onChange={(e) => setFilterTypeId(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white"
          >
            <option value="all">All listings</option>
            {propertyTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.propertyTypeName || t.id}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white"
          >
            <option value="all">All statuses</option>
            <option value="complete">Checked in</option>
            <option value="pending">Not checked in</option>
          </select>
        </div>
      </div>

      {filteredRows.length === 0 ? (
        <div className="text-center py-16 rounded-xl border border-dashed border-gray-200 bg-gray-50">
          <ClipboardCheck size={36} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-900 font-medium">No bookings to show</p>
          <p className="text-sm text-gray-500 mt-1">
            Reservations from iCal or manual entry will appear here once synced.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                    Stay dates
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                    Listing
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                    Guest
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                    Check-in status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                    Arrival / guests
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                    Contact
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredRows.map((row) => {
                  const submission = row.preArrivalSubmission;
                  const contactPhone =
                    submission?.contactPhone?.trim() ||
                    row.guestPhone?.trim() ||
                    row.guestWhatsapp?.trim() ||
                    '—';
                  const contactEmail =
                    submission?.contactEmail?.trim() || row.guestEmail?.trim() || '—';

                  return (
                    <tr key={`${row.typeId}-${row.id}`} className="hover:bg-gray-50/80">
                      <td className="px-4 py-3.5 text-sm font-medium text-gray-900 whitespace-nowrap tabular-nums">
                        {formatBookingDateRange(row.start, row.end) || '—'}
                      </td>
                      <td className="px-4 py-3.5 text-sm text-gray-700 whitespace-nowrap">
                        {row.typeName}
                      </td>
                      <td className="px-4 py-3.5 text-sm text-gray-900 whitespace-nowrap">
                        {guestDisplayName(row)}
                      </td>
                      <td className="px-4 py-3.5 text-sm whitespace-nowrap">
                        {row.preArrivalComplete ? (
                          <span className="inline-flex flex-col">
                            <span className="inline-flex items-center gap-1.5 font-semibold text-[#0B4F5C]">
                              <span className="w-2 h-2 rounded-full bg-emerald-500" />
                              Checked in
                            </span>
                            {row.preArrivalSubmittedAt && (
                              <span className="text-xs text-gray-500 mt-0.5">
                                {new Date(row.preArrivalSubmittedAt).toLocaleString()}
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-amber-700 font-medium">
                            <span className="w-2 h-2 rounded-full bg-amber-400" />
                            Pending
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-sm text-gray-700 whitespace-nowrap">
                        {submission ? (
                          <span>
                            {formatPreArrivalTimeDisplay(submission.expectedArrivalTime)}
                            {submission.guestCount != null
                              ? ` · ${submission.guestCount} guest${submission.guestCount === 1 ? '' : 's'}`
                              : ''}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-sm text-gray-600">
                        <div>{contactPhone}</div>
                        {contactEmail !== '—' && (
                          <div className="text-xs text-gray-500 truncate max-w-[180px]">
                            {contactEmail}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        {row.preArrivalComplete && submission ? (
                          <div className="inline-flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => setViewBooking(row)}
                              className="inline-flex items-center gap-1.5 text-sm font-medium text-vailo-teal hover:text-vailo-teal-hover"
                            >
                              <Eye size={15} />
                              View
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleRemoveCheckIn(row)}
                              disabled={removingKey === `${row.typeId}-${row.id}`}
                              className="inline-flex items-center gap-1.5 text-sm font-medium text-red-600 hover:text-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {removingKey === `${row.typeId}-${row.id}` ? (
                                <Loader2 size={15} className="animate-spin" />
                              ) : (
                                <Trash2 size={15} />
                              )}
                              Remove
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {viewBooking && viewBooking.preArrivalSubmission && (
        <PreArrivalSubmissionModal
          booking={viewBooking}
          typeId={viewBooking.typeId}
          propertyId={propertyId}
          propertyName={property.propertyName || 'Property'}
          unitName={viewBooking.typeName}
          onClose={() => setViewBooking(null)}
        />
      )}
    </div>
  );
}
