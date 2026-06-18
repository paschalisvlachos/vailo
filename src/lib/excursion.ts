import { EXCURSION_PROVIDER_COLLECTION, EXCURSION_SUBCOLLECTION } from './excursionProvider';

export type ExcursionStatus = 'draft' | 'published' | 'archived';

export type ExcursionBookingMode = 'request' | 'instant';

export type ExcursionDurationType =
  | 'hours'
  | 'half_day'
  | 'full_day'
  | 'multi_day';

export type ExcursionTravelStyle =
  | 'day_trip'
  | 'half_day'
  | 'full_day'
  | 'multi_day'
  | 'overnight'
  | 'custom';

export type ExcursionParticipantPrices = {
  adult: number;
  child?: number;
  infant?: number;
  senior?: number;
};

/** @deprecated Use ExcursionParticipantPrices */
export type ExcursionBasePrices = ExcursionParticipantPrices;

export type ExcursionSeasonPrice = ExcursionParticipantPrices & {
  label?: string;
  fromDate: string;
  toDate: string;
};

export type ExcursionSeasonPriceFormRow = {
  localId: string;
  label: string;
  fromDate: string;
  toDate: string;
  priceAdult: string;
  priceChild: string;
  priceInfant: string;
  priceSenior: string;
};

export type Excursion = {
  id?: string;
  providerId: string;
  title: string;
  subtitle?: string;
  slug: string;
  description?: string;
  status: ExcursionStatus;
  categories?: string[];
  heroPhotoUrl?: string;
  photoUrls?: string[];
  travelStyle: ExcursionTravelStyle;
  travelStyleLabel?: string;
  durationType: ExcursionDurationType;
  durationMinutes?: number;
  durationLabel?: string;
  currency: string;
  seasonPrices: ExcursionSeasonPrice[];
  showPriceFrom?: boolean;
  minParticipants?: number;
  maxParticipants?: number;
  /** When true, bookings are not limited by maxParticipants. */
  maxParticipantsUnlimited?: boolean;
  bookingMode: ExcursionBookingMode;
  cutoffHoursBefore?: number;
  advanceBookingDaysMax?: number;
  meetingPoint?: string;
  programBreakdown?: string;
  programDetails?: string;
  participationRequirements?: string;
  included?: string[];
  notIncluded?: string[];
  whatToBring?: string[];
  notes?: string;
  additionalInfo?: string;
  additionalServices?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type ExcursionFormData = {
  title: string;
  subtitle: string;
  slug: string;
  description: string;
  status: ExcursionStatus;
  categories: string;
  heroPhotoUrl: string;
  travelStyle: ExcursionTravelStyle;
  travelStyleLabel: string;
  durationType: ExcursionDurationType;
  durationMinutes: string;
  durationLabel: string;
  currency: string;
  showPriceFrom: boolean;
  minParticipants: string;
  maxParticipants: string;
  maxParticipantsUnlimited: boolean;
  bookingMode: ExcursionBookingMode;
  cutoffHoursBefore: string;
  advanceBookingDaysMax: string;
  meetingPoint: string;
  programBreakdown: string;
  programDetails: string;
  participationRequirements: string;
  included: string;
  notIncluded: string;
  whatToBring: string;
  notes: string;
  additionalInfo: string;
  additionalServices: string;
};

export const EMPTY_EXCURSION_FORM: ExcursionFormData = {
  title: '',
  subtitle: '',
  slug: '',
  description: '',
  status: 'draft',
  categories: '',
  heroPhotoUrl: '',
  travelStyle: 'day_trip',
  travelStyleLabel: '',
  durationType: 'full_day',
  durationMinutes: '3',
  durationLabel: '',
  currency: 'EUR',
  showPriceFrom: true,
  minParticipants: '1',
  maxParticipants: '20',
  maxParticipantsUnlimited: false,
  bookingMode: 'request',
  cutoffHoursBefore: '24',
  advanceBookingDaysMax: '90',
  meetingPoint: '',
  programBreakdown: '',
  programDetails: '',
  participationRequirements: '',
  included: '',
  notIncluded: '',
  whatToBring: '',
  notes: '',
  additionalInfo: '',
  additionalServices: '',
};

let seasonRowCounter = 0;

export function createSeasonPriceRow(
  partial?: Partial<Omit<ExcursionSeasonPriceFormRow, 'localId'>>
): ExcursionSeasonPriceFormRow {
  seasonRowCounter += 1;
  return {
    localId: `season-${seasonRowCounter}-${Date.now()}`,
    label: partial?.label ?? '',
    fromDate: partial?.fromDate ?? '',
    toDate: partial?.toDate ?? '',
    priceAdult: partial?.priceAdult ?? '',
    priceChild: partial?.priceChild ?? '',
    priceInfant: partial?.priceInfant ?? '',
    priceSenior: partial?.priceSenior ?? '',
  };
}

export function formatExcursionSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

export function excursionCollectionPath(providerId: string): string {
  return `${EXCURSION_PROVIDER_COLLECTION}/${providerId}/${EXCURSION_SUBCOLLECTION}`;
}

export function adminExcursionsListPath(providerId: string): string {
  return `/excursions/providers/${providerId}/excursions`;
}

export function adminExcursionAddPath(providerId: string): string {
  return `/excursions/providers/${providerId}/excursions/add`;
}

export function adminExcursionEditPath(providerId: string, excursionId: string): string {
  return `/excursions/providers/${providerId}/excursions/${excursionId}/edit`;
}

export function portalExcursionsListPath(providerId: string): string {
  return `/excursion-portal/${providerId}/excursions`;
}

export function portalExcursionAddPath(providerId: string): string {
  return `/excursion-portal/${providerId}/excursions/add`;
}

export function portalExcursionEditPath(providerId: string, excursionId: string): string {
  return `/excursion-portal/${providerId}/excursions/${excursionId}/edit`;
}

export function excursionStatusLabel(status: ExcursionStatus): string {
  switch (status) {
    case 'published':
      return 'Published';
    case 'archived':
      return 'Archived';
    default:
      return 'Draft';
  }
}

export function excursionTravelStyleLabel(
  excursion: Pick<Excursion, 'travelStyle' | 'travelStyleLabel'>
): string {
  if (excursion.travelStyle === 'custom' && excursion.travelStyleLabel?.trim()) {
    return excursion.travelStyleLabel.trim();
  }
  switch (excursion.travelStyle) {
    case 'day_trip':
      return 'Day trip';
    case 'half_day':
      return 'Half day';
    case 'full_day':
      return 'Full day';
    case 'multi_day':
      return 'Multi-day';
    case 'overnight':
      return 'Overnight';
    default:
      return excursion.travelStyleLabel?.trim() || '—';
  }
}

export function excursionDurationLabel(excursion: Pick<Excursion, 'durationType' | 'durationMinutes' | 'durationLabel'>): string {
  if (excursion.durationLabel?.trim()) return excursion.durationLabel.trim();
  if (excursion.durationType === 'half_day') return 'Half day';
  if (excursion.durationType === 'full_day') return 'Full day';
  if (excursion.durationType === 'multi_day') return 'Multi-day';
  const mins = excursion.durationMinutes;
  if (mins != null && mins > 0) {
    if (mins < 60) return `${mins} min`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return '—';
}

function splitList(value: string): string[] | undefined {
  const items = value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
}

function parseTravelStyle(value: unknown): ExcursionTravelStyle {
  if (
    value === 'day_trip' ||
    value === 'half_day' ||
    value === 'full_day' ||
    value === 'multi_day' ||
    value === 'overnight' ||
    value === 'custom'
  ) {
    return value;
  }
  return 'day_trip';
}

function parseParticipantPrices(raw: Record<string, unknown>): ExcursionParticipantPrices | null {
  const adult = parseFloat(String(raw.adult ?? ''));
  if (!Number.isFinite(adult) || adult < 0) return null;
  const prices: ExcursionParticipantPrices = { adult };
  const child = parseFloat(String(raw.child ?? ''));
  const infant = parseFloat(String(raw.infant ?? ''));
  const senior = parseFloat(String(raw.senior ?? ''));
  if (Number.isFinite(child)) prices.child = child;
  if (Number.isFinite(infant)) prices.infant = infant;
  if (Number.isFinite(senior)) prices.senior = senior;
  return prices;
}

function seasonPriceRowFromRaw(raw: unknown): ExcursionSeasonPriceFormRow | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const prices = parseParticipantPrices(row);
  if (!prices) return null;
  return createSeasonPriceRow({
    label: String(row.label || ''),
    fromDate: String(row.fromDate || ''),
    toDate: String(row.toDate || ''),
    priceAdult: String(prices.adult),
    priceChild: prices.child != null ? String(prices.child) : '',
    priceInfant: prices.infant != null ? String(prices.infant) : '',
    priceSenior: prices.senior != null ? String(prices.senior) : '',
  });
}

export function seasonPricesFormFromDoc(data: Record<string, unknown>): ExcursionSeasonPriceFormRow[] {
  if (Array.isArray(data.seasonPrices) && data.seasonPrices.length > 0) {
    const rows = data.seasonPrices
      .map((item) => seasonPriceRowFromRaw(item))
      .filter((row): row is ExcursionSeasonPriceFormRow => row != null);
    if (rows.length > 0) return rows;
  }

  const legacyPrices = parseParticipantPrices((data.basePrices || {}) as Record<string, unknown>);
  if (legacyPrices) {
    return [
      createSeasonPriceRow({
        label: String(data.seasonPeriod || ''),
        fromDate: '',
        toDate: '',
        priceAdult: String(legacyPrices.adult),
        priceChild: legacyPrices.child != null ? String(legacyPrices.child) : '',
        priceInfant: legacyPrices.infant != null ? String(legacyPrices.infant) : '',
        priceSenior: legacyPrices.senior != null ? String(legacyPrices.senior) : '',
      }),
    ];
  }

  return [createSeasonPriceRow()];
}

export function seasonPricesPayloadFromForm(
  rows: ExcursionSeasonPriceFormRow[]
): ExcursionSeasonPrice[] {
  return rows
    .map((row) => {
      const adult = parseFloat(row.priceAdult);
      if (!Number.isFinite(adult) || adult < 0) return null;
      const child = parseFloat(row.priceChild);
      const infant = parseFloat(row.priceInfant);
      const senior = parseFloat(row.priceSenior);
      const season: ExcursionSeasonPrice = {
        fromDate: row.fromDate.trim(),
        toDate: row.toDate.trim(),
        adult,
      };
      if (row.label.trim()) season.label = row.label.trim();
      if (Number.isFinite(child)) season.child = child;
      if (Number.isFinite(infant)) season.infant = infant;
      if (Number.isFinite(senior)) season.senior = senior;
      return season;
    })
    .filter((season): season is ExcursionSeasonPrice => season != null)
    .sort((a, b) => a.fromDate.localeCompare(b.fromDate));
}

export function formatExcursionSeasonRange(
  season: Pick<ExcursionSeasonPrice, 'fromDate' | 'toDate' | 'label'>
): string {
  if (season.label?.trim()) return season.label.trim();
  const { fromDate, toDate } = season;
  if (!fromDate && !toDate) return '—';
  if (fromDate && !toDate) return `from ${formatIsoDate(fromDate)}`;
  if (!fromDate && toDate) return `until ${formatIsoDate(toDate)}`;
  return `${formatIsoDate(fromDate)} – ${formatIsoDate(toDate)}`;
}

function formatIsoDate(isoDate: string): string {
  const parsed = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return parsed.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function excursionLowestAdultPrice(
  excursion: Pick<Excursion, 'seasonPrices'>
): number | undefined {
  const adults = (excursion.seasonPrices || [])
    .map((s) => s.adult)
    .filter((n) => Number.isFinite(n));
  if (adults.length === 0) return undefined;
  return Math.min(...adults);
}

export function excursionSeasonsSummary(excursion: Pick<Excursion, 'seasonPrices'>): string {
  const seasons = excursion.seasonPrices || [];
  if (seasons.length === 0) return '—';
  if (seasons.length === 1) return formatExcursionSeasonRange(seasons[0]);
  return seasons.map((s) => formatExcursionSeasonRange(s)).join(' · ');
}

export function isExcursionMaxParticipantsUnlimited(
  excursion: Pick<Excursion, 'maxParticipantsUnlimited' | 'maxParticipants'>
): boolean {
  return excursion.maxParticipantsUnlimited === true;
}

export function excursionEffectiveMaxParticipants(
  excursion: Pick<Excursion, 'maxParticipantsUnlimited' | 'maxParticipants'>
): number | undefined {
  if (isExcursionMaxParticipantsUnlimited(excursion)) return undefined;
  return excursion.maxParticipants;
}

export function excursionFormFromDoc(data: Record<string, unknown>): ExcursionFormData {
  const maxUnlimited =
    data.maxParticipantsUnlimited === true || data.maxParticipants == null;
  return {
    title: String(data.title || ''),
    subtitle: String(data.subtitle || ''),
    slug: String(data.slug || ''),
    description: String(data.description || ''),
    status:
      data.status === 'published' || data.status === 'archived' ? data.status : 'draft',
    categories: Array.isArray(data.categories) ? data.categories.join(', ') : '',
    heroPhotoUrl: String(data.heroPhotoUrl || ''),
    travelStyle: parseTravelStyle(data.travelStyle),
    travelStyleLabel: String(data.travelStyleLabel || ''),
    durationType:
      data.durationType === 'half_day' ||
      data.durationType === 'full_day' ||
      data.durationType === 'multi_day'
        ? data.durationType
        : 'hours',
    durationMinutes: data.durationMinutes != null ? String(data.durationMinutes) : '',
    durationLabel: String(data.durationLabel || ''),
    currency: String(data.currency || 'EUR'),
    showPriceFrom: data.showPriceFrom !== false,
    minParticipants: data.minParticipants != null ? String(data.minParticipants) : '1',
    maxParticipantsUnlimited: maxUnlimited,
    maxParticipants:
      data.maxParticipants != null && !maxUnlimited
        ? String(data.maxParticipants)
        : '20',
    bookingMode: data.bookingMode === 'instant' ? 'instant' : 'request',
    cutoffHoursBefore:
      data.cutoffHoursBefore != null ? String(data.cutoffHoursBefore) : '24',
    advanceBookingDaysMax:
      data.advanceBookingDaysMax != null ? String(data.advanceBookingDaysMax) : '90',
    meetingPoint: String(data.meetingPoint || ''),
    programBreakdown: String(data.programBreakdown || ''),
    programDetails: String(data.programDetails || ''),
    participationRequirements: String(data.participationRequirements || ''),
    included: Array.isArray(data.included) ? data.included.join(', ') : '',
    notIncluded: Array.isArray(data.notIncluded) ? data.notIncluded.join(', ') : '',
    whatToBring: Array.isArray(data.whatToBring) ? data.whatToBring.join(', ') : '',
    notes: String(data.notes || ''),
    additionalInfo: String(data.additionalInfo || ''),
    additionalServices: String(data.additionalServices || ''),
  };
}

export function excursionPayloadFromForm(
  form: ExcursionFormData,
  providerId: string,
  seasonPriceRows: ExcursionSeasonPriceFormRow[]
): Omit<Excursion, 'id'> {
  const durationMinutes = parseInt(form.durationMinutes, 10);
  const minParticipants = parseInt(form.minParticipants, 10);
  const maxParticipants = parseInt(form.maxParticipants, 10);
  const cutoffHoursBefore = parseInt(form.cutoffHoursBefore, 10);
  const advanceBookingDaysMax = parseInt(form.advanceBookingDaysMax, 10);

  return {
    providerId,
    title: form.title.trim(),
    subtitle: form.subtitle.trim() || undefined,
    slug: formatExcursionSlug(form.slug.trim() || form.title),
    description: form.description.trim() || undefined,
    status: form.status,
    categories: splitList(form.categories),
    heroPhotoUrl: form.heroPhotoUrl.trim() || undefined,
    travelStyle: form.travelStyle,
    travelStyleLabel:
      form.travelStyle === 'custom' ? form.travelStyleLabel.trim() || undefined : undefined,
    durationType: form.durationType,
    durationMinutes:
      form.durationType === 'hours' && Number.isFinite(durationMinutes)
        ? durationMinutes
        : undefined,
    durationLabel: form.durationLabel.trim() || undefined,
    currency: form.currency.trim() || 'EUR',
    seasonPrices: seasonPricesPayloadFromForm(seasonPriceRows),
    showPriceFrom: form.showPriceFrom,
    minParticipants: Number.isFinite(minParticipants) ? minParticipants : undefined,
    maxParticipantsUnlimited: form.maxParticipantsUnlimited || undefined,
    maxParticipants: form.maxParticipantsUnlimited
      ? undefined
      : Number.isFinite(maxParticipants)
        ? maxParticipants
        : undefined,
    bookingMode: form.bookingMode,
    cutoffHoursBefore: Number.isFinite(cutoffHoursBefore) ? cutoffHoursBefore : undefined,
    advanceBookingDaysMax: Number.isFinite(advanceBookingDaysMax)
      ? advanceBookingDaysMax
      : undefined,
    meetingPoint: form.meetingPoint.trim() || undefined,
    programBreakdown: form.programBreakdown.trim() || undefined,
    programDetails: form.programDetails.trim() || undefined,
    participationRequirements: form.participationRequirements.trim() || undefined,
    included: splitList(form.included),
    notIncluded: splitList(form.notIncluded),
    whatToBring: splitList(form.whatToBring),
    notes: form.notes.trim() || undefined,
    additionalInfo: form.additionalInfo.trim() || undefined,
    additionalServices: form.additionalServices.trim() || undefined,
  };
}

export type ExcursionFieldError = {
  field: string;
  label: string;
  message: string;
};

export function validateExcursionForm(
  form: ExcursionFormData,
  seasonPriceRows: ExcursionSeasonPriceFormRow[]
): ExcursionFieldError[] {
  const errors: ExcursionFieldError[] = [];

  if (!form.title.trim()) {
    errors.push({ field: 'title', label: 'Title', message: 'Title is required.' });
  }

  if (seasonPriceRows.length === 0) {
    errors.push({
      field: 'seasonPrices',
      label: 'Season pricing',
      message: 'Add at least one season with prices.',
    });
  }

  seasonPriceRows.forEach((row, index) => {
    const seasonLabel = row.label.trim() || `Season ${index + 1}`;

    if (!row.fromDate.trim()) {
      errors.push({
        field: `season-${index}-fromDate`,
        label: seasonLabel,
        message: `${seasonLabel}: start date is required.`,
      });
    }
    if (!row.toDate.trim()) {
      errors.push({
        field: `season-${index}-toDate`,
        label: seasonLabel,
        message: `${seasonLabel}: end date is required.`,
      });
    }
    if (
      row.fromDate.trim() &&
      row.toDate.trim() &&
      row.fromDate.trim() > row.toDate.trim()
    ) {
      errors.push({
        field: `season-${index}-toDate`,
        label: seasonLabel,
        message: `${seasonLabel}: end date must be on or after the start date.`,
      });
    }

    const adult = parseFloat(row.priceAdult);
    if (!row.priceAdult.trim() || !Number.isFinite(adult) || adult < 0) {
      errors.push({
        field: `season-${index}-priceAdult`,
        label: seasonLabel,
        message: `${seasonLabel}: enter a valid adult price.`,
      });
    }
  });

  if (form.durationType === 'hours') {
    const mins = parseInt(form.durationMinutes, 10);
    if (!form.durationMinutes.trim() || !Number.isFinite(mins) || mins <= 0) {
      errors.push({
        field: 'durationMinutes',
        label: 'Duration',
        message: 'Enter duration in minutes for hourly excursions.',
      });
    }
  }

  const minP = parseInt(form.minParticipants, 10);
  const maxP = parseInt(form.maxParticipants, 10);
  if (!form.maxParticipantsUnlimited) {
    if (!form.maxParticipants.trim() || !Number.isFinite(maxP) || maxP < 1) {
      errors.push({
        field: 'maxParticipants',
        label: 'Max participants',
        message: 'Enter a maximum or select unlimited.',
      });
    } else if (Number.isFinite(minP) && maxP < minP) {
      errors.push({
        field: 'maxParticipants',
        label: 'Max participants',
        message: 'Max participants must be at least the minimum.',
      });
    }
  }

  return errors;
}

export function excursionValidationSummary(errors: ExcursionFieldError[]): string {
  if (errors.length === 0) return '';
  const labels = [...new Set(errors.map((e) => e.label))];
  return `Missing or invalid: ${labels.join(', ')}`;
}

export function sanitizeExcursionPayload<T extends Record<string, unknown>>(data: T): T {
  const out = { ...data };
  for (const key of Object.keys(out)) {
    if (out[key] === undefined) delete out[key];
  }
  return out;
}

export function excursionFromDoc(id: string, data: Record<string, unknown>): Excursion {
  const excursion = { id, ...data } as Excursion;

  if (!Array.isArray(excursion.seasonPrices) || excursion.seasonPrices.length === 0) {
    const legacyPrices = parseParticipantPrices((data.basePrices || {}) as Record<string, unknown>);
    if (legacyPrices) {
      excursion.seasonPrices = [
        {
          label: String(data.seasonPeriod || ''),
          fromDate: '',
          toDate: '',
          ...legacyPrices,
        },
      ];
    } else {
      excursion.seasonPrices = [];
    }
  }

  if (!excursion.travelStyle) {
    excursion.travelStyle = parseTravelStyle(data.travelStyle);
  }

  return excursion;
}

export function formatCurrencyAmountParts(
  amount: number,
  currency = 'EUR'
): { amount: string; symbol: string } {
  const amountStr = new Intl.NumberFormat('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
  const symbols: Record<string, string> = { EUR: '€', GBP: '£', USD: '$' };
  return { amount: amountStr, symbol: symbols[currency] || currency };
}

/** Currency with symbol on the right — e.g. `45.00 €`. */
export function formatCurrencyAmount(amount: number, currency = 'EUR'): string {
  const { amount: value, symbol } = formatCurrencyAmountParts(amount, currency);
  return `${value} ${symbol}`;
}

export function formatExcursionPrice(
  amount: number | undefined,
  currency = 'EUR',
  options?: { from?: boolean }
): string {
  if (amount == null || !Number.isFinite(amount)) return '—';
  const formatted = formatCurrencyAmount(amount, currency);
  return options?.from ? `from ${formatted}` : formatted;
}
