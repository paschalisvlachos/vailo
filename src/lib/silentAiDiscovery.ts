/**
 * Wizard background pass: Gemini suggests new places; verified hits are stored
 * in area discoveredPlaces via resolvePlacePhoto, failures go to unverified queue.
 */

import { getGenerativeModel } from 'firebase/ai';
import { ai } from './firebase';
import { guestAiLanguageBlock } from './guestAiLanguage';
import {
  buildCategoryKnowledgePromptSection,
  getCategoryKnowledgeMode,
} from './liveLikeLocalCategories';
import { shouldDropAreasCommercialAiPick } from './areasPickFilter';
import { persistUnverifiedAiMentions } from './guestDiscoveredPlaces';
import { resolvePlacePhoto } from './placePhotoResolver';
import { titleMatchesCatalogEntry } from './alternateTitles';
import { namesLikelySame, normalizePlaceName } from './placeNameUtils';

const SILENT_AI_LOG = '[Vailo silent AI]';

const SILENT_DISCOVERY_MODEL = 'gemini-3.5-flash';
const CANDIDATES_PER_CATEGORY = 8;

type KnownPlaceRow = {
  name?: string;
  alternateTitles?: string[];
  googlePlaceId?: string;
};

type SilentCandidate = {
  title: string;
  description?: string;
  category: string;
};

function parseSilentDiscoveryJson(raw: string): Record<string, unknown> | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw.trim());
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    const first = raw.indexOf('{');
    const last = raw.lastIndexOf('}');
    if (first === -1 || last <= first) return null;
    try {
      return JSON.parse(raw.substring(first, last + 1)) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

export function placeAlreadyInCatalog(
  title: string,
  gems: KnownPlaceRow[],
  discoveredPlaces: KnownPlaceRow[]
): boolean {
  const norm = normalizePlaceName(title);
  if (!norm) return true;
  for (const row of [...gems, ...discoveredPlaces]) {
    const name = String(row.name || '').trim();
    if (!name) continue;
    if (titleMatchesCatalogEntry(title, row)) return true;
    if (namesLikelySame(norm, normalizePlaceName(name))) return true;
  }
  return false;
}

function extractCandidates(parsed: Record<string, unknown>): SilentCandidate[] {
  const out: SilentCandidate[] = [];
  const categories = parsed.categories;
  if (!Array.isArray(categories)) return out;

  for (const cat of categories) {
    if (!cat || typeof cat !== 'object') continue;
    const categoryName = String((cat as Record<string, unknown>).categoryName || '').trim();
    const items = (cat as Record<string, unknown>).candidates;
    if (!categoryName || !Array.isArray(items)) continue;
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const title = String((item as Record<string, unknown>).title || '').trim();
      if (!title) continue;
      out.push({
        title,
        description: String((item as Record<string, unknown>).description || '').trim(),
        category: categoryName,
      });
    }
  }
  return out;
}

