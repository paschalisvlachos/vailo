/** Geo helpers for Area Radar polygon draw + grid scan (shared client preview + run). */

export type LatLng = { lat: number; lng: number };

export type GeoJsonPolygon = {
  type: 'Polygon';
  coordinates: [number, number][][];
};

const EARTH_RADIUS_KM = 6371;

export function ringFromGeoJson(polygon: GeoJsonPolygon | null | undefined): LatLng[] {
  const ring = polygon?.coordinates?.[0];
  if (!ring?.length) return [];
  const points = ring.map(([lng, lat]) => ({ lat, lng }));
  if (points.length > 1) {
    const first = points[0];
    const last = points[points.length - 1];
    if (first.lat === last.lat && first.lng === last.lng) {
      return points.slice(0, -1);
    }
  }
  return points;
}

export function geoJsonFromRing(ring: LatLng[]): GeoJsonPolygon | null {
  if (ring.length < 3) return null;
  const coords: [number, number][] = ring.map(({ lat, lng }) => [lng, lat]);
  const first = coords[0];
  const last = coords[coords.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    coords.push([first[0], first[1]]);
  }
  return { type: 'Polygon', coordinates: [coords] };
}

export function pointInPolygon(point: LatLng, ring: LatLng[]): boolean {
  if (ring.length < 3) return false;
  let inside = false;
  const { lat, lng } = point;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const yi = ring[i].lat;
    const xi = ring[i].lng;
    const yj = ring[j].lat;
    const xj = ring[j].lng;
    const intersect =
      yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function polygonCentroid(ring: LatLng[]): LatLng | null {
  if (ring.length === 0) return null;
  let latSum = 0;
  let lngSum = 0;
  for (const p of ring) {
    latSum += p.lat;
    lngSum += p.lng;
  }
  return { lat: latSum / ring.length, lng: lngSum / ring.length };
}

export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function maxRadiusKmFromCenter(ring: LatLng[], center: LatLng): number {
  let max = 0;
  for (const p of ring) {
    max = Math.max(max, haversineKm(center, p));
  }
  return max;
}

export function approxPolygonAreaKm2(ring: LatLng[]): number {
  if (ring.length < 3) return 0;
  const center = polygonCentroid(ring);
  if (!center) return 0;
  const latRad = (center.lat * Math.PI) / 180;
  const kmPerDegLat = 111.32;
  const kmPerDegLng = 111.32 * Math.cos(latRad);
  let area = 0;
  for (let i = 0; i < ring.length; i++) {
    const j = (i + 1) % ring.length;
    const xi = ring[i].lng * kmPerDegLng;
    const yi = ring[i].lat * kmPerDegLat;
    const xj = ring[j].lng * kmPerDegLng;
    const yj = ring[j].lat * kmPerDegLat;
    area += xi * yj - xj * yi;
  }
  return Math.abs(area / 2);
}

export type PolygonBBox = {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
};

export function polygonBBox(ring: LatLng[]): PolygonBBox | null {
  if (!ring.length) return null;
  let minLat = ring[0].lat;
  let maxLat = ring[0].lat;
  let minLng = ring[0].lng;
  let maxLng = ring[0].lng;
  for (const p of ring.slice(1)) {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLng = Math.min(minLng, p.lng);
    maxLng = Math.max(maxLng, p.lng);
  }
  return { minLat, maxLat, minLng, maxLng };
}

/** Grid of anchor points inside the polygon (~spacingKm apart). */
export function gridAnchorsInPolygon(ring: LatLng[], spacingKm = 3): LatLng[] {
  const bbox = polygonBBox(ring);
  const centroid = polygonCentroid(ring);
  if (!bbox || !centroid) return [];

  const latRad = (centroid.lat * Math.PI) / 180;
  const latStep = spacingKm / 111.32;
  const lngStep = spacingKm / (111.32 * Math.cos(latRad) || 1);

  const anchors: LatLng[] = [];
  const seen = new Set<string>();

  const add = (p: LatLng) => {
    if (!pointInPolygon(p, ring)) return;
    const key = `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;
    if (seen.has(key)) return;
    seen.add(key);
    anchors.push(p);
  };

  add(centroid);

  for (let lat = bbox.minLat; lat <= bbox.maxLat; lat += latStep) {
    for (let lng = bbox.minLng; lng <= bbox.maxLng; lng += lngStep) {
      add({ lat, lng });
    }
  }

  return anchors;
}

export function ringFromGooglePath(path: google.maps.MVCArray<google.maps.LatLng>): LatLng[] {
  const out: LatLng[] = [];
  for (let i = 0; i < path.getLength(); i++) {
    const ll = path.getAt(i);
    out.push({ lat: ll.lat(), lng: ll.lng() });
  }
  return out;
}

export type FirestoreRingPoint = { lat: number; lng: number };

/** Firestore-safe polygon storage (GeoJSON coordinates are nested arrays and cannot be saved). */
export function ringToFirestore(ring: LatLng[]): FirestoreRingPoint[] {
  return ring.map(({ lat, lng }) => ({ lat: Number(lat), lng: Number(lng) }));
}

export function ringFromFirestoreRing(raw: unknown): LatLng[] {
  if (!Array.isArray(raw)) return [];
  const out: LatLng[] = [];
  for (const p of raw) {
    if (!p || typeof p !== 'object') continue;
    const rec = p as FirestoreRingPoint;
    const lat =
      typeof rec.lat === 'number' ? rec.lat : parseFloat(String(rec.lat ?? ''));
    const lng =
      typeof rec.lng === 'number' ? rec.lng : parseFloat(String(rec.lng ?? ''));
    if (Number.isFinite(lat) && Number.isFinite(lng)) out.push({ lat, lng });
  }
  return out;
}

/** Prefer Firestore ring; fall back to legacy GeoJSON if present. */
export function resolveSearchRegionRing(
  searchRegionRing: unknown,
  searchRegionGeoJson: GeoJsonPolygon | null | undefined
): LatLng[] {
  const fromRing = ringFromFirestoreRing(searchRegionRing);
  if (fromRing.length >= 3) return fromRing;
  return ringFromGeoJson(searchRegionGeoJson);
}
