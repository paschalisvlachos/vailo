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
  "places.id,places.displayName,places.rating,places.editorialSummary,places.location,places.photos,places.primaryType,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri,places.googleMapsUri,places.formattedAddress,places.addressComponents";

const DUPLICATE_RADIUS_METERS = 150;
const FUZZY_NAME_RADIUS_METERS = 250;

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
];

function normalizePlaceName(name) {
  return String(name || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u0370-\u03ff]/g, "");
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
  if (ca === cb && ca.length >= 4) return true;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  if (shorter.length >= 5 && longer.includes(shorter)) return true;
  if (ca.length >= 4 && cb.length >= 4 && (ca.includes(cb) || cb.includes(ca))) {
    return true;
  }
  return false;
}

function placeNamesMatch(requested, resolved) {
  const a = normalizePlaceName(requested);
  const b = normalizePlaceName(resolved);
  if (!a || !b) return false;
  if (a === b) return true;
  const ca = nameCore(a);
  const cb = nameCore(b);
  if (ca === cb && ca.length >= 4) return true;
  if (ca.length >= 5 && b.includes(ca)) return true;
  if (cb.length >= 5 && a.includes(cb)) return true;
  const words = String(requested || "")
    .toLowerCase()
    .replace(/[^a-z0-9\u0370-\u03ff\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 5 && !GENERIC_SUFFIXES.includes(w));
  return words.some((w) => b.includes(normalizePlaceName(w)));
}

function pickBestPlaceMatch(places, requestedTitle) {
  if (!places?.length) return null;
  for (const place of places) {
    const name = place.displayName?.text || "";
    if (placeNamesMatch(requestedTitle, name)) return place;
  }
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

async function fetchPlaceFromGoogle(searchQuery, apiKey, biasLat, biasLng, requestedTitle) {
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
        "X-Goog-FieldMask": PLACES_FIELD_MASK,
      },
    }
  );

  if (!response.data.places || response.data.places.length === 0) {
    return null;
  }

  const title = requestedTitle || searchQuery;
  let place = pickBestPlaceMatch(response.data.places, title);

  if (!place && title) {
    const exactQuery = `"${title.split(",")[0].trim()}"${searchQuery.includes(",") ? " " + searchQuery.split(",").slice(1).join(",").trim() : ""}`;
    const retry = await axios.post(
      "https://places.googleapis.com/v1/places:searchText",
      { ...body, textQuery: exactQuery.trim() },
      {
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": PLACES_FIELD_MASK,
        },
      }
    );
    place = pickBestPlaceMatch(retry.data.places || [], title);
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
  if (place.photos && place.photos.length > 0) {
    photoUrl = `https://places.googleapis.com/v1/${place.photos[0].name}/media?maxHeightPx=800&maxWidthPx=800&key=${apiKey}`;
  }

  const placeName = place.displayName?.text || searchQuery;
  const mapUrls = buildPlaceMapUrls(place.id, latitude, longitude, placeName);
  const googleMapsUrl = place.googleMapsUri || mapUrls.googleMapsUrl;
  const parsedAddress = parseAddressComponents(place.addressComponents);
  const formattedAddress = place.formattedAddress || "";

  return {
    googlePlaceId: place.id || null,
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
  if (!searchQuery.startsWith("http")) {
    return area ? `${searchQuery} ${area}`.trim() : searchQuery;
  }

  const res = await fetch(searchQuery, {
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

  if (
    placeName &&
    !placeName.includes("Google Maps") &&
    !placeName.includes("302 Moved")
  ) {
    return area ? `${placeName} ${area}` : placeName;
  }

  const coordMatch =
    finalUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) ||
    finalUrl.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (coordMatch) {
    const coordQuery = `${coordMatch[1]},${coordMatch[2]}`;
    return area ? `${coordQuery} ${area}` : coordQuery;
  }

  throw new Error("Extracted invalid name from URL/HTML.");
}

/** Guest concierge: resolve place via area discoveredPlaces DB (Google import on miss). */
exports.resolvePlacePhoto = onCall(async (request) => {
  const payload = request.data || {};
  const title = String(payload.title || "").trim();
  const area = String(payload.area || "").trim();
  const country = String(payload.country || "").trim();
  const areaId = String(payload.areaId || "").trim();
  const latitude = payload.latitude;
  const longitude = payload.longitude;
  const anchorLat = payload.anchorLat;
  const anchorLng = payload.anchorLng;

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

    if (duplicate && duplicateMatchesRequest(duplicate.data, normalizedName, title)) {
      return bumpDiscoveredPlaceUsage(coll, duplicate.id, duplicate.data, title);
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      logger.error("Missing GOOGLE_MAPS_API_KEY environment variable.");
      throw new HttpsError("internal", "Server configuration error.");
    }

    const searchQuery = area ? `${title}, ${area}` : title;
    const place = await fetchPlaceFromGoogle(searchQuery, apiKey, biasLat, biasLng, title);
    await recordPlatformUsage("magicFill");

    if (!place) {
      return { photoUrl: null, googleMapsUrl: null, googlePlaceId: null, notFound: true };
    }

    if (!placeNamesMatch(title, place.name || "")) {
      logger.warn(`Rejected Google result "${place.name}" for requested "${title}"`);
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

    if (geoDuplicate && duplicateMatchesRequest(geoDuplicate.data, normalizedName, title)) {
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

  if (!searchQuery) {
    throw new HttpsError("invalid-argument", "The search query is missing.");
  }

  try {
    searchQuery = await resolveUrlSearchQuery(searchQuery, area);
  } catch (e) {
    logger.error("CRITICAL: Link resolution blocked:", e);
    throw new HttpsError(
      "invalid-argument",
      "Google blocked the short link. Please use a full URL."
    );
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    logger.error("Missing GOOGLE_MAPS_API_KEY environment variable.");
    throw new HttpsError("internal", "Server configuration error.");
  }

  try {
    const place = await fetchPlaceFromGoogle(searchQuery, apiKey, null, null, searchQuery);
    await recordPlatformUsage("magicFill");

    if (!place) {
      throw new HttpsError("not-found", "Place not found on Google.");
    }

    return {
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

  const query = `
    SELECT
      service.description AS service,
      ROUND(SUM(cost) + SUM(IFNULL((SELECT SUM(c.amount) FROM UNNEST(credits) c), 0)), 4) AS cost
    FROM \`${tableId}\`
    WHERE invoice.month = @invoiceMonth
    GROUP BY service.description
    HAVING cost != 0
    ORDER BY cost DESC
    LIMIT 50
  `;

  const [job] = await bigquery.createQueryJob({
    query,
    params: { invoiceMonth },
    location,
  });
  const [rows] = await job.getQueryResults();

  const lineItems = rows.map((row) => ({
    label: row.service || "Unknown service",
    cost: Number(row.cost) || 0,
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
