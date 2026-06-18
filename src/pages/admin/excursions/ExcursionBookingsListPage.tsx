import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { collection, collectionGroup, doc, getDoc, onSnapshot, query, where } from 'firebase/firestore';
import { CalendarDays, ClipboardList, Plus } from 'lucide-react';
import { db } from '../../../lib/firebase';
import { useToast } from '../../../context/ToastContext';
import { adminPath } from '../../../lib/adminRoutes';
import { EXCURSION_PROVIDER_COLLECTION, EXCURSION_SUBCOLLECTION } from '../../../lib/excursionProvider';
import { adminExcursionsListPath, formatExcursionPrice, portalExcursionsListPath } from '../../../lib/excursion';
import {
  adminExcursionBookingAddPath,
  adminExcursionBookingDetailPath,
  bookingFromDoc,
  bookingStatusLabel,
  formatBookingDate,
  formatBookingParticipants,
  portalExcursionBookingAddPath,
  portalExcursionBookingDetailPath,
  type ExcursionBooking,
  type ExcursionBookingStatus,
} from '../../../lib/excursionBooking';
import {
  AdminBackHeader,
  AdminButtonLink,
  AdminCard,
  AdminEmptyState,
} from '../../../components/admin/AdminPageHeader';

function StatusBadge({ status }: { status: ExcursionBookingStatus }) {
  const styles: Record<ExcursionBookingStatus, string> = {
    confirmed: 'bg-emerald-50 text-emerald-800 border-emerald-100',
    pending: 'bg-amber-50 text-amber-900 border-amber-100',
    cancelled: 'bg-gray-50 text-gray-600 border-gray-200',
    declined: 'bg-red-50 text-red-800 border-red-100',
  };
  return (
    <span className={`px-2.5 py-1 text-xs font-semibold rounded-full border ${styles[status]}`}>
      {bookingStatusLabel(status)}
    </span>
  );
}

