import { getGenerativeModel, type Content } from 'firebase/ai';
import { ai } from './firebase';
import { guestAiLanguageBlock } from './guestAiLanguage';
import type { ConciergeRecommendation, ConciergeStructuredReply } from './conciergeRecommendations';

export const CONCIERGE_CHAT_MODEL = 'gemini-3.5-flash';

export type ConciergeChatMessage = {
  id: string;
  role: 'user' | 'model';
  text: string;
  curatedPicks?: {
    categoryName: string;
    items: import('./conciergeRecommendations').ConciergePickItem[];
  };
  textOnlyAppend?: string;
};

export type ConciergeCategoryContext = {
  label: string;
  knowledge?: string;
};

export type ConciergePlaceContext = {
  name: string;
  category: string;
  description?: string;
  scope?: 'property' | 'area';
};

export type ConciergeChatContext = {
  propertyName: string;
  propertyTypeName?: string;
  areaName: string;
  country: string;
  categories: ConciergeCategoryContext[];
  curatedPlaces: ConciergePlaceContext[];
};

function buildCuratedPlacesBlock(places: ConciergePlaceContext[]): string {
  if (!places.length) return 'No Vailo-curated places loaded yet — rely on your regional knowledge with official place names only.';
  const lines = places.slice(0, 60).map((p) => {
    const scope = p.scope === 'area' ? 'area gem' : 'host pick';
    const desc = p.description?.trim() ? ` — ${p.description.trim()}` : '';
    return `- ${p.name} (${p.category}, ${scope})${desc}`;
  });
  return `Vailo curated picks (STRONGLY prefer these exact names when they match the guest's brief — they appear as rich cards with photos and maps):\n${lines.join('\n')}`;
}

function buildCategoriesBlock(categories: ConciergeCategoryContext[]): string {
  if (!categories.length) return '';
  const lines = categories.map((c) => {
    const note = c.knowledge?.trim() ? ` — ${c.knowledge.trim()}` : '';
    return `- ${c.label}${note}`;
  });
  return `\nLocal themes guests can explore:\n${lines.join('\n')}`;
}

export function buildConciergeSystemPrompt(
  locale: string,
  context: ConciergeChatContext
): string {
  const stayLabel = [context.propertyName, context.propertyTypeName].filter(Boolean).join(', ');
  const region = [context.areaName, context.country].filter(Boolean).join(', ');

  return `You are the Vailo Concierge — an elite local insider for guests staying at "${stayLabel}" in ${region}.

Your mission: understand what the guest truly wants, then recommend ONLY exceptional places that locals genuinely choose — never tourist traps, never filler lists.

${guestAiLanguageBlock(locale)}

HOW YOU WORK
1. DISCOVERY FIRST — Before naming any place, ask thoughtful questions ONE AT A TIME. Gather enough context: mood & interests, time of day, how far they'll travel, who's with them, pace, and deal-breakers.
2. DO NOT rush to recommendations. If key details are missing, ask another focused question instead of guessing.
3. WHEN READY — Suggest 2–5 standout places maximum. Quality beats quantity. Use exact official Google Maps names.
4. Vailo curated picks below MUST be used with their exact names when they fit — guests see them as photo cards.
5. Stay on local travel, food, beaches, culture, and day plans. Redirect house-stay questions to the property assistant.
6. Tone: warm, confident, concise — like a brilliant friend who lives here.

${buildCuratedPlacesBlock(context.curatedPlaces)}${buildCategoriesBlock(context.categories)}

OUTPUT FORMAT — always reply with a single valid JSON object (no markdown fences):
{
  "phase": "discovery" | "recommendations",
  "replyText": "Conversational message for the guest.",
  "recommendations": []
}

Rules:
- phase "discovery": ask ONE question in replyText; recommendations MUST be [].
- phase "recommendations": replyText is a brief intro only (1–3 sentences) — do NOT repeat full descriptions of each place in replyText; put each place in recommendations[] instead.
- recommendations[] entries: { "title": "Official place name", "description": "2–3 sentences why locals go", "category": "Beaches" }
- Complete ALL recommendations — never truncate mid-list.`;
}

