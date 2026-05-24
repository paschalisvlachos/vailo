/** Zero-cost map helpers for plan overview (Google Maps links). */

import { bareGooglePlaceId } from './geocoding';
import { normalizePlaceName, namesLikelySame } from './placeNameUtils';

export type PlanMapPoint = {
  title: string;
  lat: number;
  lng: number;
  googlePlaceId?: string;
};

function parseCoord(item: Record<string, unknown>, key: 'latitude' | 'longitude'): number | null {
  const alt = key === 'latitude' ? 'lat' : 'lng';
  const raw = item[key] ?? item[alt];
  if (typeof raw === 'number' && !isNaN(raw)) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    const n = parseFloat(raw);
    if (!isNaN(n)) return n;
  }
  return null;
}

export function extractPlanMapPoints(planData: {
  type?: string;
  plan?: Record<string, unknown>[];
  categories?: { items?: Record<string, unknown>[] }[];
}): PlanMapPoint[] {
  const rawItems: Record<string, unknown>[] = [];

  if (planData.type === 'timeline' && Array.isArray(planData.plan)) {
    rawItems.push(...planData.plan);
  } else if (planData.type === 'picks' && Array.isArray(planData.categories)) {
    for (const cat of planData.categories) {
      if (Array.isArray(cat.items)) rawItems.push(...cat.items);
    }
  }

  const points: PlanMapPoint[] = [];
  const seenIds = new Set<string>();

  for (const item of rawItems) {
    const lat = parseCoord(item, 'latitude');
    const lng = parseCoord(item, 'longitude');
    if (lat == null || lng == null) continue;

    const title = typeof item.title === 'string' ? item.title.trim() : 'Place';
    if (!title) continue;

    const placeId =
      typeof item.googlePlaceId === 'string' ? item.googlePlaceId.replace(/^places\//, '') : '';
    if (placeId && seenIds.has(placeId)) continue;

    const isDuplicate = points.some(
      (p) =>
        namesLikelySame(normalizePlaceName(p.title), normalizePlaceName(title)) ||
        (Math.abs(p.lat - lat) < 0.002 && Math.abs(p.lng - lng) < 0.002)
    );
    if (isDuplicate) continue;

    if (placeId) seenIds.add(placeId);
    points.push({
      title,
      lat,
      lng,
      googlePlaceId: placeId || undefined,
    });
  }

  return points;
}

function fmtCoord(n: number): string {
  return n.toFixed(6);
}

/** Opens Google Maps — single place search, or multi-stop /dir/ route (free, no API key). */
export function buildGoogleViewAllUrl(points: PlanMapPoint[]): string | null {
  if (points.length === 0) return null;

  if (points.length === 1) {
    const p = points[0];
    const bareId = bareGooglePlaceId(p.googlePlaceId);
    if (bareId) {
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.title)}&query_place_id=${encodeURIComponent(bareId)}`;
    }
    const coords = `${fmtCoord(p.lat)},${fmtCoord(p.lng)}`;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(coords)}`;
  }

  const segments = points.map((p) => encodeURIComponent(`${fmtCoord(p.lat)},${fmtCoord(p.lng)}`));
  return `https://www.google.com/maps/dir/${segments.join('/')}`;
}
