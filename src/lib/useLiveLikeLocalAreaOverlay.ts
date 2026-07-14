import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import type { GuestAreaDataSnapshot } from './guestAreaDataStore';
import {
  collectCategoryKnowledgeByPrimary,
  collectExcludedLiveLikeLocalPrimaries,
} from './liveLikeLocalCategories';
import {
  buildGuestCategoryHierarchy,
  type CategoryOption,
} from './categoryHierarchy';
import {
  filterGuestEligibleTrails,
  type LocalTrailRecord,
} from './localTrailsGuest';
import { mergeCuratedFeatures, mergeCuratedGems } from './mergeCuratedContent';
import { isGuestVerifiedDiscoveredPlace } from './guestDiscoveredPlaces';
import type { ListingAreaContext } from './listingAreaContext';
import type { PropertyContentLocaleSettings } from './propertyContentLocales';

export type LiveLikeLocalAreaOverlay = {
  contentAreaCtx: ListingAreaContext | null;
  isSearchAreaActive: boolean;
  categoriesLoading: boolean;
  parentCategories: CategoryOption[];
  subcategoriesByParentPrimary: Record<string, CategoryOption[]>;
  availableCategories: CategoryOption[];
  excludedLiveLikeLocalPrimaries: Set<string>;
  categoryKnowledgeByPrimary: Record<string, string>;
  categoryCatalogDocs: Record<string, unknown>[];
  discoveredPlaces: any[];
  mergedGems: any[];
  mergedFeatures: any[];
  verifiedDiscoveredPlaces: any[];
  guestEligibleTrails: LocalTrailRecord[];
};

type ContentSettings = Pick<
  PropertyContentLocaleSettings,
  'primaryLocale' | 'reviewedLocales'
>;

type LoadParams = {
  areaCtx: ListingAreaContext;
  propertyGems: any[];
  propertyFeatures: any[];
  locale: string;
  contentSettings: ContentSettings;
};

async function loadAreaCategories(params: LoadParams) {
  const { areaCtx, locale, contentSettings } = params;
  const gemsCatSnap = await getDocs(
    collection(
      db,
      'countries',
      areaCtx.country,
      'areas',
      areaCtx.areaId,
      'localGemsCategories'
    )
  );

  const categoryDocs = gemsCatSnap.docs.map((d) => ({
    id: d.id,
    data: d.data() as Record<string, unknown>,
  }));
  const catalogDocs = categoryDocs.map((d) => d.data);
  const excluded = collectExcludedLiveLikeLocalPrimaries(
    categoryDocs,
    contentSettings.primaryLocale
  );
  const knowledge = collectCategoryKnowledgeByPrimary(
    categoryDocs,
    contentSettings.primaryLocale
  );
  const { parentCategories, subcategoriesByParentPrimary } = buildGuestCategoryHierarchy(
    categoryDocs,
    locale,
    contentSettings.primaryLocale,
    contentSettings.reviewedLocales
  );

  return {
    categoryCatalogDocs: catalogDocs,
    excludedLiveLikeLocalPrimaries: excluded,
    categoryKnowledgeByPrimary: knowledge,
    parentCategories,
    subcategoriesByParentPrimary,
    availableCategories: parentCategories,
  };
}

async function loadAreaRows(params: LoadParams) {
  const { areaCtx, propertyGems, propertyFeatures } = params;
  const areaBase = ['countries', areaCtx.country, 'areas', areaCtx.areaId] as const;

  const [discoveredSnap, gemsSnap, featuresSnap, trailsSnap] = await Promise.all([
    getDocs(collection(db, ...areaBase, 'discoveredPlaces')),
    getDocs(collection(db, ...areaBase, 'localGems')),
    getDocs(collection(db, ...areaBase, 'areaFeatures')),
    getDocs(collection(db, ...areaBase, 'localTrails')),
  ]);

  const discoveredPlaces = discoveredSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((p: any) => p.status !== 'hidden');
  const areaGems = gemsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const areaFeatures = featuresSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const localTrails = trailsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as LocalTrailRecord[];

  return {
    discoveredPlaces,
    mergedGems: mergeCuratedGems(propertyGems, areaGems),
    mergedFeatures: mergeCuratedFeatures(propertyFeatures, areaFeatures),
    verifiedDiscoveredPlaces: discoveredPlaces.filter(isGuestVerifiedDiscoveredPlace),
    guestEligibleTrails: filterGuestEligibleTrails(localTrails),
  };
}

/** One-shot fetch for chat turns before React state catches up. */
export async function loadSearchAreaContentOnce(
  params: LoadParams
): Promise<LiveLikeLocalAreaOverlay> {
  const [categories, rows] = await Promise.all([
    loadAreaCategories(params),
    loadAreaRows(params),
  ]);

  return {
    contentAreaCtx: params.areaCtx,
    isSearchAreaActive: true,
    categoriesLoading: false,
    ...categories,
    ...rows,
  };
}

const emptyOverlay: LiveLikeLocalAreaOverlay = {
  contentAreaCtx: null,
  isSearchAreaActive: false,
  categoriesLoading: false,
  parentCategories: [],
  subcategoriesByParentPrimary: {},
  availableCategories: [],
  excludedLiveLikeLocalPrimaries: new Set(),
  categoryKnowledgeByPrimary: {},
  categoryCatalogDocs: [],
  discoveredPlaces: [],
  mergedGems: [],
  mergedFeatures: [],
  verifiedDiscoveredPlaces: [],
  guestEligibleTrails: [],
};

