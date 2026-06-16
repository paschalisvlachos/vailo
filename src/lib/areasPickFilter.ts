import { getCategoryKnowledgeMode } from './liveLikeLocalCategories';
import { logPickEvent } from './aiExpertPlanDebug';

/** Moderate commercial signals — establishments, not geographic spots. */
const AREAS_COMMERCIAL_NAME_HINTS = [
  'studio',
  'studios',
  'hotel',
  'resort',
  'restaurant',
  'taverna',
  'cafe',
  'cafeteria',
  'bar',
  'beachbar',
  'beachclub',
  'grill',
  'bistro',
  'pizzeria',
  'shop',
  'agency',
  'operator',
  'operators',
  'tours',
  'rental',
  'rentals',
  'apartments',
  'rooms',
  'villas',
  'suites',
  'lodge',
  'inn',
  'motel',
  'pub',
  'club',
  'winery',
  'brewery',
  'watersports',
  'watersport',
  'divingcenter',
  'snack',
  'cantina',
  // Activity / tour operators that Google may return for a beach search.
  'safari',
  'jeep',
  'quad',
  'buggy',
  'kayak',
  'scuba',
  'snorkel',
  'cruise',
  'charter',
  'excursion',
  'jetski',
];

const AREAS_BLOCKED_GOOGLE_TYPES = [
  'restaurant',
  'lodging',
  'tour',
  'travel_agency',
  'store',
  'food',
  'cafe',
  'bar',
  'guest_house',
  'bed_and_breakfast',
  'apartment',
  'campground',
  'marina',
  'night_club',
  'coffee_shop',
  'bakery',
  'meal_',
  'gym',
  'spa',
  'beauty_salon',
  'car_rental',
  'real_estate',
  'shopping',
  'pub',
  'wine_bar',
  'boat_rental',
  'gas_station',
  'parking',
];

function normalizeCommercialToken(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9\u0370-\u03ff]/g, '');
}

/** True when a place title/name looks like a commercial establishment (areas mode). */
export function looksLikeCommercialPlaceName(name: string): boolean {
  const norm = normalizeCommercialToken(name);
  if (!norm) return false;
  return AREAS_COMMERCIAL_NAME_HINTS.some((hint) => norm.includes(hint));
}

export function isAreasBlockedGoogleType(category: string | undefined | null): boolean {
  const type = String(category || '').toLowerCase();
  if (!type) return false;
  return AREAS_BLOCKED_GOOGLE_TYPES.some((blocked) => type.includes(blocked));
}

export function shouldDropAreasCommercialAiPick(
  item: Record<string, unknown>,
  categoryName: string,
  knowledgeByPrimary: Record<string, string>
): boolean {
  if (getCategoryKnowledgeMode(knowledgeByPrimary[categoryName] || '') !== 'areas') {
    return false;
  }
  if (item.source === 'database') return false;

  const title = String(item.title || item.name || '').trim();
  if (title && looksLikeCommercialPlaceName(title)) return true;

  const resolvedName = String(item.placeName || '').trim();
  if (resolvedName && looksLikeCommercialPlaceName(resolvedName)) return true;

  const googleType = String(item.googlePlaceCategory || item.category || '').trim();
  const googleCategories = Array.isArray(item.googleCategories)
    ? item.googleCategories.map((c) => String(c || '').trim()).filter(Boolean)
    : [];
  const typeForFilter = googleCategories[0] || googleType;
  if (typeForFilter && isAreasBlockedGoogleType(typeForFilter)) return true;

  return false;
}

/** Drop AI picks that look commercial in [AREAS ONLY] categories. */
export function filterAreasCommercialAiPicksFromPlan(
  plan: Record<string, unknown> | null | undefined,
  knowledgeByPrimary: Record<string, string> = {}
) {
  if (!plan || plan.type !== 'picks' || !Array.isArray(plan.categories)) return plan;

  const categories = (plan.categories as Array<Record<string, unknown>>).map((cat) => {
    const categoryName = String(cat.categoryName || '');
    const items = ((cat.items as Record<string, unknown>[]) || []).filter((item) => {
      if (!shouldDropAreasCommercialAiPick(item, categoryName, knowledgeByPrimary)) return true;
      logPickEvent('FILTER_HIDE — areas commercial pick', {
        category: categoryName,
        title: item.title || item.name,
        source: item.source,
        reason: 'areas-only category — commercial/business blocked',
      });
      return false;
    });
    return { ...cat, items };
  });

  return { ...plan, categories };
}
