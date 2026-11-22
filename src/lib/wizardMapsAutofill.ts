import { getFunctions, httpsCallable } from 'firebase/functions';
import { resolveGooglePlaceIdFromDetails } from './geocoding';
import { ensurePersistablePhotoUrl } from './adminPhotoUrl';
import { httpsCallableMessage } from './callableError';
import { PLACES_USAGE_CALLER } from './placesApiUsageCallers';
import {
  normalizeWizardReferenceUrls,
  referenceUrlRowsWithTrailingBlank,
  type WizardListingDraft,
} from './wizardListingOnboarding';

function slugFromName(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

function samePlaceName(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function coordsFromMapsUrl(url: string): { lat: number; lng: number } | null {
  const raw = String(url || '').trim();
  if (!raw) return null;
  const match =
    raw.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) ||
    raw.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/) ||
    raw.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
}

function asFiniteCoord(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** "Regional Unit of Chania" / "Chania Regional Unit" / "Municipality of Apokoronas" → short name. */
function normalizeAdminPlaceName(name: string) {
  const n = String(name || '').trim();
  if (!n) return '';
  const prefixed = n.match(
    /^(?:regional\s+unit\s+of|municipality\s+of|municipal\s+unit\s+of|prefecture\s+of|province\s+of|district\s+of)\s+(.+)$/i
  );
  if (prefixed?.[1]) return prefixed[1].trim();
  const suffixed = n.match(
    /^(.+?)\s+(?:regional\s+unit|municipality|municipal\s+unit|prefecture|province)$/i
  );
  if (suffixed?.[1]) return suffixed[1].trim();
  return n;
}

/**
 * Nominatim reverse-geocode to fix village→City mistakes
 * (e.g. Neo Chorio as city instead of Chania + Neo Chorio as area).
 */
async function refineCityAreaFromCoords(input: {
  latitude?: number | string | null;
  longitude?: number | string | null;
  city: string;
  area: string;
  country: string;
  addressLine: string;
  postCode?: string;
}): Promise<{ city: string; area: string; addressLine: string }> {
  const lat = Number(input.latitude);
  const lng = Number(input.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { city: input.city, area: input.area, addressLine: input.addressLine };
  }

  try {
    // zoom=16 keeps village precision; zoom=14 often snaps to a neighboring hamlet.
    const url =
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}` +
      `&zoom=16&addressdetails=1`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    let res: Response;
    try {
      res = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'Accept-Language': 'en',
          'User-Agent': 'VailoAdmin/1.0 (contact: support@vailo.app)',
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!res.ok) {
      return { city: input.city, area: input.area, addressLine: input.addressLine };
    }
    const data = (await res.json()) as {
      address?: Record<string, string>;
    };
    const addr = data.address || {};
    const village = normalizeAdminPlaceName(
      addr.village || addr.hamlet || addr.suburb || addr.neighbourhood || addr.quarter || ''
    );
    // Prefer regional unit (Chania) over municipality (Apokoronas) for City / Master Area.
    const regionalUnit = normalizeAdminPlaceName(addr.county || '');
    const municipality = normalizeAdminPlaceName(
      addr.city || addr.municipality || addr.town || ''
    );
    const cityCandidate = String(regionalUnit || municipality || '').trim();
    const areaCandidate = String(village || '').trim();

    let city = input.city.trim();
    let area = input.area.trim();

    // If Google put the village in City, move it to Area and use regional unit as City.
    if (cityCandidate && areaCandidate && !samePlaceName(cityCandidate, areaCandidate)) {
      if (!city || samePlaceName(city, areaCandidate) || samePlaceName(city, municipality)) {
        city = cityCandidate;
      }
      if (!area || samePlaceName(area, cityCandidate) || samePlaceName(area, municipality)) {
        area = areaCandidate;
      }
      if (samePlaceName(city, areaCandidate) && !samePlaceName(cityCandidate, areaCandidate)) {
        city = cityCandidate;
        area = areaCandidate;
      }
    } else if (cityCandidate && (!city || samePlaceName(city, municipality))) {
      city = cityCandidate;
    } else if (areaCandidate && !area && city && !samePlaceName(areaCandidate, city)) {
      area = areaCandidate;
    }

    // Street cleanup: strip country/city only. Keep village + postcode when Google has no route
    // (rural listings often are just "Neo Chorio 730 03").
    let addressLine = input.addressLine.trim();
    const stripOnly = [city, input.country].filter(Boolean);
    if (addressLine) {
      let cleaned = addressLine;
      for (const part of stripOnly) {
        cleaned = cleaned.replace(
          new RegExp(`(,\\s*)?${part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'ig'),
          ''
        );
      }
      cleaned = cleaned.replace(/^[\s,]+|[\s,]+$/g, '').trim();
      if (cleaned && /[A-Za-zΑ-Ωα-ω]/.test(cleaned)) {
        addressLine = cleaned;
      } else {
        const rural = [area || areaCandidate, input.postCode || addr.postcode]
          .filter(Boolean)
          .join(' ')
          .trim();
        addressLine = rural || addressLine;
      }
    } else {
      const rural = [area || areaCandidate, input.postCode || addr.postcode]
        .filter(Boolean)
        .join(' ')
        .trim();
      if (rural) addressLine = rural;
    }

    return { city: city || input.city, area: area || input.area, addressLine };
  } catch {
    return { city: input.city, area: input.area, addressLine: input.addressLine };
  }
}

