import { collection, getDocs } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  ALL_ESSENTIAL_SLOTS,
  type AreaLocalGemOption,
  type EssentialPlaceProposal,
  type EssentialSlotDef,
} from './addPropertyEssentials';
import { parseGemCoord } from './areaLocalGemsMap';
import { ensureAreaDocument } from './ensureAreaDocument';
import { db } from './firebase';
import { PLACES_USAGE_CALLER } from './placesApiUsageCallers';
import { httpsCallableMessage } from './callableError';

function asNumber(value: unknown): number | null {
  return parseGemCoord(value);
}

export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

function coordsFromMapsUrl(url: string): { lat: number; lng: number } | null {
  const raw = String(url || '').trim();
  if (!raw) return null;
  const match =
    raw.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) ||
    raw.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/) ||
    raw.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (!match) return null;
  const lat = parseGemCoord(match[1]);
  const lng = parseGemCoord(match[2]);
  if (lat == null || lng == null || (lat === 0 && lng === 0)) return null;
  return { lat, lng };
}

/** Distance from property pin → gem (meters), or null if either side lacks coords. */
export function distanceMetersFromProperty(
  propertyLat: number | null | undefined,
  propertyLng: number | null | undefined,
  gem: Pick<AreaLocalGemOption, 'latitude' | 'longitude' | 'googleMapsUrl'>
): number | null {
  const originLat = parseGemCoord(propertyLat);
  const originLng = parseGemCoord(propertyLng);
  if (originLat == null || originLng == null) return null;

  let gemLat = parseGemCoord(gem.latitude);
  let gemLng = parseGemCoord(gem.longitude);
  if (gemLat == null || gemLng == null) {
    const fromUrl = coordsFromMapsUrl(gem.googleMapsUrl || '');
    gemLat = fromUrl?.lat ?? null;
    gemLng = fromUrl?.lng ?? null;
  }
  if (gemLat == null || gemLng == null) return null;
  return Math.round(haversineMeters(originLat, originLng, gemLat, gemLng));
}

export async function loadAreaLocalGemsForListing(input: {
  country: string;
  city: string;
  latitude?: number | null;
  longitude?: number | null;
}): Promise<{
  areaContext: { country: string; areaId: string; areaName: string };
  gems: AreaLocalGemOption[];
}> {
  const ensured = await ensureAreaDocument({
    country: input.country,
    areaName: input.city,
    lat: input.latitude ?? undefined,
    lng: input.longitude ?? undefined,
  });

  const snap = await getDocs(
    collection(db, 'countries', ensured.country, 'areas', ensured.areaId, 'localGems')
  );

  const gems: AreaLocalGemOption[] = snap.docs.map((docSnap) => {
    const data = docSnap.data() as Record<string, unknown>;
    const categories = Array.isArray(data.categories)
      ? data.categories.map((c) => String(c || '').trim()).filter(Boolean)
      : [];
    const category =
      String(data.category || '').trim() || categories[0] || 'Local gem';
    const googleMapsUrl = String(data.googleMapsUrl || '').trim();
    let latitude = parseGemCoord(data.latitude);
    let longitude = parseGemCoord(data.longitude);
    if (latitude == null || longitude == null) {
      const fromUrl = coordsFromMapsUrl(googleMapsUrl);
      latitude = fromUrl?.lat ?? null;
      longitude = fromUrl?.lng ?? null;
    }
    const distanceMeters = distanceMetersFromProperty(
      input.latitude,
      input.longitude,
      { latitude, longitude, googleMapsUrl }
    );
    return {
      id: docSnap.id,
      name: String(data.name || '').trim() || 'Untitled gem',
      description: String(data.description || '').trim(),
      category,
      categories: categories.length ? categories : category ? [category] : [],
      address: String(data.address || data.formattedAddress || '').trim(),
      photoUrl: String(data.photoUrl || '').trim(),
      googleMapsUrl,
      googlePlaceId: String(data.googlePlaceId || '').trim() || null,
      rating: asNumber(data.rating),
      latitude,
      longitude,
      distanceMeters,
    };
  });

  return {
    areaContext: {
      country: ensured.country,
      areaId: ensured.areaId,
      areaName: ensured.areaName,
    },
    gems,
  };
}

