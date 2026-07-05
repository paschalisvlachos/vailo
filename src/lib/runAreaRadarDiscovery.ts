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
  gridAnchorsInPolygon,
  approxPolygonAreaKm2,
  type GeoJsonPolygon,
} from './areaRadarGeo';
import {
  AREA_RADAR_CANDIDATES_PER_CATEGORY,
  AREA_RADAR_GRID_CANDIDATES_PER_CATEGORY,
  AREA_RADAR_GRID_SPACING_KM,
  AREA_RADAR_CATEGORY_BATCH_SIZE,
  AREA_RADAR_LARGE_AREA_KM2,
  AREA_RADAR_MAX_GRID_PASSES,
} from './areaRadarPreview';
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
import { normalizePlaceName } from './placeNameUtils';

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
  geminiPasses: number;
};

function chunkArray<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

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

function dedupeCandidates(candidates: RadarCandidate[]): RadarCandidate[] {
  const seen = new Set<string>();
  const out: RadarCandidate[] = [];
  for (const candidate of candidates) {
    const key = normalizePlaceName(candidate.title);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(candidate);
  }
  return out;
}

function buildKnownBlock(
  categories: string[],
  knownGemNamesByCategory: Record<string, string[]>
): string {
  return categories
    .map((cat) => {
      const names = knownGemNamesByCategory[cat] || [];
      if (names.length === 0) return `- **${cat}**: (no curated gems yet)`;
      return `- **${cat}**: ${names.slice(0, 40).join('; ')}`;
    })
    .join('\n');
}

async function scoutCandidatesWithGemini(params: {
  categories: string[];
  categoryKnowledgeByPrimary: Record<string, string>;
  areaCtx: { country: string; areaId: string; areaName: string };
  knownGemNamesByCategory: Record<string, string[]>;
  primaryLocale: string;
  gpsString: string;
  maxKm: number;
  candidatesPerCategory: number;
  focusHint?: string;
}): Promise<RadarCandidate[]> {
  const {
    categories,
    categoryKnowledgeByPrimary,
    areaCtx,
    knownGemNamesByCategory,
    primaryLocale,
    gpsString,
    maxKm,
    candidatesPerCategory,
    focusHint,
  } = params;

  if (categories.length === 0) return [];

  const categoryKnowledgeBlock = buildCategoryKnowledgePromptSection(
    categories,
    categoryKnowledgeByPrimary
  );
  const knownBlock = buildKnownBlock(categories, knownGemNamesByCategory);

  const systemInstruction = `You are Vailo's area radar scout. Reply ONLY with valid JSON (no markdown).

${guestAiLanguageBlock(primaryLocale)}

Suggest NEW real places inside the admin's search region — NOT duplicates of what we already list.
- Use official Google Maps names only.
- Never suggest permanently closed businesses.
- For [AREAS ONLY] categories: geographic spots only — no restaurants, bars, operators, or shops.
- For [BUSINESS ONLY] categories: named establishments with village when helpful.
- Return up to ${candidatesPerCategory} candidates per category, best-first.`;

  const prompt = `Search region center: "${areaCtx.areaName}" (${gpsString}). Region is a custom polygon (~${maxKm}km radius).
${focusHint ? `${focusHint}\n` : ''}Categories: ${categories.join(', ')}
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
  const parsed = parseRadarJson(result.response.text());
  if (!parsed) return [];
  return extractCandidates(parsed);
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
      geminiPasses: 0,
    };
  }

  const boundaryRing = ring.map(({ lat, lng }) => ({ lat, lng }));
  const maxKm = Math.max(5, Math.ceil(maxRadiusKmFromCenter(ring, centroid)));
  const gpsString = `${centroid.lat.toFixed(5)}, ${centroid.lng.toFixed(5)}`;
  const areaKm2 = approxPolygonAreaKm2(ring);
  const anchors = gridAnchorsInPolygon(ring, AREA_RADAR_GRID_SPACING_KM);
  const gridPassCount =
    areaKm2 >= AREA_RADAR_LARGE_AREA_KM2
      ? Math.min(anchors.length, AREA_RADAR_MAX_GRID_PASSES)
      : 0;
  const categoryBatches = chunkArray(categories, AREA_RADAR_CATEGORY_BATCH_SIZE);
  const totalGeminiPasses = categoryBatches.length + gridPassCount;

  const allCandidates: RadarCandidate[] = [];
  let geminiPass = 0;

  for (const batch of categoryBatches) {
    geminiPass += 1;
    onProgress?.({
      phase: 'ai',
      message: `Gemini pass ${geminiPass}/${totalGeminiPasses}: scouting ${batch.join(', ')}…`,
    });
    try {
      const batchCandidates = await scoutCandidatesWithGemini({
        categories: batch,
        categoryKnowledgeByPrimary,
        areaCtx,
        knownGemNamesByCategory,
        primaryLocale,
        gpsString,
        maxKm,
        candidatesPerCategory: AREA_RADAR_CANDIDATES_PER_CATEGORY,
      });
      allCandidates.push(...batchCandidates);
    } catch (err) {
      console.error('[Area Radar] Gemini batch failed', batch, err);
      throw new Error('Gemini scout failed. Check console and try again.');
    }
  }

  for (let i = 0; i < gridPassCount; i += 1) {
    const anchor = anchors[i];
    geminiPass += 1;
    onProgress?.({
      phase: 'ai',
      message: `Gemini pass ${geminiPass}/${totalGeminiPasses}: grid sector ${i + 1}/${gridPassCount}…`,
    });
    const anchorGps = `${anchor.lat.toFixed(5)}, ${anchor.lng.toFixed(5)}`;
    try {
      const gridCandidates = await scoutCandidatesWithGemini({
        categories,
        categoryKnowledgeByPrimary,
        areaCtx,
        knownGemNamesByCategory,
        primaryLocale,
        gpsString: anchorGps,
        maxKm: Math.max(3, AREA_RADAR_GRID_SPACING_KM * 2),
        candidatesPerCategory: AREA_RADAR_GRID_CANDIDATES_PER_CATEGORY,
        focusHint: `Focus on well-known places within ~${AREA_RADAR_GRID_SPACING_KM}km of ${anchorGps} that lie inside the "${areaCtx.areaName}" polygon.`,
      });
      allCandidates.push(...gridCandidates);
    } catch (err) {
      console.warn('[Area Radar] Grid pass failed', anchorGps, err);
    }
  }

  const candidates = dedupeCandidates(allCandidates);
  const runResult: AreaRadarRunResult = {
    created: 0,
    skippedDuplicate: 0,
    skippedOutside: 0,
    skippedFiltered: 0,
    failedVerification: 0,
    candidatesFound: candidates.length,
    geminiPasses: totalGeminiPasses,
  };

  if (candidates.length === 0) {
    throw new Error('Gemini returned no candidates. Try running again or narrow your categories.');
  }

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
