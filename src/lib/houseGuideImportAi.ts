import { httpsCallable } from 'firebase/functions';
import { guestLocaleDisplayName } from './guestAiLanguage';
import { cloudFunctions } from './firebase';
import { httpsCallableMessage } from './callableError';
import { normalizeLocaleCode } from './propertyContentLocales';
import {
  HOUSE_GUIDE_CATEGORIES,
  HOUSE_GUIDE_TRANSPORTATION_OPTIONS,
  HOUSE_GUIDE_EMERGENCY_OPTIONS,
  HOUSE_GUIDE_USEFUL_MAP_OPTIONS,
  HOUSE_GUIDE_WASTE_OPTIONS,
  type HouseGuideFieldType,
} from './houseGuideCategories';
import {
  getGuideTextValue,
  setGuideTextInFormData,
  type HouseGuideFormData,
} from './houseGuideLocales';

export type ImportSourceFile = {
  name: string;
  mimeType: string;
  text?: string;
  inlineData?: { mimeType: string; data: string };
};

export type HouseGuideImportSourceKind = 'paste' | 'file' | 'url';

export type HouseGuideImportSource = {
  id: string;
  kind: HouseGuideImportSourceKind;
  label: string;
  text?: string;
  url?: string;
  mimeType?: string;
  inlineData?: { mimeType: string; data: string };
  /** Filled after server fetch for URL sources. */
  fetchStatus?: 'ok' | 'failed' | 'skipped' | 'pending';
  fetchNote?: string;
};

export type HouseGuideFieldAssignment = {
  id: string;
  categoryId: string;
  fieldId: string;
  fieldType: HouseGuideFieldType;
  content?: string;
  items?: Record<string, string>[];
  confidence: 'high' | 'medium' | 'low';
  mergeMode: 'append' | 'replace';
  excerpt: string;
  enabled: boolean;
  sourceId: string;
  sourceLabel: string;
  sourceKind: HouseGuideImportSourceKind | 'unknown';
  sourceUrl?: string;
};

export type HouseGuideImportQuestion = {
  id: string;
  content: string;
  reason: string;
  suggestedCategoryId?: string;
  suggestedFieldId?: string;
  resolvedCategoryId: string;
  resolvedFieldId: string;
  enabled: boolean;
  sourceId: string;
  sourceLabel: string;
  sourceKind: HouseGuideImportSourceKind | 'unknown';
  sourceUrl?: string;
};

export type HouseGuideImportSkippedRow = {
  kind: 'assignment' | 'question';
  reason: string;
  raw: Record<string, unknown>;
};

