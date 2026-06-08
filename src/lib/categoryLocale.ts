import {
  buildLocalizedFirestorePayload,
  mergeLegacyIntoLocaleMap,
  normalizeLocaleCode,
  readLocaleMap,
  resolveLocalizedString,
  setLocaleFieldValue,
  type LocaleStringMap,
} from './propertyContentLocales';

/** Display label for a category document (gems or features category). */
export function resolveCategoryLabel(
  doc: Record<string, unknown> | null | undefined,
  locale: string,
  primaryLocale: string,
  reviewedLocales?: string[] | null
): string {
  return resolveLocalizedString(doc, 'name', locale, primaryLocale, reviewedLocales);
}

/** Primary-locale category name used for matching / legacy fields. */
export function categoryPrimaryName(
  doc: Record<string, unknown> | null | undefined,
  primaryLocale: string
): string {
  const primary = normalizeLocaleCode(primaryLocale) || 'en';
  return resolveLocalizedString(doc, 'name', primary, primary) || '';
}

export function buildCategoryNamePayload(
  maps: Record<string, LocaleStringMap>,
  primaryLocale: string
): Record<string, unknown> {
  return buildLocalizedFirestorePayload(['name'], maps, primaryLocale, {});
}

export function renameValueInLocaleMap(
  map: LocaleStringMap | undefined,
  oldName: string,
  newName: string
): LocaleStringMap | undefined {
  if (!map || !oldName || !newName || oldName === newName) return map;
  let changed = false;
  const next: LocaleStringMap = { ...map };
  for (const [code, value] of Object.entries(next)) {
    if ((value || '').trim() === oldName) {
      next[code] = newName;
      changed = true;
    }
  }
  return changed ? next : map;
}

/** Canonical primary category names stored on a local gem. */
export function gemCategoryPrimaries(
  gem: Record<string, unknown>,
  catalogDocs: Record<string, unknown>[] = [],
  primaryLocale = 'en',
  guestLocale?: string
): string[] {
  if (Array.isArray(gem.categories) && gem.categories.length > 0) {
    return normalizeCategorySelectionList(
      gem.categories as string[],
      catalogDocs,
      primaryLocale
    );
  }
  const single = resolveGemCategoryPrimary(gem, catalogDocs, primaryLocale, guestLocale);
  return single ? [single] : [];
}

/** Patch gem/place doc when a category label is renamed. */
export function patchLinkedGemCategory(
  data: Record<string, unknown>,
  oldName: string,
  newName: string
): Record<string, unknown> | null {
  if (!oldName || !newName || oldName === newName) return null;
  const patch: Record<string, unknown> = {};
  if (data.category === oldName) patch.category = newName;

  const cats = patchLinkedFeatureCategoriesList(data.categories, oldName, newName);
  if (cats) patch.categories = cats;

  const map = readLocaleMap(data, 'category');
  const nextMap = renameValueInLocaleMap(map, oldName, newName);
  if (nextMap && nextMap !== map) patch.categoryByLocale = nextMap;

  return Object.keys(patch).length > 0 ? patch : null;
}

export function patchLinkedFeatureCategoriesList(
  categories: unknown,
  oldName: string,
  newName: string
): string[] | null {
  if (!Array.isArray(categories) || !oldName || !newName || oldName === newName) return null;
  if (!categories.includes(oldName)) return null;
  return categories.map((c) => (c === oldName ? newName : c));
}

export function patchLinkedExperienceTypes(
  types: unknown,
  oldName: string,
  newName: string
): string[] | null {
  return patchLinkedFeatureCategoriesList(types, oldName, newName);
}

export function setCategoryNameInMaps(
  maps: Record<string, LocaleStringMap>,
  locale: string,
  value: string,
  primaryLocale: string
): Record<string, LocaleStringMap> {
  const primary = normalizeLocaleCode(primaryLocale) || 'en';
  const code = normalizeLocaleCode(locale) || primary;
  return {
    ...maps,
    name: setLocaleFieldValue(maps.name || {}, code, value),
  };
}

