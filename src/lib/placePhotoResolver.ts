import { httpsCallable } from 'firebase/functions';
import { cloudFunctions } from './firebase';
import { normalizePlaceName } from './placeNameUtils';
import { getCachedMirrorResult, setCachedMirrorResult } from './photoMirrorCache';

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

export type MirrorPlacePhotoParams = {
  photoUrl: string;
  country?: string;
  areaId?: string;
  docId?: string;
  googlePlaceId?: string | null;
  propertyId?: string;
  propertyTypeId?: string;
  propertyGemId?: string;
};

const inFlightMirrors = new Map<string, Promise<string>>();

/** Mirror once to Firebase Storage; returns empty string on failure (never a Google URL). */
export async function mirrorPlacePhotoUrl(params: MirrorPlacePhotoParams): Promise<string> {
  const trimmed = params.photoUrl.trim();
  if (!trimmed || !isGooglePlacesPhotoUrl(trimmed)) return trimmed;

  const cached = getCachedMirrorResult(trimmed);
  if (cached !== undefined) {
    return cached || '';
  }

  const existing = inFlightMirrors.get(trimmed);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const callable = httpsCallable(cloudFunctions, 'mirrorPlacePhoto');
      const result = await callable({
        photoUrl: trimmed,
        country: params.country,
        areaId: params.areaId,
        docId: params.docId,
        googlePlaceId: params.googlePlaceId || undefined,
        propertyId: params.propertyId,
        propertyTypeId: params.propertyTypeId,
        propertyGemId: params.propertyGemId,
      });
      const data = result.data as { photoUrl?: string | null };
      const mirrored =
        typeof data.photoUrl === 'string' &&
        data.photoUrl.trim() &&
        !isGooglePlacesPhotoUrl(data.photoUrl.trim())
          ? data.photoUrl.trim()
          : '';
      setCachedMirrorResult(trimmed, mirrored || null);
      return mirrored;
    } catch {
      setCachedMirrorResult(trimmed, null);
      return '';
    } finally {
      inFlightMirrors.delete(trimmed);
    }
  })();

  inFlightMirrors.set(trimmed, promise);
  return promise;
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

  const callable = httpsCallable(cloudFunctions, 'resolvePlacePhoto');
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
