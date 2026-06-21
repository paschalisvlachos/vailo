/** Google Places API (New) — usage tracking for admin billing dashboard. */
const admin = require("firebase-admin");
const logger = require("firebase-functions/logger");

/** Approximate USD per request (Places API New — adjust if Google pricing changes). */
const PLACES_API_UNIT_COST_USD = {
  text_search: 0.032,
  place_details: 0.025,
  nearby_search: 0.032,
  place_photo: 0.007,
};

const ENDPOINT_LABELS = {
  text_search: "Text Search",
  place_details: "Place Details",
  nearby_search: "Nearby Search",
  place_photo: "Place Photo",
};

const SOURCE_LABELS = {
  guest_ai_concierge: "Guest AI — concierge",
  guest_resolve_place_photo: "Guest AI — photos & map links (legacy)",
  area_discovered_places: "Area — Discovered Places",
  area_local_gems: "Area — Local Gems",
  area_features: "Area — Features",
  property_local_gems: "Property — Local Gems",
  property_features: "Property — Features",
  property_types: "Property — Listing types",
  admin_magic_fill: "Admin — Magic Fill (unspecified)",
  photo_mirror: "Photo mirror (Storage cache miss)",
};

const VALID_USAGE_CALLERS = new Set(Object.keys(SOURCE_LABELS));

function normalizeUsageCaller(raw) {
  const key = String(raw || "").trim();
  if (VALID_USAGE_CALLERS.has(key)) return key;
  return "admin_magic_fill";
}

const MAGIC_FILL_LEGACY_UNIT = 0.027;

function monthKey() {
  return new Date().toISOString().slice(0, 7);
}

function dayKey() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Record one billed Google Places HTTP call.
 * @param {FirebaseFirestore.Firestore} firestore
 * @param {{ endpoint: keyof PLACES_API_UNIT_COST_USD, source: keyof SOURCE_LABELS }} entry
 */
async function recordPlacesApiCall(firestore, { endpoint, source }) {
  if (!endpoint || !source) return;

  const increment = admin.firestore.FieldValue.increment(1);
  const updatedAt = admin.firestore.FieldValue.serverTimestamp();
  const month = monthKey();
  const day = dayKey();

  const monthPatch = {
    magicFill: increment,
    [`placesApi.total`]: increment,
    [`placesApi.byEndpoint.${endpoint}`]: increment,
    [`placesApi.bySource.${source}`]: increment,
    updatedAt,
  };

  const dayPatch = {
    [`placesApi.total`]: increment,
    [`placesApi.byEndpoint.${endpoint}`]: increment,
    [`placesApi.bySource.${source}`]: increment,
    updatedAt,
  };

  try {
    await Promise.all([
      firestore.collection("platformUsage").doc(month).set(monthPatch, { merge: true }),
      firestore.collection("platformUsage").doc("allTime").set(monthPatch, { merge: true }),
      firestore
        .collection("platformUsage")
        .doc(month)
        .collection("daily")
        .doc(day)
        .set(dayPatch, { merge: true }),
    ]);
  } catch (e) {
    logger.warn("recordPlacesApiCall failed:", e);
  }
}

function estimatePlacesCostUsd(usageDoc) {
  const byEndpoint = usageDoc?.placesApi?.byEndpoint || {};
  let total = 0;
  const lineItems = [];

  for (const [endpoint, count] of Object.entries(byEndpoint)) {
    const n = typeof count === "number" ? count : 0;
    if (n <= 0) continue;
    const unit = PLACES_API_UNIT_COST_USD[endpoint] ?? MAGIC_FILL_LEGACY_UNIT;
    const cost = n * unit;
    total += cost;
    lineItems.push({
      label: ENDPOINT_LABELS[endpoint] || endpoint,
      count: n,
      cost,
      kind: "endpoint",
      key: endpoint,
    });
  }

  return { total, lineItems };
}

function breakdownFromUsageDoc(usageDoc) {
  const bySource = usageDoc?.placesApi?.bySource || {};
  const sourceItems = Object.entries(bySource)
    .filter(([, count]) => typeof count === "number" && count > 0)
    .map(([key, count]) => ({
      label: SOURCE_LABELS[key] || key,
      count,
      kind: "source",
      key,
    }))
    .sort((a, b) => b.count - a.count);

  const { total, lineItems: endpointItems } = estimatePlacesCostUsd(usageDoc);

  return {
    placesTotal: typeof usageDoc?.placesApi?.total === "number" ? usageDoc.placesApi.total : 0,
    estimatedCostUsd: total,
    byEndpoint: endpointItems.sort((a, b) => b.cost - a.cost),
    bySource: sourceItems,
  };
}

module.exports = {
  PLACES_API_UNIT_COST_USD,
  ENDPOINT_LABELS,
  SOURCE_LABELS,
  normalizeUsageCaller,
  recordPlacesApiCall,
  breakdownFromUsageDoc,
  estimatePlacesCostUsd,
  MAGIC_FILL_LEGACY_UNIT,
};
