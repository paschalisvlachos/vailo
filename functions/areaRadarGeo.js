/** Geo helpers for Area Radar (server-side polygon boundary checks). */

function pointInPolygon(lat, lng, ring) {
  if (!Array.isArray(ring) || ring.length < 3) return false;
  let inside = false;
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

function parseBoundaryRing(raw) {
  if (!Array.isArray(raw)) return null;
  const ring = raw
    .map((p) => ({
      lat: typeof p?.lat === "number" ? p.lat : parseFloat(String(p?.lat ?? "")),
      lng: typeof p?.lng === "number" ? p.lng : parseFloat(String(p?.lng ?? "")),
    }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  return ring.length >= 3 ? ring : null;
}

module.exports = {
  pointInPolygon,
  parseBoundaryRing,
};
