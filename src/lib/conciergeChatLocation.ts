import { guestUiTFormat, type GuestLocaleUiKey } from './guestLocaleUi';
import type { GuestLocale } from './guestLocale';
import {
  resolveCustomLocation,
  type GeocodedPlace,
  type GeocodedPlaceKind,
  type LocationResolveResult,
} from './geocoding';
import { effectiveMaxDistanceKm } from './flexiblePicks';
import { parseRequestedDistanceKm } from './aiExpertChatIntent';

/** Default search radius when the guest does not specify one in chat. */
export const CONCIERGE_CHAT_DEFAULT_RADIUS_KM = 15;

export type ConciergeAnchor = {
  label: string;
  coords: { lat: number; lng: number };
  isProperty: boolean;
  placeKind?: GeocodedPlaceKind;
};

export type ResolveConciergeLocationResult =
  | { status: 'ready'; anchor: ConciergeAnchor; radiusKm: number }
  | { status: 'choose'; candidates: GeocodedPlace[]; message: string }
  | { status: 'declined'; message: string }
  | { status: 'not_found'; message: string };

const NEAR_PROPERTY_RE =
  /\b(?:near|around|close to|by)\s+(?:my\s+)?(?:property|villa|apartment|accommodation|stay|house|home|where i(?:'m| am) staying)\b|\bnear(?:by)?\s+(?:here|the property)\b|\baround\s+here\b|\b(?:κοντά|δίπλα)\s+(?:στο|στη|στον|στην)\s+(?:κατάλυμα|βίλα|σπίτι|διαμονή)\b/i;

/** Location prepositions — deliberately excludes "to" (matches "to eat", "place to", etc.). */
const LOCATION_PREP_RE =
  /\b(?:in|at|near|around|by)\s+(?:the\s+)?([a-zA-Z\u0370-\u03ff][\w\s',.-]{2,80})/gi;

const NON_PLACE_TAIL =
  /\s+(?:for|with|that|please|where|who|when|today|tonight|tomorrow|this evening|this afternoon|now|open|cheap|budget|fancy|romantic|family|kids|vegetarian|vegan|gluten.?free).*$/i;

const NON_PLACE_ONLY =
  /^(?:dinner|lunch|breakfast|brunch|seafood|fish|pizza|sushi|food|today|tonight|tomorrow|here|there|something|anything|ideas?|evening|morning|afternoon)$/i;

const PLACE_HINT_WORDS =
  /\b(old town|old port|harbour|harbor|port|town|village|beach|bay|square|market|center|centre|neighbourhood|neighborhood|district|quarter|waterfront|promenade|marina|chania|heraklion|rethymno|agios|plaka|santorini|mykonos|venetian)\b/i;

/** Well-known neighbourhood aliases keyed by "areaPart|cityArea" (lowercase). */
const NEIGHBOURHOOD_GEOCODE_QUERIES: Record<string, string[]> = {
  'old town|chania': [
    'Maritime Museum of Crete, Chania, Greece',
    'Nautical Museum, Chania, Greece',
  ],
  'old port|chania': [
    'Maritime Museum of Crete, Chania, Greece',
    'Nautical Museum, Chania, Greece',
  ],
};

/** Fixed anchors when Nominatim has no neighbourhood result (lat/lng verified via OSM). */
const NEIGHBOURHOOD_FIXED_ANCHORS: Array<{
  test: (areaPart: string, cityArea: string) => boolean;
  label: string;
  coords: { lat: number; lng: number };
}> = [
  {
    test: (area, city) =>
      /old\s+(?:town|port)|venetian\s+harbou?r/i.test(area) && /chania/i.test(city),
    label: 'Old Town, Chania',
    coords: { lat: 35.51925, lng: 24.02345 },
  },
];

function neighbourhoodKey(areaPart: string, cityPart: string): string {
  return `${areaPart.toLowerCase().trim()}|${cityPart.toLowerCase().trim()}`;
}

function extraGeocodeQueriesForNeighbourhood(
  areaPart: string,
  cityPart: string,
  cityArea: string
): string[] {
  const city = cityPart || cityArea;
  const keys = [
    neighbourhoodKey(areaPart, city),
    neighbourhoodKey(areaPart.replace(/^the\s+/i, ''), city),
  ];
  const out: string[] = [];
  for (const key of keys) {
    for (const [aliasKey, queries] of Object.entries(NEIGHBOURHOOD_GEOCODE_QUERIES)) {
      if (key.includes(aliasKey.split('|')[0]) && key.includes('chania')) {
        out.push(...queries);
      }
    }
  }
  if (/old\s+(?:town|port)/i.test(areaPart) && /chania/i.test(city)) {
    out.push(...NEIGHBOURHOOD_GEOCODE_QUERIES['old town|chania']);
  }
  return [...new Set(out)];
}

function fixedNeighbourhoodAnchor(
  segment: string,
  cityArea: string
): { label: string; coords: { lat: number; lng: number } } | null {
  const inSplit = segment.match(/^(.+?)\s+in\s+(.+)$/i);
  const areaPart = (inSplit?.[1] || segment).replace(/^the\s+/i, '').trim();
  const cityPart = dedupeRepeatedCity(inSplit?.[2]?.trim() || cityArea, cityArea);
  const cityHint = cityPart || cityArea || segment;

  for (const entry of NEIGHBOURHOOD_FIXED_ANCHORS) {
    if (entry.test(areaPart, cityHint)) {
      return { label: entry.label, coords: entry.coords };
    }
  }
  return null;
}

/** Instant anchor hint for UI — no network calls. */
export function peekConciergeAnchorFromText(
  userText: string,
  cityArea: string
): ConciergeAnchor | null {
  const segment = extractLocationQuery(userText);
  if (!segment) return null;
  const fixed = fixedNeighbourhoodAnchor(segment, cityArea);
  if (!fixed) return null;
  return { label: fixed.label, coords: fixed.coords, isProperty: false };
}

function prioritizeChatGeocodeQueries(
  queries: string[],
  segment: string,
  cityArea: string
): string[] {
  const inSplit = segment.match(/^(.+?)\s+in\s+(.+)$/i);
  const areaPart = (inSplit?.[1] || segment).replace(/^the\s+/i, '').trim();
  const cityPart = dedupeRepeatedCity(inSplit?.[2]?.trim() || cityArea, cityArea);
  const priority = extraGeocodeQueriesForNeighbourhood(areaPart, cityPart, cityArea);
  const rest = queries.filter((q) => !priority.includes(q));
  return [...new Set([...priority, ...rest])];
}

function drivingKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 1.35;
}

function stripLeadingIntentWords(value: string): string {
  return value
    .replace(
      /^(?:eat|drink|have|get|find|try|enjoy|order|serve|serving|serves)\s+(?:\w+\s+){0,4}/i,
      ''
    )
    .replace(/^(?:nice|good|great|best|local|quiet|cozy|cosy)\s+(?:\w+\s+){0,3}/i, '')
    .trim();
}

function cleanLocationSegment(raw: string): string {
  let seg = raw.replace(NON_PLACE_TAIL, '').trim();
  seg = seg.replace(/[,.!?]+$/, '').trim();
  seg = stripLeadingIntentWords(seg);
  seg = seg.replace(/^the\s+/i, '').trim();
  return seg;
}

function scorePlaceSegment(segment: string, index: number, total: number): number {
  let score = 0;
  if (PLACE_HINT_WORDS.test(segment)) score += 40;
  if (/\bin\s+\S/i.test(segment)) score += 15;
  score += index * 5;
  if (index === total - 1) score += 10;
  score += Math.min(segment.length, 40);
  return score;
}

function collectLocationSegments(text: string): string[] {
  const segments: string[] = [];
  const re = new RegExp(LOCATION_PREP_RE.source, 'gi');
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const cleaned = cleanLocationSegment(match[1]);
    if (cleaned.length >= 3 && !NON_PLACE_ONLY.test(cleaned)) {
      segments.push(cleaned);
    }
  }
  return segments;
}

function pickBestLocationSegment(segments: string[]): string | null {
  if (segments.length === 0) return null;
  if (segments.length === 1) return segments[0];

  let best = segments[0];
  let bestScore = -1;
  segments.forEach((seg, i) => {
    const score = scorePlaceSegment(seg, i, segments.length);
    if (score > bestScore) {
      bestScore = score;
      best = seg;
    }
  });
  return best;
}

function dedupeRepeatedCity(part: string, cityArea: string): string {
  if (!cityArea.trim()) return part;
  const cityNorm = cityArea.trim();
  const escaped = cityNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return part
    .replace(new RegExp(`\\s*,\\s*${escaped}\\s*,\\s*${escaped}\\s*$`, 'i'), `, ${cityNorm}`)
    .replace(new RegExp(`\\s+in\\s+${escaped}\\s*,\\s*${escaped}\\s*$`, 'i'), `, ${cityNorm}`)
    .replace(new RegExp(`\\s*,\\s*${escaped}\\s*$`, 'i'), '')
    .trim();
}

/** Turn "old town in chania" into geocoder-friendly query variants. */
export function buildGeocodeQueryVariants(
  rawSegment: string,
  cityArea: string,
  country: string
): string[] {
  const out: string[] = [];
  const add = (q: string) => {
    const t = q.replace(/\s+/g, ' ').replace(/,\s*,/g, ',').trim().replace(/,\s*$/, '');
    if (t.length >= 3) out.push(t);
  };

  let segment = dedupeRepeatedCity(rawSegment, cityArea);
  segment = segment.replace(/^the\s+/i, '').trim();

  add(segment);

  const inSplit = segment.match(/^(.+?)\s+in\s+(.+)$/i);
  if (inSplit) {
    const areaPart = inSplit[1].trim();
    let cityPart = dedupeRepeatedCity(inSplit[2].trim(), cityArea);
    cityPart = cityPart.replace(new RegExp(`^${cityArea}$`, 'i'), cityArea).trim();

    add(`${areaPart}, ${cityPart}`);
    if (cityArea) add(`${areaPart}, ${cityArea}`);
    if (cityArea) add(`${cityArea} ${areaPart}`);
    if (country && cityArea) add(`${areaPart}, ${cityArea}, ${country}`);

    extraGeocodeQueriesForNeighbourhood(areaPart, cityPart, cityArea).forEach(add);
  } else {
    if (cityArea) add(`${segment}, ${cityArea}`);
    if (country && cityArea) add(`${segment}, ${cityArea}, ${country}`);
  }

  return [...new Set(out)];
}

/** Pull a place name out of free-text when the guest names an area (not their stay). */
export function extractLocationQuery(text: string): string | null {
  const t = text.trim();
  if (!t || mentionsNearProperty(t)) return null;

  const segments = collectLocationSegments(t);
  return pickBestLocationSegment(segments);
}

export function mentionsNearProperty(text: string): boolean {
  return NEAR_PROPERTY_RE.test(text.trim());
}

export function conciergeRadiusKmFromText(text: string): number | null {
  return parseRequestedDistanceKm(text);
}

/** Tight search radius from anchor type — chat should not drift across the region. */
export function conciergeRadiusForAnchor(anchor: ConciergeAnchor, userText: string): number {
  const explicit = conciergeRadiusKmFromText(userText);
  if (explicit) return explicit;
  if (anchor.isProperty) return CONCIERGE_CHAT_DEFAULT_RADIUS_KM;
  switch (anchor.placeKind) {
    case 'village':
      return 6;
    case 'settlement':
    case 'town':
      return 8;
    case 'city':
      return 12;
    default:
      return 8;
  }
}

export function filterCoordsWithinRadius<T extends { latitude?: number; longitude?: number }>(
  rows: T[],
  anchor: { lat: number; lng: number },
  maxKm: number,
  opts?: { requireCoords?: boolean; strict?: boolean }
): T[] {
  const cap = opts?.strict === false ? effectiveMaxDistanceKm(maxKm) : maxKm;
  return rows.filter((row) => {
    const lat = row.latitude;
    const lng = row.longitude;
    if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) {
      return !opts?.requireCoords;
    }
    return drivingKm(anchor.lat, anchor.lng, lat, lng) <= cap;
  });
}

export type ValidateDayTripFn = (
  lat: number,
  lng: number,
  placeLabel: string
) => Promise<{ ok: true } | { ok: false; message: string }>;

async function anchorFromResolvedPlace(
  place: GeocodedPlace,
  userText: string,
  validateDayTrip: ValidateDayTripFn
): Promise<ResolveConciergeLocationResult> {
  const check = await validateDayTrip(place.lat, place.lng, place.label);
  if (check.ok === false) {
    return { status: 'declined', message: check.message };
  }
  const anchor: ConciergeAnchor = {
    label: place.label,
    coords: { lat: place.lat, lng: place.lng },
    isProperty: false,
    placeKind: place.placeKind,
  };
  return {
    status: 'ready',
    anchor,
    radiusKm: conciergeRadiusForAnchor(anchor, userText),
  };
}

async function mapResolveResult(
  resolved: LocationResolveResult,
  userText: string,
  validateDayTrip: ValidateDayTripFn
): Promise<ResolveConciergeLocationResult> {
  if (resolved.type === 'not_found') {
    return { status: 'not_found', message: resolved.message };
  }
  if (resolved.type === 'choose') {
    return {
      status: 'choose',
      candidates: resolved.candidates,
      message: resolved.message,
    };
  }
  return anchorFromResolvedPlace(resolved.place, userText, validateDayTrip);
}

/** Max Nominatim-backed lookups per chat message — each can take ~1–2s. */
const CHAT_GEOCODE_QUERY_CAP = 3;

async function resolveLocationQueries(
  queries: string[],
  userText: string,
  geocodeContext: { propCoords: { lat: number; lng: number } | null; country: string; cityArea: string },
  locale: GuestLocale,
  validateDayTrip: ValidateDayTripFn,
  maxQueries = CHAT_GEOCODE_QUERY_CAP
): Promise<ResolveConciergeLocationResult | null> {
  let lastNotFound: ResolveConciergeLocationResult | null = null;

  for (const query of queries.slice(0, maxQueries)) {
    const resolved = await resolveCustomLocation(query, geocodeContext, locale);
    const mapped = await mapResolveResult(resolved, userText, validateDayTrip);
    if (mapped.status === 'not_found') {
      lastNotFound = mapped;
      continue;
    }
    return mapped;
  }

  return lastNotFound;
}

/**
 * Resolve where chat recommendations should be centered.
 * Defaults to the property when the guest names no other place.
 */
export async function resolveConciergeLocation(params: {
  userText: string;
  sessionAnchor: ConciergeAnchor | null;
  propertyAnchor: ConciergeAnchor | null;
  propCoords: { lat: number; lng: number } | null;
  country: string;
  cityArea: string;
  locale: GuestLocale;
  validateDayTrip: ValidateDayTripFn;
}): Promise<ResolveConciergeLocationResult> {
  const {
    userText,
    sessionAnchor,
    propertyAnchor,
    propCoords,
    country,
    cityArea,
    locale,
    validateDayTrip,
  } = params;

  const tf = (key: GuestLocaleUiKey, vars: Record<string, string | number>) =>
    guestUiTFormat(locale, key, vars);

  const geocodeContext = { propCoords, country, cityArea };

  if (mentionsNearProperty(userText) && propertyAnchor) {
    return {
      status: 'ready',
      anchor: propertyAnchor,
      radiusKm: conciergeRadiusForAnchor(propertyAnchor, userText),
    };
  }

  const locationSegment = extractLocationQuery(userText);
  if (locationSegment) {
    // Known neighbourhoods first — instant, no Nominatim queue.
    const fixed = fixedNeighbourhoodAnchor(locationSegment, cityArea);
    if (fixed) {
      const check = await validateDayTrip(fixed.coords.lat, fixed.coords.lng, fixed.label);
      if (check.ok === false) {
        return { status: 'declined', message: check.message };
      }
      const anchor: ConciergeAnchor = {
        label: fixed.label,
        coords: fixed.coords,
        isProperty: false,
        placeKind: 'settlement',
      };
      return {
        status: 'ready',
        anchor,
        radiusKm: conciergeRadiusForAnchor(anchor, userText),
      };
    }

    const queries = prioritizeChatGeocodeQueries(
      buildGeocodeQueryVariants(locationSegment, cityArea, country),
      locationSegment,
      cityArea
    );
    const mapped = await resolveLocationQueries(
      queries,
      userText,
      geocodeContext,
      locale,
      validateDayTrip
    );

    if (mapped?.status === 'ready' || mapped?.status === 'choose') {
      return mapped;
    }

    if (mapped?.status === 'declined' && cityArea) {
      const nearbyQueries = prioritizeChatGeocodeQueries(
        buildGeocodeQueryVariants(`${locationSegment}, ${cityArea}`, cityArea, country),
        locationSegment,
        cityArea
      );
      const nearby = await resolveLocationQueries(
        nearbyQueries,
        userText,
        geocodeContext,
        locale,
        validateDayTrip,
        2
      );
      if (nearby?.status === 'choose' || nearby?.status === 'ready') {
        if (nearby.status === 'choose') {
          return {
            ...nearby,
            message: `${mapped.message}\n\n${tf('aiExpertDidYouMeanSuffix', {})}`,
          };
        }
        return nearby;
      }
    }

    if (mapped) {
      const hint = cityArea
        ? tf('aiExpertGeoHintRegion', { input: locationSegment, area: cityArea })
        : tf('aiExpertGeoHintCountry', { input: locationSegment, area: '' });
      return {
        status: 'not_found',
        message: tf('aiExpertGeoNotFound', { input: locationSegment }) + hint,
      };
    }
  }

  if (sessionAnchor) {
    return {
      status: 'ready',
      anchor: sessionAnchor,
      radiusKm: conciergeRadiusForAnchor(sessionAnchor, userText),
    };
  }

  if (propertyAnchor) {
    return {
      status: 'ready',
      anchor: propertyAnchor,
      radiusKm: conciergeRadiusForAnchor(propertyAnchor, userText),
    };
  }

  return {
    status: 'not_found',
    message: tf('aiExpertGeoNotFound', { input: userText }),
  };
}