export type HouseGuideImportResult = {
  summary: string;
  assignments: HouseGuideFieldAssignment[];
  questions: HouseGuideImportQuestion[];
  /** Full model JSON text — shown in admin for development review. */
  rawText: string;
  /** Rows the normalizer dropped (bad category/field/empty). */
  skipped: HouseGuideImportSkippedRow[];
  /** Labeled inputs used for this run (including URL fetch status). */
  sources: HouseGuideImportSource[];
};

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function stripDataUrlPrefix(dataUrl: string): { mimeType: string; data: string } | null {
  const match = dataUrl.match(/^data:(.+?);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
}

export async function prepareImportSource(file: File): Promise<ImportSourceFile> {
  const mime = file.type || 'application/octet-stream';
  const lowerName = file.name.toLowerCase();

  if (
    mime.startsWith('text/') ||
    lowerName.endsWith('.txt') ||
    lowerName.endsWith('.md') ||
    lowerName.endsWith('.csv')
  ) {
    return { name: file.name, mimeType: mime, text: await file.text() };
  }

  if (mime.startsWith('image/') || mime === 'application/pdf') {
    const dataUrl = await readFileAsDataUrl(file);
    const inline = stripDataUrlPrefix(dataUrl);
    if (inline) {
      return { name: file.name, mimeType: inline.mimeType, inlineData: inline };
    }
  }

  try {
    const text = await file.text();
    if (text.trim()) return { name: file.name, mimeType: mime, text };
  } catch {
    // fall through
  }

  throw new Error(`Unsupported file type: ${file.name}`);
}

function buildCategoryCatalog(): string {
  return HOUSE_GUIDE_CATEGORIES.map((cat) => {
    const fields = cat.fields
      .map((f) => `    - fieldId: "${f.id}" | label: "${f.label}" | type: ${f.type}`)
      .join('\n');
    return `  categoryId: "${cat.id}" | title: "${cat.title}"\n${fields}`;
  }).join('\n\n');
}

function parseJsonObject(rawText: string): unknown {
  try {
    return JSON.parse(rawText);
  } catch {
    const first = rawText.indexOf('{');
    const last = rawText.lastIndexOf('}');
    if (first === -1 || last === -1) throw new Error('AI did not return a JSON object.');
    return JSON.parse(rawText.substring(first, last + 1));
  }
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function isConfidence(v: string): v is 'high' | 'medium' | 'low' {
  return v === 'high' || v === 'medium' || v === 'low';
}

function isMergeMode(v: string): v is 'append' | 'replace' {
  return v === 'append' || v === 'replace';
}

function resolveFieldType(categoryId: string, fieldId: string): HouseGuideFieldType | null {
  const cat = HOUSE_GUIDE_CATEGORIES.find((c) => c.id === categoryId);
  const field = cat?.fields.find((f) => f.id === fieldId);
  return field?.type ?? null;
}

function normalizeArrayItems(
  fieldType: HouseGuideFieldType,
  raw: unknown
): Record<string, string>[] {
  if (!Array.isArray(raw)) return [];
  const out: Record<string, string>[] = [];

  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;

    if (fieldType === 'array_devices') {
      const item = {
        room: str(r.room),
        device: str(r.device),
        brand: str(r.brand),
        model: str(r.model),
      };
      if (item.device || item.brand || item.model) out.push(item);
    } else if (fieldType === 'array_maps') {
      const item = { title: str(r.title), mapsLink: str(r.mapsLink) };
      if (item.title || item.mapsLink) out.push(item);
    } else if (fieldType === 'array_emergencies') {
      const item = {
        category: str(r.category),
        title: str(r.title),
        phone: str(r.phone),
        mapsLink: str(r.mapsLink),
      };
      if (item.title || item.phone) out.push(item);
    } else if (fieldType === 'array_faqs') {
      const item = { question: str(r.question), answer: str(r.answer) };
      if (item.question || item.answer) out.push(item);
    }
  }

  return out;
}

function resolveSourceMeta(
  row: Record<string, unknown>,
  sourcesById: Map<string, HouseGuideImportSource>
): Pick<
  HouseGuideFieldAssignment,
  'sourceId' | 'sourceLabel' | 'sourceKind' | 'sourceUrl'
> {
  const sourceId = str(row.sourceId);
  const fromMap = sourceId ? sourcesById.get(sourceId) : undefined;
  if (fromMap) {
    return {
      sourceId: fromMap.id,
      sourceLabel: fromMap.label,
      sourceKind: fromMap.kind,
      sourceUrl: fromMap.url,
    };
  }
  const label = str(row.sourceLabel) || str(row.source) || 'Unknown source';
  const kindRaw = str(row.sourceKind).toLowerCase();
  const sourceKind: HouseGuideImportSourceKind | 'unknown' =
    kindRaw === 'paste' || kindRaw === 'file' || kindRaw === 'url' ? kindRaw : 'unknown';
  return {
    sourceId: sourceId || 'unknown',
    sourceLabel: label,
    sourceKind,
    sourceUrl: str(row.sourceUrl) || undefined,
  };
}

function normalizeAssignments(
  parsed: unknown,
  sourcesById: Map<string, HouseGuideImportSource>
): {
  assignments: HouseGuideFieldAssignment[];
  skipped: HouseGuideImportSkippedRow[];
} {
  if (!parsed || typeof parsed !== 'object') return { assignments: [], skipped: [] };
  const raw = (parsed as { assignments?: unknown }).assignments;
  if (!Array.isArray(raw)) return { assignments: [], skipped: [] };

  const out: HouseGuideFieldAssignment[] = [];
  const skipped: HouseGuideImportSkippedRow[] = [];
  let idx = 0;

  for (const row of raw) {
    if (!row || typeof row !== 'object') {
      skipped.push({
        kind: 'assignment',
        reason: 'Row was not an object',
        raw: { value: row as unknown as string },
      });
      continue;
    }
    const r = row as Record<string, unknown>;
    const categoryId = str(r.categoryId);
    const fieldId = str(r.fieldId);
    const fieldType = resolveFieldType(categoryId, fieldId);
    if (!fieldType) {
      skipped.push({
        kind: 'assignment',
        reason: `Unknown category/field: ${categoryId || '(empty)'}/${fieldId || '(empty)'}`,
        raw: r,
      });
      continue;
    }

    const confidenceRaw = str(r.confidence);
    const mergeRaw = str(r.mergeMode);
    const confidence = isConfidence(confidenceRaw) ? confidenceRaw : 'medium';
    const mergeMode = isMergeMode(mergeRaw) ? mergeRaw : 'append';
    const source = resolveSourceMeta(r, sourcesById);

    if (fieldType === 'textarea') {
      const content = str(r.content);
      if (!content) {
        skipped.push({
          kind: 'assignment',
          reason: `Empty textarea content for ${categoryId}/${fieldId}`,
          raw: r,
        });
        continue;
      }
      out.push({
        id: `a-${idx++}`,
        categoryId,
        fieldId,
        fieldType,
        content,
        confidence,
        mergeMode,
        excerpt: content.slice(0, 160),
        enabled: true,
        ...source,
      });
    } else {
      const items = normalizeArrayItems(fieldType, r.items);
      if (items.length === 0) {
        skipped.push({
          kind: 'assignment',
          reason: `No usable items for ${categoryId}/${fieldId} (${fieldType})`,
          raw: r,
        });
        continue;
      }
      out.push({
        id: `a-${idx++}`,
        categoryId,
        fieldId,
        fieldType,
        items,
        confidence,
        mergeMode,
        excerpt: `${items.length} structured ${fieldType.replace('array_', '')} entr${items.length === 1 ? 'y' : 'ies'}`,
        enabled: true,
        ...source,
      });
    }
  }

  return { assignments: out, skipped };
}

function normalizeQuestions(
  parsed: unknown,
  sourcesById: Map<string, HouseGuideImportSource>
): {
  questions: HouseGuideImportQuestion[];
  skipped: HouseGuideImportSkippedRow[];
} {
  if (!parsed || typeof parsed !== 'object') return { questions: [], skipped: [] };
  const raw = (parsed as { questions?: unknown }).questions;
  if (!Array.isArray(raw)) return { questions: [], skipped: [] };

  const out: HouseGuideImportQuestion[] = [];
  const skipped: HouseGuideImportSkippedRow[] = [];
  let idx = 0;

  for (const row of raw) {
    if (!row || typeof row !== 'object') {
      skipped.push({
        kind: 'question',
        reason: 'Row was not an object',
        raw: { value: row as unknown as string },
      });
      continue;
    }
    const r = row as Record<string, unknown>;
    const content = str(r.content);
    if (!content) {
      skipped.push({
        kind: 'question',
        reason: 'Empty question content',
        raw: r,
      });
      continue;
    }

    const suggestedCategoryId = str(r.suggestedCategoryId) || undefined;
    const suggestedFieldId = str(r.suggestedFieldId) || undefined;
    const resolvedCategoryId =
      suggestedCategoryId && resolveFieldType(suggestedCategoryId, suggestedFieldId || '')
        ? suggestedCategoryId
        : '';
    const resolvedFieldId =
      resolvedCategoryId && suggestedFieldId && resolveFieldType(resolvedCategoryId, suggestedFieldId)
        ? suggestedFieldId
        : '';
    const source = resolveSourceMeta(r, sourcesById);

    out.push({
      id: `q-${idx++}`,
      content,
      reason: str(r.reason) || 'Needs manual placement',
      suggestedCategoryId,
      suggestedFieldId,
      resolvedCategoryId,
      resolvedFieldId,
      enabled: true,
      ...source,
    });
  }

  return { questions: out, skipped };
}

function guessUrlLabel(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    if (host.includes('airbnb')) return 'Airbnb listing page';
    if (host.includes('booking.com')) return 'Booking.com listing page';
    if (host.includes('google') || host.includes('maps.app.goo.gl') || host === 'share.google') {
      return 'Google Maps / share page';
    }
    if (host.includes('vrbo') || host.includes('homeaway')) return 'VRBO listing page';
    return host;
  } catch {
    return 'Web page';
  }
}

