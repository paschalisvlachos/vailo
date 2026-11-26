const { setGlobalOptions } = require("firebase-functions/v2");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const axios = require("axios");
const crypto = require("crypto");
const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp();
}

const firestore = admin.firestore();

async function recordPlatformUsage(field) {
  const monthKey = new Date().toISOString().slice(0, 7);
  const increment = admin.firestore.FieldValue.increment(1);
  const updatedAt = admin.firestore.FieldValue.serverTimestamp();
  try {
    await Promise.all([
      firestore.collection("platformUsage").doc(monthKey).set(
        { [field]: increment, updatedAt },
        { merge: true }
      ),
      firestore.collection("platformUsage").doc("allTime").set(
        { [field]: increment, updatedAt },
        { merge: true }
      ),
    ]);
  } catch (e) {
    logger.warn("recordPlatformUsage failed:", e);
  }
}

setGlobalOptions({
  maxInstances: 10,
  region: "us-central1",
});

const PLACES_FIELD_MASK =
  "places.id,places.displayName,places.rating,places.editorialSummary,places.location,places.photos,places.primaryType,places.businessStatus,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri,places.googleMapsUri,places.formattedAddress,places.addressComponents";

const PLACE_DETAILS_FIELD_MASK =
  "name,id,displayName,rating,editorialSummary,location,photos,primaryType,businessStatus,nationalPhoneNumber,internationalPhoneNumber,websiteUri,googleMapsUri,formattedAddress,addressComponents";

const DUPLICATE_RADIUS_METERS = 150;
const FUZZY_NAME_RADIUS_METERS = 250;

const {
  normalizeUsageCaller,
  recordPlacesApiCall,
  breakdownFromUsageDoc,
  MAGIC_FILL_LEGACY_UNIT,
} = require("./placesApiUsage");
const { pointInPolygon, parseBoundaryRing } = require("./areaRadarGeo");
const { getAllTrailsTrailDetailsHandler } = require("./allTrailsTrailDetails");
const {
  askAppCodeKnowledgeHandler,
  getAppCodeKnowledgeMetaHandler,
  getAppCodeKnowledgeExportHandler,
} = require("./codeKnowledge");
const {
  isGooglePlacesPhotoUrl,
  placePhotoStoragePath,
  ensureStoredPlacePhoto,
} = require("./placePhotoMirror");

const GENERIC_SUFFIXES = [
  "restaurant",
  "horseriding",
  "taverna",
  "cafeteria",
  "cafe",
  "coffee",
  "bar",
  "grill",
  "hotel",
  "resort",
  "beach",
  "agency",
  "shop",
  "studio",
  "studios",
];

const GEO_HINTS = [
  "beach",
  "village",
  "gorge",
  "cove",
  "bay",
  "monastery",
  "archaeological",
  "lake",
  "mountain",
  "park",
  "waterfall",
  "harbour",
  "port",
  "square",
  "cave",
  "ruins",
  "settlement",
  "hamlet",
];

const BUSINESS_HINTS = [
  "studio",
  "studios",
  "hotel",
  "resort",
  "restaurant",
  "taverna",
  "cafe",
  "bar",
  "grill",
  "shop",
  "agency",
  "apartments",
  "rooms",
  "villas",
  "suites",
  "lodge",
  "inn",
  "motel",
];

/** Moderate commercial signals for [AREAS ONLY] AI verification. */
const AREAS_COMMERCIAL_HINTS = [
  ...BUSINESS_HINTS,
  "cafeteria",
  "beachbar",
  "beachclub",
  "bistro",
  "pizzeria",
  "operator",
  "operators",
  "tours",
  "rental",
  "rentals",
  "pub",
  "club",
  "winery",
  "brewery",
  "watersports",
  "divingcenter",
  "snack",
  "cantina",
];

const AREAS_BLOCKED_GOOGLE_TYPES = [
  "restaurant",
  "lodging",
  "tour",
  "travel_agency",
  "store",
  "food",
  "cafe",
  "bar",
  "guest_house",
  "bed_and_breakfast",
  "apartment",
  "campground",
  "marina",
  "night_club",
  "coffee_shop",
  "bakery",
  "meal_",
  "gym",
  "spa",
  "beauty_salon",
  "car_rental",
  "real_estate",
  "shopping",
  "pub",
  "wine_bar",
  "boat_rental",
  "gas_station",
  "parking",
];

function normalizePlaceName(name) {
  return String(name || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u0370-\u03ff]/g, "");
}

function sanitizePlaceSearchTitle(title) {
  return String(title || "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function includesHint(normalized, hints) {
  return hints.some((h) => normalized.includes(h));
}

function placeKindsConflict(requestedNorm, resolvedNorm) {
  const geoReq = includesHint(requestedNorm, GEO_HINTS);
  const geoRes = includesHint(resolvedNorm, GEO_HINTS);
  const bizReq = includesHint(requestedNorm, BUSINESS_HINTS);
  const bizRes = includesHint(resolvedNorm, BUSINESS_HINTS);
  if (geoReq && bizRes && !geoRes) return true;
  if (bizReq && geoRes && !bizRes) return true;
  return false;
}

function isBrokenPlaceMapsUrl(url) {
  const raw = String(url || "").trim();
  if (!raw) return true;
  if (/\/place\/\/@|\/place\/\/\?|\/place\/\/$/i.test(raw)) return true;
  const slug = raw.match(/\/place\/([^/?@]+)/i)?.[1]?.trim();
  if (raw.includes("/place/") && (!slug || slug === "")) return true;
  return false;
}

function nameCore(normalized) {
  if (!normalized || normalized.length < 3) return normalized;
  let core = normalized;
  for (const suffix of GENERIC_SUFFIXES) {
    if (core.endsWith(suffix) && core.length > suffix.length + 2) {
      core = core.slice(0, -suffix.length);
    }
  }
  return core.length >= 3 ? core : normalized;
}

function namesLikelySame(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const ca = nameCore(a);
  const cb = nameCore(b);
  if (ca === cb && ca.length >= 4) {
    if (placeKindsConflict(a, b)) return false;
    return true;
  }
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  if (shorter.length >= 5 && longer.includes(shorter)) return true;
  if (ca.length >= 4 && cb.length >= 4 && (ca.includes(cb) || cb.includes(ca))) {
    if (placeKindsConflict(a, b)) return false;
    return true;
  }
  return false;
}

const LOCALITY_STOPWORDS = new Set([
  "georgioupolis",
  "chania",
  "crete",
  "greece",
  "apokoronas",
  "rethymno",
  "heraklion",
  "municipality",
  "regional",
]);

const SEARCH_TITLE_ALIASES = {
  filaki: ["Phylaki", "Filaki"],
  filakivillage: ["Phylaki", "Filaki"],
  fres: ["Fres", "Fres Village"],
  fresvillage: ["Fres", "Fres Village"],
};

function placeSearchTitleVariants(title) {
  const clean = String(title || "").trim();
  if (!clean) return [];
  const norm = normalizePlaceName(clean);
  const aliases = SEARCH_TITLE_ALIASES[norm] || [];
  return [...new Set([clean, ...aliases])];
}

function beyondRadiusBufferKm(maxKm) {
  if (!isFinite(maxKm) || maxKm <= 0) return 0;
  return Math.min(Math.max(maxKm * 0.4, 3), 20);
}

function coordsInGreece(lat, lng) {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    lat >= 34.5 &&
    lat <= 41.8 &&
    lng >= 19.0 &&
    lng <= 29.6
  );
}

function validateResolvedPlace(place, title, anchorLat, anchorLng, maxKm, knowledgeMode) {
  const lat = place.latitude;
  const lng = place.longitude;
  if (!coordsInGreece(lat, lng)) return { ok: false, reason: "outside_greece" };

  const cap =
    typeof maxKm === "number" && maxKm > 0
      ? maxKm + beyondRadiusBufferKm(maxKm)
      : 30;
  if (typeof anchorLat === "number" && typeof anchorLng === "number") {
    const km = haversineMeters(anchorLat, anchorLng, lat, lng) / 1000;
    if (km > cap) return { ok: false, reason: "too_far" };
  }

  const country = String(place.country || "").toLowerCase();
  if (
    country &&
    !country.includes("greece") &&
    country !== "gr" &&
    !country.includes("ελλάδα")
  ) {
    return { ok: false, reason: "wrong_country" };
  }

  if (knowledgeMode === "areas") {
    const type = String(place.category || "").toLowerCase();
    if (AREAS_BLOCKED_GOOGLE_TYPES.some((t) => type.includes(t))) {
      return { ok: false, reason: "business_type" };
    }

    const nameNorm = normalizePlaceName(place.name || "");
    const reqNorm = normalizePlaceName(title);
    if (includesHint(nameNorm, AREAS_COMMERCIAL_HINTS)) {
      return { ok: false, reason: "commercial_name" };
    }
    if (includesHint(reqNorm, AREAS_COMMERCIAL_HINTS)) {
      return { ok: false, reason: "commercial_title" };
    }

    const phone = String(place.phoneNumber || "").trim();
    const website = String(place.websiteUri || "").trim();
    if (phone && website) {
      return { ok: false, reason: "commercial_signals" };
    }
  }

  return { ok: true };
}

function placeRecordForValidation(data, titleFallback) {
  return {
    latitude: data.latitude,
    longitude: data.longitude,
    country: data.country || "",
    name: data.name || titleFallback,
    category: data.category || "",
    phoneNumber: data.phoneNumber || "",
    websiteUri: data.websiteUri || "",
  };
}

function placeNamesMatch(requested, resolved) {
  const a = normalizePlaceName(requested);
  const b = normalizePlaceName(resolved);
  if (!a || !b) return false;
  if (a === b) return true;
  if (placeKindsConflict(a, b)) return false;
  const ca = nameCore(a);
  const cb = nameCore(b);
  if (ca === cb && ca.length >= 4) return true;
  if (ca.length >= 5 && b.includes(ca)) return true;
  if (cb.length >= 5 && a.includes(cb)) return true;
  const words = String(requested || "")
    .toLowerCase()
    .replace(/[^a-z0-9\u0370-\u03ff\s]/g, " ")
    .split(/\s+/)
    .filter(
      (w) =>
        w.length >= 5 &&
        !GENERIC_SUFFIXES.includes(w) &&
        !LOCALITY_STOPWORDS.has(w)
    );
  return words.some((w) => b.includes(normalizePlaceName(w)));
}

function scorePlaceMatch(requestedTitle, place, biasLat, biasLng) {
  const name = place.displayName?.text || "";
  if (!placeNamesMatch(requestedTitle, name)) return -1;

  let score = 100;
  const reqNorm = normalizePlaceName(requestedTitle);
  const resNorm = normalizePlaceName(name);
  if (reqNorm === resNorm) score += 80;

  for (const hint of GEO_HINTS) {
    if (reqNorm.includes(hint) && resNorm.includes(hint)) score += 30;
  }
  for (const hint of BUSINESS_HINTS) {
    if (reqNorm.includes(hint) && resNorm.includes(hint)) score += 20;
  }

  if (typeof biasLat === "number" && typeof biasLng === "number") {
    const plat = place.location?.latitude;
    const plng = place.location?.longitude;
    if (typeof plat === "number" && typeof plng === "number") {
      const km = haversineMeters(biasLat, biasLng, plat, plng) / 1000;
      score -= Math.min(km, 40);
    }
  }

  return score;
}

function isPlaceOperational(place) {
  const status = String(place?.businessStatus || "").trim().toUpperCase();
  if (!status) return true;
  return status !== "CLOSED_PERMANENTLY";
}

