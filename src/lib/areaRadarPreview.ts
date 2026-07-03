import {
  approxPolygonAreaKm2,
  gridAnchorsInPolygon,
  maxRadiusKmFromCenter,
  polygonBBox,
  polygonCentroid,
  ringFromGeoJson,
  type GeoJsonPolygon,
  type LatLng,
} from './areaRadarGeo';
import { PLACES_ENDPOINT_UNIT_COST_USD } from './placesApiUsage';

export const AREA_RADAR_CANDIDATES_PER_CATEGORY = 12;
export const AREA_RADAR_GRID_SPACING_KM = 3;

export type AreaRadarPreviewInput = {
  searchRegion: GeoJsonPolygon | null;
  categoryCount: number;
  localGemsCount: number;
  discoveredPlacesCount: number;
};

export type AreaRadarPreview = {
  valid: boolean;
  validationMessage: string;
  vertexCount: number;
  areaKm2: number;
  bboxWidthKm: number;
  bboxHeightKm: number;
  anchorCount: number;
  categoryCount: number;
  localGemsCount: number;
  discoveredPlacesCount: number;
  maxCandidates: number;
  estimatedGeminiCalls: number;
  estimatedGoogleTextSearchCalls: number;
  estimatedCostUsd: number;
  centroid: LatLng | null;
  maxRadiusKm: number;
  ring: LatLng[];
};

function bboxDimensionsKm(ring: LatLng[]): { widthKm: number; heightKm: number } {
  const bbox = polygonBBox(ring);
  const center = polygonCentroid(ring);
  if (!bbox || !center) return { widthKm: 0, heightKm: 0 };
  const latRad = (center.lat * Math.PI) / 180;
  const heightKm = (bbox.maxLat - bbox.minLat) * 111.32;
  const widthKm = (bbox.maxLng - bbox.minLng) * 111.32 * Math.cos(latRad);
  return { widthKm: Math.abs(widthKm), heightKm: Math.abs(heightKm) };
}

export function buildAreaRadarPreview(input: AreaRadarPreviewInput): AreaRadarPreview {
  const ring = ringFromGeoJson(input.searchRegion);
  const centroid = polygonCentroid(ring);
  const { widthKm, heightKm } = bboxDimensionsKm(ring);
  const anchors = gridAnchorsInPolygon(ring, AREA_RADAR_GRID_SPACING_KM);
  const maxCandidates =
    input.categoryCount > 0
      ? input.categoryCount * AREA_RADAR_CANDIDATES_PER_CATEGORY
      : 0;

  const estimatedGoogleTextSearchCalls = maxCandidates;
  const estimatedGeminiCalls = input.categoryCount > 0 ? 1 : 0;
  const textSearchCost =
    estimatedGoogleTextSearchCalls * (PLACES_ENDPOINT_UNIT_COST_USD.text_search ?? 0.032);
  const estimatedCostUsd = Math.round((textSearchCost + 0.05) * 100) / 100;

  let validationMessage = '';
  let valid = false;
  if (ring.length < 3) {
    validationMessage = 'Draw a polygon on the map with at least three points.';
  } else if (input.categoryCount === 0) {
    validationMessage = 'Add at least one Local Gems category for this area first.';
  } else {
    valid = true;
    validationMessage = 'Ready to preview. Review estimates below, then run radar.';
  }

  return {
    valid,
    validationMessage,
    vertexCount: ring.length,
    areaKm2: Math.round(approxPolygonAreaKm2(ring) * 10) / 10,
    bboxWidthKm: Math.round(widthKm * 10) / 10,
    bboxHeightKm: Math.round(heightKm * 10) / 10,
    anchorCount: anchors.length,
    categoryCount: input.categoryCount,
    localGemsCount: input.localGemsCount,
    discoveredPlacesCount: input.discoveredPlacesCount,
    maxCandidates,
    estimatedGeminiCalls,
    estimatedGoogleTextSearchCalls,
    estimatedCostUsd,
    centroid,
    maxRadiusKm: centroid ? Math.ceil(maxRadiusKmFromCenter(ring, centroid)) : 0,
    ring,
  };
}
