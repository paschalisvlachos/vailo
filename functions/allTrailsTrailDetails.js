const { HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const axios = require("axios");

const ALGOLIA_APP_ID = "9IOACG5NHE";
const ALGOLIA_API_KEY = "a557051fc69f8a3e456db3084df4780e";
const ALGOLIA_INDEX = "alltrails_primary_en-US";
const ALGOLIA_QUERY_URL = `https://${ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes/${ALGOLIA_INDEX}/query`;
const ALLTRAILS_WEB_API_KEY = "3p0t5s6b5g4g0e8k3c1j3w7y5c3m4t8i";

const ROUTE_TYPE_LABELS = {
  L: "Loop",
  O: "Out & Back",
  P: "Point to Point",
};

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function decodeHtml(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function formatDifficulty(difficulty) {
  const d = String(difficulty || "").trim().toLowerCase();
  if (!d) return "";
  if (d === "strenuous") return "Strenuous";
  return d.charAt(0).toUpperCase() + d.slice(1);
}

function formatRouteType(routeType) {
  const code = String(routeType || "").trim().toUpperCase();
  return ROUTE_TYPE_LABELS[code] || String(routeType || "").trim();
}

function photoUrlFromTrailId(trailId) {
  const id = trailId != null ? String(trailId).trim() : "";
  if (!id) return "";
  return `https://www.alltrails.com/api/alltrails/v2/trails/${encodeURIComponent(id)}/photos/0?key=${ALLTRAILS_WEB_API_KEY}&size=md`;
}

function embedSrcFromSlug(slug, shareHash) {
  const path = String(slug || "").trim().replace(/^\//, "");
  if (!path) return "";
  let url = `https://www.alltrails.com/widget/${path}?scrollZoom=false&elevationDiagram=false&u=m`;
  const sh = String(shareHash || "").trim();
  if (sh) url += `&sh=${encodeURIComponent(sh)}`;
  return url;
}

function parseAllTrailsUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl.includes("://") ? rawUrl : `https://${rawUrl}`);
  } catch {
    throw new HttpsError("invalid-argument", "Paste a valid AllTrails trail URL.");
  }
  if (!url.hostname.includes("alltrails.com")) {
    throw new HttpsError("invalid-argument", "URL must be on alltrails.com.");
  }

  const path = url.pathname.replace(/\/+$/, "") || "/";
  const trailMatch = path.match(/^\/trail\/(.+)$/i);
  if (!trailMatch?.[1]) {
    throw new HttpsError(
      "invalid-argument",
      "Paste a trail page URL like https://www.alltrails.com/trail/greece/crete/chania-city-stroll"
    );
  }

  const slugPath = `trail/${trailMatch[1]}`;
  const shareHash = url.searchParams.get("sh") || "";
  const pageUrl = `https://www.alltrails.com/${slugPath}`;
  return { slugPath, slugTail: trailMatch[1], shareHash, pageUrl };
}

async function algoliaSearch(body) {
  const response = await axios.post(ALGOLIA_QUERY_URL, body, {
    headers: {
      "X-Algolia-Application-Id": ALGOLIA_APP_ID,
      "X-Algolia-API-Key": ALGOLIA_API_KEY,
      "Content-Type": "application/json",
    },
    timeout: 20_000,
    validateStatus: (status) => status >= 200 && status < 500,
  });
  if (response.status >= 400) {
    logger.error("AllTrails Algolia search failed:", response.status, response.data);
    throw new HttpsError("internal", `AllTrails lookup failed (${response.status}).`);
  }
  const data = response.data || {};
  return Array.isArray(data.hits) ? data.hits : [];
}

function mapAlgoliaHit(hit, shareHash, pageUrl) {
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
  return {
    allTrailsId: id || null,
    name,
    description: hit.description != null ? decodeHtml(String(hit.description)) : "",
    difficulty: formatDifficulty(hit.difficulty),
    lengthKm: lengthM != null ? Math.round((lengthM / 1000) * 100) / 100 : null,
    lengthMiles: lengthM != null ? Math.round((lengthM / 1609.344) * 100) / 100 : null,
    elevationGainM: elevM != null ? Math.round(elevM) : null,
    elevationGainFt: elevM != null ? Math.round(elevM / 0.3048) : null,
    rating: typeof hit.avg_rating === "number" ? hit.avg_rating : null,
    reviewCount: typeof hit.num_reviews === "number" ? hit.num_reviews : null,
    routeType: formatRouteType(hit.route_type),
    latitude: typeof geoloc.lat === "number" ? geoloc.lat : null,
    longitude: typeof geoloc.lng === "number" ? geoloc.lng : null,
    photoUrl: photoUrlFromTrailId(id),
    allTrailsUrl: pageUrl,
    allTrailsSlug: slug || null,
    allTrailsEmbedSrc: embedSrcFromSlug(slug, shareHash),
    source: "alltrails",
  };
}

