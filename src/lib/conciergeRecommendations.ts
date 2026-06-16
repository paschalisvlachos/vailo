import { resolveLocalizedString } from './propertyContentLocales';
import { namesLikelySame, normalizePlaceName } from './placeNameUtils';
import type { UnverifiedAiMention } from './guestDiscoveredPlaces';

export type ConciergeRecommendation = {
  title: string;
  description: string;
  category?: string;
};

export type ConciergeStructuredReply = {
  phase: 'discovery' | 'recommendations';
  replyText: string;
  recommendations: ConciergeRecommendation[];
};

export type ConciergePickItem = {
  title: string;
  description?: string;
  estimatedDistance?: string;
  source?: string;
  photoUrl?: string;
  googleMapsUrl?: string;
  googlePlaceId?: string;
  latitude?: number;
  longitude?: number;
};

type PoolEntry = {
  name: string;
  category: string;
  description?: string;
  photoUrl?: string;
  googleMapsUrl?: string;
  googlePlaceId?: string;
  latitude?: number;
  longitude?: number;
  alternateTitles?: string[];
};

export type ProcessedConciergeRecommendations = {
  replyText: string;
  categoryName: string;
  curatedItems: ConciergePickItem[];
  textOnly: ConciergeRecommendation[];
  unverifiedMentions: UnverifiedAiMention[];
};

function parseCoord(value: unknown): number | undefined {
  if (typeof value === 'number' && !isNaN(value)) return value;
  const n = parseFloat(String(value ?? ''));
  return isNaN(n) ? undefined : n;
}

function rowName(row: Record<string, unknown>): string {
  return String(row.name || row.businessName || '').trim();
}

function isReviewedDiscovered(row: Record<string, unknown>): boolean {
  if (String(row.status || '').toLowerCase() === 'hidden') return false;
  return String(row.reviewStatus || '').toLowerCase() === 'reviewed';
}

export function buildConciergeMatchPool(params: {
  gems: Record<string, unknown>[];
  features: Record<string, unknown>[];
  discoveredPlaces: Record<string, unknown>[];
  locale: string;
  primaryLocale: string;
  reviewedLocales: string[];
}): PoolEntry[] {
  const { gems, features, discoveredPlaces, locale, primaryLocale, reviewedLocales } = params;
  const out: PoolEntry[] = [];

  const push = (row: Record<string, unknown>, categoryFallback: string) => {
    const name =
      resolveLocalizedString(row, 'name', locale, primaryLocale, reviewedLocales) ||
      rowName(row);
    if (!name) return;
    out.push({
      name,
      category:
        resolveLocalizedString(row, 'category', locale, primaryLocale, reviewedLocales) ||
        categoryFallback,
      description: resolveLocalizedString(row, 'description', locale, primaryLocale, reviewedLocales),
      photoUrl: String(row.photoUrl || '').trim() || undefined,
      googleMapsUrl: String(row.googleMapsUrl || row.verifiedGoogleMapsUrl || '').trim() || undefined,
      googlePlaceId: String(row.googlePlaceId || '').trim() || undefined,
      latitude: parseCoord(row.latitude ?? row.lat),
      longitude: parseCoord(row.longitude ?? row.lng),
      alternateTitles: Array.isArray(row.alternateTitles)
        ? row.alternateTitles.map((t) => String(t || '').trim()).filter(Boolean)
        : undefined,
    });
  };

  for (const gem of gems) push(gem, 'Local gem');
  for (const feature of features) {
    const cats = Array.isArray(feature.categories) ? feature.categories.join(', ') : 'Local';
    push(feature, cats);
  }
  for (const place of discoveredPlaces) {
    if (!isReviewedDiscovered(place)) continue;
    push(place, String(place.category || 'Discovered'));
  }

  return out;
}

function titleMatchesPool(title: string, entry: PoolEntry): boolean {
  const normalized = normalizePlaceName(title);
  if (!normalized) return false;
  if (namesLikelySame(normalized, normalizePlaceName(entry.name))) return true;
  for (const alt of entry.alternateTitles || []) {
    if (namesLikelySame(normalized, normalizePlaceName(alt))) return true;
  }
  return false;
}

function poolEntryToPick(entry: PoolEntry): ConciergePickItem {
  return {
    title: entry.name,
    description: entry.description,
    source: 'database',
    photoUrl: entry.photoUrl,
    googleMapsUrl: entry.googleMapsUrl,
    googlePlaceId: entry.googlePlaceId,
    latitude: entry.latitude,
    longitude: entry.longitude,
  };
}

export function processConciergeRecommendations(
  reply: ConciergeStructuredReply,
  pool: PoolEntry[]
): ProcessedConciergeRecommendations {
  if (reply.phase !== 'recommendations' || reply.recommendations.length === 0) {
    return {
      replyText: reply.replyText,
      categoryName: '',
      curatedItems: [],
      textOnly: [],
      unverifiedMentions: [],
    };
  }

  const curatedItems: ConciergePickItem[] = [];
  const textOnly: ConciergeRecommendation[] = [];
  const usedPoolIndexes = new Set<number>();

  for (const rec of reply.recommendations) {
    const title = String(rec.title || '').trim();
    if (!title) continue;

    let matchIdx = -1;
    for (let i = 0; i < pool.length; i++) {
      if (usedPoolIndexes.has(i)) continue;
      if (titleMatchesPool(title, pool[i])) {
        matchIdx = i;
        break;
      }
    }

    if (matchIdx >= 0) {
      usedPoolIndexes.add(matchIdx);
      curatedItems.push(poolEntryToPick(pool[matchIdx]));
    } else {
      textOnly.push({
        title,
        description: String(rec.description || '').trim(),
        category: rec.category,
      });
    }
  }

  const categoryName =
    reply.recommendations.find((r) => r.category?.trim())?.category?.trim() ||
    textOnly[0]?.category?.trim() ||
    'Recommendations';

  const unverifiedMentions: UnverifiedAiMention[] = textOnly.map((item) => ({
    title: item.title,
    description: item.description,
    category: item.category,
    failureReason: 'concierge_chat_unverified',
  }));

  return {
    replyText: reply.replyText,
    categoryName,
    curatedItems,
    textOnly,
    unverifiedMentions,
  };
}

export function formatTextOnlyRecommendations(items: ConciergeRecommendation[]): string {
  if (!items.length) return '';
  return items
    .map((item, i) => {
      const desc = item.description?.trim();
      return desc ? `${i + 1}. ${item.title}\n${desc}` : `${i + 1}. ${item.title}`;
    })
    .join('\n\n');
}
