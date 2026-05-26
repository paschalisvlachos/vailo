import { getGenerativeModel } from 'firebase/ai';
import { ai } from './firebase';

export type FeaturedPreviewResult = {
  previewLine: string;
  digest: string;
};

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

2. digest — A compact "at a glance" summary, MAXIMUM 700 characters. Use short bullet points (use "•" followed by a space) OR two short paragraphs. Include every must-know concrete detail (times, codes, addresses, numbers, rules, instructions). Skip filler, marketing copy, and obvious context.

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
    digest: digest.slice(0, 1500),
  };
}
