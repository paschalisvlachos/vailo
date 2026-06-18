/** Excursion operator business — platform-managed catalog (Step 1). */

export type ExcursionProviderStatus = 'draft' | 'active' | 'suspended';

export type ExcursionProviderCommissionType = 'percent' | 'fixed_per_booking';

export type ExcursionProviderPayoutTerms = 'weekly' | 'monthly' | 'on_completion';

/** One operating region — matches `countries/{country}/areas/{areaId}`. */
export type ExcursionProviderRegion = {
  country: string;
  areaId: string;
  areaName: string;
};

export type ExcursionProvider = {
  id?: string;
  businessName: string;
  legalName?: string;
  vatNumber?: string;
  registrationNumber?: string;
  billingAddress?: string;
  city?: string;
  postalCode?: string;
  /** All countries/areas where this provider operates. */
  operatingRegions: ExcursionProviderRegion[];
  /** Denormalized for list filters — unique country names. */
  countries?: string[];
  email?: string;
  phone?: string;
  whatsapp?: string;
  website?: string;
  contactPersonName?: string;
  description?: string;
  languages?: string[];
  logoUrl?: string;
  licenseNumber?: string;
  timezone?: string;
  status: ExcursionProviderStatus;
  /** Admin-only — platform commission on guest sell price. */
  platformCommissionPercent: number;
  commissionType: ExcursionProviderCommissionType;
  fixedCommissionAmount?: number;
  contractStartDate?: string;
  contractEndDate?: string;
  contractNotes?: string;
  payoutTerms?: ExcursionProviderPayoutTerms;
  internalNotes?: string;
  /** Linked `owners` doc ids with role excursion_provider (Step 2). */
  linkedOwnerIds?: string[];
  createdAt?: string;
  updatedAt?: string;
};

export const EXCURSION_PROVIDER_COLLECTION = 'excursionProviders';

/** Subcollection under each provider — used in Step 3+. */
export const EXCURSION_SUBCOLLECTION = 'excursions';

export type ExcursionProviderFormData = {
  businessName: string;
  legalName: string;
  vatNumber: string;
  registrationNumber: string;
  billingAddress: string;
  city: string;
  postalCode: string;
  operatingRegions: ExcursionProviderRegion[];
  email: string;
  phone: string;
  whatsapp: string;
  website: string;
  contactPersonName: string;
  description: string;
  languages: string;
  logoUrl: string;
  licenseNumber: string;
  timezone: string;
  status: ExcursionProviderStatus;
  platformCommissionPercent: string;
  commissionType: ExcursionProviderCommissionType;
  fixedCommissionAmount: string;
  contractStartDate: string;
  contractEndDate: string;
  contractNotes: string;
  payoutTerms: ExcursionProviderPayoutTerms | '';
  internalNotes: string;
};

export const EMPTY_EXCURSION_PROVIDER_FORM: ExcursionProviderFormData = {
  businessName: '',
  legalName: '',
  vatNumber: '',
  registrationNumber: '',
  billingAddress: '',
  city: '',
  postalCode: '',
  operatingRegions: [],
  email: '',
  phone: '',
  whatsapp: '',
  website: '',
  contactPersonName: '',
  description: '',
  languages: '',
  logoUrl: '',
  licenseNumber: '',
  timezone: 'Europe/Athens',
  status: 'draft',
  platformCommissionPercent: '15',
  commissionType: 'percent',
  fixedCommissionAmount: '',
  contractStartDate: '',
  contractEndDate: '',
  contractNotes: '',
  payoutTerms: 'monthly',
  internalNotes: '',
};

export function operatingRegionKey(region: Pick<ExcursionProviderRegion, 'country' | 'areaId'>): string {
  return `${region.country}\u0000${region.areaId}`;
}

export function parseOperatingRegion(value: unknown): ExcursionProviderRegion | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const country = String(row.country || '').trim();
  const areaId = String(row.areaId || '').trim();
  if (!country || !areaId) return null;
  return {
    country,
    areaId,
    areaName: String(row.areaName || areaId).trim() || areaId,
  };
}

/** Read `operatingRegions` or legacy single country/area fields. */
export function normalizeOperatingRegions(data: Record<string, unknown>): ExcursionProviderRegion[] {
  if (Array.isArray(data.operatingRegions)) {
    const parsed = data.operatingRegions
      .map(parseOperatingRegion)
      .filter((r): r is ExcursionProviderRegion => r != null);
    if (parsed.length > 0) return dedupeOperatingRegions(parsed);
  }

  const country = String(data.country || '').trim();
  const areaId = String(data.areaId || '').trim();
  if (country && areaId) {
    return [
      {
        country,
        areaId,
        areaName: String(data.areaName || areaId).trim() || areaId,
      },
    ];
  }

  return [];
}

export function dedupeOperatingRegions(
  regions: ExcursionProviderRegion[]
): ExcursionProviderRegion[] {
  const seen = new Set<string>();
  const out: ExcursionProviderRegion[] = [];
  for (const region of regions) {
    const key = operatingRegionKey(region);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(region);
  }
  return out.sort((a, b) => {
    const c = a.country.localeCompare(b.country);
    if (c !== 0) return c;
    return a.areaName.localeCompare(b.areaName);
  });
}

