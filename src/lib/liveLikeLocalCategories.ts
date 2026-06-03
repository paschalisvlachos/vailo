import { categoryPrimaryName } from './categoryLocale';

/** When true, category is for local gems admin only — hidden from Live like a local. */
export function isExcludedFromLiveLikeLocal(
  doc: Record<string, unknown> | null | undefined
): boolean {
  return doc?.excludeFromLiveLikeLocal === true;
}

export function categoryEligibleForLiveLikeLocal(
  data: Record<string, unknown>,
  primaryLocale: string
): boolean {
  if (isExcludedFromLiveLikeLocal(data)) return false;
  return Boolean(categoryPrimaryName(data, primaryLocale).trim());
}

export function collectExcludedLiveLikeLocalPrimaries(
  docs: Array<{ data: Record<string, unknown> }>,
  primaryLocale: string
): Set<string> {
  const excluded = new Set<string>();
  for (const { data } of docs) {
    if (!isExcludedFromLiveLikeLocal(data)) continue;
    const primary = categoryPrimaryName(data, primaryLocale).trim();
    if (primary) excluded.add(primary);
  }
  return excluded;
}

export function filterPrimariesForLiveLikeLocal(
  primaries: string[],
  excluded: Set<string>
): string[] {
  if (excluded.size === 0) return primaries;
  return primaries.filter((p) => !excluded.has(p));
}

/** Remove excluded category blocks from a guest plan (flexible picks or timeline). */
export function stripExcludedCategoriesFromPlan<T extends Record<string, unknown>>(
  plan: T | null | undefined,
  excluded: Set<string>
): T | null | undefined {
  if (!plan || excluded.size === 0 || !Array.isArray(plan.categories)) return plan;
  const categories = (plan.categories as Array<{ categoryName?: string }>).filter(
    (c) => !excluded.has(String(c.categoryName || '').trim())
  );
  if (categories.length === (plan.categories as unknown[]).length) return plan;
  return { ...plan, categories };
}
