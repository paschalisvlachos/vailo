export type WizardListingDraft = {
  propertyTypeName: string;
  urlSlug: string;
  googleMapsUrl: string;
  /** Generic reference links (OTA, website, etc.) — not channel-specific fields. */
  referenceUrls: string[];
  iCalUrl: string;
  addressLine: string;
  country: string;
  city: string;
  area: string;
  postCode: string;
  latitude: string;
  longitude: string;
  googlePlaceId: string;
  googleRating: string;
  photoUrl: string;
  onboardingNotes: string;
  wifiName: string;
  wifiPassword: string;
  whatsapp: string;
  internalRefCode: string;
};

export const EMPTY_WIZARD_LISTING: WizardListingDraft = {
  propertyTypeName: '',
  urlSlug: '',
  googleMapsUrl: '',
  referenceUrls: [''],
  iCalUrl: '',
  addressLine: '',
  country: '',
  city: '',
  area: '',
  postCode: '',
  latitude: '',
  longitude: '',
  googlePlaceId: '',
  googleRating: '',
  photoUrl: '',
  onboardingNotes: '',
  wifiName: '',
  wifiPassword: '',
  whatsapp: '',
  internalRefCode: '',
};

export function newWizardListingInternalRefCode() {
  return `TYP-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
}

export type WizardListingFieldKey =
  | 'propertyTypeName'
  | 'urlSlug'
  | 'addressLine'
  | 'country'
  | 'city'
  | 'area'
  | 'googleMapsUrl';

export type WizardListingFieldErrors = Partial<Record<WizardListingFieldKey, string>>;

export function getWizardListingFieldErrors(
  draft: WizardListingDraft
): WizardListingFieldErrors {
  const errors: WizardListingFieldErrors = {};
  if (!draft.propertyTypeName.trim()) {
    errors.propertyTypeName = 'Listing name is required — guests see this on the portal.';
  }
  if (!draft.urlSlug.trim()) {
    errors.urlSlug = 'URL slug is required — used in the guest portal link for this unit.';
  }
  if (!draft.addressLine.trim()) {
    errors.addressLine =
      'Street address is required. Use Maps Auto-fill, or type it manually below.';
  }
  if (!draft.country.trim()) {
    errors.country = 'Country is required so we can create the master area.';
  }
  if (!draft.city.trim()) {
    errors.city =
      'City / Master Area is required — pick or create the municipality for local gems.';
  }
  if (!draft.area.trim()) {
    errors.area = 'Neighborhood / area is required (for example the village or district name).';
  }
  return errors;
}

export function isWizardListingComplete(draft: WizardListingDraft): boolean {
  return Object.keys(getWizardListingFieldErrors(draft)).length === 0;
}

export function firstWizardListingErrorKey(
  errors: WizardListingFieldErrors
): WizardListingFieldKey | null {
  const order: WizardListingFieldKey[] = [
    'googleMapsUrl',
    'propertyTypeName',
    'urlSlug',
    'addressLine',
    'country',
    'city',
    'area',
  ];
  return order.find((key) => Boolean(errors[key])) || null;
}

export function wizardListingFieldDomId(key: WizardListingFieldKey): string {
  return `wizard-listing-${key}`;
}

export function scrollToWizardListingField(key: WizardListingFieldKey) {
  const el = document.getElementById(wizardListingFieldDomId(key));
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const focusable = el.querySelector<HTMLElement>(
    'input, select, textarea, button, [tabindex]'
  );
  window.setTimeout(() => focusable?.focus?.(), 280);
}

/** Session handoff from property wizard → House Guide AI Import. */
export function wizardOnboardingStorageKey(propertyId: string, listingId: string) {
  return `vailo.wizardOnboarding.${propertyId}.${listingId}`;
}

export function normalizeWizardReferenceUrls(urls: string[] | undefined): string[] {
  const cleaned = (urls || []).map((u) => String(u || '').trim()).filter(Boolean);
  return cleaned.length ? cleaned : [];
}

/** UI rows: keep filled URLs plus exactly one trailing blank for the next entry. */
export function referenceUrlRowsWithTrailingBlank(urls: string[] | undefined): string[] {
  const filled = normalizeWizardReferenceUrls(urls);
  return [...filled, ''];
}

export function buildListingOnboardingSeedText(draft: WizardListingDraft): string {
  const lines: string[] = [
    'Property listing setup (from Add Property wizard)',
    '',
    `Listing name: ${draft.propertyTypeName.trim() || '—'}`,
    `Street address: ${draft.addressLine.trim() || '—'}`,
    `Country: ${draft.country.trim() || '—'}`,
    `City / master area: ${draft.city.trim() || '—'}`,
    `Neighborhood: ${draft.area.trim() || '—'}`,
    `Postal code: ${draft.postCode.trim() || '—'}`,
  ];

  const links: string[] = [];
  if (draft.googleMapsUrl.trim()) links.push(`Google Maps: ${draft.googleMapsUrl.trim()}`);
  for (const url of normalizeWizardReferenceUrls(draft.referenceUrls)) {
    links.push(url);
  }
  if (draft.iCalUrl.trim()) links.push(`iCal feed: ${draft.iCalUrl.trim()}`);

  if (links.length) {
    lines.push('', 'Reference links:', ...links.map((u) => `- ${u}`));
  }

  if (draft.onboardingNotes.trim()) {
    lines.push('', 'Host notes / instructions:', draft.onboardingNotes.trim());
  }

  lines.push(
    '',
    'Note for AI: Prefer the host notes and any uploaded files when filling house guide fields. Use links as reference only — do not assume OTA pages were scraped.'
  );

  return lines.join('\n');
}

export function storeWizardOnboardingSeed(
  propertyId: string,
  listingId: string,
  seedText: string
) {
  try {
    sessionStorage.setItem(wizardOnboardingStorageKey(propertyId, listingId), seedText);
  } catch {
    /* ignore quota / private mode */
  }
}

export function takeWizardOnboardingSeed(propertyId: string, listingId: string): string {
  const key = wizardOnboardingStorageKey(propertyId, listingId);
  try {
    const value = sessionStorage.getItem(key) || '';
    if (value) sessionStorage.removeItem(key);
    return value;
  } catch {
    return '';
  }
}
