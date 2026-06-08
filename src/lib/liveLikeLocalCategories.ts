import { categoryPrimaryName } from './categoryLocale';

/** Optional context for Live like a local when recommending this category. */
export function readLiveLikeLocalCategoryKnowledge(
  doc: Record<string, unknown> | null | undefined
): string {
  return String(doc?.liveLikeLocalKnowledge || '').trim();
}

export type CategoryKnowledgeMode = 'areas' | 'business' | 'any';

export function getCategoryKnowledgeMode(knowledge: string): CategoryKnowledgeMode {
  const text = knowledge.trim();
  if (/\[AREAS\s+ONLY\]/i.test(text)) return 'areas';
  if (/\[BUSINESS\s+ONLY\]/i.test(text)) return 'business';
  return 'any';
}

/** Primary category name → admin knowledge note (concierge-visible categories only). */
export function collectCategoryKnowledgeByPrimary(
  docs: Array<{ data: Record<string, unknown> }>,
  primaryLocale: string
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const { data } of docs) {
    if (isExcludedFromLiveLikeLocal(data)) continue;
    const primary = categoryPrimaryName(data, primaryLocale).trim();
    const knowledge = readLiveLikeLocalCategoryKnowledge(data);
    if (primary && knowledge) map[primary] = knowledge;
  }
  return map;
}

/** Injected into Gemini prompts — uses admin textarea rules per category. */
export function buildCategoryKnowledgePromptSection(
  categories: string[],
  knowledgeByPrimary: Record<string, string>
): string {
  const lines = categories
    .map((cat) => {
      const knowledge = knowledgeByPrimary[cat]?.trim();
      if (!knowledge) return null;
      return `- **${cat}**: ${knowledge}`;
    })
    .filter(Boolean) as string[];

  if (!lines.length) return '';

  return `
CATEGORY-SPECIFIC RULES (set by the local team — follow strictly):
${lines.join('\n')}

How to read these rules:
- [AREAS ONLY] = geographic spots only (beaches, coves, villages, landmarks, archaeological sites). ZERO restaurants, cafés, tour operators, shops, marinas, or named companies. Use OFFICIAL Google Maps names only (e.g. "Kalyvaki Beach", "Phylaki", "Aptera") — never invent descriptive labels ("river mouth", "unorganized section", "western cove").
- [BUSINESS ONLY] = named businesses/operators only. Always include village: "Taverna Name, Village". Never suggest a generic area without a specific establishment.
- If a category says to use only the Vailo database / stored trails, do not invent alternatives — return fewer AI items or none for that category.
- Never suggest permanently closed businesses. Only currently operating places.
- Return many real candidates (up to 12 per category) using official Google Maps names — our system verifies each and shows up to 5 (extended range allowed for picks 4–5). Never invent names to fill slots.
`;
}

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
