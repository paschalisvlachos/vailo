/** Free geocoding helpers (OpenStreetMap Nominatim). Respect 1 req/sec usage policy. */

import type { GuestLocale } from './guestLocale';
import { guestUiTFormat, type GuestLocaleUiKey } from './guestLocaleUi';
import { resolvePlacePhoto, type ResolvedPlacePhoto } from './placePhotoResolver';
import { sanitizePlaceSearchTitle } from './placeNameUtils';

const NOMINATIM_HEADERS = {
  'Accept-Language': 'en',
  'User-Agent': 'VailoGuestConcierge/1.0 (contact: support@vailo.app)',
};

let lastNominatimAt = 0;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function nominatimFetch(url: string): Promise<any[]> {
  const elapsed = Date.now() - lastNominatimAt;
  if (elapsed < 1100) await sleep(1100 - elapsed);
  lastNominatimAt = Date.now();

  const res = await fetch(url, { headers: NOMINATIM_HEADERS });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

const COUNTRY_CODES: Record<string, string> = {
  greece: 'gr',
  cyprus: 'cy',
  italy: 'it',
  spain: 'es',
  france: 'fr',
  portugal: 'pt',
  turkey: 'tr',
  croatia: 'hr',
};

export function countryToIsoCode(country: string): string | undefined {
  if (!country?.trim()) return undefined;
  const key = country.trim().toLowerCase();
  if (key.length === 2) return key;
  return COUNTRY_CODES[key];
}

export function buildViewbox(coords: { lat: number; lng: number }, radiusKm: number): string {
  const latDelta = radiusKm / 111;
  const lngDelta = radiusKm / (111 * Math.cos((coords.lat * Math.PI) / 180));
  const left = coords.lng - lngDelta;
  const right = coords.lng + lngDelta;
  const top = coords.lat + latDelta;
  const bottom = coords.lat - latDelta;
  return `${left},${top},${right},${bottom}`;
}

export function locationSpellingVariants(input: string): string[] {
  const variants = new Set<string>();
  const base = input.trim();
  if (!base) return [];

  const add = (s: string) => {
    const t = s.trim();
    if (t) variants.add(t);
  };

  add(base);
  add(base.replace(/palaio/gi, 'paleo'));
  add(base.replace(/paleo/gi, 'palaio'));
  if (/palaiochora/i.test(base)) add(base.replace(/palaiochora/gi, 'Paleochora'));
  if (/paleochora/i.test(base)) add(base.replace(/paleochora/gi, 'Palaiochora'));

  return [...variants];
}

export type GeocodedPlace = {
  lat: number;
  lng: number;
  displayName: string;
  label: string;
  distanceFromPropertyKm?: number;
};

type NominatimHit = {
  lat: string;
  lon: string;
  display_name: string;
  importance?: number;
};

function shortLabel(displayName: string, maxParts = 3): string {
  return displayName.split(',').slice(0, maxParts).join(',').trim();
}

function dedupeKey(lat: number, lng: number): string {
  return `${lat.toFixed(3)},${lng.toFixed(3)}`;
}

async function searchNominatim(
  query: string,
  opts: { limit?: number; viewbox?: string; bounded?: boolean; countrycodes?: string }
): Promise<NominatimHit[]> {
  const params = new URLSearchParams({
    format: 'json',
    q: query,
    limit: String(opts.limit ?? 5),
    addressdetails: '1',
  });
  if (opts.viewbox) {
    params.set('viewbox', opts.viewbox);
    params.set('bounded', opts.bounded ? '1' : '0');
  }
  if (opts.countrycodes) params.set('countrycodes', opts.countrycodes);

  return nominatimFetch(`https://nominatim.openstreetmap.org/search?${params}`);
}

export async function collectLocationCandidates(
  userInput: string,
  context: {
    propCoords: { lat: number; lng: number } | null;
    country: string;
    cityArea: string;
  }
): Promise<GeocodedPlace[]> {
  const { propCoords, country, cityArea } = context;
  const countrycodes = countryToIsoCode(country);
  const viewbox = propCoords ? buildViewbox(propCoords, 160) : undefined;
  const seen = new Map<string, GeocodedPlace>();

  const queries: string[] = [];
  for (const variant of locationSpellingVariants(userInput)) {
    if (cityArea) queries.push(`${variant}, ${cityArea}, ${country}`.replace(/,\s*,/g, ',').trim());
    if (country) queries.push(`${variant}, ${country}`);
    queries.push(variant);
  }

  const uniqueQueries = [...new Set(queries)].slice(0, 8);

  for (const q of uniqueQueries) {
    const hits = await searchNominatim(q, {
      limit: 5,
      viewbox,
      bounded: !!viewbox,
      countrycodes,
    });

    for (const hit of hits) {
      const lat = parseFloat(hit.lat);
      const lng = parseFloat(hit.lon);
      if (isNaN(lat) || isNaN(lng)) continue;

      const key = dedupeKey(lat, lng);
      if (seen.has(key)) continue;

      let distanceFromPropertyKm: number | undefined;
      if (propCoords) {
        distanceFromPropertyKm = haversineKm(propCoords.lat, propCoords.lng, lat, lng) * 1.35;
      }

      seen.set(key, {
        lat,
        lng,
        displayName: hit.display_name,
        label: shortLabel(hit.display_name),
        distanceFromPropertyKm,
      });
    }
  }

  // Wider search if bounded search found nothing near the property
  if (propCoords && [...seen.values()].every((p) => (p.distanceFromPropertyKm ?? 9999) > 150)) {
    for (const variant of locationSpellingVariants(userInput).slice(0, 3)) {
      const regionalQ = cityArea ? `${variant}, ${cityArea}` : variant;
      const hits = await searchNominatim(regionalQ, {
        limit: 5,
        countrycodes,
      });
      for (const hit of hits) {
        const lat = parseFloat(hit.lat);
        const lng = parseFloat(hit.lon);
        if (isNaN(lat) || isNaN(lng)) continue;
        const key = dedupeKey(lat, lng);
        if (seen.has(key)) continue;
        seen.set(key, {
          lat,
          lng,
          displayName: hit.display_name,
          label: shortLabel(hit.display_name),
          distanceFromPropertyKm: haversineKm(propCoords.lat, propCoords.lng, lat, lng) * 1.35,
        });
      }
    }
  }

  const all = [...seen.values()];
  if (propCoords) {
    return all.sort(
      (a, b) => (a.distanceFromPropertyKm ?? 9999) - (b.distanceFromPropertyKm ?? 9999)
    );
  }
  return all;
}

export type LocationResolveResult =
  | { type: 'single'; place: GeocodedPlace }
  | { type: 'choose'; candidates: GeocodedPlace[]; message: string }
  | { type: 'not_found'; message: string };

const MAX_DAY_TRIP_KM = 120;

export async function resolveCustomLocation(
  userInput: string,
  context: {
    propCoords: { lat: number; lng: number } | null;
    country: string;
    cityArea: string;
  },
  locale: GuestLocale = 'en'
): Promise<LocationResolveResult> {
  const tf = (key: GuestLocaleUiKey, vars: Record<string, string | number>) =>
    guestUiTFormat(locale, key, vars);

  const candidates = await collectLocationCandidates(userInput, context);

  if (candidates.length === 0) {
    const hint = context.cityArea
      ? tf('aiExpertGeoHintRegion', { input: userInput, area: context.cityArea })
      : tf('aiExpertGeoHintCountry', { input: userInput, area: '' });
    return {
      type: 'not_found',
      message: tf('aiExpertGeoNotFound', { input: userInput }) + hint,
    };
  }

  const { propCoords, cityArea } = context;

  if (propCoords) {
    const nearProperty = candidates.filter(
      (c) => (c.distanceFromPropertyKm ?? 9999) <= MAX_DAY_TRIP_KM
    );

    if (nearProperty.length === 1) {
      return { type: 'single', place: nearProperty[0] };
    }

    if (nearProperty.length > 1) {
      const top = nearProperty.slice(0, 4);
      const best = top[0];
      const second = top[1];
      if (
        second &&
        (second.distanceFromPropertyKm ?? 0) - (best.distanceFromPropertyKm ?? 0) > 25
      ) {
        return { type: 'single', place: best };
      }
      return {
        type: 'choose',
        candidates: top,
        message: tf('aiExpertGeoSeveralMatches', { input: userInput }),
      };
    }

    const regional = candidates.filter((c) => (c.distanceFromPropertyKm ?? 9999) <= 200);
    if (regional.length > 0) {
      return {
        type: 'choose',
        candidates: regional.slice(0, 4),
        message: tf('aiExpertGeoFarMatch', {
          input: userInput,
          km: Math.round(candidates[0].distanceFromPropertyKm ?? 0),
          area: cityArea || tf('aiExpertTheRegion', {}),
        }),
      };
    }

    const nearHint = cityArea ? tf('aiExpertGeoNearHint', { area: cityArea }) : '';
    return {
      type: 'not_found',
      message: tf('aiExpertGeoTooFarFromProperty', {
        input: userInput,
        km: Math.round(candidates[0].distanceFromPropertyKm ?? 0),
        nearHint,
      }),
    };
  }

  return { type: 'single', place: candidates[0] };
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
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

export function isCoordOnlyQuery(query: string): boolean {
  return /^-?\d+\.?\d*\s*,\s*-?\d+\.?\d*$/.test(query.trim());
}

/** Broken Maps links with no place slug (e.g. /place//@35.41,24.13). */
export function isBrokenPlaceMapsUrl(url?: string): boolean {
  const raw = String(url || '').trim();
  if (!raw) return true;
  if (/\/place\/\/@|\/place\/\/\?|\/place\/\/$/i.test(raw)) return true;
  const slug = raw.match(/\/place\/([^/?@]+)/i)?.[1]?.trim();
  if (raw.includes('/place/') && (!slug || slug === '')) return true;
  return false;
}

/** Opens one exact place/listing — not a text search results page. */
/**
 * True if this Google Maps URL goes straight to a rich place card (photo, reviews,
 * hours). A URL with `query=lat,lng` opens a bare pin — that is NOT a direct place
 * URL and should be rewritten to a name search when we have the place title.
 */
export function isDirectPlaceMapsUrl(url?: string): boolean {
  if (!url?.trim() || isBrokenPlaceMapsUrl(url)) return false;
  if (!url.includes('google') || !url.includes('maps')) return false;
  if (/query_place_id=|destination_place_id=|[?&]place_id=/i.test(url)) return true;
  if (url.includes('/maps/place/') || url.includes('google.com/maps/place')) return true;
  if (/!1s0x|ftid=|[?&]cid=/i.test(url)) return true;

  const qMatch = url.match(/[?&]query=([^&]+)/i);
  if (qMatch) {
    const decoded = decodeURIComponent(qMatch[1].replace(/\+/g, ' '));
    // Coord-only query → bare pin, NOT a direct place. Named query → treat as direct.
    return !isCoordOnlyQuery(decoded);
  }

  return false;
}

/** @deprecated use isDirectPlaceMapsUrl */
export function isRichGoogleMapsUrl(url?: string): boolean {
  return isDirectPlaceMapsUrl(url);
}

/** Normalize Places API id / resource name to bare ChIJ… (or hex cid) for storage & review links. */
export function bareGooglePlaceId(placeId?: string | null): string | null {
  if (!placeId?.trim()) return null;
  const bare = placeId.replace(/^places\//, '').trim();
  if (!bare) return null;
  if (/^ChIJ[\w-]+$/i.test(bare)) return bare;
  if (/^0x[0-9a-f]+:0x[0-9a-f]+$/i.test(bare)) return bare;
  return bare;
}

/** Extract a Google place id from a Maps URL when the API omits it. */
export function extractPlaceIdFromMapsUrl(url?: string | null): string | null {
  const raw = String(url || '').trim();
  if (!raw) return null;

  const queryPlaceId = raw.match(/[?&]query_place_id=([^&]+)/i);
  if (queryPlaceId?.[1]) return bareGooglePlaceId(decodeURIComponent(queryPlaceId[1]));

  const placeIdParam = raw.match(/[?&]place_id=([^&]+)/i);
  if (placeIdParam?.[1]) return bareGooglePlaceId(decodeURIComponent(placeIdParam[1]));

  const dataChij = raw.match(/!1s(ChIJ[\w-]+)/i);
  if (dataChij?.[1]) return dataChij[1];

  const dataHex = raw.match(/!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i);
  if (dataHex?.[1]) return dataHex[1];

  const pathChij = raw.match(/\/place\/(ChIJ[\w-]+)/i);
  if (pathChij?.[1]) return pathChij[1];

  return null;
}

export function resolveGooglePlaceIdFromDetails(
  details: { googlePlaceId?: string | null; googleMapsUrl?: string | null },
  mapsUrlFallback?: string | null
): string | null {
  return (
    bareGooglePlaceId(details.googlePlaceId) ||
    extractPlaceIdFromMapsUrl(details.googleMapsUrl) ||
    extractPlaceIdFromMapsUrl(mapsUrlFallback) ||
    null
  );
}

export function buildPlaceMapUrls(
  googlePlaceId?: string | null,
  lat?: number,
  lng?: number,
  placeName?: string
) {
  const bareId = bareGooglePlaceId(googlePlaceId);
  if (bareId) {
    const label = placeName?.trim() || 'place';
    return {
      googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(label)}&query_place_id=${encodeURIComponent(bareId)}`,
      navigateUrl: `https://www.google.com/maps/dir/?api=1&destination_place_id=${encodeURIComponent(bareId)}`,
    };
  }

  if (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng)) {
    return buildPreciseMapUrls(lat, lng);
  }

  return {
    googleMapsUrl: '',
    navigateUrl: '',
  };
}

export function buildPreciseMapUrls(lat: number, lng: number) {
  const coordQuery = `${lat},${lng}`;
  return {
    googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(coordQuery)}`,
    navigateUrl: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(coordQuery)}`,
  };
}