async function fetchFromAlgolia(slugPath, shareHash, pageUrl) {
  const attributesToRetrieve = [
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
  ];
  const escaped = slugPath.replace(/"/g, '\\"');
  let hits = await algoliaSearch({
    query: "",
    filters: `type:trail AND slug:"${escaped}"`,
    hitsPerPage: 1,
    page: 0,
    attributesToRetrieve,
  });
  if (!hits[0]) {
    const tail = slugPath.split("/").filter(Boolean).pop() || slugPath;
    hits = await algoliaSearch({
      query: tail.replace(/-/g, " "),
      filters: "type:trail",
      hitsPerPage: 5,
      page: 0,
      attributesToRetrieve,
    });
    hits = hits.filter((hit) => String(hit.slug || "").replace(/^\//, "") === slugPath);
  }
  if (!hits[0]) return null;
  return mapAlgoliaHit(hits[0], shareHash, pageUrl);
}

function metaContent(html, property) {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${property}["'][^>]*content=["']([^"']+)["']`,
    "i"
  );
  const match = html.match(re);
  if (match?.[1]) return decodeHtml(match[1]);
  const reRev = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${property}["']`,
    "i"
  );
  const matchRev = html.match(reRev);
  return matchRev?.[1] ? decodeHtml(matchRev[1]) : "";
}

function parseJsonLd(html) {
  const blocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const block of blocks) {
    try {
      const parsed = JSON.parse(block[1]);
      const nodes = Array.isArray(parsed) ? parsed : parsed["@graph"] ? parsed["@graph"] : [parsed];
      for (const node of nodes) {
        if (!node || typeof node !== "object") continue;
        const type = String(node["@type"] || "");
        if (/place|trail|sportsactivity|tourist/i.test(type) || node.name) {
          return node;
        }
      }
    } catch {
      // ignore malformed JSON-LD
    }
  }
  return null;
}

async function fetchFromTrailPage(pageUrl, shareHash, slugPath) {
  try {
    const response = await axios.get(pageUrl, {
      headers: {
        "User-Agent": BROWSER_UA,
        Accept: "text/html,application/xhtml+xml",
      },
      timeout: 20_000,
      maxRedirects: 5,
      validateStatus: (status) => status >= 200 && status < 400,
    });
    const html = String(response.data || "");
    const ld = parseJsonLd(html);
    const name = decodeHtml(ld?.name || metaContent(html, "og:title")).replace(/\s*\|\s*AllTrails.*$/i, "");
    if (!name) return null;
    const geo = ld?.geo && typeof ld.geo === "object" ? ld.geo : {};
    const rating = ld?.aggregateRating && typeof ld.aggregateRating === "object" ? ld.aggregateRating : {};
    const lat = Number.parseFloat(String(geo.latitude ?? ""));
    const lng = Number.parseFloat(String(geo.longitude ?? ""));
    const avg = Number.parseFloat(String(rating.ratingValue ?? ""));
    const count = Number.parseInt(String(rating.reviewCount ?? rating.ratingCount ?? ""), 10);
    return {
      allTrailsId: null,
      name,
      description: decodeHtml(ld?.description || metaContent(html, "og:description")),
      difficulty: "",
      lengthKm: null,
      lengthMiles: null,
      elevationGainM: null,
      elevationGainFt: null,
      rating: Number.isFinite(avg) ? avg : null,
      reviewCount: Number.isFinite(count) ? count : null,
      routeType: "",
      latitude: Number.isFinite(lat) ? lat : null,
      longitude: Number.isFinite(lng) ? lng : null,
      photoUrl: metaContent(html, "og:image") || "",
      allTrailsUrl: pageUrl,
      allTrailsSlug: slugPath,
      allTrailsEmbedSrc: embedSrcFromSlug(slugPath, shareHash),
      source: "alltrails",
    };
  } catch (err) {
    logger.warn("AllTrails page fetch failed:", err?.message || err);
    return null;
  }
}

function mergeTrailDetails(primary, fallback) {
  if (!primary) return fallback;
  if (!fallback) return primary;
  const out = { ...fallback, ...primary };
  for (const key of Object.keys(out)) {
    const value = out[key];
    if (value == null || value === "") out[key] = fallback[key] ?? primary[key];
  }
  return out;
}

async function getAllTrailsTrailDetailsHandler(request) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in to look up trail details.");
  }

  const rawUrl = String(request.data?.allTrailsUrl || request.data?.url || "").trim();
  if (!rawUrl) {
    throw new HttpsError("invalid-argument", "Paste an AllTrails trail URL first.");
  }

  const { slugPath, shareHash, pageUrl } = parseAllTrailsUrl(rawUrl);

  const [algolia, page] = await Promise.all([
    fetchFromAlgolia(slugPath, shareHash, pageUrl).catch((err) => {
      logger.warn("AllTrails Algolia lookup failed:", err?.message || err);
      return null;
    }),
    fetchFromTrailPage(pageUrl, shareHash, slugPath),
  ]);

  const details = mergeTrailDetails(algolia, page);
  if (!details?.name) {
    throw new HttpsError(
      "not-found",
      "Could not load this AllTrails trail. Check the URL, or enter the details manually."
    );
  }

  details.allTrailsUrl = pageUrl;
  details.allTrailsSlug = details.allTrailsSlug || slugPath;
  details.allTrailsEmbedSrc =
    details.allTrailsEmbedSrc || embedSrcFromSlug(details.allTrailsSlug, shareHash);

  return details;
}

module.exports = {
  getAllTrailsTrailDetailsHandler,
  parseAllTrailsUrl,
};
