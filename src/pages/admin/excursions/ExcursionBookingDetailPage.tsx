import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { useToast } from '../../../context/ToastContext';
import { adminPath } from '../../../lib/adminRoutes';
import { EXCURSION_PROVIDER_COLLECTION, EXCURSION_SUBCOLLECTION } from '../../../lib/excursionProvider';
import { formatExcursionPrice } from '../../../lib/excursion';
import {
  adminExcursionBookingsPath,
  bookingFromDoc,
  bookingStatusLabel,
  formatBookingDate,
  formatBookingParticipants,
  portalExcursionBookingsPath,
  type ExcursionBooking,
} from '../../../lib/excursionBooking';
import { updateExcursionBookingStatus } from '../../../lib/excursionBookingService';
import {
  AdminBackHeader,
  AdminButton,
  AdminCard,
} from '../../../components/admin/AdminPageHeader';

export default function ExcursionBookingDetailPage() {
  const { providerId, excursionId, bookingId } = useParams<{
    providerId: string;
    excursionId: string;
    bookingId: string;
  }>();
  const location = useLocation();
  const portalMode = location.pathname.includes('/excursion-portal/');
  const navigate = useNavigate();
  const toast = useToast();

  const [booking, setBooking] = useState<ExcursionBooking | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  const listPath =
    providerId && excursionId
      ? adminPath(
          portalMode
            ? portalExcursionBookingsPath(providerId, excursionId)
            : adminExcursionBookingsPath(providerId, excursionId)
        )
      : adminPath('/excursions/providers');

  useEffect(() => {
    if (!providerId || !excursionId || !bookingId) return;

    getDoc(
      doc(
        db,
        EXCURSION_PROVIDER_COLLECTION,
        providerId,
        EXCURSION_SUBCOLLECTION,
        excursionId,
        'bookings',
        bookingId
      )
    )
      .then((snap) => {
        if (!snap.exists()) {
          toast.error('Booking not found.');
          navigate(listPath);
          return;
        }
        setBooking(bookingFromDoc(snap.id, snap.data()));
      })
      .catch(() => {
        toast.error('Failed to load booking.');
        navigate(listPath);
      })
      .finally(() => setLoading(false));
  }, [providerId, excursionId, bookingId, listPath, navigate, toast]);

  const handleStatus = async (nextStatus: 'confirmed' | 'cancelled' | 'declined') => {
    if (!booking) return;
    const labels = {
      confirmed: 'confirm',
      cancelled: 'cancel',
      declined: 'decline',
    };
    if (!window.confirm(`${labels[nextStatus].charAt(0).toUpperCase()}${labels[nextStatus].slice(1)} this booking?`)) {
      return;
    }

    setActing(true);
    try {
      await updateExcursionBookingStatus(db, booking, nextStatus);
      setBooking((prev) =>
        prev
          ? {
              ...prev,
              status: nextStatus,
              confirmedAt: nextStatus === 'confirmed' ? new Date().toISOString() : prev.confirmedAt,
              cancelledAt:
                nextStatus === 'cancelled' || nextStatus === 'declined'
                  ? new Date().toISOString()
                  : prev.cancelledAt,
            }
          : prev
      );
      toast.success(`Booking ${labels[nextStatus]}ed.`);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Action failed.');
    } finally {
      setActing(false);
    }
  };

  if (!providerId || !excursionId || !bookingId) {
    navigate(adminPath('/excursions/providers'));
    return null;
  }

  if (loading || !booking) {
    return <div className="py-16 text-center text-gray-500 text-sm">Loading booking…</div>;
  }

  return (
    <div className="admin-page">
      <AdminBackHeader
        backTo={listPath}
        backLabel="Back to bookings"
        title={booking.guestName}
        description={`${booking.excursionTitle || 'Excursion'} · ${formatBookingDate(booking.date)}`}
        badge={
          <span className="px-2.5 py-1 text-xs font-semibold rounded-full border bg-vailo-surface-elevated text-gray-700 border-gray-200">
            {bookingStatusLabel(booking.status)}
          </span>
        }
        action={
          <div className="flex flex-wrap gap-2">
            {booking.status === 'pending' && (
              <>
                <AdminButton
                  type="button"
                  onClick={() => handleStatus('confirmed')}
                  disabled={acting}
                >
                  Confirm
                </AdminButton>
                <AdminButton
                  type="button"
                  variant="danger"
                  onClick={() => handleStatus('declined')}
                  disabled={acting}
                >
                  Decline
                </AdminButton>
              </>
            )}
            {(booking.status === 'pending' || booking.status === 'confirmed') && (
              <AdminButton
                type="button"
                variant="secondary"
                onClick={() => handleStatus('cancelled')}
                disabled={acting}
              >
                Cancel booking
              </AdminButton>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AdminCard className="p-6 space-y-4">
          <h3 className="font-bold text-vailo-dark">Guest</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">Name</dt>
              <dd className="text-gray-900 font-medium">{booking.guestName}</dd>
            </div>
            {booking.guestEmail && (
              <div className="flex justify-between gap-4">
                <dt className="text-gray-500">Email</dt>
                <dd className="text-gray-900">{booking.guestEmail}</dd>
              </div>
            )}
            {booking.guestPhone && (
              <div className="flex justify-between gap-4">
                <dt className="text-gray-500">Phone</dt>
                <dd className="text-gray-900">{booking.guestPhone}</dd>
              </div>
            )}
            {booking.guestNotes && (
              <div>
                <dt className="text-gray-500 mb-1">Guest notes</dt>
                <dd className="text-gray-900 whitespace-pre-wrap">{booking.guestNotes}</dd>
              </div>
            )}
          </dl>
        </AdminCard>

        <AdminCard className="p-6 space-y-4">
          <h3 className="font-bold text-vailo-dark">Trip</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">Date</dt>
              <dd className="text-gray-900">{formatBookingDate(booking.date)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">Participants</dt>
              <dd className="text-gray-900 text-right">
                {formatBookingParticipants(booking.participants)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-gray-500">Source</dt>
              <dd className="text-gray-900 capitalize">{booking.source}</dd>
            </div>
            {booking.guestPortalPropertyId && (
              <div className="flex justify-between gap-4">
                <dt className="text-gray-500">Guest portal</dt>
                <dd className="text-gray-900 text-right text-xs">
                  Property {booking.guestPortalPropertyId}
                  {booking.guestPortalTypeId ? ` · Unit ${booking.guestPortalTypeId}` : ''}
                  {booking.guestPortalHouseBookingId
                    ? ` · Stay ${booking.guestPortalHouseBookingId}`
                    : ''}
                </dd>
              </div>
            )}
          </dl>
        </AdminCard>

        <AdminCard className="p-6 space-y-4 lg:col-span-2">
          <h3 className="font-bold text-vailo-dark">Pricing</h3>
          <div className="space-y-2 text-sm max-w-md">
            {booking.pricing.lineItems.map((item) => (
              <div key={item.type} className="flex justify-between text-gray-600">
                <span className="capitalize">
                  {item.type} × {item.quantity} @{' '}
                  {formatExcursionPrice(item.unitPrice, booking.pricing.currency)}
                </span>
                <span className="tabular-nums">
                  {formatExcursionPrice(item.lineTotal, booking.pricing.currency)}
                </span>
              </div>
            ))}
            <div className="flex justify-between text-gray-600 pt-2 border-t border-gray-100">
              <span>Subtotal</span>
              <span>{formatExcursionPrice(booking.pricing.subtotal, booking.pricing.currency)}</span>
            </div>
            {booking.pricing.discountTotal > 0 && (
              <div className="flex justify-between text-emerald-700">
                <span>
                  Discounts
                  {booking.pricing.promoCode ? ` (${booking.pricing.promoCode})` : ''}
                </span>
                <span>
                  −{formatExcursionPrice(booking.pricing.discountTotal, booking.pricing.currency)}
                </span>
              </div>
            )}
            <div className="flex justify-between font-bold text-vailo-dark pt-2 border-t border-gray-100">
              <span>Total</span>
              <span>{formatExcursionPrice(booking.pricing.total, booking.pricing.currency)}</span>
            </div>
          </div>
        </AdminCard>

        {booking.internalNotes && (
          <AdminCard className="p-6 lg:col-span-2">
            <h3 className="font-bold text-vailo-dark mb-2">Internal notes</h3>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{booking.internalNotes}</p>
          </AdminCard>
        )}
      </div>
    </div>
  );
}