function tryParseJson(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw.trim());
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function repairTruncatedJson(fragment: string): Record<string, unknown> | null {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  let lastSafe = -1;

  for (let i = 0; i < fragment.length; i++) {
    const ch = fragment[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{' || ch === '[') stack.push(ch === '{' ? '}' : ']');
    else if (ch === '}' || ch === ']') stack.pop();
    if (!inString && (ch === ',' || ch === '}' || ch === ']')) lastSafe = i;
  }

  if (lastSafe === -1) return null;
  let candidate = fragment.substring(0, lastSafe + 1).replace(/,\s*$/, '');
  const reopen: string[] = [];
  inString = false;
  escaped = false;
  for (let i = 0; i < candidate.length; i++) {
    const ch = candidate[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') reopen.push('}');
    else if (ch === '[') reopen.push(']');
    else if (ch === '}' || ch === ']') reopen.pop();
  }
  candidate += reopen.reverse().join('');
  return tryParseJson(candidate);
}

function parseConciergeJson(raw: string): Record<string, unknown> | null {
  if (!raw?.trim()) return null;
  const direct = tryParseJson(raw);
  if (direct) return direct;

  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace === -1) return null;
  if (lastBrace > firstBrace) {
    const sliced = tryParseJson(raw.substring(firstBrace, lastBrace + 1));
    if (sliced) return sliced;
  }
  return repairTruncatedJson(raw.substring(firstBrace));
}

function normalizeRecommendations(raw: unknown): ConciergeRecommendation[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const row = entry as Record<string, unknown>;
      const title = String(row.title || row.name || '').trim();
      const description = String(row.description || '').trim();
      const category = String(row.category || '').trim() || undefined;
      if (!title) return null;
      return { title, description, category };
    })
    .filter(Boolean) as ConciergeRecommendation[];
}

export function parseConciergeStructuredReply(raw: string): ConciergeStructuredReply {
  const parsed = parseConciergeJson(raw);
  if (!parsed) {
    return { phase: 'discovery', replyText: raw.trim(), recommendations: [] };
  }

  const phase = parsed.phase === 'recommendations' ? 'recommendations' : 'discovery';
  const replyText = String(parsed.replyText || parsed.message || parsed.text || '').trim();
  const recommendations = normalizeRecommendations(parsed.recommendations);

  if (!replyText && recommendations.length === 0) {
    return { phase: 'discovery', replyText: raw.trim(), recommendations: [] };
  }

  return {
    phase: recommendations.length > 0 ? 'recommendations' : phase,
    replyText: replyText || raw.trim(),
    recommendations,
  };
}

function modelMessageForHistory(msg: ConciergeChatMessage): string {
  const parts: string[] = [];
  if (msg.text?.trim()) parts.push(msg.text.trim());
  if (msg.curatedPicks?.items.length) {
    parts.push(
      `Vailo picks shown: ${msg.curatedPicks.items.map((i) => i.title).join(', ')}`
    );
  }
  if (msg.textOnlyAppend?.trim()) parts.push(msg.textOnlyAppend.trim());
  return parts.join('\n\n');
}

function toGeminiHistory(messages: ConciergeChatMessage[]): Content[] {
  return messages.map((msg) => ({
    role: msg.role === 'model' ? ('model' as const) : ('user' as const),
    parts: [
      {
        text:
          msg.role === 'model' ? modelMessageForHistory(msg) : msg.text || '',
      },
    ],
  }));
}

export async function sendConciergeChatMessage(params: {
  locale: string;
  context: ConciergeChatContext;
  history: ConciergeChatMessage[];
  userMessage: string;
}): Promise<ConciergeStructuredReply> {
  const { locale, context, history, userMessage } = params;
  const systemInstruction = buildConciergeSystemPrompt(locale, context);

  const model = getGenerativeModel(ai, {
    model: CONCIERGE_CHAT_MODEL,
    systemInstruction: { role: 'system', parts: [{ text: systemInstruction }] },
    generationConfig: {
      temperature: 0.65,
      maxOutputTokens: 8192,
      responseMimeType: 'application/json',
    },
  });

  const chat = model.startChat({ history: toGeminiHistory(history) });
  const result = await chat.sendMessage(userMessage.trim());
  const raw = (result.response.text() || '').trim();
  if (!raw) {
    throw new Error('Empty concierge response');
  }
  return parseConciergeStructuredReply(raw);
}
