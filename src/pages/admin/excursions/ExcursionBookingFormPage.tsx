import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { collection, doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { useToast } from '../../../context/ToastContext';
import { adminPath } from '../../../lib/adminRoutes';
import { EXCURSION_PROVIDER_COLLECTION, EXCURSION_SUBCOLLECTION } from '../../../lib/excursionProvider';
import { excursionFromDoc, formatExcursionPrice, type Excursion } from '../../../lib/excursion';
import {
  availabilityFromDoc,
  availabilityHasRoomFor,
  formatAvailabilitySpotsLabel,
  isAvailabilityDayBookable,
  type ExcursionAvailability,
} from '../../../lib/excursionAvailability';
import { discountFromDoc, type ExcursionDiscount } from '../../../lib/excursionDiscount';
import {
  EMPTY_BOOKING_FORM,
  adminExcursionBookingsPath,
  bookingPayloadFromForm,
  bookingValidationSummary,
  calculateBookingPricing,
  participantCountFromForm,
  portalExcursionBookingsPath,
  totalParticipants,
  validateBookingForm,
  type ExcursionBookingFormData,
} from '../../../lib/excursionBooking';
import { createExcursionBookingRecord } from '../../../lib/excursionBookingService';
import {
  AdminAlert,
  AdminBackHeader,
  AdminButton,
  AdminCard,
  AdminInput,
  AdminLabel,
  AdminSelect,
  AdminTextarea,
} from '../../../components/admin/AdminPageHeader';

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-red-600 mt-1">{message}</p>;
}

function fieldErrorClass(hasError: boolean) {
  return hasError ? 'border-red-300 ring-1 ring-red-100 focus:border-red-400' : '';
}

