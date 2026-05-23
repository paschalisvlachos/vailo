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
  'taverna',
];

export function normalizePlaceName(name: string): string {
  return String(name || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u0370-\u03ff]/g, '');
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

export function namesLikelySame(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;

  const ca = nameCore(a);
  const cb = nameCore(b);
  if (ca === cb && ca.length >= 4) return true;

  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  if (shorter.length >= 5 && longer.includes(shorter)) return true;

  if (ca.length >= 4 && cb.length >= 4 && (ca.includes(cb) || cb.includes(ca))) {
    return true;
  }

  return false;
}
