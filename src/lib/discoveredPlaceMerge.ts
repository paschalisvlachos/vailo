import { mergeAlternateTitleLists } from './alternateTitles';
import type { DiscoveredPlaceCompareInput } from './discoveredPlaceCompare';

export type DiscoveredPlaceMergePlan = {
  winner: DiscoveredPlaceCompareInput;
  loserIds: string[];
  alternateTitles: string[];
  usageCount: number;
};

function effectiveRating(place: DiscoveredPlaceCompareInput): number {
  return typeof place.rating === 'number' && !isNaN(place.rating) && place.rating > 0
    ? place.rating
    : 0;
}

/** Pick the record to keep — highest Google rating wins; ties break on verified Maps, usage, name. */
export function pickDiscoveredPlaceMergeWinner(
  places: DiscoveredPlaceCompareInput[]
): DiscoveredPlaceCompareInput {
  if (places.length === 0) {
    throw new Error('At least one place is required to pick a merge winner.');
  }

  return [...places].sort((a, b) => {
    const ratingDiff = effectiveRating(b) - effectiveRating(a);
    if (ratingDiff !== 0) return ratingDiff;

    const aVerified = Boolean(String(a.verifiedGoogleMapsUrl || '').trim());
    const bVerified = Boolean(String(b.verifiedGoogleMapsUrl || '').trim());
    if (aVerified !== bVerified) return bVerified ? 1 : -1;

    const usageDiff = (b.usageCount || 0) - (a.usageCount || 0);
    if (usageDiff !== 0) return usageDiff;

    return String(a.name || '').localeCompare(String(b.name || ''));
  })[0];
}

function collectTitlesFromPlace(
  place: DiscoveredPlaceCompareInput & { lastMatchedTitle?: string }
): string[] {
  const out: string[] = [];
  if (place.name?.trim()) out.push(place.name.trim());
  if (place.lastMatchedTitle?.trim()) out.push(place.lastMatchedTitle.trim());
  for (const alt of place.alternateTitles || []) {
    if (alt?.trim()) out.push(alt.trim());
  }
  return out;
}

/** Build merge update: winner by rating; loser names → alternate titles. */
export function buildDiscoveredPlaceMergePlan(
  places: DiscoveredPlaceCompareInput[]
): DiscoveredPlaceMergePlan {
  if (places.length < 2) {
    throw new Error('Select at least two places to merge.');
  }

  const winner = pickDiscoveredPlaceMergeWinner(places);
  const losers = places.filter((p) => p.id !== winner.id);
  const loserTitleLists = losers.map((p) => collectTitlesFromPlace(p));

  const alternateTitles = mergeAlternateTitleLists(
    winner.name || '',
    winner.alternateTitles,
    ...loserTitleLists
  );

  const usageCount = places.reduce((sum, p) => sum + Math.max(0, p.usageCount || 0), 0);

  return {
    winner,
    loserIds: losers.map((p) => p.id),
    alternateTitles,
    usageCount: usageCount > 0 ? usageCount : places.length,
  };
}
