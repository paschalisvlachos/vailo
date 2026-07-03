/**
 * Area Radar — AI scout + Google verify inside a drawn polygon.
 */

import { getGenerativeModel } from 'firebase/ai';
import { ai } from './firebase';
import {
  ringFromGeoJson,
  polygonCentroid,
  maxRadiusKmFromCenter,
  pointInPolygon,
  type GeoJsonPolygon,
} from './areaRadarGeo';
import { AREA_RADAR_CANDIDATES_PER_CATEGORY } from './areaRadarPreview';
import { resolvePlacePhoto } from './placePhotoResolver';
import { PLACES_USAGE_CALLER } from './placesApiUsageCallers';
import { guestAiLanguageBlock } from './guestAiLanguage';
import {
  buildCategoryKnowledgePromptSection,
  getCategoryKnowledgeMode,
} from './liveLikeLocalCategories';
import { shouldDropAreasCommercialAiPick } from './areasPickFilter';
import { placeAlreadyInCatalog } from './silentAiDiscovery';
import { categoryPrimaryName } from './categoryLocale';

const RADAR_MODEL = 'gemini-3.5-flash';

type KnownPlaceRow = {
  name?: string;
  alternateTitles?: string[];
  googlePlaceId?: string;
};

type RadarCandidate = {
  title: string;
  description?: string;
  category: string;
};

export type AreaRadarRunProgress = {
  phase: 'ai' | 'verify' | 'done';
  message: string;
  processed?: number;
  total?: number;
};

export type AreaRadarRunResult = {
  created: number;
  skippedDuplicate: number;
  skippedOutside: number;
  skippedFiltered: number;
  failedVerification: number;
  candidatesFound: number;
};

