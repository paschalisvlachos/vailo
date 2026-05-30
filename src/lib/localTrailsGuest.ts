import {
  allTrailsPhotoUrl,
  resolveAllTrailsEmbedSrc,
} from './allTrailsTrail';
import { beyondRadiusBufferKm, effectiveMaxDistanceKm, MAX_PICKS_PER_CATEGORY } from './flexiblePicks';

export const HIKING_TRAILS_CATEGORY_PRIMARY = 'Hiking & Trails';

/** Only suggest trails rated 4.0★ or higher to guests. */
export const MIN_GUEST_TRAIL_RATING = 4;

export function isGuestEligibleTrail(trail: LocalTrailRecord): boolean {
  const rating = trail.rating;
  return typeof rating === 'number' && Number.isFinite(rating) && rating >= MIN_GUEST_TRAIL_RATING;
}

export function filterGuestEligibleTrails(trails: LocalTrailRecord[]): LocalTrailRecord[] {
  return trails.filter(isGuestEligibleTrail);
}

export type LocalTrailRecord = {
  id: string;
  allTrailsId?: string | null;
  name: string;
  description?: string;
  difficulty?: string | null;
  lengthKm?: number | null;
  lengthMiles?: number | null;
  elevationGainFt?: number | null;
  elevationGainM?: number | null;
  rating?: number | null;
  reviewCount?: number | null;
  routeType?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  photoUrl?: string | null;
  allTrailsUrl?: string | null;
  allTrailsSlug?: string | null;
  allTrailsEmbedSrc?: string | null;
  allTrailsWidgetUrl?: string | null;
};

export type TrailPickItem = {
  itemType: 'trail';
  title: string;
  description?: string;
  estimatedDistance?: string;
  beyondRadius?: boolean;
  source: 'trail';
  photoUrl?: string;
  latitude?: number;
  longitude?: number;
  difficulty?: string;
  lengthLabel?: string;
  rating?: number;
  reviewCount?: number;
  routeType?: string;
  elevationLabel?: string;
  allTrailsUrl?: string;
  allTrailsEmbedSrc?: string;
  allTrailsId?: string;
  distanceKm?: number;
  previouslyShown?: boolean;
};

/** Match area category names like "Hiking & Trails". */
export function isHikingTrailsCategory(name: string): boolean {
  const n = name.trim().toLowerCase();
  if (!n) return false;
  if (n === 'hiking & trails' || n === 'hiking and trails' || n === 'hiking trails') return true;
  return n.includes('hiking') && n.includes('trail');
}

export function trailCoords(trail: LocalTrailRecord): { lat: number; lng: number } | null {
  const lat = trail.latitude;
  const lng = trail.longitude;
  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  return { lat, lng };
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = (b.lat - a.lat) * (Math.PI / 180);
  const dLng = (b.lng - a.lng) * (Math.PI / 180);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * (Math.PI / 180)) *
      Math.cos(b.lat * (Math.PI / 180)) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s)) * 1.35;
}

export function formatTrailLength(trail: LocalTrailRecord): string {
  if (typeof trail.lengthKm === 'number' && Number.isFinite(trail.lengthKm) && trail.lengthKm > 0) {
    return `${trail.lengthKm.toFixed(1)} km`;
  }
  if (typeof trail.lengthMiles === 'number' && Number.isFinite(trail.lengthMiles) && trail.lengthMiles > 0) {
    return `${trail.lengthMiles.toFixed(1)} mi`;
  }
  return '';
}

export function formatTrailElevation(trail: LocalTrailRecord): string {
  if (typeof trail.elevationGainFt === 'number' && Number.isFinite(trail.elevationGainFt) && trail.elevationGainFt > 0) {
    return `${Math.round(trail.elevationGainFt).toLocaleString()} ft gain`;
  }
  if (typeof trail.elevationGainM === 'number' && Number.isFinite(trail.elevationGainM) && trail.elevationGainM > 0) {
    return `${Math.round(trail.elevationGainM).toLocaleString()} m gain`;
  }
  return '';
}

export function formatTrailDifficulty(raw?: string | null): string {
  const d = String(raw || '').trim();
  if (!d) return '';
  return d.charAt(0).toUpperCase() + d.slice(1).toLowerCase();
}

