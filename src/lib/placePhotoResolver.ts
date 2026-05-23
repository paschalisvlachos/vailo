import { getFunctions, httpsCallable } from 'firebase/functions';
import { normalizePlaceName, namesLikelySame } from './placeNameUtils';

export type ResolvedPlacePhoto = {
  photoUrl: string | null;
  googleMapsUrl?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  discoveredPlaceId?: string | null;
  fromDiscoveredDb?: boolean;
  fromCache?: boolean;
  notFound?: boolean;
};

const sessionPhotoCache = new Map<string, ResolvedPlacePhoto>();

function findFuzzySessionHit(title: string): ResolvedPlacePhoto | undefined {
  const normalized = normalizePlaceName(title);
  for (const [key, value] of sessionPhotoCache) {
    const keyNorm = key.split('::')[0];
    if (namesLikelySame(normalized, keyNorm)) return value;
  }
  return undefined;
}

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
  const fuzzyHit = findFuzzySessionHit(params.title);
  if (fuzzyHit) return fuzzyHit;

  const key = `${normalized}::${params.country}::${params.areaId}`;
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
  sessionPhotoCache.set(`${normalized}::${params.country}::${params.areaId}`, data);
  return data;
}