const URL_IN_TEXT_RE = /https?:\/\/[^\s<>"'`)\]]+/gi;
const LABELED_URL_RE =
  /^(Airbnb|Booking\.com|Booking|Google Maps|Maps|Website|Other|iCal|VRBO|Listing)\s*:\s*(https?:\/\/\S+)/gim;
const MANUAL_RECOVERY_BLOCK_RE =
  /--- Manual copy from:[\s\S]*?--- End manual copy ---/gi;

/** Drop manually pasted recovery blocks so their URLs are not re-fetched. */
function textWithoutManualRecoveryBlocks(text: string): string {
  return String(text || '').replace(MANUAL_RECOVERY_BLOCK_RE, ' ');
}

function extractManualRecoveryUrls(text: string): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const block of String(text || '').matchAll(MANUAL_RECOVERY_BLOCK_RE)) {
    const chunk = String(block[0] || '');
    const urlMatch = chunk.match(/^URL:\s*(\S+)/im);
    const url = String(urlMatch?.[1] || '')
      .trim()
      .replace(/[.,;]+$/, '');
    if (!url || seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
  }
  return urls;
}

function extractUrlsFromText(text: string): { url: string; label: string }[] {
  const found: { url: string; label: string }[] = [];
  const seen = new Set<string>();
  const scanText = textWithoutManualRecoveryBlocks(text);

  for (const match of scanText.matchAll(LABELED_URL_RE)) {
    const label = String(match[1] || '').trim();
    const url = String(match[2] || '')
      .trim()
      .replace(/[.,;]+$/, '');
    if (!url || seen.has(url)) continue;
    seen.add(url);
    found.push({ url, label: `${label} page` });
  }

  for (const match of scanText.matchAll(URL_IN_TEXT_RE)) {
    const url = String(match[0] || '')
      .trim()
      .replace(/[.,;]+$/, '');
    if (!url || seen.has(url)) continue;
    seen.add(url);
    found.push({ url, label: guessUrlLabel(url) });
  }

  return found.slice(0, 8);
}

