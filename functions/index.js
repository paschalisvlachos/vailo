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

const DUPLICATE_RADIUS_METERS = 150;
const FUZZY_NAME_RADIUS_METERS = 250;

const { syncAllTrailsForAreaHandler } = require("./allTrailsSync");
const {
  askAppCodeKnowledgeHandler,
  getAppCodeKnowledgeMetaHandler,
  getAppCodeKnowledgeExportHandler,
} = require("./codeKnowledge");

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
  const n = String(name || "").trim();
  return !n || n.includes("Google Maps") || n.includes("302 Moved");
}

/** Parse place name / coords from a Maps URL without HTTP fetch. */
function extractMapsUrlHints(url) {
  const hints = { placeName: "", lat: null, lng: null };
  const raw = String(url || "").trim();
  if (!raw.startsWith("http")) return hints;

  const placeMatch = raw.match(/\/place\/([^/?@]+)/i);
  if (placeMatch?.[1]) {
    hints.placeName = decodeURIComponent(placeMatch[1].replace(/\+/g, " ")).trim();
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

function placeToResponse(data, placeNameFallback) {
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
    fromDiscoveredDb: true,
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

  const streetNumber = get("street_number");
  const route = get("route");
  const addressLine = [streetNumber, route].filter(Boolean).join(" ");

  return {
    addressLine,
    area: get("neighborhood", "sublocality", "sublocality_level_1"),
    city: get("locality", "postal_town", "administrative_area_level_2"),
    postCode: get("postal_code"),
    country: get("country"),
  };
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
    place = pickBestPlaceMatch(retry.data.places || [], title, lat, lng);
  }

  if (!place) {
    place = pickFallbackPlace(response.data.places, title, lat, lng);
  }

  if (!place) {
    logger.warn(
      `No Google place name match for "${title}" among ${response.data.places.length} results`
    );
    return null;
  }
  const latitude = place.location?.latitude ?? null;
  const longitude = place.location?.longitude ?? null;

  let photoUrl = null;
  if (!skipPhoto && place.photos && place.photos.length > 0) {
    photoUrl = `https://places.googleapis.com/v1/${place.photos[0].name}/media?maxHeightPx=800&maxWidthPx=800&key=${apiKey}`;
  }

  const placeName = place.displayName?.text || searchQuery;
  const mapUrls = buildPlaceMapUrls(place.id || place.name, latitude, longitude, placeName);
  let googleMapsUrl = place.googleMapsUri || mapUrls.googleMapsUrl;
  if (isBrokenPlaceMapsUrl(googleMapsUrl)) {
    googleMapsUrl = mapUrls.googleMapsUrl;
  }
  const googlePlaceId = resolveGooglePlaceIdFromPlace(place, googleMapsUrl);
  const parsedAddress = parseAddressComponents(place.addressComponents);
  const formattedAddress = place.formattedAddress || "";

  return {
    googlePlaceId,
    name: placeName,
    rating: place.rating || null,
    description: place.editorialSummary?.text || "",
    category: place.primaryType || "",
    latitude,
    longitude,
    phoneNumber:
      place.internationalPhoneNumber || place.nationalPhoneNumber || "",
    websiteUri: place.websiteUri || "",
    photoUrl,
    googleMapsUrl,
    navigateUrl: mapUrls.navigateUrl,
    formattedAddress,
    addressLine: parsedAddress.addressLine || formattedAddress,
    area: parsedAddress.area,
    city: parsedAddress.city,
    postCode: parsedAddress.postCode,
    country: parsedAddress.country,
  };
}

async function bumpDiscoveredPlaceUsage(coll, id, data, title) {
  await coll.doc(id).update({
    usageCount: admin.firestore.FieldValue.increment(1),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    lastMatchedTitle: title,
    alternateTitles: admin.firestore.FieldValue.arrayUnion(title),
  });
  return placeToResponse({ ...data, id }, title);
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

  const res = await fetch(trimmed, {
    redirect: "follow",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });

  let finalUrl = res.url;
  let html = await res.text();
  let placeName = "";

  if (finalUrl.includes("consent.google.com") && finalUrl.includes("continue=")) {
    try {
      const urlObj = new URL(finalUrl);
      finalUrl = urlObj.searchParams.get("continue") || finalUrl;
    } catch (e) {
      logger.info("Consent URL parse error ignored.");
    }
  }

  const urlMatch = finalUrl.match(/\/(?:place|search)\/([^\/?@]+)/);
  if (urlMatch && urlMatch[1]) {
    placeName = decodeURIComponent(urlMatch[1].replace(/\+/g, " ")).trim();
  }

  if (!placeName && html) {
    const ogMatch =
      html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i);
    if (ogMatch && ogMatch[1]) {
      placeName = ogMatch[1].split(" · ")[0].replace(/&amp;/g, "&").trim();
    } else {
      const titleMatch = html.match(/<title>(.*?)<\/title>/i);
      if (titleMatch && titleMatch[1]) {
        placeName = titleMatch[1].split(" - ")[0].replace(/&amp;/g, "&").trim();
      }
    }
  }

  if (placeName && !isGenericMapsTitle(placeName)) {
    return appendAreaIfNeeded(placeName, area);
  }

  const coordMatch =
    finalUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) ||
    finalUrl.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (coordMatch) {
    return appendAreaIfNeeded(`${coordMatch[1]},${coordMatch[2]}`, area);
  }

  const htmlHints = extractMapsUrlHints(finalUrl);
  if (htmlHints.lat != null && htmlHints.lng != null) {
    return appendAreaIfNeeded(`${htmlHints.lat},${htmlHints.lng}`, area);
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
      return bumpDiscoveredPlaceUsage(coll, duplicate.id, duplicate.data, title);
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
      place = await fetchPlaceFromGoogle(searchQuery, apiKey, biasLat, biasLng, variant);
      if (place) break;
    }
    await recordPlatformUsage("magicFill");

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
      return bumpDiscoveredPlaceUsage(coll, geoDuplicate.id, geoDuplicate.data, title);
    }

    const docId = stablePlaceDocId(
      place.googlePlaceId,
      resolvedNorm,
      resolvedLat,
      resolvedLng
    );
    const docRef = coll.doc(docId);

    const newDoc = {
      name: place.name || title,
      normalizedName: resolvedNorm,
      googlePlaceId: place.googlePlaceId || null,
      category: place.category || "",
      description: place.description || "",
      latitude: resolvedLat,
      longitude: resolvedLng,
      googleMapsUrl: place.googleMapsUrl || null,
      photoUrl: place.photoUrl || null,
      rating: place.rating ?? null,
      phoneNumber: place.phoneNumber || "",
      websiteUri: place.websiteUri || "",
      searchQuery,
      source: "google",
      status: "active",
      needsReview: true,
      reviewStatus: "new",
      usageCount: 1,
      lastMatchedTitle: title,
      alternateTitles: [title],
      promotedToLocalGemId: null,
      firstSeenAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
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

    return placeToResponse(savedData, title);
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    logger.error("resolvePlacePhoto error:", error.response?.data || error.message);
    throw new HttpsError("internal", "Failed to resolve place photo.");
  }
});

