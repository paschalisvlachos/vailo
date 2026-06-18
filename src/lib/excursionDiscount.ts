import { formatCurrencyAmount } from './excursion';

export const EXCURSION_DISCOUNTS_SUBCOLLECTION = 'discounts';

export type ExcursionDiscountType = 'group_size' | 'promo_code';

export type ExcursionDiscountValueType = 'percent' | 'fixed';

export type ExcursionDiscountStatus = 'active' | 'inactive';

export type ExcursionDiscountParticipant = 'adult' | 'child' | 'infant' | 'senior';

export type ExcursionDiscount = {
  id?: string;
  providerId: string;
  excursionId: string;
  name: string;
  type: ExcursionDiscountType;
  status: ExcursionDiscountStatus;
  valueType: ExcursionDiscountValueType;
  value: number;
  minParticipants?: number;
  maxParticipants?: number;
  code?: string;
  maxUses?: number;
  usedCount?: number;
  validFrom?: string;
  validTo?: string;
  appliesTo?: ExcursionDiscountParticipant[];
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type ExcursionDiscountFormData = {
  name: string;
  type: ExcursionDiscountType;
  status: ExcursionDiscountStatus;
  valueType: ExcursionDiscountValueType;
  value: string;
  minParticipants: string;
  maxParticipants: string;
  code: string;
  maxUses: string;
  validFrom: string;
  validTo: string;
  appliesToAdult: boolean;
  appliesToChild: boolean;
  appliesToInfant: boolean;
  appliesToSenior: boolean;
  notes: string;
};

export const EMPTY_DISCOUNT_FORM: ExcursionDiscountFormData = {
  name: '',
  type: 'group_size',
  status: 'active',
  valueType: 'percent',
  value: '10',
  minParticipants: '10',
  maxParticipants: '',
  code: '',
  maxUses: '',
  validFrom: '',
  validTo: '',
  appliesToAdult: true,
  appliesToChild: true,
  appliesToInfant: false,
  appliesToSenior: true,
  notes: '',
};

export function adminExcursionDiscountsPath(providerId: string, excursionId: string): string {
  return `/excursions/providers/${providerId}/excursions/${excursionId}/discounts`;
}

export function adminExcursionDiscountAddPath(providerId: string, excursionId: string): string {
  return `/excursions/providers/${providerId}/excursions/${excursionId}/discounts/add`;
}

export function adminExcursionDiscountEditPath(
  providerId: string,
  excursionId: string,
  discountId: string
): string {
  return `/excursions/providers/${providerId}/excursions/${excursionId}/discounts/${discountId}/edit`;
}

export function portalExcursionDiscountsPath(providerId: string, excursionId: string): string {
  return `/excursion-portal/${providerId}/excursions/${excursionId}/discounts`;
}

export function portalExcursionDiscountAddPath(providerId: string, excursionId: string): string {
  return `/excursion-portal/${providerId}/excursions/${excursionId}/discounts/add`;
}

export function portalExcursionDiscountEditPath(
  providerId: string,
  excursionId: string,
  discountId: string
): string {
  return `/excursion-portal/${providerId}/excursions/${excursionId}/discounts/${discountId}/edit`;
}

export function formatPromoCode(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]+/g, '');
}

export function discountTypeLabel(type: ExcursionDiscountType): string {
  return type === 'promo_code' ? 'Promo code' : 'Group size';
}

export function discountStatusLabel(status: ExcursionDiscountStatus): string {
  return status === 'active' ? 'Active' : 'Inactive';
}

export function formatDiscountValue(
  discount: Pick<ExcursionDiscount, 'valueType' | 'value'>,
  currency = 'EUR'
): string {
  if (discount.valueType === 'percent') {
    return `${discount.value}% off`;
  }
  return formatCurrencyAmount(discount.value, currency);
}

export function discountOfferSummary(
  discount: ExcursionDiscount,
  currency = 'EUR'
): string {
  const valueLabel = formatDiscountValue(discount, currency);
  if (discount.type === 'promo_code') {
    return discount.code ? `${discount.code} · ${valueLabel}` : valueLabel;
  }
  const min = discount.minParticipants;
  const max = discount.maxParticipants;
  if (min != null && max != null) {
    return `${min}–${max} guests · ${valueLabel}`;
  }
  if (min != null) {
    return `${min}+ guests · ${valueLabel}`;
  }
  return valueLabel;
}

