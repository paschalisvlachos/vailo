/** Plan photos: Tier 1 = Vailo DB ($0), Tier 3 = cached Google Places (low cost). */

import { resolvePlacePhoto, mirrorPlacePhotoUrl, type ResolvedPlacePhoto, isGooglePlacesPhotoUrl } from './placePhotoResolver';
import {
  normalizePlaceName,
  placeNamesMatch,
  placeResolutionConflicts,
  sanitizePlaceSearchTitle,
} from './placeNameUtils';
import { looksLikeCommercialPlaceName } from './areasPickFilter';
import { getCategoryKnowledgeMode } from './liveLikeLocalCategories';
import { categoryDistanceLimitKm } from './flexiblePicks';
import { placeSearchTitleVariants } from './pickVerification';
import { logPickEvent } from './aiExpertPlanDebug';
import { collectMatchableTitles, titleMatchesCatalogEntry } from './alternateTitles';

function isPropertyPlanItem(item: Record<string, unknown>, ctx: PlanPhotoContext): boolean {
  if (item.isProperty === true || item.source === 'property') return true;
  const title = typeof item.title === 'string' ? item.title : '';
  return !!(ctx.propertyName && title && placeNamesMatch(title, ctx.propertyName));
}
import {
  isDirectPlaceMapsUrl,
  isBrokenPlaceMapsUrl,
  buildPlaceMapUrls,
  bareGooglePlaceId,
} from './geocoding';

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
    alternateTitles?: string[];
    nameByLocale?: Record<string, string>;
  }>;
  features?: Array<{
    name?: string;
    businessName?: string;
    photoUrl?: string;
    googleMapsUrl?: string;
    latitude?: number | string;
    longitude?: number | string;
    alternateTitles?: string[];
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
    alternateTitles?: string[];
  }>;
  anchorCoords?: { lat: number; lng: number } | null;
  guestMaxKm?: number;
  knowledgeByPrimary?: Record<string, string>;
};

type ItemPhotoContext = PlanPhotoContext & {
  categoryName?: string;
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
  const addEntry = (
    entry: {
      name?: string;
      businessName?: string;
      alternateTitles?: string[];
      nameByLocale?: Record<string, string>;
    },
    url: string | undefined
  ) => {
    if (!url?.trim()) return;
    for (const label of collectMatchableTitles(entry)) {
      const key = normalizeKey(label);
      if (key && !map.has(key)) map.set(key, url);
    }
  };
  for (const g of ctx.gems || []) addEntry(g, g.photoUrl);
  for (const f of ctx.features || []) addEntry(f, f.photoUrl);
  for (const d of ctx.discoveredPlaces || []) addEntry(d, d.photoUrl);
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
  ctx: ItemPhotoContext
) {
  const title = typeof item.title === 'string' ? item.title : '';
  if (!title) return null;

  const sources: Array<{
    kind: string;
    entry: {
      name?: string;
      businessName?: string;
      alternateTitles?: string[];
      nameByLocale?: Record<string, string>;
    };
    photoUrl?: string;
    googleMapsUrl?: string;
    lat?: number;
    lng?: number;
    googlePlaceId?: string;
  }> = [
    ...(ctx.gems || []).map((g) => ({
      kind: 'property_local_gem',
      entry: g,
      photoUrl: g.photoUrl,
      googleMapsUrl: g.googleMapsUrl,
      lat: parseCoord(g.latitude),
      lng: parseCoord(g.longitude),
    })),
    ...(ctx.features || []).map((f) => ({
      kind: 'property_feature',
      entry: f,
      photoUrl: f.photoUrl,
      googleMapsUrl: f.googleMapsUrl,
      lat: parseCoord(f.latitude),
      lng: parseCoord(f.longitude),
    })),
    ...(ctx.discoveredPlaces || []).map((d) => ({
      kind: 'discovered_place_cache',
      entry: d,
      photoUrl: d.photoUrl,
      googleMapsUrl: d.googleMapsUrl,
      googlePlaceId: d.googlePlaceId,
      lat: d.latitude,
      lng: d.longitude,
    })),
  ];

  for (const src of sources) {
    if (!titleMatchesCatalogEntry(title, src.entry)) continue;
    if (!src.photoUrl && !src.googleMapsUrl) continue;
    // Legacy rows may still store a Google media URL — re-resolve to mirror to Storage.
    if (isGooglePlacesPhotoUrl(src.photoUrl)) continue;
    const matchedName = collectMatchableTitles(src.entry)[0] || title;
    logPickEvent('PHOTO — FREE local DB hit (no Google call)', {
      title,
      matchedName,
      localSource: src.kind,
      category: ctx.categoryName || null,
      chargedGoogleApi: false,
    });
    return {
      photoUrl: src.photoUrl || null,
      googleMapsUrl: src.googleMapsUrl || null,
      googlePlaceId: src.googlePlaceId || null,
      latitude: src.lat ?? null,
      longitude: src.lng ?? null,
      placeName: matchedName,
      fromDiscoveredDb: true,
      localSource: src.kind,
    };
  }

  return null;
}

