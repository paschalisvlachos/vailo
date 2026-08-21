import { bareGooglePlaceId, isDirectPlaceMapsUrl } from './geocoding';
import { gemSameNameAndLocation, parseGemCoords } from './gemLocationMatch';
import { normalizePlaceName } from './placeNameUtils';

export type CuratedScope = 'property' | 'area' | 'neighbor';

import type { LocalTrailRecord } from './localTrailsGuest';

export type NeighborContentBundle = {
  areaId: string;
  areaName: string;
  gems: Record<string, unknown>[];
  features: Record<string, unknown>[];
  discoveredPlaces: Record<string, unknown>[];
  trails: LocalTrailRecord[];
};

export type GuestCuratedRow = Record<string, unknown> & {
  curatedScope: CuratedScope;
  neighborAreaId?: string;
  sourceAreaLabel?: string;
};

export function formatNeighborAreaLabel(areaName: string): string {
  const trimmed = areaName.trim();
  return trimmed ? `Nearby · ${trimmed}` : 'Nearby';
}

function normalizeMapsUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const url = raw.trim();
  if (!isDirectPlaceMapsUrl(url)) return url.toLowerCase();
  return url.split('?')[0]?.toLowerCase() || url.toLowerCase();
}

function itemDisplayName(item: Record<string, unknown>): string {
  return String(item.name || item.businessName || item.title || '').trim();
}

function curatedDedupeKey(item: Record<string, unknown>): string | null {
  const placeId = bareGooglePlaceId(
    typeof item.googlePlaceId === 'string' ? item.googlePlaceId : undefined
  );
  if (placeId) return `pid:${placeId}`;

  const mapsUrl = normalizeMapsUrl(item.googleMapsUrl);
  if (mapsUrl) return `url:${mapsUrl}`;

  const name = normalizePlaceName(itemDisplayName(item));
  const coords = parseGemCoords(item);
  if (name && coords) {
    return `geo:${name}:${coords.lat.toFixed(3)}:${coords.lng.toFixed(3)}`;
  }

  const id = String(item.id || '').trim();
  const scope = String(item.curatedScope || '');
  const neighborId = String(item.neighborAreaId || '');
  if (id) return `id:${scope}:${neighborId}:${id}`;

  return null;
}

function isSameCuratedPlace(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const keyA = curatedDedupeKey(a);
  const keyB = curatedDedupeKey(b);
  if (keyA && keyB && keyA === keyB) return true;
  return gemSameNameAndLocation(a, b);
}

/** Dedupe across ordered pools — first occurrence wins (property → home area → neighbors). */
export function dedupeCuratedPools<T extends Record<string, unknown>>(pools: T[][]): T[] {
  return dedupeCuratedPoolsDetailed(pools).kept;
}

export type CuratedDedupeDropped<T extends Record<string, unknown>> = {
  item: T;
  duplicateOf: T;
};

export function dedupeCuratedPoolsDetailed<T extends Record<string, unknown>>(
  pools: T[][]
): { kept: T[]; dropped: CuratedDedupeDropped<T>[] } {
  const kept: T[] = [];
  const dropped: CuratedDedupeDropped<T>[] = [];
  for (const pool of pools) {
    for (const item of pool) {
      const duplicateOf = kept.find((existing) => isSameCuratedPlace(existing, item));
      if (duplicateOf) {
        dropped.push({ item, duplicateOf });
      } else {
        kept.push(item);
      }
    }
  }
  return { kept, dropped };
}

export function tagCuratedScope<T extends Record<string, unknown>>(
  items: T[] | null | undefined,
  scope: CuratedScope
): GuestCuratedRow[] {
  return (items || []).map((item) => ({ ...item, curatedScope: scope }));
}

export function tagNeighborScope<T extends Record<string, unknown>>(
  items: T[] | null | undefined,
  areaId: string,
  areaName: string
): GuestCuratedRow[] {
  const label = formatNeighborAreaLabel(areaName);
  return (items || []).map((item) => ({
    ...item,
    curatedScope: 'neighbor' as const,
    neighborAreaId: areaId,
    sourceAreaLabel: label,
  }));
}

export function buildMergedGuestGems(
  propertyGems: Record<string, unknown>[] | null | undefined,
  homeAreaGems: Record<string, unknown>[] | null | undefined,
  neighborBundles: NeighborContentBundle[],
  includeNeighbors: boolean
): GuestCuratedRow[] {
  const pools: GuestCuratedRow[][] = [
    tagCuratedScope(propertyGems, 'property'),
    tagCuratedScope(homeAreaGems, 'area'),
  ];
  if (includeNeighbors) {
    for (const bundle of neighborBundles) {
      pools.push(tagNeighborScope(bundle.gems, bundle.areaId, bundle.areaName));
    }
  }
  return dedupeCuratedPools(pools);
}