export default function ExcursionBookingsListPage() {
  const { providerId, excursionId } = useParams<{ providerId: string; excursionId?: string }>();
  const location = useLocation();
  const portalMode = location.pathname.includes('/excursion-portal/');
  const navigate = useNavigate();
  const toast = useToast();

  const [providerName, setProviderName] = useState('');
  const [excursionTitle, setExcursionTitle] = useState('');
  const [bookings, setBookings] = useState<ExcursionBooking[]>([]);
  const [loading, setLoading] = useState(true);

  const excursionScope = Boolean(excursionId);

  const listBackPath = excursionScope
    ? adminPath(
        portalMode ? portalExcursionsListPath(providerId!) : adminExcursionsListPath(providerId!)
      )
    : portalMode
      ? adminPath(`/excursion-portal/${providerId}`)
      : adminPath('/excursions/providers');

  const addPath =
    providerId && excursionId
      ? adminPath(
          portalMode
            ? portalExcursionBookingAddPath(providerId, excursionId)
            : adminExcursionBookingAddPath(providerId, excursionId)
        )
      : null;

  useEffect(() => {
    if (!providerId) return;

    getDoc(doc(db, EXCURSION_PROVIDER_COLLECTION, providerId)).then((snap) => {
      if (snap.exists()) {
        setProviderName(String(snap.data().businessName || ''));
      }
    });

    if (excursionId) {
      getDoc(
        doc(db, EXCURSION_PROVIDER_COLLECTION, providerId, EXCURSION_SUBCOLLECTION, excursionId)
      ).then((snap) => {
        if (snap.exists()) {
          setExcursionTitle(String(snap.data().title || 'Excursion'));
        }
      });
    }
  }, [providerId, excursionId]);

  useEffect(() => {
    if (!providerId) return;

    const handleError = () => {
      toast.error('Failed to load bookings.');
      setLoading(false);
    };

    if (excursionId) {
      const unsub = onSnapshot(
        collection(
          db,
          EXCURSION_PROVIDER_COLLECTION,
          providerId,
          EXCURSION_SUBCOLLECTION,
          excursionId,
          'bookings'
        ),
        (snapshot) => {
          setBookings(snapshot.docs.map((d) => bookingFromDoc(d.id, d.data())));
          setLoading(false);
        },
        handleError
      );
      return () => unsub();
    }

    const unsub = onSnapshot(
      query(collectionGroup(db, 'bookings'), where('providerId', '==', providerId)),
      (snapshot) => {
        setBookings(snapshot.docs.map((d) => bookingFromDoc(d.id, d.data())));
        setLoading(false);
      },
      handleError
    );
    return () => unsub();
  }, [providerId, excursionId, toast]);

  const sorted = useMemo(
    () =>
      [...bookings].sort((a, b) => {
        const dateCmp = (b.date || '').localeCompare(a.date || '');
        if (dateCmp !== 0) return dateCmp;
        return (b.createdAt || '').localeCompare(a.createdAt || '');
      }),
    [bookings]
  );

  const detailPath = (booking: ExcursionBooking) => {
    if (!providerId || !booking.excursionId || !booking.id) return '#';
    return adminPath(
      portalMode
        ? portalExcursionBookingDetailPath(providerId, booking.excursionId, booking.id)
        : adminExcursionBookingDetailPath(providerId, booking.excursionId, booking.id)
    );
  };

  if (!providerId) {
    navigate(adminPath('/excursions/providers'));
    return null;
  }

  if (loading) {
    return <div className="py-16 text-center text-gray-500 text-sm">Loading bookings…</div>;
  }

  return (
    <div className="admin-page">
      <AdminBackHeader
        backTo={listBackPath}
        backLabel={excursionScope ? 'Back to excursions' : 'Back to providers'}
        title={excursionScope ? 'Excursion bookings' : 'All bookings'}
        description={
          excursionScope
            ? excursionTitle
              ? `${excursionTitle}${providerName ? ` · ${providerName}` : ''}`
              : undefined
            : providerName || undefined
        }
        action={
          addPath ? (
            <AdminButtonLink to={addPath}>
              <Plus size={18} /> New booking
            </AdminButtonLink>
          ) : undefined
        }
      />

      {!excursionScope && (
        <p className="text-sm text-gray-500 mb-4">
          Bookings across all excursions for this provider. Open an excursion to create a new booking.
        </p>
      )}

      {sorted.length === 0 ? (
        <AdminEmptyState
          icon={<ClipboardList size={32} />}
          title="No bookings yet"
          description={
            excursionScope
              ? 'Create a manual booking or wait for guest requests.'
              : 'Bookings will appear here once created for any excursion.'
          }
          action={
            addPath ? (
              <AdminButtonLink to={addPath}>
                <Plus size={18} /> New booking
              </AdminButtonLink>
            ) : undefined
          }
        />
      ) : (
        <AdminCard className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-vailo-surface-elevated/80 text-left">
                  <th className="px-4 sm:px-6 py-3 font-semibold text-gray-600">Guest</th>
                  {!excursionScope && (
                    <th className="px-4 sm:px-6 py-3 font-semibold text-gray-600">Excursion</th>
                  )}
                  <th className="px-4 sm:px-6 py-3 font-semibold text-gray-600">Date</th>
                  <th className="px-4 sm:px-6 py-3 font-semibold text-gray-600">Participants</th>
                  <th className="px-4 sm:px-6 py-3 font-semibold text-gray-600">Total</th>
                  <th className="px-4 sm:px-6 py-3 font-semibold text-gray-600">Status</th>
                  <th className="px-4 sm:px-6 py-3 font-semibold text-gray-600 text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((booking) => (
                  <tr
                    key={booking.id}
                    className="border-b border-gray-50 hover:bg-vailo-surface-elevated/50 transition-colors"
                  >
                    <td className="px-4 sm:px-6 py-4">
                      <p className="font-semibold text-vailo-dark">{booking.guestName}</p>
                      {booking.guestEmail && (
                        <p className="text-xs text-gray-500">{booking.guestEmail}</p>
                      )}
                    </td>
                    {!excursionScope && (
                      <td className="px-4 sm:px-6 py-4 text-gray-700">
                        {booking.excursionTitle || booking.excursionId}
                      </td>
                    )}
                    <td className="px-4 sm:px-6 py-4 text-gray-600">
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarDays size={14} className="text-gray-400" />
                        {formatBookingDate(booking.date)}
                      </span>
                    </td>
                    <td className="px-4 sm:px-6 py-4 text-gray-600 text-xs">
                      {formatBookingParticipants(booking.participants)}
                    </td>
                    <td className="px-4 sm:px-6 py-4 font-medium tabular-nums text-vailo-dark">
                      {formatExcursionPrice(booking.pricing.total, booking.pricing.currency)}
                    </td>
                    <td className="px-4 sm:px-6 py-4">
                      <StatusBadge status={booking.status} />
                    </td>
                    <td className="px-4 sm:px-6 py-4 text-right">
                      <Link
                        to={detailPath(booking)}
                        className="text-vailo-teal hover:underline text-sm font-medium"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </AdminCard>
      )}
    </div>
  );
}