function pickBestPlaceMatch(places, requestedTitle, biasLat, biasLng) {
  if (!places?.length) return null;
  let best = null;
  let bestScore = -1;
  for (const place of places) {
    if (!isPlaceOperational(place)) continue;
    const score = scorePlaceMatch(requestedTitle, place, biasLat, biasLng);
    if (score > bestScore) {
      bestScore = score;
      best = place;
    }
  }
  return bestScore >= 0 ? best : null;
}

function pickClosestPlace(places, lat, lng) {
  if (!places?.length) return null;
  let best = places[0];
  let bestDist = Infinity;
  for (const place of places) {
    const plat = place.location?.latitude;
    const plng = place.location?.longitude;
    if (typeof plat !== "number" || typeof plng !== "number") continue;
    const d = haversineMeters(lat, lng, plat, plng);
    if (d < bestDist) {
      bestDist = d;
      best = place;
    }
  }
  return best;
}

function isGenericMapsTitle(name) {
  const n = String(name || "").trim().toLowerCase();
  if (!n) return true;
  return (
    n.includes("google maps") ||
    n.includes("google search") ||
    n === "google" ||
    n.includes("302 moved") ||
    n.includes("before you continue") ||
    n.includes("sign in")
  );
}

function isLikelyMapsShortLink(url) {
  try {
    const host = new URL(String(url || "").trim()).hostname.toLowerCase();
    return (
      host === "share.google" ||
      host === "maps.app.goo.gl" ||
      host === "goo.gl" ||
      host.endsWith(".app.goo.gl") ||
      host === "g.co"
    );
  } catch {
    return false;
  }
}

function unwrapGoogleContinueUrl(rawUrl) {
  let current = String(rawUrl || "").trim();
  for (let i = 0; i < 4; i++) {
    try {
      const u = new URL(current);
      const cont = u.searchParams.get("continue");
      if (!cont) return current;
      current = cont;
    } catch {
      return current;
    }
  }
  return current;
}

function placeNameFromSearchQueryParam(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return "";
  if (/^-?\d+\.\d+\s*,\s*-?\d+\.\d+$/.test(value)) return "";
  if (isGenericMapsTitle(value)) return "";
  return value;
}

/** Parse place name / coords from a Maps or share.google URL without HTTP fetch. */
function extractMapsUrlHints(url) {
  const hints = { placeName: "", lat: null, lng: null };
  const raw = unwrapGoogleContinueUrl(String(url || "").trim());
  if (!raw.startsWith("http")) return hints;

  const placeMatch = raw.match(/\/place\/([^/?@]+)/i);
  if (placeMatch?.[1]) {
    hints.placeName = decodeURIComponent(placeMatch[1].replace(/\+/g, " ")).trim();
  }

  if (!hints.placeName) {
    const pathSearch = raw.match(/\/(?:place|search)\/([^/?@]+)/i);
    if (pathSearch?.[1]) {
      hints.placeName = decodeURIComponent(pathSearch[1].replace(/\+/g, " ")).trim();
    }
  }

  try {
    const u = new URL(raw);
    if (!hints.placeName) {
      hints.placeName = placeNameFromSearchQueryParam(u.searchParams.get("q") || "");
    }
  } catch {
    /* ignore */
  }

  const coordMatch =
    raw.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) ||
    raw.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/) ||
    raw.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (coordMatch) {
    hints.lat = parseFloat(coordMatch[1]);
    hints.lng = parseFloat(coordMatch[2]);
  }
  return hints;
}

function mergeSetCookieIntoJar(jar, response) {
  let cookies = [];
  if (typeof response.headers.getSetCookie === "function") {
    cookies = response.headers.getSetCookie();
  } else {
    const single = response.headers.get("set-cookie");
    if (single) cookies = [single];
  }
  for (const sc of cookies) {
    const match = String(sc).match(/^([^=;\s]+)=([^;]*)/);
    if (match) jar.set(match[1], match[2]);
  }
}

/**
 * Follow Google short-link redirects while keeping cookies.
 * share.google often needs this to reach the search/maps destination.
 */
async function fetchFollowRedirectsWithCookies(startUrl, options = {}) {
  const maxRedirects = options.maxRedirects ?? 10;
  const headers = {
    "User-Agent":
      options.userAgent ||
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    ...(options.headers || {}),
  };

  let url = String(startUrl || "").trim();
  const jar = new Map();
  let lastStatus = 0;

  for (let i = 0; i <= maxRedirects; i++) {
    const cookieHeader = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    const res = await fetch(url, {
      redirect: "manual",
      headers: {
        ...headers,
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      },
    });
    lastStatus = res.status;
    mergeSetCookieIntoJar(jar, res);

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) {
        const text = await res.text().catch(() => "");
        return { url, text, status: res.status };
      }
      url = unwrapGoogleContinueUrl(new URL(loc, url).href);
      continue;
    }

    const text = await res.text();
    return { url: unwrapGoogleContinueUrl(url), text, status: res.status };
  }

  throw new Error(`Too many redirects resolving Maps link (last ${lastStatus}).`);
}

