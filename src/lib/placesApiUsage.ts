export const PLACES_ENDPOINT_LABELS: Record<string, string> = {
  text_search: 'Text Search',
  place_details: 'Place Details',
  nearby_search: 'Nearby Search',
  place_photo: 'Place Photo',
};

export const PLACES_SOURCE_LABELS: Record<string, string> = {
  guest_ai_concierge: 'Guest AI — concierge',
  guest_resolve_place_photo: 'Guest AI — photos & map links (legacy)',
  area_discovered_places: 'Area — Discovered Places',
  area_local_gems: 'Area — Local Gems',
  area_features: 'Area — Features',
  property_local_gems: 'Property — Local Gems',
  property_features: 'Property — Features',
  property_types: 'Property — Listing types',
  admin_magic_fill: 'Admin — Magic Fill (unspecified)',
  photo_mirror: 'Photo mirror (Storage cache miss)',
};

export const PLACES_ENDPOINT_UNIT_COST_USD: Record<string, number> = {
  text_search: 0.032,
  place_details: 0.025,
  nearby_search: 0.032,
  place_photo: 0.007,
};

export type PlacesApiUsageBreakdown = {
  total: number;
  estimatedCostUsd: number;
  byEndpoint: { key: string; label: string; count: number; cost: number }[];
  bySource: { key: string; label: string; count: number }[];
};

function readCountMap(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'number' && value > 0) out[key] = value;
  }
  return out;
}

export function parsePlacesApiUsage(data: Record<string, unknown> | undefined): PlacesApiUsageBreakdown {
  const placesApi = data?.placesApi as Record<string, unknown> | undefined;
  const total = typeof placesApi?.total === 'number' ? placesApi.total : 0;
  const byEndpointRaw = readCountMap(placesApi?.byEndpoint);
  const bySourceRaw = readCountMap(placesApi?.bySource);

  const byEndpoint = Object.entries(byEndpointRaw)
    .map(([key, count]) => {
      const unit = PLACES_ENDPOINT_UNIT_COST_USD[key] ?? 0.027;
      return {
        key,
        label: PLACES_ENDPOINT_LABELS[key] || key,
        count,
        cost: count * unit,
      };
    })
    .sort((a, b) => b.cost - a.cost);

  const bySource = Object.entries(bySourceRaw)
    .map(([key, count]) => ({
      key,
      label: PLACES_SOURCE_LABELS[key] || key,
      count,
    }))
    .sort((a, b) => b.count - a.count);

  const estimatedCostUsd = byEndpoint.reduce((sum, row) => sum + row.cost, 0);

  return { total, estimatedCostUsd, byEndpoint, bySource };
}
