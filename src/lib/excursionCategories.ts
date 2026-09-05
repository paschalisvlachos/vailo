/** Excursion / offering categories — uses the Arrange and Book taxonomy. */

import {
  ARRANGE_AND_BOOK_CATEGORIES,
  arrangeAndBookCategoryById,
  arrangeAndBookSubcategoryById,
  normalizeArrangeAndBookSelection,
} from './arrangeAndBook';

export type ExcursionCategoryOption = {
  id: string;
  label: string;
};

const LEGACY_EXCURSION_CATEGORY_MAP: Record<string, string> = {
  hiking: 'hiking_tours',
  'hiking & trekking': 'hiking_tours',
  nature: 'hiking_tours',
  'nature & wildlife': 'hiking_tours',
  boat: 'sailing',
  'boat & sea': 'sailing',
  water: 'snorkeling',
  'water activities': 'snorkeling',
  food_wine: 'wine_tours',
  'food & wine': 'wine_tours',
  culture: 'private_tours',
  'culture & history': 'private_tours',
  sightseeing: 'private_tours',
  adventure: 'hiking_tours',
  'adventure & sports': 'hiking_tours',
  family: 'family_activities',
  'family friendly': 'family_activities',
  transfer: 'airport_transfer',
  'transfer & transport': 'airport_transfer',
  wellness: 'massage',
  'wellness & relaxation': 'massage',
  photography: 'photographer',
  'photography tour': 'photographer',
};

/** @deprecated Use Arrange and Book subcategories. Kept so older forms still resolve. */
export const EXCURSION_CATEGORY_OPTIONS: ExcursionCategoryOption[] = ARRANGE_AND_BOOK_CATEGORIES.flatMap(
  (category) => category.subcategories
);

/** Legacy category ids/labels — tour type comes from pricing model, not categories. */
export const EXCURSION_TOUR_TYPE_CATEGORY_IDS = ['private', 'group'] as const;

export function isExcursionTourTypeCategory(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  return (
    (EXCURSION_TOUR_TYPE_CATEGORY_IDS as readonly string[]).includes(normalized) ||
    normalized === 'private tour' ||
    normalized === 'group tour'
  );
}

export function excursionCategoryLabel(id: string): string | undefined {
  return arrangeAndBookSubcategoryById(id)?.label || arrangeAndBookCategoryById(id)?.label;
}

function resolveStoredCategory(value: string): { categoryId?: string; subcategoryId?: string; custom?: string } {
  const trimmed = value.trim();
  if (!trimmed) return {};

  const asSub = arrangeAndBookSubcategoryById(trimmed);
  if (asSub) return { categoryId: asSub.categoryId, subcategoryId: asSub.id };

  const asCat = arrangeAndBookCategoryById(trimmed);
  if (asCat) return { categoryId: asCat.id };

  const lower = trimmed.toLowerCase();
  const byLabel = ARRANGE_AND_BOOK_CATEGORIES.flatMap((category) =>
    category.subcategories.map((sub) => ({ ...sub, categoryId: category.id }))
  ).find((sub) => sub.label.toLowerCase() === lower);
  if (byLabel) return { categoryId: byLabel.categoryId, subcategoryId: byLabel.id };

  const byCategoryLabel = ARRANGE_AND_BOOK_CATEGORIES.find((category) => category.label.toLowerCase() === lower);
  if (byCategoryLabel) return { categoryId: byCategoryLabel.id };

  const mapped = LEGACY_EXCURSION_CATEGORY_MAP[trimmed] || LEGACY_EXCURSION_CATEGORY_MAP[lower];
  if (mapped) {
    const ref = arrangeAndBookSubcategoryById(mapped);
    if (ref) return { categoryId: ref.categoryId, subcategoryId: ref.id };
  }

  return { custom: trimmed };
}

export function categoriesFormFromDoc(categories?: string[]): {
  selectedIds: string[];
  custom: string;
  categoryIds: string[];
  subcategoryIds: string[];
} {
  const categoryIds: string[] = [];
  const subcategoryIds: string[] = [];
  const custom: string[] = [];

  for (const raw of categories || []) {
    const resolved = resolveStoredCategory(String(raw || ''));
    if (resolved.subcategoryId && !subcategoryIds.includes(resolved.subcategoryId)) {
      subcategoryIds.push(resolved.subcategoryId);
    }
    if (resolved.categoryId && !categoryIds.includes(resolved.categoryId)) {
      categoryIds.push(resolved.categoryId);
    }
    if (resolved.custom) custom.push(resolved.custom);
  }

  const normalized = normalizeArrangeAndBookSelection(categoryIds, subcategoryIds);
  return {
    selectedIds: normalized.subcategoryIds,
    custom: custom.join(', '),
    categoryIds: normalized.categoryIds,
    subcategoryIds: normalized.subcategoryIds,
  };
}