function bareGooglePlaceId(raw) {
  if (!raw) return null;
  const s = String(raw).trim().replace(/^places\//, "");
  if (!s) return null;
  if (/^ChIJ[\w-]+$/i.test(s)) return s;
  if (/^0x[0-9a-f]+:0x[0-9a-f]+$/i.test(s)) return s;
  return s;
}

function extractPlaceIdFromMapsUrl(url) {
  const raw = String(url || "").trim();
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

/** Decimal Google Maps CID from ?cid=… share links (maps.google.com/?cid=…). */
function extractCidFromMapsUrl(url) {
  const match = String(url || "").match(/[?&]cid=(\d{5,})/i);
  return match?.[1] || null;
}

function cidToFeatureId(cid) {
  try {
    return `0x0:0x${BigInt(String(cid)).toString(16)}`;
  } catch {
    return null;
  }
}

/**
 * Resolve maps.google.com/?cid=… via Google's /maps/preview/place payload.
 * CID share links do not HTTP-redirect to /maps/place/, but the preview endpoint
 * returns the ChIJ place id + name + coordinates in the first few KB.
 */
async function resolveCidViaMapsPreview(cid) {
  const cidValue = String(cid || "").trim();
  if (!/^\d{5,}$/.test(cidValue)) return null;

  try {
    const page = await fetchFollowRedirectsWithCookies(
      `https://www.google.com/maps?cid=${cidValue}&hl=en&gl=us`
    );
    const html = String(page?.text || "");
    let previewPath =
      (html.match(/href=["'](\/maps\/preview\/place\?[^"']+)["']/i) || [])[1] ||
      (html.match(/(\/maps\/preview\/place\?[^"'\\\s]+)/i) || [])[1] ||
      "";
    previewPath = previewPath.replace(/&amp;/g, "&").trim();

    if (!previewPath) {
      const ftid =
        (html.match(/0x[0-9a-f]+:0x[0-9a-f]+/i) || [])[0] || cidToFeatureId(cidValue);
      if (!ftid) return null;
      const center = html.match(/!2d(-?\d+\.\d+)!3d(-?\d+\.\d+)/);
      const lng = center?.[1] || "0";
      const lat = center?.[2] || "0";
      previewPath =
        `/maps/preview/place?hl=en&gl=us&pb=!1m14!1s${encodeURIComponent(ftid)}` +
        `!3m12!1m3!1d5000!2d${lng}!3d${lat}!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1`;
    }

    const previewUrl = previewPath.startsWith("http")
      ? previewPath
      : `https://www.google.com${previewPath}`;
    const preview = await fetchFollowRedirectsWithCookies(previewUrl);
    const body = String(preview?.text || "");
    if (!body) return null;

    const placeId =
      bareGooglePlaceId(
        (body.match(/placeid(?:=|\\u003d|%3D)(ChIJ[\w-]+)/i) || [])[1]
      ) ||
      bareGooglePlaceId((body.match(/"(ChIJ[\w-]{20,})"/) || [])[1]) ||
      null;

    const nameFromFtid = (body.match(/"0x[0-9a-f]+:0x[0-9a-f]+","([^"]{2,120})"/i) ||
      [])[1];
    const nameFromTitle = (body.match(/"([\p{L}\d][^"]{1,80})",(null,)?\["(?:Restaurant|Cafe|Bar|Hotel|Museum|Beach|Store)/iu) ||
      [])[1];
    const placeName = String(nameFromFtid || nameFromTitle || "")
      .replace(/\\u[\dA-Fa-f]{4}/g, (m) => String.fromCharCode(parseInt(m.slice(2), 16)))
      .trim();

    const coords = body.match(/\[null,null,(-?\d+\.\d+),(-?\d+\.\d+)\]/);
    const lat = coords ? parseFloat(coords[1]) : null;
    const lng = coords ? parseFloat(coords[2]) : null;

    if (!placeId && !placeName && !(lat != null && lng != null)) return null;

    logger.info("CID resolved via Maps preview", {
      cid: cidValue,
      placeId: placeId || null,
      placeName: placeName || null,
      hasCoords: lat != null && lng != null,
    });

    return {
      placeId: placeId && /^ChIJ/i.test(placeId) ? placeId : null,
      placeName,
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null,
    };
  } catch (e) {
    logger.warn("CID Maps preview resolve failed:", e.message || e);
    return null;
  }
}

/**
 * Resolve a Maps CID (?cid=…) to place hints (ChIJ id / name / coords).
 * Prefers Maps preview scrape, then legacy Place Details, text search, then headless browser.
 */
async function resolvePlaceHintsFromCid(cid, apiKey, usageSource) {
  const cidValue = String(cid || "").trim();
  if (!/^\d{5,}$/.test(cidValue) || !apiKey) return null;

  // 1) Maps preview — works without Places API (legacy) and without Chromium.
  const fromPreview = await resolveCidViaMapsPreview(cidValue);
  if (fromPreview?.placeId || fromPreview?.placeName) {
    return fromPreview;
  }

  // 2) Legacy Place Details still accepts cid when Places API (legacy) is enabled.
  try {
    const response = await axios.get("https://maps.googleapis.com/maps/api/place/details/json", {
      params: {
        cid: cidValue,
        fields: "place_id,name,geometry,url",
        key: apiKey,
      },
      timeout: 20000,
    });
    if (usageSource) {
      await recordPlacesApiCall(firestore, {
        endpoint: "place_details",
        source: usageSource,
      });
    }
    const status = String(response.data?.status || "");
    const placeId = bareGooglePlaceId(response.data?.result?.place_id);
    if (status === "OK" && placeId) {
      const loc = response.data?.result?.geometry?.location;
      return {
        placeId,
        placeName: String(response.data?.result?.name || "").trim(),
        lat: typeof loc?.lat === "number" ? loc.lat : null,
        lng: typeof loc?.lng === "number" ? loc.lng : null,
      };
    }
    logger.warn("CID legacy Place Details miss", {
      cid: cidValue,
      status,
      errorMessage: response.data?.error_message || null,
    });
  } catch (e) {
    logger.warn("CID legacy Place Details failed:", e.response?.data || e.message || e);
  }

  // 3) Places API (New) text search — server keys can sometimes resolve the share URL / ftid.
  const featureId = cidToFeatureId(cidValue);
  const queries = [
    `https://www.google.com/maps?cid=${cidValue}`,
    `https://maps.google.com/?cid=${cidValue}`,
    featureId ? `https://www.google.com/maps?ftid=${featureId}` : null,
    featureId,
  ].filter(Boolean);

  for (const textQuery of queries) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const place = await fetchPlaceFromGoogle(textQuery, apiKey, null, null, "", {
        skipPhoto: true,
        usageSource,
        pickClosestWithinMeters: 0,
      });
      const placeId = bareGooglePlaceId(place?.googlePlaceId);
      if (placeId && /^ChIJ/i.test(placeId)) {
        logger.info("CID resolved via Places text search", { cid: cidValue, placeId, textQuery });
        return {
          placeId,
          placeName: String(place?.name || "").trim(),
          lat: typeof place?.latitude === "number" ? place.latitude : null,
          lng: typeof place?.longitude === "number" ? place.longitude : null,
        };
      }
    } catch (e) {
      logger.warn("CID text search attempt failed", {
        cid: cidValue,
        textQuery,
        message: e?.message || e,
      });
    }
  }

  // 4) Headless Chromium expands cid → /maps/place/… then Places text search by name.
  try {
    const { resolveMapsCidInBrowser } = require("./resolveMapsCidBrowser");
    const hints = await resolveMapsCidInBrowser(cidValue);
    if (hints?.placeName) {
      const place = await fetchPlaceFromGoogle(
        hints.placeName,
        apiKey,
        hints.lat,
        hints.lng,
        hints.placeName,
        { skipPhoto: true, usageSource }
      );
      const placeId = bareGooglePlaceId(place?.googlePlaceId);
      if (placeId && /^ChIJ/i.test(placeId)) {
        logger.info("CID resolved via browser expand + Places search", {
          cid: cidValue,
          placeId,
          placeName: hints.placeName,
        });
        return {
          placeId,
          placeName: hints.placeName,
          lat: hints.lat ?? null,
          lng: hints.lng ?? null,
        };
      }
      return {
        placeId: null,
        placeName: hints.placeName,
        lat: hints.lat ?? null,
        lng: hints.lng ?? null,
      };
    }
  } catch (e) {
    logger.warn("CID browser expand failed:", e.message || e);
  }

  return fromPreview;
}

function extractPlaceIdFromPlacesPhotoUrl(url) {
  const raw = String(url || "").trim();
  const match = raw.match(/places\.googleapis\.com\/v1\/places\/(ChIJ[\w-]+)\//i);
  return match?.[1] || null;
}

/**
 * Expand maps.app.goo.gl / share.google / cid short links to a full /maps/place URL.
 * Returns { url, placeId, placeName, lat, lng }.
 */
async function expandMapsShortLink(url) {
  const trimmed = String(url || "").trim();
  const empty = { url: trimmed, placeId: null, placeName: "", lat: null, lng: null };
  if (!trimmed.startsWith("http")) return empty;

  const directHints = extractMapsUrlHints(trimmed);
  const directPlaceId = extractPlaceIdFromMapsUrl(trimmed);
  if (
    directPlaceId ||
    (directHints.placeName && !isGenericMapsTitle(directHints.placeName)) ||
    (directHints.lat != null && directHints.lng != null)
  ) {
    return {
      url: trimmed,
      placeId: directPlaceId,
      placeName: directHints.placeName || "",
      lat: directHints.lat,
      lng: directHints.lng,
    };
  }

  if (
    !(
      isLikelyMapsShortLink(trimmed) ||
      /share\.google/i.test(trimmed) ||
      /[?&]cid=/i.test(trimmed)
    )
  ) {
    return empty;
  }

  try {
    const resolved = await fetchFollowRedirectsWithCookies(trimmed);
    const finalUrl = unwrapGoogleContinueUrl(resolved.url);
    const hints = extractMapsUrlHints(finalUrl);
    return {
      url: finalUrl || trimmed,
      placeId: extractPlaceIdFromMapsUrl(finalUrl),
      placeName: hints.placeName || "",
      lat: hints.lat,
      lng: hints.lng,
    };
  } catch (e) {
    logger.warn("expandMapsShortLink failed:", e.message || e);
    return empty;
  }
}

async function resolvePlaceIdFromMapsUrlFetch(url) {
  const expanded = await expandMapsShortLink(url);
  return expanded.placeId || null;
}

function resolveGooglePlaceIdFromPlace(place, googleMapsUrl) {
  const fromApi = bareGooglePlaceId(place?.id || place?.name);
  if (fromApi) return fromApi;
  return extractPlaceIdFromMapsUrl(googleMapsUrl);
}

function appendAreaIfNeeded(query, area) {
  const q = String(query || "").trim();
  const a = String(area || "").trim();
  if (!q || !a) return q;
  const qLower = q.toLowerCase();
  const aLower = a.toLowerCase();
  if (qLower === aLower || qLower.endsWith(` ${aLower}`) || qLower.endsWith(`, ${aLower}`)) {
    return q;
  }
  return `${q} ${a}`;
}

function asCoord(value) {
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  if (typeof value === "string") {
    const parsed = parseFloat(value.trim());
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function matchTitleFromResolvedQuery(resolvedQuery, area) {
  let title = String(resolvedQuery || "").trim();
  const a = String(area || "").trim();
  if (a) {
    const suffix = new RegExp(`\\s+${a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
    title = title.replace(suffix, "").trim();
  }
  const coordOnly = title.match(/^(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)$/);
  if (coordOnly) return title;
  return title.split(",")[0].trim() || title;
}

function pickFallbackPlace(places, requestedTitle, biasLat, biasLng) {
  const operational = (places || []).filter(isPlaceOperational);
  if (!operational.length) return null;

  const title = String(requestedTitle || "").trim();
  const coordInTitle = title.match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);
  if (coordInTitle) {
    return pickClosestPlace(
      operational,
      parseFloat(coordInTitle[1]),
      parseFloat(coordInTitle[2])
    );
  }

  if (title && !title.startsWith("http") && title.length >= 3) {
    for (const place of operational) {
      const name = place.displayName?.text || "";
      if (placeNamesMatch(title, name)) return place;
    }
    for (const place of operational) {
      const name = place.displayName?.text || "";
      if (namesLikelySame(normalizePlaceName(title), normalizePlaceName(name))) {
        return place;
      }
    }
  }

  if (operational.length === 1) return operational[0];

  return null;
}

function stablePlaceDocId(googlePlaceId, normalizedName, latitude, longitude) {
  if (googlePlaceId) {
    return crypto.createHash("sha256").update(`gp:${googlePlaceId}`).digest("hex").slice(0, 40);
  }
  if (typeof latitude === "number" && typeof longitude === "number") {
    const bucket = `${latitude.toFixed(4)},${longitude.toFixed(4)}`;
    return crypto
      .createHash("sha256")
      .update(`geo:${normalizedName}|${bucket}`)
      .digest("hex")
      .slice(0, 40);
  }
  return crypto.createHash("sha256").update(`name:${normalizedName}`).digest("hex").slice(0, 40);
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function discoveredPlacesCollection(country, areaId) {
  return firestore
    .collection("countries")
    .doc(country)
    .collection("areas")
    .doc(areaId)
    .collection("discoveredPlaces");
}

function placeToResponse(data, placeNameFallback, extras = {}) {
  const name = data.name || placeNameFallback;
  let googleMapsUrl = data.googleMapsUrl || null;

  if (data.googlePlaceId) {
    const upgraded = buildPlaceMapUrls(
      data.googlePlaceId,
      data.latitude,
      data.longitude,
      name
    );
    if (upgraded.googleMapsUrl) {
      googleMapsUrl = upgraded.googleMapsUrl;
    }
  }
  if (isBrokenPlaceMapsUrl(googleMapsUrl)) {
    googleMapsUrl = null;
  }

  return {
    photoUrl: data.photoUrl || null,
    googleMapsUrl,
    googlePlaceId: data.googlePlaceId || null,
    latitude: data.latitude ?? null,
    longitude: data.longitude ?? null,
    placeName: name,
    discoveredPlaceId: data.id || null,
    fromDiscoveredDb: extras.fromDiscoveredDb !== undefined ? extras.fromDiscoveredDb : true,
    googleApiBilled: extras.googleApiBilled === true,
    resolveOrigin: extras.resolveOrigin || "discovered_place",
  };
}

function cachedPlaceIsValidForRequest(data, anchorLat, anchorLng, maxKm) {
  if (
    typeof data.latitude !== "number" ||
    typeof data.longitude !== "number" ||
    !coordsInGreece(data.latitude, data.longitude)
  ) {
    return false;
  }
  const cap =
    typeof maxKm === "number" && maxKm > 0
      ? maxKm + beyondRadiusBufferKm(maxKm)
      : 30;
  if (typeof anchorLat === "number" && typeof anchorLng === "number") {
    const km = haversineMeters(anchorLat, anchorLng, data.latitude, data.longitude) / 1000;
    if (km > cap) return false;
  }
  return true;
}

function duplicateMatchesRequest(data, normalizedName, title) {
  const existingNorm = data.normalizedName || normalizePlaceName(data.name);
  return namesLikelySame(normalizedName, existingNorm) || placeNamesMatch(title, data.name || "");
}

function buildPlaceMapUrls(googlePlaceId, latitude, longitude, label) {
  const bareId = googlePlaceId ? String(googlePlaceId).replace(/^places\//, "") : null;
  if (bareId) {
    const name = label?.trim() || "place";
    return {
      googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}&query_place_id=${encodeURIComponent(bareId)}`,
      navigateUrl: `https://www.google.com/maps/dir/?api=1&destination_place_id=${encodeURIComponent(bareId)}`,
    };
  }
  if (typeof latitude === "number" && typeof longitude === "number") {
    const coordQuery = `${latitude},${longitude}`;
    return {
      googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(coordQuery)}`,
      navigateUrl: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(coordQuery)}`,
    };
  }
  return { googleMapsUrl: "", navigateUrl: "" };
}

async function findDuplicateDiscoveredPlace(
  country,
  areaId,
  normalizedName,
  latitude,
  longitude,
  googlePlaceId
) {
  const snap = await discoveredPlacesCollection(country, areaId).get();

  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    if (data.status === "hidden") continue;

    if (googlePlaceId && data.googlePlaceId === googlePlaceId) {
      return { id: docSnap.id, data };
    }

    if (normalizedName && data.normalizedName === normalizedName) {
      return { id: docSnap.id, data };
    }

    const existingNorm = data.normalizedName || normalizePlaceName(data.name);
    let distanceMeters = null;

    if (
      typeof latitude === "number" &&
      typeof longitude === "number" &&
      typeof data.latitude === "number" &&
      typeof data.longitude === "number"
    ) {
      distanceMeters = haversineMeters(
        latitude,
        longitude,
        data.latitude,
        data.longitude
      );
    }

    if (
      normalizedName &&
      existingNorm &&
      namesLikelySame(normalizedName, existingNorm) &&
      distanceMeters != null &&
      distanceMeters <= FUZZY_NAME_RADIUS_METERS
    ) {
      return { id: docSnap.id, data };
    }
  }

  return null;
}

function buildMapsSearchUrl(latitude, longitude, label) {
  return buildPlaceMapUrls(null, latitude, longitude, label).googleMapsUrl;
}

/**
 * Turn "Regional Unit of Chania" / "Chania Regional Unit" / "Municipality of Platanias"
 * / "Νομός Χανίων" into the city name we want for City / Master Area.
 */
function normalizeMunicipalityName(name) {
  const n = String(name || "").trim();
  if (!n) return "";
  const prefixed = n.match(
    /^(?:regional\s+unit\s+of|municipality\s+of|municipal\s+unit\s+of|prefecture\s+of|province\s+of|district\s+of)\s+(.+)$/i
  );
  if (prefixed?.[1]) return prefixed[1].trim();
  const suffixed = n.match(
    /^(.+?)\s+(?:regional\s+unit|municipality|municipal\s+unit|prefecture|province)$/i
  );
  if (suffixed?.[1]) return suffixed[1].trim();
  const greek = n.match(/^(?:νομός|δήμος|περιφερειακή\s+ενότητα)\s+(.+)$/i);
  if (greek?.[1]) return greek[1].trim();
  return n;
}

function looksLikeBroadAdmin(name) {
  return /\b(county|parish|shire|oblast|province|prefecture|regional\s+unit|region|departamento|district|kreis|νομός|περιφερ|municipality|municipal\s+unit)\b/i.test(
    String(name || "")
  );
}

/** Prefer compact city names; unwrap "Regional Unit of X" → "X", skip "Travis County". */
function usableCityAdmin(raw) {
  const original = String(raw || "").trim();
  if (!original) return "";
  const normalized = normalizeMunicipalityName(original);
  if (!looksLikeBroadAdmin(original)) return normalized;
  if (
    normalized &&
    normalized.toLowerCase() !== original.toLowerCase() &&
    !looksLikeBroadAdmin(normalized)
  ) {
    return normalized;
  }
  return "";
}

function parseAddressComponents(components) {
  if (!Array.isArray(components)) {
    return { addressLine: "", area: "", city: "", postCode: "", country: "" };
  }

  const get = (...types) => {
    for (const type of types) {
      const match = components.find((c) => c.types?.includes(type));
      if (match) return (match.longText || match.shortText || "").trim();
    }
    return "";
  };

  const sameName = (a, b) =>
    Boolean(a) &&
    Boolean(b) &&
    a.trim().toLowerCase() === b.trim().toLowerCase();

  const streetNumber = get("street_number");
  const route = get("route");
  const addressLine = [streetNumber, route].filter(Boolean).join(" ");

  // Neighborhood / district — never use these for City / Master Area.
  let area = get(
    "neighborhood",
    "sublocality",
    "sublocality_level_1",
    "sublocality_level_2",
    "sublocality_level_3"
  );
  const locality = get("locality");
  const postalTown = get("postal_town");
  const admin3Raw = get("administrative_area_level_3");
  const admin2Raw = get("administrative_area_level_2");
  // Prefer regional unit (admin2 → Chania) over municipality (admin3 → Apokoronas).
  const regionalCity = usableCityAdmin(admin2Raw);
  const municipalityCity = usableCityAdmin(admin3Raw);
  const municipalityAdmin = regionalCity || municipalityCity;

  // Common in GR/EU: Google puts the village in `locality` and the city
  // in administrative_area_level_2 (often "Regional Unit of Chania").
  let city = "";
  if (postalTown && !sameName(postalTown, area) && !sameName(postalTown, locality)) {
    city = postalTown;
  } else if (locality && municipalityAdmin && !sameName(municipalityAdmin, locality)) {
    city = municipalityAdmin;
    if (!area) area = locality;
  } else if (locality && !sameName(locality, area)) {
    city = locality;
  } else {
    city = municipalityAdmin || locality || "";
  }

  // Final guard: City must not keep a village/neighborhood label when a real city exists.
  if ((area || locality) && sameName(city, area || locality)) {
    const better = [postalTown, regionalCity, municipalityCity].find(
      (candidate) => candidate && !sameName(candidate, area || locality)
    );
    if (better) city = better;
  }

  if (!area && locality && city && !sameName(locality, city)) {
    area = locality;
  }

  return {
    addressLine,
    area,
    city,
    postCode: get("postal_code"),
    country: get("country"),
  };
}

function placeRecordFromApiPlace(place, apiKey, skipPhoto, searchQueryFallback) {
  const latitude = place.location?.latitude ?? null;
  const longitude = place.location?.longitude ?? null;

  let photoUrl = null;
  if (!skipPhoto && place.photos && place.photos.length > 0) {
    photoUrl = `https://places.googleapis.com/v1/${place.photos[0].name}/media?maxHeightPx=800&maxWidthPx=800&key=${apiKey}`;
  }

  const placeName = place.displayName?.text || searchQueryFallback || "";
  const mapUrls = buildPlaceMapUrls(place.id || place.name, latitude, longitude, placeName);
  let googleMapsUrl = place.googleMapsUri || mapUrls.googleMapsUrl;
  if (isBrokenPlaceMapsUrl(googleMapsUrl)) {
    googleMapsUrl = mapUrls.googleMapsUrl;
  }
  const googlePlaceId = resolveGooglePlaceIdFromPlace(place, googleMapsUrl);
  const parsedAddress = parseAddressComponents(place.addressComponents);
  const formattedAddress = place.formattedAddress || "";
  // Prefer real street/route. For rural places Google often only has
  // "Neo Chorio 730 03, Greece" — keep village + postcode (drop country), don't blank it.
  let addressLine = parsedAddress.addressLine;
  if (!addressLine && formattedAddress) {
    const stripForStreet = [
      parsedAddress.area,
      parsedAddress.city,
      parsedAddress.postCode,
      parsedAddress.country,
      placeName,
    ].filter(Boolean);
    let candidate = formattedAddress;
    for (const part of stripForStreet) {
      candidate = candidate.replace(
        new RegExp(`(,\\s*)?${part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "ig"),
        ""
      );
    }
    candidate = candidate.replace(/^[\s,]+|[\s,]+$/g, "").trim();
    if (candidate && /[A-Za-zΑ-Ωα-ω]/.test(candidate) && candidate !== parsedAddress.postCode) {
      addressLine = candidate;
    } else {
      let rural = formattedAddress;
      if (parsedAddress.country) {
        rural = rural.replace(
          new RegExp(
            `(,\\s*)?${parsedAddress.country.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`,
            "i"
          ),
          ""
        );
      }
      if (placeName) {
        rural = rural.replace(
          new RegExp(`(,\\s*)?${placeName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "ig"),
          ""
        );
      }
      rural = rural.replace(/^[\s,]+|[\s,]+$/g, "").trim();
      if (rural) {
        addressLine = rural;
      } else {
        addressLine = [parsedAddress.area, parsedAddress.postCode].filter(Boolean).join(" ");
      }
    }
  }

  return {
    googlePlaceId,
    name: placeName,
    rating: place.rating || null,
    description: place.editorialSummary?.text || "",
    category: place.primaryType || "",
    latitude,
    longitude,
    phoneNumber: place.internationalPhoneNumber || place.nationalPhoneNumber || "",
    websiteUri: place.websiteUri || "",
    photoUrl,
    googleMapsUrl,
    navigateUrl: mapUrls.navigateUrl,
    formattedAddress,
    addressLine,
    area: parsedAddress.area,
    city: parsedAddress.city,
    postCode: parsedAddress.postCode,
    country: parsedAddress.country,
  };
}

async function fetchPlaceDetailsById(googlePlaceId, apiKey, options = {}) {
  const bareId = bareGooglePlaceId(googlePlaceId);
  if (!bareId || !/^ChIJ/i.test(bareId)) return null;

  const skipPhoto = options.skipPhoto === true;
  let fieldMask = options.fieldMask || PLACE_DETAILS_FIELD_MASK;
  if (skipPhoto) {
    fieldMask = fieldMask.replace("photos,", "").replace(",photos", "");
  }

  const resourceIds = [bareId];
  for (const resourceId of resourceIds) {
    try {
      const response = await axios.get(
        `https://places.googleapis.com/v1/places/${encodeURIComponent(resourceId)}`,
        {
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": apiKey,
            "X-Goog-FieldMask": fieldMask,
          },
        }
      );
      const data = response.data;
      if (!data?.displayName?.text && !data?.name && !data?.id) continue;
      if (options.usageSource) {
        await recordPlacesApiCall(firestore, {
          endpoint: "place_details",
          source: options.usageSource,
        });
      }
      return placeRecordFromApiPlace(data, apiKey, skipPhoto, "");
    } catch (e) {
      logger.warn(
        `fetchPlaceDetailsById failed for ${resourceId}:`,
        e.response?.data || e.message
      );
    }
  }
  return null;
}

async function fetchPlaceFromGoogle(
  searchQuery,
  apiKey,
  biasLat,
  biasLng,
  requestedTitle,
  options = {}
) {
  const fieldMask = options.fieldMask || PLACES_FIELD_MASK;
  const skipPhoto = options.skipPhoto === true;
  const body = { textQuery: searchQuery, pageSize: 10 };

  const lat = typeof biasLat === "number" ? biasLat : null;
  const lng = typeof biasLng === "number" ? biasLng : null;

  if (lat != null && lng != null) {
    body.locationBias = {
      circle: {
        center: { latitude: lat, longitude: lng },
        radius: 20000,
      },
    };
  }

  const response = await axios.post(
    "https://places.googleapis.com/v1/places:searchText",
    body,
    {
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": fieldMask,
      },
    }
  );
  if (options.usageSource) {
    await recordPlacesApiCall(firestore, {
      endpoint: "text_search",
      source: options.usageSource,
    });
  }

  if (!response.data.places || response.data.places.length === 0) {
    return null;
  }

  const title = requestedTitle || searchQuery;
  let place = pickBestPlaceMatch(response.data.places, title, lat, lng);

  if (!place && title) {
    const exactQuery = `"${title.split(",")[0].trim()}"${searchQuery.includes(",") ? " " + searchQuery.split(",").slice(1).join(",").trim() : ""}`;
    const retry = await axios.post(
      "https://places.googleapis.com/v1/places:searchText",
      { ...body, textQuery: exactQuery.trim() },
      {
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": fieldMask,
        },
      }
    );
    if (options.usageSource) {
      await recordPlacesApiCall(firestore, {
        endpoint: "text_search",
        source: options.usageSource,
      });
    }
    place = pickBestPlaceMatch(retry.data.places || [], title, lat, lng);
  }

  if (!place) {
    place = pickFallbackPlace(response.data.places, title, lat, lng);
  }

  if (
    !place &&
    lat != null &&
    lng != null &&
    typeof options.pickClosestWithinMeters === "number" &&
    options.pickClosestWithinMeters > 0
  ) {
    const operational = (response.data.places || []).filter(isPlaceOperational);
    const closest = pickClosestPlace(operational, lat, lng);
    if (closest) {
      const plat = closest.location?.latitude;
      const plng = closest.location?.longitude;
      if (typeof plat === "number" && typeof plng === "number") {
        const meters = haversineMeters(lat, lng, plat, plng);
        if (meters <= options.pickClosestWithinMeters) {
          place = closest;
        }
      }
    }
  }

  if (!place) {
    logger.warn(
      `No Google place name match for "${title}" among ${response.data.places.length} results`
    );
    return null;
  }

  return placeRecordFromApiPlace(place, apiKey, skipPhoto, searchQuery);
}

