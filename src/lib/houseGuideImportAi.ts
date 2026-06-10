import { getGenerativeModel, type Part } from 'firebase/ai';
import { guestLocaleDisplayName } from './guestAiLanguage';
import { ai } from './firebase';
import { normalizeLocaleCode } from './propertyContentLocales';
import {
  HOUSE_GUIDE_CATEGORIES,
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
};

export type HouseGuideImportResult = {
  summary: string;
  assignments: HouseGuideFieldAssignment[];
  questions: HouseGuideImportQuestion[];
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

function normalizeAssignments(parsed: unknown): HouseGuideFieldAssignment[] {
  if (!parsed || typeof parsed !== 'object') return [];
  const raw = (parsed as { assignments?: unknown }).assignments;
  if (!Array.isArray(raw)) return [];

  const out: HouseGuideFieldAssignment[] = [];
  let idx = 0;

  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const categoryId = str(r.categoryId);
    const fieldId = str(r.fieldId);
    const fieldType = resolveFieldType(categoryId, fieldId);
    if (!fieldType) continue;

    const confidenceRaw = str(r.confidence);
    const mergeRaw = str(r.mergeMode);
    const confidence = isConfidence(confidenceRaw) ? confidenceRaw : 'medium';
    const mergeMode = isMergeMode(mergeRaw) ? mergeRaw : 'append';

    if (fieldType === 'textarea') {
      const content = str(r.content);
      if (!content) continue;
      out.push({
        id: `a-${idx++}`,
        categoryId,
        fieldId,
        fieldType,
        content,
        confidence,
        mergeMode,
        excerpt: content.slice(0, 160),
        enabled: confidence !== 'low',
      });
    } else {
      const items = normalizeArrayItems(fieldType, r.items);
      if (items.length === 0) continue;
      out.push({
        id: `a-${idx++}`,
        categoryId,
        fieldId,
        fieldType,
        items,
        confidence,
        mergeMode,
        excerpt: `${items.length} structured ${fieldType.replace('array_', '')} entr${items.length === 1 ? 'y' : 'ies'}`,
        enabled: confidence !== 'low',
      });
    }
  }

  return out;
}

function normalizeQuestions(parsed: unknown): HouseGuideImportQuestion[] {
  if (!parsed || typeof parsed !== 'object') return [];
  const raw = (parsed as { questions?: unknown }).questions;
  if (!Array.isArray(raw)) return [];

  const out: HouseGuideImportQuestion[] = [];
  let idx = 0;

  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const content = str(r.content);
    if (!content) continue;

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

    out.push({
      id: `q-${idx++}`,
      content,
      reason: str(r.reason) || 'Needs manual placement',
      suggestedCategoryId,
      suggestedFieldId,
      resolvedCategoryId,
      resolvedFieldId,
      enabled: true,
    });
  }

  return out;
}

export async function analyzeHouseGuideImport(opts: {
  pastedText: string;
  files: ImportSourceFile[];
  contentLocale: string;
}): Promise<HouseGuideImportResult> {
  const pasted = opts.pastedText.trim();
  const fileTexts = opts.files.map((f) => f.text?.trim()).filter(Boolean) as string[];

  if (!pasted && fileTexts.length === 0 && !opts.files.some((f) => f.inlineData)) {
    throw new Error('Add pasted text or upload at least one file.');
  }

  const targetLocale = normalizeLocaleCode(opts.contentLocale) || 'en';
  const targetLabel = guestLocaleDisplayName(targetLocale);

  const prompt = `You are a vacation-rental house guide organiser. Read the SOURCE MATERIAL and split it into the correct House Guide categories and fields.

TARGET LANGUAGE (mandatory): ${targetLabel} (${targetLocale})
- Write ALL output text in ${targetLabel}: summary, assignment "content", array item strings, and question "content".
- The host is editing the ${targetLabel} language tab — never place Greek, German, or other source-language prose into fields when the target is ${targetLabel}.
- If the source material is in another language, translate it accurately into ${targetLabel}. Keep numbers, codes, URLs, phone numbers, Wi-Fi credentials, and proper nouns unchanged unless a standard exonym exists.
- Emergency "category" values must stay exactly one of the English catalog options listed below (even when target language is not English).

CATEGORY CATALOG (use exact categoryId and fieldId values):
${buildCategoryCatalog()}

RULES:
- Only use categoryId / fieldId pairs from the catalog above.
- For textarea fields: put prose instructions in "content".
- For array_devices: return items with room, device, brand, model.
- For array_maps: return items with title and mapsLink (mapsLink may be empty).
- For array_emergencies: category must be one of: ${HOUSE_GUIDE_EMERGENCY_OPTIONS.join(', ')}.
- For array_maps in waste/supplies: prefer titles from ${HOUSE_GUIDE_WASTE_OPTIONS.join(', ')} or ${HOUSE_GUIDE_USEFUL_MAP_OPTIONS.join(', ')} when they fit.
- For array_faqs: return question / answer pairs.
- mergeMode: "append" when adding to typical instructions; "replace" only if the source clearly supersedes prior info.
- confidence: "high" when category+field are obvious; "medium" when reasonable; "low" when ambiguous.
- Put ambiguous snippets in "questions" (not assignments) with suggestedCategoryId / suggestedFieldId when possible.
- Do not invent facts not present in the source.
- Split content across multiple assignments when it clearly belongs in different fields.

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
      "mergeMode": "append|replace"
    }
  ],
  "questions": [
    {
      "content": "snippet needing host decision",
      "reason": "why uncertain",
      "suggestedCategoryId": "...",
      "suggestedFieldId": "..."
    }
  ]
}`;

  const parts: Part[] = [];
  for (const file of opts.files) {
    if (file.inlineData) {
      parts.push({
        inlineData: { mimeType: file.inlineData.mimeType, data: file.inlineData.data },
      } as Part);
    }
  }

  const textBlocks: string[] = [];
  if (pasted) textBlocks.push(`PASTED TEXT:\n"""\n${pasted}\n"""`);
  for (const file of opts.files) {
    if (file.text?.trim()) {
      textBlocks.push(`FILE "${file.name}":\n"""\n${file.text.trim()}\n"""`);
    } else if (file.inlineData) {
      textBlocks.push(`FILE "${file.name}" attached (${file.mimeType}) — extract all readable text and facts.`);
    }
  }
  parts.push({ text: `${prompt}\n\nSOURCE MATERIAL:\n${textBlocks.join('\n\n')}` } as Part);

  const model = getGenerativeModel(ai, {
    model: 'gemini-2.5-flash',
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.2,
    },
  });

  const response = await model.generateContent(parts);
  const parsed = parseJsonObject(response.response.text());

  return {
    summary: str((parsed as { summary?: unknown }).summary) || 'Content analysed.',
    assignments: normalizeAssignments(parsed),
    questions: normalizeQuestions(parsed),
  };
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