/** iframe embed — prefer place listing (name / place id) over bare coordinates. */
export function buildGoogleMapsEmbedUrl(options: {
  title?: string;
  areaHint?: string;
  latitude?: string | number | null;
  longitude?: string | number | null;
  googlePlaceId?: string | null;
  googleMapsUrl?: string | null;
  zoom?: number;
}): string {
  const zoom = options.zoom ?? 14;
  const lat = parseFloat(String(options.latitude ?? ''));
  const lng = parseFloat(String(options.longitude ?? ''));
  const hasCoords = !Number.isNaN(lat) && !Number.isNaN(lng);
  const title = sanitizePlaceSearchTitle(String(options.title || '').trim());
  const areaHint = String(options.areaHint || '').trim();

  const placeId = resolveGooglePlaceIdFromDetails({
    googlePlaceId: options.googlePlaceId,
    googleMapsUrl: options.googleMapsUrl,
  });

  if (placeId) {
    return `https://www.google.com/maps?q=place_id:${encodeURIComponent(placeId)}&z=${zoom}&output=embed`;
  }

  const storedMapsUrl =
    options.googleMapsUrl?.trim() && !isBrokenPlaceMapsUrl(options.googleMapsUrl)
      ? options.googleMapsUrl.trim()
      : '';

  if (storedMapsUrl && isDirectPlaceMapsUrl(storedMapsUrl)) {
    const fromUrl = extractPlaceIdFromMapsUrl(storedMapsUrl);
    if (fromUrl) {
      return `https://www.google.com/maps?q=place_id:${encodeURIComponent(fromUrl)}&z=${zoom}&output=embed`;
    }
    const pathName = storedMapsUrl.match(/\/place\/([^/?#]+)/)?.[1];
    if (pathName) {
      const label = decodeURIComponent(pathName.replace(/\+/g, ' '));
      const q = encodeURIComponent(label);
      const ll = hasCoords ? `&ll=${lat},${lng}` : '';
      return `https://maps.google.com/maps?q=${q}${ll}&z=${zoom}&output=embed`;
    }
  }

  if (title && hasCoords) {
    const q = encodeURIComponent(areaHint ? `${title}, ${areaHint}` : title);
    return `https://maps.google.com/maps?q=${q}&ll=${lat},${lng}&z=${zoom}&output=embed`;
  }

  if (title) {
    const q = encodeURIComponent(areaHint ? `${title}, ${areaHint}` : title);
    return `https://maps.google.com/maps?q=${q}&z=${zoom}&output=embed`;
  }

  if (hasCoords) {
    return `https://maps.google.com/maps?q=${lat},${lng}&z=${zoom}&output=embed`;
  }

  return `https://maps.google.com/maps?q=${encodeURIComponent(areaHint || 'Greece')}&z=${zoom}&output=embed`;
}

function buildNavigateFromMapsUrl(
  googleMapsUrl: string,
  googlePlaceId?: string | null,
  lat?: number,
  lng?: number
): string {
  const fromUrl = googleMapsUrl.match(/[?&](?:query_place_id|destination_place_id)=([^&]+)/i);
  if (fromUrl) {
    return `https://www.google.com/maps/dir/?api=1&destination_place_id=${fromUrl[1]}`;
  }

  const bareId = bareGooglePlaceId(googlePlaceId);
  if (bareId) {
    return `https://www.google.com/maps/dir/?api=1&destination_place_id=${encodeURIComponent(bareId)}`;
  }

  if (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng)) {
    return buildPreciseMapUrls(lat, lng).navigateUrl;
  }

  return googleMapsUrl;
}

export function isValidExternalUrl(url?: string): boolean {
  if (!url?.trim()) return false;
  try {
    const u = new URL(url.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

const GUEST_EXTERNAL_WINDOW_NAME = 'vailoGuestExternal';

function guestExternalWindowFeatures(): string {
  const w = Math.min(1200, Math.round(window.screen.availWidth * 0.9));
  const h = Math.min(900, Math.round(window.screen.availHeight * 0.85));
  const left = Math.max(0, Math.round((window.screen.availWidth - w) / 2));
  const top = Math.max(0, Math.round((window.screen.availHeight - h) / 2));
  return [
    `width=${w}`,
    `height=${h}`,
    `left=${left}`,
    `top=${top}`,
    'scrollbars=yes',
    'resizable=yes',
    'noopener=yes',
    'noreferrer=yes',
  ].join(',');
}

/** Opens external http(s) links in a dedicated guest popup window (not a new tab). */
export function openExternalUrl(url: string): void {
  if (!isValidExternalUrl(url)) return;
  const opened = window.open(
    url.trim(),
    GUEST_EXTERNAL_WINDOW_NAME,
    guestExternalWindowFeatures()
  );
  if (opened) opened.opener = null;
}

/** Google Maps driving directions from a fixed origin (e.g. the property) to destination coords. */
export function buildDirectionsFromOriginUrl(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number }
): string {
  const o = `${origin.lat},${origin.lng}`;
  const d = `${destination.lat},${destination.lng}`;
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(o)}&destination=${encodeURIComponent(d)}`;
}

export function getItemMapLinks(item: {
  title?: string;
  googleMapsUrl?: string;
  googlePlaceId?: string;
  latitude?: number;
  longitude?: number;
  lat?: number;
  lng?: number;
  navigateUrl?: string;
}, areaHint: string) {
  const title = sanitizePlaceSearchTitle(item.title?.trim() || '');
  const lat = item.latitude ?? item.lat;
  const lng = item.longitude ?? item.lng;
  const hasCoords =
    typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng);

  const storedMapsUrl =
    item.googleMapsUrl && !isBrokenPlaceMapsUrl(item.googleMapsUrl)
      ? item.googleMapsUrl
      : undefined;

  const placeId =
    bareGooglePlaceId(item.googlePlaceId) || extractPlaceIdFromMapsUrl(storedMapsUrl);

  // 1. Best — Google Place ID resolves to the exact business card.
  if (placeId) {
    return { ...buildPlaceMapUrls(placeId, lat, lng, title), resolved: true };
  }

  // 2. Direct /place/ URL — already resolves to a business card. Pass through.
  if (storedMapsUrl && isDirectPlaceMapsUrl(storedMapsUrl)) {
    return {
      googleMapsUrl: storedMapsUrl,
      navigateUrl:
        item.navigateUrl && isDirectPlaceMapsUrl(item.navigateUrl)
          ? item.navigateUrl
          : buildNavigateFromMapsUrl(storedMapsUrl, item.googlePlaceId, lat, lng),
      resolved: true,
    };
  }

  // 3. Have a name + coordinates — search by NAME (rich place card with photos /
  //    reviews) and navigate using COORDS (precise, no name ambiguity). This
  //    avoids the "just a pin with 35°25'31.4N…" UX while staying free.
  if (title && hasCoords) {
    const q = areaHint ? `${title}, ${areaHint}` : title;
    return {
      googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`,
      navigateUrl: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${lat},${lng}`)}`,
      resolved: true,
    };
  }

  // 4. Name only — straight text search.
  if (title) {
    const q = areaHint ? `${title}, ${areaHint}` : title;
    const encoded = encodeURIComponent(q);
    return {
      googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${encoded}`,
      navigateUrl: `https://www.google.com/maps/dir/?api=1&destination=${encoded}`,
      resolved: true,
    };
  }

  // 5. Coords only — last resort. Drops the user on the bare pin.
  if (hasCoords) {
    return { ...buildPreciseMapUrls(lat, lng), resolved: true };
  }

  // 6. Stored URLs (even if not “direct” place URLs).
  if (storedMapsUrl && isValidExternalUrl(storedMapsUrl)) {
    return {
      googleMapsUrl: storedMapsUrl.trim(),
      navigateUrl: isValidExternalUrl(item.navigateUrl)
        ? item.navigateUrl!.trim()
        : buildNavigateFromMapsUrl(storedMapsUrl, undefined, lat, lng),
      resolved: true,
    };
  }

  // 7. Area hint only.
  const encoded = encodeURIComponent(areaHint || '');
  return {
    googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${encoded}`,
    navigateUrl: `https://www.google.com/maps/dir/?api=1&destination=${encoded}`,
    resolved: false,
  };
}

export type MapEnrichmentContext = {
  country: string;
  areaId: string;
  areaName?: string;
};

export function mergeGooglePlaceResolution(
  item: Record<string, unknown>,
  resolved: ResolvedPlacePhoto,
  requestedTitle: string
): Record<string, unknown> {
  if (resolved.notFound) return item;

  const next: Record<string, unknown> = { ...item };
  if (resolved.photoUrl) next.photoUrl = resolved.photoUrl;
  if (resolved.googlePlaceId) next.googlePlaceId = resolved.googlePlaceId;
  if (resolved.latitude != null) next.latitude = resolved.latitude;
  if (resolved.longitude != null) next.longitude = resolved.longitude;

  const links = buildPlaceMapUrls(
    resolved.googlePlaceId,
    resolved.latitude ?? undefined,
    resolved.longitude ?? undefined,
    requestedTitle
  );
  if (resolved.googleMapsUrl && !isBrokenPlaceMapsUrl(resolved.googleMapsUrl)) {
    next.googleMapsUrl = resolved.googleMapsUrl;
  } else if (links.googleMapsUrl) {
    next.googleMapsUrl = links.googleMapsUrl;
  }
  if (links.navigateUrl) next.navigateUrl = links.navigateUrl;

  return next;
}

async function tryResolveViaGoogle(
  item: Record<string, unknown>,
  areaHint: string,
  anchorCoords: { lat: number; lng: number } | null,
  mapCtx: MapEnrichmentContext
): Promise<Record<string, unknown> | null> {
  const title = sanitizePlaceSearchTitle(
    typeof item.title === 'string' ? item.title.trim() : ''
  );
  if (!title) return null;

  try {
    const lat = typeof item.latitude === 'number' ? item.latitude : undefined;
    const lng = typeof item.longitude === 'number' ? item.longitude : undefined;
    const resolved = await resolvePlacePhoto({
      title,
      area: mapCtx.areaName || areaHint,
      country: mapCtx.country,
      areaId: mapCtx.areaId,
      latitude: lat,
      longitude: lng,
      anchorLat: anchorCoords?.lat,
      anchorLng: anchorCoords?.lng,
    });
    if (resolved.notFound || (!resolved.googlePlaceId && !resolved.googleMapsUrl)) {
      return null;
    }
    return mergeGooglePlaceResolution(item, resolved, title);
  } catch (err) {
    console.warn('Google place resolve failed for map link:', title, err);
    return null;
  }
}

function itemHasCuratedMap(item: Record<string, unknown>): boolean {
  const lat = item.latitude ?? item.lat;
  const lng = item.longitude ?? item.lng;
  const hasCoords =
    typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng);

  return !!(
    bareGooglePlaceId(item.googlePlaceId as string | undefined) ||
    isDirectPlaceMapsUrl(item.googleMapsUrl as string | undefined) ||
    (item.source === 'database' && item.googleMapsUrl) ||
    (hasCoords && extractPlaceIdFromMapsUrl(item.googleMapsUrl as string | undefined))
  );
}

