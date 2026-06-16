import { getFunctions, httpsCallable } from 'firebase/functions';
import { normalizePlaceName } from './placeNameUtils';

/** True when the URL is a metered Google Place Photo endpoint. */
export function isGooglePlacesPhotoUrl(url: unknown): boolean {
  if (typeof url !== 'string' || !url.trim()) return false;
  try {
    const parsed = new URL(url.trim());
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();

    if (
      host === 'places.googleapis.com' &&
      path.includes('/photos/') &&
      path.endsWith('/media')
    ) {
      return true;
    }

    if (host.endsWith('.googleusercontent.com') && path.includes('/place-photos/')) {
      return true;
    }

    if (host === 'maps.googleapis.com' && path.startsWith('/maps/api/place/photo')) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

export async function mirrorPlacePhotoUrl(params: {
  photoUrl: string;
  country?: string;
  areaId?: string;
  docId?: string;
  googlePlaceId?: string | null;
}): Promise<string> {
  const trimmed = params.photoUrl.trim();
  if (!trimmed || !isGooglePlacesPhotoUrl(trimmed)) return trimmed;

  const functions = getFunctions();
  const callable = httpsCallable(functions, 'mirrorPlacePhoto');
  const result = await callable({
    photoUrl: trimmed,
    country: params.country,
    areaId: params.areaId,
    docId: params.docId,
    googlePlaceId: params.googlePlaceId || undefined,
  });
  const data = result.data as { photoUrl?: string | null };
  return typeof data.photoUrl === 'string' && data.photoUrl.trim() ? data.photoUrl.trim() : trimmed;
}

export type ResolvedPlacePhoto = {
  photoUrl: string | null;
  googleMapsUrl?: string | null;
  googlePlaceId?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  placeName?: string | null;
  discoveredPlaceId?: string | null;
  fromDiscoveredDb?: boolean;
  fromCache?: boolean;
  notFound?: boolean;
  /** Set by cloud function when a live Google Places call was billed. */
  googleApiBilled?: boolean;
  /** Where the match came from (e.g. discovered_place, google). */
  resolveOrigin?: string;
  localSource?: string;
};

const sessionPhotoCache = new Map<string, ResolvedPlacePhoto>();

export async function resolvePlacePhoto(params: {
  title: string;
  area: string;
  country: string;
  areaId: string;
  latitude?: number;
  longitude?: number;
  anchorLat?: number;
  anchorLng?: number;
  maxKm?: number;
  knowledgeMode?: 'areas' | 'business' | 'any';
}): Promise<ResolvedPlacePhoto> {
  const normalized = normalizePlaceName(params.title);
  const coordSuffix =
    typeof params.latitude === 'number' && typeof params.longitude === 'number'
      ? `@${params.latitude.toFixed(4)},${params.longitude.toFixed(4)}`
      : '';
  const key = `${normalized}::${params.country}::${params.areaId}${coordSuffix}`;
  const exactHit = sessionPhotoCache.get(key);
  if (exactHit && !isGooglePlacesPhotoUrl(exactHit.photoUrl)) return exactHit;

  const functions = getFunctions();
  const callable = httpsCallable(functions, 'resolvePlacePhoto');
  const result = await callable({
    title: params.title,
    area: params.area,
    country: params.country,
    areaId: params.areaId,
    latitude: params.latitude,
    longitude: params.longitude,
    anchorLat: params.anchorLat,
    anchorLng: params.anchorLng,
    maxKm: params.maxKm,
    knowledgeMode: params.knowledgeMode || 'any',
  });

  const data = result.data as ResolvedPlacePhoto;
  sessionPhotoCache.set(key, data);
  return data;
}