async function fetchPlaceNearbyByCoords(lat, lng, apiKey, requestedTitle, options = {}) {
  const fieldMask = options.fieldMask || PLACES_FIELD_MASK;
  const skipPhoto = options.skipPhoto === true;

  try {
    const response = await axios.post(
      "https://places.googleapis.com/v1/places:searchNearby",
      {
        locationRestriction: {
          circle: {
            center: { latitude: lat, longitude: lng },
            radius: 100,
          },
        },
        maxResultCount: 10,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": fieldMask,
        },
      }
    );

    if (options.usageSource) {
      await recordPlacesApiCall(firestore, {
        endpoint: "nearby_search",
        source: options.usageSource,
      });
    }

    const places = response.data.places || [];
    if (!places.length) return null;

    const title = String(requestedTitle || "").trim();
    let place = title ? pickBestPlaceMatch(places, title, lat, lng) : null;
    if (!place && title) place = pickFallbackPlace(places, title, lat, lng);
    if (!place) {
      const operational = places.filter(isPlaceOperational);
      const closest = pickClosestPlace(operational, lat, lng);
      if (closest) {
        const plat = closest.location?.latitude;
        const plng = closest.location?.longitude;
        if (typeof plat === "number" && typeof plng === "number") {
          if (haversineMeters(lat, lng, plat, plng) <= 100) place = closest;
        }
      }
    }

    if (!place) return null;
    return placeRecordFromApiPlace(place, apiKey, skipPhoto, title);
  } catch (e) {
    logger.warn("fetchPlaceNearbyByCoords failed:", e.response?.data || e.message);
    return null;
  }
}

