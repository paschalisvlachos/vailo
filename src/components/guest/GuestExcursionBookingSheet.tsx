import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Loader2, X } from 'lucide-react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { GUEST_PORTAL_Z } from '../../lib/guestPortalLayers';
import { readGuestPortalSession } from '../../lib/guestAccess';
import {
  EXCURSION_PROVIDER_COLLECTION,
  EXCURSION_SUBCOLLECTION,
} from '../../lib/excursionProvider';
import { formatExcursionPrice } from '../../lib/excursion';
import {
  availabilityFromDoc,
  availabilityRemaining,
  type ExcursionAvailability,
} from '../../lib/excursionAvailability';
import { discountFromDoc, type ExcursionDiscount } from '../../lib/excursionDiscount';
import {
  EMPTY_BOOKING_FORM,
  bookingPayloadFromForm,
  bookingValidationSummary,
  calculateBookingPricing,
  participantCountFromForm,
  totalParticipants,
  validateBookingForm,
  type ExcursionBookingFormData,
} from '../../lib/excursionBooking';
import { createExcursionBookingRecord } from '../../lib/excursionBookingService';
import type { GuestExcursionListing } from '../../lib/guestExcursions';

type Props = {
  listing: GuestExcursionListing;
  onClose: () => void;
};

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-red-600 mt-1">{message}</p>;
}

