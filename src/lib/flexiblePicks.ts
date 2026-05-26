/** Flexible picks: up to 5 unique businesses per category, distance-sorted, local-first. */

import { normalizePlaceName, namesLikelySame } from './placeNameUtils';
import { bareGooglePlaceId } from './geocoding';
import { pickKeyForItem } from './picksFairness';

/**
 * Width (km) of a distance band used by the fairness sort. Items inside the
 * same band are treated as equally "near" and shuffled to vary exposure.
 */
const DISTANCE_BAND_KM = 3;

function distanceBand(km: number): number {
  if (km == null || isNaN(km)) return Number.MAX_SAFE_INTEGER;
  return Math.floor(km / DISTANCE_BAND_KM);
}

/**
 * How much we are willing to stretch past the user's requested radius. Adaptive:
 *   • small radius (9 km) → small stretch (~4 km)
 *   • large radius (50 km) → moderate stretch (~15 km, capped at 20)
 * Guests never want a "9 km" search returning 253 km away.
 */
export function beyondRadiusBufferKm(maxKm: number): number {
  if (!isFinite(maxKm) || maxKm <= 0) return 0;
  return Math.min(Math.max(maxKm * 0.4, 3), 20);
}

/** Maximum distance we will ever show, including extended-range padding. */
export function effectiveMaxDistanceKm(maxKm: number): number {
  return maxKm + beyondRadiusBufferKm(maxKm);
}

/** Penalty added to a stale item's tiebreaker score — high enough to push it back, low enough that it can still surface. */
const STALE_PENALTY = 0.35;

export const MAX_PICKS_PER_CATEGORY = 5;
/** @deprecated use MAX_PICKS_PER_CATEGORY */
export const PICKS_PER_CATEGORY = MAX_PICKS_PER_CATEGORY;

export type FlexiblePickItem = {
  title: string;
  description?: string;
  estimatedDistance?: string;
  distanceKm?: number | null;
  beyondRadius?: boolean;
  source?: string;
  photoUrl?: string;
  googleMapsUrl?: string;
  googlePlaceId?: string;
  latitude?: number;
  longitude?: number;
  navigateUrl?: string;
  isLegitPick?: boolean;
  previouslyShown?: boolean;
  [key: string]: unknown;
};

type DbPickRow = {
  name: string;
  category: string;
  distanceKm: number;
  beyondRadius: boolean;
  description: string;
  photoUrl: string;
  googleMapsUrl: string;
  googlePlaceId?: string;
  latitude?: number;
  longitude?: number;
  isLegitPick: boolean;
  previouslyShown: boolean;
};

function drivingKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 1.35;
}

function extractCoords(obj: any): { lat: number; lng: number } | null {
  if (!obj) return null;
  let lat =
    obj.latitude ?? obj.lat ?? obj.coords?.latitude ?? obj.coords?.lat;
  let lng =
    obj.longitude ?? obj.lng ?? obj.coords?.longitude ?? obj.coords?.lng;
  const parsedLat = parseFloat(lat);
  const parsedLng = parseFloat(lng);
  if (!isNaN(parsedLat) && !isNaN(parsedLng)) {
    return { lat: parsedLat, lng: parsedLng };
  }
  return null;
}

function normalizeTitle(title: string): string {
  return String(title || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u0370-\u03ff]/g, '');
}

export function parseDistanceKm(item: FlexiblePickItem): number | null {
  if (typeof item.distanceKm === 'number' && !isNaN(item.distanceKm)) {
    return item.distanceKm;
  }
  const text = item.estimatedDistance || '';
  const match = text.match(/(\d+(\.\d+)?)\s*km/i);
  if (match) return parseFloat(match[1]);
  return null;
}

function formatDistanceLabel(km: number, beyondRadius: boolean): string {
  const label = `${km.toFixed(1)}km`;
  return beyondRadius ? `Further · ${label}` : label;
}

function rowToPick(row: DbPickRow): FlexiblePickItem {
  return {
    title: row.name,
    description: row.description,
    distanceKm: row.distanceKm,
    beyondRadius: row.beyondRadius,
    estimatedDistance: formatDistanceLabel(row.distanceKm, row.beyondRadius),
    source: 'database',
    photoUrl: row.photoUrl,
    googleMapsUrl: row.googleMapsUrl,
    googlePlaceId: row.googlePlaceId,
    latitude: row.latitude,
    longitude: row.longitude,
    isLegitPick: row.isLegitPick,
    previouslyShown: row.previouslyShown,
  };
}

