import { getGenerativeModel } from 'firebase/ai';
import { ai } from './firebase';
import { guestLocaleDisplayName } from './guestAiLanguage';

const cache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

function cacheKey(text: string, locale: string): string {
  return `${locale}:${text.trim().slice(0, 2000)}`;
}

/**
 * Translate host-authored guest portal text into the active guest locale.
 * Results are cached in memory for the session.
 */
export async function translateGuestText(
  text: string,
  targetLocale: string
): Promise<string> {
  const raw = String(text || '').trim();
  const locale = String(targetLocale || 'en').trim().toLowerCase() || 'en';
  if (!raw) return raw;

  const key = cacheKey(raw, locale);
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  const pending = inflight.get(key);
  if (pending) return pending;

  const label = guestLocaleDisplayName(locale);
  const promise = (async () => {
    try {
      const model = getGenerativeModel(ai, { model: 'gemini-2.5-flash-lite' });
      const result = await model.generateContent(
        `Translate the following text into ${label} (${locale}). Keep names, addresses, URLs, phone numbers, and Wi-Fi credentials unchanged. Return ONLY the translation, no quotes or commentary.\n\n${raw}`
      );
      const translated = (result.response.text() || '').trim() || raw;
      cache.set(key, translated);
      return translated;
    } catch (err) {
      console.warn('guestAutoTranslate failed:', err);
      cache.set(key, raw);
      return raw;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, promise);
  return promise;
}

export function clearGuestTranslationCache(): void {
  cache.clear();
  inflight.clear();
}
