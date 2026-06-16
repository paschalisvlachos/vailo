import { getGenerativeModel } from 'firebase/ai';
import { ai } from './firebase';
import {
  namesLikelySame,
  normalizePlaceName,
  nameCore,
  stripTrailingLocality,
} from './placeNameUtils';

export type TitleCatalogEntry = {
  name?: string;
  title?: string;
  alternateTitles?: string[];
  nameByLocale?: Record<string, string>;
};

export function dedupeAlternateTitles(canonicalName: string, titles: string[]): string[] {
  const seen = new Set<string>();
  const canonical = normalizePlaceName(canonicalName);
  const out: string[] = [];

  for (const raw of titles) {
    const trimmed = String(raw || '').trim();
    if (!trimmed) continue;
    const norm = normalizePlaceName(trimmed);
    if (!norm || norm === canonical || seen.has(norm)) continue;
    seen.add(norm);
    out.push(trimmed);
  }

  return out;
}

/** Benign geographic words that may differ between spelling variants (e.g. "X Beach"). */
const ALLOWED_EXTRA_GEO_TOKENS = new Set([
  'beach',
  'village',
  'town',
  'bay',
  'lake',
  'springs',
  'gorge',
  'cove',
  'port',
  'harbour',
  'harbor',
  'square',
  'monastery',
  'ruins',
  'settlement',
  'hamlet',
  'well',
  'cave',
  'waterfall',
  'park',
]);

/** Extra tokens that indicate a different business, not a spelling variant. */
const EXTRA_BUSINESS_TOKENS = new Set([
  'taverna',
  'tavern',
  'restaurant',
  'cafeteria',
  'cafe',
  'bar',
  'grill',
  'hotel',
  'resort',
  'studio',
  'studios',
  'bus',
  'sea',
  'riding',
  'center',
  'centre',
  'stables',
  'stable',
  'horse',
  'horses',
  'traditional',
  'mythos',
  'agency',
  'shop',
  'safari',
  'jeep',
  'quad',
  'buggy',
  'kayak',
  'scuba',
  'snorkel',
  'cruise',
  'charter',
  'excursion',
  'watersports',
  'watersport',
  'rentals',
  'rental',
  'jetski',
  'diving',
  'dive',
  'apartments',
  'rooms',
  'villas',
  'suites',
  'lodge',
  'inn',
  'motel',
]);