function mapDbItem(
  item: any,
  category: string,
  startCoords: { lat: number; lng: number },
  propCoords: { lat: number; lng: number } | null,
  maxKm: number,
  recentlyShown: Set<string>
): DbPickRow | null {
  let coords = extractCoords(item);
  if (!coords && propCoords) coords = propCoords;
  if (!coords) return null;

  const distanceKm = drivingKm(
    startCoords.lat,
    startCoords.lng,
    coords.lat,
    coords.lng
  );
  const beyondRadius = distanceKm > maxKm;
  const maxExtended = effectiveMaxDistanceKm(maxKm);
  if (beyondRadius && distanceKm > maxExtended) return null;

  const key = pickKeyForItem({
    name: item.businessName || item.name,
    googlePlaceId: item.googlePlaceId,
    googleMapsUrl: item.googleMapsUrl,
    latitude: coords.lat,
    longitude: coords.lng,
  });

  return {
    name: item.businessName || item.name || '',
    category,
    distanceKm,
    beyondRadius,
    description: item.description || '',
    photoUrl: item.photoUrl || '',
    googleMapsUrl: item.googleMapsUrl || '',
    googlePlaceId: item.googlePlaceId || '',
    latitude: coords.lat,
    longitude: coords.lng,
    isLegitPick: !!item.isLegitPick,
    previouslyShown: !!(key && recentlyShown.has(key)),
  };
}

/**
 * Sort rows with FAIRNESS — strict distance order is preserved, but within the
 * same distance band a small random penalty pushes recently-shown items back
 * a bit so newer ones get exposure. Stale items can STILL win when they are
 * the only good option in their band.
 */
function sortRowsForFairness(rows: DbPickRow[]): DbPickRow[] {
  return rows
    .map((row) => ({ row, rng: Math.random() }))
    .sort((a, b) => {
      if (a.row.isLegitPick !== b.row.isLegitPick) return a.row.isLegitPick ? -1 : 1;
      const bandDiff = distanceBand(a.row.distanceKm) - distanceBand(b.row.distanceKm);
      if (bandDiff !== 0) return bandDiff;
      const aScore = a.rng + (a.row.previouslyShown ? STALE_PENALTY : 0);
      const bScore = b.rng + (b.row.previouslyShown ? STALE_PENALTY : 0);
      return aScore - bScore;
    })
    .map((entry) => entry.row);
}

export function buildFlexiblePicksDbContext(
  categories: string[],
  maxKm: number,
  startCoords: { lat: number; lng: number } | null,
  propCoords: { lat: number; lng: number } | null,
  gems: any[],
  features: any[],
  recentlyShown: Set<string> = new Set()
): Record<string, { withinRadius: DbPickRow[]; beyondRadius: DbPickRow[] }> {
  const result: Record<
    string,
    { withinRadius: DbPickRow[]; beyondRadius: DbPickRow[] }
  > = {};

  if (!startCoords) {
    for (const cat of categories) {
      result[cat] = { withinRadius: [], beyondRadius: [] };
    }
    return result;
  }

  for (const cat of categories) {
    const rows: DbPickRow[] = [];

    for (const g of gems || []) {
      if (g.category !== cat) continue;
      const row = mapDbItem(g, cat, startCoords, propCoords, maxKm, recentlyShown);
      if (row) rows.push(row);
    }

    for (const f of features || []) {
      if (!f.categories?.includes(cat)) continue;
      const row = mapDbItem(f, cat, startCoords, propCoords, maxKm, recentlyShown);
      if (row) rows.push(row);
    }

    const sorted = sortRowsForFairness(rows);
    const uniqueRows = dedupeDbRows(sorted);

    result[cat] = {
      withinRadius: uniqueRows.filter((r) => !r.beyondRadius),
      beyondRadius: uniqueRows.filter((r) => r.beyondRadius),
    };
  }

  return result;
}

function extractPlaceId(item: FlexiblePickItem | DbPickRow): string | null {
  const raw = 'googlePlaceId' in item ? item.googlePlaceId : undefined;
  const bare = bareGooglePlaceId(raw);
  if (bare) return bare;

  const url = item.googleMapsUrl;
  if (typeof url === 'string') {
    const match = url.match(/[?&](?:query_place_id|destination_place_id)=([^&]+)/i);
    if (match) return decodeURIComponent(match[1]);
  }
  return null;
}