export function uniqueCountriesFromRegions(regions: ExcursionProviderRegion[]): string[] {
  return [...new Set(regions.map((r) => r.country))].sort((a, b) => a.localeCompare(b));
}

export function formatOperatingRegionsSummary(regions: ExcursionProviderRegion[]): string {
  if (regions.length === 0) return '—';
  if (regions.length === 1) {
    const r = regions[0];
    return `${r.areaName} · ${r.country}`;
  }
  if (regions.length <= 3) {
    return regions.map((r) => `${r.areaName} (${r.country})`).join(', ');
  }
  const countryCount = uniqueCountriesFromRegions(regions).length;
  return `${regions.length} areas · ${countryCount} ${countryCount === 1 ? 'country' : 'countries'}`;
}

export function providerOperatesInCountry(
  provider: Pick<ExcursionProvider, 'operatingRegions' | 'countries'>,
  country: string
): boolean {
  if (!country) return true;
  if (provider.countries?.includes(country)) return true;
  return provider.operatingRegions.some((r) => r.country === country);
}

export function providerOperatesInArea(
  provider: Pick<ExcursionProvider, 'operatingRegions'>,
  country: string,
  areaId: string
): boolean {
  if (!country || !areaId) return false;
  return provider.operatingRegions.some(
    (r) => r.country === country && r.areaId === areaId
  );
}

export function excursionProviderFormFromDoc(
  data: Record<string, unknown>
): ExcursionProviderFormData {
  return {
    businessName: String(data.businessName || ''),
    legalName: String(data.legalName || ''),
    vatNumber: String(data.vatNumber || ''),
    registrationNumber: String(data.registrationNumber || ''),
    billingAddress: String(data.billingAddress || ''),
    city: String(data.city || ''),
    postalCode: String(data.postalCode || ''),
    operatingRegions: normalizeOperatingRegions(data),
    email: String(data.email || ''),
    phone: String(data.phone || ''),
    whatsapp: String(data.whatsapp || ''),
    website: String(data.website || ''),
    contactPersonName: String(data.contactPersonName || ''),
    description: String(data.description || ''),
    languages: Array.isArray(data.languages) ? data.languages.join(', ') : '',
    logoUrl: String(data.logoUrl || ''),
    licenseNumber: String(data.licenseNumber || ''),
    timezone: String(data.timezone || 'Europe/Athens'),
    status:
      data.status === 'active' || data.status === 'suspended' ? data.status : 'draft',
    platformCommissionPercent: String(
      data.platformCommissionPercent != null ? data.platformCommissionPercent : '15'
    ),
    commissionType:
      data.commissionType === 'fixed_per_booking' ? 'fixed_per_booking' : 'percent',
    fixedCommissionAmount:
      data.fixedCommissionAmount != null ? String(data.fixedCommissionAmount) : '',
    contractStartDate: String(data.contractStartDate || ''),
    contractEndDate: String(data.contractEndDate || ''),
    contractNotes: String(data.contractNotes || ''),
    payoutTerms:
      data.payoutTerms === 'weekly' ||
      data.payoutTerms === 'monthly' ||
      data.payoutTerms === 'on_completion'
        ? data.payoutTerms
        : 'monthly',
    internalNotes: String(data.internalNotes || ''),
  };
}

export function excursionProviderPayloadFromForm(
  form: ExcursionProviderFormData
): Omit<ExcursionProvider, 'id'> {
  const languages = form.languages
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const commissionPercent = parseFloat(form.platformCommissionPercent);
  const fixedAmount = parseFloat(form.fixedCommissionAmount);
  const operatingRegions = dedupeOperatingRegions(form.operatingRegions);

  return {
    businessName: form.businessName.trim(),
    legalName: form.legalName.trim() || undefined,
    vatNumber: form.vatNumber.trim() || undefined,
    registrationNumber: form.registrationNumber.trim() || undefined,
    billingAddress: form.billingAddress.trim() || undefined,
    city: form.city.trim() || undefined,
    postalCode: form.postalCode.trim() || undefined,
    operatingRegions,
    countries: uniqueCountriesFromRegions(operatingRegions),
    email: form.email.trim().toLowerCase() || undefined,
    phone: form.phone.trim() || undefined,
    whatsapp: form.whatsapp.trim() || undefined,
    website: form.website.trim() || undefined,
    contactPersonName: form.contactPersonName.trim() || undefined,
    description: form.description.trim() || undefined,
    languages: languages.length > 0 ? languages : undefined,
    logoUrl: form.logoUrl.trim() || undefined,
    licenseNumber: form.licenseNumber.trim() || undefined,
    timezone: form.timezone.trim() || undefined,
    status: form.status,
    platformCommissionPercent: Number.isFinite(commissionPercent) ? commissionPercent : 0,
    commissionType: form.commissionType,
    fixedCommissionAmount:
      form.commissionType === 'fixed_per_booking' && Number.isFinite(fixedAmount)
        ? fixedAmount
        : undefined,
    contractStartDate: form.contractStartDate.trim() || undefined,
    contractEndDate: form.contractEndDate.trim() || undefined,
    contractNotes: form.contractNotes.trim() || undefined,
    payoutTerms: form.payoutTerms || undefined,
    internalNotes: form.internalNotes.trim() || undefined,
  };
}