export default function ExcursionBookingFormPage() {
  const { providerId, excursionId } = useParams<{ providerId: string; excursionId: string }>();
  const location = useLocation();
  const portalMode = location.pathname.includes('/excursion-portal/');
  const navigate = useNavigate();
  const toast = useToast();

  const [formData, setFormData] = useState<ExcursionBookingFormData>(EMPTY_BOOKING_FORM);
  const [excursion, setExcursion] = useState<Excursion | null>(null);
  const [openDates, setOpenDates] = useState<ExcursionAvailability[]>([]);
  const [discounts, setDiscounts] = useState<ExcursionDiscount[]>([]);
  const [loading, setLoading] = useState(true);
  const [availabilityLoading, setAvailabilityLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const listPath =
    providerId && excursionId
      ? adminPath(
          portalMode
            ? portalExcursionBookingsPath(providerId, excursionId)
            : adminExcursionBookingsPath(providerId, excursionId)
        )
      : adminPath('/excursions/providers');

  useEffect(() => {
    if (!providerId || !excursionId) return;

    getDoc(
      doc(db, EXCURSION_PROVIDER_COLLECTION, providerId, EXCURSION_SUBCOLLECTION, excursionId)
    )
      .then((snap) => {
        if (!snap.exists()) {
          toast.error('Excursion not found.');
          navigate(listPath);
          return;
        }
        setExcursion(excursionFromDoc(snap.id, snap.data()));
      })
      .finally(() => setLoading(false));

    const unsubAvail = onSnapshot(
      collection(
        db,
        EXCURSION_PROVIDER_COLLECTION,
        providerId,
        EXCURSION_SUBCOLLECTION,
        excursionId,
        'availability'
      ),
      (snapshot) => {
        const today = new Date().toISOString().slice(0, 10);
        setOpenDates(
          snapshot.docs
            .map((d) => availabilityFromDoc(d.id, d.data()))
            .filter((day) => isAvailabilityDayBookable(day, today))
            .sort((a, b) => a.date.localeCompare(b.date))
        );
        setAvailabilityLoading(false);
      },
      (error) => {
        console.error(error);
        toast.error('Failed to load open dates.');
        setAvailabilityLoading(false);
      }
    );

    const unsubDiscounts = onSnapshot(
      collection(
        db,
        EXCURSION_PROVIDER_COLLECTION,
        providerId,
        EXCURSION_SUBCOLLECTION,
        excursionId,
        'discounts'
      ),
      (snapshot) => {
        setDiscounts(snapshot.docs.map((d) => discountFromDoc(d.id, d.data())));
      }
    );

    return () => {
      unsubAvail();
      unsubDiscounts();
    };
  }, [providerId, excursionId, listPath, navigate, toast]);

  const selectedAvailability = openDates.find((d) => d.date === formData.date) || null;

  const pricePreview = useMemo(() => {
    if (!excursion || !formData.date) return null;
    return calculateBookingPricing({
      excursion,
      dateIso: formData.date,
      availability: selectedAvailability,
      participants: participantCountFromForm(formData),
      discounts,
      promoCode: formData.promoCode,
    });
  }, [excursion, formData, selectedAvailability, discounts]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    if (fieldErrors[name]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!providerId || !excursionId || !excursion) return;

    const errors = validateBookingForm(formData, {
      excursion,
      availability: selectedAvailability,
      discounts,
    });
    if (errors.length > 0) {
      const map: Record<string, string> = {};
      errors.forEach((err) => {
        map[err.field] = err.message;
      });
      setFieldErrors(map);
      toast.error(bookingValidationSummary(errors));
      return;
    }

    const participantCount = totalParticipants(participantCountFromForm(formData));
    if (selectedAvailability && !availabilityHasRoomFor(selectedAvailability, participantCount)) {
      toast.error('Not enough spots left on this date.');
      return;
    }

    setFieldErrors({});
    setIsSubmitting(true);
    try {
      const payload = bookingPayloadFromForm(formData, {
        providerId,
        excursionId,
        excursionTitle: excursion.title,
        excursion,
        availability: selectedAvailability,
        discounts,
        source: portalMode ? 'provider' : 'admin',
      });
      if (!payload) {
        toast.error('Could not calculate pricing for this booking.');
        return;
      }

      const bookingId = await createExcursionBookingRecord(db, payload);
      toast.success(
        payload.status === 'confirmed' ? 'Booking confirmed.' : 'Booking request created.'
      );
      navigate(
        adminPath(
          portalMode
            ? `/excursion-portal/${providerId}/excursions/${excursionId}/bookings/${bookingId}`
            : `/excursions/providers/${providerId}/excursions/${excursionId}/bookings/${bookingId}`
        )
      );
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Failed to create booking.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!providerId || !excursionId) {
    navigate(adminPath('/excursions/providers'));
    return null;
  }

  if (loading || !excursion) {
    return <div className="py-16 text-center text-gray-500 text-sm">Loading…</div>;
  }

  return (
    <div className="admin-page">
      <AdminBackHeader
        backTo={listPath}
        backLabel="Back to bookings"
        title="New booking"
        description={excursion.title}
      />

      {availabilityLoading ? (
        <p className="text-sm text-gray-500 mb-6">Loading open dates…</p>
      ) : openDates.length === 0 ? (
        <AdminAlert variant="warning" title="No bookable dates" className="mb-6">
          Add open availability dates with remaining capacity before creating bookings. Dates
          marked sold out or with no spots left are not listed here.
        </AdminAlert>
      ) : null}

      <form onSubmit={handleSubmit}>
        <AdminCard className="overflow-hidden mb-6">
          <div className="p-6 sm:p-8 space-y-8">
            <section>
              <h3 className="admin-section-title border-0 pb-0 mb-4">Departure</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
                <div>
                  <AdminLabel htmlFor="date">Date *</AdminLabel>
                  <AdminSelect
                    id="date"
                    name="date"
                    value={formData.date}
                    onChange={handleChange}
                    className={fieldErrorClass(Boolean(fieldErrors.date))}
                  >
                    <option value="">Select open date</option>
                    {openDates.map((day) => (
                      <option key={day.date} value={day.date}>
                        {day.date} · {formatAvailabilitySpotsLabel(day)}
                        {day.departureTime ? ` · ${day.departureTime}` : ''}
                      </option>
                    ))}
                  </AdminSelect>
                  <FieldError message={fieldErrors.date} />
                </div>
                <div>
                  <AdminLabel htmlFor="promoCode">Promo code</AdminLabel>
                  <AdminInput
                    id="promoCode"
                    name="promoCode"
                    value={formData.promoCode}
                    onChange={handleChange}
                    className={fieldErrorClass(Boolean(fieldErrors.promoCode))}
                    placeholder="Optional"
                  />
                  <FieldError message={fieldErrors.promoCode} />
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Booking mode:{' '}
                {excursion.bookingMode === 'instant'
                  ? 'Instant confirm (capacity reserved immediately)'
                  : 'Request to confirm (pending until approved)'}
              </p>
            </section>

            <hr className="border-gray-100" />

            <section>
              <h3 className="admin-section-title border-0 pb-0 mb-4">Participants</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-5">
                {(
                  [
                    ['adults', 'Adults'],
                    ['children', 'Children'],
                    ['infants', 'Infants'],
                    ['seniors', 'Seniors'],
                  ] as const
                ).map(([name, label]) => (
                  <div key={name}>
                    <AdminLabel htmlFor={name}>{label}</AdminLabel>
                    <AdminInput
                      id={name}
                      name={name}
                      type="number"
                      min={0}
                      value={formData[name]}
                      onChange={handleChange}
                      className={fieldErrorClass(Boolean(fieldErrors.adults))}
                    />
                  </div>
                ))}
              </div>
              <FieldError message={fieldErrors.adults} />
            </section>

            <hr className="border-gray-100" />

            <section>
              <h3 className="admin-section-title border-0 pb-0 mb-4">Guest details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
                <div>
                  <AdminLabel htmlFor="guestName">Guest name *</AdminLabel>
                  <AdminInput
                    id="guestName"
                    name="guestName"
                    value={formData.guestName}
                    onChange={handleChange}
                    className={fieldErrorClass(Boolean(fieldErrors.guestName))}
                  />
                  <FieldError message={fieldErrors.guestName} />
                </div>
                <div>
                  <AdminLabel htmlFor="guestEmail">Email</AdminLabel>
                  <AdminInput
                    id="guestEmail"
                    name="guestEmail"
                    type="email"
                    value={formData.guestEmail}
                    onChange={handleChange}
                    className={fieldErrorClass(Boolean(fieldErrors.guestEmail))}
                  />
                  <FieldError message={fieldErrors.guestEmail} />
                </div>
                <div>
                  <AdminLabel htmlFor="guestPhone">Phone</AdminLabel>
                  <AdminInput
                    id="guestPhone"
                    name="guestPhone"
                    value={formData.guestPhone}
                    onChange={handleChange}
                  />
                </div>
                <div className="md:col-span-2">
                  <AdminLabel htmlFor="guestNotes">Guest notes</AdminLabel>
                  <AdminTextarea
                    id="guestNotes"
                    name="guestNotes"
                    rows={2}
                    value={formData.guestNotes}
                    onChange={handleChange}
                  />
                </div>
                <div className="md:col-span-2">
                  <AdminLabel htmlFor="internalNotes">Internal notes</AdminLabel>
                  <AdminTextarea
                    id="internalNotes"
                    name="internalNotes"
                    rows={2}
                    value={formData.internalNotes}
                    onChange={handleChange}
                  />
                </div>
              </div>
            </section>

            {pricePreview && (
              <>
                <hr className="border-gray-100" />
                <section>
                  <h3 className="admin-section-title border-0 pb-0 mb-4">Price summary</h3>
                  <div className="rounded-xl border border-gray-100 bg-vailo-surface-elevated/50 p-4 space-y-2 text-sm">
                    {pricePreview.lineItems.map((item) => (
                      <div key={item.type} className="flex justify-between text-gray-600">
                        <span className="capitalize">
                          {item.type} × {item.quantity}
                        </span>
                        <span className="tabular-nums">
                          {formatExcursionPrice(item.lineTotal, pricePreview.currency)}
                        </span>
                      </div>
                    ))}
                    <div className="flex justify-between text-gray-600 pt-2 border-t border-gray-100">
                      <span>Subtotal</span>
                      <span className="tabular-nums">
                        {formatExcursionPrice(pricePreview.subtotal, pricePreview.currency)}
                      </span>
                    </div>
                    {pricePreview.discountTotal > 0 && (
                      <div className="flex justify-between text-emerald-700">
                        <span>Discounts</span>
                        <span className="tabular-nums">
                          −{formatExcursionPrice(pricePreview.discountTotal, pricePreview.currency)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold text-vailo-dark pt-2 border-t border-gray-100">
                      <span>Total</span>
                      <span className="tabular-nums">
                        {formatExcursionPrice(pricePreview.total, pricePreview.currency)}
                      </span>
                    </div>
                  </div>
                </section>
              </>
            )}
          </div>

          <div className="px-6 sm:px-8 py-4 bg-vailo-surface-elevated border-t border-gray-100 flex items-center justify-end gap-3">
            <AdminButton type="button" variant="secondary" onClick={() => navigate(listPath)}>
              Cancel
            </AdminButton>
            <AdminButton type="submit" disabled={isSubmitting || availabilityLoading || openDates.length === 0}>
              {isSubmitting ? 'Saving…' : 'Create booking'}
            </AdminButton>
          </div>
        </AdminCard>
      </form>
    </div>
  );
}
