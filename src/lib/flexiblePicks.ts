/** Flexible picks: up to 5 unique businesses per category, distance-sorted, local-first. */

import { normalizePlaceName, namesLikelySame } from './placeNameUtils';
import { bareGooglePlaceId } from './geocoding';

export const MAX_PICKS_PER_CATEGORY = 5;
/** @deprecated use MAX_PICKS_PER_CATEGORY */
export const PICKS_PER_CATEGORY = MAX_PICKS_PER_CATEGORY;
const BEYOND_RADIUS_BUFFER_KM = 25;

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
  };
}

function mapDbItem(
  item: any,
  category: string,
  startCoords: { lat: number; lng: number },
  propCoords: { lat: number; lng: number } | null,
  maxKm: number
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
  const maxExtended = maxKm + BEYOND_RADIUS_BUFFER_KM;
  if (beyondRadius && distanceKm > maxExtended) return null;

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
  };
}

export function buildFlexiblePicksDbContext(
  categories: string[],
  maxKm: number,
  startCoords: { lat: number; lng: number } | null,
  propCoords: { lat: number; lng: number } | null,
  gems: any[],
  features: any[]
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
      const row = mapDbItem(g, cat, startCoords, propCoords, maxKm);
      if (row) rows.push(row);
    }

    for (const f of features || []) {
      if (!f.categories?.includes(cat)) continue;
      const row = mapDbItem(f, cat, startCoords, propCoords, maxKm);
      if (row) rows.push(row);
    }

    rows.sort((a, b) => {
      if (a.isLegitPick !== b.isLegitPick) return a.isLegitPick ? -1 : 1;
      return a.distanceKm - b.distanceKm;
    });

    const uniqueRows = dedupeDbRows(rows);

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
  startCoords?: { lat: number; lng: number } | null
): FlexiblePickItem {
  let km = parseDistanceKm(item);

  const lat = item.latitude ?? item.lat;
  const lng = item.longitude ?? item.lng;
  if (
    startCoords &&
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    !isNaN(lat) &&
    !isNaN(lng)
  ) {
    km = drivingKm(startCoords.lat, startCoords.lng, lat, lng);
  }

  const beyondRadius =
    typeof item.beyondRadius === 'boolean'
      ? item.beyondRadius
      : km != null
        ? km > maxKm
        : false;

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
  };
}

function padCategoryFromDb(
  items: FlexiblePickItem[],
  dbContext: Record<string, { withinRadius: DbPickRow[]; beyondRadius: DbPickRow[] }>,
  categoryName: string,
  maxKm: number,
  startCoords?: { lat: number; lng: number } | null
): FlexiblePickItem[] {
  const pool = dbContext[categoryName];
  if (!pool) return items;

  const out = [...items];

  const tryAdd = (rows: DbPickRow[]) => {
    for (const row of rows) {
      if (out.length >= MAX_PICKS_PER_CATEGORY) break;
      const candidate = rowToPick(row);
      if (out.some((existing) => isSameBusiness(existing, candidate))) continue;
      out.push(candidate);
    }
  };

  // Within radius first, then extended range — always unique businesses only
  if (out.length < MAX_PICKS_PER_CATEGORY) tryAdd(pool.withinRadius);
  if (out.length < MAX_PICKS_PER_CATEGORY) tryAdd(pool.beyondRadius);

  return out.map((i) => enrichPickItem(i, maxKm, startCoords));
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
  startCoords?: { lat: number; lng: number } | null
): any {
  if (!planData || planData.type !== 'picks' || !Array.isArray(planData.categories)) {
    return planData;
  }

  const categories = planData.categories.map((cat: any) => {
    let items: FlexiblePickItem[] = (cat.items || []).map((item: FlexiblePickItem) =>
      enrichPickItem(item, maxKm, startCoords)
    );

    items = dedupePickItems(items);
    items = sortPickItems(items);

    items = padCategoryFromDb(items, dbContext, cat.categoryName, maxKm, startCoords);
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
        note: `Beyond ${maxKm}km (extended range) — use to fill remaining slots with DISTINCT businesses only`,
      })),
    };
  });

  return `
        LIVE LIKE A LOCAL MISSION (CRITICAL):
        You are NOT a generic travel guide. You help guests AVOID tourist traps and experience what LOCALS genuinely prefer — neighborhood tavernas, village beaches locals swim at, family-run shops, authentic weekly haunts.
        AVOID: cruise-ship restaurants, overcrowded Instagram-only spots, generic chains, "Top 10 TripAdvisor" traps with no local regulars.
        PRIORITIZE: Vailo database items (especially isLegitPick), then only AI suggestions you are certain locals actually use.

        FLEXIBLE PICKS RULES:
        1. Aim for UP TO ${MAX_PICKS_PER_CATEGORY} UNIQUE picks per category for: ${categories.join(', ')}.
           - Fill from WITHIN ${maxKm}km first using the database pools below.
           - If fewer than ${MAX_PICKS_PER_CATEGORY} unique options exist within ${maxKm}km, fill remaining slots from beyondRadiusExtension (extended range up to ${maxKm + BEYOND_RADIUS_BUFFER_KM}km). Mark those items "beyondRadius": true.
           - If only 1–2 unique businesses exist in total (even extended range), return only those — never pad with duplicates.
        2. ABSOLUTE RULE — NEVER list the same business twice: not under a different title, description, or activity angle. One riding centre = one entry. Same Google Place, same address, or same owner = one entry.
        3. Sort each category's items from CLOSEST to FURTHEST (shortest distanceKm first).
        4. Every item MUST include numeric "distanceKm" when known.
        5. Items with beyondRadius true MUST use estimatedDistance starting with "Further ·".

        PER-CATEGORY DATABASE POOLS (pre-sorted by distance):
        ${JSON.stringify(perCategory)}
      `;
}
