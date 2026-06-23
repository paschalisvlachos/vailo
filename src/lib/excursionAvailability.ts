import {
  EXCURSION_PROVIDER_COLLECTION,
  EXCURSION_SUBCOLLECTION,
} from './excursionProvider';
import type { Excursion, ExcursionParticipantPrices, ExcursionSeasonPrice } from './excursion';
import { formatExcursionPrice } from './excursion';

export const EXCURSION_AVAILABILITY_SUBCOLLECTION = 'availability';

export type ExcursionAvailabilityStatus = 'open' | 'closed' | 'sold_out';

export type ExcursionAvailability = {
  id?: string;
  /** YYYY-MM-DD */
  date: string;
  status: ExcursionAvailabilityStatus;
  capacityTotal: number;
  capacityBooked?: number;
  /** When true, bookings are not capped by capacityTotal. */
  capacityUnlimited?: boolean;
  /** HH:mm — optional departure time */
  departureTime?: string;
  priceOverrides?: ExcursionParticipantPrices;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type ExcursionAvailabilityFormData = {
  status: ExcursionAvailabilityStatus;
  capacityUnlimited: boolean;
  capacityTotal: string;
  departureTime: string;
  overridePrices: boolean;
  priceAdult: string;
  priceChild: string;
  priceInfant: string;
  priceSenior: string;
  notes: string;
};

export const EMPTY_AVAILABILITY_FORM: ExcursionAvailabilityFormData = {
  status: 'open',
  capacityUnlimited: false,
  capacityTotal: '20',
  departureTime: '',
  overridePrices: false,
  priceAdult: '',
  priceChild: '',
  priceInfant: '',
  priceSenior: '',
  notes: '',
};

export function availabilityCollectionPath(providerId: string, excursionId: string): string {
  return `${EXCURSION_PROVIDER_COLLECTION}/${providerId}/${EXCURSION_SUBCOLLECTION}/${excursionId}/${EXCURSION_AVAILABILITY_SUBCOLLECTION}`;
}

export function adminExcursionAvailabilityPath(providerId: string, excursionId: string): string {
  return `/excursions/providers/${providerId}/excursions/${excursionId}/availability`;
}

export function portalExcursionAvailabilityPath(providerId: string, excursionId: string): string {
  return `/excursion-portal/${providerId}/excursions/${excursionId}/availability`;
}

export function toAvailabilityDateId(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseAvailabilityDateId(dateId: string): Date {
  return new Date(`${dateId}T12:00:00`);
}

export function monthDateRange(year: number, month: number): { start: string; end: string } {
  const start = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const end = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { start, end };
}

export function findSeasonPriceForDate(
  excursion: Pick<Excursion, 'seasonPrices'>,
  dateIso: string
): ExcursionSeasonPrice | undefined {
  return (excursion.seasonPrices || []).find((season) => {
    if (season.yearRound || (!season.fromDate && !season.toDate)) return true;
    return Boolean(
      season.fromDate &&
        season.toDate &&
        dateIso >= season.fromDate &&
        dateIso <= season.toDate
    );
  });
}

export function resolvePricesForDate(
  excursion: Pick<Excursion, 'seasonPrices' | 'currency'> & {
    pricingModel?: Excursion['pricingModel'];
  },
  dateIso: string,
  availability?: Pick<ExcursionAvailability, 'priceOverrides'> | null
): ExcursionParticipantPrices | undefined {
  if (availability?.priceOverrides?.adult != null) {
    return availability.priceOverrides;
  }
  const season = findSeasonPriceForDate(excursion, dateIso);
  if (!season) return undefined;

  if (excursion.pricingModel === 'flat_rate') {
    const flatPrice = season.flatPrice ?? season.adult;
    if (!Number.isFinite(flatPrice)) return undefined;
    return { adult: flatPrice };
  }

  return {
    adult: season.adult,
    child: season.child,
    infant: season.infant,
    senior: season.senior,
  };
}

export function availabilityStatusLabel(status: ExcursionAvailabilityStatus): string {
  switch (status) {
    case 'open':
      return 'Open';
    case 'sold_out':
      return 'Sold out';
    default:
      return 'Closed';
  }
}

export function availabilityFromDoc(id: string, data: Record<string, unknown>): ExcursionAvailability {
  const priceOverridesRaw = data.priceOverrides as Record<string, unknown> | undefined;
  let priceOverrides: ExcursionParticipantPrices | undefined;
  if (priceOverridesRaw && priceOverridesRaw.adult != null) {
    priceOverrides = { adult: Number(priceOverridesRaw.adult) };
    if (priceOverridesRaw.child != null) priceOverrides.child = Number(priceOverridesRaw.child);
    if (priceOverridesRaw.infant != null) priceOverrides.infant = Number(priceOverridesRaw.infant);
    if (priceOverridesRaw.senior != null) priceOverrides.senior = Number(priceOverridesRaw.senior);
  }

  return {
    id,
    date: String(data.date || id),
    status:
      data.status === 'closed' || data.status === 'sold_out' ? data.status : 'open',
    capacityTotal: Number(data.capacityTotal) || 0,
    capacityBooked: data.capacityBooked != null ? Number(data.capacityBooked) : 0,
    capacityUnlimited: data.capacityUnlimited === true,
    departureTime: data.departureTime ? String(data.departureTime) : undefined,
    priceOverrides,
    notes: data.notes ? String(data.notes) : undefined,
    createdAt: data.createdAt ? String(data.createdAt) : undefined,
    updatedAt: data.updatedAt ? String(data.updatedAt) : undefined,
  };
}

export function availabilityFormFromDoc(
  availability: ExcursionAvailability | null,
  defaults: { capacityTotal: number; seasonPrices?: ExcursionParticipantPrices }
): ExcursionAvailabilityFormData {
  if (!availability) {
    return {
      ...EMPTY_AVAILABILITY_FORM,
      capacityTotal: String(defaults.capacityTotal || 20),
      priceAdult:
        defaults.seasonPrices?.adult != null ? String(defaults.seasonPrices.adult) : '',
      priceChild:
        defaults.seasonPrices?.child != null ? String(defaults.seasonPrices.child) : '',
      priceInfant:
        defaults.seasonPrices?.infant != null ? String(defaults.seasonPrices.infant) : '',
      priceSenior:
        defaults.seasonPrices?.senior != null ? String(defaults.seasonPrices.senior) : '',
    };
  }

  const overrides = availability.priceOverrides;
  return {
    status: availability.status,
    capacityUnlimited: availability.capacityUnlimited === true,
    capacityTotal: availability.capacityUnlimited
      ? String(availability.capacityTotal || defaults.capacityTotal || 20)
      : String(availability.capacityTotal || defaults.capacityTotal || 20),
    departureTime: availability.departureTime || '',
    overridePrices: Boolean(overrides),
    priceAdult: overrides?.adult != null ? String(overrides.adult) : '',
    priceChild: overrides?.child != null ? String(overrides.child) : '',
    priceInfant: overrides?.infant != null ? String(overrides.infant) : '',
    priceSenior: overrides?.senior != null ? String(overrides.senior) : '',
    notes: availability.notes || '',
  };
}

export function availabilityPayloadFromForm(
  form: ExcursionAvailabilityFormData,
  dateIso: string
): Omit<ExcursionAvailability, 'id'> {
  const capacityTotal = parseInt(form.capacityTotal, 10);
  const adult = parseFloat(form.priceAdult);
  const child = parseFloat(form.priceChild);
  const infant = parseFloat(form.priceInfant);
  const senior = parseFloat(form.priceSenior);

  let priceOverrides: ExcursionParticipantPrices | undefined;
  if (form.overridePrices && Number.isFinite(adult)) {
    priceOverrides = { adult };
    if (Number.isFinite(child)) priceOverrides.child = child;
    if (Number.isFinite(infant)) priceOverrides.infant = infant;
    if (Number.isFinite(senior)) priceOverrides.senior = senior;
  }

  return {
    date: dateIso,
    status: form.status,
    capacityTotal: form.capacityUnlimited
      ? 0
      : Number.isFinite(capacityTotal)
        ? capacityTotal
        : 0,
    capacityUnlimited: form.capacityUnlimited || undefined,
    departureTime: form.departureTime.trim() || undefined,
    priceOverrides,
    notes: form.notes.trim() || undefined,
  };
}

export type ExcursionAvailabilityFieldError = {
  field: string;
  label: string;
  message: string;
};

export function validateAvailabilityForm(
  form: ExcursionAvailabilityFormData,
  existing?: ExcursionAvailability | null
): ExcursionAvailabilityFieldError[] {
  const errors: ExcursionAvailabilityFieldError[] = [];

  if (form.status === 'open') {
    const booked = existing?.capacityBooked || 0;
    if (!form.capacityUnlimited) {
      const capacity = parseInt(form.capacityTotal, 10);
      if (!form.capacityTotal.trim() || !Number.isFinite(capacity) || capacity < 1) {
        errors.push({
          field: 'capacityTotal',
          label: 'Capacity',
          message: 'Enter a valid capacity (at least 1).',
        });
      } else if (capacity < booked) {
        errors.push({
          field: 'capacityTotal',
          label: 'Capacity',
          message: `Capacity cannot be below ${booked} already booked.`,
        });
      }
    }
  }

  if (form.overridePrices) {
    const adult = parseFloat(form.priceAdult);
    if (!form.priceAdult.trim() || !Number.isFinite(adult) || adult < 0) {
      errors.push({
        field: 'priceAdult',
        label: 'Adult price override',
        message: 'Enter a valid adult price override.',
      });
    }
  }

  return errors;
}

export function availabilityValidationSummary(errors: ExcursionAvailabilityFieldError[]): string {
  if (errors.length === 0) return '';
  const labels = [...new Set(errors.map((e) => e.label))];
  return `Missing or invalid: ${labels.join(', ')}`;
}

export function sanitizeAvailabilityPayload<T extends Record<string, unknown>>(data: T): T {
  const out = { ...data };
  for (const key of Object.keys(out)) {
    if (out[key] === undefined) delete out[key];
  }
  return out;
}

export function formatAvailabilityPriceSummary(
  excursion: Pick<Excursion, 'seasonPrices' | 'currency' | 'showPriceFrom'>,
  dateIso: string,
  availability?: ExcursionAvailability | null
): string {
  const prices = resolvePricesForDate(excursion, dateIso, availability);
  if (!prices) return 'No season price';
  return formatExcursionPrice(prices.adult, excursion.currency, {
    from: excursion.showPriceFrom !== false,
  });
}

export function isAvailabilityCapacityUnlimited(
  availability: Pick<ExcursionAvailability, 'capacityUnlimited'>
): boolean {
  return availability.capacityUnlimited === true;
}

export function availabilityRemaining(availability: ExcursionAvailability): number {
  if (isAvailabilityCapacityUnlimited(availability)) {
    return Number.MAX_SAFE_INTEGER;
  }
  const booked = availability.capacityBooked || 0;
  return Math.max(0, availability.capacityTotal - booked);
}

export function availabilityHasRoomFor(
  availability: ExcursionAvailability,
  participantCount: number
): boolean {
  if (participantCount <= 0) return false;
  if (isAvailabilityCapacityUnlimited(availability)) return true;
  return availabilityRemaining(availability) >= participantCount;
}

export function isAvailabilityDayBookable(
  availability: ExcursionAvailability,
  todayIso?: string
): boolean {
  const today = todayIso || new Date().toISOString().slice(0, 10);
  if (availability.status !== 'open') return false;
  if (availability.date < today) return false;
  return isAvailabilityCapacityUnlimited(availability) || availabilityRemaining(availability) > 0;
}

export function formatAvailabilitySpotsLabel(availability: ExcursionAvailability): string {
  if (isAvailabilityCapacityUnlimited(availability)) return 'Unlimited';
  const remaining = availabilityRemaining(availability);
  if (remaining === Number.MAX_SAFE_INTEGER) return 'Unlimited';
  return `${remaining} left`;
}

export function formatAvailabilityCapacitySummary(availability: ExcursionAvailability): string {
  if (isAvailabilityCapacityUnlimited(availability)) {
    const booked = availability.capacityBooked || 0;
    return booked > 0 ? `${booked} booked · Unlimited` : 'Unlimited';
  }
  return `${availabilityRemaining(availability)} / ${availability.capacityTotal} spots`;
}

/** Weekday index 0 = Monday … 6 = Sunday (matches calendar headers). */
export function availabilityWeekdayIndex(date: Date): number {
  const dow = date.getDay();
  return dow === 0 ? 6 : dow - 1;
}

export const AVAILABILITY_WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export function defaultAvailabilityWeekdayFilter(): boolean[] {
  return [true, true, true, true, true, true, true];
}

/** List YYYY-MM-DD dates in [startIso, endIso] matching weekday filter. */
export function enumerateAvailabilityDates(
  startIso: string,
  endIso: string,
  weekdayFilter: boolean[]
): string[] {
  if (!startIso || !endIso || startIso > endIso) return [];

  const dates: string[] = [];
  const cursor = parseAvailabilityDateId(startIso);
  const end = parseAvailabilityDateId(endIso);
  cursor.setHours(12, 0, 0, 0);
  end.setHours(12, 0, 0, 0);

  while (cursor.getTime() <= end.getTime()) {
    const idx = availabilityWeekdayIndex(cursor);
    if (weekdayFilter[idx] !== false) {
      dates.push(toAvailabilityDateId(cursor));
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

export function filterBookableAvailabilityDates(
  excursion: Pick<Excursion, 'seasonPrices'>,
  dateIds: string[],
  options: { skipPast?: boolean; todayIso?: string } = {}
): { eligible: string[]; skippedOffSeason: number; skippedPast: number } {
  const today = options.todayIso || toAvailabilityDateId(new Date());
  const skipPast = options.skipPast !== false;
  let skippedOffSeason = 0;
  let skippedPast = 0;
  const eligible: string[] = [];

  for (const dateId of dateIds) {
    if (skipPast && dateId < today) {
      skippedPast += 1;
      continue;
    }
    if (!findSeasonPriceForDate(excursion, dateId)) {
      skippedOffSeason += 1;
      continue;
    }
    eligible.push(dateId);
  }

  return { eligible, skippedOffSeason, skippedPast };
}
