import { getGenerativeModel } from 'firebase/ai';
import { ai } from './firebase';

export type FeaturedPreviewResult = {
  previewLine: string;
  digest: string;
};

function trimUrlTrailingPunctuation(url: string): string {
  return url.replace(/[.,;:!?)]+$/g, '');
}

/** Pull http(s) and markdown link targets from house-guide source text. */
export function extractUrlsFromGuideSource(sourceText: string): string[] {
  const urls = new Set<string>();
  const httpRe = /\bhttps?:\/\/[^\s<>\])}"']+/gi;
  for (const match of sourceText.match(httpRe) || []) {
    const cleaned = trimUrlTrailingPunctuation(match.trim());
    if (cleaned) urls.add(cleaned);
  }
  const mdRe = /\[([^\]]*)\]\((https?:\/\/[^)]+)\)/gi;
  let mdMatch: RegExpExecArray | null;
  while ((mdMatch = mdRe.exec(sourceText)) !== null) {
    const cleaned = trimUrlTrailingPunctuation(mdMatch[2].trim());
    if (cleaned) urls.add(cleaned);
  }
  return [...urls];
}

/** Append booking/timetable URLs from source when the AI digest omitted them. */
export function ensureSourceUrlsInDigest(digest: string, sourceText: string, maxLen = 1500): string {
  const urls = extractUrlsFromGuideSource(sourceText);
  if (urls.length === 0) return digest;

  let out = digest.trim();
  for (const url of urls) {
    if (out.includes(url)) continue;
    const line = `\n• ${url}`;
    if (out.length + line.length > maxLen) break;
    out += line;
  }
  return out.slice(0, maxLen).trim();
}

/**
 * Generates a guest-portal preview for ONE featured key. Returns:
 *   - previewLine: ≤ 90 chars, scannable single sentence with concrete facts.
 *   - digest: ≤ 700 chars, compact bullet / 2-paragraph "at a glance" summary.
 *
 * Uses Gemini 2.5 Flash (cheap & fast) in JSON response mode. Caller is
 * expected to cache the result in Firestore so this is only called when
 * the source content changes.
 */
export async function generateFeaturedPreview(
  title: string,
  sourceText: string
): Promise<FeaturedPreviewResult> {
  if (!sourceText.trim()) {
    return { previewLine: '', digest: '' };
  }

  const prompt = `You are a guest-portal copywriter for a vacation rental.

Section title: "${title}"

From the SOURCE TEXT below, produce a JSON object with two outputs aimed at a guest who wants the most useful information at a glance:

1. previewLine — ONE scannable sentence, MAXIMUM 90 characters, listing the most useful concrete facts (times, codes, instructions). Plain text. No marketing language. If the source has no concrete facts, summarize the topic in one sentence.

2. digest — A compact "at a glance" summary, MAXIMUM 700 characters. Use short bullet points (use "•" followed by a space) OR two short paragraphs. Include every must-know concrete detail (times, codes, addresses, numbers, rules, instructions). Include full booking and timetable URLs exactly as in the source (https://…); never replace a URL with a brand name alone. Skip filler, marketing copy, and obvious context.

Write previewLine and digest in the SAME LANGUAGE as the SOURCE TEXT (do not translate to English unless the source is English). previewLine may omit URLs if over the character limit; digest must not omit them.

Return ONLY a JSON object with this exact schema:
{
  "previewLine": "...",
  "digest": "..."
}

SOURCE TEXT:
"""
${sourceText}
"""`;

  const model = getGenerativeModel(ai, {
    model: 'gemini-2.5-flash',
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.3,
    },
  });

  const response = await model.generateContent(prompt);
  const rawText = response.response.text();

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    const first = rawText.indexOf('{');
    const last = rawText.lastIndexOf('}');
    if (first === -1 || last === -1) {
      throw new Error('AI did not return a JSON object.');
    }
    parsed = JSON.parse(rawText.substring(first, last + 1));
  }

  const previewLine =
    parsed && typeof parsed === 'object' && typeof (parsed as { previewLine?: unknown }).previewLine === 'string'
      ? (parsed as { previewLine: string }).previewLine.trim()
      : '';
  const digest =
    parsed && typeof parsed === 'object' && typeof (parsed as { digest?: unknown }).digest === 'string'
      ? (parsed as { digest: string }).digest.trim()
      : '';

  return {
    previewLine: previewLine.slice(0, 200),
    digest: ensureSourceUrlsInDigest(digest, sourceText, 1500),
  };
}
