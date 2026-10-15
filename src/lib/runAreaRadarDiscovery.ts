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
  AREA_RADAR_DEFAULT_MAX_RESULTS,
  AREA_RADAR_GRID_SPACING_KM,
  AREA_RADAR_LARGE_AREA_KM2,
  AREA_RADAR_MAX_GRID_PASSES,
  clampAreaRadarMaxResults,
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

type RadarConfidence = 'high' | 'medium' | 'low';

type RadarCandidate = {
  title: string;
  /** Host-style “why we recommend it” for admin review. */
  description?: string;
  category: string;
  confidence: RadarConfidence;
  locality?: string;
};

const CONFIDENCE_RANK: Record<RadarConfidence, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

function parseConfidence(value: unknown): RadarConfidence {
  const raw = String(value || '')
    .trim()
    .toLowerCase();
  if (raw === 'high' || raw === 'medium' || raw === 'low') return raw;
  return 'medium';
}

function matchOpenedCategory(raw: string, categories: string[]): string | null {
  const needle = raw.trim().toLowerCase();
  if (!needle) return null;
  const exact = categories.find((c) => c.trim().toLowerCase() === needle);
  if (exact) return exact;
  const partial = categories.find(
    (c) =>
      c.trim().toLowerCase().includes(needle) || needle.includes(c.trim().toLowerCase())
  );
  return partial || null;
}

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

