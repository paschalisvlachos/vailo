import { collection, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import type { GeocodedPlace } from './geocoding';
import type { ListingAreaContext } from './listingAreaContext';

export type ConfiguredArea = {
  id: string;
  name: string;
};

const countryAreasCache = new Map<string, Promise<ConfiguredArea[]>>();

function normalizeAreaToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9\u0370-\u03ff\s-]/gi, '')
    .replace(/\s+/g, ' ');
}

function collectSearchTokens(hints: {
  userInput?: string;
  displayName?: string;
  label?: string;
  addressHints?: string[];
}): string[] {
  const out = new Set<string>();
  const add = (value?: string) => {
    const norm = normalizeAreaToken(value || '');
    if (norm) out.add(norm);
  };

  add(hints.userInput);
  add(hints.label);
  for (const part of (hints.displayName || '').split(',')) add(part);
  for (const hint of hints.addressHints || []) add(hint);

  return [...out];
}

/** Load configured admin areas for a country (cached). */
export async function loadConfiguredAreas(country: string): Promise<ConfiguredArea[]> {
  const key = country.trim();
  if (!key) return [];

  let pending = countryAreasCache.get(key);
  if (!pending) {
    pending = getDocs(collection(db, 'countries', key, 'areas')).then((snap) =>
      snap.docs
        .map((doc) => {
          const name = typeof doc.data().name === 'string' ? doc.data().name.trim() : '';
          return name ? { id: doc.id, name } : null;
        })
        .filter((row): row is ConfiguredArea => Boolean(row))
    );
    countryAreasCache.set(key, pending);
  }
  return pending;
}

export function matchConfiguredAreaFromSearch(
  areas: ConfiguredArea[],
  hints: {
    userInput?: string;
    displayName?: string;
    label?: string;
    addressHints?: string[];
  }
): ConfiguredArea | null {
  if (areas.length === 0) return null;

  const normalizedAreas = areas.map((area) => ({
    ...area,
    norm: normalizeAreaToken(area.name),
  }));
  const tokens = collectSearchTokens(hints);

  for (const area of normalizedAreas) {
    if (area.norm.length < 3) continue;
    for (const token of tokens) {
      if (token === area.norm) return area;
    }
  }

  const userNorm = normalizeAreaToken(hints.userInput || '');
  if (userNorm) {
    for (const area of normalizedAreas) {
      if (userNorm === area.norm) return area;
    }
  }

  for (const area of normalizedAreas) {
    if (area.norm.length < 5) continue;
    for (const token of tokens) {
      if (token.includes(area.norm)) return area;
    }
  }

  return null;
}

/**
 * When a guest searches another configured area/subarea, return that area context.
 * Returns null when the search matches the listing area or no configured area matches.
 */
export async function resolveSearchAreaContext(params: {
  country: string;
  place: GeocodedPlace;
  userInput?: string;
  listingAreaCtx?: ListingAreaContext | null;
}): Promise<ListingAreaContext | null> {
  const country = params.country.trim();
  if (!country) return null;

  const areas = await loadConfiguredAreas(country);
  const matched = matchConfiguredAreaFromSearch(areas, {
    userInput: params.userInput,
    displayName: params.place.displayName,
    label: params.place.label,
    addressHints: params.place.addressHints,
  });

  if (!matched) return null;
  if (params.listingAreaCtx && matched.id === params.listingAreaCtx.areaId) {
    return null;
  }

  return {
    country,
    masterArea: matched.name,
    areaId: matched.id,
  };
}