function itemNeedsGooglePhoto(item: Record<string, unknown>): boolean {
  const title = typeof item.title === 'string' ? item.title.trim() : '';
  if (!title || title.toLowerCase() === 'n/a') return false;

  if (item.isProperty === true || item.source === 'property') return false;

  // Vailo curated picks — never overwrite admin-verified listings
  if (item.source === 'database') return false;

  const hasPhoto = typeof item.photoUrl === 'string' && item.photoUrl.trim().length > 0;
  const mapsUrl = typeof item.googleMapsUrl === 'string' ? item.googleMapsUrl : '';
  const hasPlaceId =
    typeof item.googlePlaceId === 'string' && bareGooglePlaceId(item.googlePlaceId);

  if (hasPhoto && (hasPlaceId || isDirectPlaceMapsUrl(mapsUrl))) {
    if (isGooglePlacesPhotoUrl(item.photoUrl)) return true;
    return false;
  }

  return true;
}

function getItemCoords(item: Record<string, unknown>): { lat?: number; lng?: number } {
  const lat = parseCoord(item.latitude ?? item.lat);
  const lng = parseCoord(item.longitude ?? item.lng);
  if (lat != null && lng != null) return { lat, lng };
  return {};
}

async function mirrorItemPhotoIfNeeded(
  item: Record<string, unknown>,
  ctx: ItemPhotoContext
): Promise<Record<string, unknown>> {
  const photoUrl = typeof item.photoUrl === 'string' ? item.photoUrl.trim() : '';
  if (!photoUrl || !isGooglePlacesPhotoUrl(photoUrl)) return item;
  if (!ctx.country || !ctx.areaId) return item;

  try {
    const mirrored = await mirrorPlacePhotoUrl({
      photoUrl,
      country: ctx.country,
      areaId: ctx.areaId,
      googlePlaceId:
        typeof item.googlePlaceId === 'string' ? item.googlePlaceId : undefined,
    });
    if (mirrored && mirrored !== photoUrl) {
      logPickEvent('PHOTO — mirrored Google CDN URL to Firebase Storage', {
        title: item.title,
        category: ctx.categoryName || null,
      });
      return { ...item, photoUrl: mirrored };
    }
  } catch (err) {
    console.warn('Photo mirror failed for', item.title, err);
  }
  return item;
}