export function buildMergedGuestFeatures(
  propertyFeatures: Record<string, unknown>[] | null | undefined,
  homeAreaFeatures: Record<string, unknown>[] | null | undefined,
  neighborBundles: NeighborContentBundle[],
  includeNeighbors: boolean
): GuestCuratedRow[] {
  const pools: GuestCuratedRow[][] = [
    tagCuratedScope(propertyFeatures, 'property'),
    tagCuratedScope(homeAreaFeatures, 'area'),
  ];
  if (includeNeighbors) {
    for (const bundle of neighborBundles) {
      pools.push(tagNeighborScope(bundle.features, bundle.areaId, bundle.areaName));
    }
  }
  return dedupeCuratedPools(pools);
}

export function buildMergedDiscoveredPlaces(
  homePlaces: Record<string, unknown>[] | null | undefined,
  neighborBundles: NeighborContentBundle[],
  includeNeighbors: boolean
): GuestCuratedRow[] {
  const pools: GuestCuratedRow[][] = [tagCuratedScope(homePlaces, 'area')];
  if (includeNeighbors) {
    for (const bundle of neighborBundles) {
      pools.push(tagNeighborScope(bundle.discoveredPlaces, bundle.areaId, bundle.areaName));
    }
  }
  return dedupeCuratedPools(pools);
}

export function buildMergedLocalTrails(
  homeTrails: LocalTrailRecord[] | null | undefined,
  neighborBundles: NeighborContentBundle[],
  includeNeighbors: boolean
): Array<LocalTrailRecord & { curatedScope?: CuratedScope; sourceAreaLabel?: string }> {
  const pools: Array<Record<string, unknown>>[] = [
    (homeTrails || []).map((trail) => ({ ...trail, curatedScope: 'area' as const })),
  ];
  if (includeNeighbors) {
    for (const bundle of neighborBundles) {
      pools.push(tagNeighborScope(bundle.trails as Record<string, unknown>[], bundle.areaId, bundle.areaName));
    }
  }
  return dedupeCuratedPools(pools) as Array<
    LocalTrailRecord & { curatedScope?: CuratedScope; sourceAreaLabel?: string }
  >;
}

export type MergeGuestAreaContentInput = {
  propertyGems: Record<string, unknown>[] | null | undefined;
  propertyFeatures: Record<string, unknown>[] | null | undefined;
  homeGems: Record<string, unknown>[] | null | undefined;
  homeFeatures: Record<string, unknown>[] | null | undefined;
  homeDiscoveredPlaces: Record<string, unknown>[] | null | undefined;
  homeTrails: LocalTrailRecord[] | null | undefined;
  neighborBundles: NeighborContentBundle[];
  includeNeighbors: boolean;
};

export function mergeGuestAreaContent(input: MergeGuestAreaContentInput) {
  const mergedGems = buildMergedGuestGems(
    input.propertyGems,
    input.homeGems,
    input.neighborBundles,
    input.includeNeighbors
  );
  const mergedFeatures = buildMergedGuestFeatures(
    input.propertyFeatures,
    input.homeFeatures,
    input.neighborBundles,
    input.includeNeighbors
  );
  const discoveredPlaces = buildMergedDiscoveredPlaces(
    input.homeDiscoveredPlaces,
    input.neighborBundles,
    input.includeNeighbors
  );
  const localTrails = buildMergedLocalTrails(
    input.homeTrails,
    input.neighborBundles,
    input.includeNeighbors
  );

  return {
    mergedGems,
    mergedFeatures,
    discoveredPlaces,
    localTrails,
  };
}

export function countNeighborContent(bundles: NeighborContentBundle[]) {
  return bundles.reduce(
    (acc, bundle) => {
      acc.gems += bundle.gems.length;
      acc.features += bundle.features.length;
      acc.discoveredPlaces += bundle.discoveredPlaces.length;
      acc.trails += bundle.trails.length;
      return acc;
    },
    { gems: 0, features: 0, discoveredPlaces: 0, trails: 0 }
  );
}

export function countMergedNeighborItems(rows: GuestCuratedRow[]): number {
  return rows.filter((row) => row.curatedScope === 'neighbor').length;
}
