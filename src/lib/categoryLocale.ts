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

/** Collapse labels for fuzzy matching: "Street Food" / "streetfood" → "streetfood". */
export function normalizeCategoryMatchKey(value: string | undefined | null): string {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\u0370-\u03ff]+/g, '');
}

/**
 * Import / shorthand tags → match keys (and related catalog keys).
 * Covers JSON tags like coffee, vinery, streetfood, breakfast, etc.
 */
const CATEGORY_TAG_ALIASES: Record<string, string[]> = {
  coffee: ['cafe', 'café', 'caffee', 'kafe'],
  cafe: ['coffee', 'café', 'caffee'],
  café: ['cafe', 'coffee'],
  vinery: ['winery', 'wine', 'wineries'],
  winery: ['vinery', 'wine', 'wineries'],
  breakfast: ['brunch', 'breakfastbrunch'],
  brunch: ['breakfast', 'breakfastbrunch'],
  streetfood: ['streetfood'],
  beachbar: ['beachbar'],
  boattrip: ['boattour', 'boattours', 'boat'],
  boattour: ['boattrip', 'boattours', 'boat'],
  watersport: ['watersports', 'watersport'],
  watersports: ['watersport'],
  horseriding: ['horseriding', 'horsebackriding'],
  jeepsafari: ['jeepsafari', 'safar'],
  freshfish: ['freshfish', 'seafood', 'fish'],
  dessert: ['dessert', 'desserts', 'sweets', 'pastry', 'bakery'],
  dining: ['dining', 'restaurant', 'food'],
  nightlife: ['nightlife', 'bars', 'club'],
  traditional: ['traditional', 'taverna'],
  culture: ['culture', 'cultural', 'sightseeing', 'museum'],
  beach: ['beach', 'beaches'],
};

function categoryAliasKeys(matchKey: string): string[] {
  const out = new Set<string>([matchKey]);
  for (const alias of CATEGORY_TAG_ALIASES[matchKey] || []) {
    const key = normalizeCategoryMatchKey(alias);
    if (key) out.add(key);
  }
  // Also accept reverse: if catalog key is cafe, coffee should find it via coffee→cafe.
  for (const [tag, aliases] of Object.entries(CATEGORY_TAG_ALIASES)) {
    if (aliases.some((a) => normalizeCategoryMatchKey(a) === matchKey)) {
      out.add(tag);
    }
  }
  return [...out];
}

function categoryMatchKeyDistance(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const row = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i += 1) {
    let prev = i - 1;
    row[0] = i;
    for (let j = 1; j <= n; j += 1) {
      const temp = row[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost);
      prev = temp;
    }
  }
  return row[n];
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
    const matchKey = normalizeCategoryMatchKey(key);
    if (matchKey) index.set(`#${matchKey}`, canon);
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

function catalogPrimaryEntries(
  catalogDocs: Record<string, unknown>[],
  primaryLocale: string
): Array<{ primary: string; matchKey: string }> {
  const out: Array<{ primary: string; matchKey: string }> = [];
  const seen = new Set<string>();
  for (const doc of catalogDocs) {
    const primary = categoryPrimaryName(doc, primaryLocale).trim();
    if (!primary) continue;
    const dedupe = primary.toLowerCase();
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    out.push({ primary, matchKey: normalizeCategoryMatchKey(primary) });
  }
  return out;
}

/**
 * Resolve one raw tag/label (e.g. "coffee", "Breakfast", "vinery") to a catalog primary name.
 * Returns '' when nothing confident matches.
 */
export function resolveCategoryTagToPrimary(
  raw: string | undefined,
  catalogDocs: Record<string, unknown>[],
  primaryLocale: string,
  index = buildCategoryLabelIndex(catalogDocs, primaryLocale)
): string {
  const label = (raw || '').trim();
  if (!label) return '';

  const exact = index.get(label.toLowerCase());
  if (exact) return exact;

  const tagKey = normalizeCategoryMatchKey(label);
  if (!tagKey) return catalogDocs.length === 0 ? label : '';

  const keyed = index.get(`#${tagKey}`);
  if (keyed) return keyed;

  for (const aliasKey of categoryAliasKeys(tagKey)) {
    const hit = index.get(`#${aliasKey}`);
    if (hit) return hit;
  }

  if (catalogDocs.length === 0) return label;

  const catalog = catalogPrimaryEntries(catalogDocs, primaryLocale);
  let bestPrimary = '';
  let bestScore = Number.POSITIVE_INFINITY;

  const consider = (primary: string, score: number) => {
    if (score < bestScore) {
      bestScore = score;
      bestPrimary = primary;
    }
  };

  for (const entry of catalog) {
    if (!entry.matchKey) continue;

    for (const aliasKey of categoryAliasKeys(tagKey)) {
      if (entry.matchKey === aliasKey) {
        consider(entry.primary, 0);
        continue;
      }

      // "breakfast" inside "breakfastbrunch", "boat" inside "boattours"
      const minLen = Math.min(aliasKey.length, entry.matchKey.length);
      if (minLen >= 4) {
        if (entry.matchKey.includes(aliasKey)) {
          consider(entry.primary, 10 + (entry.matchKey.length - aliasKey.length));
        } else if (aliasKey.includes(entry.matchKey)) {
          consider(entry.primary, 12 + (aliasKey.length - entry.matchKey.length));
        }
      }

      const dist = categoryMatchKeyDistance(aliasKey, entry.matchKey);
      const maxLen = Math.max(aliasKey.length, entry.matchKey.length);
      if (maxLen >= 5 && dist <= 1) consider(entry.primary, 20 + dist);
      else if (maxLen >= 7 && dist <= 2) consider(entry.primary, 30 + dist);
    }
  }

  return bestPrimary;
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
    const primary = resolveCategoryTagToPrimary(raw, catalogDocs, primaryLocale, index);
    if (!primary) {
      // No catalog yet — keep raw so callers still see something.
      if (catalogDocs.length === 0) {
        const fallback = (raw || '').trim();
        if (!fallback) continue;
        const dedupeKey = fallback.toLowerCase();
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        out.push(fallback);
      }
      continue;
    }
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
