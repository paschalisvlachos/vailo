/** In-memory cache: Google photo URL → Firebase URL, or null if mirror failed. */
const mirrorResultCache = new Map<string, string | null>();

export function getCachedMirrorResult(googlePhotoUrl: string): string | null | undefined {
  const key = googlePhotoUrl.trim();
  if (!key) return undefined;
  if (!mirrorResultCache.has(key)) return undefined;
  return mirrorResultCache.get(key) ?? null;
}

export function setCachedMirrorResult(googlePhotoUrl: string, firebaseUrl: string | null): void {
  const key = googlePhotoUrl.trim();
  if (!key) return;
  mirrorResultCache.set(key, firebaseUrl);
}
