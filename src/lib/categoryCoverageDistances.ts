import {
  featureBelongsToCategory,
  gemBelongsToCategory,
  gemCategoryPrimaries,
} from './categoryLocale';
import { getCategoryKnowledgeMode } from './liveLikeLocalCategories';
import { isHikingTrailsCategory, trailCoords, type LocalTrailRecord } from './localTrailsGuest';

const COVERAGE_BUFFER_KM = 2;
const DEFAULT_COVERAGE_KM = 10;
/** When a business category has no local gems yet, assume AI can find picks nearby. */
const BUSINESS_NO_CURATED_FLOOR_KM = 10;
const MIN_TIER_KM = 5;
/** Local regional tier between coverage minimum and wide explore. */
const NEAR_REGIONAL_TIER_KM = 29;
const MAX_TIER_KM = 100;

function extractCoords(obj: Record<string, unknown> | null | undefined): { lat: number; lng: number } | null {
  if (!obj) return null;

  let lat =
    obj.latitude ?? obj.lat ?? (obj.coords as { latitude?: number; lat?: number })?.latitude ??
    (obj.coords as { lat?: number })?.lat ?? (obj.location as { latitude?: number; lat?: number })?.latitude ??
    (obj.location as { lat?: number })?.lat;
  let lng =
    obj.longitude ?? obj.lng ?? (obj.coords as { longitude?: number; lng?: number })?.longitude ??
    (obj.coords as { lng?: number })?.lng ?? (obj.location as { longitude?: number; lng?: number })?.longitude ??
    (obj.location as { lng?: number })?.lng;

  if (typeof obj.coordinates === 'string' && obj.coordinates.includes(',')) {
    const parts = obj.coordinates.split(',');
    lat = parts[0].trim();
    lng = parts[1].trim();
  }

  const coords = obj.coordinates as { latitude?: number; longitude?: number } | undefined;
  if (coords && typeof coords.latitude === 'number') {
    lat = coords.latitude;
    lng = coords.longitude;
  }

  const parsedLat = parseFloat(String(lat ?? ''));
  const parsedLng = parseFloat(String(lng ?? ''));
  if (!isNaN(parsedLat) && !isNaN(parsedLng)) {
    return { lat: parsedLat, lng: parsedLng };
  }
  return null;
}

/** Haversine × 1.35 — matches AiExpertView driving estimate. */
function drivingKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 1.35;
}

export type CategoryCoverageContext = {
  gems: Record<string, unknown>[];
  features: Record<string, unknown>[];
  discoveredPlaces: Record<string, unknown>[];
  trails: LocalTrailRecord[];
  catalogDocs: Record<string, unknown>[];
  knowledgeByPrimary: Record<string, string>;
  primaryLocale: string;
  guestLocale?: string;
};

export type WizardDistanceTiers = {
  options: string[];
  perCategoryNearestKm: Record<string, number | null>;
  coverageKm: number;
};

