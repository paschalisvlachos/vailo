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

export function buildPreciseMapUrls(lat: number, lng: number) {
  const coordQuery = `${lat},${lng}`;
  return {
    googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(coordQuery)}`,
    navigateUrl: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(coordQuery)}`,
  };
}

export function getItemMapLinks(item: {
  title?: string;
  googleMapsUrl?: string;
  latitude?: number;
  longitude?: number;
  lat?: number;
  lng?: number;
  navigateUrl?: string;
}, areaHint: string) {
  const lat = item.latitude ?? item.lat;
  const lng = item.longitude ?? item.lng;
  if (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng)) {
    return { ...buildPreciseMapUrls(lat, lng), resolved: true };
  }

  if (item.navigateUrl && item.googleMapsUrl) {
    return { googleMapsUrl: item.googleMapsUrl, navigateUrl: item.navigateUrl, resolved: true };
  }

  if (item.googleMapsUrl?.includes('google.com/maps')) {
    const coordMatch = item.googleMapsUrl.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
    if (coordMatch) {
      return buildPreciseMapUrls(parseFloat(coordMatch[1]), parseFloat(coordMatch[2]));
    }
    if (item.googleMapsUrl.includes('/place/') || item.googleMapsUrl.includes('query=')) {
      return {
        googleMapsUrl: item.googleMapsUrl,
        navigateUrl: item.googleMapsUrl.replace('/place/', '/dir/') || item.googleMapsUrl,
        resolved: true,
      };
    }
  }

  const q = item.title ? `${item.title}, ${areaHint}` : areaHint;
  const encoded = encodeURIComponent(q);
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

function planItemsNeedingCoords(item: any): boolean {
  if (item.source === 'database' && item.googleMapsUrl?.includes('google.com/maps')) return false;
  const lat = item.latitude ?? item.lat;
  const lng = item.longitude ?? item.lng;
  if (typeof lat === 'number' && typeof lng === 'number') return false;
  if (item.googleMapsUrl?.match(/query=-?\d+\.?\d*,-?\d+\.?\d*/)) return false;
  if (item.googleMapsUrl?.includes('/place/')) return false;
  return !!item.title?.trim();
}

async function enrichItem(item: any, areaHint: string, anchorCoords: { lat: number; lng: number } | null) {
  if (!planItemsNeedingCoords(item)) return item;

  const resolved = await resolvePlaceOnMap(item.title, areaHint, anchorCoords);
  if (!resolved) {
    const links = getItemMapLinks(item, areaHint);
    return { ...item, googleMapsUrl: links.googleMapsUrl, navigateUrl: links.navigateUrl };
  }

  const links = buildPreciseMapUrls(resolved.lat, resolved.lng);
  return {
    ...item,
    latitude: resolved.lat,
    longitude: resolved.lng,
    googleMapsUrl: links.googleMapsUrl,
    navigateUrl: links.navigateUrl,
    mapPlaceName: shortLabel(resolved.displayName, 2),
  };
}

export async function enrichPlanWithMapLinks(
  planData: any,
  areaHint: string,
  anchorCoords: { lat: number; lng: number } | null
): Promise<any> {
  if (!planData) return planData;

  if (planData.type === 'timeline' && Array.isArray(planData.plan)) {
    const plan = [];
    for (const item of planData.plan) {
      plan.push(await enrichItem(item, areaHint, anchorCoords));
    }
    return { ...planData, plan };
  }

  if (planData.type === 'picks' && Array.isArray(planData.categories)) {
    const categories = [];
    for (const cat of planData.categories) {
      const items = [];
      for (const item of cat.items || []) {
        items.push(await enrichItem(item, areaHint, anchorCoords));
      }
      categories.push({ ...cat, items });
    }
    return { ...planData, categories };
  }

  return planData;
}