exports.getGooglePlaceDetails = onCall(async (request) => {
  const payload = request.data || {};
  let searchQuery = payload.searchQuery;
  const area = payload.area || "";
  const biasLat = typeof payload.biasLat === "number" ? payload.biasLat : null;
  const biasLng = typeof payload.biasLng === "number" ? payload.biasLng : null;

  if (!searchQuery) {
    throw new HttpsError("invalid-argument", "The search query is missing.");
  }

  const rawQuery = String(searchQuery).trim();
  const urlHints = rawQuery.startsWith("http") ? extractMapsUrlHints(rawQuery) : null;
  let matchTitle = urlHints?.placeName || rawQuery;

  try {
    searchQuery = await resolveUrlSearchQuery(searchQuery, area);
    matchTitle = matchTitleFromResolvedQuery(searchQuery, area) || matchTitle;
  } catch (e) {
    logger.error("CRITICAL: Link resolution blocked:", e);
    throw new HttpsError(
      "invalid-argument",
      "Could not read that Maps link. Paste the full place URL from your browser, or a maps.app.goo.gl link."
    );
  }

  if (payload.hintsOnly === true) {
    const coordInQuery = String(searchQuery).match(/^(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)$/);
    const latitude = coordInQuery
      ? parseFloat(coordInQuery[1])
      : urlHints?.lat != null
        ? urlHints.lat
        : null;
    const longitude = coordInQuery
      ? parseFloat(coordInQuery[2])
      : urlHints?.lng != null
        ? urlHints.lng
        : null;

    return {
      googlePlaceId: null,
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
  const fieldMask = skipPhoto
    ? PLACES_FIELD_MASK.replace("places.photos,", "")
    : PLACES_FIELD_MASK;

  try {
    const place = await fetchPlaceFromGoogle(
      searchQuery,
      apiKey,
      biasLat,
      biasLng,
      matchTitle,
      { fieldMask, skipPhoto }
    );
    await recordPlatformUsage("magicFill");

    if (!place) {
      throw new HttpsError("not-found", "Place not found on Google.");
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
      photoUrl: place.photoUrl,
      googleMapsUrl: place.googleMapsUrl,
      formattedAddress: place.formattedAddress,
      addressLine: place.addressLine,
      area: place.area,
      city: place.city,
      postCode: place.postCode,
      country: place.country,
    };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    logger.error("Google API Error:", error.response?.data || error.message);
    throw new HttpsError("internal", "Failed to fetch Google Place data.");
  }
});

const MAGIC_FILL_UNIT_COST = 0.027;

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
  const magicFill = typeof usage.magicFill === "number" ? usage.magicFill : 0;
  const estimated = magicFill * MAGIC_FILL_UNIT_COST;

  return {
    totalCost: estimated,
    lineItems: magicFill > 0
      ? [{ label: "Places API (tracked Magic Fill calls)", cost: estimated, count: magicFill }]
      : [],
    currency: "USD",
    magicFill,
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

/** Area admin: import / merge hiking trails from AllTrails (Algolia search index). */
exports.syncAllTrailsForArea = onCall(
  {
    timeoutSeconds: 540,
    memory: "512MiB",
    // Admin-only sync; auth is still required. Avoids App Check blocking before sync runs.
    enforceAppCheck: false,
  },
  syncAllTrailsForAreaHandler
);

/** Platform admin: Q&A grounded in indexed Vailo source code (Gemini; default gemini-2.5-flash). */
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

const { registerGuestPortalAccess } = require("./guestPortalAccess");
registerGuestPortalAccess({ firestore, logger, firebaseExports: exports });

const { registerGuestPortalAnalytics } = require("./guestPortalAnalytics");
registerGuestPortalAnalytics({ firestore, firebaseExports: exports });

const { registerGuestApplianceGuide } = require("./guestApplianceGuide");
registerGuestApplianceGuide({ firestore, firebaseExports: exports });
