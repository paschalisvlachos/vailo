import { getFunctions, httpsCallable } from 'firebase/functions';
import { normalizePlaceName } from './placeNameUtils';

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
}): Promise<ResolvedPlacePhoto> {
  const normalized = normalizePlaceName(params.title);
  const coordSuffix =
    typeof params.latitude === 'number' && typeof params.longitude === 'number'
      ? `@${params.latitude.toFixed(4)},${params.longitude.toFixed(4)}`
      : '';
  const key = `${normalized}::${params.country}::${params.areaId}${coordSuffix}`;
  const exactHit = sessionPhotoCache.get(key);
  if (exactHit) return exactHit;

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
  });

  const data = result.data as ResolvedPlacePhoto;
  sessionPhotoCache.set(key, data);
  return data;
}
