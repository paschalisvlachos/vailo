/** Plan photos: Tier 1 = Vailo DB ($0), Tier 3 = cached Google Places (low cost). */

import { resolvePlacePhoto } from './placePhotoResolver';
import { normalizePlaceName, placeNamesMatch } from './placeNameUtils';
import { isDirectPlaceMapsUrl, buildPlaceMapUrls, bareGooglePlaceId } from './geocoding';

export type PlanPhotoContext = {
  propertyPhotoUrl?: string;
  propertyName?: string;
  locationLabel?: string;
  usePropertyPhotoOnBookends?: boolean;
  gems?: Array<{
    name?: string;
    photoUrl?: string;
    googleMapsUrl?: string;
    latitude?: number | string;
    longitude?: number | string;
  }>;
  features?: Array<{
    name?: string;
    businessName?: string;
    photoUrl?: string;
    googleMapsUrl?: string;
    latitude?: number | string;
    longitude?: number | string;
  }>;
  areaName?: string;
  country?: string;
  areaId?: string;
  discoveredPlaces?: Array<{
    name?: string;
    photoUrl?: string;
    googleMapsUrl?: string;
    googlePlaceId?: string;
    latitude?: number;
    longitude?: number;
  }>;
  anchorCoords?: { lat: number; lng: number } | null;
};

const RESOLVE_CONCURRENCY = 5;

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\u0370-\u03ff]/g, '');
}

function parseCoord(value: unknown): number | undefined {
  if (typeof value === 'number' && !isNaN(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const n = parseFloat(value);
    if (!isNaN(n)) return n;
  }
  return undefined;
}

function buildPhotoLookup(ctx: PlanPhotoContext): Map<string, string> {
  const map = new Map<string, string>();
  const add = (label: string | undefined, url: string | undefined) => {
    if (!label?.trim() || !url?.trim()) return;
    const key = normalizeKey(label);
    if (!map.has(key)) map.set(key, url);
  };
  for (const g of ctx.gems || []) add(g.name, g.photoUrl);
  for (const f of ctx.features || []) add(f.businessName || f.name, f.photoUrl);
  for (const d of ctx.discoveredPlaces || []) add(d.name, d.photoUrl);
  return map;
}

function lookupPhoto(title: string, lookup: Map<string, string>): string | undefined {
  const key = normalizeKey(title);
  if (!key) return undefined;
  return lookup.get(key);
}

async function mapConcurrent<T, R>(
  items: T[],
  worker: (item: T, index: number) => Promise<R>,
  concurrency = RESOLVE_CONCURRENCY
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  const runWorker = async () => {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await worker(items[i], i);
    }
  };

  const workers = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workers }, runWorker));
  return results;
}

function resolveFromLocalSources(
  item: Record<string, unknown>,
  ctx: PlanPhotoContext
): ResolvedPlacePhoto | null {
  const title = typeof item.title === 'string' ? item.title : '';
  if (!title) return null;
  const key = normalizeKey(title);

  const sources = [
    ...(ctx.gems || []).map((g) => ({
      name: g.name,
      photoUrl: g.photoUrl,
      googleMapsUrl: g.googleMapsUrl,
      lat: parseCoord(g.latitude),
      lng: parseCoord(g.longitude),
    })),
    ...(ctx.features || []).map((f) => ({
      name: f.businessName || f.name,
      photoUrl: f.photoUrl,
      googleMapsUrl: f.googleMapsUrl,
      lat: parseCoord(f.latitude),
      lng: parseCoord(f.longitude),
    })),
    ...(ctx.discoveredPlaces || []).map((d) => ({
      name: d.name,
      photoUrl: d.photoUrl,
      googleMapsUrl: d.googleMapsUrl,
      googlePlaceId: d.googlePlaceId,
      lat: d.latitude,
      lng: d.longitude,
    })),
  ];

  for (const src of sources) {
    if (!src.name || normalizeKey(src.name) !== key) continue;
    if (!src.photoUrl && !src.googleMapsUrl) continue;
    return {
      photoUrl: src.photoUrl || null,
      googleMapsUrl: src.googleMapsUrl || null,
      googlePlaceId: (src as { googlePlaceId?: string }).googlePlaceId || null,
      latitude: src.lat ?? null,
      longitude: src.lng ?? null,
      placeName: src.name,
      fromDiscoveredDb: true,
    };
  }

  return null;
}

