import { bareGooglePlaceId, extractPlaceIdFromMapsUrl } from './geocoding';

/** Google "write a review" link when place id is known; otherwise open the listing on Maps. */
export function buildGoogleReviewUrl(typeData: {
  googlePlaceId?: string | null;
  googleMapsUrl?: string | null;
  latitude?: string | number | null;
  longitude?: string | number | null;
  propertyTypeName?: string | null;
}): string | null {
  const placeId =
    bareGooglePlaceId(typeData.googlePlaceId) ||
    extractPlaceIdFromMapsUrl(typeData.googleMapsUrl);
  if (placeId) {
    return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`;
  }

  const mapsUrl = typeData.googleMapsUrl?.trim();
  if (mapsUrl) return mapsUrl;

  const lat = parseFloat(String(typeData.latitude ?? ''));
  const lng = parseFloat(String(typeData.longitude ?? ''));
  if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
    const q = typeData.propertyTypeName?.trim() || `${lat},${lng}`;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}&query_place_id=`;
  }

  return null;
}

export function buildGoogleMapsOpenUrl(
  latitude: string | number,
  longitude: string | number,
  label?: string
): string {
  const coords = `${latitude},${longitude}`;
  const query = label?.trim() ? `${label} ${coords}` : coords;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function buildGoogleDirectionsUrl(latitude: string | number, longitude: string | number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(String(latitude))},${encodeURIComponent(String(longitude))}`;
}