export async function runSilentAiPlaceDiscovery(params: {
  locale: string;
  categories: string[];
  categoryKnowledgeByPrimary: Record<string, string>;
  startLocationName: string;
  gpsString: string;
  distanceLimitKm: number;
  areaCtx: { country: string; areaId: string; areaName: string };
  startCoords: { lat: number; lng: number } | null;
  knownGems: KnownPlaceRow[];
  knownDiscovered: KnownPlaceRow[];
  knownGemNamesByCategory: Record<string, string[]>;
}): Promise<void> {
  const {
    locale,
    categories,
    categoryKnowledgeByPrimary,
    startLocationName,
    gpsString,
    distanceLimitKm,
    areaCtx,
    startCoords,
    knownGems,
    knownDiscovered,
    knownGemNamesByCategory,
  } = params;

  if (!areaCtx.country || !areaCtx.areaId || categories.length === 0) return;

  console.log(`${SILENT_AI_LOG} started`, {
    categories,
    distanceLimitKm,
    area: areaCtx.areaName,
    country: areaCtx.country,
  });

  const categoryKnowledgeBlock = buildCategoryKnowledgePromptSection(
    categories,
    categoryKnowledgeByPrimary
  );

  const knownBlock = categories
    .map((cat) => {
      const names = knownGemNamesByCategory[cat] || [];
      if (names.length === 0) return `- **${cat}**: (no curated gems yet)`;
      return `- **${cat}**: ${names.slice(0, 40).join('; ')}`;
    })
    .join('\n');

  const systemInstruction = `You are Vailo’s background place scout for this region. Reply ONLY with valid JSON (no markdown).

${guestAiLanguageBlock(locale)}

Your job: suggest NEW real places worth adding to our database — NOT duplicates of what we already list.
- Use official Google Maps names only.
- Never suggest permanently closed businesses.
- For [AREAS ONLY] categories: geographic spots only — no restaurants, bars, operators, or shops.
- For [BUSINESS ONLY] categories: named establishments with village when helpful.
- Return up to ${CANDIDATES_PER_CATEGORY} candidates per category, best-first.`;

  const prompt = `Starting point: "${startLocationName}" (${gpsString}). Guest radius: ${distanceLimitKm}km.
Categories: ${categories.join(', ')}
${categoryKnowledgeBlock}

ALREADY IN VAILO (do NOT repeat these names or the same place under another spelling):
${knownBlock}

Return JSON:
{
  "categories": [
    {
      "categoryName": "Category name",
      "candidates": [
        { "title": "Official Google Maps name", "description": "Two sentences for admin review." }
      ]
    }
  ]
}`;

  let parsed: Record<string, unknown> | null = null;
  try {
    const model = getGenerativeModel(ai, {
      model: SILENT_DISCOVERY_MODEL,
      systemInstruction: { role: 'system', parts: [{ text: systemInstruction }] },
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.6,
        maxOutputTokens: 8192,
        thinkingConfig: { thinkingBudget: 0 },
      },
    });
    const result = await model.generateContent(prompt);
    parsed = parseSilentDiscoveryJson(result.response.text());
  } catch (err) {
    console.warn(`${SILENT_AI_LOG} Gemini failed`, err);
    return;
  }

  if (!parsed) {
    console.warn(`${SILENT_AI_LOG} unparseable JSON response`);
    return;
  }

  const candidates = extractCandidates(parsed);
  if (candidates.length === 0) {
    console.log(`${SILENT_AI_LOG} no candidates in response`);
    return;
  }

  console.log(`${SILENT_AI_LOG} candidates received`, { count: candidates.length, categories });

  const unverified: Array<{
    title: string;
    description?: string;
    category?: string;
    failureReason?: string;
  }> = [];

  for (const candidate of candidates) {
    if (placeAlreadyInCatalog(candidate.title, knownGems, knownDiscovered)) {
      console.log(`${SILENT_AI_LOG} skip — already in catalog`, {
        title: candidate.title,
        category: candidate.category,
      });
      continue;
    }

    if (
      shouldDropAreasCommercialAiPick(
        { title: candidate.title, source: 'ai' },
        candidate.category,
        categoryKnowledgeByPrimary
      )
    ) {
      console.log(`${SILENT_AI_LOG} skip — areas-only commercial`, {
        title: candidate.title,
        category: candidate.category,
      });
      unverified.push({
        title: candidate.title,
        description: candidate.description,
        category: candidate.category,
        failureReason: 'areas-only — commercial/business blocked',
      });
      continue;
    }

    const knowledgeMode = getCategoryKnowledgeMode(
      categoryKnowledgeByPrimary[candidate.category] || ''
    );

    try {
      const resolved = await resolvePlacePhoto({
        title: candidate.title,
        area: areaCtx.areaName,
        country: areaCtx.country,
        areaId: areaCtx.areaId,
        anchorLat: startCoords?.lat,
        anchorLng: startCoords?.lng,
        maxKm: distanceLimitKm,
        knowledgeMode,
      });

      if (resolved.notFound || (!resolved.photoUrl && !resolved.googlePlaceId)) {
        console.log(`${SILENT_AI_LOG} unverified — Google match failed`, {
          title: candidate.title,
          category: candidate.category,
        });
        unverified.push({
          title: candidate.title,
          description: candidate.description,
          category: candidate.category,
          failureReason: 'Google Maps verification failed',
        });
        continue;
      }

      console.log(`${SILENT_AI_LOG} stored in discovered places`, {
        title: candidate.title,
        category: candidate.category,
        resolveOrigin: resolved.resolveOrigin,
        googleApiBilled: resolved.googleApiBilled,
        placeName: resolved.placeName,
      });
    } catch (err) {
      console.warn(`${SILENT_AI_LOG} resolvePlacePhoto error`, candidate.title, err);
      unverified.push({
        title: candidate.title,
        description: candidate.description,
        category: candidate.category,
        failureReason: 'resolvePlacePhoto error',
      });
    }
  }

  if (unverified.length > 0) {
    console.log(`${SILENT_AI_LOG} saving unverified mentions`, {
      count: unverified.length,
      titles: unverified.map((m) => m.title),
    });
    await persistUnverifiedAiMentions(unverified, {
      country: areaCtx.country,
      areaId: areaCtx.areaId,
    });
  }
}
