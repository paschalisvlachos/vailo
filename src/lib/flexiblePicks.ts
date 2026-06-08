/** Flexible picks: up to 5 unique businesses per category, distance-sorted, local-first. */

import { normalizePlaceName, namesLikelySame } from './placeNameUtils';
import { bareGooglePlaceId } from './geocoding';
import { pickKeyForItem } from './picksFairness';
import {
  featureBelongsToCategory,
  gemBelongsToCategory,
  gemCategoryPrimaries,
} from './categoryLocale';
import { getCategoryKnowledgeMode } from './liveLikeLocalCategories';

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
/** @deprecated All radii now show up to MAX_PICKS_PER_CATEGORY; extended range fills slots 4–5. */
export const MAX_PICKS_TIGHT_RADIUS = 3;
/** Guest radius at or below this is a "tight" search — prompts encourage extended range for picks 4–5. */
export const TIGHT_RADIUS_KM_THRESHOLD = 6;
/** Extra search radius for [BUSINESS ONLY] categories (e.g. Dining). */
export const BUSINESS_CATEGORY_RADIUS_BONUS_KM = 3;
/** AI candidates requested per category — we verify via Google and show only the best few. */
export const AI_CANDIDATE_POOL_PER_CATEGORY = 12;

export function aiCandidatePoolSize(): number {
  return AI_CANDIDATE_POOL_PER_CATEGORY;
}
/** @deprecated use MAX_PICKS_PER_CATEGORY */
export const PICKS_PER_CATEGORY = MAX_PICKS_PER_CATEGORY;

export function maxPicksForRadius(_maxKm?: number): number {
  return MAX_PICKS_PER_CATEGORY;
}

export function categoryDistanceLimitKm(
  maxKm: number,
  categoryPrimary: string,
  knowledgeByPrimary: Record<string, string> = {}
): number {
  const mode = getCategoryKnowledgeMode(knowledgeByPrimary[categoryPrimary] || '');
  if (mode === 'business') return maxKm + BUSINESS_CATEGORY_RADIUS_BONUS_KM;
  return maxKm;
}

export function categoryHardCapKm(
  maxKm: number,
  categoryPrimary: string,
  knowledgeByPrimary: Record<string, string> = {}
): number {
  return effectiveMaxDistanceKm(categoryDistanceLimitKm(maxKm, categoryPrimary, knowledgeByPrimary));
}

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
  curatedScope?: 'property' | 'area';
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
    curatedScope: row.curatedScope || 'property',
  };
}

function mapDbItem(
  item: any,
  category: string,
  startCoords: { lat: number; lng: number },
  maxKm: number,
  recentlyShown: Set<string>
): DbPickRow | null {
  const coords = extractCoords(item);
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
    curatedScope: item.curatedScope === 'area' ? 'area' : 'property',
  };
}

function rowCuratedScope(row: DbPickRow): 'property' | 'area' {
  return row.curatedScope === 'area' ? 'area' : 'property';
}

function countDbScope(items: FlexiblePickItem[]): { property: number; area: number } {
  let property = 0;
  let area = 0;
  for (const item of items) {
    if (item.source !== 'database') continue;
    if (item.curatedScope === 'area') area += 1;
    else property += 1;
  }
  return { property, area };
}

function takeNextDbRow(
  pool: { withinRadius: DbPickRow[]; beyondRadius: DbPickRow[] },
  out: FlexiblePickItem[],
  preferScope: 'property' | 'area'
): DbPickRow | null {
  const scopes: Array<'property' | 'area'> = [
    preferScope,
    preferScope === 'property' ? 'area' : 'property',
  ];
  for (const scope of scopes) {
    for (const band of [pool.withinRadius, pool.beyondRadius]) {
      for (const row of band) {
        if (rowCuratedScope(row) !== scope) continue;
        const candidate = rowToPick(row);
        if (out.some((existing) => isSameBusiness(existing, candidate))) continue;
        return row;
      }
    }
  }
  return null;
}

