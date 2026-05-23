/** Flexible "Skip / Keep it flexible" picks: 5 per category, distance-sorted, local-first. */

export const PICKS_PER_CATEGORY = 5;
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

    result[cat] = {
      withinRadius: rows.filter((r) => !r.beyondRadius),
      beyondRadius: rows.filter((r) => r.beyondRadius),
    };
  }

  return result;
}

function dedupePickItems(items: FlexiblePickItem[]): FlexiblePickItem[] {
  const seen = new Set<string>();
  const out: FlexiblePickItem[] = [];
  for (const item of items) {
    const key = normalizeTitle(item.title);
    if (!key || seen.has(key)) continue;
    seen.add(key);
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

  const seen = new Set(items.map((i) => normalizeTitle(i.title)));
  const out = [...items];

  const addFrom = (rows: DbPickRow[]) => {
    for (const row of rows) {
      if (out.length >= PICKS_PER_CATEGORY) break;
      const key = normalizeTitle(row.name);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(rowToPick(row));
    }
  };

  addFrom(pool.withinRadius);
  if (out.length < PICKS_PER_CATEGORY) addFrom(pool.beyondRadius);

  return out.map((i) => enrichPickItem(i, maxKm, startCoords));
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
    items.sort((a, b) => {
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

    items = padCategoryFromDb(items, dbContext, cat.categoryName, maxKm, startCoords);
    items = items.slice(0, PICKS_PER_CATEGORY);

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
      beyondRadiusExtension: pool.beyondRadius.slice(0, 5).map((r) => ({
        name: r.name,
        distanceKm: Number(r.distanceKm.toFixed(1)),
        note: `Beyond ${maxKm}km — use ONLY if you cannot reach 5 picks within radius`,
      })),
    };
  });

  return `
        LIVE LIKE A LOCAL MISSION (CRITICAL):
        You are NOT a generic travel guide. You help guests AVOID tourist traps and experience what LOCALS genuinely prefer — neighborhood tavernas, village beaches locals swim at, family-run shops, authentic weekly haunts.
        AVOID: cruise-ship restaurants, overcrowded Instagram-only spots, generic chains, "Top 10 TripAdvisor" traps with no local regulars.
        PRIORITIZE: Vailo database items (especially isLegitPick), then only AI suggestions you are certain locals actually use.

        FLEXIBLE PICKS RULES:
        1. Return EXACTLY ${PICKS_PER_CATEGORY} picks for EACH of these categories: ${categories.join(', ')}.
        2. Sort each category's items from CLOSEST to FURTHEST (shortest distanceKm first).
        3. Fill slots 1–N from WITHIN ${maxKm}km first using the database pools below.
        4. If fewer than ${PICKS_PER_CATEGORY} exist within ${maxKm}km, fill remaining slots from beyondRadiusExtension and set "beyondRadius": true on those items.
        5. Every item MUST include numeric "distanceKm" (for database items use provided value; for AI items estimate conservatively or omit and use neighborhood in estimatedDistance only if truly unknown).
        6. Items with beyondRadius true MUST use estimatedDistance starting with "Further ·" and include the km when known.

        PER-CATEGORY DATABASE POOLS (pre-sorted by distance):
        ${JSON.stringify(perCategory)}
      `;
}
