/**
 * Fast path for home "Book & Arrange" category chips:
 * - localStorage SWR cache
 * - thin Firestore summary per area
 * - derived from listings as source of truth
 */
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { ARRANGE_AND_BOOK_CATEGORIES } from './arrangeAndBook';
import { offeringMatchesArrangeAndBook } from './excursionCategories';
import {
  EXCURSION_PROVIDER_COLLECTION,
  normalizeOperatingRegions,
} from './excursionProvider';
import { loadGuestExcursionsForListing, type GuestExcursionListing } from './guestExcursions';
import type { ListingAreaContext } from './listingAreaContext';

export type BookArrangeSummary = {
  categoryIds: string[];
  listingCount: number;
  updatedAt: string;
};

const CACHE_PREFIX = 'vailo:bookArrangeCats:v1:';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function bookArrangeSummaryDocRef(country: string, areaId: string) {
  return doc(db, 'countries', country, 'areas', areaId, 'catalog', 'bookArrangeSummary');
}

export function deriveBookArrangeCategoryIds(
  listings: Array<{ excursion: { categories?: string[] } }>
): string[] {
  return ARRANGE_AND_BOOK_CATEGORIES.filter((cat) =>
    listings.some((listing) =>
      offeringMatchesArrangeAndBook(listing.excursion.categories, cat.id)
    )
  ).map((cat) => cat.id);
}

function cacheKey(country: string, areaId: string): string {
  return `${CACHE_PREFIX}${country}::${areaId}`;
}

export function readBookArrangeCategoryCache(
  country: string,
  areaId: string
): BookArrangeSummary | null {
  if (typeof window === 'undefined' || !country || !areaId) return null;
  try {
    const raw = window.localStorage.getItem(cacheKey(country, areaId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BookArrangeSummary & { cachedAt?: number };
    if (!Array.isArray(parsed.categoryIds)) return null;
    const cachedAt = typeof parsed.cachedAt === 'number' ? parsed.cachedAt : 0;
    if (cachedAt && Date.now() - cachedAt > CACHE_TTL_MS) {
      // Stale-while-revalidate: still return; caller refreshes in background.
    }
    return {
      categoryIds: parsed.categoryIds.filter((id) => typeof id === 'string'),
      listingCount: typeof parsed.listingCount === 'number' ? parsed.listingCount : 0,
      updatedAt:
        typeof parsed.updatedAt === 'string'
          ? parsed.updatedAt
          : new Date(cachedAt || Date.now()).toISOString(),
    };
  } catch {
    return null;
  }
}

export function writeBookArrangeCategoryCache(
  country: string,
  areaId: string,
  summary: BookArrangeSummary
): void {
  if (typeof window === 'undefined' || !country || !areaId) return;
  try {
    window.localStorage.setItem(
      cacheKey(country, areaId),
      JSON.stringify({ ...summary, cachedAt: Date.now() })
    );
  } catch {
    // Quota / private mode — ignore.
  }
}

export async function fetchBookArrangeSummary(
  country: string,
  areaId: string
): Promise<BookArrangeSummary | null> {
  if (!country || !areaId) return null;
  try {
    const snap = await getDoc(bookArrangeSummaryDocRef(country, areaId));
    if (!snap.exists()) return null;
    const data = snap.data() as Record<string, unknown>;
    const categoryIds = Array.isArray(data.categoryIds)
      ? data.categoryIds.filter((id): id is string => typeof id === 'string')
      : [];
    return {
      categoryIds,
      listingCount: typeof data.listingCount === 'number' ? data.listingCount : 0,
      updatedAt:
        typeof data.updatedAt === 'string' ? data.updatedAt : new Date().toISOString(),
    };
  } catch (error) {
    console.warn('Book & Arrange summary fetch failed', error);
    return null;
  }
}

export async function persistBookArrangeSummary(
  country: string,
  areaId: string,
  summary: BookArrangeSummary
): Promise<void> {
  if (!country || !areaId) return;
  await setDoc(
    bookArrangeSummaryDocRef(country, areaId),
    {
      categoryIds: summary.categoryIds,
      listingCount: summary.listingCount,
      updatedAt: summary.updatedAt,
    },
    { merge: true }
  );
}

export function summaryFromListings(listings: GuestExcursionListing[]): BookArrangeSummary {
  return {
    categoryIds: deriveBookArrangeCategoryIds(listings),
    listingCount: listings.length,
    updatedAt: new Date().toISOString(),
  };
}

/** Recompute and write summary for one area (home providers only). */
export async function rebuildBookArrangeSummaryForArea(
  country: string,
  areaId: string,
  areaName?: string
): Promise<BookArrangeSummary> {
  const homeArea: ListingAreaContext = {
    country,
    areaId,
    masterArea: areaName || areaId,
  };
  const listings = await loadGuestExcursionsForListing({
    homeArea,
    neighborAreas: [],
    propertyCoords: null,
  });
  const summary = summaryFromListings(listings);
  await persistBookArrangeSummary(country, areaId, summary);
  writeBookArrangeCategoryCache(country, areaId, summary);
  return summary;
}

/** After admin saves an excursion — refresh summaries for every area the provider serves. */
export async function rebuildBookArrangeSummariesForProvider(
  providerId: string
): Promise<void> {
  if (!providerId) return;
  const snap = await getDoc(doc(db, EXCURSION_PROVIDER_COLLECTION, providerId));
  if (!snap.exists()) return;
  const regions = normalizeOperatingRegions(snap.data() as Record<string, unknown>);
  const seen = new Set<string>();
  await Promise.all(
    regions.map(async (region) => {
      const country = String(region.country || '').trim();
      const areaId = String(region.areaId || '').trim();
      if (!country || !areaId) return;
      const key = `${country}::${areaId}`;
      if (seen.has(key)) return;
      seen.add(key);
      try {
        await rebuildBookArrangeSummaryForArea(country, areaId, region.areaName || areaId);
      } catch (error) {
        console.warn('Book & Arrange summary rebuild failed', key, error);
      }
    })
  );
}

/** Best-effort: keep Firestore summary + local cache in sync after home listings load. */
export function syncBookArrangeSummaryFromListings(
  country: string,
  areaId: string,
  listings: GuestExcursionListing[]
): BookArrangeSummary {
  const summary = summaryFromListings(listings);
  writeBookArrangeCategoryCache(country, areaId, summary);
  void persistBookArrangeSummary(country, areaId, summary).catch(() => undefined);
  return summary;
}