function itemNeedsGooglePhoto(item: Record<string, unknown>): boolean {
  const title = typeof item.title === 'string' ? item.title.trim() : '';
  if (!title || title.toLowerCase() === 'n/a') return false;

  // Vailo curated picks — never overwrite admin-verified listings
  if (item.source === 'database') return false;

  const hasPhoto = typeof item.photoUrl === 'string' && item.photoUrl.trim().length > 0;
  const mapsUrl = typeof item.googleMapsUrl === 'string' ? item.googleMapsUrl : '';
  const hasPlaceId =
    typeof item.googlePlaceId === 'string' && bareGooglePlaceId(item.googlePlaceId);

  if (hasPhoto && (hasPlaceId || isDirectPlaceMapsUrl(mapsUrl))) return false;

  return true;
}

function getItemCoords(item: Record<string, unknown>): { lat?: number; lng?: number } {
  const lat = parseCoord(item.latitude ?? item.lat);
  const lng = parseCoord(item.longitude ?? item.lng);
  if (lat != null && lng != null) return { lat, lng };
  return {};
}

async function enrichItemWithGooglePhoto(
  item: Record<string, unknown>,
  ctx: PlanPhotoContext,
  planSessionCache: Map<string, ResolvedPlacePhoto>
): Promise<Record<string, unknown>> {
  const local = resolveFromLocalSources(item, ctx);
  if (local) {
    return applyResolvedPhoto(item, local, String(item.title || ''));
  }

  if (!itemNeedsGooglePhoto(item)) return item;

  const title = String(item.title);
  const area = ctx.areaName || '';
  const { lat, lng } = getItemCoords(item);

  if (!ctx.country || !ctx.areaId) return item;

  const normalized = normalizePlaceName(title);
  const sessionKey = `${normalized}::${lat?.toFixed(4) ?? 'x'}::${lng?.toFixed(4) ?? 'x'}`;
  const cached = planSessionCache.get(sessionKey);
  if (cached) {
    return applyResolvedPhoto(item, cached, title);
  }

  try {
    const resolved = await resolvePlacePhoto({
      title,
      area,
      country: ctx.country,
      areaId: ctx.areaId,
      latitude: lat,
      longitude: lng,
      anchorLat: ctx.anchorCoords?.lat,
      anchorLng: ctx.anchorCoords?.lng,
    });

    planSessionCache.set(sessionKey, resolved);
    return applyResolvedPhoto(item, resolved, title);
  } catch (e) {
    console.warn('Google photo resolve failed for', title, e);
    return item;
  }
}

type ResolvedPlacePhoto = Awaited<ReturnType<typeof resolvePlacePhoto>>;

function applyResolvedPhoto(
  item: Record<string, unknown>,
  resolved: ResolvedPlacePhoto,
  requestedTitle: string
): Record<string, unknown> {
  if (resolved.notFound) return item;
  if (!resolved.photoUrl && !resolved.googleMapsUrl && !resolved.googlePlaceId) return item;

  const resolvedName = resolved.placeName || '';
  if (resolvedName && requestedTitle && !placeNamesMatch(requestedTitle, resolvedName)) {
    console.warn(`Rejected place mismatch: requested "${requestedTitle}", got "${resolvedName}"`);
    return item;
  }

  const next: Record<string, unknown> = { ...item };
  if (resolved.photoUrl) next.photoUrl = resolved.photoUrl;
  if (resolved.googleMapsUrl) next.googleMapsUrl = resolved.googleMapsUrl;
  if (resolved.googlePlaceId) next.googlePlaceId = resolved.googlePlaceId;
  if (resolved.latitude != null) next.latitude = resolved.latitude;
  if (resolved.longitude != null) next.longitude = resolved.longitude;

  if (resolved.googlePlaceId && !next.googleMapsUrl) {
    const links = buildPlaceMapUrls(
      resolved.googlePlaceId,
      resolved.latitude ?? undefined,
      resolved.longitude ?? undefined,
      requestedTitle
    );
    if (links.googleMapsUrl) next.googleMapsUrl = links.googleMapsUrl;
  }

  return next;
}