async function enrichItemWithGooglePhoto(
  item: Record<string, unknown>,
  ctx: ItemPhotoContext,
  planSessionCache: Map<string, ResolvedPlacePhoto>
): Promise<Record<string, unknown>> {
  const titleRaw = String(item.title || '').trim();
  const local = resolveFromLocalSources(item, ctx);
  if (local) {
    return applyResolvedPhoto(item, local, titleRaw, ctx);
  }

  if (!itemNeedsGooglePhoto(item)) {
    logPickEvent('PHOTO — skip (already complete or curated)', {
      title: titleRaw,
      source: item.source,
      category: ctx.categoryName || null,
      chargedGoogleApi: false,
      reason:
        item.source === 'database'
          ? 'Vailo database pick — never call Google'
          : 'already has photo + place map link',
    });
    return item;
  }

  const title = sanitizePlaceSearchTitle(titleRaw);
  if (!title) return item;
  const area = ctx.areaName || '';
  const { lat, lng } = getItemCoords(item);

  if (!ctx.country || !ctx.areaId) {
    logPickEvent('PHOTO — skip (no area context)', {
      title,
      category: ctx.categoryName || null,
      chargedGoogleApi: false,
    });
    return item;
  }

  const normalized = normalizePlaceName(title);
  const sessionKey = `${normalized}::${lat?.toFixed(4) ?? 'x'}::${lng?.toFixed(4) ?? 'x'}`;
  const cached = planSessionCache.get(sessionKey);
  if (cached && !isGooglePlacesPhotoUrl(cached.photoUrl)) {
    logPickEvent('PHOTO — FREE session cache hit', {
      title,
      category: ctx.categoryName || null,
      chargedGoogleApi: false,
      resolveOrigin: cached.resolveOrigin,
    });
    return applyResolvedPhoto(item, cached, title, ctx);
  }

  const categoryName = ctx.categoryName || '';
  const knowledgeMode = getCategoryKnowledgeMode(ctx.knowledgeByPrimary?.[categoryName] || '');
  const maxKm =
    ctx.guestMaxKm != null
      ? categoryDistanceLimitKm(ctx.guestMaxKm, categoryName, ctx.knowledgeByPrimary || {})
      : undefined;

  try {
    let resolved: ResolvedPlacePhoto | null = null;
    for (const variant of placeSearchTitleVariants(title)) {
      logPickEvent('PHOTO — calling resolvePlacePhoto cloud function', {
        title: variant,
        originalTitle: title,
        category: categoryName,
        maxKm: maxKm ?? null,
        knowledgeMode,
      });
      const attempt = await resolvePlacePhoto({
        title: variant,
        area,
        country: ctx.country,
        areaId: ctx.areaId,
        latitude: lat,
        longitude: lng,
        anchorLat: ctx.anchorCoords?.lat,
        anchorLng: ctx.anchorCoords?.lng,
        maxKm,
        knowledgeMode,
      });
      if (attempt.notFound) {
        logPickEvent('PHOTO — Google/cache miss for variant', {
          title: variant,
          category: categoryName,
          chargedGoogleApi: attempt.googleApiBilled === true,
          resolveOrigin: attempt.resolveOrigin,
        });
        continue;
      }
      resolved = attempt;
      logPickEvent(
        attempt.googleApiBilled ? 'PHOTO — BILLED Google Places API' : 'PHOTO — FREE cache via resolvePlacePhoto',
        {
          title: variant,
          resolvedName: attempt.placeName,
          category: categoryName,
          chargedGoogleApi: attempt.googleApiBilled === true,
          resolveOrigin: attempt.resolveOrigin,
          fromDiscoveredDb: attempt.fromDiscoveredDb,
          discoveredPlaceId: attempt.discoveredPlaceId,
          hasPhoto: Boolean(attempt.photoUrl),
        }
      );
      break;
    }

    if (!resolved) {
      logPickEvent('PHOTO — all variants failed (pick may be hidden later)', {
        title,
        category: categoryName,
        chargedGoogleApi: false,
      });
      return item;
    }

    planSessionCache.set(sessionKey, resolved);
    return applyResolvedPhoto(item, resolved, title, ctx);
  } catch (e) {
    console.warn('Google photo resolve failed for', title, e);
    logPickEvent('PHOTO — error', { title, category: categoryName, error: String(e) });
    return item;
  }
}

