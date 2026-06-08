import {
  bareGooglePlaceId,
  extractPlaceIdFromMapsUrl,
  isBrokenPlaceMapsUrl,
  isDirectPlaceMapsUrl,
} from './geocoding';

/** Cretan / Greek spelling variants for Google Places search. */
const SEARCH_TITLE_ALIASES: Record<string, string[]> = {
  filaki: ['Phylaki', 'Filaki'],
  filakivillage: ['Phylaki', 'Filaki'],
  fres: ['Fres', 'Fres Village'],
  fresvillage: ['Fres', 'Fres Village'],
};

export function placeSearchTitleVariants(title: string): string[] {
  const clean = title.trim();
  if (!clean) return [];
  const norm = clean.toLowerCase().replace(/[^a-z0-9\u0370-\u03ff]/g, '');
  const aliases = SEARCH_TITLE_ALIASES[norm] || [];
  const out = new Set<string>([clean, ...aliases]);
  return [...out];
}

/** True when a pick is safe to show guests (DB-curated or resolvable on Google Maps). */
export function isPickVerified(item: Record<string, unknown>): boolean {
  if (item.source === 'database') return true;
  if (item.isProperty === true || item.source === 'property') return true;

  const placeId =
    bareGooglePlaceId(item.googlePlaceId as string | undefined) ||
    extractPlaceIdFromMapsUrl(item.googleMapsUrl as string | undefined);
  if (!placeId) return false;

  const mapsUrl = typeof item.googleMapsUrl === 'string' ? item.googleMapsUrl : '';
  if (mapsUrl && isBrokenPlaceMapsUrl(mapsUrl)) return false;

  const lat = item.latitude ?? item.lat;
  const lng = item.longitude ?? item.lng;
  const hasCoords =
    typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng);

  const hasPhoto = typeof item.photoUrl === 'string' && item.photoUrl.trim().length > 0;
  const hasDirectMap = isDirectPlaceMapsUrl(mapsUrl);

  if (hasCoords && (hasPhoto || hasDirectMap || placeId)) return true;
  if (placeId && hasDirectMap) return true;

  return false;
}

export function filterUnverifiedFromPicksPlan(plan: Record<string, unknown> | null | undefined) {
  if (!plan || plan.type !== 'picks' || !Array.isArray(plan.categories)) return plan;

  const categories = (plan.categories as Array<Record<string, unknown>>).map((cat) => {
    const items = ((cat.items as Record<string, unknown>[]) || []).filter(
      (item) => isPickVerified(item)
    );
    return { ...cat, items };
  });

  return { ...plan, categories };
}