function enrichPlanItem(
  item: Record<string, unknown>,
  lookup: Map<string, string>,
  ctx: PlanPhotoContext,
  bookendHint: boolean
): Record<string, unknown> {
  const existing = typeof item.photoUrl === 'string' ? item.photoUrl.trim() : '';
  if (existing) return item;

  if (bookendHint && ctx.usePropertyPhotoOnBookends && ctx.propertyPhotoUrl) {
    return {
      ...item,
      photoUrl: ctx.propertyPhotoUrl,
      source: item.source || 'database',
    };
  }

  if (item.source !== 'database') return item;

  const title = typeof item.title === 'string' ? item.title : '';
  const fromDb = lookupPhoto(title, lookup);
  if (fromDb) {
    return { ...item, photoUrl: fromDb, source: 'database' };
  }

  return item;
}

export function enrichPlanWithPhotos(planData: unknown, ctx: PlanPhotoContext): unknown {
  if (!planData || typeof planData !== 'object') return planData;

  const lookup = buildPhotoLookup(ctx);
  const data = planData as Record<string, unknown>;

  if (data.type === 'timeline' && Array.isArray(data.plan)) {
    const plan = data.plan as Record<string, unknown>[];
    const enriched = plan.map((item, index) => {
      const isFirst = index === 0;
      const isLast = index === plan.length - 1;
      return enrichPlanItem(item, lookup, ctx, isFirst || isLast);
    });
    return { ...data, plan: enriched };
  }

  if (data.type === 'picks' && Array.isArray(data.categories)) {
    const categories = (data.categories as Record<string, unknown>[]).map((cat) => {
      const items = Array.isArray(cat.items)
        ? (cat.items as Record<string, unknown>[]).map((item) =>
            enrichPlanItem(item, lookup, ctx, false)
          )
        : cat.items;
      return { ...cat, items };
    });
    return { ...data, categories };
  }

  return planData;
}

export async function enrichPlanWithGooglePhotos(
  planData: unknown,
  ctx: PlanPhotoContext
): Promise<unknown> {
  if (!ctx.areaName?.trim()) return planData;
  if (!planData || typeof planData !== 'object') return planData;

  const data = planData as Record<string, unknown>;
  const planSessionCache = new Map<string, ResolvedPlacePhoto>();

  if (data.type === 'timeline' && Array.isArray(data.plan)) {
    const items = data.plan as Record<string, unknown>[];
    const plan = await mapConcurrent(items, async (item, i) => {
      const isBookend =
        ctx.usePropertyPhotoOnBookends &&
        ctx.propertyPhotoUrl &&
        (i === 0 || i === items.length - 1);
      if (isBookend) {
        return {
          ...item,
          photoUrl: ctx.propertyPhotoUrl,
          source: item.source || 'database',
        };
      }
      return enrichItemWithGooglePhoto(item, ctx, planSessionCache);
    });
    return { ...data, plan };
  }

  if (data.type === 'picks' && Array.isArray(data.categories)) {
    const categories = [];
    for (const cat of data.categories as Record<string, unknown>[]) {
      const catItems = (cat.items as Record<string, unknown>[]) || [];
      const items = await mapConcurrent(catItems, (item) =>
        enrichItemWithGooglePhoto(item, ctx, planSessionCache)
      );
      categories.push({ ...cat, items });
    }
    return { ...data, categories };
  }

  return planData;
}

export async function enrichPlanWithAllPhotos(
  planData: unknown,
  ctx: PlanPhotoContext
): Promise<unknown> {
  const withGoogle = await enrichPlanWithGooglePhotos(planData, ctx);
  return enrichPlanWithPhotos(withGoogle, ctx);
}