function coordsWithinKm(
  a: { latitude?: number; longitude?: number; lat?: number; lng?: number },
  b: { latitude?: number; longitude?: number; lat?: number; lng?: number },
  maxKm = 0.2
): boolean {
  const latA = a.latitude ?? a.lat;
  const lngA = a.longitude ?? a.lng;
  const latB = b.latitude ?? b.lat;
  const lngB = b.longitude ?? b.lng;
  if (
    typeof latA !== 'number' ||
    typeof lngA !== 'number' ||
    typeof latB !== 'number' ||
    typeof lngB !== 'number' ||
    isNaN(latA) ||
    isNaN(lngA) ||
    isNaN(latB) ||
    isNaN(lngB)
  ) {
    return false;
  }
  return drivingKm(latA, lngA, latB, lngB) < maxKm;
}

function businessKey(item: FlexiblePickItem): string {
  const placeId = extractPlaceId(item);
  if (placeId) return `id:${placeId}`;

  const lat = item.latitude ?? item.lat;
  const lng = item.longitude ?? item.lng;
  if (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat)) {
    return `geo:${lat.toFixed(3)},${lng.toFixed(3)}`;
  }

  return `name:${normalizeTitle(item.title)}`;
}

function isSameBusiness(a: FlexiblePickItem, b: FlexiblePickItem): boolean {
  const idA = extractPlaceId(a);
  const idB = extractPlaceId(b);
  if (idA && idB && idA === idB) return true;

  if (businessKey(a) === businessKey(b)) return true;
  if (coordsWithinKm(a, b)) return true;

  return namesLikelySame(normalizePlaceName(a.title), normalizePlaceName(b.title));
}

function dedupeDbRows(rows: DbPickRow[]): DbPickRow[] {
  const out: DbPickRow[] = [];
  for (const row of rows) {
    const candidate = rowToPick(row);
    if (out.some((existing) => isSameBusiness(rowToPick(existing), candidate))) continue;
    out.push(row);
  }
  return out;
}

function dedupePickItems(items: FlexiblePickItem[]): FlexiblePickItem[] {
  const out: FlexiblePickItem[] = [];
  for (const item of items) {
    if (out.some((existing) => isSameBusiness(existing, item))) continue;
    out.push(item);
  }
  return out;
}

function enrichPickItem(
  item: FlexiblePickItem,
  maxKm: number,
  startCoords?: { lat: number; lng: number } | null,
  recentlyShown: Set<string> = new Set()
): FlexiblePickItem {
  let km = parseDistanceKm(item);

  const rawLat = item.latitude ?? (item as Record<string, unknown>).lat;
  const rawLng = item.longitude ?? (item as Record<string, unknown>).lng;
  const lat = typeof rawLat === 'number' ? rawLat : undefined;
  const lng = typeof rawLng === 'number' ? rawLng : undefined;
  if (
    startCoords &&
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    !isNaN(lat) &&
    !isNaN(lng)
  ) {
    // Recompute from resolved coordinates — overrides any km the AI guessed.
    km = drivingKm(startCoords.lat, startCoords.lng, lat, lng);
  }

  const beyondRadius =
    km != null
      ? km > maxKm
      : !!item.beyondRadius;

  const itemKey = pickKeyForItem({
    name: item.title,
    googlePlaceId: item.googlePlaceId,
    googleMapsUrl: item.googleMapsUrl,
    latitude: lat,
    longitude: lng,
  });

  return {
    ...item,
    distanceKm: km,
    beyondRadius,
    estimatedDistance:
      km != null
        ? formatDistanceLabel(km, beyondRadius)
        : beyondRadius
          ? `Further · ${item.estimatedDistance || 'Extended range'}`
          : item.estimatedDistance,
    previouslyShown:
      typeof item.previouslyShown === 'boolean'
        ? item.previouslyShown
        : !!(itemKey && recentlyShown.has(itemKey)),
  };
}

/**
 * Top up a category so it has both Vailo-curated and AI-suggested picks.
 * Goal mix: ~50% database + ~50% AI. Falls back to whatever is available if
 * the other side is empty.
 */
