import { namesLikelySame, normalizePlaceName } from './placeNameUtils';

const LOCATION_MATCH_KM = 0.2;

function drivingKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function parseGemCoords(
  gem: Record<string, unknown> | null | undefined
): { lat: number; lng: number } | null {
  if (!gem) return null;
  const latRaw = gem.latitude ?? gem.lat;
  const lngRaw = gem.longitude ?? gem.lng;
  const lat = typeof latRaw === 'number' ? latRaw : parseFloat(String(latRaw ?? ''));
  const lng = typeof lngRaw === 'number' ? lngRaw : parseFloat(String(lngRaw ?? ''));
  if (isNaN(lat) || isNaN(lng)) return null;
  return { lat, lng };
}

export function coordsSameLocation(
  a: { lat: number; lng: number } | null,
  b: { lat: number; lng: number } | null,
  maxKm = LOCATION_MATCH_KM
): boolean {
  if (!a || !b) return false;
  return drivingKm(a.lat, a.lng, b.lat, b.lng) <= maxKm;
}

export function gemPrimaryName(gem: Record<string, unknown>): string {
  return String(gem.name || gem.businessName || '').trim();
}

/** Same canonical name (fuzzy) and within ~200m — used for property→area dedupe. */
export function gemSameNameAndLocation(
  a: Record<string, unknown>,
  b: Record<string, unknown>
): boolean {
  const nameA = normalizePlaceName(gemPrimaryName(a));
  const nameB = normalizePlaceName(gemPrimaryName(b));
  if (!nameA || !nameB || !namesLikelySame(nameA, nameB)) return false;
  return coordsSameLocation(parseGemCoords(a), parseGemCoords(b));
}
