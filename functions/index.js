const functions = require('firebase-functions');
const axios = require('axios');

exports.getGooglePlaceDetails = functions.https.onCall(async (request, context) => {
  const payload = request.data ? request.data : request;
  let searchQuery = payload.searchQuery;
  const area = payload.area || "";

  if (!searchQuery) {
    throw new functions.https.HttpsError('invalid-argument', 'The search query is missing.');
  }

  // 🔥 THE FIX: NATIVE FETCH + iPHONE SPOOFING 🔥
  if (searchQuery.startsWith('http')) {
    try {
      // 1. Use Native Node.js Fetch (bypasses Axios bot-signatures)
      // 2. Spoof an iPhone User-Agent to trick Google's anti-bot system
      const res = await fetch(searchQuery, {
        redirect: 'follow', // Automatically follow all redirects natively
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
          'Accept-Language': 'en-US,en;q=0.9',
        }
      });

      let finalUrl = res.url;
      let html = await res.text();
      let placeName = "";

      // 3. Crack the EU Cookie Consent Wall if Google redirects us there
      if (finalUrl.includes('consent.google.com') && finalUrl.includes('continue=')) {
        try {
          const urlObj = new URL(finalUrl);
          finalUrl = urlObj.searchParams.get('continue') || finalUrl;
        } catch (e) { console.log("Consent URL parse error ignored."); }
      }

      // 4. Extract the exact name from the expanded URL 
      // (Matches: /place/Kiani+Beach+Resort/)
      const urlMatch = finalUrl.match(/\/(?:place|search)\/([^\/?@]+)/);
      if (urlMatch && urlMatch[1]) {
        placeName = decodeURIComponent(urlMatch[1].replace(/\+/g, ' ')).trim();
      }

      // 5. Fallback: Extract from the hidden HTML meta tags
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

      // 6. Validate and assemble the final query for the API
      if (placeName && !placeName.includes("Google Maps") && !placeName.includes("302 Moved")) {
         searchQuery = area ? `${placeName} ${area}` : placeName;
         console.log("Successfully intercepted place name:", searchQuery);
      } else {
         throw new Error("Extracted invalid name from URL/HTML.");
      }

    } catch (e) {
      console.error("CRITICAL: Link resolution completely blocked by Google:", e);
      throw new functions.https.HttpsError('invalid-argument', 'Google blocked the short link. Please use a full URL.');
    }
  }

  // --- STANDARD PLACES API REQUEST ---
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  try {
    const response = await axios.post(
      'https://places.googleapis.com/v1/places:searchText',
      { textQuery: searchQuery },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          // 🔥 ADDED phone and websiteUri to the FieldMask 🔥
          'X-Goog-FieldMask': 'places.displayName,places.rating,places.editorialSummary,places.location,places.photos,places.primaryType,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri'
        }
      }
    );

    if (!response.data.places || response.data.places.length === 0) {
      throw new functions.https.HttpsError('not-found', 'Place not found on Google.');
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
      // 🔥 Extract the new fields 🔥
      phoneNumber: place.internationalPhoneNumber || place.nationalPhoneNumber || '',
      websiteUri: place.websiteUri || '',
      photoUrl: photoUrl
    };

  } catch (error) {
    console.error("Google API Error:", error.response?.data || error.message);
    throw new functions.https.HttpsError('internal', 'Failed to fetch Google Place data.');
  }
});