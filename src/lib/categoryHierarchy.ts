import { categoryPrimaryName, resolveCategoryLabel } from './categoryLocale';
import { categoryEligibleForLiveLikeLocal, isExcludedFromLiveLikeLocal } from './liveLikeLocalCategories';

export const MAX_WIZARD_PARENT_CATEGORIES = 3;
export const SUBCATEGORY_PREVIEW_COUNT = 6;

export type CategoryDocRecord = { id: string; data: Record<string, unknown> };
export type CategoryOption = { primary: string; label: string };

export function readParentCategoryId(doc: Record<string, unknown> | null | undefined): string | null {
  const id = doc?.parentCategoryId;
  return typeof id === 'string' && id.trim() ? id.trim() : null;
}

/** Subcategories inherit parent knowledge when unset or explicitly true. */
export function inheritsKnowledgeFromParent(doc: Record<string, unknown> | null | undefined): boolean {
  if (!readParentCategoryId(doc)) return false;
  return doc?.inheritKnowledgeFromParent !== false;
}

export function isTopLevelCategory(doc: Record<string, unknown> | null | undefined): boolean {
  return !readParentCategoryId(doc);
}

function toCategoryOption(
  data: Record<string, unknown>,
  locale: string,
  primaryLocale: string,
  reviewedLocales?: string[] | null
): CategoryOption {
  const primary = categoryPrimaryName(data, primaryLocale).trim();
  const label =
    resolveCategoryLabel(data, locale, primaryLocale, reviewedLocales).trim() || primary;
  return { primary, label };
}

export function buildGuestCategoryHierarchy(
  docs: CategoryDocRecord[],
  locale: string,
  primaryLocale: string,
  reviewedLocales?: string[] | null
): {
  parentCategories: CategoryOption[];
  subcategoriesByParentPrimary: Record<string, CategoryOption[]>;
} {
  const parents: CategoryDocRecord[] = [];
  const children: CategoryDocRecord[] = [];

  for (const doc of docs) {
    if (readParentCategoryId(doc.data)) children.push(doc);
    else parents.push(doc);
  }

  const parentById = new Map(
    parents.map((p) => [p.id, categoryPrimaryName(p.data, primaryLocale).trim()])
  );
  const excludedParentPrimaries = new Set(
    parents
      .filter((p) => isExcludedFromLiveLikeLocal(p.data))
      .map((p) => categoryPrimaryName(p.data, primaryLocale).trim().toLowerCase())
  );

  const parentCategories: CategoryOption[] = [];
  const subcategoriesByParentPrimary: Record<string, CategoryOption[]> = {};

  for (const p of parents) {
    if (!categoryEligibleForLiveLikeLocal(p.data, primaryLocale)) continue;
    const opt = toCategoryOption(p.data, locale, primaryLocale, reviewedLocales);
    parentCategories.push(opt);
    subcategoriesByParentPrimary[opt.primary] = [];
  }

  for (const c of children) {
    if (!categoryEligibleForLiveLikeLocal(c.data, primaryLocale)) continue;
    const parentId = readParentCategoryId(c.data);
    if (!parentId) continue;
    const parentPrimary = parentById.get(parentId);
    if (!parentPrimary) continue;
    if (excludedParentPrimaries.has(parentPrimary.toLowerCase())) continue;
    if (!subcategoriesByParentPrimary[parentPrimary]) continue;

    const opt = toCategoryOption(c.data, locale, primaryLocale, reviewedLocales);
    subcategoriesByParentPrimary[parentPrimary].push(opt);
  }

  parentCategories.sort((a, b) => a.label.localeCompare(b.label));
  for (const key of Object.keys(subcategoriesByParentPrimary)) {
    subcategoriesByParentPrimary[key].sort((a, b) => a.label.localeCompare(b.label));
  }

  return { parentCategories, subcategoriesByParentPrimary };
}

/** Flat list passed to plan generation from wizard picks (parent or subcategory primary per group). */
export function resolveWizardCategoryPicks(picks: Record<string, string>): string[] {
  return Object.values(picks).filter(Boolean);
}

export function pickWizardCategoryItem(
  picks: Record<string, string>,
  parentPrimary: string,
  primary: string
): Record<string, string> {
  if (picks[parentPrimary] === primary) {
    const next = { ...picks };
    delete next[parentPrimary];
    return next;
  }
  const otherGroups = Object.keys(picks).filter((p) => p !== parentPrimary).length;
  if (!(parentPrimary in picks) && otherGroups >= MAX_WIZARD_PARENT_CATEGORIES) {
    return picks;
  }
  return { ...picks, [parentPrimary]: primary };
}