export function useLiveLikeLocalAreaOverlay(params: {
  listingSnapshot: GuestAreaDataSnapshot;
  searchAreaCtx: ListingAreaContext | null;
  propertyGems: any[];
  propertyFeatures: any[];
  locale: string;
  contentSettings: ContentSettings;
}): LiveLikeLocalAreaOverlay {
  const {
    listingSnapshot,
    searchAreaCtx,
    propertyGems,
    propertyFeatures,
    locale,
    contentSettings,
  } = params;

  const searchAreaKey =
    searchAreaCtx && searchAreaCtx.areaId !== listingSnapshot.listingAreaCtx?.areaId
      ? `${searchAreaCtx.country}|${searchAreaCtx.areaId}`
      : null;

  const [overlay, setOverlay] = useState<LiveLikeLocalAreaOverlay>(emptyOverlay);

  useEffect(() => {
    if (!searchAreaKey || !searchAreaCtx) {
      setOverlay(emptyOverlay);
      return;
    }

    let cancelled = false;
    setOverlay({
      ...emptyOverlay,
      contentAreaCtx: searchAreaCtx,
      isSearchAreaActive: true,
      categoriesLoading: true,
      mergedGems: mergeCuratedGems(propertyGems, []),
      mergedFeatures: mergeCuratedFeatures(propertyFeatures, []),
    });

    const loadParams: LoadParams = {
      areaCtx: searchAreaCtx,
      propertyGems,
      propertyFeatures,
      locale,
      contentSettings,
    };

    void (async () => {
      try {
        const [categories, rows] = await Promise.all([
          loadAreaCategories(loadParams),
          loadAreaRows(loadParams),
        ]);
        if (cancelled) return;
        setOverlay({
          contentAreaCtx: searchAreaCtx,
          isSearchAreaActive: true,
          categoriesLoading: false,
          ...categories,
          ...rows,
        });
      } catch (error) {
        console.error('Failed to load search area content:', error);
        if (!cancelled) {
          setOverlay({
            ...emptyOverlay,
            contentAreaCtx: searchAreaCtx,
            isSearchAreaActive: true,
            categoriesLoading: false,
            mergedGems: mergeCuratedGems(propertyGems, []),
            mergedFeatures: mergeCuratedFeatures(propertyFeatures, []),
          });
        }
      }
    })();

    const areaBase = [
      'countries',
      searchAreaCtx.country,
      'areas',
      searchAreaCtx.areaId,
    ] as const;

    let discoveredPlaces: any[] = [];
    let areaGems: any[] = [];
    let areaFeatures: any[] = [];
    let localTrails: LocalTrailRecord[] = [];

    const publishRows = () => {
      if (cancelled) return;
      setOverlay((current) => ({
        ...current,
        discoveredPlaces,
        mergedGems: mergeCuratedGems(propertyGems, areaGems),
        mergedFeatures: mergeCuratedFeatures(propertyFeatures, areaFeatures),
        verifiedDiscoveredPlaces: discoveredPlaces.filter(isGuestVerifiedDiscoveredPlace),
        guestEligibleTrails: filterGuestEligibleTrails(localTrails),
      }));
    };

    const unsubs = [
      onSnapshot(collection(db, ...areaBase, 'discoveredPlaces'), (snap) => {
        discoveredPlaces = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((p: any) => p.status !== 'hidden');
        publishRows();
      }),
      onSnapshot(collection(db, ...areaBase, 'localGems'), (snap) => {
        areaGems = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        publishRows();
      }),
      onSnapshot(collection(db, ...areaBase, 'areaFeatures'), (snap) => {
        areaFeatures = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        publishRows();
      }),
      onSnapshot(collection(db, ...areaBase, 'localTrails'), (snap) => {
        localTrails = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as LocalTrailRecord[];
        publishRows();
      }),
    ];

    return () => {
      cancelled = true;
      unsubs.forEach((unsub) => unsub());
    };
  }, [
    searchAreaKey,
    searchAreaCtx,
    propertyGems,
    propertyFeatures,
    locale,
    contentSettings.primaryLocale,
    contentSettings.reviewedLocales,
  ]);

  return useMemo(() => {
    if (!searchAreaKey) {
      return {
        contentAreaCtx: listingSnapshot.listingAreaCtx,
        isSearchAreaActive: false,
        categoriesLoading: listingSnapshot.categoriesLoading,
        parentCategories: listingSnapshot.parentCategories,
        subcategoriesByParentPrimary: listingSnapshot.subcategoriesByParentPrimary,
        availableCategories: listingSnapshot.availableCategories,
        excludedLiveLikeLocalPrimaries: listingSnapshot.excludedLiveLikeLocalPrimaries,
        categoryKnowledgeByPrimary: listingSnapshot.categoryKnowledgeByPrimary,
        categoryCatalogDocs: listingSnapshot.categoryCatalogDocs,
        discoveredPlaces: listingSnapshot.discoveredPlaces,
        mergedGems: listingSnapshot.mergedGems,
        mergedFeatures: listingSnapshot.mergedFeatures,
        verifiedDiscoveredPlaces: listingSnapshot.verifiedDiscoveredPlaces,
        guestEligibleTrails: listingSnapshot.guestEligibleTrails,
      };
    }
    return overlay;
  }, [listingSnapshot, overlay, searchAreaKey]);
}