function applyResolvedPhoto(
  item: Record<string, unknown>,
  resolved: ResolvedPlacePhoto,
  requestedTitle: string,
  ctx: ItemPhotoContext
): Record<string, unknown> {
  if (resolved.notFound) return item;
  if (!resolved.photoUrl && !resolved.googleMapsUrl && !resolved.googlePlaceId) return item;

  const resolvedName = resolved.placeName || '';
  if (resolvedName && requestedTitle && placeResolutionConflicts(requestedTitle, resolvedName)) {
    logPickEvent('PHOTO — rejected kind conflict', {
      requestedTitle,
      resolvedName,
      category: ctx.categoryName || null,
      reason: 'requested vs resolved place type mismatch',
    });
    return item;
  }

  const categoryName = String(ctx.categoryName || '');
  const knowledgeMode = getCategoryKnowledgeMode(ctx.knowledgeByPrimary?.[categoryName] || '');
  if (knowledgeMode === 'areas') {
    if (
      (requestedTitle && looksLikeCommercialPlaceName(requestedTitle)) ||
      (resolvedName && looksLikeCommercialPlaceName(resolvedName))
    ) {
      logPickEvent('PHOTO — rejected commercial in areas category', {
        requestedTitle,
        resolvedName,
        category: categoryName,
        reason: 'areas-only category blocks commercial names',
      });
      return item;
    }
  }

  const next: Record<string, unknown> = { ...item };
  if (resolved.photoUrl) next.photoUrl = resolved.photoUrl;
  if (resolved.googleMapsUrl && !isBrokenPlaceMapsUrl(resolved.googleMapsUrl)) {
    next.googleMapsUrl = resolved.googleMapsUrl;
  }
  if (resolved.googlePlaceId) next.googlePlaceId = resolved.googlePlaceId;
  if (resolved.latitude != null) next.latitude = resolved.latitude;
  if (resolved.longitude != null) next.longitude = resolved.longitude;

  const links = buildPlaceMapUrls(
    resolved.googlePlaceId,
    resolved.latitude ?? undefined,
    resolved.longitude ?? undefined,
    requestedTitle
  );
  if (!next.googleMapsUrl && links.googleMapsUrl) next.googleMapsUrl = links.googleMapsUrl;
  if (links.navigateUrl) next.navigateUrl = links.navigateUrl;

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

  if (
    bookendHint &&
    isPropertyPlanItem(item, ctx) &&
    ctx.usePropertyPhotoOnBookends &&
    ctx.propertyPhotoUrl
  ) {
    return {
      ...item,
      photoUrl: ctx.propertyPhotoUrl,
      source: 'property',
      isProperty: true,
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
    const plan = await mapConcurrent(items, async (item) => {
      if (isPropertyPlanItem(item, ctx) && ctx.propertyPhotoUrl) {
        return {
          ...item,
          photoUrl: ctx.propertyPhotoUrl,
          source: 'property',
          isProperty: true,
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
      const categoryName = String(cat.categoryName || '');
      const items = await mapConcurrent(catItems, (item) =>
        enrichItemWithGooglePhoto(
          item,
          { ...ctx, categoryName },
          planSessionCache
        )
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
  const withLocal = enrichPlanWithPhotos(withGoogle, ctx);
  return enrichPlanWithMirroredPhotos(withLocal, ctx);
}

async function enrichPlanWithMirroredPhotos(
  planData: unknown,
  ctx: PlanPhotoContext
): Promise<unknown> {
  if (!planData || typeof planData !== 'object') return planData;
  const data = planData as Record<string, unknown>;

  if (data.type === 'timeline' && Array.isArray(data.plan)) {
    const plan = await mapConcurrent(data.plan as Record<string, unknown>[], (item) =>
      mirrorItemPhotoIfNeeded(item, ctx)
    );
    return { ...data, plan };
  }

  if (data.type === 'picks' && Array.isArray(data.categories)) {
    const categories = [];
    for (const cat of data.categories as Record<string, unknown>[]) {
      const categoryName = String(cat.categoryName || '');
      const items = await mapConcurrent(
        (cat.items as Record<string, unknown>[]) || [],
        (item) => mirrorItemPhotoIfNeeded(item, { ...ctx, categoryName })
      );
      categories.push({ ...cat, items });
    }
    return { ...data, categories };
  }

  return planData;
}
