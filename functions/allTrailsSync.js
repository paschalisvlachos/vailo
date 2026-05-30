const { HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const axios = require("axios");
const admin = require("firebase-admin");

const ALGOLIA_APP_ID = "9IOACG5NHE";
const ALGOLIA_API_KEY = "a557051fc69f8a3e456db3084df4780e";
const ALGOLIA_INDEX = "alltrails_primary_en-US";
const ALGOLIA_QUERY_URL = `https://${ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes/${ALGOLIA_INDEX}/query`;
const ALLTRAILS_WEB_API_KEY = "3p0t5s6b5g4g0e8k3c1j3w7y5c3m4t8i";

const HITS_PER_PAGE = 100;
const ALGOLIA_PAGE_CAP = 1000;

const EDITABLE_TRAIL_FIELDS = [
  "name",
  "description",
  "difficulty",
  "lengthKm",
  "lengthMiles",
  "elevationGainFt",
  "elevationGainM",
  "rating",
  "reviewCount",
  "routeType",
  "areaLabel",
  "state",
  "country",
  "latitude",
  "longitude",
  "photoUrl",
  "allTrailsUrl",
  "allTrailsSlug",
  "allTrailsEmbedSrc",
  "allTrailsWidgetUrl",
  "parking",
  "dogsAllowed",
  "kidFriendly",
  "wheelchairFriendly",
];

const ROUTE_TYPE_LABELS = {
  L: "Loop",
  O: "Out & Back",
  P: "Point to Point",
};

/**
 * @param {string|URLSearchParams} source
 * @param {string} key
 * @returns {number|null}
 */
function floatParam(source, key) {
  const raw =
    source instanceof URLSearchParams
      ? source.get(key)
      : source && typeof source === "object"
        ? source[key]
        : null;
  if (raw == null || raw === "") return null;
  const n = Number.parseFloat(String(raw));
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {string} startUrl
 * @returns {{ mode: string, [key: string]: unknown }}
 */
function parseStartUrl(startUrl) {
  let url;
  try {
    url = new URL(startUrl.includes("://") ? startUrl : `https://${startUrl}`);
  } catch {
    throw new HttpsError("invalid-argument", "Invalid AllTrails URL.");
  }

  if (!url.hostname.includes("alltrails.com")) {
    throw new HttpsError("invalid-argument", "URL must be on alltrails.com.");
  }

  const path = url.pathname.replace(/\/+$/, "") || "/";
  const params = url.searchParams;

  const trailMatch = path.match(/^\/trail\/(.+)$/i);
  if (trailMatch?.[1]) {
    return { mode: "trailSlug", slug: trailMatch[1] };
  }

  const tlLat = floatParam(params, "b_tl_lat");
  const tlLng = floatParam(params, "b_tl_lng");
  const brLat = floatParam(params, "b_br_lat");
  const brLng = floatParam(params, "b_br_lng");
  if (tlLat != null && tlLng != null && brLat != null && brLng != null) {
    return {
      mode: "bbox",
      south: Math.min(tlLat, brLat),
      north: Math.max(tlLat, brLat),
      west: Math.min(tlLng, brLng),
      east: Math.max(tlLng, brLng),
    };
  }

  const lat = floatParam(params, "lat") ?? floatParam(params, "latitude");
  const lng =
    floatParam(params, "lng") ??
    floatParam(params, "longitude") ??
    floatParam(params, "lng");
  if (lat != null && lng != null) {
    const radiusM = floatParam(params, "radius") ?? 50_000;
    return { mode: "around", lat, lng, radiusM };
  }

  const slug = path.replace(/^\//, "");
  if (slug && slug !== "explore" && !slug.startsWith("explore/")) {
    return { mode: "areaPath", slug };
  }

  throw new HttpsError(
    "invalid-argument",
    "Could not parse this AllTrails URL. Paste an explore map link (zoom to your area and copy the URL) or a park/region page."
  );
}

/**
 * @param {Record<string, unknown>} body
 * @returns {Promise<{ hits: Record<string, unknown>[], nbHits: number, nbPages: number, page: number }>}
 */
async function algoliaSearch(body) {
  const response = await axios.post(ALGOLIA_QUERY_URL, body, {
    headers: {
      "X-Algolia-Application-Id": ALGOLIA_APP_ID,
      "X-Algolia-API-Key": ALGOLIA_API_KEY,
      "Content-Type": "application/json",
    },
    timeout: 30_000,
    validateStatus: (status) => status >= 200 && status < 500,
  });

  if (response.status >= 400) {
    logger.error("AllTrails Algolia search failed:", response.status, response.data);
    throw new HttpsError(
      "internal",
      `AllTrails search failed (${response.status}). The public search index may have changed — try again later.`
    );
  }

  const data = response.data || {};
  return {
    hits: Array.isArray(data.hits) ? data.hits : [],
    nbHits: Number(data.nbHits) || 0,
    nbPages: Number(data.nbPages) || 0,
    page: Number(data.page) || 0,
  };
}

/**
 * @param {string} difficulty
 * @returns {string}
 */
function formatDifficulty(difficulty) {
  const d = String(difficulty || "").trim().toLowerCase();
  if (!d) return "";
  if (d === "strenuous") return "Strenuous";
  return d.charAt(0).toUpperCase() + d.slice(1);
}

/**
 * @param {string} routeType
 * @returns {string}
 */
function formatRouteType(routeType) {
  const code = String(routeType || "").trim().toUpperCase();
  return ROUTE_TYPE_LABELS[code] || routeType || "";
}

/**
 * @param {unknown} features
 * @returns {{ dogsAllowed: boolean|null, kidFriendly: boolean|null, wheelchairFriendly: boolean|null }}
 */
function featuresToPolicies(features) {
  const list = Array.isArray(features) ? features.map((f) => String(f)) : [];
  let dogsAllowed = null;
  if (list.includes("dogs") || list.includes("dogs-leash")) dogsAllowed = true;
  if (list.includes("dogs-no")) dogsAllowed = false;
  return {
    dogsAllowed,
    kidFriendly: list.includes("kids") ? true : null,
    wheelchairFriendly: list.includes("ada") ? true : null,
  };
}

/**
 * @param {string|number|null|undefined} trailId
 * @returns {string}
 */
function photoUrlFromTrailId(trailId) {
  const id = trailId != null ? String(trailId).trim() : "";
  if (!id) return "";
  return `https://www.alltrails.com/api/alltrails/v2/trails/${encodeURIComponent(id)}/photos/0?key=${ALLTRAILS_WEB_API_KEY}&size=md`;
}

/**
 * @param {string} slug
 * @param {string} [shareHash] sh= value from AllTrails Share → Embed
 * @returns {string}
 */
function embedSrcFromSlug(slug, shareHash) {
  const path = String(slug || "").trim().replace(/^\//, "");
  if (!path) return "";
  let url = `https://www.alltrails.com/widget/${path}?u=m`;
  const sh = String(shareHash || "").trim();
  if (sh) url += `&sh=${encodeURIComponent(sh)}`;
  return url;
}

/** @deprecated alias */
function widgetUrlFromSlug(slug, shareHash) {
  return embedSrcFromSlug(slug, shareHash);
}

/**
 * @param {{ mode: string, [key: string]: unknown }} target
 * @returns {string|null}
 */
function describeSearchTarget(target) {
  if (target.mode === "bbox") {
    const south = Number(target.south);
    const north = Number(target.north);
    const west = Number(target.west);
    const east = Number(target.east);
    return `Map rectangle lat ${south.toFixed(2)}°–${north.toFixed(2)}°, lng ${west.toFixed(2)}°–${east.toFixed(2)}° (whatever is visible in your AllTrails explore URL)`;
  }
  if (target.mode === "areaPath") {
    return `AllTrails region page: ${target.slug}`;
  }
  if (target.mode === "around") {
    return `Trails within ~${Math.round(Number(target.radiusM) / 1000)} km of ${Number(target.lat).toFixed(3)}°, ${Number(target.lng).toFixed(3)}°`;
  }
  if (target.mode === "trailSlug") {
    return `Single trail: ${target.slug}`;
  }
  return null;
}

/**
 * @param {Record<string, unknown>} hit
 * @param {string} [shareHash]
 * @returns {Record<string, unknown>|null}
 */
function mapAlgoliaHitToRawItem(hit, shareHash) {
  const name = hit.name != null ? String(hit.name).trim() : "";
  if (!name) return null;

  const id = hit.ID != null ? String(hit.ID) : "";
  const slug = hit.slug != null ? String(hit.slug).trim() : "";
  const geoloc =
    hit._geoloc && typeof hit._geoloc === "object"
      ? /** @type {{ lat?: number, lng?: number }} */ (hit._geoloc)
      : {};

  const lengthM = typeof hit.length === "number" ? hit.length : null;
  const elevM = typeof hit.elevation_gain === "number" ? hit.elevation_gain : null;
  const policies = featuresToPolicies(hit.features);

  return {
    id,
    name,
    description: hit.description != null ? String(hit.description).trim() : "",
    difficulty: formatDifficulty(hit.difficulty),
    lengthKm: lengthM != null ? Math.round((lengthM / 1000) * 100) / 100 : null,
    lengthMiles: lengthM != null ? Math.round((lengthM / 1609.344) * 100) / 100 : null,
    elevationGainM: elevM != null ? Math.round(elevM) : null,
    elevationGainFt: elevM != null ? Math.round(elevM / 0.3048) : null,
    rating: typeof hit.avg_rating === "number" ? hit.avg_rating : null,
    reviewCount: typeof hit.num_reviews === "number" ? hit.num_reviews : null,
    routeType: formatRouteType(hit.route_type),
    area: hit.area_name != null ? String(hit.area_name).trim() : "",
    state: hit.state_name != null ? String(hit.state_name).trim() : "",
    country: hit.country_name != null ? String(hit.country_name).trim() : "",
    latitude: typeof geoloc.lat === "number" ? geoloc.lat : null,
    longitude: typeof geoloc.lng === "number" ? geoloc.lng : null,
    imageUrl: photoUrlFromTrailId(id),
    slug,
    embedSrc: embedSrcFromSlug(slug, shareHash),
    widgetUrl: embedSrcFromSlug(slug, shareHash),
    url: slug ? `https://www.alltrails.com/${slug}` : "",
    parking: "",
    dogsAllowed: policies.dogsAllowed,
    kidFriendly: policies.kidFriendly,
    wheelchairFriendly: policies.wheelchairFriendly,
  };
}

/**
 * @param {unknown} item
 * @returns {Record<string, unknown>|null}
 */
function mapApifyItemToTrail(item) {
  if (!item || typeof item !== "object") return null;
  const row = /** @type {Record<string, unknown>} */ (item);
  const name = row.name != null ? String(row.name).trim() : "";
  if (!name) return null;

  const allTrailsId = row.id != null ? String(row.id).trim() : "";
  const url = row.url != null ? String(row.url).trim() : "";
  const imageGallery = Array.isArray(row.imageGallery) ? row.imageGallery : [];
  const firstGallery =
    imageGallery.find((u) => typeof u === "string" && u.startsWith("http")) || null;

  return {
    allTrailsId: allTrailsId || null,
    name,
    description: row.description != null ? String(row.description).trim() : "",
    difficulty: row.difficulty != null ? String(row.difficulty).trim() : "",
    lengthKm: typeof row.lengthKm === "number" ? row.lengthKm : null,
    lengthMiles: typeof row.lengthMiles === "number" ? row.lengthMiles : null,
    elevationGainFt:
      typeof row.elevationGainFt === "number" ? row.elevationGainFt : null,
    elevationGainM:
      typeof row.elevationGainM === "number"
        ? row.elevationGainM
        : typeof row.elevationGainFt === "number"
          ? Math.round(row.elevationGainFt * 0.3048)
          : null,
    rating: typeof row.rating === "number" ? row.rating : null,
    reviewCount: typeof row.reviewCount === "number" ? row.reviewCount : null,
    routeType: row.routeType != null ? String(row.routeType).trim() : "",
    areaLabel: row.area != null ? String(row.area).trim() : "",
    state: row.state != null ? String(row.state).trim() : "",
    country: row.country != null ? String(row.country).trim() : "",
    latitude: typeof row.latitude === "number" ? row.latitude : null,
    longitude: typeof row.longitude === "number" ? row.longitude : null,
    photoUrl:
      (row.imageUrl != null && String(row.imageUrl).startsWith("http")
        ? String(row.imageUrl)
        : null) || (typeof firstGallery === "string" ? firstGallery : ""),
    allTrailsUrl: url,
    allTrailsSlug: row.slug != null ? String(row.slug).trim() : "",
    allTrailsEmbedSrc:
      row.embedSrc != null
        ? String(row.embedSrc).trim()
        : embedSrcFromSlug(row.slug != null ? String(row.slug) : "", row.shareHash),
    allTrailsWidgetUrl:
      row.embedSrc != null
        ? String(row.embedSrc).trim()
        : row.widgetUrl != null
          ? String(row.widgetUrl).trim()
          : embedSrcFromSlug(row.slug != null ? String(row.slug) : "", row.shareHash),
    parking: row.parking != null ? String(row.parking).trim() : "",
    dogsAllowed: typeof row.dogsAllowed === "boolean" ? row.dogsAllowed : null,
    kidFriendly: typeof row.kidFriendly === "boolean" ? row.kidFriendly : null,
    wheelchairFriendly:
      typeof row.wheelchairFriendly === "boolean" ? row.wheelchairFriendly : null,
    source: "alltrails",
  };
}

/**
 * @param {unknown} item
 * @returns {string|null}
 */
function trailDocIdFromItem(item) {
  if (!item || typeof item !== "object") return null;
  const row = /** @type {Record<string, unknown>} */ (item);
  const id = row.id != null ? String(row.id).trim() : "";
  if (id) return `at-${id.replace(/[^a-zA-Z0-9_-]/g, "")}`;

  const url = row.url != null ? String(row.url).trim() : "";
  if (url) {
    const slugMatch = url.match(/\/trail\/[^/]+\/[^/]+\/([^/?#]+)/i);
    if (slugMatch?.[1]) {
      return `at-${slugMatch[1].replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 100)}`;
    }
  }

  const name = row.name != null ? String(row.name).trim() : "";
  const lat = typeof row.latitude === "number" ? row.latitude : null;
  const lng = typeof row.longitude === "number" ? row.longitude : null;
  if (name && lat != null && lng != null) {
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60);
    return `at-${slug}-${lat.toFixed(4)}-${lng.toFixed(4)}`.replace(/\./g, "_");
  }

  return null;
}

/**
 * @param {{ south: number, west: number, north: number, east: number }} bbox
 * @returns {string}
 */
function bboxToAlgolia(bbox) {
  return `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;
}

/**
 * @param {{ south: number, west: number, north: number, east: number }} bbox
 * @returns {{ south: number, west: number, north: number, east: number }[]}
 */
function splitBboxQuadrants(bbox) {
  const midLat = (bbox.south + bbox.north) / 2;
  const midLng = (bbox.west + bbox.east) / 2;
  return [
    { south: bbox.south, west: bbox.west, north: midLat, east: midLng },
    { south: bbox.south, west: midLng, north: midLat, east: bbox.east },
    { south: midLat, west: bbox.west, north: bbox.north, east: midLng },
    { south: midLat, west: midLng, north: bbox.north, east: bbox.east },
  ];
}

/**
 * @param {Record<string, unknown>} baseParams
 * @param {{ south: number, west: number, north: number, east: number }} bbox
 * @param {number} maxItems
 * @param {Map<string, Record<string, unknown>>} byId
 * @param {string} [shareHash]
 */
async function collectHitsInBbox(baseParams, bbox, maxItems, byId, shareHash) {
  if (byId.size >= maxItems) return;

  const countResult = await algoliaSearch({
    ...baseParams,
    hitsPerPage: 0,
    page: 0,
    insideBoundingBox: bboxToAlgolia(bbox),
  });

  if (countResult.nbHits === 0) return;

  if (countResult.nbHits > ALGOLIA_PAGE_CAP) {
    for (const quad of splitBboxQuadrants(bbox)) {
      if (byId.size >= maxItems) break;
      await collectHitsInBbox(baseParams, quad, maxItems, byId, shareHash);
    }
    return;
  }

  const pageCount = Math.ceil(countResult.nbHits / HITS_PER_PAGE);
  const pagesNeeded = Math.min(
    pageCount,
    Math.ceil(Math.min(maxItems - byId.size, countResult.nbHits) / HITS_PER_PAGE)
  );

  for (let page = 0; page < pagesNeeded; page += 1) {
    if (byId.size >= maxItems) break;
    const result = await algoliaSearch({
      ...baseParams,
      hitsPerPage: HITS_PER_PAGE,
      page,
      insideBoundingBox: bboxToAlgolia(bbox),
    });
    for (const hit of result.hits) {
      const raw = mapAlgoliaHitToRawItem(hit, shareHash);
      if (!raw?.id) continue;
      byId.set(String(raw.id), raw);
      if (byId.size >= maxItems) break;
    }
  }
}

/**
 * @param {string} slug
 * @returns {Promise<string|null>}
 */
async function resolveAreaFilter(slug) {
  const escaped = slug.replace(/"/g, '\\"');
  let result = await algoliaSearch({
    query: "",
    filters: `type:area AND slug:"${escaped}"`,
    hitsPerPage: 1,
    page: 0,
  });

  let hit = result.hits[0];
  if (!hit) {
    const tail = slug.split("/").filter(Boolean).pop() || slug;
    result = await algoliaSearch({
      query: tail,
      filters: "type:area",
      hitsPerPage: 1,
      page: 0,
    });
    hit = result.hits[0];
  }

  if (!hit?.ID) return null;
  return `type:trail AND associated_area_ids:${hit.ID}`;
}

/**
 * @param {string} startUrl
 * @param {number} maxItems
 * @returns {Promise<{ items: Record<string, unknown>[], totalAvailable: number|null, regionSummary: string|null }>}
 */
async function fetchAllTrailsFromAlgolia(startUrl, maxItems, shareHash) {
  const target = parseStartUrl(startUrl);
  const regionSummary = describeSearchTarget(target);
  const baseParams = {
    query: "",
    attributesToRetrieve: [
      "ID",
      "name",
      "slug",
      "description",
      "length",
      "elevation_gain",
      "avg_rating",
      "num_reviews",
      "difficulty",
      "route_type",
      "_geoloc",
      "profile_photo_data",
      "area_name",
      "state_name",
      "country_name",
      "features",
    ],
  };

  /** @type {Map<string, Record<string, unknown>>} */
  const byId = new Map();
  let totalAvailable = null;

  if (target.mode === "trailSlug") {
    const slug = String(target.slug);
    const result = await algoliaSearch({
      ...baseParams,
      filters: `type:trail AND slug:"trail/${slug.replace(/^trail\//, "")}"`,
      hitsPerPage: 1,
      page: 0,
    });
    totalAvailable = result.nbHits;
    for (const hit of result.hits) {
      const raw = mapAlgoliaHitToRawItem(hit, shareHash);
      if (raw?.id) byId.set(String(raw.id), raw);
    }
    return { items: [...byId.values()], totalAvailable, regionSummary };
  }

  if (target.mode === "areaPath") {
    const filters = await resolveAreaFilter(String(target.slug));
    if (!filters) {
      throw new HttpsError(
        "invalid-argument",
        "Could not resolve this AllTrails region page. Try an explore map URL instead."
      );
    }
    baseParams.filters = filters;
    const count = await algoliaSearch({ ...baseParams, hitsPerPage: 0, page: 0 });
    totalAvailable = count.nbHits;
    const pageCount = Math.ceil(count.nbHits / HITS_PER_PAGE);
    const pages = Math.min(pageCount, Math.ceil(maxItems / HITS_PER_PAGE));
    for (let page = 0; page < pages; page += 1) {
      if (byId.size >= maxItems) break;
      const result = await algoliaSearch({
        ...baseParams,
        hitsPerPage: HITS_PER_PAGE,
        page,
      });
      for (const hit of result.hits) {
        const raw = mapAlgoliaHitToRawItem(hit, shareHash);
        if (!raw?.id) continue;
        byId.set(String(raw.id), raw);
        if (byId.size >= maxItems) break;
      }
    }
    return { items: [...byId.values()], totalAvailable, regionSummary };
  }

  if (target.mode === "around") {
    baseParams.filters = "type:trail";
    baseParams.aroundLatLng = `${target.lat},${target.lng}`;
    baseParams.aroundRadius = target.radiusM;
    const count = await algoliaSearch({ ...baseParams, hitsPerPage: 0, page: 0 });
    totalAvailable = count.nbHits;
    const pageCount = Math.ceil(count.nbHits / HITS_PER_PAGE);
    const pages = Math.min(pageCount, Math.ceil(maxItems / HITS_PER_PAGE));
    for (let page = 0; page < pages; page += 1) {
      if (byId.size >= maxItems) break;
      const result = await algoliaSearch({
        ...baseParams,
        hitsPerPage: HITS_PER_PAGE,
        page,
      });
      for (const hit of result.hits) {
        const raw = mapAlgoliaHitToRawItem(hit, shareHash);
        if (!raw?.id) continue;
        byId.set(String(raw.id), raw);
        if (byId.size >= maxItems) break;
      }
    }
    return { items: [...byId.values()], totalAvailable, regionSummary };
  }

  if (target.mode === "bbox") {
    baseParams.filters = "type:trail";
    const bbox = {
      south: Number(target.south),
      west: Number(target.west),
      north: Number(target.north),
      east: Number(target.east),
    };
    const count = await algoliaSearch({
      ...baseParams,
      hitsPerPage: 0,
      page: 0,
      insideBoundingBox: bboxToAlgolia(bbox),
    });
    totalAvailable = count.nbHits;
    await collectHitsInBbox(baseParams, bbox, maxItems, byId, shareHash);
    return { items: [...byId.values()], totalAvailable, regionSummary };
  }

  throw new HttpsError("invalid-argument", "Unsupported AllTrails URL format.");
}

/**
 * @param {FirebaseFirestore.Firestore} firestore
 * @param {string} country
 * @param {string} areaId
 * @param {unknown[]} items
 */
async function mergeTrailsIntoFirestore(firestore, country, areaId, items) {
  const coll = firestore
    .collection("countries")
    .doc(country)
    .collection("areas")
    .doc(areaId)
    .collection("localTrails");
  const now = admin.firestore.FieldValue.serverTimestamp();

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const raw of items) {
    const mapped = mapApifyItemToTrail(raw);
    if (!mapped) {
      skipped += 1;
      continue;
    }

    const docId = trailDocIdFromItem(raw);
    if (!docId) {
      skipped += 1;
      continue;
    }

    const ref = coll.doc(docId);
    const existingSnap = await ref.get();
    const existing = existingSnap.exists ? existingSnap.data() || {} : {};
    const locked = new Set(
      Array.isArray(existing.manuallyEditedFields) ? existing.manuallyEditedFields : []
    );

    /** @type {Record<string, unknown>} */
    const patch = {
      allTrailsId: mapped.allTrailsId,
      source: "alltrails",
      lastSyncedAt: now,
      updatedAt: now,
    };

    for (const key of EDITABLE_TRAIL_FIELDS) {
      if (locked.has(key)) continue;
      if (mapped[key] !== undefined) patch[key] = mapped[key];
    }

    if (!existingSnap.exists) {
      patch.createdAt = now;
      created += 1;
    } else {
      updated += 1;
    }

    await ref.set(patch, { merge: true });
  }

  return { created, updated, skipped, total: items.length };
}

/**
 * @param {import("firebase-functions/v2/https").CallableRequest} request
 */
async function syncAllTrailsForAreaHandler(request) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in to sync trails.");
  }

  const payload = request.data || {};
  const country = String(payload.country || "").trim();
  const areaId = String(payload.areaId || "").trim();
  let startUrl = String(payload.startUrl || "").trim();
  let maxItems = Number(payload.maxItems);
  let embedShareHash = String(payload.embedShareHash || "").trim();

  if (!country || !areaId) {
    throw new HttpsError("invalid-argument", "Country and area are required.");
  }

  const firestore = admin.firestore();
  const areaRef = firestore.doc(`countries/${country}/areas/${areaId}`);
  const areaSnap = await areaRef.get();
  if (!areaSnap.exists) {
    throw new HttpsError("not-found", "Area not found.");
  }

  const areaData = areaSnap.data() || {};
  const syncConfig = areaData.allTrailsSync || {};

  if (!startUrl) {
    startUrl = String(syncConfig.startUrl || "").trim();
  }
  if (!embedShareHash) {
    embedShareHash = String(syncConfig.embedShareHash || "").trim();
  }
  if (!Number.isFinite(maxItems) || maxItems < 1) {
    maxItems = Number(syncConfig.maxItems) || 200;
  }
  maxItems = Math.min(Math.max(Math.round(maxItems), 1), 2000);

  if (!startUrl || !startUrl.includes("alltrails.com")) {
    throw new HttpsError(
      "invalid-argument",
      "Save a valid AllTrails Start URL for this area first (must contain alltrails.com)."
    );
  }

  logger.info(
    `AllTrails Algolia sync for ${country}/${areaId}, maxItems=${maxItems}, embedSh=${embedShareHash ? "yes" : "no"}`
  );

  const { items, totalAvailable, regionSummary } = await fetchAllTrailsFromAlgolia(
    startUrl,
    maxItems,
    embedShareHash
  );
  const mergeStats = await mergeTrailsIntoFirestore(firestore, country, areaId, items);

  await areaRef.set(
    {
      allTrailsSync: {
        startUrl,
        maxItems,
        embedShareHash: embedShareHash || null,
        syncProvider: "algolia",
        regionSummary,
        lastSyncedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastSyncStats: {
          ...mergeStats,
          totalAvailable,
        },
      },
    },
    { merge: true }
  );

  return {
    ok: true,
    fetched: items.length,
    totalAvailable,
    regionSummary,
    ...mergeStats,
  };
}

module.exports = {
  syncAllTrailsForAreaHandler,
  fetchAllTrailsFromAlgolia,
  mapAlgoliaHitToRawItem,
  mapApifyItemToTrail,
  describeSearchTarget,
  embedSrcFromSlug,
  widgetUrlFromSlug,
  photoUrlFromTrailId,
  parseStartUrl,
  trailDocIdFromItem,
  EDITABLE_TRAIL_FIELDS,
};