export function getCategoryNameFromMaps(
  maps: Record<string, LocaleStringMap>,
  locale: string,
  primaryLocale: string,
  legacyName?: string
): string {
  const primary = normalizeLocaleCode(primaryLocale) || 'en';
  const code = normalizeLocaleCode(locale) || primary;
  const map = mergeLegacyIntoLocaleMap(maps.name || {}, legacyName, primary);
  return (map[code] || '').trim();
}

/** Map any category label (primary or translation) back to the canonical primary name. */
export function buildCategoryLabelIndex(
  catalogDocs: Record<string, unknown>[],
  primaryLocale: string
): Map<string, string> {
  const index = new Map<string, string>();

  const add = (label: string | undefined, primaryName: string) => {
    const key = (label || '').trim().toLowerCase();
    const canon = (primaryName || '').trim();
    if (!key || !canon) return;
    index.set(key, canon);
  };

  for (const doc of catalogDocs) {
    const primaryName = categoryPrimaryName(doc, primaryLocale);
    add(primaryName, primaryName);
    add(typeof doc.name === 'string' ? doc.name : undefined, primaryName);
    const map = readLocaleMap(doc, 'name');
    for (const v of Object.values(map)) add(v, primaryName);
  }
  return index;
}

/** Normalize stored selections to canonical primary names (stable across language tabs). */
export function normalizeCategorySelectionList(
  selected: string[] | undefined,
  catalogDocs: Record<string, unknown>[],
  primaryLocale: string
): string[] {
  if (!selected?.length) return [];
  const index = buildCategoryLabelIndex(catalogDocs, primaryLocale);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of selected) {
    const key = (raw || '').trim().toLowerCase();
    if (!key) continue;
    const primary = index.get(key) || (raw || '').trim();
    const dedupeKey = primary.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    out.push(primary);
  }
  return out;
}

export function resolveCategoryToPrimary(
  value: string | undefined,
  catalogDocs: Record<string, unknown>[],
  primaryLocale: string
): string {
  const list = normalizeCategorySelectionList(value ? [value] : [], catalogDocs, primaryLocale);
  return list[0] || (value || '').trim();
}

export function categorySelectionIncludes(
  selected: string[],
  primaryName: string,
  catalogDocs: Record<string, unknown>[],
  primaryLocale: string
): boolean {
  const target = (primaryName || '').trim().toLowerCase();
  if (!target) return false;
  return normalizeCategorySelectionList(selected, catalogDocs, primaryLocale).some(
    (s) => s.toLowerCase() === target
  );
}

function resolveGemCategoryPrimary(
  gem: Record<string, unknown>,
  catalogDocs: Record<string, unknown>[],
  primaryLocale: string,
  guestLocale?: string
): string {
  const primary = normalizeLocaleCode(primaryLocale) || 'en';
  const locale = normalizeLocaleCode(guestLocale || '') || primary;
  const label =
    resolveLocalizedString(gem, 'category', locale, primary) ||
    (typeof gem.category === 'string' ? gem.category : '');
  return resolveCategoryToPrimary(label, catalogDocs, primaryLocale);
}

/** Match a local gem to a canonical category primary (handles EN/EL labels, multi-category). */
export function gemBelongsToCategory(
  gem: Record<string, unknown>,
  categoryPrimary: string,
  catalogDocs: Record<string, unknown>[],
  primaryLocale: string,
  guestLocale?: string
): boolean {
  const target = (categoryPrimary || '').trim().toLowerCase();
  if (!target) return false;
  return gemCategoryPrimaries(gem, catalogDocs, primaryLocale, guestLocale).some(
    (p) => p.toLowerCase() === target
  );
}

/** Match a feature to a canonical category primary. */
export function featureBelongsToCategory(
  feature: Record<string, unknown>,
  categoryPrimary: string,
  catalogDocs: Record<string, unknown>[],
  primaryLocale: string
): boolean {
  const target = (categoryPrimary || '').trim().toLowerCase();
  if (!target) return false;
  const cats = Array.isArray(feature.categories) ? feature.categories : [];
  return cats.some((raw) =>
    resolveCategoryToPrimary(String(raw || ''), catalogDocs, primaryLocale).toLowerCase() === target
  );
}