export function discountValiditySummary(
  discount: Pick<ExcursionDiscount, 'validFrom' | 'validTo'>
): string {
  if (discount.validFrom && discount.validTo) {
    return `${formatDiscountDate(discount.validFrom)} – ${formatDiscountDate(discount.validTo)}`;
  }
  if (discount.validFrom) {
    return `From ${formatDiscountDate(discount.validFrom)}`;
  }
  if (discount.validTo) {
    return `Until ${formatDiscountDate(discount.validTo)}`;
  }
  return 'Always valid';
}

function formatDiscountDate(isoDate: string): string {
  const parsed = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return parsed.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function parseDiscountType(value: unknown): ExcursionDiscountType {
  return value === 'promo_code' ? 'promo_code' : 'group_size';
}

function parseDiscountStatus(value: unknown): ExcursionDiscountStatus {
  return value === 'inactive' ? 'inactive' : 'active';
}

function parseValueType(value: unknown): ExcursionDiscountValueType {
  return value === 'fixed' ? 'fixed' : 'percent';
}

function parseAppliesTo(value: unknown): ExcursionDiscountParticipant[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const allowed: ExcursionDiscountParticipant[] = ['adult', 'child', 'infant', 'senior'];
  const items = value.filter((v): v is ExcursionDiscountParticipant =>
    allowed.includes(v as ExcursionDiscountParticipant)
  );
  return items.length > 0 ? items : undefined;
}

export function discountFromDoc(id: string, data: Record<string, unknown>): ExcursionDiscount {
  return {
    id,
    providerId: String(data.providerId || ''),
    excursionId: String(data.excursionId || ''),
    name: String(data.name || ''),
    type: parseDiscountType(data.type),
    status: parseDiscountStatus(data.status),
    valueType: parseValueType(data.valueType),
    value: Number(data.value) || 0,
    minParticipants: data.minParticipants != null ? Number(data.minParticipants) : undefined,
    maxParticipants: data.maxParticipants != null ? Number(data.maxParticipants) : undefined,
    code: data.code ? String(data.code) : undefined,
    maxUses: data.maxUses != null ? Number(data.maxUses) : undefined,
    usedCount: data.usedCount != null ? Number(data.usedCount) : 0,
    validFrom: data.validFrom ? String(data.validFrom) : undefined,
    validTo: data.validTo ? String(data.validTo) : undefined,
    appliesTo: parseAppliesTo(data.appliesTo),
    notes: data.notes ? String(data.notes) : undefined,
    createdAt: data.createdAt ? String(data.createdAt) : undefined,
    updatedAt: data.updatedAt ? String(data.updatedAt) : undefined,
  };
}

export function discountFormFromDoc(data: Record<string, unknown>): ExcursionDiscountFormData {
  const appliesTo = parseAppliesTo(data.appliesTo) || ['adult', 'child', 'senior'];
  return {
    name: String(data.name || ''),
    type: parseDiscountType(data.type),
    status: parseDiscountStatus(data.status),
    valueType: parseValueType(data.valueType),
    value: data.value != null ? String(data.value) : '',
    minParticipants: data.minParticipants != null ? String(data.minParticipants) : '10',
    maxParticipants: data.maxParticipants != null ? String(data.maxParticipants) : '',
    code: data.code ? String(data.code) : '',
    maxUses: data.maxUses != null ? String(data.maxUses) : '',
    validFrom: data.validFrom ? String(data.validFrom) : '',
    validTo: data.validTo ? String(data.validTo) : '',
    appliesToAdult: appliesTo.includes('adult'),
    appliesToChild: appliesTo.includes('child'),
    appliesToInfant: appliesTo.includes('infant'),
    appliesToSenior: appliesTo.includes('senior'),
    notes: data.notes ? String(data.notes) : '',
  };
}

function appliesToFromForm(form: ExcursionDiscountFormData): ExcursionDiscountParticipant[] | undefined {
  const items: ExcursionDiscountParticipant[] = [];
  if (form.appliesToAdult) items.push('adult');
  if (form.appliesToChild) items.push('child');
  if (form.appliesToInfant) items.push('infant');
  if (form.appliesToSenior) items.push('senior');
  return items.length > 0 ? items : undefined;
}

export function discountPayloadFromForm(
  form: ExcursionDiscountFormData,
  providerId: string,
  excursionId: string,
  existing?: ExcursionDiscount | null
): Omit<ExcursionDiscount, 'id'> {
  const value = parseFloat(form.value);
  const minParticipants = parseInt(form.minParticipants, 10);
  const maxParticipants = parseInt(form.maxParticipants, 10);
  const maxUses = parseInt(form.maxUses, 10);

  return {
    providerId,
    excursionId,
    name: form.name.trim(),
    type: form.type,
    status: form.status,
    valueType: form.valueType,
    value: Number.isFinite(value) ? value : 0,
    minParticipants:
      form.type === 'group_size' && Number.isFinite(minParticipants)
        ? minParticipants
        : undefined,
    maxParticipants:
      form.type === 'group_size' && form.maxParticipants.trim() && Number.isFinite(maxParticipants)
        ? maxParticipants
        : undefined,
    code: form.type === 'promo_code' ? formatPromoCode(form.code) || undefined : undefined,
    maxUses:
      form.type === 'promo_code' && form.maxUses.trim() && Number.isFinite(maxUses)
        ? maxUses
        : undefined,
    usedCount: existing?.usedCount || 0,
    validFrom: form.validFrom.trim() || undefined,
    validTo: form.validTo.trim() || undefined,
    appliesTo: appliesToFromForm(form),
    notes: form.notes.trim() || undefined,
  };
}

export type ExcursionDiscountFieldError = {
  field: string;
  label: string;
  message: string;
};

export function validateDiscountForm(
  form: ExcursionDiscountFormData,
  existingDiscounts: ExcursionDiscount[],
  editingId?: string
): ExcursionDiscountFieldError[] {
  const errors: ExcursionDiscountFieldError[] = [];

  if (!form.name.trim()) {
    errors.push({ field: 'name', label: 'Name', message: 'Name is required.' });
  }

  const value = parseFloat(form.value);
  if (!form.value.trim() || !Number.isFinite(value) || value < 0) {
    errors.push({ field: 'value', label: 'Discount value', message: 'Enter a valid discount value.' });
  } else if (form.valueType === 'percent' && value > 100) {
    errors.push({
      field: 'value',
      label: 'Discount value',
      message: 'Percent discount cannot exceed 100%.',
    });
  }

  if (form.type === 'group_size') {
    const minP = parseInt(form.minParticipants, 10);
    const maxP = parseInt(form.maxParticipants, 10);
    if (!form.minParticipants.trim() || !Number.isFinite(minP) || minP < 2) {
      errors.push({
        field: 'minParticipants',
        label: 'Minimum group size',
        message: 'Enter a minimum group size of at least 2.',
      });
    }
    if (
      form.maxParticipants.trim() &&
      Number.isFinite(minP) &&
      Number.isFinite(maxP) &&
      maxP < minP
    ) {
      errors.push({
        field: 'maxParticipants',
        label: 'Maximum group size',
        message: 'Maximum group size must be at least the minimum.',
      });
    }
  }

  if (form.type === 'promo_code') {
    const code = formatPromoCode(form.code);
    if (!code) {
      errors.push({ field: 'code', label: 'Promo code', message: 'Promo code is required.' });
    } else {
      const duplicate = existingDiscounts.find(
        (d) =>
          d.id !== editingId &&
          d.type === 'promo_code' &&
          d.code?.toUpperCase() === code
      );
      if (duplicate) {
        errors.push({
          field: 'code',
          label: 'Promo code',
          message: 'This promo code already exists for this excursion.',
        });
      }
    }

    const maxUses = parseInt(form.maxUses, 10);
    if (form.maxUses.trim() && (!Number.isFinite(maxUses) || maxUses < 1)) {
      errors.push({
        field: 'maxUses',
        label: 'Max uses',
        message: 'Max uses must be at least 1.',
      });
    }
  }

  if (
    form.validFrom.trim() &&
    form.validTo.trim() &&
    form.validFrom.trim() > form.validTo.trim()
  ) {
    errors.push({
      field: 'validTo',
      label: 'Valid to',
      message: 'End date must be on or after the start date.',
    });
  }

  if (
    !form.appliesToAdult &&
    !form.appliesToChild &&
    !form.appliesToInfant &&
    !form.appliesToSenior
  ) {
    errors.push({
      field: 'appliesToAdult',
      label: 'Applies to',
      message: 'Select at least one participant type.',
    });
  }

  return errors;
}

export function discountValidationSummary(errors: ExcursionDiscountFieldError[]): string {
  if (errors.length === 0) return '';
  const labels = [...new Set(errors.map((e) => e.label))];
  return `Missing or invalid: ${labels.join(', ')}`;
}

export function sanitizeDiscountPayload<T extends Record<string, unknown>>(data: T): T {
  const out = { ...data };
  for (const key of Object.keys(out)) {
    if (out[key] === undefined) delete out[key];
  }
  return out;
}
