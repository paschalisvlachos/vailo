/** Flexible picks: up to 5 unique businesses per category, distance-sorted, local-first. */

import { normalizePlaceName, namesLikelySame } from './placeNameUtils';
import { bareGooglePlaceId, isDirectPlaceMapsUrl } from './geocoding';
import { pickKeyForItem } from './picksFairness';
import {
  featureBelongsToCategory,
  gemBelongsToCategory,
  gemCategoryPrimaries,
} from './categoryLocale';
import { shouldDropAreasCommercialAiPick } from './areasPickFilter';
import { getCategoryKnowledgeMode } from './liveLikeLocalCategories';
import { logPickEvent } from './aiExpertPlanDebug';
import { titleMatchesCatalogEntry } from './alternateTitles';
import {
  isGuestVerifiedDiscoveredPlace,
  type GuestDiscoveredPlaceRow,
} from './guestDiscoveredPlaces';

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
/** Curated Vailo pool slots shown per category (gems, features, verified discovered). */
export const CURATED_PICKS_PER_CATEGORY = 3;
/** Verified AI card slots per category — never padded with failed picks. */
export const AI_PICKS_PER_CATEGORY = 3;
export const FLEXIBLE_PICKS_CARD_CAP =
  CURATED_PICKS_PER_CATEGORY + AI_PICKS_PER_CATEGORY;
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
  return FLEXIBLE_PICKS_CARD_CAP;
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
  curatedScope?: 'property' | 'area' | 'discovered';
  alternateTitles?: string[];
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
  const lat =
    obj.latitude ?? obj.lat ?? obj.coords?.latitude ?? obj.coords?.lat;
  const lng =
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
    alternateTitles: row.alternateTitles,
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
    curatedScope:
      item.curatedScope === 'area'
        ? 'area'
        : item.curatedScope === 'discovered'
          ? 'discovered'
          : 'property',
    alternateTitles: Array.isArray(item.alternateTitles)
      ? item.alternateTitles.map(String)
      : undefined,
  };
}

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
  _propCoords: { lat: number; lng: number } | null,
  gems: any[],
  features: any[],
  discoveredPlaces: GuestDiscoveredPlaceRow[] = [],
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

    for (const d of discoveredPlaces || []) {
      if (!isGuestVerifiedDiscoveredPlace(d)) continue;
      const placeCat = String(d.category || '').trim();
      if (placeCat.toLowerCase() !== cat.trim().toLowerCase()) continue;
      const row = mapDbItem(
        { ...d, name: d.name, curatedScope: 'discovered' },
        cat,
        startCoords,
        catLimitKm,
        recentlyShown
      );
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

  if (titleMatchesCatalogEntry(a.title, { name: b.title, alternateTitles: b.alternateTitles as string[] | undefined })) {
    return true;
  }
  if (titleMatchesCatalogEntry(b.title, { name: a.title, alternateTitles: a.alternateTitles as string[] | undefined })) {
    return true;
  }

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

/**
 * Curated local gems/features are the source of truth. When the model returns a
 * pick that matches a known DB row — whether it tagged it "database" (often with
 * a copied or guessed map link) or "ai" — replace it with the DB row so the map
 * link, photo, place id and coordinates ALWAYS come from our database (every gem
 * is saved with a map link, so it is never blank). The model's prose description
 * is kept only when the gem has none. This is global: it applies to every
 * category/question, not any single topic.
 */
function reconcilePickWithDb(
  item: FlexiblePickItem,
  pool: { withinRadius: DbPickRow[]; beyondRadius: DbPickRow[] } | undefined
): FlexiblePickItem {
  if (!pool) return item;
  for (const row of [...pool.withinRadius, ...pool.beyondRadius]) {
    const dbPick = rowToPick(row);
    if (isSameBusiness(dbPick, item)) {
      logPickEvent('DB_RECONCILE — AI pick matched Vailo row', {
        aiTitle: item.title,
        dbName: row.name,
        curatedScope: row.curatedScope || 'property',
        band: pool.withinRadius.includes(row) ? 'withinRadius' : 'beyondRadius',
        previousSource: item.source,
        reason: 'replace with authoritative DB photo/maps/coords',
      });
      return { ...dbPick, description: dbPick.description || item.description || '' };
    }
  }
  return item;
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

function shuffleRows<T>(rows: T[]): T[] {
  const out = [...rows];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function isCuratedPickItem(item: FlexiblePickItem): boolean {
  return (
    item.source === 'database' ||
    item.source === 'property' ||
    item.isProperty === true
  );
}

/**
 * Pick up to N curated Vailo rows (gems, features, verified discovered).
 * Randomizes when the pool is larger than the cap — quality over quantity.
 */
function selectCuratedFromPool(
  existingItems: FlexiblePickItem[],
  pool: { withinRadius: DbPickRow[]; beyondRadius: DbPickRow[] } | undefined,
  cap = CURATED_PICKS_PER_CATEGORY
): FlexiblePickItem[] {
  if (!pool || cap <= 0) return [];

  const eligible: DbPickRow[] = [];
  for (const row of [...pool.withinRadius, ...pool.beyondRadius]) {
    const candidate = rowToPick(row);
    if (existingItems.some((item) => isSameBusiness(item, candidate))) continue;
    if (eligible.some((row) => isSameBusiness(rowToPick(row), candidate))) continue;
    eligible.push(row);
  }

  return shuffleRows(eligible)
    .slice(0, cap)
    .map((row) => {
      logPickEvent('DB_SELECT — curated pick chosen', {
        dbName: row.name,
        curatedScope: row.curatedScope || 'property',
        distanceKm: row.distanceKm,
        reason: 'random sample from verified Vailo pool',
      });
      return rowToPick(row);
    });
}

/** DISPLAY order — nearest first. Applied to the already-selected items. */
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

/**
 * SELECTION order — which picks make the cut, by *quality* rather than mere
 * proximity. Within-radius picks come first, then curated Vailo "legit" picks,
 * then the AI's own best-first ordering is preserved (stable). Distance is NOT
 * used here, so widening the radius surfaces genuinely better places (a renowned
 * beach 35 km away can outrank a mediocre one 4 km away) instead of repeating
 * the nearest cluster. The displayed list is re-sorted by distance afterwards.
 */
function sortPickItemsForSelection(items: FlexiblePickItem[]): FlexiblePickItem[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const aBeyond = a.item.beyondRadius ? 1 : 0;
      const bBeyond = b.item.beyondRadius ? 1 : 0;
      if (aBeyond !== bBeyond) return aBeyond - bBeyond;
      const aLegit = a.item.isLegitPick ? 0 : 1;
      const bLegit = b.item.isLegitPick ? 0 : 1;
      if (aLegit !== bLegit) return aLegit - bLegit;
      return a.index - b.index;
    })
    .map((entry) => entry.item);
}

/**
 * The single, location-agnostic quality gate for an *AI* pick. A pick is only
 * shown when we can fully stand behind it — otherwise it is dropped (and the
 * over-generated candidate pool back-fills its slot). This is what stops
 * low-confidence Google matches (no photo / wrong-location same-name results)
 * from ever reaching the guest. Database / property picks are pre-curated and
 * always pass. No extra API calls — it reads only data we already resolved.
 *
 * An AI pick must:
 *  1. resolve to a real Google place (place id) with a direct place map link
 *     (not a bare "?query=Name" search),
 *  2. carry a photo — a reliable proxy that Google matched a real, established
 *     place rather than a weak text guess, and
 *  3. sit within the category's allowed radius of the start, measured on the
 *     *resolved* coordinates (so a same-named place in another region is cut
 *     even if the AI claimed it was nearby).
 */
export function explainAiPickShowability(
  item: any,
  anchor: { lat: number; lng: number } | null | undefined,
  hardCapKm: number
): { showable: boolean; reason: string } {
  if (!item || typeof item !== 'object') {
    return { showable: false, reason: 'invalid item' };
  }
  if (item.source === 'database' || item.source === 'property' || item.isProperty === true) {
    const scope =
      item.source === 'database'
        ? `database (${item.curatedScope === 'area' ? 'area local gem' : 'property local gem'})`
        : item.source || 'property';
    return { showable: true, reason: `curated — always showable (${scope})` };
  }

  const placeId = bareGooglePlaceId(item.googlePlaceId);
  const mapsUrl = typeof item.googleMapsUrl === 'string' ? item.googleMapsUrl : '';
  if (!placeId && !extractsPlaceIdFromUrl(mapsUrl)) {
    return { showable: false, reason: 'no Google place ID on item or map URL' };
  }
  if (!isDirectPlaceMapsUrl(mapsUrl)) {
    return {
      showable: false,
      reason: 'map link is a name search (?q=), not a direct place link',
    };
  }

  const hasPhoto = typeof item.photoUrl === 'string' && item.photoUrl.trim().length > 0;
  if (!hasPhoto) {
    return { showable: false, reason: 'no photo (Google match not trusted yet)' };
  }

  const coords = extractCoords(item);
  if (!coords) {
    return { showable: false, reason: 'no resolved coordinates after enrichment' };
  }

  if (anchor && isFinite(hardCapKm) && hardCapKm > 0) {
    const km = drivingKm(anchor.lat, anchor.lng, coords.lat, coords.lng);
    if (km > hardCapKm) {
      return {
        showable: false,
        reason: `resolved location ${km.toFixed(1)}km away — over hardCap ${hardCapKm}km`,
      };
    }
  }

  return { showable: true, reason: 'verified AI pick (place ID + photo + coords in range)' };
}

export function isAiPickShowable(
  item: any,
  anchor: { lat: number; lng: number } | null | undefined,
  hardCapKm: number
): boolean {
  return explainAiPickShowability(item, anchor, hardCapKm).showable;
}

function extractsPlaceIdFromUrl(url: string): boolean {
  return /[?&](?:query_place_id|destination_place_id|place_id)=/i.test(url || '');
}

/**
 * Apply verification across a picks plan: curated cards + verified AI cards +
 * text-only unverified mentions (failed Google checks).
 */
export function applyPickVerificationToPlan(
  planData: any,
  maxKm: number,
  anchor: { lat: number; lng: number } | null | undefined,
  knowledgeByPrimary: Record<string, string> = {}
): any {
  if (!planData || planData.type !== 'picks' || !Array.isArray(planData.categories)) {
    return planData;
  }

  const categories = planData.categories.map((cat: any) => {
    if (cat?.isTrails) return cat;

    const categoryName = String(cat?.categoryName || '');
    const hardCapKm = categoryHardCapKm(maxKm, categoryName, knowledgeByPrimary);
    const incoming = (cat?.items || []) as FlexiblePickItem[];

    const curated: FlexiblePickItem[] = [];
    const verifiedAi: FlexiblePickItem[] = [];
    const unverifiedMentions: Array<{
      title: string;
      description?: string;
      failureReason?: string;
    }> = [];

    for (const item of incoming) {
      if (isCuratedPickItem(item)) {
        curated.push(item);
        continue;
      }

      if (
        shouldDropAreasCommercialAiPick(
          item as Record<string, unknown>,
          categoryName,
          knowledgeByPrimary
        )
      ) {
        logPickEvent('VERIFY_HIDE — areas commercial AI pick', {
          category: categoryName,
          title: item?.title,
          reason: 'areas-only category — commercial/business name blocked',
        });
        unverifiedMentions.push({
          title: item.title,
          description: item.description,
          failureReason: 'areas-only — not a geographic place',
        });
        continue;
      }

      const verdict = explainAiPickShowability(item, anchor, hardCapKm);
      if (verdict.showable) {
        if (curated.some((c) => isSameBusiness(c, item))) {
          logPickEvent('VERIFY_HIDE — AI duplicates curated pick', {
            category: categoryName,
            title: item.title,
            reason: 'same place already in Vailo curated set',
          });
          continue;
        }
        verifiedAi.push(item);
        continue;
      }

      logPickEvent('VERIFY_HIDE — isAiPickShowable failed', {
        category: categoryName,
        title: item?.title,
        source: item?.source,
        hardCapKm,
        reason: verdict.reason,
        photoUrl: Boolean(item?.photoUrl?.trim?.()),
        googlePlaceId: item?.googlePlaceId || null,
      });
      unverifiedMentions.push({
        title: item.title,
        description: item.description,
        failureReason: verdict.reason,
      });
    }

    const cardItems = [
      ...curated.slice(0, CURATED_PICKS_PER_CATEGORY),
      ...verifiedAi.slice(0, AI_PICKS_PER_CATEGORY),
    ];

    return {
      ...cat,
      items: sortPickItems(cardItems),
      unverifiedMentions,
    };
  });

  return { ...planData, categories };
}

export function collectUnverifiedMentionsFromPlan(
  planData: any
): Array<{ title: string; description?: string; category?: string; failureReason?: string }> {
  if (!planData || planData.type !== 'picks' || !Array.isArray(planData.categories)) {
    return [];
  }
  const out: Array<{
    title: string;
    description?: string;
    category?: string;
    failureReason?: string;
  }> = [];
  for (const cat of planData.categories) {
    if (cat?.isTrails || !Array.isArray(cat?.unverifiedMentions)) continue;
    const categoryName = String(cat.categoryName || '');
    for (const m of cat.unverifiedMentions) {
      if (!m?.title) continue;
      out.push({
        title: m.title,
        description: m.description,
        category: categoryName,
        failureReason: m.failureReason,
      });
    }
  }
  return out;
}

/**
 * @deprecated Use {@link applyPickVerificationToPlan} — keeps cards only, drops unverified silently.
 */
export function filterShowableAiPicksFromPlan(
  planData: any,
  maxKm: number,
  anchor: { lat: number; lng: number } | null | undefined,
  knowledgeByPrimary: Record<string, string> = {}
): any {
  const verified = applyPickVerificationToPlan(
    planData,
    maxKm,
    anchor,
    knowledgeByPrimary
  );
  if (!verified?.categories) return verified;
  return {
    ...verified,
    categories: verified.categories.map((cat: any) => {
      const { unverifiedMentions: _drop, ...rest } = cat;
      return rest;
    }),
  };
}

export function trimFlexiblePicksToDisplayCap(
  planData: any,
  maxKm: number,
  capOverride?: number
): any {
  if (!planData || planData.type !== 'picks' || !Array.isArray(planData.categories)) {
    return planData;
  }
  const displayMax =
    capOverride && capOverride > 0 ? capOverride : maxPicksForRadius(maxKm);
  const categories = planData.categories.map((cat: any) => {
    // Items arrive in SELECTION (best-first) order — take the best N, then show
    // them nearest-first.
    const before = (cat.items || []).length;
    const selected = (cat.items || []).slice(0, displayMax);
    if (before > selected.length) {
      logPickEvent('TRIM — display cap applied', {
        category: cat.categoryName,
        before,
        after: selected.length,
        displayMax,
        droppedTitles: (cat.items || []).slice(displayMax).map((i: any) => i.title),
      });
    }
    return { ...cat, items: cat?.isTrails ? selected : sortPickItems(selected) };
  });
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
    const categoryName = String(cat.categoryName || '');
    const catHardCap = categoryHardCapKm(maxKm, cat.categoryName, knowledgeByPrimary);
    const pool = dbContext[cat.categoryName];
    const incomingCount = (cat.items || []).length;

    logPickEvent('NORMALIZE — category start', {
      category: categoryName,
      incomingItems: incomingCount,
      hardCapKm: catHardCap,
      poolWithin: pool?.withinRadius?.length ?? 0,
      poolBeyond: pool?.beyondRadius?.length ?? 0,
    });

    // Reconcile against the DB FIRST so any pick that is really a curated gem
    // carries the database's authoritative map link / photo before dedup runs.
    let aiItems: FlexiblePickItem[] = (cat.items || [])
      .filter((item: FlexiblePickItem) => !isCuratedPickItem(item))
      .map((item: FlexiblePickItem) =>
        enrichPickItem(reconcilePickWithDb(item, pool), maxKm, startCoords, recentlyShown)
      );

    // HARD CAP: drop AI items that exceed the maximum effective distance.
    aiItems = aiItems.filter((item) => {
      const km = parseDistanceKm(item);
      if (km == null) return true;
      const ok = km <= catHardCap;
      if (!ok) {
        logPickEvent('NORMALIZE_HIDE — AI over hardCapKm', {
          category: categoryName,
          title: item.title,
          aiDistanceKm: km,
          hardCapKm: catHardCap,
          reason: 'model claimed distance exceeds category hard cap',
        });
      }
      return ok;
    });

    // [AREAS ONLY]: block commercial AI picks — geographic spots only.
    const knowledgeMode = getCategoryKnowledgeMode(knowledgeByPrimary[cat.categoryName] || '');
    if (knowledgeMode === 'areas') {
      aiItems = aiItems.filter((item) => {
        const drop = shouldDropAreasCommercialAiPick(
          item as Record<string, unknown>,
          cat.categoryName,
          knowledgeByPrimary
        );
        if (drop) {
          logPickEvent('NORMALIZE_HIDE — areas commercial AI pick', {
            category: categoryName,
            title: item.title,
            reason: 'areas-only category — commercial/business name blocked',
          });
        }
        return !drop;
      });
    }

    aiItems = dedupePickItems(aiItems);
    aiItems = sortPickItemsForSelection(aiItems);

    const curated = selectCuratedFromPool(aiItems, pool, CURATED_PICKS_PER_CATEGORY).map((item) =>
      enrichPickItem(item, maxKm, startCoords, recentlyShown)
    );

    let items = [...curated, ...aiItems];
    items = dedupePickItems(items);
    items = sortPickItemsForSelection(items);
    items = items.slice(0, itemCap);

    logPickEvent('NORMALIZE — category done', {
      category: categoryName,
      finalCount: items.length,
      curatedCount: items.filter((i) => isCuratedPickItem(i)).length,
      aiCount: items.filter((i) => !isCuratedPickItem(i)).length,
      titles: items.map((i) => i.title),
    });

    return { ...cat, items };
  });

  return { ...planData, categories };
}

