import { isGooglePlacesPhotoUrl, mirrorPlacePhotoUrl } from './placePhotoResolver';

export function isEphemeralPhotoUrl(url: unknown): boolean {
  return typeof url === 'string' && url.trim().startsWith('blob:');
}

/** Extract ChIJ… place id from a Places API (New) photo media URL. */
export function extractGooglePlaceIdFromPhotoUrl(url: string): string | null {
  const match = url.match(/\/places\/(ChIJ[A-Za-z0-9_-]+)\/photos\//i);
  return match?.[1] || null;
}

export type PersistablePhotoContext = {
  country?: string;
  areaId?: string;
  docId?: string;
  googlePlaceId?: string | null;
  propertyId?: string;
  propertyTypeId?: string;
  propertyGemId?: string;
};

/**
 * Replace metered / browser-blocked Google photo URLs with a Firebase Storage download URL.
 * Returns empty string for blob previews or missing URLs.
 */
export async function ensurePersistablePhotoUrl(
  photoUrl: string | undefined | null,
  ctx: PersistablePhotoContext = {}
): Promise<string> {
  const trimmed = String(photoUrl || '').trim();
  if (!trimmed || isEphemeralPhotoUrl(trimmed)) return '';
  if (!isGooglePlacesPhotoUrl(trimmed)) return trimmed;

  const googlePlaceId = ctx.googlePlaceId || extractGooglePlaceIdFromPhotoUrl(trimmed);
  const mirrored = await mirrorPlacePhotoUrl({
    photoUrl: trimmed,
    country: ctx.country,
    areaId: ctx.areaId,
    docId: ctx.docId,
    googlePlaceId,
    propertyId: ctx.propertyId,
    propertyTypeId: ctx.propertyTypeId,
    propertyGemId: ctx.propertyGemId,
  });

  if (!mirrored || isGooglePlacesPhotoUrl(mirrored)) {
    throw new Error(
      'Could not store this Google photo. Upload a custom image or try Magic Fill again.'
    );
  }

  return mirrored;
}
