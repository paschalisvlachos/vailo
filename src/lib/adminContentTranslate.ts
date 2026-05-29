import { getGenerativeModel } from 'firebase/ai';
import { ai } from './firebase';
import { guestLocaleDisplayName } from './guestAiLanguage';
import { normalizeLocaleCode } from './propertyContentLocales';

/**
 * Admin-only draft translation from primary locale into a target locale.
 * Host reviews and saves — never used on the guest portal read path.
 */
export async function translateContentFields(
  fields: Record<string, string>,
  sourceLocale: string,
  targetLocale: string
): Promise<Record<string, string>> {
  const source = normalizeLocaleCode(sourceLocale) || 'en';
  const target = normalizeLocaleCode(targetLocale);
  if (!target || target === source) return { ...fields };

  const entries = Object.entries(fields).filter(([, v]) => (v || '').trim());
  if (entries.length === 0) return {};

  const sourceLabel = guestLocaleDisplayName(source);
  const targetLabel = guestLocaleDisplayName(target);
  const payload = entries.map(([k, v]) => `[${k}]\n${v.trim()}`).join('\n\n');

  try {
    const model = getGenerativeModel(ai, { model: 'gemini-2.5-flash' });
    const result = await model.generateContent(
      `You are a professional hospitality translator. Translate each labeled block from ${sourceLabel} (${source}) to ${targetLabel} (${target}).

Rules:
- Keep proper nouns, business names, place names, street addresses, URLs, phone numbers, and Wi-Fi credentials unchanged unless a standard exonym exists.
- Preserve tone suitable for luxury vacation rentals.
- Return ONLY the translated blocks using the exact same [field_key] labels, in the same order.
- Do not add commentary.

${payload}`
    );
    const text = (result.response.text() || '').trim();
    return parseLabeledBlocks(text, entries.map(([k]) => k));
  } catch (err) {
    console.warn('adminContentTranslate failed:', err);
    throw err;
  }
}

function parseLabeledBlocks(text: string, keys: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of keys) {
    const re = new RegExp(`\\[${escapeRegExp(key)}\\]\\s*([\\s\\S]*?)(?=\\n\\[|$)`, 'i');
    const m = text.match(re);
    if (m?.[1]) out[key] = m[1].trim();
  }
  return out;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