export function categoriesPayloadFromForm(
  selectedIds: string[],
  custom: string,
  categoryIds: string[] = []
): string[] | undefined {
  const labels = [
    ...categoryIds
      .map((id) => arrangeAndBookCategoryById(id)?.label)
      .filter((label): label is string => Boolean(label)),
    ...selectedIds
      .map((id) => arrangeAndBookSubcategoryById(id)?.label)
      .filter((label): label is string => Boolean(label)),
  ];
  const extras = custom
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const all: string[] = [];
  for (const label of [...labels, ...extras]) {
    if (!label || seen.has(label)) continue;
    seen.add(label);
    all.push(label);
  }
  return all.length > 0 ? all : undefined;
}

const DEFAULT_SERVICE_CATEGORY_ID = 'experiences';
const DEFAULT_SERVICE_SUBCATEGORY_ID = 'excursions';

function offeringResolvedTags(categories?: string[]) {
  return (categories || [])
    .map((value) => resolveStoredCategory(String(value || '')))
    .filter((item) => {
      if (item.custom && isExcursionTourTypeCategory(item.custom)) return false;
      return Boolean(item.categoryId || item.subcategoryId || item.custom);
    });
}

function offeringTopLevelCategoryIds(
  resolved: ReturnType<typeof offeringResolvedTags>
): string[] {
  const ids = new Set<string>();
  for (const item of resolved) {
    if (item.categoryId) ids.add(item.categoryId);
    if (item.subcategoryId) {
      const ref = arrangeAndBookSubcategoryById(item.subcategoryId);
      if (ref) ids.add(ref.categoryId);
    }
  }
  return [...ids];
}

export function listingServiceGroupsFromOfferings(
  offerings: Array<{ categories?: string[] }>
): { categoryId: string; categoryLabel: string; services: string[] }[] {
  const inferred = inferServicesFromOfferings(offerings);
  return ARRANGE_AND_BOOK_CATEGORIES.filter((category) =>
    inferred.categoryIds.includes(category.id)
  ).map((category) => ({
    categoryId: category.id,
    categoryLabel: category.label,
    services: category.subcategories
      .filter((sub) => inferred.subcategoryIds.includes(sub.id))
      .map((sub) => sub.label),
  }));
}

export function inferServicesFromOfferings(
  offerings: Array<{ categories?: string[] }>
): { categoryIds: string[]; subcategoryIds: string[] } {
  const categoryIds = new Set<string>();
  const subcategoryIds = new Set<string>();

  for (const offering of offerings) {
    const resolved = offeringResolvedTags(offering.categories);
    const topLevel = offeringTopLevelCategoryIds(resolved);
    const subs = resolved
      .map((item) => item.subcategoryId)
      .filter((id): id is string => Boolean(id));

    if (topLevel.length === 0 && subs.length === 0) {
      categoryIds.add(DEFAULT_SERVICE_CATEGORY_ID);
      subcategoryIds.add(DEFAULT_SERVICE_SUBCATEGORY_ID);
      continue;
    }

    for (const id of topLevel) categoryIds.add(id);
    for (const id of subs) subcategoryIds.add(id);
  }

  return normalizeArrangeAndBookSelection([...categoryIds], [...subcategoryIds]);
}

/** Existing catalog items live under Experiences → Excursions until given a more specific service. */
export function offeringMatchesArrangeAndBook(
  categories: string[] | undefined,
  categoryId: string,
  subcategoryId = ''
): boolean {
  if (!categoryId && !subcategoryId) return true;

  const resolved = offeringResolvedTags(categories);
  const topLevel = offeringTopLevelCategoryIds(resolved);
  const subcategoryIds = resolved
    .map((item) => item.subcategoryId)
    .filter((id): id is string => Boolean(id));
  const experienceSubcategoryIds = subcategoryIds.filter(
    (id) => arrangeAndBookSubcategoryById(id)?.categoryId === DEFAULT_SERVICE_CATEGORY_ID
  );
  const hasSpecificExperienceService = experienceSubcategoryIds.some(
    (id) => id !== DEFAULT_SERVICE_SUBCATEGORY_ID
  );
  const defaultsToExperiences =
    topLevel.length === 0 || topLevel.includes(DEFAULT_SERVICE_CATEGORY_ID);

  if (subcategoryId === DEFAULT_SERVICE_SUBCATEGORY_ID) {
    if (subcategoryIds.includes(DEFAULT_SERVICE_SUBCATEGORY_ID)) return true;
    return defaultsToExperiences && !hasSpecificExperienceService;
  }

  if (subcategoryId) {
    return subcategoryIds.includes(subcategoryId);
  }

  if (categoryId === DEFAULT_SERVICE_CATEGORY_ID) {
    return defaultsToExperiences;
  }

  return (
    topLevel.includes(categoryId) ||
    subcategoryIds.some((id) => arrangeAndBookSubcategoryById(id)?.categoryId === categoryId)
  );
}

export function formatExcursionCategoriesSummary(categories?: string[]): string {
  if (!categories?.length) return '—';
  if (categories.length <= 2) return categories.join(', ');
  return `${categories.slice(0, 2).join(', ')} +${categories.length - 2}`;
}
