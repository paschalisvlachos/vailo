import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Calendar,
  CheckCircle2,
  ChevronLeft,
  Loader2,
  Mail,
  Minus,
  Phone,
  Plus,
  Tag,
  User,
  Users,
} from 'lucide-react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { GUEST_PORTAL_Z } from '../../lib/guestPortalLayers';
import { guestBookingNamePrefill } from '../../lib/guestAccess';
import {
  EXCURSION_PROVIDER_COLLECTION,
  EXCURSION_SUBCOLLECTION,
} from '../../lib/excursionProvider';
import { formatExcursionPrice } from '../../lib/excursion';
import {
  availabilityFromDoc,
  availabilityHasRoomFor,
  isAvailabilityDayBookable,
  type ExcursionAvailability,
} from '../../lib/excursionAvailability';
import GuestExcursionDatePicker from './GuestExcursionDatePicker';
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

type ParticipantField = 'adults' | 'children' | 'infants' | 'seniors';

const PARTICIPANT_ROWS: { name: ParticipantField; label: string; hint?: string }[] = [
  { name: 'adults', label: 'Adults', hint: '13+' },
  { name: 'children', label: 'Children', hint: '2–12' },
  { name: 'infants', label: 'Infants', hint: 'Under 2' },
  { name: 'seniors', label: 'Seniors', hint: '65+' },
];

function FieldLabel({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label
      htmlFor={htmlFor}
      className="block text-[11px] font-bold uppercase tracking-[0.14em] text-gray-500 mb-2"
    >
      {children}
    </label>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-red-600 mt-1.5 leading-snug">{message}</p>;
}

function SectionCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-gray-100 bg-[#F8FAFA]">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#0B4F5C]/8 text-[#0B4F5C]">
          {icon}
        </span>
        <h3 className="font-luxury text-base text-[#051F26] font-medium">{title}</h3>
      </div>
      <div className="px-5 py-5 space-y-4">{children}</div>
    </section>
  );
}

