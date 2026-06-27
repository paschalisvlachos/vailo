const crypto = require("crypto");
const axios = require("axios");
const admin = require("firebase-admin");
const logger = require("firebase-functions/logger");
const { recordPlacesApiCall } = require("./placesApiUsage");

/** True when loading this URL in a browser bills Google Place Photos. */
function isGooglePlacesPhotoUrl(url) {
  if (typeof url !== "string" || !url.trim()) return false;
  try {
    const parsed = new URL(url.trim());
    const host = parsed.hostname.toLowerCase();
    const path = parsed.pathname.toLowerCase();

    if (
      host === "places.googleapis.com" &&
      path.includes("/photos/") &&
      path.endsWith("/media")
    ) {
      return true;
    }

    // Browser redirect target for Places media URLs — still metered per load.
    if (host.endsWith(".googleusercontent.com") && path.includes("/place-photos/")) {
      return true;
    }

    // Legacy Place Photo endpoint.
    if (
      host === "maps.googleapis.com" &&
      path.startsWith("/maps/api/place/photo")
    ) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

function isFirebaseStoragePhotoUrl(url) {
  if (typeof url !== "string" || !url.trim()) return false;
  try {
    const parsed = new URL(url.trim());
    return (
      parsed.hostname === "firebasestorage.googleapis.com" ||
      parsed.hostname === "storage.googleapis.com"
    );
  } catch {
    return false;
  }
}

function sanitizePathSegment(value) {
  return String(value || "unknown")
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .slice(0, 80);
}

/** Stable Storage object path for a discovered place, property gem, or Google place id. */
function placePhotoStoragePath({
  country,
  areaId,
  docId,
  googlePlaceId,
  propertyId,
  propertyTypeId,
  propertyGemId,
}) {
  if (propertyId && propertyTypeId && propertyGemId) {
    return `properties/${sanitizePathSegment(propertyId)}/types/${sanitizePathSegment(propertyTypeId)}/gemPhotos/${sanitizePathSegment(propertyGemId)}.jpg`;
  }
  if (country && areaId && docId) {
    return `areas/${sanitizePathSegment(country)}/${sanitizePathSegment(areaId)}/placePhotos/${docId}.jpg`;
  }
  if (googlePlaceId) {
    const safe = sanitizePathSegment(String(googlePlaceId).replace(/^places\//, ""));
    return `placePhotos/byGoogleId/${safe}.jpg`;
  }
  return null;
}

/** Resource name from a Places API (New) photo media URL, e.g. places/ChIJ…/photos/Ab43… */
function parsePlacesPhotoResourceName(url) {
  try {
    const parsed = new URL(String(url || "").trim());
    if (parsed.hostname.toLowerCase() !== "places.googleapis.com") return null;
    const match = parsed.pathname.match(/\/v1\/(places\/[^/]+\/photos\/[^/]+)\/media/i);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

async function fetchGooglePlacePhotoBytes(photoUrl, apiKey) {
  const trimmed = String(photoUrl || "").trim();
  if (!trimmed) return null;

  const attempts = [];

  const resourceName = parsePlacesPhotoResourceName(trimmed);
  if (resourceName && apiKey) {
    attempts.push({
      url: `https://places.googleapis.com/v1/${resourceName}/media?maxHeightPx=800&maxWidthPx=800`,
      headers: { "X-Goog-Api-Key": apiKey },
    });
  }

  attempts.push({
    url: trimmed,
    headers: apiKey ? { "X-Goog-Api-Key": apiKey } : {},
  });

  for (const attempt of attempts) {
    try {
      const response = await axios.get(attempt.url, {
        responseType: "arraybuffer",
        timeout: 20000,
        maxRedirects: 5,
        headers: attempt.headers,
        validateStatus: (status) => status >= 200 && status < 400,
      });
      if (response.data && response.data.byteLength > 0) {
        return response;
      }
    } catch (error) {
      logger.warn(
        "Google place photo fetch attempt failed:",
        attempt.url.split("?")[0],
        error.response?.status || error.message
      );
    }
  }

  return null;
}

function buildFirebaseDownloadUrl(bucketName, filePath, token) {
  const encoded = encodeURIComponent(filePath);
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encoded}?alt=media&token=${token}`;
}

async function firebaseDownloadUrlForFile(file) {
  const [metadata] = await file.getMetadata();
  const raw = metadata.metadata?.firebaseStorageDownloadTokens;
  const token =
    typeof raw === "string" && raw.trim()
      ? raw.split(",")[0].trim()
      : crypto.randomUUID();
  if (!raw) {
    await file.setMetadata({
      metadata: { firebaseStorageDownloadTokens: token },
    });
  }
  return buildFirebaseDownloadUrl(file.bucket.name, file.name, token);
}

/**
 * Ensure a place photo is served from Firebase Storage.
 * Google Places media URLs are downloaded once, then reused from Storage.
 */
async function ensureStoredPlacePhoto(googlePhotoUrl, storagePathArg, apiKeyArg) {
  const trimmed = typeof googlePhotoUrl === "string" ? googlePhotoUrl.trim() : "";
  if (!trimmed) return null;
  if (isFirebaseStoragePhotoUrl(trimmed)) return trimmed;
  if (!isGooglePlacesPhotoUrl(trimmed)) return trimmed;

  let storagePath = storagePathArg;
  if (!storagePath) {
    const hash = crypto.createHash("sha256").update(trimmed).digest("hex").slice(0, 40);
    storagePath = `placePhotos/byUrlHash/${hash}.jpg`;
  }

  const bucket = admin.storage().bucket();
  const file = bucket.file(storagePath);

  const apiKey = apiKeyArg || process.env.GOOGLE_MAPS_API_KEY;

  try {
    const [exists] = await file.exists();
    if (exists) {
      return await firebaseDownloadUrlForFile(file);
    }

    const response = await fetchGooglePlacePhotoBytes(trimmed, apiKey);
    if (!response) {
      return null;
    }

    await recordPlacesApiCall(admin.firestore(), {
      endpoint: "place_photo",
      source: "photo_mirror",
    });

    const contentType =
      typeof response.headers["content-type"] === "string" &&
      response.headers["content-type"].startsWith("image/")
        ? response.headers["content-type"]
        : "image/jpeg";
    const token = crypto.randomUUID();

    await file.save(Buffer.from(response.data), {
      metadata: {
        contentType,
        cacheControl: "public, max-age=31536000",
        metadata: { firebaseStorageDownloadTokens: token },
      },
    });

    logger.info(`Mirrored place photo to Storage: ${storagePath}`);
    return buildFirebaseDownloadUrl(bucket.name, storagePath, token);
  } catch (error) {
    logger.warn(
      `place photo mirror failed (${storagePath}):`,
      error.response?.status || error.message
    );
    return null;
  }
}

module.exports = {
  isGooglePlacesPhotoUrl,
  isFirebaseStoragePhotoUrl,
  placePhotoStoragePath,
  ensureStoredPlacePhoto,
  parsePlacesPhotoResourceName,
};
