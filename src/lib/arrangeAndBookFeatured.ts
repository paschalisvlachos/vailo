/** Platform-curated Featured listings for Arrange and Book. */

export const ARRANGE_AND_BOOK_FEATURED_DOC = 'platformSettings/arrangeAndBookFeatured';

export type ArrangeAndBookFeaturedRef = {
  providerId: string;
  excursionId: string;
};

export function featuredListingKey(ref: ArrangeAndBookFeaturedRef): string {
  return `${ref.providerId}/${ref.excursionId}`;
}

export function parseArrangeAndBookFeatured(
  data: Record<string, unknown> | undefined
): ArrangeAndBookFeaturedRef[] {
  if (!data || !Array.isArray(data.items)) return [];
  const seen = new Set<string>();
  const items: ArrangeAndBookFeaturedRef[] = [];
  for (const row of data.items) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const providerId = typeof r.providerId === 'string' ? r.providerId.trim() : '';
    const excursionId = typeof r.excursionId === 'string' ? r.excursionId.trim() : '';
    if (!providerId || !excursionId) continue;
    const key = `${providerId}/${excursionId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ providerId, excursionId });
  }
  return items;
}

export function serializeArrangeAndBookFeatured(
  items: ArrangeAndBookFeaturedRef[]
): ArrangeAndBookFeaturedRef[] {
  const seen = new Set<string>();
  const out: ArrangeAndBookFeaturedRef[] = [];
  for (const item of items) {
    const providerId = item.providerId.trim();
    const excursionId = item.excursionId.trim();
    if (!providerId || !excursionId) continue;
    const key = `${providerId}/${excursionId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ providerId, excursionId });
  }
  return out;
}
