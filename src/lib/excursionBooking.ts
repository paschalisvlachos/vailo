import type { Excursion, ExcursionParticipantPrices } from './excursion';
import type { ExcursionAvailability } from './excursionAvailability';
import { resolvePricesForDate } from './excursionAvailability';
import type { ExcursionDiscount, ExcursionDiscountParticipant } from './excursionDiscount';
import { formatPromoCode } from './excursionDiscount';

export const EXCURSION_BOOKINGS_SUBCOLLECTION = 'bookings';

export type ExcursionBookingStatus = 'pending' | 'confirmed' | 'cancelled' | 'declined';

export type ExcursionBookingSource = 'admin' | 'provider' | 'guest';

export type ExcursionBookingParticipants = {
  adult: number;
  child: number;
  infant: number;
  senior: number;
};

export type ExcursionBookingLineItem = {
  type: ExcursionDiscountParticipant;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type ExcursionBookingPricing = {
  currency: string;
  subtotal: number;
  discountTotal: number;
  total: number;
  lineItems: ExcursionBookingLineItem[];
  appliedDiscountIds: string[];
  promoCode?: string;
  promoDiscountId?: string;
};

export type ExcursionBooking = {
  id?: string;
  providerId: string;
  excursionId: string;
  excursionTitle?: string;
  date: string;
  status: ExcursionBookingStatus;
  source: ExcursionBookingSource;
  guestName: string;
  guestEmail?: string;
  guestPhone?: string;
  guestNotes?: string;
  participants: ExcursionBookingParticipants;
  participantCount: number;
  pricing: ExcursionBookingPricing;
  internalNotes?: string;
  confirmedAt?: string;
  cancelledAt?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type ExcursionBookingFormData = {
  date: string;
  adults: string;
  children: string;
  infants: string;
  seniors: string;
  promoCode: string;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  guestNotes: string;
  internalNotes: string;
};

export const EMPTY_BOOKING_FORM: ExcursionBookingFormData = {
  date: '',
  adults: '1',
  children: '0',
  infants: '0',
  seniors: '0',
  promoCode: '',
  guestName: '',
  guestEmail: '',
  guestPhone: '',
  guestNotes: '',
  internalNotes: '',
};

export function adminProviderBookingsPath(providerId: string): string {
  return `/excursions/providers/${providerId}/bookings`;
}

export function portalProviderBookingsPath(providerId: string): string {
  return `/excursion-portal/${providerId}/bookings`;
}

export function adminExcursionBookingsPath(providerId: string, excursionId: string): string {
  return `/excursions/providers/${providerId}/excursions/${excursionId}/bookings`;
}

export function adminExcursionBookingAddPath(providerId: string, excursionId: string): string {
  return `/excursions/providers/${providerId}/excursions/${excursionId}/bookings/add`;
}

export function adminExcursionBookingDetailPath(
  providerId: string,
  excursionId: string,
  bookingId: string
): string {
  return `/excursions/providers/${providerId}/excursions/${excursionId}/bookings/${bookingId}`;
}

export function portalExcursionBookingsPath(providerId: string, excursionId: string): string {
  return `/excursion-portal/${providerId}/excursions/${excursionId}/bookings`;
}

export function portalExcursionBookingAddPath(providerId: string, excursionId: string): string {
  return `/excursion-portal/${providerId}/excursions/${excursionId}/bookings/add`;
}

export function portalExcursionBookingDetailPath(
  providerId: string,
  excursionId: string,
  bookingId: string
): string {
  return `/excursion-portal/${providerId}/excursions/${excursionId}/bookings/${bookingId}`;
}

export function bookingStatusLabel(status: ExcursionBookingStatus): string {
  switch (status) {
    case 'confirmed':
      return 'Confirmed';
    case 'pending':
      return 'Pending';
    case 'declined':
      return 'Declined';
    default:
      return 'Cancelled';
  }
}

export function participantCountFromForm(form: ExcursionBookingFormData): ExcursionBookingParticipants {
  return {
    adult: parseInt(form.adults, 10) || 0,
    child: parseInt(form.children, 10) || 0,
    infant: parseInt(form.infants, 10) || 0,
    senior: parseInt(form.seniors, 10) || 0,
  };
}

export function totalParticipants(participants: ExcursionBookingParticipants): number {
  return participants.adult + participants.child + participants.infant + participants.senior;
}

function unitPriceForType(
  prices: ExcursionParticipantPrices,
  type: ExcursionDiscountParticipant
): number {
  if (type === 'adult') return prices.adult;
  if (type === 'child') return prices.child ?? prices.adult;
  if (type === 'infant') return prices.infant ?? 0;
  return prices.senior ?? prices.adult;
}

function isDiscountValidForDate(
  discount: ExcursionDiscount,
  dateIso: string
): boolean {
  if (discount.status !== 'active') return false;
  if (discount.validFrom && dateIso < discount.validFrom) return false;
  if (discount.validTo && dateIso > discount.validTo) return false;
  return true;
}

function discountAppliesToParticipant(
  discount: ExcursionDiscount,
  type: ExcursionDiscountParticipant
): boolean {
  if (!discount.appliesTo || discount.appliesTo.length === 0) return true;
  return discount.appliesTo.includes(type);
}

function discountAmount(
  discount: ExcursionDiscount,
  amount: number
): number {
  if (amount <= 0) return 0;
  if (discount.valueType === 'percent') {
    return Math.min(amount, (amount * discount.value) / 100);
  }
  return Math.min(amount, discount.value);
}

export function findBestGroupDiscount(
  discounts: ExcursionDiscount[],
  dateIso: string,
  participantCount: number
): ExcursionDiscount | undefined {
  return discounts
    .filter(
      (d) =>
        d.type === 'group_size' &&
        isDiscountValidForDate(d, dateIso) &&
        (d.minParticipants == null || participantCount >= d.minParticipants) &&
        (d.maxParticipants == null || participantCount <= d.maxParticipants)
    )
    .sort((a, b) => {
      const aMin = a.minParticipants ?? 0;
      const bMin = b.minParticipants ?? 0;
      if (bMin !== aMin) return bMin - aMin;
      return b.value - a.value;
    })[0];
}

export function findPromoDiscount(
  discounts: ExcursionDiscount[],
  dateIso: string,
  promoCode: string
): ExcursionDiscount | undefined {
  const code = formatPromoCode(promoCode);
  if (!code) return undefined;
  return discounts.find(
    (d) =>
      d.type === 'promo_code' &&
      d.code?.toUpperCase() === code &&
      isDiscountValidForDate(d, dateIso) &&
      (d.maxUses == null || (d.usedCount || 0) < d.maxUses)
  );
}

export function calculateBookingPricing(input: {
  excursion: Pick<Excursion, 'currency' | 'seasonPrices'>;
  dateIso: string;
  availability?: Pick<ExcursionAvailability, 'priceOverrides'> | null;
  participants: ExcursionBookingParticipants;
  discounts: ExcursionDiscount[];
  promoCode?: string;
}): ExcursionBookingPricing | null {
  const prices = resolvePricesForDate(input.excursion, input.dateIso, input.availability);
  if (!prices) return null;

  const lineItems: ExcursionBookingLineItem[] = [];
  const types: ExcursionDiscountParticipant[] = ['adult', 'child', 'infant', 'senior'];
  for (const type of types) {
    const quantity = input.participants[type];
    if (quantity <= 0) continue;
    const unitPrice = unitPriceForType(prices, type);
    lineItems.push({
      type,
      quantity,
      unitPrice,
      lineTotal: unitPrice * quantity,
    });
  }

  const subtotal = lineItems.reduce((sum, item) => sum + item.lineTotal, 0);
  const participantCount = totalParticipants(input.participants);
  const appliedDiscountIds: string[] = [];
  let discountTotal = 0;

  const groupDiscount = findBestGroupDiscount(input.discounts, input.dateIso, participantCount);
  if (groupDiscount) {
    const discountable = lineItems
      .filter((item) => discountAppliesToParticipant(groupDiscount, item.type))
      .reduce((sum, item) => sum + item.lineTotal, 0);
    const amount = discountAmount(groupDiscount, discountable);
    if (amount > 0) {
      discountTotal += amount;
      appliedDiscountIds.push(groupDiscount.id!);
    }
  }

  const promoDiscount = findPromoDiscount(
    input.discounts,
    input.dateIso,
    input.promoCode || ''
  );
  if (promoDiscount) {
    const discountable = lineItems
      .filter((item) => discountAppliesToParticipant(promoDiscount, item.type))
      .reduce((sum, item) => sum + item.lineTotal, 0);
    const amount = discountAmount(promoDiscount, discountable);
    if (amount > 0) {
      discountTotal += amount;
      if (promoDiscount.id) appliedDiscountIds.push(promoDiscount.id);
    }
  }

  discountTotal = Math.min(subtotal, discountTotal);

  const pricing: ExcursionBookingPricing = {
    currency: input.excursion.currency || 'EUR',
    subtotal,
    discountTotal,
    total: Math.max(0, subtotal - discountTotal),
    lineItems,
    appliedDiscountIds,
  };
  if (promoDiscount?.code) pricing.promoCode = promoDiscount.code;
  if (promoDiscount?.id) pricing.promoDiscountId = promoDiscount.id;
  return pricing;
}

export function bookingFromDoc(id: string, data: Record<string, unknown>): ExcursionBooking {
  const participants = (data.participants || {}) as Record<string, unknown>;
  const pricingRaw = (data.pricing || {}) as Record<string, unknown>;
  const lineItems = Array.isArray(pricingRaw.lineItems)
    ? pricingRaw.lineItems.map((item) => {
        const row = item as Record<string, unknown>;
        return {
          type: row.type as ExcursionDiscountParticipant,
          quantity: Number(row.quantity) || 0,
          unitPrice: Number(row.unitPrice) || 0,
          lineTotal: Number(row.lineTotal) || 0,
        };
      })
    : [];

  return {
    id,
    providerId: String(data.providerId || ''),
    excursionId: String(data.excursionId || ''),
    excursionTitle: data.excursionTitle ? String(data.excursionTitle) : undefined,
    date: String(data.date || ''),
    status:
      data.status === 'confirmed' ||
      data.status === 'cancelled' ||
      data.status === 'declined'
        ? data.status
        : 'pending',
    source:
      data.source === 'provider' || data.source === 'guest' ? data.source : 'admin',
    guestName: String(data.guestName || ''),
    guestEmail: data.guestEmail ? String(data.guestEmail) : undefined,
    guestPhone: data.guestPhone ? String(data.guestPhone) : undefined,
    guestNotes: data.guestNotes ? String(data.guestNotes) : undefined,
    participants: {
      adult: Number(participants.adult) || 0,
      child: Number(participants.child) || 0,
      infant: Number(participants.infant) || 0,
      senior: Number(participants.senior) || 0,
    },
    participantCount: Number(data.participantCount) || 0,
    pricing: {
      currency: String(pricingRaw.currency || 'EUR'),
      subtotal: Number(pricingRaw.subtotal) || 0,
      discountTotal: Number(pricingRaw.discountTotal) || 0,
      total: Number(pricingRaw.total) || 0,
      lineItems,
      appliedDiscountIds: Array.isArray(pricingRaw.appliedDiscountIds)
        ? pricingRaw.appliedDiscountIds.map(String)
        : [],
      promoCode: pricingRaw.promoCode ? String(pricingRaw.promoCode) : undefined,
      promoDiscountId: pricingRaw.promoDiscountId
        ? String(pricingRaw.promoDiscountId)
        : undefined,
    },
    internalNotes: data.internalNotes ? String(data.internalNotes) : undefined,
    confirmedAt: data.confirmedAt ? String(data.confirmedAt) : undefined,
    cancelledAt: data.cancelledAt ? String(data.cancelledAt) : undefined,
    createdAt: data.createdAt ? String(data.createdAt) : undefined,
    updatedAt: data.updatedAt ? String(data.updatedAt) : undefined,
  };
}

export function bookingPayloadFromForm(
  form: ExcursionBookingFormData,
  ctx: {
    providerId: string;
    excursionId: string;
    excursionTitle: string;
    excursion: Excursion;
    availability: ExcursionAvailability | null;
    discounts: ExcursionDiscount[];
    source: ExcursionBookingSource;
  }
): Omit<ExcursionBooking, 'id'> | null {
  const participants = participantCountFromForm(form);
  const participantCount = totalParticipants(participants);
  const pricing = calculateBookingPricing({
    excursion: ctx.excursion,
    dateIso: form.date.trim(),
    availability: ctx.availability,
    participants,
    discounts: ctx.discounts,
    promoCode: form.promoCode,
  });
  if (!pricing) return null;

  const initialStatus: ExcursionBookingStatus =
    ctx.excursion.bookingMode === 'instant' ? 'confirmed' : 'pending';

  return {
    providerId: ctx.providerId,
    excursionId: ctx.excursionId,
    excursionTitle: ctx.excursionTitle,
    date: form.date.trim(),
    status: initialStatus,
    source: ctx.source,
    guestName: form.guestName.trim(),
    guestEmail: form.guestEmail.trim() || undefined,
    guestPhone: form.guestPhone.trim() || undefined,
    guestNotes: form.guestNotes.trim() || undefined,
    participants,
    participantCount,
    pricing,
    internalNotes: form.internalNotes.trim() || undefined,
    confirmedAt: initialStatus === 'confirmed' ? new Date().toISOString() : undefined,
  };
}

export type ExcursionBookingFieldError = {
  field: string;
  label: string;
  message: string;
};

export function validateBookingForm(
  form: ExcursionBookingFormData,
  ctx: {
    excursion: Excursion;
    availability: ExcursionAvailability | null;
    discounts: ExcursionDiscount[];
  }
): ExcursionBookingFieldError[] {
  const errors: ExcursionBookingFieldError[] = [];
  const participants = participantCountFromForm(form);
  const participantCount = totalParticipants(participants);

  if (!form.date.trim()) {
    errors.push({ field: 'date', label: 'Date', message: 'Select a departure date.' });
  }

  if (!form.guestName.trim()) {
    errors.push({ field: 'guestName', label: 'Guest name', message: 'Guest name is required.' });
  }

  if (participantCount <= 0) {
    errors.push({
      field: 'adults',
      label: 'Participants',
      message: 'Add at least one participant.',
    });
  }

  const minP = ctx.excursion.minParticipants ?? 1;
  const maxP = ctx.excursion.maxParticipants;
  if (participantCount < minP) {
    errors.push({
      field: 'adults',
      label: 'Participants',
      message: `Minimum ${minP} participant${minP !== 1 ? 's' : ''} required.`,
    });
  }
  if (maxP != null && participantCount > maxP) {
    errors.push({
      field: 'adults',
      label: 'Participants',
      message: `Maximum ${maxP} participants allowed.`,
    });
  }

  if (form.date.trim()) {
    if (!ctx.availability) {
      errors.push({
        field: 'date',
        label: 'Date',
        message: 'This date is not open for booking.',
      });
    } else if (ctx.availability.status !== 'open') {
      errors.push({
        field: 'date',
        label: 'Date',
        message: 'This date is not open for booking.',
      });
    } else if (!resolvePricesForDate(ctx.excursion, form.date.trim(), ctx.availability)) {
      errors.push({
        field: 'date',
        label: 'Date',
        message: 'No pricing available for this date.',
      });
    }
  }

  if (form.promoCode.trim()) {
    const promo = findPromoDiscount(ctx.discounts, form.date.trim(), form.promoCode);
    if (!promo) {
      errors.push({
        field: 'promoCode',
        label: 'Promo code',
        message: 'Promo code is invalid or expired.',
      });
    }
  }

  if (form.guestEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.guestEmail.trim())) {
    errors.push({
      field: 'guestEmail',
      label: 'Guest email',
      message: 'Enter a valid email address.',
    });
  }

  return errors;
}

export function bookingValidationSummary(errors: ExcursionBookingFieldError[]): string {
  if (errors.length === 0) return '';
  const labels = [...new Set(errors.map((e) => e.label))];
  return `Missing or invalid: ${labels.join(', ')}`;
}

function stripUndefinedDeep(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedDeep(item));
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (nested === undefined) continue;
      out[key] = stripUndefinedDeep(nested);
    }
    return out;
  }
  return value;
}

export function sanitizeBookingPayload<T extends Record<string, unknown>>(data: T): T {
  return stripUndefinedDeep(data) as T;
}

export function bookingConsumesCapacity(status: ExcursionBookingStatus): boolean {
  return status === 'confirmed';
}

export function formatBookingParticipants(participants: ExcursionBookingParticipants): string {
  const parts: string[] = [];
  if (participants.adult) parts.push(`${participants.adult} adult${participants.adult !== 1 ? 's' : ''}`);
  if (participants.child) parts.push(`${participants.child} child${participants.child !== 1 ? 'ren' : ''}`);
  if (participants.infant) parts.push(`${participants.infant} infant${participants.infant !== 1 ? 's' : ''}`);
  if (participants.senior) parts.push(`${participants.senior} senior${participants.senior !== 1 ? 's' : ''}`);
  return parts.join(', ') || '—';
}

export function formatBookingDate(dateIso: string): string {
  const parsed = new Date(`${dateIso}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateIso;
  return parsed.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
