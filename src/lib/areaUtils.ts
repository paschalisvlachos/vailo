/** Firestore area path helpers (display name ↔ slug id). */

export function areaNameToId(areaName: string): string {
  return areaName.trim().toLowerCase().replace(/\s+/g, '-');
}

export function discoveredPlacesPath(country: string, areaId: string) {
  return ['countries', country, 'areas', areaId, 'discoveredPlaces'] as const;
}
