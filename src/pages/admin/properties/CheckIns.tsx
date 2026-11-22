import { useEffect, useMemo, useState } from 'react';
import { Navigate, useOutletContext } from 'react-router-dom';
import { collection, onSnapshot } from 'firebase/firestore';
import { ClipboardCheck, Eye, Loader2, Trash2, Users } from 'lucide-react';
import PreArrivalSubmissionModal from '../../../components/admin/PreArrivalSubmissionModal';
import AdminPageHeader, {
  AdminAlert,
  AdminBadge,
  AdminButton,
  AdminCard,
  AdminEmptyState,
  AdminLabel,
  AdminSelect,
} from '../../../components/admin/AdminPageHeader';
import { useToast } from '../../../context/ToastContext';
import { httpsCallableMessage } from '../../../lib/callableError';
import { db } from '../../../lib/firebase';
import { removePreArrivalCheckInForAdminCallable } from '../../../lib/guestPortalCallables';
import { isPreArrivalCheckInEnabled } from '../../../lib/preArrivalSettings';
import { isCalendarSyncEnabled } from '../../../lib/icalSync';
import { formatPreArrivalTimeDisplay } from '../../../lib/preArrivalSubmission';
import {
  formatBookingDateRange,
  isBookingPortalAccessAllowed,
  resolveGuestDisplayName,
  type SyncedBooking,
} from '../../../lib/syncedBooking';
import { usePropertyListingQuery } from '../../../hooks/usePropertyListingQuery';
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
  const calendarSyncEnabled = isCalendarSyncEnabled(property);
  const [propertyTypes, setPropertyTypes] = useState<
    { id: string; propertyTypeName?: string; syncedBookings?: SyncedBooking[] }[]
  >([]);
  const propertyTypeIds = useMemo(() => propertyTypes.map((type) => type.id), [propertyTypes]);
  const { listingId: filterTypeId, setListingId: setFilterTypeId } = usePropertyListingQuery({
    allowAll: true,
    validTypeIds: propertyTypeIds,
  });
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
        if (
          !calendarSyncEnabled &&
          booking.provider !== 'Online check-in' &&
          booking.accessSource !== 'pre_arrival_dates' &&
          !booking.preArrivalComplete
        ) {
          continue;
        }
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
  }, [propertyTypes, calendarSyncEnabled]);

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

  const filtersActive = filterTypeId !== 'all' || statusFilter !== 'all';

  if (!isPreArrivalCheckInEnabled(property)) {
    return <Navigate to={calendarSyncEnabled ? '../reservations' : '..'} replace />;
  }

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

  const resetFilters = () => {
    setFilterTypeId('all');
    setStatusFilter('all');
  };

  return (
    <div>
      <AdminPageHeader
        title="Check-ins"
        description={
          calendarSyncEnabled
            ? 'Online check-ins for reservations on this property. Guests tap Check in in the portal, enter stay dates, then complete their details.'
            : 'Online check-ins for this property. Guests tap Check in in the portal, enter stay dates, then complete their details.'
        }
        icon={<ClipboardCheck size={24} />}
      />

      {stats.pending > 0 ? (
        <AdminAlert
          variant="gold"
          icon={<Users size={18} />}
          title={`${stats.pending} pending check-in${stats.pending === 1 ? '' : 's'}`}
        >
          Guests still need to complete check-in before arrival.
        </AdminAlert>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-5">
        {[
          { label: 'Checked in', value: stats.complete },
          { label: 'Pending', value: stats.pending },
          { label: 'Total', value: stats.total },
        ].map((item) => (
          <AdminCard key={item.label} className="p-4 sm:p-5">
            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-1">
              {item.label}
            </p>
            <p className="text-2xl font-bold text-vailo-dark tabular-nums">{item.value}</p>
          </AdminCard>
        ))}
      </div>

      <AdminCard className="p-4 mb-5">
        <div className="flex flex-col lg:flex-row lg:items-end gap-3 lg:gap-4">
          <div className="flex-1 min-w-0">
            <AdminLabel htmlFor="checkins-listing">Listing</AdminLabel>
            <AdminSelect
              id="checkins-listing"
              value={filterTypeId}
              onChange={(e) => setFilterTypeId(e.target.value)}
            >
              <option value="all">All listings</option>
              {propertyTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.propertyTypeName || t.id}
                </option>
              ))}
            </AdminSelect>
          </div>
          <div className="flex-1 min-w-0">
            <AdminLabel htmlFor="checkins-status">Status</AdminLabel>
            <AdminSelect
              id="checkins-status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            >
              <option value="all">All statuses</option>
              <option value="complete">Checked in</option>
              <option value="pending">Not checked in</option>
            </AdminSelect>
          </div>
          {filtersActive ? (
            <AdminButton type="button" variant="secondary" onClick={resetFilters} className="shrink-0">
              Reset filters
            </AdminButton>
          ) : null}
        </div>
      </AdminCard>

      {rows.length === 0 ? (
        <AdminEmptyState
          icon={<ClipboardCheck size={28} />}
          title="No check-ins yet"
          description={
            calendarSyncEnabled
              ? 'Reservations from iCal or manual entry appear here once synced. Guests complete check-in from the guest portal.'
              : 'Guests complete online check-in from the Check in button in the guest portal. Stays they enter will appear here.'
          }
        />
      ) : filteredRows.length === 0 ? (
        <AdminEmptyState
          icon={<ClipboardCheck size={28} />}
          title="No matches"
          description="Try a different listing or status filter."
          action={
            <AdminButton type="button" variant="secondary" onClick={resetFilters}>
              Reset filters
            </AdminButton>
          }
        />
      ) : (
        <>
          <div className="lg:hidden space-y-3">
            {filteredRows.map((row) => {
              const submission = row.preArrivalSubmission;
              const contactPhone =
                submission?.contactPhone?.trim() ||
                row.guestPhone?.trim() ||
                row.guestWhatsapp?.trim() ||
                '';
              const contactEmail =
                submission?.contactEmail?.trim() || row.guestEmail?.trim() || '';
              const rowKey = `${row.typeId}-${row.id}`;

              return (
                <AdminCard key={rowKey} className="p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-vailo-dark truncate">
                        {guestDisplayName(row)}
                      </p>
                      <p className="text-sm text-gray-500 mt-0.5">
                        {formatBookingDateRange(row.start, row.end) || '—'}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">{row.typeName}</p>
                    </div>
                    {row.preArrivalComplete ? (
                      <AdminBadge variant="teal">Checked in</AdminBadge>
                    ) : (
                      <AdminBadge variant="gold">Pending</AdminBadge>
                    )}
                  </div>
                  <div className="text-sm text-gray-600 space-y-1 mb-4">
                    <p>
                      {submission
                        ? `${formatPreArrivalTimeDisplay(submission.expectedArrivalTime)}${
                            submission.guestCount != null
                              ? ` · ${submission.guestCount} guest${
                                  submission.guestCount === 1 ? '' : 's'
                                }`
                              : ''
                          }`
                        : 'Arrival details not submitted'}
                    </p>
                    {(contactPhone || contactEmail) && (
                      <p className="text-xs text-gray-500 truncate">
                        {[contactPhone, contactEmail].filter(Boolean).join(' · ')}
                      </p>
                    )}
                    {row.preArrivalComplete && row.preArrivalSubmittedAt ? (
                      <p className="text-xs text-gray-400">
                        Submitted {new Date(row.preArrivalSubmittedAt).toLocaleString()}
                      </p>
                    ) : null}
                  </div>
                  {row.preArrivalComplete && submission ? (
                    <div className="flex flex-wrap gap-2">
                      <AdminButton
                        type="button"
                        variant="secondary"
                        onClick={() => setViewBooking(row)}
                      >
                        <Eye size={15} />
                        View
                      </AdminButton>
                      <AdminButton
                        type="button"
                        variant="danger"
                        onClick={() => void handleRemoveCheckIn(row)}
                        disabled={removingKey === rowKey}
                      >
                        {removingKey === rowKey ? (
                          <Loader2 size={15} className="animate-spin" />
                        ) : (
                          <Trash2 size={15} />
                        )}
                        Remove
                      </AdminButton>
                    </div>
                  ) : null}
                </AdminCard>
              );
            })}
          </div>

          <AdminCard className="hidden lg:block overflow-hidden">
            <div className="admin-table-wrap border-0">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Stay dates</th>
                    <th>Listing</th>
                    <th>Guest</th>
                    <th>Status</th>
                    <th>Arrival / guests</th>
                    <th>Contact</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => {
                    const submission = row.preArrivalSubmission;
                    const contactPhone =
                      submission?.contactPhone?.trim() ||
                      row.guestPhone?.trim() ||
                      row.guestWhatsapp?.trim() ||
                      '—';
                    const contactEmail =
                      submission?.contactEmail?.trim() || row.guestEmail?.trim() || '—';
                    const rowKey = `${row.typeId}-${row.id}`;

                    return (
                      <tr key={rowKey}>
                        <td className="whitespace-nowrap font-medium text-vailo-dark tabular-nums">
                          {formatBookingDateRange(row.start, row.end) || '—'}
                        </td>
                        <td className="whitespace-nowrap text-gray-700">{row.typeName}</td>
                        <td className="whitespace-nowrap text-vailo-dark">
                          {guestDisplayName(row)}
                        </td>
                        <td className="whitespace-nowrap">
                          {row.preArrivalComplete ? (
                            <div className="inline-flex flex-col gap-1">
                              <AdminBadge variant="teal">Checked in</AdminBadge>
                              {row.preArrivalSubmittedAt ? (
                                <span className="text-xs text-gray-400">
                                  {new Date(row.preArrivalSubmittedAt).toLocaleString()}
                                </span>
                              ) : null}
                            </div>
                          ) : (
                            <AdminBadge variant="gold">Pending</AdminBadge>
                          )}
                        </td>
                        <td className="whitespace-nowrap text-gray-700">
                          {submission ? (
                            <span>
                              {formatPreArrivalTimeDisplay(submission.expectedArrivalTime)}
                              {submission.guestCount != null
                                ? ` · ${submission.guestCount} guest${
                                    submission.guestCount === 1 ? '' : 's'
                                  }`
                                : ''}
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="text-gray-600">
                          <div>{contactPhone}</div>
                          {contactEmail !== '—' ? (
                            <div className="text-xs text-gray-400 truncate max-w-[180px]">
                              {contactEmail}
                            </div>
                          ) : null}
                        </td>
                        <td className="text-right whitespace-nowrap">
                          {row.preArrivalComplete && submission ? (
                            <div className="inline-flex items-center justify-end gap-2">
                              <AdminButton
                                type="button"
                                variant="ghost"
                                onClick={() => setViewBooking(row)}
                              >
                                <Eye size={15} />
                                View
                              </AdminButton>
                              <AdminButton
                                type="button"
                                variant="danger"
                                onClick={() => void handleRemoveCheckIn(row)}
                                disabled={removingKey === rowKey}
                              >
                                {removingKey === rowKey ? (
                                  <Loader2 size={15} className="animate-spin" />
                                ) : (
                                  <Trash2 size={15} />
                                )}
                                Remove
                              </AdminButton>
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
          </AdminCard>
        </>
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