/** @deprecated Prefer resolveWizardCategoryPicks with pickWizardCategoryItem state. */
export function resolveWizardCategorySelection(
  selectedParents: string[],
  subcatsByParent: Record<string, string[]>,
  subcategoriesByParentPrimary: Record<string, CategoryOption[]>
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const parent of selectedParents) {
    const availableSubs = subcategoriesByParentPrimary[parent] || [];
    const selectedSubs = subcatsByParent[parent] || [];

    const primaries =
      availableSubs.length === 0
        ? [parent]
        : selectedSubs.length > 0
          ? selectedSubs
          : [parent];

    for (const primary of primaries) {
      const key = primary.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(primary);
    }
  }

  return out;
}

export function sortCategoriesHierarchical(
  docs: CategoryDocRecord[],
  primaryLocale: string
): CategoryDocRecord[] {
  const parents = docs.filter((d) => isTopLevelCategory(d.data));
  const childrenByParent = new Map<string, CategoryDocRecord[]>();

  for (const doc of docs) {
    const parentId = readParentCategoryId(doc.data);
    if (!parentId) continue;
    const list = childrenByParent.get(parentId) || [];
    list.push(doc);
    childrenByParent.set(parentId, list);
  }

  parents.sort((a, b) =>
    categoryPrimaryName(a.data, primaryLocale).localeCompare(
      categoryPrimaryName(b.data, primaryLocale)
    )
  );

  const ordered: CategoryDocRecord[] = [];
  for (const parent of parents) {
    ordered.push(parent);
    const children = childrenByParent.get(parent.id) || [];
    children.sort((a, b) =>
      categoryPrimaryName(a.data, primaryLocale).localeCompare(
        categoryPrimaryName(b.data, primaryLocale)
      )
    );
    ordered.push(...children);
  }

  const listed = new Set(ordered.map((d) => d.id));
  for (const doc of docs) {
    if (!listed.has(doc.id)) ordered.push(doc);
  }

  return ordered;
}

/** Admin gem tagging: all top-level categories + subcategories (no Live like a local filter). */
export function buildAdminCategoryHierarchy(
  docs: CategoryDocRecord[],
  locale: string,
  primaryLocale: string,
  reviewedLocales?: string[] | null
): {
  parentOptions: CategoryOption[];
  subcategoriesByParentPrimary: Record<string, CategoryOption[]>;
  /** Parents without subcategories plus every subcategory — the values stored on gems. */
  selectableOptions: CategoryOption[];
} {
  const parents: CategoryDocRecord[] = [];
  const children: CategoryDocRecord[] = [];

  for (const doc of docs) {
    if (readParentCategoryId(doc.data)) children.push(doc);
    else parents.push(doc);
  }

  const parentById = new Map(
    parents.map((p) => [p.id, categoryPrimaryName(p.data, primaryLocale).trim()])
  );

  const parentOptions: CategoryOption[] = [];
  const subcategoriesByParentPrimary: Record<string, CategoryOption[]> = {};

  for (const p of parents) {
    const primary = categoryPrimaryName(p.data, primaryLocale).trim();
    if (!primary) continue;
    const opt = toCategoryOption(p.data, locale, primaryLocale, reviewedLocales);
    parentOptions.push(opt);
    subcategoriesByParentPrimary[opt.primary] = [];
  }

  for (const c of children) {
    const parentId = readParentCategoryId(c.data);
    if (!parentId) continue;
    const parentPrimary = parentById.get(parentId);
    if (!parentPrimary || !subcategoriesByParentPrimary[parentPrimary]) continue;

    const opt = toCategoryOption(c.data, locale, primaryLocale, reviewedLocales);
    subcategoriesByParentPrimary[parentPrimary].push(opt);
  }

  parentOptions.sort((a, b) => a.label.localeCompare(b.label));
  for (const key of Object.keys(subcategoriesByParentPrimary)) {
    subcategoriesByParentPrimary[key].sort((a, b) => a.label.localeCompare(b.label));
  }

  const selectableOptions: CategoryOption[] = [];
  for (const parent of parentOptions) {
    const subs = subcategoriesByParentPrimary[parent.primary] || [];
    if (subs.length === 0) selectableOptions.push(parent);
    else selectableOptions.push(...subs);
  }

  return { parentOptions, subcategoriesByParentPrimary, selectableOptions };
}

export function primaryInList(primary: string, list: string[]): boolean {
  const key = primary.trim().toLowerCase();
  return list.some((p) => p.trim().toLowerCase() === key);
}

export function parentHasSelectedSubcategories(
  parentPrimary: string,
  selectedPrimaries: string[],
  subcategoriesByParentPrimary: Record<string, CategoryOption[]>
): boolean {
  const subs = subcategoriesByParentPrimary[parentPrimary] || [];
  return subs.some((s) => primaryInList(s.primary, selectedPrimaries));
}