function nearestKmForCategory(
  cat: string,
  startCoords: { lat: number; lng: number },
  ctx: CategoryCoverageContext
): number | null {
  const distances: number[] = [];
  const { catalogDocs, primaryLocale, guestLocale, gems, features, discoveredPlaces, trails } =
    ctx;

  if (isHikingTrailsCategory(cat)) {
    for (const trail of trails) {
      const coords = trailCoords(trail);
      if (coords) {
        distances.push(drivingKm(startCoords.lat, startCoords.lng, coords.lat, coords.lng));
      }
    }
    return distances.length ? Math.min(...distances) : null;
  }

  for (const g of gems) {
    const matches =
      catalogDocs.length > 0
        ? gemBelongsToCategory(g, cat, catalogDocs, primaryLocale, guestLocale)
        : gemCategoryPrimaries(g, [], primaryLocale, guestLocale).some(
            (p) => p.trim().toLowerCase() === cat.trim().toLowerCase()
          );
    if (!matches) continue;
    const coords = extractCoords(g);
    if (coords) {
      distances.push(drivingKm(startCoords.lat, startCoords.lng, coords.lat, coords.lng));
    }
  }

  const knowledgeMode = getCategoryKnowledgeMode(ctx.knowledgeByPrimary[cat] || '');

  // Business picks come from local gems (+ AI). Features are experiences — don't inflate distance.
  if (knowledgeMode !== 'business') {
    for (const f of features) {
      const matches =
        catalogDocs.length > 0
          ? featureBelongsToCategory(f, cat, catalogDocs, primaryLocale)
          : (f.categories as string[] | undefined)?.includes(cat);
      if (!matches) continue;
      const coords = extractCoords(f);
      if (coords) {
        distances.push(drivingKm(startCoords.lat, startCoords.lng, coords.lat, coords.lng));
      }
    }
  }

  if (distances.length === 0 && knowledgeMode === 'areas') {
    for (const place of discoveredPlaces) {
      const coords = extractCoords(place);
      if (coords) {
        distances.push(drivingKm(startCoords.lat, startCoords.lng, coords.lat, coords.lng));
      }
    }
  }

  return distances.length ? Math.min(...distances) : null;
}

function effectiveMinForCoverage(
  cat: string,
  rawNearest: number | null,
  knowledgeByPrimary: Record<string, string>
): number | null {
  if (rawNearest != null && isFinite(rawNearest)) return rawNearest;
  const mode = getCategoryKnowledgeMode(knowledgeByPrimary[cat] || '');
  if (mode === 'business' || mode === 'any') return BUSINESS_NO_CURATED_FLOOR_KM;
  return null;
}

function buildTierValues(coverageKm: number): number[] {
  const min = Math.min(Math.max(Math.ceil(coverageKm), MIN_TIER_KM), MAX_TIER_KM - 3);
  let mid = Math.ceil((min + MAX_TIER_KM) / 2);
  if (mid <= min) mid = min + 1;
  if (mid >= MAX_TIER_KM) mid = MAX_TIER_KM - 1;

  let near = NEAR_REGIONAL_TIER_KM;
  if (near <= min) near = Math.ceil((min + mid) / 2);
  if (near >= mid) near = Math.max(min + 1, mid - 1);
  if (near <= min) near = min + 1;

  const values = [...new Set([min, near, mid, MAX_TIER_KM])].sort((a, b) => a - b);
  return values;
}

/**
 * Wizard distance tiers: minimum covers every selected category's nearest pick;
 * tiers: coverage minimum → ~29 km → ~55 km → 100 km.
 */
export function buildWizardDistanceTiers(
  categories: string[],
  startCoords: { lat: number; lng: number } | null,
  ctx: CategoryCoverageContext
): WizardDistanceTiers {
  const perCategoryNearestKm: Record<string, number | null> = {};

  if (!startCoords || categories.length === 0) {
    const fallback = buildTierValues(DEFAULT_COVERAGE_KM);
    return {
      options: fallback.map((km) => `${km}km`),
      perCategoryNearestKm,
      coverageKm: DEFAULT_COVERAGE_KM,
    };
  }

  for (const cat of categories) {
    perCategoryNearestKm[cat] = nearestKmForCategory(cat, startCoords, ctx);
  }

  const coverageInputs = categories
    .map((cat) => effectiveMinForCoverage(cat, perCategoryNearestKm[cat] ?? null, ctx.knowledgeByPrimary))
    .filter((d): d is number => d != null && isFinite(d));

  const coverageKm =
    coverageInputs.length > 0
      ? Math.ceil(Math.max(...coverageInputs) + COVERAGE_BUFFER_KM)
      : DEFAULT_COVERAGE_KM;

  const tierValues = buildTierValues(coverageKm);

  return {
    options: tierValues.map((km) => `${km}km`),
    perCategoryNearestKm,
    coverageKm,
  };
}