function parseRadarJson(raw: string): Record<string, unknown> | null {
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

function extractCandidates(parsed: Record<string, unknown>): RadarCandidate[] {
  const out: RadarCandidate[] = [];
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

export async function runAreaRadarDiscovery(params: {
  searchRegion: GeoJsonPolygon;
  categories: string[];
  categoryKnowledgeByPrimary: Record<string, string>;
  areaCtx: { country: string; areaId: string; areaName: string };
  knownGems: KnownPlaceRow[];
  knownDiscovered: KnownPlaceRow[];
  knownGemNamesByCategory: Record<string, string[]>;
  primaryLocale: string;
  onProgress?: (progress: AreaRadarRunProgress) => void;
}): Promise<AreaRadarRunResult> {
  const {
    searchRegion,
    categories,
    categoryKnowledgeByPrimary,
    areaCtx,
    knownGems,
    knownDiscovered,
    knownGemNamesByCategory,
    primaryLocale,
    onProgress,
  } = params;

  const ring = ringFromGeoJson(searchRegion);
  const centroid = polygonCentroid(ring);
  if (!centroid || ring.length < 3 || categories.length === 0) {
    return {
      created: 0,
      skippedDuplicate: 0,
      skippedOutside: 0,
      skippedFiltered: 0,
      failedVerification: 0,
      candidatesFound: 0,
    };
  }

  const boundaryRing = ring.map(({ lat, lng }) => ({ lat, lng }));
  const maxKm = Math.max(5, Math.ceil(maxRadiusKmFromCenter(ring, centroid)));
  const gpsString = `${centroid.lat.toFixed(5)}, ${centroid.lng.toFixed(5)}`;

  onProgress?.({
    phase: 'ai',
    message: 'Asking Gemini for place candidates in your drawn region…',
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

  const systemInstruction = `You are Vailo's area radar scout. Reply ONLY with valid JSON (no markdown).

${guestAiLanguageBlock(primaryLocale)}

Suggest NEW real places inside the admin's search region — NOT duplicates of what we already list.
- Use official Google Maps names only.
- Never suggest permanently closed businesses.
- For [AREAS ONLY] categories: geographic spots only — no restaurants, bars, operators, or shops.
- For [BUSINESS ONLY] categories: named establishments with village when helpful.
- Return up to ${AREA_RADAR_CANDIDATES_PER_CATEGORY} candidates per category, best-first.`;

  const prompt = `Search region center: "${areaCtx.areaName}" (${gpsString}). Region is a custom polygon (~${maxKm}km radius).
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
      model: RADAR_MODEL,
      systemInstruction: { role: 'system', parts: [{ text: systemInstruction }] },
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.55,
        maxOutputTokens: 8192,
        thinkingConfig: { thinkingBudget: 0 },
      },
    });
    const result = await model.generateContent(prompt);
    parsed = parseRadarJson(result.response.text());
  } catch (err) {
    console.error('[Area Radar] Gemini failed', err);
    throw new Error('Gemini scout failed. Check console and try again.');
  }

  if (!parsed) {
    throw new Error('Could not parse Gemini response. Try running again.');
  }

  const candidates = extractCandidates(parsed);
  const runResult: AreaRadarRunResult = {
    created: 0,
    skippedDuplicate: 0,
    skippedOutside: 0,
    skippedFiltered: 0,
    failedVerification: 0,
    candidatesFound: candidates.length,
  };

  onProgress?.({
    phase: 'verify',
    message: `Verifying ${candidates.length} candidates with Google…`,
    processed: 0,
    total: candidates.length,
  });

  let processed = 0;
  for (const candidate of candidates) {
    processed += 1;
    onProgress?.({
      phase: 'verify',
      message: `Verifying ${processed}/${candidates.length}: ${candidate.title}`,
      processed,
      total: candidates.length,
    });

    if (placeAlreadyInCatalog(candidate.title, knownGems, knownDiscovered)) {
      runResult.skippedDuplicate += 1;
      continue;
    }

    if (
      shouldDropAreasCommercialAiPick(
        { title: candidate.title, source: 'ai' },
        candidate.category,
        categoryKnowledgeByPrimary
      )
    ) {
      runResult.skippedFiltered += 1;
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
        anchorLat: centroid.lat,
        anchorLng: centroid.lng,
        maxKm,
        knowledgeMode,
        boundaryRing,
        usageCaller: PLACES_USAGE_CALLER.areaRadar,
        discoverSource: 'admin_radar',
        discoverCategory: candidate.category,
        discoverDescription: candidate.description,
      });

      if (resolved.notFound || (!resolved.photoUrl && !resolved.googlePlaceId)) {
        runResult.failedVerification += 1;
        continue;
      }

      const lat = resolved.latitude;
      const lng = resolved.longitude;
      if (typeof lat === 'number' && typeof lng === 'number') {
        if (!pointInPolygon({ lat, lng }, ring)) {
          runResult.skippedOutside += 1;
          continue;
        }
      }

      runResult.created += 1;
      knownDiscovered.push({
        name: resolved.placeName || candidate.title,
        googlePlaceId: resolved.googlePlaceId || undefined,
      });
    } catch (err) {
      console.warn('[Area Radar] resolve failed', candidate.title, err);
      runResult.failedVerification += 1;
    }
  }

  onProgress?.({
    phase: 'done',
    message: 'Area radar run complete.',
    processed: candidates.length,
    total: candidates.length,
  });

  return runResult;
}

/** Build category → gem names map for the AI prompt. */
export function buildKnownGemNamesByCategory(
  gems: Array<{ name?: string; category?: string; categories?: string[] }>,
  _categoryDocs: Array<{ data: Record<string, unknown> }>,
  categories: string[],
  primaryLocale: string
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const cat of categories) {
    out[cat] = [];
  }
  for (const gem of gems) {
    const name = String(gem.name || '').trim();
    if (!name) continue;
    for (const cat of categories) {
      const primaries = gem.categories?.length
        ? gem.categories
        : gem.category
          ? [gem.category]
          : [];
      const matches =
        primaries.some((p) => p.trim().toLowerCase() === cat.trim().toLowerCase()) ||
        primaries.some(
          (p) => categoryPrimaryName({ name: p }, primaryLocale).toLowerCase() === cat.toLowerCase()
        );
      if (matches && !out[cat].includes(name)) {
        out[cat].push(name);
      }
    }
  }
  return out;
}
