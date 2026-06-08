/** Shared place-name normalization for deduplicating AI / Google imports. */

const GENERIC_SUFFIXES = [
  'restaurant',
  'horseriding',
  'taverna',
  'cafeteria',
  'cafe',
  'coffee',
  'bar',
  'grill',
  'hotel',
  'resort',
  'beach',
  'agency',
  'shop',
  'studio',
  'studios',
];

const GEO_HINTS = [
  'beach',
  'village',
  'gorge',
  'cove',
  'bay',
  'monastery',
  'archaeological',
  'lake',
  'mountain',
  'park',
  'waterfall',
  'harbour',
  'port',
  'square',
  'cave',
  'ruins',
  'settlement',
  'hamlet',
];

const BUSINESS_HINTS = [
  'studio',
  'studios',
  'hotel',
  'resort',
  'restaurant',
  'taverna',
  'cafe',
  'bar',
  'grill',
  'shop',
  'agency',
  'apartments',
  'rooms',
  'villas',
  'suites',
  'lodge',
  'inn',
  'motel',
];

export function normalizePlaceName(name: string): string {
  return String(name || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u0370-\u03ff]/g, '');
}

/** Strip parenthetical notes (e.g. Greek names) before Google search. */
export function sanitizePlaceSearchTitle(title: string): string {
  return String(title || '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function nameCore(normalized: string): string {
  if (!normalized || normalized.length < 3) return normalized;
  let core = normalized;
  for (const suffix of GENERIC_SUFFIXES) {
    if (core.endsWith(suffix) && core.length > suffix.length + 2) {
      core = core.slice(0, -suffix.length);
    }
  }
  return core.length >= 3 ? core : normalized;
}

function includesHint(normalized: string, hints: string[]): boolean {
  return hints.some((h) => normalized.includes(h));
}

/** True when a beach/village pick would wrongly match a hotel/studio/etc. */
export function placeKindsConflict(requestedNorm: string, resolvedNorm: string): boolean {
  const geoReq = includesHint(requestedNorm, GEO_HINTS);
  const geoRes = includesHint(resolvedNorm, GEO_HINTS);
  const bizReq = includesHint(requestedNorm, BUSINESS_HINTS);
  const bizRes = includesHint(resolvedNorm, BUSINESS_HINTS);

  if (geoReq && bizRes && !geoRes) return true;
  if (bizReq && geoRes && !bizRes) return true;
  return false;
}

export function namesLikelySame(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;

  const ca = nameCore(a);
  const cb = nameCore(b);
  if (ca === cb && ca.length >= 4) {
    if (placeKindsConflict(a, b)) return false;
    return true;
  }

  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  if (shorter.length >= 5 && longer.includes(shorter)) return true;

  if (ca.length >= 4 && cb.length >= 4 && (ca.includes(cb) || cb.includes(ca))) {
    if (placeKindsConflict(a, b)) return false;
    return true;
  }

  return false;
}

/** Region/locality tokens must not alone justify a Google match. */
const LOCALITY_STOPWORDS = new Set([
  'georgioupolis',
  'chania',
  'crete',
  'greece',
  'apokoronas',
  'rethymno',
  'heraklion',
  'municipality',
  'regional',
]);

/** Stricter check when accepting a Google Places result for a requested business name. */
export function placeNamesMatch(requested: string, resolved: string): boolean {
  const a = normalizePlaceName(requested);
  const b = normalizePlaceName(resolved);
  if (!a || !b) return false;
  if (a === b) return true;
  if (placeKindsConflict(a, b)) return false;

  const ca = nameCore(a);
  const cb = nameCore(b);
  if (ca === cb && ca.length >= 4) return true;

  if (ca.length >= 5 && b.includes(ca)) return true;
  if (cb.length >= 5 && a.includes(cb)) return true;

  const words = String(requested || '')
    .toLowerCase()
    .replace(/[^a-z0-9\u0370-\u03ff\s]/g, ' ')
    .split(/\s+/)
    .filter(
      (w) =>
        w.length >= 5 &&
        !GENERIC_SUFFIXES.includes(w) &&
        !LOCALITY_STOPWORDS.has(w)
    );
  return words.some((w) => b.includes(normalizePlaceName(w)));
}