function tryAddBalancedDb(
  out: FlexiblePickItem[],
  pool: { withinRadius: DbPickRow[]; beyondRadius: DbPickRow[] },
  maxToAdd: number,
  itemCap: number
): number {
  let added = 0;
  while (added < maxToAdd && out.length < itemCap) {
    const counts = countDbScope(out);
    const prefer: 'property' | 'area' =
      counts.property <= counts.area ? 'property' : 'area';
    const row = takeNextDbRow(pool, out, prefer);
    if (!row) break;
    out.push(rowToPick(row));
    added += 1;
  }
  return added;
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
  recentlyShown: Set<string> = new Set(),
  catalogDocs: Record<string, unknown>[] = [],
  primaryLocale = 'en',
  guestLocale?: string,
  knowledgeByPrimary: Record<string, string> = {}
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
    const catLimitKm = categoryDistanceLimitKm(maxKm, cat, knowledgeByPrimary);

    for (const g of gems || []) {
      if (
        catalogDocs.length > 0
          ? !gemBelongsToCategory(g, cat, catalogDocs, primaryLocale, guestLocale)
          : !gemCategoryPrimaries(g, [], primaryLocale, guestLocale).some(
              (p) => p.trim().toLowerCase() === cat.trim().toLowerCase()
            )
      ) {
        continue;
      }
      const row = mapDbItem(g, cat, startCoords, catLimitKm, recentlyShown);
      if (row) rows.push(row);
    }

    for (const f of features || []) {
      if (
        catalogDocs.length > 0
          ? !featureBelongsToCategory(f, cat, catalogDocs, primaryLocale)
          : !f.categories?.includes(cat)
      ) {
        continue;
      }
      const row = mapDbItem(f, cat, startCoords, catLimitKm, recentlyShown);
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
  recentlyShown: Set<string> = new Set(),
  knowledgeByPrimary: Record<string, string> = {},
  itemCap = maxPicksForRadius(maxKm)
): FlexiblePickItem[] {
  const pool = dbContext[categoryName];
  const out = [...items];

  // [AREAS ONLY] categories: local gems/features are businesses — do not pad from DB.
  const knowledgeMode = getCategoryKnowledgeMode(knowledgeByPrimary[categoryName] || '');
  if (knowledgeMode === 'areas') {
    return out.map((i) => enrichPickItem(i, maxKm, startCoords, recentlyShown));
  }

  if (!pool) return out.map((i) => enrichPickItem(i, maxKm, startCoords, recentlyShown));

  const displayMax = maxPicksForRadius(maxKm);
  const targetDbCount = Math.ceil(displayMax / 2);
  const dbCount = out.filter((i) => i.source === 'database').length;

  // Step 1 — ~half the DISPLAY list from Vailo DB (balance property + area gems).
  const dbDeficit = Math.max(0, targetDbCount - dbCount);
  if (dbDeficit > 0) {
    tryAddBalancedDb(out, pool, dbDeficit, itemCap);
  }

  // Step 2 — top up with DB until display cap (still balancing property vs area).
  while (out.length < displayMax) {
    const before = out.length;
    tryAddBalancedDb(out, pool, 1, itemCap);
    if (out.length === before) break;
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

export function trimFlexiblePicksToDisplayCap(planData: any, maxKm: number): any {
  if (!planData || planData.type !== 'picks' || !Array.isArray(planData.categories)) {
    return planData;
  }
  const displayMax = maxPicksForRadius(maxKm);
  const categories = planData.categories.map((cat: any) => ({
    ...cat,
    items: (cat.items || []).slice(0, displayMax),
  }));
  return { ...planData, categories };
}

export function normalizeFlexiblePicksPlan(
  planData: any,
  maxKm: number,
  dbContext: Record<string, { withinRadius: DbPickRow[]; beyondRadius: DbPickRow[] }>,
  startCoords?: { lat: number; lng: number } | null,
  recentlyShown: Set<string> = new Set(),
  knowledgeByPrimary: Record<string, string> = {},
  itemCap = maxPicksForRadius(maxKm)
): any {
  if (!planData || planData.type !== 'picks' || !Array.isArray(planData.categories)) {
    return planData;
  }

  const categories = planData.categories.map((cat: any) => {
    const catHardCap = categoryHardCapKm(maxKm, cat.categoryName, knowledgeByPrimary);

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
      return km <= catHardCap;
    });

    // [AREAS ONLY]: drop host-curated businesses — only geographic AI picks allowed.
    const knowledgeMode = getCategoryKnowledgeMode(knowledgeByPrimary[cat.categoryName] || '');
    if (knowledgeMode === 'areas') {
      items = items.filter((item) => item.source !== 'database');
    }

    items = dedupePickItems(items);
    items = sortPickItems(items);

    items = padCategoryFromDb(
      items,
      dbContext,
      cat.categoryName,
      maxKm,
      startCoords,
      recentlyShown,
      knowledgeByPrimary,
      itemCap
    );
    items = dedupePickItems(items);
    items = sortPickItems(items);
    items = items.slice(0, itemCap);

    return { ...cat, items };
  });

  return { ...planData, categories };
}

export function buildFlexiblePicksPromptSection(
  categories: string[],
  maxKm: number,
  dbContext: Record<string, { withinRadius: DbPickRow[]; beyondRadius: DbPickRow[] }>,
  knowledgeByPrimary: Record<string, string> = {}
): string {
  const hardCap = effectiveMaxDistanceKm(maxKm);
  const displayMax = maxPicksForRadius(maxKm);
  const poolSize = aiCandidatePoolSize();

  const perCategory = categories.map((cat) => {
    const pool = dbContext[cat] || { withinRadius: [], beyondRadius: [] };
    const knowledge = knowledgeByPrimary[cat] || '';
    const knowledgeMode = getCategoryKnowledgeMode(knowledge);
    const areasOnly = knowledgeMode === 'areas';
    const within = areasOnly ? [] : pool.withinRadius;
    const beyond = areasOnly ? [] : pool.beyondRadius;
    const catLimitKm = categoryDistanceLimitKm(maxKm, cat, knowledgeByPrimary);
    const catHardCap = categoryHardCapKm(maxKm, cat, knowledgeByPrimary);
    return {
      category: cat,
      knowledgeMode,
      searchRadiusKm: catLimitKm,
      hardCapKm: catHardCap,
      adminKnowledge: knowledge || null,
      withinRadiusCount: within.length,
      beyondRadiusCount: beyond.length,
      propertyWithinCount: within.filter((r) => r.curatedScope !== 'area').length,
      areaWithinCount: within.filter((r) => r.curatedScope === 'area').length,
      withinRadius: within.slice(0, 8).map((r) => ({
        name: r.name,
        distanceKm: Number(r.distanceKm.toFixed(1)),
        curatedScope: r.curatedScope || 'property',
        isLegitPick: r.isLegitPick,
        description: r.description,
        photoUrl: r.photoUrl,
        googleMapsUrl: r.googleMapsUrl,
        googlePlaceId: r.googlePlaceId || '',
      })),
      beyondRadiusExtension: beyond.slice(0, 8).map((r) => ({
        name: r.name,
        distanceKm: Number(r.distanceKm.toFixed(1)),
        curatedScope: r.curatedScope || 'property',
        isLegitPick: r.isLegitPick,
        description: r.description,
        photoUrl: r.photoUrl,
        googleMapsUrl: r.googleMapsUrl,
        googlePlaceId: r.googlePlaceId || '',
        note: `Slightly beyond ${catLimitKm}km — capped at ${catHardCap.toFixed(0)}km. Only use if within-radius is thin.`,
      })),
    };
  });

  const targetDbPerCat = Math.ceil(displayMax / 2);
  const targetAiPerCat = displayMax - targetDbPerCat;

  return `
        QUALITY BAR:
        Prefer authentic neighbourhood picks that residents use over tourist-trap lists. Avoid cruise-ship restaurants, overcrowded Instagram-only spots, generic chains, and hollow "Top 10" roundups.

        DESCRIPTION TONE:
        Write concrete, varied descriptions. Do not repeat "locals love", "locals prefer", or similar framing on every item — mix food, setting, timing, and practical tips instead.

        VERIFICATION PIPELINE (READ CAREFULLY):
        - Return up to ${poolSize} AI candidates per category (source: "ai"). Our system resolves each title on Google Maps and DROPS any pick that cannot be verified.
        - Guests see up to ${displayMax} verified picks per category. Fill within-radius first; use beyondRadius: true for picks 4–5 when the tight search is thin.
        - Over-generate quality candidates — we need spare verified picks after filtering. Returning 2 weak names is worse than returning 10 real ones.
        - Use EXACT official Google Maps titles. Wrong spelling or invented labels are discarded (e.g. use "Phylaki" not "Filaki Village"; "Kalyvaki Beach" not "western river mouth beach").
        - Leave photoUrl and googleMapsUrl EMPTY for every AI pick. Include googlePlaceId ONLY if you are certain — otherwise empty string.

        HARD DISTANCE LIMIT (NON-NEGOTIABLE):
        The guest chose a ${maxKm}km radius (${maxKm <= TIGHT_RADIUS_KM_THRESHOLD ? 'tight' : 'wider'} search). Each category has its own searchRadiusKm and hardCapKm in the pools below — NEVER exceed hardCapKm. Dining/business categories may have a slightly wider searchRadiusKm (+${BUSINESS_CATEGORY_RADIUS_BONUS_KM}km). Never suggest famous far-away landmarks (Knossos, Samaria, etc.) inside a tight local search.

        50 / 50 SPLIT (business / "any" categories only):
        - The DISPLAY list shows ~${targetDbPerCat} Vailo database picks + ~${targetAiPerCat} verified AI picks (${displayMax} total).
        - Vailo database = host property local gems + area-curated local gems (curatedScope "property" vs "area" in pools). Mix both when available — never repeat the same business.
        - Our system balances property and area database picks automatically. Your AI candidates fill the remaining verified slots AFTER Google checks your titles (${poolSize} max).
        - knowledgeMode "areas" (Beach, Culture, etc.): ZERO database businesses. ALL candidates must be geographic AI picks — beaches, coves, villages, gorges, archaeological sites. Provide up to ${poolSize} distinct official place names.

        AI PICKS — REAL PLACES ONLY:
        - knowledgeMode "areas": geographic spots ONLY. No restaurants, tours, shops, marinas, or operators. Title = official Maps name ("Kalyvaki Beach", "Phylaki", "Aptera", "Argyroupoli"). NEVER invent descriptive names ("unorganized section", "river mouth", "hidden cove near X").
        - knowledgeMode "business": named establishments ONLY. Format: "Business Name, Village" (e.g. "Taverna To Steki, Vryses"). No generic "old town stroll" without a specific venue.
        - If unsure a place exists on Google Maps within the radius, SKIP it — never guess.
        - Never suggest permanently closed businesses.

        DISTANCE RULES:
        - Prefer places within ${maxKm}km. Use beyondRadius: true only for the extended band up to each category's hardCapKm.
        - distanceKm is REQUIRED on every item and must respect hardCapKm.
        - estimatedDistance: "12.4km" or "Further · 18.0km" when beyondRadius is true.
        - Sort each category CLOSEST to FURTHEST.

        UNIQUENESS:
        - One place = one entry. Same business, same beach, same village = one entry only.

        PER-CATEGORY DATABASE POOLS (pre-sorted by distance — use for database source picks):
        ${JSON.stringify(perCategory)}
      `;
}