export function excursionProviderStatusLabel(status: ExcursionProviderStatus): string {
  switch (status) {
    case 'active':
      return 'Active';
    case 'suspended':
      return 'Suspended';
    default:
      return 'Draft';
  }
}

export type ExcursionProviderFieldError = {
  field: keyof ExcursionProviderFormData | 'operatingRegions';
  label: string;
  message: string;
};

export function validateExcursionProviderForm(
  form: ExcursionProviderFormData,
  options: { includeCommercial?: boolean } = {}
): ExcursionProviderFieldError[] {
  const includeCommercial = options.includeCommercial !== false;
  const errors: ExcursionProviderFieldError[] = [];

  if (!form.businessName.trim()) {
    errors.push({
      field: 'businessName',
      label: 'Business name',
      message: 'Business name is required.',
    });
  }

  if (form.operatingRegions.length === 0) {
    errors.push({
      field: 'operatingRegions',
      label: 'Operating regions',
      message: 'Select at least one country and area where this provider operates.',
    });
  }

  if (form.email.trim()) {
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim());
    if (!emailOk) {
      errors.push({
        field: 'email',
        label: 'Email',
        message: 'Enter a valid email address or leave blank.',
      });
    }
  }

  if (includeCommercial && form.commissionType === 'percent') {
    const pct = parseFloat(form.platformCommissionPercent);
    if (!form.platformCommissionPercent.trim() || !Number.isFinite(pct)) {
      errors.push({
        field: 'platformCommissionPercent',
        label: 'Platform commission %',
        message: 'Enter a valid commission percentage.',
      });
    } else if (pct < 0 || pct > 100) {
      errors.push({
        field: 'platformCommissionPercent',
        label: 'Platform commission %',
        message: 'Commission must be between 0 and 100.',
      });
    }
  }

  if (includeCommercial && form.commissionType === 'fixed_per_booking') {
    const fixed = parseFloat(form.fixedCommissionAmount);
    if (!form.fixedCommissionAmount.trim() || !Number.isFinite(fixed)) {
      errors.push({
        field: 'fixedCommissionAmount',
        label: 'Fixed commission',
        message: 'Enter the fixed commission amount in EUR.',
      });
    } else if (fixed < 0) {
      errors.push({
        field: 'fixedCommissionAmount',
        label: 'Fixed commission',
        message: 'Commission cannot be negative.',
      });
    }
  }

  if (includeCommercial && form.contractStartDate && form.contractEndDate) {
    if (form.contractEndDate < form.contractStartDate) {
      errors.push({
        field: 'contractEndDate',
        label: 'Contract end',
        message: 'Contract end must be on or after contract start.',
      });
    }
  }

  return errors;
}

/** Fields excursion providers may update — excludes commercial/admin-only data. */
export function excursionProviderPortalPayloadFromForm(
  form: ExcursionProviderFormData
): Record<string, unknown> {
  const full = excursionProviderPayloadFromForm(form);
  const {
    platformCommissionPercent: _pct,
    commissionType: _type,
    fixedCommissionAmount: _fixed,
    contractStartDate: _start,
    contractEndDate: _end,
    contractNotes: _notes,
    payoutTerms: _payout,
    internalNotes: _internal,
    ...portalFields
  } = full;
  return portalFields;
}

export function excursionProviderValidationSummary(
  errors: ExcursionProviderFieldError[]
): string {
  if (errors.length === 0) return '';
  const labels = [...new Set(errors.map((e) => e.label))];
  return `Missing or invalid: ${labels.join(', ')}`;
}

/** Firestore rejects documents containing explicit `undefined` field values. */
export function sanitizeFirestorePayload<T extends Record<string, unknown>>(data: T): T {
  const out = { ...data };
  for (const key of Object.keys(out)) {
    if (out[key] === undefined) delete out[key];
  }
  return out;
}

export function formatExcursionProviderSaveError(error: unknown): string {
  if (error instanceof Error) {
    const msg = error.message || '';
    if (/undefined/i.test(msg) && /invalid data/i.test(msg)) {
      return 'Save failed: empty optional fields blocked the write. Retry after filling the highlighted fields.';
    }
    if (/permission/i.test(msg) || /insufficient/i.test(msg)) {
      return 'Save failed: you do not have permission to save this provider.';
    }
    if (/storage/i.test(msg) || /upload/i.test(msg)) {
      return `Logo upload failed: ${msg}`;
    }
    if (msg.trim()) return `Save failed: ${msg}`;
  }
  return 'Save failed: an unexpected error occurred. Check the browser console for details.';
}