function buildImportSources(
  pastedText: string,
  files: ImportSourceFile[]
): HouseGuideImportSource[] {
  const sources: HouseGuideImportSource[] = [];
  let n = 1;

  const pasted = pastedText.trim();
  if (pasted) {
    sources.push({
      id: `src-${n++}`,
      kind: 'paste',
      label: 'Pasted notes / wizard seed',
      text: pasted,
    });
  }

  for (const file of files) {
    sources.push({
      id: `src-${n++}`,
      kind: 'file',
      label: `File: ${file.name}`,
      text: file.text,
      mimeType: file.mimeType,
      inlineData: file.inlineData,
    });
  }

  const urls = extractUrlsFromText(pasted);
  for (const row of urls) {
    sources.push({
      id: `src-${n++}`,
      kind: 'url',
      label: row.label,
      url: row.url,
      fetchStatus: 'pending',
    });
  }

  return sources;
}

export async function analyzeHouseGuideImport(opts: {
  pastedText: string;
  files: ImportSourceFile[];
  contentLocale: string;
}): Promise<HouseGuideImportResult> {
  const pasted = opts.pastedText.trim();
  const sources = buildImportSources(pasted, opts.files);

  if (sources.length === 0) {
    throw new Error('Add pasted text or upload at least one file.');
  }

  const targetLocale = normalizeLocaleCode(opts.contentLocale) || 'en';
  const targetLabel = guestLocaleDisplayName(targetLocale);
  const sourceIndex = sources
    .map((s) => `- ${s.id} [${s.kind}] ${s.label}${s.url ? ` → ${s.url}` : ''}`)
    .join('\n');

  const prompt = `You are a vacation-rental house guide organiser. Read the labeled SOURCE MATERIAL and split it into the correct House Guide categories and fields. Put leftover facts that do not match any dedicated section into General Info (categoryId "general", fieldId "generalInfo").

TARGET LANGUAGE (mandatory): ${targetLabel} (${targetLocale})
- Write ALL output text in ${targetLabel}: summary, assignment "content", array item strings, and question "content".
- The host is editing the ${targetLabel} language tab — never place Greek, German, or other source-language prose into fields when the target is ${targetLabel}.
- If the source material is in another language, translate it accurately into ${targetLabel}. Keep numbers, codes, URLs, phone numbers, Wi-Fi credentials, and proper nouns unchanged unless a standard exonym exists.
- Emergency "category" values must stay exactly one of the English catalog options listed below (even when target language is not English).

SOURCE INDEX (cite these exact sourceId values):
${sourceIndex}

CATEGORY CATALOG (use exact categoryId and fieldId values):
${buildCategoryCatalog()}

RULES:
- Only use categoryId / fieldId pairs from the catalog above.
- For textarea fields: put prose instructions in "content".
- For array_devices: return items with room, device, brand, model.
- For array_maps: return items with title and mapsLink (mapsLink may be empty).
- For array_emergencies: category must be one of: ${HOUSE_GUIDE_EMERGENCY_OPTIONS.join(', ')}.
- For array_maps in waste/supplies: prefer titles from ${HOUSE_GUIDE_WASTE_OPTIONS.join(', ')} or ${HOUSE_GUIDE_USEFUL_MAP_OPTIONS.join(', ')} when they fit.
- For array_maps in transportation: prefer titles from ${HOUSE_GUIDE_TRANSPORTATION_OPTIONS.join(', ')} when they fit.
- For array_faqs: return question / answer pairs.
- Prefer the most specific catalog field. Use categoryId "general" / fieldId "generalInfo" only as a catch-all for leftover notes that truly do not belong anywhere else (host preferences, neighborhood quirks, miscellaneous policies). Never put check-in, check-out, Wi-Fi, appliances, house rules, or safety instructions in generalInfo when a dedicated field exists.
- Do not confuse generalInfo with dailyNeedsInfo, transportationInfo, or supplies fieldId "generalItems" (physical leftover household items). If a leftover snippet is a real guest-facing fact but has no dedicated field, assign it to generalInfo instead of leaving it only in questions.
- mergeMode: "append" when adding to typical instructions; "replace" only if the source clearly supersedes prior info.
- confidence: "high" when category+field are obvious; "medium" when reasonable; "low" when ambiguous.
- Put ambiguous snippets in "questions" (not assignments) with suggestedCategoryId / suggestedFieldId when possible.
- Do not invent facts not present in the source.
- Split content across multiple assignments when it clearly belongs in different fields.
- PROVENANCE (mandatory): every assignment and question MUST include "sourceId" from the SOURCE INDEX (the block the fact came from). Also include "sourceLabel" (human label) and for web pages "sourceUrl". If a fact appears in multiple sources, pick the most specific one (prefer a fetched URL page over the paste that only listed the URL).

Return ONLY JSON:
{
  "summary": "1-2 sentences on what you found",
  "assignments": [
    {
      "categoryId": "...",
      "fieldId": "...",
      "content": "for textarea only",
      "items": [],
      "confidence": "high|medium|low",
      "mergeMode": "append|replace",
      "sourceId": "src-1",
      "sourceLabel": "Pasted notes / wizard seed",
      "sourceUrl": ""
    }
  ],
  "questions": [
    {
      "content": "snippet needing host decision",
      "reason": "why uncertain",
      "suggestedCategoryId": "...",
      "suggestedFieldId": "...",
      "sourceId": "src-1",
      "sourceLabel": "Pasted notes / wizard seed",
      "sourceUrl": ""
    }
  ]
}`;

  const parts: { text?: string; inlineData?: { mimeType: string; data: string } }[] = [];
  const textBlocks: string[] = [];

  for (const source of sources) {
    if (source.kind === 'url') continue;
    if (source.inlineData) {
      parts.push({
        inlineData: {
          mimeType: source.inlineData.mimeType,
          data: source.inlineData.data,
        },
      });
      textBlocks.push(
        `SOURCE [${source.id}] kind=${source.kind} label="${source.label}"\nAttached binary/file — extract all readable text and facts from the matching attachment.`
      );
      continue;
    }
    if (source.text?.trim()) {
      textBlocks.push(
        `SOURCE [${source.id}] kind=${source.kind} label="${source.label}"\n"""\n${source.text.trim()}\n"""`
      );
    }
  }

  parts.push({ text: `${prompt}\n\nSOURCE MATERIAL:\n${textBlocks.join('\n\n')}` });

  const fetchUrls = sources
    .filter((s) => s.kind === 'url' && s.url)
    .map((s) => ({ id: s.id, label: s.label, url: s.url! }));
  const skipFetchUrls = extractManualRecoveryUrls(pasted);

  try {
    const analyze = httpsCallable(cloudFunctions, 'analyzeHouseGuideImport', {
      timeout: 180000,
    });
    const result = await analyze({ parts, fetchUrls, skipFetchUrls });
    const payload = result.data as {
      text?: string;
      fetchedSources?: {
        id: string;
        url: string;
        label: string;
        status: 'ok' | 'failed' | 'skipped';
        note?: string;
        textPreview?: string;
      }[];
    };
    const rawText = String(payload?.text || '');
    const parsed = parseJsonObject(rawText);

    const enrichedSources = sources.map((s) => {
      if (s.kind !== 'url') return s;
      const fetched = (payload.fetchedSources || []).find((f) => f.id === s.id);
      if (!fetched) {
        return { ...s, fetchStatus: 'skipped' as const, fetchNote: 'Not fetched' };
      }
      return {
        ...s,
        fetchStatus: fetched.status,
        fetchNote: fetched.note,
        text: fetched.textPreview || s.text,
      };
    });

    const sourcesById = new Map(enrichedSources.map((s) => [s.id, s]));
    const { assignments, skipped: skippedAssignments } = normalizeAssignments(
      parsed,
      sourcesById
    );
    const { questions, skipped: skippedQuestions } = normalizeQuestions(parsed, sourcesById);

    return {
      summary: str((parsed as { summary?: unknown }).summary) || 'Content analysed.',
      assignments,
      questions,
      rawText,
      skipped: [...skippedAssignments, ...skippedQuestions],
      sources: enrichedSources,
    };
  } catch (err) {
    throw new Error(
      httpsCallableMessage(err, 'House Guide AI Import failed. Please try again.')
    );
  }
}