export type WizardMapsAutofillResult = {
  draft: WizardListingDraft;
  photoUrl?: string;
  listingName: string;
  warning?: string;
};

/**
 * Resolve a Google Maps place link into listing draft fields
 * (name, slug, address, photo, coordinates).
 */
export async function autofillListingFromGoogleMaps(
  draft: WizardListingDraft,
  options?: { keepManualSlug?: boolean }
): Promise<WizardMapsAutofillResult> {
  const url = draft.googleMapsUrl.trim();
  if (!url) {
    throw new Error('Paste a Google Maps, maps.app.goo.gl, or share.google link first.');
  }

  let placeNameFallback = '';
  const nameMatch = url.match(/\/place\/([^/?@]+)/);
  if (nameMatch?.[1]) {
    placeNameFallback = decodeURIComponent(nameMatch[1].replace(/\+/g, ' '));
  }

  try {
    const getGooglePlaceDetails = httpsCallable(getFunctions(), 'getGooglePlaceDetails', {
      timeout: 120000,
    });
    const result = await getGooglePlaceDetails({
      searchQuery: url,
      fallbackName: placeNameFallback,
      area: draft.city || draft.area || draft.country || '',
      usageCaller: PLACES_USAGE_CALLER.propertyTypes,
    });
    const googleData = result.data as {
      name?: string;
      rating?: number;
      googlePlaceId?: string;
      latitude?: number;
      longitude?: number;
      websiteUri?: string;
      photoUrl?: string;
      googleMapsUrl?: string;
      addressLine?: string;
      area?: string;
      city?: string;
      postCode?: string;
      country?: string;
    };

    let mirroredPhotoUrl = googleData.photoUrl;
    let warning: string | undefined;
    if (mirroredPhotoUrl) {
      try {
        mirroredPhotoUrl = await ensurePersistablePhotoUrl(mirroredPhotoUrl, {
          googlePlaceId: googleData.googlePlaceId,
        });
      } catch {
        mirroredPhotoUrl = undefined;
        warning = 'Details loaded, but the Google photo could not be stored. Upload one later.';
      }
    }

    const mapsUrlForHints = String(googleData.googleMapsUrl || url);
    const nameFromMapsUrl = (() => {
      const match = mapsUrlForHints.match(/\/place\/([^/?@]+)/i);
      if (!match?.[1]) return '';
      try {
        return decodeURIComponent(match[1].replace(/\+/g, ' ')).trim();
      } catch {
        return match[1].replace(/\+/g, ' ').trim();
      }
    })();

    const listingName = String(
      googleData.name || placeNameFallback || nameFromMapsUrl || ''
    ).trim();
    const existingRefs = normalizeWizardReferenceUrls(draft.referenceUrls);
    const website = String(googleData.websiteUri || '').trim();
    const nextRefs =
      website && !existingRefs.includes(website) ? [...existingRefs, website] : existingRefs;

    const urlCoords =
      coordsFromMapsUrl(mapsUrlForHints) || coordsFromMapsUrl(url);
    const resolvedLat = asFiniteCoord(googleData.latitude) ?? urlCoords?.lat ?? null;
    const resolvedLng = asFiniteCoord(googleData.longitude) ?? urlCoords?.lng ?? null;

    let refined = {
      city: String(googleData.city || '').trim() || draft.city,
      area: String(googleData.area || '').trim() || draft.area,
      addressLine: String(googleData.addressLine || '').trim() || draft.addressLine,
    };
    try {
      refined = await refineCityAreaFromCoords({
        latitude: resolvedLat,
        longitude: resolvedLng,
        city: refined.city,
        area: refined.area,
        country: googleData.country || draft.country,
        addressLine: refined.addressLine,
        postCode: googleData.postCode || draft.postCode,
      });
    } catch {
      /* city/area refine is best-effort — never fail Auto-fill because of it */
    }

    const next: WizardListingDraft = {
      ...draft,
      propertyTypeName: listingName || draft.propertyTypeName,
      urlSlug:
        !options?.keepManualSlug && listingName ? slugFromName(listingName) : draft.urlSlug,
      // Prefer Places coords, then URL @lat,lng — never keep a stale geolocation pin.
      latitude: resolvedLat != null ? String(resolvedLat) : draft.latitude,
      longitude: resolvedLng != null ? String(resolvedLng) : draft.longitude,
      googleMapsUrl: googleData.googleMapsUrl || url,
      googleRating: googleData.rating != null ? String(googleData.rating) : draft.googleRating,
      googlePlaceId:
        resolveGooglePlaceIdFromDetails(
          { googlePlaceId: googleData.googlePlaceId, googleMapsUrl: googleData.googleMapsUrl },
          url
        ) || draft.googlePlaceId,
      referenceUrls: referenceUrlRowsWithTrailingBlank(nextRefs),
      addressLine: refined.addressLine,
      area: refined.area,
      city: refined.city,
      postCode: googleData.postCode || draft.postCode,
      country: googleData.country || draft.country,
      photoUrl: mirroredPhotoUrl || draft.photoUrl,
    };

    return { draft: next, photoUrl: mirroredPhotoUrl, listingName, warning };
  } catch (error) {
    const coordMatch =
      url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) || url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
    if (coordMatch) {
      const partial: WizardListingDraft = {
        ...draft,
        latitude: coordMatch[1]!,
        longitude: coordMatch[2]!,
      };
      const err = new Error(
        'This link gave coordinates only — name and address were not found. Fill the address fields manually, or try a full google.com/maps/place/… URL.'
      );
      (err as Error & { partialDraft?: WizardListingDraft }).partialDraft = partial;
      throw err;
    }

    const serverMessage = httpsCallableMessage(
      error,
      'Could not read this Maps link. Use a google.com/maps/place/…, maps.app.goo.gl, or share.google link — then click Auto-fill again.'
    );
    const message =
      /cid=|\/maps\/place\//i.test(serverMessage) || url.includes('cid=')
        ? serverMessage.includes('/maps/place/')
          ? serverMessage
          : 'This Maps link is a short cid= share link. Open it in your browser, wait for the place page, copy the address-bar URL (should contain /maps/place/), paste it here, then Auto-fill again.'
        : serverMessage;
    throw new Error(message);
  }
}