async function resolveHintPlaceId(rawQuery, payload) {
  return (
    bareGooglePlaceId(payload.googlePlaceId) ||
    extractPlaceIdFromMapsUrl(rawQuery) ||
    extractPlaceIdFromPlacesPhotoUrl(payload.photoUrl) ||
    (rawQuery.startsWith("http") ? await resolvePlaceIdFromMapsUrlFetch(rawQuery) : null)
  );
}

async function finishGetGooglePlaceDetailsResponse(place, apiKey, skipPhoto) {
  let photoUrl = place.photoUrl;
  if (photoUrl && !skipPhoto) {
    photoUrl = await ensureStoredPlacePhoto(
      photoUrl,
      placePhotoStoragePath({ googlePlaceId: place.googlePlaceId }),
      apiKey
    );
  }

  return {
    googlePlaceId: place.googlePlaceId,
    name: place.name,
    rating: place.rating,
    description: place.description,
    category: place.category,
    latitude: place.latitude,
    longitude: place.longitude,
    phoneNumber: place.phoneNumber,
    websiteUri: place.websiteUri,
    photoUrl,
    googleMapsUrl: place.googleMapsUrl,
    formattedAddress: place.formattedAddress,
    addressLine: place.addressLine,
    area: place.area,
    city: place.city,
    postCode: place.postCode,
    country: place.country,
  };
}