function padCategoryFromDb(
  items: FlexiblePickItem[],
  dbContext: Record<string, { withinRadius: DbPickRow[]; beyondRadius: DbPickRow[] }>,
  categoryName: string,
  maxKm: number,
  startCoords?: { lat: number; lng: number } | null,
  recentlyShown: Set<string> = new Set()
): FlexiblePickItem[] {
  const pool = dbContext[categoryName];
  if (!pool) return items;

  const out = [...items];

  // Target ≈ half of the slots from the database (ceil so small caps round up — e.g. 5 → 3).
  const targetDbCount = Math.ceil(MAX_PICKS_PER_CATEGORY / 2);
  const aiCount = out.filter((i) => i.source !== 'database').length;
  const dbCount = out.filter((i) => i.source === 'database').length;

  const tryAdd = (rows: DbPickRow[], maxToAdd: number) => {
    let added = 0;
    for (const row of rows) {
      if (added >= maxToAdd) break;
      if (out.length >= MAX_PICKS_PER_CATEGORY) break;
      const candidate = rowToPick(row);
      if (out.some((existing) => isSameBusiness(existing, candidate))) continue;
      out.push(candidate);
      added += 1;
    }
    return added;
  };

  // Step 1 — make sure DB has at least its share (don't dilute AI picks).
  const dbDeficit = Math.max(0, targetDbCount - dbCount);
  if (dbDeficit > 0) {
    const addedFromWithin = tryAdd(pool.withinRadius, dbDeficit);
    if (addedFromWithin < dbDeficit) {
      tryAdd(pool.beyondRadius, dbDeficit - addedFromWithin);
    }
  }

  // Step 2 — if AI returned nothing (or barely anything) and we still have empty
  // slots, top up from DB so the user always sees a useful list.
  if (aiCount === 0 && out.length < MAX_PICKS_PER_CATEGORY) {
    const remaining = MAX_PICKS_PER_CATEGORY - out.length;
    const addedFromWithin = tryAdd(pool.withinRadius, remaining);
    if (out.length < MAX_PICKS_PER_CATEGORY) {
      tryAdd(pool.beyondRadius, MAX_PICKS_PER_CATEGORY - out.length);
    }
    void addedFromWithin;
  }

  return out.map((i) => enrichPickItem(i, maxKm, startCoords, recentlyShown));
}

function sortPickItems(items: FlexiblePickItem[]): FlexiblePickItem[] {
  return [...items].sort((a, b) => {
    const aBeyond = a.beyondRadius ? 1 : 0;
    const bBeyond = b.beyondRadius ? 1 : 0;
    if (aBeyond !== bBeyond) return aBeyond - bBeyond;
    const ak = parseDistanceKm(a);
    const bk = parseDistanceKm(b);
    if (ak != null && bk != null) return ak - bk;
    if (ak != null) return -1;
    if (bk != null) return 1;
    return 0;
  });
}

export function normalizeFlexiblePicksPlan(
  planData: any,
  maxKm: number,
  dbContext: Record<string, { withinRadius: DbPickRow[]; beyondRadius: DbPickRow[] }>,
  startCoords?: { lat: number; lng: number } | null,
  recentlyShown: Set<string> = new Set()
): any {
  if (!planData || planData.type !== 'picks' || !Array.isArray(planData.categories)) {
    return planData;
  }

  const hardCap = effectiveMaxDistanceKm(maxKm);

  const categories = planData.categories.map((cat: any) => {
    let items: FlexiblePickItem[] = (cat.items || []).map((item: FlexiblePickItem) =>
      enrichPickItem(item, maxKm, startCoords, recentlyShown)
    );

    // HARD CAP: drop AI items that exceed the maximum effective distance.
    // DB items are already filtered at mapDbItem time. This protects against
    // models that hallucinate "Knossos · 253km" inside a 9 km Beach search.
    items = items.filter((item) => {
      if (item.source === 'database') return true;
      const km = parseDistanceKm(item);
      if (km == null) return true; // unknown distance — let the user judge
      return km <= hardCap;
    });

    items = dedupePickItems(items);
    items = sortPickItems(items);

    items = padCategoryFromDb(items, dbContext, cat.categoryName, maxKm, startCoords, recentlyShown);
    items = dedupePickItems(items);
    items = sortPickItems(items);
    items = items.slice(0, MAX_PICKS_PER_CATEGORY);

    return { ...cat, items };
  });

  return { ...planData, categories };
}