function tokenizeTitle(title: string): string[] {
  return String(title)
    .toLowerCase()
    .replace(/[^a-z0-9\u0370-\u03ff\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const row = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = i - 1;
    row[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = row[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost);
      prev = temp;
    }
  }
  return row[n];
}

function coresAreSpellingVariants(a: string, b: string): boolean {
  const ca = nameCore(a);
  const cb = nameCore(b);
  if (!ca || !cb || ca === cb) return ca === cb && ca.length >= 3;
  if (ca.length >= 4 && cb.length >= 4) {
    if (ca + 's' === cb || cb + 's' === ca) return true;
    if (Math.abs(ca.length - cb.length) <= 3 && levenshtein(ca, cb) <= 2) return true;
  }
  return false;
}

/**
 * True when `candidate` is only a spelling/transliteration variant of `canonicalName`
 * (e.g. Almyrida/Almirida, Kalyvaki/Kalivaki, Georgioupoli/Georgioupolis) — not another venue.
 */
export function isAlternateTitleVocabularyVariant(
  canonicalName: string,
  candidate: string
): boolean {
  const canonical = stripTrailingLocality(String(canonicalName || '').trim());
  const raw = stripTrailingLocality(String(candidate || '').trim());
  if (!canonical || !raw) return false;

  // "Taverna X, Georgioupoli" style entries are different businesses.
  if (String(candidate).includes(',')) return false;

  const a = normalizePlaceName(canonical);
  const b = normalizePlaceName(raw);
  if (!a || !b || a === b) return false;

  const canonicalTokens = tokenizeTitle(canonical);
  const candidateTokens = tokenizeTitle(raw);

  for (const token of candidateTokens) {
    if (canonicalTokens.includes(token)) continue;
    if (ALLOWED_EXTRA_GEO_TOKENS.has(token)) continue;
    if (EXTRA_BUSINESS_TOKENS.has(token)) return false;
    // Unknown extra word → likely a different place/venue name.
    if (token.length >= 3) return false;
  }

  if (coresAreSpellingVariants(a, b)) return true;

  // Same core with only an allowed geographic suffix added/removed.
  const ca = nameCore(a);
  const cb = nameCore(b);
  if (ca.length >= 4 && cb.length >= 4 && (ca === cb || ca + 's' === cb || cb + 's' === ca)) {
    return true;
  }

  // Fallback: very close full-name match without extra business tokens.
  if (namesLikelySame(a, b) && candidateTokens.length <= canonicalTokens.length + 1) {
    return true;
  }

  return false;
}

/** Keep only spelling/transliteration variants of the canonical name. */
export function filterAlternateTitleVocabularyVariants(
  canonicalName: string,
  titles: string[]
): string[] {
  return dedupeAlternateTitles(
    canonicalName,
    titles.filter((t) => isAlternateTitleVocabularyVariant(canonicalName, t))
  );
}

export function collectMatchableTitles(entry: TitleCatalogEntry): string[] {
  const out: string[] = [];
  const add = (value: string | undefined) => {
    const trimmed = String(value || '').trim();
    if (!trimmed) return;
    const norm = normalizePlaceName(trimmed);
    if (!norm || out.some((existing) => normalizePlaceName(existing) === norm)) return;
    out.push(trimmed);
  };

  add(entry.title);
  add(entry.name);
  for (const alt of entry.alternateTitles || []) add(alt);
  if (entry.nameByLocale && typeof entry.nameByLocale === 'object') {
    for (const value of Object.values(entry.nameByLocale)) {
      if (typeof value === 'string') add(value);
    }
  }

  return out;
}

export function titleMatchesCatalogEntry(
  requestedTitle: string,
  entry: TitleCatalogEntry
): boolean {
  const requested = normalizePlaceName(requestedTitle);
  if (!requested) return false;

  for (const candidate of collectMatchableTitles(entry)) {
    const norm = normalizePlaceName(candidate);
    if (norm && namesLikelySame(requested, norm)) return true;
  }

  return false;
}

function parseJsonArray(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((v) => String(v || '').trim()).filter(Boolean);
  } catch {
    return trimmed
      .split(/[\n,;|]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
}

/** AI spelling / wording variants guests or Gemini might use (area-side only). */
export async function suggestAlternatePlaceTitles(
  canonicalName: string,
  opts: {
    areaName?: string;
    category?: string;
    existing?: string[];
  } = {}
): Promise<string[]> {
  const name = String(canonicalName || '').trim();
  const existingFiltered = filterAlternateTitleVocabularyVariants(name, opts.existing || []);
  if (!name) return existingFiltered;

  const prompt = `You help a Greek hospitality app match guest AI place names to curated listings.

Canonical place name: "${name}"
${opts.areaName ? `Area: ${opts.areaName}` : ''}
${opts.category ? `Category: ${opts.category}` : ''}

Return a JSON array of 2–6 alternative spellings of the EXACT SAME place name only:
- Transliterations (Latin ↔ Greek spelling habits)
- Missing/extra accents
- Common typos (e.g. "Kalyvaki" vs "Kalivaki", "Almyrida" vs "Almirida", "Georgioupoli" vs "Georgioupolis")
- Optional benign suffix on the same spot only: Beach, Village, Bay (e.g. "Kalyvaki Beach" for "Kalyvaki")

STRICT RULES:
- Do NOT list other businesses, tavernas, stables, dive shops, or venues in the area
- Do NOT append activity words (Safari, Watersports, Riding, Sea Bus, Restaurant, Taverna, etc.)
- Do NOT use comma-separated "Business, Town" formats
- Each array item must refer to the same geographic place or the same verified venue as the canonical name

Return ONLY a JSON string array, no markdown.`;

  try {
    const model = getGenerativeModel(ai, { model: 'gemini-2.5-flash' });
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    const suggested = parseJsonArray(jsonMatch ? jsonMatch[0] : text);
    const variantSuggested = filterAlternateTitleVocabularyVariants(name, suggested);
    return dedupeAlternateTitles(name, [...existingFiltered, ...variantSuggested]);
  } catch (err) {
    console.warn('[Vailo] suggestAlternatePlaceTitles failed:', err);
    return existingFiltered;
  }
}

export function mergeAlternateTitleLists(
  canonicalName: string,
  ...lists: Array<string[] | undefined>
): string[] {
  const merged: string[] = [];
  for (const list of lists) {
    if (list?.length) merged.push(...list);
  }
  return filterAlternateTitleVocabularyVariants(canonicalName, merged);
}