async function mirrorDiscoveredPlacePhotoIfNeeded(coll, docId, data, country, areaId) {
  const photoUrl = data.photoUrl;
  if (!isGooglePlacesPhotoUrl(photoUrl)) return data;

  const storagePath = placePhotoStoragePath({
    country,
    areaId,
    docId,
    googlePlaceId: data.googlePlaceId,
  });
  const mirrored = await ensureStoredPlacePhoto(photoUrl, storagePath);
  if (!mirrored || mirrored === photoUrl) return data;

  await coll.doc(docId).update({
    photoUrl: mirrored,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return { ...data, photoUrl: mirrored };
}

async function bumpDiscoveredPlaceUsage(coll, id, data, title, country, areaId) {
  const withPhoto = await mirrorDiscoveredPlacePhotoIfNeeded(
    coll,
    id,
    data,
    country,
    areaId
  );
  await coll.doc(id).update({
    usageCount: admin.firestore.FieldValue.increment(1),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    lastMatchedTitle: title,
    alternateTitles: admin.firestore.FieldValue.arrayUnion(title),
  });
  return placeToResponse({ ...withPhoto, id }, title, {
    fromDiscoveredDb: true,
    googleApiBilled: false,
    resolveOrigin: "discovered_place_cache",
  });
}

async function resolveUrlSearchQuery(searchQuery, area) {
  const trimmed = String(searchQuery || "").trim();
  if (!trimmed.startsWith("http")) {
    return appendAreaIfNeeded(trimmed, area);
  }

  const hints = extractMapsUrlHints(trimmed);
  if (hints.placeName && !isGenericMapsTitle(hints.placeName)) {
    return appendAreaIfNeeded(hints.placeName, area);
  }
  if (hints.lat != null && hints.lng != null && !Number.isNaN(hints.lat) && !Number.isNaN(hints.lng)) {
    return appendAreaIfNeeded(`${hints.lat},${hints.lng}`, area);
  }

  let finalUrl = trimmed;
  let html = "";

  // share.google / goo.gl / ?cid= need cookie-aware redirect following.
  // Full maps place URLs can use plain redirect follow.
  if (
    isLikelyMapsShortLink(trimmed) ||
    /share\.google/i.test(trimmed) ||
    /[?&]cid=/i.test(trimmed)
  ) {
    const resolved = await fetchFollowRedirectsWithCookies(trimmed);
    finalUrl = unwrapGoogleContinueUrl(resolved.url);
    html = resolved.text || "";
  } else {
    const res = await fetch(trimmed, {
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    finalUrl = unwrapGoogleContinueUrl(res.url);
    html = await res.text();
  }

  const resolvedHints = extractMapsUrlHints(finalUrl);
  let placeName =
    resolvedHints.placeName && !isGenericMapsTitle(resolvedHints.placeName)
      ? resolvedHints.placeName
      : "";

  if (!placeName && html) {
    const ogMatch =
      html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i);
    if (ogMatch && ogMatch[1]) {
      placeName = ogMatch[1].split(" · ")[0].replace(/&amp;/g, "&").trim();
    } else {
      const titleMatch = html.match(/<title>(.*?)<\/title>/i);
      if (titleMatch && titleMatch[1]) {
        placeName = titleMatch[1].split(" - ")[0].split(" · ")[0].replace(/&amp;/g, "&").trim();
      }
    }
  }

  if (placeName && !isGenericMapsTitle(placeName)) {
    return appendAreaIfNeeded(placeName, area);
  }

  if (
    resolvedHints.lat != null &&
    resolvedHints.lng != null &&
    !Number.isNaN(resolvedHints.lat) &&
    !Number.isNaN(resolvedHints.lng)
  ) {
    return appendAreaIfNeeded(`${resolvedHints.lat},${resolvedHints.lng}`, area);
  }

  throw new Error("Extracted invalid name from URL/HTML.");
}

/** Guest concierge: resolve place via area discoveredPlaces DB (Google import on miss). */
exports.resolvePlacePhoto = onCall(async (request) => {
  const payload = request.data || {};
  const title = sanitizePlaceSearchTitle(String(payload.title || "").trim());
  const area = String(payload.area || "").trim();
  const country = String(payload.country || "").trim();
  const areaId = String(payload.areaId || "").trim();
  const latitude = payload.latitude;
  const longitude = payload.longitude;
  const anchorLat = payload.anchorLat;
  const anchorLng = payload.anchorLng;
  const maxKm = typeof payload.maxKm === "number" ? payload.maxKm : null;
  const knowledgeMode = String(payload.knowledgeMode || "any").trim();
  const usageCaller = normalizeUsageCaller(payload.usageCaller || "guest_ai_concierge");
  const boundaryRing = parseBoundaryRing(payload.boundaryRing);
  const discoverSource = String(payload.discoverSource || "").trim();
  const discoverCategory = String(payload.discoverCategory || "").trim();
  const discoverDescription = String(payload.discoverDescription || "").trim();
  const discoverConfidence = String(payload.discoverConfidence || "")
    .trim()
    .toLowerCase();
  const discoverLocality = String(payload.discoverLocality || "").trim();
  const radarConfidence =
    discoverConfidence === "high" ||
    discoverConfidence === "medium" ||
    discoverConfidence === "low"
      ? discoverConfidence
      : "";

  if (!title) {
    throw new HttpsError("invalid-argument", "Place title is required.");
  }
  if (!country || !areaId) {
    throw new HttpsError("invalid-argument", "Country and areaId are required.");
  }

  const normalizedName = normalizePlaceName(title);
  const coll = discoveredPlacesCollection(country, areaId);

  const biasLat =
    typeof latitude === "number" ? latitude : typeof anchorLat === "number" ? anchorLat : null;
  const biasLng =
    typeof longitude === "number" ? longitude : typeof anchorLng === "number" ? anchorLng : null;

  try {
    const duplicate = await findDuplicateDiscoveredPlace(
      country,
      areaId,
      normalizedName,
      latitude,
      longitude,
      null
    );

    if (
      duplicate &&
      duplicateMatchesRequest(duplicate.data, normalizedName, title) &&
      cachedPlaceIsValidForRequest(duplicate.data, biasLat, biasLng, maxKm)
    ) {
      const cacheCheck = validateResolvedPlace(
        placeRecordForValidation(duplicate.data, title),
        title,
        biasLat,
        biasLng,
        maxKm,
        knowledgeMode
      );
      if (!cacheCheck.ok) {
        logger.warn(
          `Rejected cached place "${duplicate.data.name}" for "${title}" — ${cacheCheck.reason}`
        );
        return { photoUrl: null, googleMapsUrl: null, googlePlaceId: null, notFound: true };
      }
      return bumpDiscoveredPlaceUsage(coll, duplicate.id, duplicate.data, title, country, areaId);
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      logger.error("Missing GOOGLE_MAPS_API_KEY environment variable.");
      throw new HttpsError("internal", "Server configuration error.");
    }

    let place = null;
    let searchQuery = "";
    for (const variant of placeSearchTitleVariants(title)) {
      searchQuery = [variant, area, country].filter(Boolean).join(", ");
      place = await fetchPlaceFromGoogle(searchQuery, apiKey, biasLat, biasLng, variant, {
        usageSource: usageCaller,
      });
      if (place) break;
    }

    if (!place) {
      return { photoUrl: null, googleMapsUrl: null, googlePlaceId: null, notFound: true };
    }

    if (!placeNamesMatch(title, place.name || "")) {
      logger.warn(`Rejected Google result "${place.name}" for requested "${title}"`);
      return { photoUrl: null, googleMapsUrl: null, googlePlaceId: null, notFound: true };
    }

    const geoCheck = validateResolvedPlace(
      place,
      title,
      biasLat,
      biasLng,
      maxKm,
      knowledgeMode
    );
    if (!geoCheck.ok) {
      logger.warn(
        `Rejected Google result "${place.name}" for "${title}" — ${geoCheck.reason}`
      );
      return { photoUrl: null, googleMapsUrl: null, googlePlaceId: null, notFound: true };
    }

    const resolvedLat = place.latitude ?? latitude ?? null;
    const resolvedLng = place.longitude ?? longitude ?? null;

    if (
      boundaryRing &&
      typeof resolvedLat === "number" &&
      typeof resolvedLng === "number" &&
      !pointInPolygon(resolvedLat, resolvedLng, boundaryRing)
    ) {
      logger.warn(
        `Rejected Google result "${place.name}" for "${title}" — outside_radar_polygon`
      );
      return { photoUrl: null, googleMapsUrl: null, googlePlaceId: null, notFound: true };
    }

    const resolvedNorm = normalizePlaceName(place.name || title);

    const geoDuplicate = await findDuplicateDiscoveredPlace(
      country,
      areaId,
      resolvedNorm,
      resolvedLat,
      resolvedLng,
      place.googlePlaceId
    );

    if (
      geoDuplicate &&
      duplicateMatchesRequest(geoDuplicate.data, normalizedName, title) &&
      cachedPlaceIsValidForRequest(geoDuplicate.data, biasLat, biasLng, maxKm)
    ) {
      return bumpDiscoveredPlaceUsage(coll, geoDuplicate.id, geoDuplicate.data, title, country, areaId);
    }

    const docId = stablePlaceDocId(
      place.googlePlaceId,
      resolvedNorm,
      resolvedLat,
      resolvedLng
    );
    const docRef = coll.doc(docId);

    let mirroredPhotoUrl = place.photoUrl || null;
    if (mirroredPhotoUrl) {
      mirroredPhotoUrl = await ensureStoredPlacePhoto(
        mirroredPhotoUrl,
        placePhotoStoragePath({
          country,
          areaId,
          docId,
          googlePlaceId: place.googlePlaceId,
        })
      );
    }

    const newDoc = {
      name: place.name || title,
      normalizedName: resolvedNorm,
      googlePlaceId: place.googlePlaceId || null,
      category: discoverCategory || place.category || "",
      googleCategories: (discoverCategory || place.category)
        ? [String(discoverCategory || place.category).trim().toLowerCase()].filter(Boolean)
        : [],
      description: discoverDescription || place.description || "",
      latitude: resolvedLat,
      longitude: resolvedLng,
      googleMapsUrl: place.googleMapsUrl || null,
      photoUrl: mirroredPhotoUrl,
      rating: place.rating ?? null,
      phoneNumber: place.phoneNumber || "",
      websiteUri: place.websiteUri || "",
      searchQuery,
      source: discoverSource || "google",
      status: "active",
      needsReview: true,
      reviewStatus: "new",
      usageCount: 1,
      lastMatchedTitle: title,
      alternateTitles: [title],
      promotedToLocalGemId: null,
      firstSeenAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      ...(radarConfidence ? { radarConfidence } : {}),
      ...(discoverLocality ? { locality: discoverLocality } : {}),
      ...(discoverSource === "admin_radar"
        ? { radarWhyRecommend: discoverDescription || place.description || "" }
        : {}),
    };

    let savedData = newDoc;
    await firestore.runTransaction(async (t) => {
      const snap = await t.get(docRef);
      if (snap.exists) {
        t.update(docRef, {
          usageCount: admin.firestore.FieldValue.increment(1),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          lastMatchedTitle: title,
          alternateTitles: admin.firestore.FieldValue.arrayUnion(title),
        });
        savedData = { ...snap.data(), id: docId };
      } else {
        t.set(docRef, newDoc);
        savedData = { ...newDoc, id: docId };
      }
    });

    savedData = await mirrorDiscoveredPlacePhotoIfNeeded(
      coll,
      docId,
      savedData,
      country,
      areaId
    );
    return placeToResponse(savedData, title, {
      fromDiscoveredDb: true,
      googleApiBilled: true,
      resolveOrigin: "google",
    });
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    logger.error("resolvePlacePhoto error:", error.response?.data || error.message);
    throw new HttpsError("internal", "Failed to resolve place photo.");
  }
});

/** Mirror a metered Google photo URL to Firebase Storage (no Text Search). */
exports.mirrorPlacePhoto = onCall(async (request) => {
  const payload = request.data || {};
  const photoUrl = String(payload.photoUrl || "").trim();
  if (!photoUrl) {
    throw new HttpsError("invalid-argument", "photoUrl is required.");
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    logger.error("Missing GOOGLE_MAPS_API_KEY environment variable.");
    throw new HttpsError("failed-precondition", "Photo mirroring is not configured.");
  }

  const country = String(payload.country || "").trim();
  const areaId = String(payload.areaId || "").trim();
  const docId = String(payload.docId || "").trim();
  const googlePlaceId = String(payload.googlePlaceId || "").trim() || null;
  const propertyId = String(payload.propertyId || "").trim();
  const propertyTypeId = String(payload.propertyTypeId || "").trim();
  const propertyGemId = String(payload.propertyGemId || "").trim();

  const storagePath =
    placePhotoStoragePath({
      country: country || undefined,
      areaId: areaId || undefined,
      docId: docId || undefined,
      googlePlaceId,
      propertyId: propertyId || undefined,
      propertyTypeId: propertyTypeId || undefined,
      propertyGemId: propertyGemId || undefined,
    }) || undefined;

  const mirrored = await ensureStoredPlacePhoto(photoUrl, storagePath, apiKey);
  return { photoUrl: mirrored || null };
});

exports.recordGuestDiscoveredMention = onCall(async (request) => {
  const payload = request.data || {};
  const name = String(payload.name || "").trim();
  const country = String(payload.country || "").trim();
  const areaId = String(payload.areaId || "").trim();
  const category = String(payload.category || "").trim();
  const description = String(payload.description || "").trim();
  const failureReason = String(payload.failureReason || "").trim();

  if (!name || !country || !areaId) {
    throw new HttpsError("invalid-argument", "name, country, and areaId are required.");
  }

  const coll = discoveredPlacesCollection(country, areaId);
  const normalizedName = normalizePlaceName(name);
  const docId = stablePlaceDocId(null, normalizedName, null, null);
  const docRef = coll.doc(docId);

  await firestore.runTransaction(async (t) => {
    const snap = await t.get(docRef);
    if (snap.exists) {
      const updates = {
        usageCount: admin.firestore.FieldValue.increment(1),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastMatchedTitle: name,
        alternateTitles: admin.firestore.FieldValue.arrayUnion(name),
      };
      if (failureReason) updates.lastFailureReason = failureReason;
      if (category) updates.category = category;
      t.update(docRef, updates);
    } else {
      t.set(docRef, {
        name,
        normalizedName,
        category,
        description,
        googlePlaceId: null,
        latitude: null,
        longitude: null,
        googleMapsUrl: null,
        photoUrl: null,
        rating: null,
        phoneNumber: "",
        websiteUri: "",
        searchQuery: "",
        source: "ai_guest",
        status: "active",
        needsReview: true,
        reviewStatus: "new",
        usageCount: 1,
        lastMatchedTitle: name,
        lastFailureReason: failureReason,
        alternateTitles: [name],
        promotedToLocalGemId: null,
        firstSeenAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  });

  return { ok: true, id: docId };
});

exports.getGooglePlaceDetails = onCall(
  {
    region: "us-central1",
    timeoutSeconds: 120,
    memory: "1GiB",
  },
  async (request) => {
  const payload = request.data || {};
  let searchQuery = payload.searchQuery;
  const area = payload.area || "";
  const fallbackName = String(payload.fallbackName || "").trim();

  if (!searchQuery) {
    throw new HttpsError("invalid-argument", "The search query is missing.");
  }

  const rawQuery = String(searchQuery).trim();
  let urlHints = rawQuery.startsWith("http") ? extractMapsUrlHints(rawQuery) : null;

  // maps.app.goo.gl / share / ?cid= links need expand before Places search.
  let expandedMapsUrl = rawQuery;
  if (
    rawQuery.startsWith("http") &&
    (isLikelyMapsShortLink(rawQuery) || extractCidFromMapsUrl(rawQuery))
  ) {
    try {
      const expanded = await expandMapsShortLink(rawQuery);
      if (expanded.url && expanded.url !== rawQuery) {
        expandedMapsUrl = expanded.url;
        const expandedHints = extractMapsUrlHints(expanded.url);
        urlHints = {
          placeName: expandedHints.placeName || expanded.placeName || urlHints?.placeName || "",
          lat:
            expandedHints.lat != null
              ? expandedHints.lat
              : expanded.lat != null
                ? expanded.lat
                : urlHints?.lat ?? null,
          lng:
            expandedHints.lng != null
              ? expandedHints.lng
              : expanded.lng != null
                ? expanded.lng
                : urlHints?.lng ?? null,
        };
        logger.info("Expanded Maps short link", {
          from: rawQuery,
          to: expanded.url,
          placeName: urlHints.placeName || null,
          hasCoords: urlHints.lat != null && urlHints.lng != null,
        });
      } else if (expanded.placeName || (expanded.lat != null && expanded.lng != null)) {
        urlHints = {
          placeName: expanded.placeName || urlHints?.placeName || "",
          lat: expanded.lat != null ? expanded.lat : urlHints?.lat ?? null,
          lng: expanded.lng != null ? expanded.lng : urlHints?.lng ?? null,
        };
      }
    } catch (e) {
      logger.warn("Maps short-link expand failed; continuing with raw URL:", e.message || e);
    }
  }

  let biasLat =
    asCoord(payload.biasLat) ??
    asCoord(payload.fallbackLat) ??
    (urlHints?.lat != null ? urlHints.lat : null);
  let biasLng =
    asCoord(payload.biasLng) ??
    asCoord(payload.fallbackLng) ??
    (urlHints?.lng != null ? urlHints.lng : null);

  let matchTitle =
    (urlHints?.placeName && !isGenericMapsTitle(urlHints.placeName)
      ? urlHints.placeName
      : "") ||
    fallbackName ||
    (rawQuery.startsWith("http") ? "" : rawQuery);
  const mapsCid = extractCidFromMapsUrl(rawQuery) || extractCidFromMapsUrl(expandedMapsUrl);

  let hintPlaceId = await resolveHintPlaceId(expandedMapsUrl, payload);
  // Hex feature ids (0x…:0x…) are not valid Places API (New) resource ids.
  if (hintPlaceId && !/^ChIJ/i.test(hintPlaceId)) {
    logger.info("Ignoring non-ChIJ place id from Maps URL; will use name/coords search", {
      hintPlaceId,
    });
    hintPlaceId = null;
  }

  if (payload.hintsOnly === true) {
    const coordInQuery = String(searchQuery).match(/^(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)$/);
    const latitude = coordInQuery
      ? parseFloat(coordInQuery[1])
      : urlHints?.lat != null
        ? urlHints.lat
        : biasLat;
    const longitude = coordInQuery
      ? parseFloat(coordInQuery[2])
      : urlHints?.lng != null
        ? urlHints.lng
        : biasLng;

    return {
      googlePlaceId: hintPlaceId && /^ChIJ/i.test(hintPlaceId) ? hintPlaceId : null,
      name: matchTitle || rawQuery,
      rating: null,
      description: "",
      category: "",
      latitude,
      longitude,
      phoneNumber: "",
      websiteUri: "",
      photoUrl: null,
      googleMapsUrl: rawQuery,
      formattedAddress: "",
      addressLine: "",
      area: "",
      city: "",
      postCode: "",
      country: "",
    };
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    logger.error("Missing GOOGLE_MAPS_API_KEY environment variable.");
    throw new HttpsError("internal", "Server configuration error.");
  }

  const skipPhoto = payload.skipPhoto === true;
  const usageSource = normalizeUsageCaller(payload.usageCaller);
  const fieldMask = skipPhoto
    ? PLACES_FIELD_MASK.replace("places.photos,", "")
    : PLACES_FIELD_MASK;
  const searchOptions = {
    fieldMask,
    skipPhoto,
    pickClosestWithinMeters: 300,
    usageSource,
  };

  try {
    if ((!hintPlaceId || !/^ChIJ/i.test(hintPlaceId)) && mapsCid) {
      const fromCid = await resolvePlaceHintsFromCid(mapsCid, apiKey, usageSource);
      if (fromCid?.placeId && /^ChIJ/i.test(fromCid.placeId)) {
        hintPlaceId = fromCid.placeId;
      }
      if (fromCid?.placeName && !isGenericMapsTitle(fromCid.placeName)) {
        matchTitle = matchTitle || fromCid.placeName;
      }
      if (biasLat == null && fromCid?.lat != null) biasLat = fromCid.lat;
      if (biasLng == null && fromCid?.lng != null) biasLng = fromCid.lng;
    }

    if (hintPlaceId && /^ChIJ/i.test(hintPlaceId)) {
      const byId = await fetchPlaceDetailsById(hintPlaceId, apiKey, {
        skipPhoto,
        usageSource,
      });
      if (byId) {
        return finishGetGooglePlaceDetailsResponse(byId, apiKey, skipPhoto);
      }
      logger.warn(`Place Details lookup missed for ${hintPlaceId}; falling back to text search.`);
    }

    // If short-link expand already gave a place name, search with that (+ optional area).
    if (matchTitle && !/^https?:\/\//i.test(matchTitle) && !/^-?\d+\.\d+\s*,\s*-?\d+\.\d+$/.test(matchTitle)) {
      searchQuery = appendAreaIfNeeded(matchTitle, area);
    }

    // CID share links often hit Google consent / JS shells — skip HTML scrape only when we
    // still have no place id AND no name/coords from CID preview resolution.
    const cidUnresolved =
      Boolean(mapsCid) &&
      !(hintPlaceId && /^ChIJ/i.test(hintPlaceId)) &&
      !matchTitle &&
      !(biasLat != null && biasLng != null);
    if (!cidUnresolved) {
      // Only scrape/resolve URL when we still lack a usable place title.
      const needsUrlResolve =
        !matchTitle ||
        /^https?:\/\//i.test(String(searchQuery || "")) ||
        String(searchQuery || "").trim() === rawQuery;
      if (needsUrlResolve) {
        try {
          searchQuery = await resolveUrlSearchQuery(
            expandedMapsUrl.startsWith("http") ? expandedMapsUrl : rawQuery,
            area
          );
          matchTitle = matchTitleFromResolvedQuery(searchQuery, area) || matchTitle;
        } catch (e) {
          if (!hintPlaceId && !fallbackName && !matchTitle && biasLat == null) {
            logger.error("CRITICAL: Link resolution blocked:", e);
            throw new HttpsError(
              "invalid-argument",
              "Could not read that Maps link. Paste a full google.com/maps/place URL, maps.app.goo.gl, or share.google link."
            );
          }
          logger.info("Maps link resolution fallback:", e.message || e);
          if (fallbackName) {
            searchQuery = appendAreaIfNeeded(fallbackName, area);
            matchTitle = fallbackName;
          } else if (matchTitle) {
            searchQuery = appendAreaIfNeeded(matchTitle, area);
          } else if (biasLat != null && biasLng != null) {
            searchQuery = appendAreaIfNeeded(`${biasLat},${biasLng}`, area);
          }
        }
      }
    } else {
      logger.info("Skipping HTML Maps scrape for unresolved CID link", {
        cid: mapsCid,
      });
    }

    if (!cidUnresolved || matchTitle || (biasLat != null && biasLng != null)) {
      if (
        (!searchQuery || /^https?:\/\//i.test(String(searchQuery)) || String(searchQuery).includes("cid=")) &&
        matchTitle
      ) {
        searchQuery = appendAreaIfNeeded(matchTitle, area);
      }

      let place = await fetchPlaceFromGoogle(
        searchQuery,
        apiKey,
        biasLat,
        biasLng,
        matchTitle,
        searchOptions
      );
      if (place) {
        return finishGetGooglePlaceDetailsResponse(place, apiKey, skipPhoto);
      }

      if (fallbackName) {
        const fallbackQuery = appendAreaIfNeeded(fallbackName, area);
        place = await fetchPlaceFromGoogle(
          fallbackQuery,
          apiKey,
          biasLat,
          biasLng,
          fallbackName,
          searchOptions
        );
        if (place) {
          return finishGetGooglePlaceDetailsResponse(place, apiKey, skipPhoto);
        }
      }

      if (biasLat != null && biasLng != null) {
        place = await fetchPlaceNearbyByCoords(
          biasLat,
          biasLng,
          apiKey,
          fallbackName || matchTitle,
          searchOptions
        );
        if (place) {
          return finishGetGooglePlaceDetailsResponse(place, apiKey, skipPhoto);
        }
      }
    }

    if (mapsCid) {
      throw new HttpsError(
        "invalid-argument",
        "This Maps link uses a short cid= share format we could not resolve. Open the link in your browser, wait until the place page loads, copy the address-bar URL (it should contain /maps/place/), paste that, then click Magic Fill again."
      );
    }

    throw new HttpsError("not-found", "Place not found on Google.");
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    logger.error("Google API Error:", error.response?.data || error.message);
    throw new HttpsError("internal", "Failed to fetch Google Place data.");
  }
});

/**
 * Search Places nearby for one includedType; return operational places.
 */
async function searchNearbyPlacesByType({
  lat,
  lng,
  includedType,
  radiusMeters,
  apiKey,
  fieldMask,
  usageSource,
  rankPreference,
  maxFetch,
}) {
  const body = {
    locationRestriction: {
      circle: {
        center: { latitude: lat, longitude: lng },
        radius: Math.min(Math.max(Number(radiusMeters) || 5000, 100), 50000),
      },
    },
    includedTypes: [includedType],
    maxResultCount: Math.min(Math.max(Number(maxFetch) || 10, 1), 20),
    rankPreference:
      String(rankPreference || "DISTANCE").toUpperCase() === "POPULARITY"
        ? "POPULARITY"
        : "DISTANCE",
  };

  const response = await axios.post(
    "https://places.googleapis.com/v1/places:searchNearby",
    body,
    {
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": fieldMask,
      },
      timeout: 25000,
    }
  );

  if (usageSource) {
    await recordPlacesApiCall(firestore, {
      endpoint: "nearby_search",
      source: usageSource,
    });
  }

  return (response.data?.places || []).filter(isPlaceOperational);
}

/** Text Search near a pin — critical for airports/ports/pharmacies Google nearby misses. */
async function searchTextPlacesNear({
  lat,
  lng,
  textQuery,
  radiusMeters,
  apiKey,
  fieldMask,
  usageSource,
  maxFetch,
}) {
  const q = String(textQuery || "").trim();
  if (!q) return [];

  const body = {
    textQuery: q,
    pageSize: Math.min(Math.max(Number(maxFetch) || 10, 1), 20),
    locationBias: {
      circle: {
        center: { latitude: lat, longitude: lng },
        radius: Math.min(Math.max(Number(radiusMeters) || 20000, 100), 50000),
      },
    },
  };

  const response = await axios.post(
    "https://places.googleapis.com/v1/places:searchText",
    body,
    {
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": fieldMask,
      },
      timeout: 25000,
    }
  );

  if (usageSource) {
    await recordPlacesApiCall(firestore, {
      endpoint: "text_search",
      source: usageSource,
    });
  }

  return (response.data?.places || []).filter(isPlaceOperational);
}

function placeNameLower(place) {
  return String(place?.displayName?.text || "").toLowerCase();
}

function filterEssentialCandidates(places, slot, lat, lng) {
  const slotId = String(slot?.id || "");
  const requireIncludes = Array.isArray(slot.requireNameIncludes)
    ? slot.requireNameIncludes.map((s) => String(s || "").toLowerCase()).filter(Boolean)
    : [];
  const excludeIncludes = Array.isArray(slot.excludeNameIncludes)
    ? slot.excludeNameIncludes.map((s) => String(s || "").toLowerCase()).filter(Boolean)
    : [];
  const minRatings = Number(slot.minUserRatings) || 0;
  const radiusMeters = Math.min(Math.max(Number(slot.radiusMeters) || 50000, 100), 50000);
  const isTransportHub = slotId === "airport" || slotId === "port";

  let out = places.filter((p) => {
    const name = placeNameLower(p);
    const reviews = typeof p.userRatingCount === "number" ? p.userRatingCount : 0;
    const pLat = p.location?.latitude;
    const pLng = p.location?.longitude;
    if (typeof pLat === "number" && typeof pLng === "number") {
      if (haversineMeters(lat, lng, pLat, pLng) > radiusMeters * 1.15) return false;
    }
    if (excludeIncludes.some((ex) => name.includes(ex))) return false;
    if (requireIncludes.length && !requireIncludes.some((inc) => name.includes(inc))) {
      return false;
    }

    // Airports: passenger/international only — never helipads or navy fields.
    if (slotId === "airport") {
      if (/helipad|heliport|ελικοδρ|navy|ναύσταθ|military|airfield|airstrip/.test(name)) {
        return false;
      }
      const looksPassenger =
        /international|διεθν|airport|αεροδρ|αερολιμ/.test(name) &&
        !/helipad|heliport|ελικοδρ/.test(name);
      if (!looksPassenger) return false;
      // Soft pass for clearly named international airports even if rating count is missing.
      if (minRatings > 0 && reviews < minRatings && !/international|διεθν/.test(name)) {
        return false;
      }
      if (minRatings > 0 && reviews < minRatings && reviews > 0 && reviews < 50) {
        return false;
      }
    }

    // Ports: main ferry ports (Souda, etc.) — not marinas / beaches.
    if (slotId === "port") {
      if (/marina|μαρίνα|yacht|beach|πλαζ/.test(name)) return false;
      const looksFerryPort =
        /souda|σούδα|ferry|λιμάν|λιμαν|harbour|harbor|port of/.test(name) ||
        (/\bport\b/.test(name) && reviews >= minRatings);
      if (!looksFerryPort) return false;
      if (minRatings > 0 && reviews < minRatings && !/souda|σούδα/.test(name)) {
        return false;
      }
    }

    if (!isTransportHub && minRatings > 0 && reviews < minRatings) {
      if (!(requireIncludes.length && reviews >= Math.min(10, minRatings))) return false;
    }
    return true;
  });

  // Transport hubs: pick the biggest (by reviews) first, then order those by distance for UX.
  if (isTransportHub) {
    out.sort((a, b) => {
      const ra = typeof a.userRatingCount === "number" ? a.userRatingCount : 0;
      const rb = typeof b.userRatingCount === "number" ? b.userRatingCount : 0;
      if (rb !== ra) return rb - ra;
      const aLat = a.location?.latitude;
      const aLng = a.location?.longitude;
      const bLat = b.location?.latitude;
      const bLng = b.location?.longitude;
      const da =
        typeof aLat === "number" && typeof aLng === "number"
          ? haversineMeters(lat, lng, aLat, aLng)
          : Number.POSITIVE_INFINITY;
      const db =
        typeof bLat === "number" && typeof bLng === "number"
          ? haversineMeters(lat, lng, bLat, bLng)
          : Number.POSITIVE_INFINITY;
      return da - db;
    });
    return out;
  }

  out.sort((a, b) => {
    const aLat = a.location?.latitude;
    const aLng = a.location?.longitude;
    const bLat = b.location?.latitude;
    const bLng = b.location?.longitude;
    const da =
      typeof aLat === "number" && typeof aLng === "number"
        ? haversineMeters(lat, lng, aLat, aLng)
        : Number.POSITIVE_INFINITY;
    const db =
      typeof bLat === "number" && typeof bLng === "number"
        ? haversineMeters(lat, lng, bLat, bLng)
        : Number.POSITIVE_INFINITY;
    return da - db;
  });

  return out;
}

/**
 * Find nearby places for each essential slot (multiple per category, closest→farthest).
 * Used by Add Property step 2.
 */
exports.findNearestEssentialPlaces = onCall(
  {
    region: "us-central1",
    timeoutSeconds: 180,
    memory: "1GiB",
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Sign in required.");
    }

    const payload = request.data || {};
    const lat = asCoord(payload.latitude);
    const lng = asCoord(payload.longitude);
    if (lat == null || lng == null) {
      throw new HttpsError("invalid-argument", "Property latitude and longitude are required.");
    }

    const slots = Array.isArray(payload.slots) ? payload.slots : [];
    if (!slots.length) {
      throw new HttpsError("invalid-argument", "At least one essential slot is required.");
    }
    if (slots.length > 30) {
      throw new HttpsError("invalid-argument", "Too many essential slots in one request.");
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      logger.error("Missing GOOGLE_MAPS_API_KEY environment variable.");
      throw new HttpsError("internal", "Server configuration error.");
    }

    const usageSource = normalizeUsageCaller(
      payload.usageCaller || "property_setup_essentials"
    );
    const skipPhoto = payload.skipPhoto === true;
    const fieldMaskBase = skipPhoto
      ? PLACES_FIELD_MASK.replace("places.photos,", "")
      : PLACES_FIELD_MASK;
    const fieldMask = fieldMaskBase.includes("userRatingCount")
      ? fieldMaskBase
      : `${fieldMaskBase},places.userRatingCount`;

    const results = [];

    for (const slot of slots) {
      const slotId = String(slot?.id || "").trim();
      const label = String(slot?.label || slotId).trim();
      const section = String(slot?.section || "").trim();
      const includedTypes = Array.isArray(slot?.includedTypes)
        ? slot.includedTypes.map((t) => String(t || "").trim()).filter(Boolean)
        : [];
      const textQueries = [
        ...(Array.isArray(slot?.textQueries)
          ? slot.textQueries.map((t) => String(t || "").trim()).filter(Boolean)
          : []),
        ...(String(slot?.textQuery || "").trim()
          ? [String(slot.textQuery).trim()]
          : []),
      ];
      const radiusMeters = Number(slot?.radiusMeters) || 5000;
      const maxResults = Math.min(Math.max(Number(slot?.maxResults) || 1, 1), 10);
      const rankPreference = String(slot?.rankPreference || "DISTANCE").toUpperCase();

      if (!slotId || (!includedTypes.length && !textQueries.length)) {
        results.push({ slotId, label, section, found: false, places: [], place: null });
        continue;
      }

      const merged = [];
      const seenIds = new Set();
      const pushBatch = (batch) => {
        for (const raw of batch || []) {
          const id =
            bareGooglePlaceId(raw.id || raw.name) ||
            `${raw.displayName?.text}-${raw.location?.latitude}`;
          if (seenIds.has(id)) continue;
          seenIds.add(id);
          merged.push(raw);
        }
      };

      for (const includedType of includedTypes) {
        try {
          // eslint-disable-next-line no-await-in-loop
          pushBatch(
            await searchNearbyPlacesByType({
              lat,
              lng,
              includedType,
              radiusMeters,
              apiKey,
              fieldMask,
              usageSource,
              rankPreference,
              maxFetch: Math.max(maxResults, 12),
            })
          );
        } catch (e) {
          logger.warn("Essential nearby search failed", {
            slotId,
            includedType,
            message: e?.response?.data || e?.message || e,
          });
        }
      }

      for (const tq of textQueries) {
        try {
          // eslint-disable-next-line no-await-in-loop
          pushBatch(
            await searchTextPlacesNear({
              lat,
              lng,
              textQuery: tq,
              radiusMeters,
              apiKey,
              fieldMask,
              usageSource,
              maxFetch: Math.max(maxResults, 10),
            })
          );
        } catch (e) {
          logger.warn("Essential text search failed", {
            slotId,
            textQuery: tq,
            message: e?.response?.data || e?.message || e,
          });
        }
      }

      const filtered = filterEssentialCandidates(merged, slot, lat, lng);
      const top = filtered.slice(0, maxResults);
      const placesOut = [];

      for (const raw of top) {
        const place = placeRecordFromApiPlace(raw, apiKey, skipPhoto, "");
        if (!place?.name) continue;

        let photoUrl = place.photoUrl || null;
        if (photoUrl && !skipPhoto) {
          try {
            // eslint-disable-next-line no-await-in-loop
            photoUrl = await ensureStoredPlacePhoto(
              photoUrl,
              placePhotoStoragePath({ googlePlaceId: place.googlePlaceId }),
              apiKey
            );
          } catch (e) {
            logger.warn("Essential place photo mirror failed:", e.message || e);
            photoUrl = place.photoUrl || null;
          }
        }

        const distanceMeters =
          typeof place.latitude === "number" && typeof place.longitude === "number"
            ? Math.round(haversineMeters(lat, lng, place.latitude, place.longitude))
            : null;

        placesOut.push({
          name: place.name || "",
          address: place.formattedAddress || place.addressLine || "",
          phoneNumber: place.phoneNumber || "",
          latitude: place.latitude,
          longitude: place.longitude,
          googlePlaceId: place.googlePlaceId || "",
          googleMapsUrl: place.googleMapsUrl || "",
          photoUrl,
          rating: place.rating,
          userRatingCount:
            typeof raw.userRatingCount === "number" ? raw.userRatingCount : null,
          distanceMeters,
          primaryType: place.category || "",
        });
      }

      placesOut.sort((a, b) => (a.distanceMeters ?? 1e12) - (b.distanceMeters ?? 1e12));

      results.push({
        slotId,
        label,
        section,
        found: placesOut.length > 0,
        places: placesOut,
        // Back-compat for older clients
        place: placesOut[0] || null,
      });
    }

    return { latitude: lat, longitude: lng, results };
  }
);

const MAGIC_FILL_UNIT_COST = MAGIC_FILL_LEGACY_UNIT;

async function queryBigQueryBilling(tableId, invoiceMonth) {
  const { BigQuery } = require("@google-cloud/bigquery");
  const bigquery = new BigQuery();
  const location = process.env.BILLING_BQ_LOCATION || "US";

  // FIX: We changed the aliases to 'service_name' and 'final_cost' to remove ambiguity
  const query = `
    SELECT
      service.description AS service_name,
      ROUND(SUM(cost) + SUM(IFNULL((SELECT SUM(c.amount) FROM UNNEST(credits) c), 0)), 4) AS final_cost
    FROM \`${tableId}\`
    WHERE invoice.month = @invoiceMonth
    GROUP BY service.description
    HAVING final_cost != 0
    ORDER BY final_cost DESC
    LIMIT 50
  `;

  const [job] = await bigquery.createQueryJob({
    query,
    params: { invoiceMonth },
    location,
  });
  const [rows] = await job.getQueryResults();

  // FIX: Updated the mapping to match the new aliases
  const lineItems = rows.map((row) => ({
    label: row.service_name || "Unknown service",
    cost: Number(row.final_cost) || 0,
  }));
  
  const totalCost = lineItems.reduce((sum, item) => sum + item.cost, 0);

  return { totalCost, lineItems, currency: "USD" };
}

async function buildUsageLedger(monthKey) {
  const usageSnap = await firestore.collection("platformUsage").doc(monthKey).get();
  const usage = usageSnap.data() || {};
  const breakdown = breakdownFromUsageDoc(usage);
  const magicFill = typeof usage.magicFill === "number" ? usage.magicFill : breakdown.placesTotal;
  const estimated =
    breakdown.estimatedCostUsd > 0
      ? breakdown.estimatedCostUsd
      : magicFill * MAGIC_FILL_UNIT_COST;

  const lineItems = [
    ...breakdown.byEndpoint.map((row) => ({
      label: row.label,
      cost: row.cost,
      count: row.count,
      kind: "endpoint",
    })),
    ...breakdown.bySource.map((row) => ({
      label: row.label,
      cost: row.count * MAGIC_FILL_UNIT_COST,
      count: row.count,
      kind: "source",
    })),
  ];

  if (lineItems.length === 0 && magicFill > 0) {
    lineItems.push({
      label: "Places API (tracked calls, legacy estimate)",
      cost: magicFill * MAGIC_FILL_UNIT_COST,
      count: magicFill,
      kind: "legacy",
    });
  }

  return {
    totalCost: estimated,
    lineItems,
    currency: "USD",
    magicFill,
    placesBreakdown: breakdown,
  };
}

exports.getBillingInvoice = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in to view billing.");
  }

  const payload = request.data || {};
  const monthKey =
    typeof payload.monthKey === "string" && /^\d{4}-\d{2}$/.test(payload.monthKey)
      ? payload.monthKey
      : new Date().toISOString().slice(0, 7);
  const invoiceMonth = monthKey.replace("-", "");
  const bqTable = process.env.BILLING_BQ_TABLE;

  if (bqTable) {
    try {
      const summary = await queryBigQueryBilling(bqTable, invoiceMonth);
      await firestore.collection("platformBilling").doc(monthKey).set(
        {
          source: "bigquery",
          monthKey,
          invoiceMonth,
          totalCost: summary.totalCost,
          lineItems: summary.lineItems,
          currency: summary.currency,
          syncedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return {
        source: "bigquery",
        configured: true,
        monthKey,
        totalCost: summary.totalCost,
        lineItems: summary.lineItems,
        currency: summary.currency,
      };
    } catch (error) {
      logger.error("BigQuery billing query failed:", error.message || error);
      const ledger = await buildUsageLedger(monthKey);
      return {
        source: "ledger",
        configured: true,
        bigQueryError: error.message || "BigQuery query failed",
        monthKey,
        totalCost: ledger.totalCost,
        lineItems: ledger.lineItems,
        currency: ledger.currency,
        magicFill: ledger.magicFill,
        note: "BigQuery is configured but the query failed. Showing usage ledger instead.",
      };
    }
  }

  const ledger = await buildUsageLedger(monthKey);
  return {
    source: "ledger",
    configured: false,
    monthKey,
    totalCost: ledger.totalCost,
    lineItems: ledger.lineItems,
    currency: ledger.currency,
    magicFill: ledger.magicFill,
    note:
      "Set BILLING_BQ_TABLE on Cloud Functions to your billing export table for full GCP costs.",
  };
});

/** Area admin: load one AllTrails trail page into the Local Trails form. */
exports.getAllTrailsTrailDetails = onCall(
  {
    timeoutSeconds: 60,
    memory: "256MiB",
    enforceAppCheck: false,
  },
  getAllTrailsTrailDetailsHandler
);

/** Platform admin: Q&A grounded in indexed Vailo source code (Gemini; default gemini-3.8-flash). */
exports.askAppCodeKnowledge = onCall(
  {
    timeoutSeconds: 120,
    memory: "512MiB",
    enforceAppCheck: false,
  },
  async (request) => askAppCodeKnowledgeHandler(request, firestore)
);

exports.getAppCodeKnowledgeMeta = onCall(
  { enforceAppCheck: false },
  async (request) => getAppCodeKnowledgeMetaHandler(request, firestore)
);

exports.getAppCodeKnowledgeExport = onCall(
  {
    timeoutSeconds: 60,
    memory: "512MiB",
    enforceAppCheck: false,
  },
  async (request) => getAppCodeKnowledgeExportHandler(request, firestore)
);

const { provisionOwnerAuthHandler } = require("./provisionOwnerAuth");

/** Platform admin: create or update Firebase Auth login for an owners CRM user. */
exports.provisionOwnerAuth = onCall(
  { enforceAppCheck: false },
  async (request) => provisionOwnerAuthHandler(request, firestore, admin.auth())
);

const { registerGuestPortalAccess } = require("./guestPortalAccess");
registerGuestPortalAccess({ firestore, logger, firebaseExports: exports });

const { registerGuestPreArrival } = require("./guestPreArrival");
registerGuestPreArrival({ firestore, firebaseExports: exports });

const { registerGuestPortalAnalytics } = require("./guestPortalAnalytics");
registerGuestPortalAnalytics({ firestore, firebaseExports: exports });

const { registerICalSync } = require("./icalSync");
registerICalSync({ firestore, logger, firebaseExports: exports });

const { registerGuestApplianceGuide } = require("./guestApplianceGuide");
registerGuestApplianceGuide({ firestore, firebaseExports: exports });

const { registerGuestPropertyAssistantChat } = require("./guestPropertyAssistantChat");
registerGuestPropertyAssistantChat({ firebaseExports: exports });

const { registerHouseGuideImportAi } = require("./houseGuideImportAi");
registerHouseGuideImportAi({ firebaseExports: exports });

const { registerLocalGemMagicAi } = require("./localGemMagicAi");
registerLocalGemMagicAi({ firebaseExports: exports });

const { registerPartnerImportAi } = require("./partnerImportAi");
registerPartnerImportAi({ firebaseExports: exports });

const { registerGuestAssistantEscalation } = require("./guestAssistantEscalation");
registerGuestAssistantEscalation({ firestore, logger, firebaseExports: exports });

const { registerPostStayThankYou } = require("./postStayThankYou");
registerPostStayThankYou({ firestore, logger, firebaseExports: exports });

const { registerGuestPreArrivalPurge } = require("./guestPreArrivalPurge");
registerGuestPreArrivalPurge({ firestore, logger, firebaseExports: exports });

const { registerMarketingContact } = require("./marketingContact");
registerMarketingContact({ firestore, logger, firebaseExports: exports });

const { registerPlanPurchase } = require("./planPurchase");
registerPlanPurchase({
  firestore,
  auth: admin.auth(),
  logger,
  firebaseExports: exports,
});

const { registerResendInbox } = require("./resendInbox");
registerResendInbox({ firestore, logger, firebaseExports: exports });

const { registerStagingSync } = require("./stagingSync");
registerStagingSync({ firestore, firebaseExports: exports });

const { registerPartnerAgreement } = require("./partnerAgreement");
registerPartnerAgreement({ firestore, firebaseExports: exports });
