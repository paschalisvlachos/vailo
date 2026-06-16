import { buildCategoryLabelIndex } from './categoryLocale';

/** Google Places primaryType values (e.g. jewelry_store) — one per line or comma in admin UI. */
export function parseGoogleCategoriesText(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of String(text || '').split(/[\n,]+/)) {
    const value = part.trim().toLowerCase();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

export function formatGoogleCategoriesList(categories: string[] | undefined | null): string {
  if (!categories?.length) return '';
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of categories) {
    const value = String(raw || '').trim().toLowerCase();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out.join('\n');
}

export function mergeGoogleCategoryList(
  existing: string[] | undefined | null,
  ...incoming: (string | undefined | null)[]
): string[] {
  return parseGoogleCategoriesText(
    [formatGoogleCategoriesList(existing), ...incoming.filter(Boolean).map(String)].join('\n')
  );
}

export function mergeGoogleCategoriesText(
  currentText: string,
  ...incoming: (string | undefined | null)[]
): string {
  return formatGoogleCategoriesList(
    mergeGoogleCategoryList(parseGoogleCategoriesText(currentText), ...incoming)
  );
}

/** True when the label is a Google primaryType, not a Local Gems catalog name. */
export function isGooglePlaceCategory(
  value: string | undefined | null,
  catalogDocs: Record<string, unknown>[] = [],
  primaryLocale = 'en'
): boolean {
  const raw = String(value || '').trim();
  if (!raw) return false;
  const index = buildCategoryLabelIndex(catalogDocs, primaryLocale);
  if (index.has(raw.toLowerCase())) return false;
  return /^[a-z][a-z0-9_]*$/i.test(raw) && raw.includes('_');
}

export function googleCategoriesFromPlace(
  place: { category?: string; categories?: string[]; googleCategories?: string[] },
  catalogDocs: Record<string, unknown>[] = [],
  primaryLocale = 'en'
): string[] {
  const stored = mergeGoogleCategoryList(place.googleCategories);
  const legacy: string[] = [];
  if (place.category && isGooglePlaceCategory(place.category, catalogDocs, primaryLocale)) {
    legacy.push(place.category);
  }
  for (const cat of place.categories || []) {
    if (isGooglePlaceCategory(cat, catalogDocs, primaryLocale)) legacy.push(cat);
  }
  return mergeGoogleCategoryList(stored, ...legacy);
}
