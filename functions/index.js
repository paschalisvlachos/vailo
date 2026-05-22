const { setGlobalOptions } = require("firebase-functions/v2");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const axios = require('axios');

// Enforce modern v2 global optimizations for rapid execution speeds
setGlobalOptions({ 
  maxInstances: 10,
  region: "us-central1"
});

exports.getGooglePlaceDetails = onCall(async (request) => {
  // v2 safely unpacks parameters directly inside request.data
  const payload = request.data || {};
  let searchQuery = payload.searchQuery;
  const area = payload.area || "";

  if (!searchQuery) {
    throw new HttpsError('invalid-argument', 'The search query is missing.');
  }

  // --- NATIVE FETCH + iPHONE SPOOFING INTERCEPTOR ---
  if (searchQuery.startsWith('http')) {
    try {
      const res = await fetch(searchQuery, {
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
          'Accept-Language': 'en-US,en;q=0.9',
        }
      });

      let finalUrl = res.url;
      let html = await res.text();
      let placeName = "";

      if (finalUrl.includes('consent.google.com') && finalUrl.includes('continue=')) {
        try {
          const urlObj = new URL(finalUrl);
          finalUrl = urlObj.searchParams.get('continue') || finalUrl;
        } catch (e) { logger.info("Consent URL parse error ignored."); }
      }

      const urlMatch = finalUrl.match(/\/(?:place|search)\/([^\/?@]+)/);
      if (urlMatch && urlMatch[1]) {
        placeName = decodeURIComponent(urlMatch[1].replace(/\+/g, ' ')).trim();
      }

      if (!placeName && html) {
         const ogMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i) ||
                         html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i);
         if (ogMatch && ogMatch[1]) {
           placeName = ogMatch[1].split(' · ')[0].replace(/&amp;/g, '&').trim();
         } else {
           const titleMatch = html.match(/<title>(.*?)<\/title>/i);
           if (titleMatch && titleMatch[1]) {
             placeName = titleMatch[1].split(' - ')[0].replace(/&amp;/g, '&').trim();
           }
         }
      }

      if (placeName && !placeName.includes("Google Maps") && !placeName.includes("302 Moved")) {
         searchQuery = area ? `${placeName} ${area}` : placeName;
         logger.info("Successfully intercepted place name:", { searchQuery });
      } else {
         throw new Error("Extracted invalid name from URL/HTML.");
      }

    } catch (e) {
      logger.error("CRITICAL: Link resolution blocked:", e);
      throw new HttpsError('invalid-argument', 'Google blocked the short link. Please use a full URL.');
    }
  }

  // --- STANDARD PLACES API REQUEST ---
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
      logger.error("Missing GOOGLE_MAPS_API_KEY environment variable.");
      throw new HttpsError('internal', 'Server configuration error.');
  }

  try {
    const response = await axios.post(
      'https://places.googleapis.com/v1/places:searchText',
      { textQuery: searchQuery },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'places.displayName,places.rating,places.editorialSummary,places.location,places.photos,places.primaryType,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri'
        }
      }
    );

    if (!response.data.places || response.data.places.length === 0) {
      throw new HttpsError('not-found', 'Place not found on Google.');
    }

    const place = response.data.places[0];

    let photoUrl = null;
    if (place.photos && place.photos.length > 0) {
      photoUrl = `https://places.googleapis.com/v1/${place.photos[0].name}/media?maxHeightPx=800&maxWidthPx=800&key=${apiKey}`;
    }

    return {
      name: place.displayName?.text || '',
      rating: place.rating || null,
      description: place.editorialSummary?.text || '',
      category: place.primaryType || '',
      latitude: place.location?.latitude || null,
      longitude: place.location?.longitude || null,
      phoneNumber: place.internationalPhoneNumber || place.nationalPhoneNumber || '',
      websiteUri: place.websiteUri || '',
      photoUrl: photoUrl
    };

  } catch (error) {
    logger.error("Google API Error:", error.response?.data || error.message);
    throw new HttpsError('internal', 'Failed to fetch Google Place data.');
  }
});