export function formatTrailRating(rating?: number | null, reviewCount?: number | null): string {
  if (typeof rating !== 'number' || !Number.isFinite(rating)) return '';
  const stars = rating.toFixed(1);
  if (typeof reviewCount === 'number' && reviewCount > 0) {
    return `${stars} (${reviewCount.toLocaleString()})`;
  }
  return stars;
}

export function localTrailToPickItem(
  trail: LocalTrailRecord,
  startCoords: { lat: number; lng: number } | null,
  maxKm: number
): TrailPickItem | null {
  const coords = trailCoords(trail);
  if (!coords || !startCoords) return null;

  const distanceKm = haversineKm(startCoords, coords);
  const hardCap = effectiveMaxDistanceKm(maxKm);
  const withinRadius = distanceKm <= maxKm;
  const withinExtended = distanceKm <= hardCap;
  if (!withinExtended) return null;

  const beyondRadius = !withinRadius;
  const estimatedDistance = beyondRadius
    ? `Further · ${distanceKm.toFixed(1)} km`
    : `${distanceKm.toFixed(1)} km`;

  return {
    itemType: 'trail',
    title: trail.name.trim() || 'Trail',
    description: String(trail.description || '').trim(),
    estimatedDistance,
    beyondRadius,
    source: 'trail',
    photoUrl: allTrailsPhotoUrl(trail.allTrailsId, trail.photoUrl),
    latitude: coords.lat,
    longitude: coords.lng,
    difficulty: formatTrailDifficulty(trail.difficulty),
    lengthLabel: formatTrailLength(trail),
    rating: typeof trail.rating === 'number' ? trail.rating : undefined,
    reviewCount: typeof trail.reviewCount === 'number' ? trail.reviewCount : undefined,
    routeType: String(trail.routeType || '').trim(),
    elevationLabel: formatTrailElevation(trail),
    allTrailsUrl: String(trail.allTrailsUrl || '').trim(),
    allTrailsEmbedSrc: resolveAllTrailsEmbedSrc({
      embedSrc: trail.allTrailsEmbedSrc,
      widgetUrl: trail.allTrailsWidgetUrl,
      slug: trail.allTrailsSlug,
      allTrailsUrl: trail.allTrailsUrl,
    }),
    allTrailsId: trail.allTrailsId ? String(trail.allTrailsId) : undefined,
    distanceKm,
  };
}

/** Build sorted trail picks for one hiking category within the guest's distance. */
export function buildTrailPicksForCategory(
  categoryName: string,
  trails: LocalTrailRecord[],
  startCoords: { lat: number; lng: number } | null,
  maxKm: number
): { categoryName: string; isTrails: true; items: TrailPickItem[] } {
  if (!startCoords) {
    return { categoryName, isTrails: true, items: [] };
  }

  const hardCap = effectiveMaxDistanceKm(maxKm);
  const buffer = beyondRadiusBufferKm(maxKm);

  const within: TrailPickItem[] = [];
  const beyond: TrailPickItem[] = [];

  for (const trail of trails) {
    const pick = localTrailToPickItem(trail, startCoords, maxKm);
    if (!pick || pick.distanceKm == null) continue;
    if (pick.distanceKm <= maxKm) within.push(pick);
    else if (pick.distanceKm <= hardCap) beyond.push(pick);
  }

  within.sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
  beyond.sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));

  let items = [...within];
  if (items.length < MAX_PICKS_PER_CATEGORY) {
    items = [...items, ...beyond.slice(0, MAX_PICKS_PER_CATEGORY - items.length)];
  }
  items = items.slice(0, MAX_PICKS_PER_CATEGORY);

  return { categoryName, isTrails: true, items };
}

export function buildHikingTrailCategories(
  selectedCategoryNames: string[],
  trails: LocalTrailRecord[],
  startCoords: { lat: number; lng: number } | null,
  maxKm: number,
  resolveLabel: (primary: string) => string
): Array<{ categoryName: string; isTrails: true; items: TrailPickItem[] }> {
  const hikingNames = selectedCategoryNames.filter(isHikingTrailsCategory);
  const eligibleTrails = filterGuestEligibleTrails(trails);
  return hikingNames.map((primary) =>
    buildTrailPicksForCategory(resolveLabel(primary), eligibleTrails, startCoords, maxKm)
  );
}

/** Normalize AllTrails description for display — instant, no network. */
export function formatTrailDescriptionDisplay(raw?: string | null): string {
  return String(raw || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}
