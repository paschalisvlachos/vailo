/**
 * @deprecated Guest portal uses stored per-locale host content (propertyContentLocales).
 * Kept for backwards compatibility; returns the source text unchanged.
 */
export async function translateGuestText(
  text: string,
  _targetLocale: string
): Promise<string> {
  return String(text || '').trim();
}

/** No-op; kept for callers that clear cache on locale change. */
export function clearGuestTranslationCache(): void {}
