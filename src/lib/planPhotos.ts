/** Plan photos: Tier 1 = Vailo DB ($0), Tier 3 = cached Google Places (low cost). */

import { resolvePlacePhoto } from './placePhotoResolver';
import { normalizePlaceName, namesLikelySame } from './placeNameUtils';

export type PlanPhotoContext = {
  propertyPhotoUrl?: string;
  propertyName?: string;
  locationLabel?: string;
  /** When true, first/last timeline items use the unit/property hero photo */
  usePropertyPhotoOnBookends?: boolean;
  gems?: Array<{ name?: string; photoUrl?: string }>;
  features?: Array<{ name?: string; businessName?: string; photoUrl?: string }>;
  /** Region hint for Google Places search, e.g. "Chania, Greece" */
  areaName?: string;
  country?: string;
  areaId?: string;
  /** Area discovered places already in Firestore (Tier 1 extension) */
  discoveredPlaces?: Array<{
    name?: string;
    photoUrl?: string;
    googleMapsUrl?: string;
  }>;
  anchorCoords?: { lat: number; lng: number } | null;
};

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\u0370-\u03ff]/g, '');
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

  if (lookup.has(key)) return lookup.get(key);

  for (const [dbKey, url] of lookup) {
    if (key.includes(dbKey) || dbKey.includes(key)) return url;
  }
  return undefined;
}

function itemNeedsGooglePhoto(item: Record<string, unknown>): boolean {
  const existing = typeof item.photoUrl === 'string' ? item.photoUrl.trim() : '';
  if (existing) return false;

  const title = typeof item.title === 'string' ? item.title.trim() : '';
  if (!title || title.toLowerCase() === 'n/a') return false;

  return true;
}

function getItemCoords(item: Record<string, unknown>): { lat?: number; lng?: number } {
  const lat = (item.latitude ?? item.lat) as number | undefined;
  const lng = (item.longitude ?? item.lng) as number | undefined;
  if (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng)) {
    return { lat, lng };
  }
  return {};
}

async function enrichItemWithGooglePhoto(
  item: Record<string, unknown>,
  ctx: PlanPhotoContext,
  planSessionCache: Map<string, ResolvedPlacePhoto>
): Promise<Record<string, unknown>> {
  if (!itemNeedsGooglePhoto(item)) return item;

  const title = String(item.title);
  const area = ctx.areaName || '';
  const { lat, lng } = getItemCoords(item);

  if (!ctx.country || !ctx.areaId) return item;

  const normalized = normalizePlaceName(title);
  for (const [cachedTitle, cached] of planSessionCache) {
    if (namesLikelySame(normalized, normalizePlaceName(cachedTitle))) {
      return applyResolvedPhoto(item, cached);
    }
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

    planSessionCache.set(title, resolved);
    planSessionCache.set(normalized, resolved);

    return applyResolvedPhoto(item, resolved);
  } catch (e) {
    console.warn('Google photo resolve failed for', title, e);
    return item;
  }
}

type ResolvedPlacePhoto = Awaited<ReturnType<typeof resolvePlacePhoto>>;

function applyResolvedPhoto(
  item: Record<string, unknown>,
  resolved: ResolvedPlacePhoto
): Record<string, unknown> {
  if (!resolved.photoUrl && !resolved.googleMapsUrl) return item;

  const next: Record<string, unknown> = { ...item };
  if (resolved.photoUrl) next.photoUrl = resolved.photoUrl;
  if (resolved.googleMapsUrl && !next.googleMapsUrl) {
    next.googleMapsUrl = resolved.googleMapsUrl;
  }
  if (resolved.latitude != null) next.latitude = resolved.latitude;
  if (resolved.longitude != null) next.longitude = resolved.longitude;
  if (!next.source) next.source = 'ai';
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

  const title = typeof item.title === 'string' ? item.title : '';
  const fromDb = lookupPhoto(title, lookup);
  if (fromDb) {
    return { ...item, photoUrl: fromDb, source: item.source || 'database' };
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

/** Tier 3: fill remaining gaps via cached Google Places photos. */
export async function enrichPlanWithGooglePhotos(
  planData: unknown,
  ctx: PlanPhotoContext
): Promise<unknown> {
  if (!ctx.areaName?.trim()) return planData;
  if (!planData || typeof planData !== 'object') return planData;

  const data = planData as Record<string, unknown>;
  const planSessionCache = new Map<string, ResolvedPlacePhoto>();

  if (data.type === 'timeline' && Array.isArray(data.plan)) {
    const plan = [];
    for (const item of data.plan as Record<string, unknown>[]) {
      plan.push(await enrichItemWithGooglePhoto(item, ctx, planSessionCache));
    }
    return { ...data, plan };
  }

  if (data.type === 'picks' && Array.isArray(data.categories)) {
    const categories = [];
    for (const cat of data.categories as Record<string, unknown>[]) {
      const items = [];
      for (const item of (cat.items as Record<string, unknown>[]) || []) {
        items.push(await enrichItemWithGooglePhoto(item, ctx, planSessionCache));
      }
      categories.push({ ...cat, items });
    }
    return { ...data, categories };
  }

  return planData;
}

/** Tier 1 then Tier 3. */
export async function enrichPlanWithAllPhotos(
  planData: unknown,
  ctx: PlanPhotoContext
): Promise<unknown> {
  const withDb = enrichPlanWithPhotos(planData, ctx);
  return enrichPlanWithGooglePhotos(withDb, ctx);
}
