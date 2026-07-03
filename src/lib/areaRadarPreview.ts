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

export const AREA_RADAR_CANDIDATES_PER_CATEGORY = 15;
export const AREA_RADAR_GRID_CANDIDATES_PER_CATEGORY = 8;
export const AREA_RADAR_GRID_SPACING_KM = 3;
export const AREA_RADAR_CATEGORY_BATCH_SIZE = 4;
/** Run extra grid-anchor scout passes when the polygon exceeds this area. */
export const AREA_RADAR_LARGE_AREA_KM2 = 50;
export const AREA_RADAR_MAX_GRID_PASSES = 8;
/** Above this area, radar samples only a few grid sectors — draw smaller regions for better coverage. */
export const AREA_RADAR_RECOMMENDED_MAX_AREA_KM2 = 400;

export type AreaRadarPreviewInput = {
  searchRegion: GeoJsonPolygon | null;
  categoryCount: number;
  localGemsCount: number;
  discoveredPlacesCount: number;
};

export type AreaRadarPreview = {
  valid: boolean;
  validationMessage: string;
  areaWarning: string | null;
  vertexCount: number;
  areaKm2: number;
  bboxWidthKm: number;
  bboxHeightKm: number;
  anchorCount: number;
  gridPassCount: number;
  gridCoveragePct: number;
  categoryCount: number;
  localGemsCount: number;
  discoveredPlacesCount: number;
  /** Upper bound if Gemini fills every slot on every pass (actual runs are usually much lower). */
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

function gridPassCountForArea(areaKm2: number, anchorCount: number): number {
  if (areaKm2 < AREA_RADAR_LARGE_AREA_KM2 || anchorCount === 0) return 0;
  return Math.min(anchorCount, AREA_RADAR_MAX_GRID_PASSES);
}

export function buildAreaRadarPreview(input: AreaRadarPreviewInput): AreaRadarPreview {
  const ring = ringFromGeoJson(input.searchRegion);
  const centroid = polygonCentroid(ring);
  const areaKm2 = approxPolygonAreaKm2(ring);
  const { widthKm, heightKm } = bboxDimensionsKm(ring);
  const anchors = gridAnchorsInPolygon(ring, AREA_RADAR_GRID_SPACING_KM);
  const anchorCount = anchors.length;
  const gridPassCount = gridPassCountForArea(areaKm2, anchorCount);

  const categoryBatchCount =
    input.categoryCount > 0
      ? Math.ceil(input.categoryCount / AREA_RADAR_CATEGORY_BATCH_SIZE)
      : 0;
  const estimatedGeminiCalls = categoryBatchCount + gridPassCount;

  const batchCandidateCap =
    input.categoryCount > 0
      ? input.categoryCount * AREA_RADAR_CANDIDATES_PER_CATEGORY
      : 0;
  const gridCandidateCap =
    gridPassCount > 0
      ? gridPassCount * input.categoryCount * AREA_RADAR_GRID_CANDIDATES_PER_CATEGORY
      : 0;
  const maxCandidates = batchCandidateCap + gridCandidateCap;

  const gridCoveragePct =
    anchorCount > 0 && gridPassCount > 0
      ? Math.round((gridPassCount / anchorCount) * 1000) / 10
      : 0;

  const estimatedGoogleTextSearchCalls = maxCandidates;
  const textSearchCost =
    estimatedGoogleTextSearchCalls * (PLACES_ENDPOINT_UNIT_COST_USD.text_search ?? 0.032);
  const estimatedCostUsd = Math.round((textSearchCost + estimatedGeminiCalls * 0.05) * 100) / 100;

  let validationMessage = '';
  let areaWarning: string | null = null;
  let valid = false;
  if (ring.length < 3) {
    validationMessage = 'Draw a polygon on the map with at least three points.';
  } else if (input.categoryCount === 0) {
    validationMessage = 'Add at least one Local Gems category for this area first.';
  } else {
    valid = true;
    validationMessage = 'Ready to preview. Review estimates below, then run radar.';
    if (areaKm2 > AREA_RADAR_RECOMMENDED_MAX_AREA_KM2) {
      areaWarning = `This region is ${Math.round(areaKm2)} km² — radar scouts at most ${gridPassCount} of ${anchorCount} grid sectors (~${gridCoveragePct}% coverage). Draw smaller polygons (town or coastline, under ~${AREA_RADAR_RECOMMENDED_MAX_AREA_KM2} km²) and run radar per zone for thorough discovery.`;
    } else if (anchorCount > AREA_RADAR_MAX_GRID_PASSES * 3) {
      areaWarning = `Only ${gridPassCount} of ${anchorCount} grid sectors will be scouted (~${gridCoveragePct}% coverage). Tighten the polygon or run separate passes per neighborhood.`;
    }
  }

  return {
    valid,
    validationMessage,
    areaWarning,
    vertexCount: ring.length,
    areaKm2: Math.round(areaKm2 * 10) / 10,
    bboxWidthKm: Math.round(widthKm * 10) / 10,
    bboxHeightKm: Math.round(heightKm * 10) / 10,
    anchorCount: anchorCount,
    gridPassCount,
    gridCoveragePct,
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
