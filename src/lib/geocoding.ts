/** Free geocoding helpers (OpenStreetMap Nominatim). Respect 1 req/sec usage policy. */

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
  }
): Promise<LocationResolveResult> {
  const candidates = await collectLocationCandidates(userInput, context);

  if (candidates.length === 0) {
    const hint = context.cityArea
      ? ` Try adding the region, e.g. "${userInput}, ${context.cityArea}".`
      : ' Try adding the region or country.';
    return {
      type: 'not_found',
      message: `I couldn't find "${userInput}".${hint}`,
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
        message: `I found several places matching "${userInput}" near your area. Which one is your starting point?`,
      };
    }

    const regional = candidates.filter((c) => (c.distanceFromPropertyKm ?? 9999) <= 200);
    if (regional.length > 0) {
      return {
        type: 'choose',
        candidates: regional.slice(0, 4),
        message: `"${userInput}" matched a place far from the property (${Math.round(candidates[0].distanceFromPropertyKm ?? 0)}km away). Did you mean one of these in ${cityArea || 'the region'}?`,
      };
    }

    return {
      type: 'not_found',
      message: `"${userInput}" is too far (${Math.round(candidates[0].distanceFromPropertyKm ?? 0)}km) for a day trip from the property. Please pick a town closer to your stay${cityArea ? ` (near ${cityArea})` : ''}.`,
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

/** Opens one exact place/listing — not a text search results page. */
/**
 * True if this Google Maps URL goes straight to a rich place card (photo, reviews,
 * hours). A URL with `query=lat,lng` opens a bare pin — that is NOT a direct place
 * URL and should be rewritten to a name search when we have the place title.
 */
export function isDirectPlaceMapsUrl(url?: string): boolean {
  if (!url?.trim()) return false;
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
  const title = item.title?.trim();
  const lat = item.latitude ?? item.lat;
  const lng = item.longitude ?? item.lng;
  const hasCoords =
    typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng);

  // 1. Best — Google Place ID resolves to the exact business card.
  if (item.googlePlaceId || bareGooglePlaceId(item.googlePlaceId)) {
    return { ...buildPlaceMapUrls(item.googlePlaceId, lat, lng, title), resolved: true };
  }

  // 2. Direct /place/ URL — already resolves to a business card. Pass through.
  if (isDirectPlaceMapsUrl(item.googleMapsUrl)) {
    return {
      googleMapsUrl: item.googleMapsUrl!,
      navigateUrl:
        item.navigateUrl && isDirectPlaceMapsUrl(item.navigateUrl)
          ? item.navigateUrl
          : buildNavigateFromMapsUrl(item.googleMapsUrl!, item.googlePlaceId, lat, lng),
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

  // 6. Whatever the item brought along.
  if (item.navigateUrl && item.googleMapsUrl) {
    return { googleMapsUrl: item.googleMapsUrl, navigateUrl: item.navigateUrl, resolved: true };
  }

  // 7. Area hint only.
  const encoded = encodeURIComponent(areaHint || '');
  return {
    googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${encoded}`,
    navigateUrl: `https://www.google.com/maps/dir/?api=1&destination=${encoded}`,
    resolved: false,
  };
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

async function enrichItem(item: any, areaHint: string, anchorCoords: { lat: number; lng: number } | null) {
  const lat = item.latitude ?? item.lat;
  const lng = item.longitude ?? item.lng;
  const hasCoords = typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng);
  const hasCuratedMap =
    item.googlePlaceId ||
    isDirectPlaceMapsUrl(item.googleMapsUrl) ||
    (item.source === 'database' && item.googleMapsUrl);

  if (hasCuratedMap || hasCoords) {
    const links = getItemMapLinks(item, areaHint);
    return { ...item, googleMapsUrl: links.googleMapsUrl, navigateUrl: links.navigateUrl };
  }

  const title = item.title?.trim();
  if (!title) return item;

  const resolved = await resolvePlaceOnMap(title, areaHint, anchorCoords);
  if (!resolved) {
    const links = getItemMapLinks(item, areaHint);
    return { ...item, googleMapsUrl: links.googleMapsUrl, navigateUrl: links.navigateUrl };
  }

  // Use name-search for "View" so guests get the rich place card (photo, reviews,
  // hours), coordinate-based "Directions" for precise routing.
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
  anchorCoords: { lat: number; lng: number } | null
): Promise<any> {
  if (!planData) return planData;

  if (planData.type === 'timeline' && Array.isArray(planData.plan)) {
    const plan = await mapConcurrent(planData.plan, (item) =>
      enrichItem(item, areaHint, anchorCoords)
    );
    return { ...planData, plan };
  }

  if (planData.type === 'picks' && Array.isArray(planData.categories)) {
    const categories = [];
    for (const cat of planData.categories) {
      const items = await mapConcurrent(cat.items || [], (item) =>
        enrichItem(item, areaHint, anchorCoords)
      );
      categories.push({ ...cat, items });
    }
    return { ...planData, categories };
  }

  return planData;
}