export function applyHouseGuideImport(
  formData: HouseGuideFormData,
  assignments: HouseGuideFieldAssignment[],
  questions: HouseGuideImportQuestion[],
  contentLocale: string,
  primaryLocale: string
): HouseGuideFormData {
  let next = formData;

  const applyRow = (
    categoryId: string,
    fieldId: string,
    fieldType: HouseGuideFieldType,
    content: string | undefined,
    items: Record<string, string>[] | undefined,
    mergeMode: 'append' | 'replace'
  ) => {
    if (!resolveFieldType(categoryId, fieldId)) return;

    if (fieldType === 'textarea' && content) {
      const existing = getGuideTextValue(next, fieldId, contentLocale, primaryLocale);
      const merged =
        mergeMode === 'append' && existing.trim()
          ? `${existing.trim()}\n\n${content.trim()}`
          : content.trim();
      next = setGuideTextInFormData(next, fieldId, contentLocale, merged, primaryLocale);
      return;
    }

    if (!fieldType.startsWith('array_') || !items?.length) return;
    const existing = Array.isArray(next[fieldId]) ? [...(next[fieldId] as unknown[])] : [];
    const mergedItems = mergeMode === 'replace' ? items : [...existing, ...items];
    next = { ...next, [fieldId]: mergedItems };
  };

  for (const a of assignments) {
    if (!a.enabled) continue;
    applyRow(a.categoryId, a.fieldId, a.fieldType, a.content, a.items, a.mergeMode);
  }

  for (const q of questions) {
    if (!q.enabled || !q.resolvedCategoryId || !q.resolvedFieldId) continue;
    const fieldType = resolveFieldType(q.resolvedCategoryId, q.resolvedFieldId);
    if (!fieldType) continue;
    applyRow(
      q.resolvedCategoryId,
      q.resolvedFieldId,
      fieldType,
      fieldType === 'textarea' ? q.content : undefined,
      fieldType === 'textarea' ? undefined : undefined,
      'append'
    );
    if (fieldType === 'textarea') continue;
  }

  return next;
}

export function categoryFieldOptions(): {
  categoryId: string;
  categoryTitle: string;
  fieldId: string;
  fieldLabel: string;
  fieldType: HouseGuideFieldType;
}[] {
  return HOUSE_GUIDE_CATEGORIES.flatMap((cat) =>
    cat.fields.map((f) => ({
      categoryId: cat.id,
      categoryTitle: cat.title,
      fieldId: f.id,
      fieldLabel: f.label,
      fieldType: f.type,
    }))
  );
}