export default function GuestExcursionBookingSheet({ listing, onClose }: Props) {
  const { providerId, excursion } = listing;
  const excursionId = excursion.id!;

  const [formData, setFormData] = useState<ExcursionBookingFormData>(() => {
    const session = readGuestPortalSession();
    return {
      ...EMPTY_BOOKING_FORM,
      guestName: session?.guestName?.trim() || '',
    };
  });
  const [openDates, setOpenDates] = useState<ExcursionAvailability[]>([]);
  const [discounts, setDiscounts] = useState<ExcursionDiscount[]>([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successStatus, setSuccessStatus] = useState<'confirmed' | 'pending' | null>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
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
            .filter(
              (day) =>
                day.status === 'open' &&
                day.date >= today &&
                availabilityRemaining(day) > 0
            )
            .sort((a, b) => a.date.localeCompare(b.date))
        );
        setAvailabilityLoading(false);
      },
      () => setAvailabilityLoading(false)
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
  }, [providerId, excursionId]);

  const selectedAvailability =
    openDates.find((d) => d.date === formData.date) || null;

  const pricePreview = useMemo(() => {
    if (!formData.date) return null;
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
    setSubmitError(null);
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

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
      setSubmitError(bookingValidationSummary(errors));
      return;
    }

    const participantCount = totalParticipants(participantCountFromForm(formData));
    if (selectedAvailability && participantCount > availabilityRemaining(selectedAvailability)) {
      setSubmitError('Not enough spots left on this date.');
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
        source: 'guest',
      });
      if (!payload) {
        setSubmitError('Could not calculate pricing for this booking.');
        return;
      }

      await createExcursionBookingRecord(db, payload);
      setSuccessStatus(payload.status === 'confirmed' ? 'confirmed' : 'pending');
    } catch (error) {
      console.error(error);
      setSubmitError(error instanceof Error ? error.message : 'Failed to create booking.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div
      className={`fixed inset-0 ${GUEST_PORTAL_Z.detailSheet} flex items-end sm:items-center justify-center bg-[#051F26]/55 backdrop-blur-sm p-0 sm:p-4`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="excursion-booking-title"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-md max-h-[92vh] rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-2.5 pb-1 sm:hidden shrink-0 bg-white">
          <div className="w-10 h-1 rounded-full bg-gray-200" aria-hidden />
        </div>

        <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-100 bg-white">
          <h2
            id="excursion-booking-title"
            className="font-luxury text-lg text-[#051F26] font-medium truncate flex-1 min-w-0"
          >
            {successStatus ? 'Booking submitted' : 'Book excursion'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-gray-400 hover:text-[#0B4F5C] hover:bg-gray-50 shrink-0"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
          {successStatus ? (
            <div className="text-center py-6">
              <CheckCircle2 size={48} className="mx-auto text-[#0B4F5C] mb-4" />
              <p className="font-luxury text-xl text-[#051F26] mb-2">
                {successStatus === 'confirmed' ? "You're booked!" : 'Request sent'}
              </p>
              <p className="text-sm text-gray-600 leading-relaxed mb-6">
                {successStatus === 'confirmed'
                  ? `Your booking for ${excursion.title} is confirmed. The provider may contact you with meeting details.`
                  : `Your booking request for ${excursion.title} is pending. The provider will confirm shortly.`}
              </p>
              <button type="button" onClick={onClose} className="guest-btn-action w-full">
                Done
              </button>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-500 text-center mb-5">{excursion.title}</p>

              {availabilityLoading ? (
                <p className="text-sm text-gray-500 text-center py-8">Loading open dates…</p>
              ) : openDates.length === 0 ? (
                <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 mb-4">
                  No bookable dates right now. Check back later or ask your host.
                </p>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div>
                    <label
                      htmlFor="date"
                      className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5"
                    >
                      Departure date *
                    </label>
                    <select
                      id="date"
                      name="date"
                      value={formData.date}
                      onChange={handleChange}
                      className={`guest-input w-full ${fieldErrors.date ? 'border-red-300' : ''}`}
                    >
                      <option value="">Select date</option>
                      {openDates.map((day) => (
                        <option key={day.date} value={day.date}>
                          {day.date} · {availabilityRemaining(day)} spots
                          {day.departureTime ? ` · ${day.departureTime}` : ''}
                        </option>
                      ))}
                    </select>
                    <FieldError message={fieldErrors.date} />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {(
                      [
                        ['adults', 'Adults'],
                        ['children', 'Children'],
                        ['infants', 'Infants'],
                        ['seniors', 'Seniors'],
                      ] as const
                    ).map(([name, label]) => (
                      <div key={name}>
                        <label
                          htmlFor={name}
                          className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5"
                        >
                          {label}
                        </label>
                        <input
                          id={name}
                          name={name}
                          type="number"
                          min={0}
                          value={formData[name]}
                          onChange={handleChange}
                          className={`guest-input w-full ${fieldErrors.adults ? 'border-red-300' : ''}`}
                        />
                      </div>
                    ))}
                  </div>
                  <FieldError message={fieldErrors.adults} />

                  <div>
                    <label
                      htmlFor="promoCode"
                      className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5"
                    >
                      Promo code
                    </label>
                    <input
                      id="promoCode"
                      name="promoCode"
                      value={formData.promoCode}
                      onChange={handleChange}
                      placeholder="Optional"
                      className="guest-input w-full"
                    />
                    <FieldError message={fieldErrors.promoCode} />
                  </div>

                  <div className="border-t border-gray-100 pt-4 space-y-3">
                    <div>
                      <label
                        htmlFor="guestName"
                        className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5"
                      >
                        Your name *
                      </label>
                      <input
                        id="guestName"
                        name="guestName"
                        value={formData.guestName}
                        onChange={handleChange}
                        className={`guest-input w-full ${fieldErrors.guestName ? 'border-red-300' : ''}`}
                      />
                      <FieldError message={fieldErrors.guestName} />
                    </div>
                    <div>
                      <label
                        htmlFor="guestEmail"
                        className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5"
                      >
                        Email
                      </label>
                      <input
                        id="guestEmail"
                        name="guestEmail"
                        type="email"
                        value={formData.guestEmail}
                        onChange={handleChange}
                        className="guest-input w-full"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="guestPhone"
                        className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5"
                      >
                        Phone
                      </label>
                      <input
                        id="guestPhone"
                        name="guestPhone"
                        type="tel"
                        value={formData.guestPhone}
                        onChange={handleChange}
                        className="guest-input w-full"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="guestNotes"
                        className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5"
                      >
                        Notes
                      </label>
                      <textarea
                        id="guestNotes"
                        name="guestNotes"
                        rows={2}
                        value={formData.guestNotes}
                        onChange={handleChange}
                        placeholder="Special requests, pickup details…"
                        className="guest-input w-full resize-none"
                      />
                    </div>
                  </div>

                  {pricePreview && (
                    <div className="rounded-xl bg-[#0B4F5C]/5 border border-[#0B4F5C]/10 px-4 py-3 text-sm">
                      <div className="flex justify-between text-gray-600 mb-1">
                        <span>Subtotal</span>
                        <span>
                          {formatExcursionPrice(pricePreview.subtotal, pricePreview.currency)}
                        </span>
                      </div>
                      {pricePreview.discountTotal > 0 && (
                        <div className="flex justify-between text-[#0B4F5C] mb-1">
                          <span>Discount</span>
                          <span>
                            −
                            {formatExcursionPrice(
                              pricePreview.discountTotal,
                              pricePreview.currency
                            )}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between font-semibold text-[#051F26] pt-2 border-t border-[#0B4F5C]/10">
                        <span>Total</span>
                        <span>
                          {formatExcursionPrice(pricePreview.total, pricePreview.currency)}
                        </span>
                      </div>
                    </div>
                  )}

                  <p className="text-xs text-gray-500">
                    {excursion.bookingMode === 'instant'
                      ? 'Instant booking — your spot is reserved immediately.'
                      : 'Request to book — the provider will confirm your request.'}
                  </p>

                  {submitError && (
                    <p className="text-sm text-red-600 text-center">{submitError}</p>
                  )}

                  <button
                    type="submit"
                    disabled={isSubmitting || openDates.length === 0}
                    className="guest-btn-action w-full flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    {isSubmitting && <Loader2 size={18} className="animate-spin" />}
                    {excursion.bookingMode === 'instant' ? 'Book now' : 'Send request'}
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