export async function fetchNearestEssentialPlaces(input: {
  latitude: number;
  longitude: number;
  slots?: EssentialSlotDef[];
}): Promise<Record<string, EssentialPlaceProposal[]>> {
  const slots = input.slots || ALL_ESSENTIAL_SLOTS;
  const callable = httpsCallable(getFunctions(), 'findNearestEssentialPlaces', {
    timeout: 120000,
  });

  try {
    const result = await callable({
      latitude: input.latitude,
      longitude: input.longitude,
      usageCaller: PLACES_USAGE_CALLER.propertySetupEssentials,
      slots: slots.map((slot) => ({
        id: slot.id,
        label: slot.label,
        section: slot.section,
        includedTypes: slot.includedTypes,
        textQueries: slot.textQueries || [],
        textQuery: '',
        requireNameIncludes: slot.requireNameIncludes || [],
        excludeNameIncludes: slot.excludeNameIncludes || [],
        minUserRatings: slot.minUserRatings || 0,
        radiusMeters: slot.radiusMeters,
        maxResults: slot.maxResults,
        rankPreference: slot.rankPreference || 'DISTANCE',
      })),
    });

    const data = result.data as {
      results?: Array<{
        slotId?: string;
        label?: string;
        section?: string;
        found?: boolean;
        places?: Array<{
          name?: string;
          address?: string;
          phoneNumber?: string;
          latitude?: number | null;
          longitude?: number | null;
          googlePlaceId?: string;
          googleMapsUrl?: string;
          photoUrl?: string | null;
          rating?: number | null;
          distanceMeters?: number | null;
          primaryType?: string;
          userRatingCount?: number | null;
        }>;
        /** Legacy single-place shape */
        place?: {
          name?: string;
          address?: string;
          phoneNumber?: string;
          latitude?: number | null;
          longitude?: number | null;
          googlePlaceId?: string;
          googleMapsUrl?: string;
          photoUrl?: string | null;
          rating?: number | null;
          distanceMeters?: number | null;
          primaryType?: string;
        } | null;
      }>;
    };

    const bySlot: Record<string, EssentialPlaceProposal[]> = {};
    for (const slot of slots) bySlot[slot.id] = [];

    for (const row of data.results || []) {
      const slotId = String(row.slotId || '').trim();
      if (!slotId) continue;
      const label = String(row.label || slotId);
      const section = String(row.section || 'useful') as EssentialPlaceProposal['section'];

      const rawPlaces =
        Array.isArray(row.places) && row.places.length
          ? row.places
          : row.place?.name
            ? [row.place]
            : [];

      const places: EssentialPlaceProposal[] = rawPlaces
        .filter((p) => p?.name)
        .map((place) => ({
          slotId,
          label,
          section,
          name: String(place.name || '').trim(),
          address: String(place.address || '').trim(),
          phoneNumber: String(place.phoneNumber || '').trim(),
          latitude: asNumber(place.latitude),
          longitude: asNumber(place.longitude),
          googlePlaceId: String(place.googlePlaceId || '').trim(),
          googleMapsUrl: String(place.googleMapsUrl || '').trim(),
          photoUrl: place.photoUrl ? String(place.photoUrl) : null,
          rating: asNumber(place.rating),
          distanceMeters: asNumber(place.distanceMeters),
          primaryType: String(place.primaryType || '').trim(),
          userRatingCount: asNumber(place.userRatingCount),
        }));

      places.sort((a, b) => (a.distanceMeters ?? 1e12) - (b.distanceMeters ?? 1e12));
      bySlot[slotId] = places;
    }

    return bySlot;
  } catch (error) {
    throw new Error(
      httpsCallableMessage(
        error,
        'Could not find nearby essentials. Check the property pin and try again.'
      )
    );
  }
}

export function formatDistance(meters: number | null | undefined): string {
  if (meters == null || !Number.isFinite(meters)) return '';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(meters >= 10000 ? 0 : 1)} km`;
}
