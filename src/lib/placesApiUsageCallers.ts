/** Pass as `usageCaller` on getGooglePlaceDetails — must match functions/placesApiUsage.js */
export const PLACES_USAGE_CALLER = {
  areaDiscoveredPlaces: 'area_discovered_places',
  areaLocalGems: 'area_local_gems',
  areaFeatures: 'area_features',
  propertyLocalGems: 'property_local_gems',
  propertyFeatures: 'property_features',
  propertyTypes: 'property_types',
  guestAiConcierge: 'guest_ai_concierge',
} as const;

export type PlacesUsageCaller =
  (typeof PLACES_USAGE_CALLER)[keyof typeof PLACES_USAGE_CALLER];