function extractCandidates(
  parsed: Record<string, unknown>,
  openedCategories: string[]
): RadarCandidate[] {
  const out: RadarCandidate[] = [];
  const categories = parsed.categories;
  if (!Array.isArray(categories)) return out;

  for (const cat of categories) {
    if (!cat || typeof cat !== 'object') continue;
    const rawCategory = String((cat as Record<string, unknown>).categoryName || '').trim();
    const categoryName = matchOpenedCategory(rawCategory, openedCategories);
    const items = (cat as Record<string, unknown>).candidates;
    if (!categoryName || !Array.isArray(items)) continue;
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const row = item as Record<string, unknown>;
      const title = String(row.title || '').trim();
      if (!title) continue;
      const why =
        String(row.whyRecommend || row.description || '').trim() ||
        String(row.why_we_recommend_it || '').trim();
      out.push({
        title,
        description: why,
        category: categoryName,
        confidence: parseConfidence(row.confidence),
        locality: String(row.locality || '').trim() || undefined,
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

function buildCoverageGapBlock(
  categories: string[],
  knownGemNamesByCategory: Record<string, string[]>
): string {
  return categories
    .map((cat) => {
      const count = (knownGemNamesByCategory[cat] || []).length;
      if (count === 0) {
        return `- **${cat}**: 0 curated — prioritize strong finds if real ones exist; return zero if evidence is weak.`;
      }
      if (count < 5) {
        return `- **${cat}**: ${count} curated — still thin; add only host-worthy places that fill a real gap.`;
      }
      return `- **${cat}**: ${count} curated — only add outstanding places that are clearly better or meaningfully different.`;
    })
    .join('\n');
}

function rankCandidates(candidates: RadarCandidate[]): RadarCandidate[] {
  return [...candidates].sort((a, b) => {
    const byConfidence = CONFIDENCE_RANK[a.confidence] - CONFIDENCE_RANK[b.confidence];
    if (byConfidence !== 0) return byConfidence;
    return a.title.localeCompare(b.title);
  });
}

async function scoutCandidatesWithGemini(params: {
  categories: string[];
  categoryKnowledgeByPrimary: Record<string, string>;
  areaCtx: { country: string; areaId: string; areaName: string };
  knownGemNamesByCategory: Record<string, string[]>;
  primaryLocale: string;
  gpsString: string;
  maxKm: number;
  /** Global cap for this scout call across all listed categories. */
  maxResults: number;
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
    maxResults,
    focusHint,
  } = params;

  if (categories.length === 0 || maxResults <= 0) return [];

  const categoryKnowledgeBlock = buildCategoryKnowledgePromptSection(
    categories,
    categoryKnowledgeByPrimary
  );
  const knownBlock = buildKnownBlock(categories, knownGemNamesByCategory);
  const coverageGapBlock = buildCoverageGapBlock(categories, knownGemNamesByCategory);

  const systemInstruction = `You are Vailo's Live Like a Local area radar curator for villa guests.
Reply ONLY with valid JSON (no markdown).

${guestAiLanguageBlock(primaryLocale)}

Your job is NOT to collect as many places as possible. Curate places a knowledgeable local host would confidently recommend.

Hard rules:
- Suggest NEW real places inside the admin's search region only.
- Use official Google Maps names only.
- Never invent businesses, ratings, hours, URLs, or coordinates.
- Never suggest permanently closed places.
- Only use the opened categories listed by the admin — never invent new category names.
- For [AREAS ONLY] categories: geographic spots only — no restaurants, bars, operators, or shops.
- For [BUSINESS ONLY] categories: named establishments (village/locality when helpful).

Global budget:
- Return up to ${maxResults} candidates TOTAL across all categories combined — not an equal split.
- Allocate freely by real supply and coverage gaps: sparse categories may get few or zero; abundant ones may get many.
- If evidence does not support ${maxResults} strong places, return fewer. Never pad with mediocre picks.

Host-grade selection (think like a weighted score, then keep only strong picks):
- Reputation consistency (not raw review count)
- Authenticity / local character
- Value for money
- Relevance to villa guests (families, couples, groups, practical day trips)
- Reliability / recency of what you know
- Uniqueness or memorable experience
- Practical accessibility

Diversity inside the polygon:
- Avoid stacking many near-identical venues in one pocket.
- Prefer geographic spread across towns/zones in the region when quality allows.
- Balance famous anchors with authentic local places when both are strong.

Confidence:
- high = strong evidence you would personally recommend
- medium = solid but less certain
- low = weak evidence — prefer omitting; only include if it fills a clear gap`;

  const prompt = `Phase A — Scout for "${areaCtx.areaName}" (${areaCtx.country}).
Search region center GPS: ${gpsString}. Custom polygon (~${maxKm}km radius from center).
${focusHint ? `${focusHint}\n` : ''}
Opened categories (ONLY these): ${categories.join(', ')}
${categoryKnowledgeBlock}

Coverage gaps (prefer filling thin categories, but never invent weak entries):
${coverageGapBlock}

ALREADY IN VAILO (do NOT repeat these names or the same place under another spelling):
${knownBlock}

Return at most ${maxResults} candidates in total. Uneven category counts are expected and correct.

Return JSON:
{
  "categories": [
    {
      "categoryName": "Exact opened category name",
      "candidates": [
        {
          "title": "Official Google Maps name",
          "whyRecommend": "1-2 sentences: why a local host would recommend this to villa guests.",
          "locality": "Town/village or coastal zone if known",
          "confidence": "high|medium|low"
        }
      ]
    }
  ]
}`;

  const maxOutputTokens = Math.min(65536, Math.max(8192, maxResults * 140));

  const model = getGenerativeModel(ai, {
    model: RADAR_MODEL,
    systemInstruction: { role: 'system', parts: [{ text: systemInstruction }] },
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.45,
      maxOutputTokens,
      thinkingConfig: { thinkingBudget: 0 },
    },
  });
  const result = await model.generateContent(prompt);
  const parsed = parseRadarJson(result.response.text());
  if (!parsed) return [];
  return rankCandidates(extractCandidates(parsed, categories)).slice(0, maxResults);
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
  /** Global cap on AI candidates across all categories. */
  maxResults?: number;
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
  const maxResults = clampAreaRadarMaxResults(
    params.maxResults ?? AREA_RADAR_DEFAULT_MAX_RESULTS
  );

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
  const totalGeminiPasses = 1 + gridPassCount;

  const allCandidates: RadarCandidate[] = [];
  let geminiPass = 0;
  let remaining = maxResults;

  geminiPass += 1;
  onProgress?.({
    phase: 'ai',
    message: `Phase A — Scout ${geminiPass}/${totalGeminiPasses}: curating ${categories.length} opened categories (up to ${remaining})…`,
  });
  try {
    const mainCandidates = await scoutCandidatesWithGemini({
      categories,
      categoryKnowledgeByPrimary,
      areaCtx,
      knownGemNamesByCategory,
      primaryLocale,
      gpsString,
      maxKm,
      maxResults: remaining,
    });
    allCandidates.push(...mainCandidates);
    remaining = Math.max(0, maxResults - dedupeCandidates(allCandidates).length);
  } catch (err) {
    console.error('[Area Radar] Gemini scout failed', err);
    throw new Error('Gemini scout failed. Check console and try again.');
  }

  for (let i = 0; i < gridPassCount && remaining > 0; i += 1) {
    const anchor = anchors[i];
    geminiPass += 1;
    onProgress?.({
      phase: 'ai',
      message: `Phase A — Scout ${geminiPass}/${totalGeminiPasses}: grid sector ${i + 1}/${gridPassCount} (${remaining} slots left)…`,
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
        maxResults: remaining,
        focusHint: `Focus on host-worthy places within ~${AREA_RADAR_GRID_SPACING_KM}km of ${anchorGps} inside the "${areaCtx.areaName}" polygon. Only fill remaining slots — do not repeat earlier suggestions. Prefer geographic diversity.`,
      });
      allCandidates.push(...gridCandidates);
      remaining = Math.max(0, maxResults - dedupeCandidates(allCandidates).length);
    } catch (err) {
      console.warn('[Area Radar] Grid pass failed', anchorGps, err);
    }
  }

  const candidates = rankCandidates(dedupeCandidates(allCandidates)).slice(0, maxResults);
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
    message: `Phase B — Verify ${candidates.length} candidates with Google…`,
    processed: 0,
    total: candidates.length,
  });

  let processed = 0;
  for (const candidate of candidates) {
    processed += 1;
    onProgress?.({
      phase: 'verify',
      message: `Phase B — Verify ${processed}/${candidates.length}: ${candidate.title}`,
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

    const whyText = [candidate.description, candidate.locality ? `Locality: ${candidate.locality}` : '']
      .filter(Boolean)
      .join(' ');

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
        discoverDescription: whyText,
        discoverConfidence: candidate.confidence,
        discoverLocality: candidate.locality,
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
    message: 'Phase C ready — review new places in Discovered Places.',
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
