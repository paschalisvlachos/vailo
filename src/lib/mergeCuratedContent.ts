import {
  type CuratedScope,
  mergeGuestAreaContent,
  tagCuratedScope,
} from './areaNeighborGuestContent';

export type { CuratedScope };

/** @deprecated Prefer mergeGuestAreaContent — kept for callers not yet on neighbor pools. */
export function tagCuratedScopeLegacy<T extends Record<string, unknown>>(
  items: T[] | null | undefined,
  scope: Exclude<CuratedScope, 'neighbor'>
): Array<T & { curatedScope: Exclude<CuratedScope, 'neighbor'> }> {
  return tagCuratedScope(items, scope) as Array<T & { curatedScope: Exclude<CuratedScope, 'neighbor'> }>;
}

export function mergeCuratedGems(
  propertyGems: Record<string, unknown>[] | null | undefined,
  areaGems: Record<string, unknown>[] | null | undefined
): Array<Record<string, unknown> & { curatedScope: CuratedScope }> {
  return mergeGuestAreaContent({
    propertyGems,
    propertyFeatures: [],
    homeGems: areaGems,
    homeFeatures: [],
    homeDiscoveredPlaces: [],
    homeTrails: [],
    neighborBundles: [],
    includeNeighbors: false,
  }).mergedGems;
}

export function mergeCuratedFeatures(
  propertyFeatures: Record<string, unknown>[] | null | undefined,
  areaFeatures: Record<string, unknown>[] | null | undefined
): Array<Record<string, unknown> & { curatedScope: CuratedScope }> {
  return mergeGuestAreaContent({
    propertyGems: [],
    propertyFeatures,
    homeGems: [],
    homeFeatures: areaFeatures,
    homeDiscoveredPlaces: [],
    homeTrails: [],
    neighborBundles: [],
    includeNeighbors: false,
  }).mergedFeatures;
}

export { tagCuratedScope } from './areaNeighborGuestContent';
