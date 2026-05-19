const functions = require('firebase-functions');
const axios = require('axios');

exports.getGooglePlaceDetails = functions.https.onCall(async (request, context) => {
  
  // 🔥 THE FIX: Safely unwrap the payload regardless of Firebase v1 or v2 structure
  const payload = request.data ? request.data : request;
  const searchQuery = payload.searchQuery;

  // Safety check to prevent hitting Google with an empty string
  if (!searchQuery) {
    throw new functions.https.HttpsError('invalid-argument', 'The search query is missing from the payload.');
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  try {
    // 1. Ask Google for the specific place details
    const response = await axios.post(
      'https://places.googleapis.com/v1/places:searchText',
      { textQuery: searchQuery },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'places.displayName,places.rating,places.editorialSummary,places.location,places.photos,places.primaryType'
        }
      }
    );

    if (!response.data.places || response.data.places.length === 0) {
      throw new functions.https.HttpsError('not-found', 'Place not found on Google.');
    }

    const place = response.data.places[0];

    // 2. Format the real Google featured photo URL securely
    let photoUrl = null;
    if (place.photos && place.photos.length > 0) {
      photoUrl = `https://places.googleapis.com/v1/${place.photos[0].name}/media?maxHeightPx=800&maxWidthPx=800&key=${apiKey}`;
    }

    // 3. Return the clean data to your React frontend
    return {
      name: place.displayName?.text || '',
      rating: place.rating || null,
      description: place.editorialSummary?.text || '',
      category: place.primaryType || '',
      latitude: place.location?.latitude || null,
      longitude: place.location?.longitude || null,
      photoUrl: photoUrl
    };

  } catch (error) {
    console.error("Google API Error:", error.response?.data || error.message);
    throw new functions.https.HttpsError('internal', 'Failed to fetch Google Place data.');
  }
});