export function buildFlexiblePicksPromptSection(
  categories: string[],
  maxKm: number,
  dbContext: Record<string, { withinRadius: DbPickRow[]; beyondRadius: DbPickRow[] }>
): string {
  const hardCap = effectiveMaxDistanceKm(maxKm);

  const perCategory = categories.map((cat) => {
    const pool = dbContext[cat] || { withinRadius: [], beyondRadius: [] };
    return {
      category: cat,
      withinRadiusCount: pool.withinRadius.length,
      beyondRadiusCount: pool.beyondRadius.length,
      withinRadius: pool.withinRadius.slice(0, 8).map((r) => ({
        name: r.name,
        distanceKm: Number(r.distanceKm.toFixed(1)),
        isLegitPick: r.isLegitPick,
        description: r.description,
        photoUrl: r.photoUrl,
        googleMapsUrl: r.googleMapsUrl,
      })),
      beyondRadiusExtension: pool.beyondRadius.slice(0, 8).map((r) => ({
        name: r.name,
        distanceKm: Number(r.distanceKm.toFixed(1)),
        isLegitPick: r.isLegitPick,
        description: r.description,
        photoUrl: r.photoUrl,
        googleMapsUrl: r.googleMapsUrl,
        note: `Slightly beyond ${maxKm}km — capped at ${hardCap.toFixed(0)}km. Only use if within-radius is thin.`,
      })),
    };
  });

  const targetDbPerCat = Math.ceil(MAX_PICKS_PER_CATEGORY / 2);
  const targetAiPerCat = MAX_PICKS_PER_CATEGORY - targetDbPerCat;

  return `
        LIVE LIKE A LOCAL MISSION (CRITICAL):
        You are NOT a generic travel guide. You help guests AVOID tourist traps and experience what LOCALS genuinely prefer — neighborhood tavernas, village beaches locals swim at, family-run shops, authentic weekly haunts.
        AVOID: cruise-ship restaurants, overcrowded Instagram-only spots, generic chains, "Top 10 TripAdvisor" traps with no local regulars.

        HARD DISTANCE LIMIT (NON-NEGOTIABLE):
        The guest chose a ${maxKm}km radius. NEVER suggest a place farther than ${hardCap.toFixed(0)}km from the starting point. If you cannot think of a real, named local place within that limit, return FEWER items — never pad with far-away "famous" spots. A 9km search must never return a 250km away suggestion.

        50 / 50 SPLIT:
        For EACH of these categories: ${categories.join(', ')}, aim for ${MAX_PICKS_PER_CATEGORY} unique picks split roughly:
          - ${targetDbPerCat} from the VAILO DATABASE POOLS (host-curated). Prefer the closest "isLegitPick" items.
          - ${targetAiPerCat} fresh AI suggestions — specific, real, named businesses or landmarks LOCALS in the area genuinely use. NEVER repeat anything already in the database pools.
        If the database pool is too small, fill the remainder with more AI picks (within the hard limit). If your AI knowledge is thin for a category, leave the remainder empty — our system will top up from the database.

        AI PICKS — REAL PLACES ONLY (NO GENERIC RESULTS):
        - Each AI pick MUST be a specific, real, named business or natural landmark (e.g. "Taverna O Manolis", "Imbros Gorge", "Stavros Beach"). NEVER list a generic region, town centre, or "best of" list.
        - If you are not confident a specific named place exists within ${maxKm}km, skip that slot — do NOT invent one and do NOT replace with a far-away alternative.
        - If you know the EXACT Google Place ID, include it as "googlePlaceId". Otherwise leave it empty — our system resolves the link from the place name + location.

        DISTANCE RULES:
        - Fill from WITHIN ${maxKm}km first.
        - If you must use the extended range (${maxKm.toFixed(0)}–${hardCap.toFixed(0)}km), mark "beyondRadius": true and prefix estimatedDistance with "Further ·".
        - Sort each category from CLOSEST to FURTHEST (lowest distanceKm first).

        UNIQUENESS:
        - One business = one entry. Never list the same business twice under a different angle.
        - Same Google Place, same address, or same owner = one entry.

        OUTPUT FIELDS (per AI pick):
        - title, description (2 sentences focused on why LOCALS pick it).
        - distanceKm (numeric, REQUIRED, must be ≤ ${hardCap.toFixed(0)}).
        - beyondRadius (true / false).
        - estimatedDistance ("12.4km" or "Further · 18.0km").
        - source: "ai".
        - googlePlaceId (if known).
        - photoUrl: empty string.
        - googleMapsUrl: empty string.

        PER-CATEGORY DATABASE POOLS (pre-sorted by distance):
        ${JSON.stringify(perCategory)}
      `;
}