function ParticipantStepper({
  label,
  hint,
  value,
  onChange,
  hasError,
}: {
  label: string;
  hint?: string;
  value: number;
  onChange: (next: number) => void;
  hasError?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 ${
        hasError ? 'border-red-200 bg-red-50/40' : 'border-gray-100 bg-[#F8FAFA]'
      }`}
    >
      <div className="min-w-0">
        <p className="text-[15px] font-semibold text-[#051F26]">{label}</p>
        {hint && <p className="text-xs text-gray-500 mt-0.5">{hint}</p>}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <button
          type="button"
          onClick={() => onChange(Math.max(0, value - 1))}
          disabled={value <= 0}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-[#051F26] disabled:opacity-35 hover:border-[#0B4F5C]/30 transition-colors"
          aria-label={`Decrease ${label}`}
        >
          <Minus size={16} />
        </button>
        <span className="w-6 text-center text-base font-semibold text-[#051F26] tabular-nums">
          {value}
        </span>
        <button
          type="button"
          onClick={() => onChange(value + 1)}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-[#0B4F5C]/20 bg-[#0B4F5C] text-white hover:bg-[#083A43] transition-colors"
          aria-label={`Increase ${label}`}
        >
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
}

export default function GuestExcursionBookingSheet({ listing, onClose }: Props) {
  const { providerId, excursion, providerName } = listing;
  const excursionId = excursion.id!;

  const [formData, setFormData] = useState<ExcursionBookingFormData>(() => ({
    ...EMPTY_BOOKING_FORM,
    guestName: guestBookingNamePrefill(),
  }));
  const [openDates, setOpenDates] = useState<ExcursionAvailability[]>([]);
  const [discounts, setDiscounts] = useState<ExcursionDiscount[]>([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successStatus, setSuccessStatus] = useState<'confirmed' | 'pending' | null>(null);
  const [promoOpen, setPromoOpen] = useState(false);

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
            .filter((day) => isAvailabilityDayBookable(day, today))
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

  const clearFieldError = (name: string) => {
    if (!fieldErrors[name]) return;
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  };

  const setParticipant = (name: ParticipantField, value: number) => {
    clearFieldError('adults');
    setSubmitError(null);
    setFormData((prev) => ({ ...prev, [name]: String(value) }));
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    clearFieldError(name);
    setSubmitError(null);
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const selectDate = (date: string) => {
    clearFieldError('date');
    setSubmitError(null);
    setFormData((prev) => ({ ...prev, date }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    const errors = validateBookingForm(formData, {
      excursion,
      availability: selectedAvailability,
      discounts,
      requireGuestContact: true,
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
    if (selectedAvailability && !availabilityHasRoomFor(selectedAvailability, participantCount)) {
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

  const inputBase = (field: string) =>
    `text-base py-3 min-h-[48px] rounded-xl outline-none w-full border bg-white transition-colors ${
      fieldErrors[field]
        ? 'border-red-300 ring-2 ring-red-100'
        : 'border-gray-200 focus:border-[#0B4F5C]/40 focus:ring-2 focus:ring-[#0B4F5C]/10'
    }`;

  const iconInputClass = (field: string) => `${inputBase(field)} pl-[3.25rem] pr-4`;

  return createPortal(
    <div
      className={`fixed inset-0 ${GUEST_PORTAL_Z.detailSheet} flex items-end sm:items-center justify-center bg-[#051F26]/60 backdrop-blur-md p-0 sm:p-5`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="excursion-booking-title"
      onClick={onClose}
    >
      <div
        className="bg-[#F3F4F6] w-full sm:max-w-lg max-h-[94vh] rounded-t-[28px] sm:rounded-[28px] shadow-[0_24px_80px_rgba(5,31,38,0.35)] flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-1 sm:hidden shrink-0 bg-[#F3F4F6]">
          <div className="w-10 h-1 rounded-full bg-gray-300/80" aria-hidden />
        </div>

        <div className="shrink-0 px-5 pt-2 pb-4 bg-[#F3F4F6]">
          <div className="flex items-start gap-3">
            <button
              type="button"
              onClick={onClose}
              className="mt-0.5 p-2 rounded-xl text-gray-400 hover:text-[#0B4F5C] hover:bg-white shrink-0"
              aria-label="Close"
            >
              <ChevronLeft size={20} />
            </button>
            <div className="flex-1 min-w-0 flex gap-3">
              <div className="h-14 w-14 rounded-xl overflow-hidden bg-gray-200 shrink-0 border border-white shadow-sm">
                {excursion.heroPhotoUrl ? (
                  <img src={excursion.heroPhotoUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full flex items-center justify-center text-[#C5A059]">
                    <Calendar size={20} />
                  </div>
                )}
              </div>
              <div className="min-w-0 pt-0.5">
                <p className="guest-eyebrow mb-1">
                  {successStatus ? 'Complete' : 'Book experience'}
                </p>
                <h2
                  id="excursion-booking-title"
                  className="font-luxury text-lg text-[#051F26] font-medium leading-snug line-clamp-2"
                >
                  {successStatus
                    ? successStatus === 'confirmed'
                      ? "You're booked!"
                      : 'Request sent'
                    : excursion.title}
                </h2>
                {!successStatus && (
                  <p className="text-xs text-gray-500 mt-1 truncate">with {providerName}</p>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 overscroll-contain px-5 pb-4">
          {successStatus ? (
            <div className="rounded-2xl bg-white border border-gray-100 shadow-sm px-6 py-8 text-center">
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[#0B4F5C]/10 text-[#0B4F5C]">
                <CheckCircle2 size={36} strokeWidth={1.75} />
              </div>
              <p className="font-luxury text-2xl text-[#051F26] mb-3">
                {successStatus === 'confirmed' ? 'Booking confirmed' : 'Request received'}
              </p>
              <p className="text-[15px] text-gray-600 leading-[1.7] max-w-sm mx-auto">
                {successStatus === 'confirmed'
                  ? `Your place on ${excursion.title} is reserved. ${providerName} may reach out with meeting details shortly.`
                  : `We've sent your request for ${excursion.title} to ${providerName}. You'll hear back once it's confirmed.`}
              </p>
            </div>
          ) : availabilityLoading ? (
            <div className="rounded-2xl bg-white border border-gray-100 shadow-sm px-6 py-12 text-center">
              <Loader2 size={28} className="mx-auto animate-spin text-[#0B4F5C] mb-3" />
              <p className="text-sm text-gray-500">Loading available dates…</p>
            </div>
          ) : openDates.length === 0 ? (
            <div className="rounded-2xl bg-amber-50 border border-amber-100 px-5 py-5 text-[15px] text-amber-900 leading-relaxed">
              No bookable dates right now. Check back later or ask your host for help.
            </div>
          ) : (
            <form id="guest-excursion-booking-form" onSubmit={handleSubmit} className="space-y-4">
              <SectionCard title="Choose a date" icon={<Calendar size={16} />}>
                <GuestExcursionDatePicker
                  excursion={excursion}
                  openDates={openDates}
                  selectedDate={formData.date}
                  onSelect={selectDate}
                  hasError={Boolean(fieldErrors.date)}
                />
                <FieldError message={fieldErrors.date} />
              </SectionCard>

              <SectionCard title="Guests" icon={<Users size={16} />}>
                <div className="space-y-2.5">
                  {PARTICIPANT_ROWS.map(({ name, label, hint }) => (
                    <ParticipantStepper
                      key={name}
                      label={label}
                      hint={hint}
                      value={parseInt(formData[name], 10) || 0}
                      onChange={(next) => setParticipant(name, next)}
                      hasError={Boolean(fieldErrors.adults)}
                    />
                  ))}
                </div>
                <FieldError message={fieldErrors.adults} />
              </SectionCard>

              <SectionCard title="Your details" icon={<User size={16} />}>
                <p className="text-sm text-gray-500 leading-relaxed -mt-1 mb-1">
                  The provider needs these to confirm your booking and reach you on the day.
                </p>
                <div>
                  <FieldLabel htmlFor="guestName">Full name *</FieldLabel>
                  <div className="relative">
                    <User
                      size={16}
                      className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none z-10"
                    />
                    <input
                      id="guestName"
                      name="guestName"
                      value={formData.guestName}
                      onChange={handleChange}
                      autoComplete="name"
                      placeholder="As on your ID or booking"
                      className={iconInputClass('guestName')}
                    />
                  </div>
                  <FieldError message={fieldErrors.guestName} />
                </div>
                <div>
                  <FieldLabel htmlFor="guestEmail">Email *</FieldLabel>
                  <div className="relative">
                    <Mail
                      size={16}
                      className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none z-10"
                    />
                    <input
                      id="guestEmail"
                      name="guestEmail"
                      type="email"
                      value={formData.guestEmail}
                      onChange={handleChange}
                      autoComplete="email"
                      placeholder="you@example.com"
                      className={iconInputClass('guestEmail')}
                    />
                  </div>
                  <FieldError message={fieldErrors.guestEmail} />
                </div>
                <div>
                  <FieldLabel htmlFor="guestPhone">Phone *</FieldLabel>
                  <div className="relative">
                    <Phone
                      size={16}
                      className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none z-10"
                    />
                    <input
                      id="guestPhone"
                      name="guestPhone"
                      type="tel"
                      value={formData.guestPhone}
                      onChange={handleChange}
                      autoComplete="tel"
                      placeholder="Include country code if abroad"
                      className={iconInputClass('guestPhone')}
                    />
                  </div>
                  <FieldError message={fieldErrors.guestPhone} />
                </div>
                <div>
                  <FieldLabel htmlFor="guestNotes">Notes</FieldLabel>
                  <textarea
                    id="guestNotes"
                    name="guestNotes"
                    rows={3}
                    value={formData.guestNotes}
                    onChange={handleChange}
                    placeholder="Pickup location, dietary needs, questions…"
                    className={`${inputBase('guestNotes')} px-4 resize-none py-3 min-h-[96px]`}
                  />
                </div>
              </SectionCard>

              <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden">
                <button
                  type="button"
                  onClick={() => setPromoOpen((v) => !v)}
                  className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-[#F8FAFA] transition-colors"
                >
                  <span className="flex items-center gap-2.5 text-sm font-semibold text-[#051F26]">
                    <Tag size={16} className="text-[#C5A059]" />
                    Have a promo code?
                  </span>
                  <span className="text-xs font-bold uppercase tracking-wide text-[#0B4F5C]">
                    {promoOpen ? 'Hide' : 'Add'}
                  </span>
                </button>
                {promoOpen && (
                  <div className="px-5 pb-5 border-t border-gray-100">
                    <FieldLabel htmlFor="promoCode">Promo code</FieldLabel>
                    <input
                      id="promoCode"
                      name="promoCode"
                      value={formData.promoCode}
                      onChange={handleChange}
                      placeholder="Enter code"
                      className={`${inputBase('promoCode')} px-4`}
                    />
                    <FieldError message={fieldErrors.promoCode} />
                  </div>
                )}
              </div>

              {submitError && (
                <p className="text-sm text-red-600 text-center px-2 leading-relaxed">{submitError}</p>
              )}
            </form>
          )}
        </div>

        {!successStatus && !availabilityLoading && openDates.length > 0 && (
          <div className="shrink-0 border-t border-gray-200/80 bg-white/95 backdrop-blur-md px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-8px_32px_rgba(5,31,38,0.06)]">
            {pricePreview && formData.date ? (
              <div className="mb-3 rounded-xl bg-[#F8FAFA] border border-gray-100 px-4 py-3">
                <div className="flex justify-between text-sm text-gray-600 mb-1">
                  <span>Subtotal</span>
                  <span>{formatExcursionPrice(pricePreview.subtotal, pricePreview.currency)}</span>
                </div>
                {pricePreview.discountTotal > 0 && (
                  <div className="flex justify-between text-sm text-[#0B4F5C] mb-1">
                    <span>Discount</span>
                    <span>
                      −{formatExcursionPrice(pricePreview.discountTotal, pricePreview.currency)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-baseline pt-2 border-t border-gray-200/80">
                  <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Total</span>
                  <span className="font-luxury text-2xl text-[#051F26] font-medium">
                    {formatExcursionPrice(pricePreview.total, pricePreview.currency)}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500 mb-3 text-center">
                Select a date and guests to see your total
              </p>
            )}

            <p className="text-xs text-gray-500 text-center mb-3 leading-relaxed">
              {excursion.bookingMode === 'instant'
                ? 'Instant booking — your spot is reserved as soon as you confirm.'
                : 'Request to book — the provider will confirm within 24 hours.'}
            </p>

            <button
              type="submit"
              form="guest-excursion-booking-form"
              disabled={isSubmitting}
              className="guest-btn-action w-full flex items-center justify-center gap-2 bg-[#0B4F5C] text-white hover:bg-[#083A43] shadow-[0_4px_20px_rgba(11,79,92,0.25)] disabled:opacity-60"
            >
              {isSubmitting && <Loader2 size={18} className="animate-spin" />}
              {excursion.bookingMode === 'instant' ? 'Confirm booking' : 'Send request'}
            </button>
          </div>
        )}

        {successStatus && (
          <div className="shrink-0 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] bg-white border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="guest-btn-action w-full bg-[#0B4F5C] text-white hover:bg-[#083A43]"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
