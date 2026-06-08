export type CuratedScope = 'property' | 'area';

/** Tag property vs area rows so picks can balance both curated pools. */
export function tagCuratedScope<T extends Record<string, unknown>>(
  items: T[] | null | undefined,
  scope: CuratedScope
): Array<T & { curatedScope: CuratedScope }> {
  return (items || []).map((item) => ({ ...item, curatedScope: scope }));
}

export function mergeCuratedGems(
  propertyGems: Record<string, unknown>[] | null | undefined,
  areaGems: Record<string, unknown>[] | null | undefined
): Array<Record<string, unknown> & { curatedScope: CuratedScope }> {
  return [
    ...tagCuratedScope(propertyGems, 'property'),
    ...tagCuratedScope(areaGems, 'area'),
  ];
}

export function mergeCuratedFeatures(
  propertyFeatures: Record<string, unknown>[] | null | undefined,
  areaFeatures: Record<string, unknown>[] | null | undefined
): Array<Record<string, unknown> & { curatedScope: CuratedScope }> {
  return [
    ...tagCuratedScope(propertyFeatures, 'property'),
    ...tagCuratedScope(areaFeatures, 'area'),
  ];
}