async function resolvePlaceOnMap(
  title: string,
  areaHint: string,
  anchorCoords: { lat: number; lng: number } | null
): Promise<{ lat: number; lng: number; displayName: string } | null> {
  const viewbox = anchorCoords ? buildViewbox(anchorCoords, 25) : undefined;
  const queries = [
    `${title}, ${areaHint}`,
    title,
  ];

  for (const q of queries) {
    const hits = await searchNominatim(q, {
      limit: 3,
      viewbox,
      bounded: !!viewbox,
    });
    if (hits.length > 0) {
      const lat = parseFloat(hits[0].lat);
      const lng = parseFloat(hits[0].lon);
      if (!isNaN(lat) && !isNaN(lng)) {
        return { lat, lng, displayName: hits[0].display_name };
      }
    }
  }
  return null;
}

async function enrichItem(
  item: any,
  areaHint: string,
  anchorCoords: { lat: number; lng: number } | null,
  mapCtx?: MapEnrichmentContext
) {
  if (item.isProperty || item.source === 'property') return item;

  if (itemHasCuratedMap(item)) {
    const links = getItemMapLinks(item, areaHint);
    return { ...item, googleMapsUrl: links.googleMapsUrl, navigateUrl: links.navigateUrl };
  }

  const title = typeof item.title === 'string' ? item.title.trim() : '';
  if (mapCtx?.country && mapCtx?.areaId && title) {
    const googleMerged = await tryResolveViaGoogle(item, areaHint, anchorCoords, mapCtx);
    if (googleMerged) {
      const links = getItemMapLinks(googleMerged, areaHint);
      return {
        ...googleMerged,
        googleMapsUrl: links.googleMapsUrl,
        navigateUrl: links.navigateUrl,
      };
    }
  }

  const lat = item.latitude ?? item.lat;
  const lng = item.longitude ?? item.lng;
  const hasCoords = typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng);
  if (hasCoords) {
    const links = getItemMapLinks(item, areaHint);
    return { ...item, googleMapsUrl: links.googleMapsUrl, navigateUrl: links.navigateUrl };
  }

  if (!title) return item;

  const resolved = await resolvePlaceOnMap(title, areaHint, anchorCoords);
  if (!resolved) {
    const links = getItemMapLinks(item, areaHint);
    return { ...item, googleMapsUrl: links.googleMapsUrl, navigateUrl: links.navigateUrl };
  }

  const enriched = {
    ...item,
    latitude: resolved.lat,
    longitude: resolved.lng,
    mapPlaceName: shortLabel(resolved.displayName, 2),
  };
  const links = getItemMapLinks(enriched, areaHint);
  return {
    ...enriched,
    googleMapsUrl: links.googleMapsUrl,
    navigateUrl: links.navigateUrl,
  };
}

async function mapConcurrent<T, R>(
  items: T[],
  worker: (item: T) => Promise<R>,
  concurrency = 5
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  const runWorker = async () => {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await worker(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runWorker));
  return results;
}

export async function enrichPlanWithMapLinks(
  planData: any,
  areaHint: string,
  anchorCoords: { lat: number; lng: number } | null,
  mapCtx?: MapEnrichmentContext
): Promise<any> {
  if (!planData) return planData;

  if (planData.type === 'timeline' && Array.isArray(planData.plan)) {
    const plan = await mapConcurrent(planData.plan, (item) =>
      enrichItem(item, areaHint, anchorCoords, mapCtx)
    );
    return { ...planData, plan };
  }

  if (planData.type === 'picks' && Array.isArray(planData.categories)) {
    const categories = [];
    for (const cat of planData.categories) {
      const items = await mapConcurrent(cat.items || [], (item) =>
        enrichItem(item, areaHint, anchorCoords, mapCtx)
      );
      categories.push({ ...cat, items });
    }
    return { ...planData, categories };
  }

  return planData;
}