export function buildFlexiblePicksPromptSection(
  categories: string[],
  maxKm: number,
  dbContext: Record<string, { withinRadius: DbPickRow[]; beyondRadius: DbPickRow[] }>,
  knowledgeByPrimary: Record<string, string> = {},
  displayMaxOverride?: number,
  poolSizeOverride?: number
): string {
  const displayMax =
    displayMaxOverride && displayMaxOverride > 0
      ? displayMaxOverride
      : maxPicksForRadius(maxKm);
  const poolSize =
    poolSizeOverride && poolSizeOverride > 0 ? poolSizeOverride : aiCandidatePoolSize();

  const perCategory = categories.map((cat) => {
    const pool = dbContext[cat] || { withinRadius: [], beyondRadius: [] };
    const knowledge = knowledgeByPrimary[cat] || '';
    const knowledgeMode = getCategoryKnowledgeMode(knowledge);
    const within = pool.withinRadius;
    const beyond = pool.beyondRadius;
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
      propertyWithinCount: within.filter((r) => r.curatedScope === 'property').length,
      areaWithinCount: within.filter((r) => r.curatedScope === 'area').length,
      discoveredWithinCount: within.filter((r) => r.curatedScope === 'discovered').length,
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

  return `
        QUALITY BAR:
        Prefer authentic neighbourhood picks that residents use over tourist-trap lists. Avoid cruise-ship restaurants, overcrowded Instagram-only spots, generic chains, and hollow "Top 10" roundups.

        DESCRIPTION TONE:
        Write concrete, varied descriptions. Do not repeat "locals love", "locals prefer", or similar framing on every item — mix food, setting, timing, and practical tips instead.

        VERIFICATION PIPELINE (READ CAREFULLY):
        - Return up to ${poolSize} AI candidates per category (source: "ai"). Our system resolves each title on Google Maps and ONLY verified picks become cards.
        - Guests see up to ${CURATED_PICKS_PER_CATEGORY} Vailo curated picks + up to ${AI_PICKS_PER_CATEGORY} verified AI picks (${displayMax} cards max). Failed verifications appear as text-only suggestions — never as cards.
        - Over-generate quality candidates — we need spare verified picks after filtering. Returning 2 weak names is worse than returning 10 real ones.
        - Use EXACT official Google Maps titles. Wrong spelling or invented labels are discarded (e.g. use "Phylaki" not "Filaki Village"; "Kalyvaki Beach" not "western river mouth beach").
        - Leave photoUrl and googleMapsUrl EMPTY for every AI pick. Include googlePlaceId ONLY if you are certain — otherwise empty string.

        HARD DISTANCE LIMIT (NON-NEGOTIABLE):
        The guest chose a ${maxKm}km radius (${maxKm <= TIGHT_RADIUS_KM_THRESHOLD ? 'tight' : 'wider'} search). Each category has its own searchRadiusKm and hardCapKm in the pools below — NEVER exceed hardCapKm. Dining/business categories may have a slightly wider searchRadiusKm (+${BUSINESS_CATEGORY_RADIUS_BONUS_KM}km). Never suggest famous far-away landmarks (Knossos, Samaria, etc.) inside a tight local search.

        CURATED + AI SPLIT:
        - Up to ${CURATED_PICKS_PER_CATEGORY} cards come from the Vailo database pools below (property gems, area gems, features, verified discovered places). Our system picks from the pool — do NOT duplicate those names in your AI list.
        - Up to ${AI_PICKS_PER_CATEGORY} additional cards come from YOUR verified AI candidates after Google checks (${poolSize} max returned). No filler — empty AI slots are OK when verification fails.
        - knowledgeMode "areas" (Beach, Culture, etc.): database pools may include verified geographic places (beaches, villages, sites). Your AI candidates must ALSO be geographic — no restaurants, beach bars, tours, shops, or paid venues. Provide distinct official place names.

        AI PICKS — REAL PLACES ONLY:
        - knowledgeMode "areas": geographic spots ONLY. No restaurants, beach bars, tours, shops, marinas, operators, or paid venues — even if the Google name contains Beach/Cove/Village. Title = official Maps name ("Kalyvaki Beach", "Phylaki", "Aptera", "Argyroupoli"). NEVER suggest hotels, studios, apartments, or establishments named after a beach. NEVER invent descriptive names ("unorganized section", "river mouth", "hidden cove near X").
        - knowledgeMode "business": named establishments ONLY. Format: "Business Name, Village" (e.g. "Taverna To Steki, Vryses"). No generic "old town stroll" without a specific venue.
        - If unsure a place exists on Google Maps within the radius, SKIP it — never guess.
        - Never suggest permanently closed businesses.

        DISTANCE RULES:
        - Anywhere within ${maxKm}km is equally valid — do NOT bias toward the closest spots. Use beyondRadius: true only for the extended band up to each category's hardCapKm.
        - distanceKm is REQUIRED on every item and must respect hardCapKm.
        - estimatedDistance: "12.4km" or "Further · 18.0km" when beyondRadius is true.

        RANKING (IMPORTANT):
        - Order each category BEST-FIRST — most worth visiting / most renowned / highest quality — REGARDLESS of distance. A standout place near the edge of the radius should rank ABOVE an average one nearby. We re-sort the final shortlist by distance for display, so your ordering decides WHICH places are chosen, not the order shown.

        UNIQUENESS:
        - One place = one entry. Same business, same beach, same village = one entry only.

        PER-CATEGORY DATABASE POOLS (pre-sorted by distance — Vailo curated; do not repeat in AI list):
        ${JSON.stringify(perCategory)}
      `;
}
