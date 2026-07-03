import { useEffect } from 'react';
import { useSyncExternalStore } from 'react';
import { collection, getDocs, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import {
  resolvePropertyTypeAreaContext,
  type AreaConfigIssue,
  type ListingAreaContext,
} from './listingAreaContext';
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
  HIKING_TRAILS_CATEGORY_PRIMARY,
  isHikingTrailsCategory,
  type LocalTrailRecord,
} from './localTrailsGuest';
import { mergeCuratedFeatures, mergeCuratedGems } from './mergeCuratedContent';
import { isGuestVerifiedDiscoveredPlace } from './guestDiscoveredPlaces';
import {
  loadGuestExcursionsForArea,
  type GuestExcursionListing,
} from './guestExcursions';
import { useGuestLocale } from '../context/GuestLocaleContext';
import { usePropertyContentLocaleSettings } from '../hooks/usePropertyContentLocaleSettings';

export type GemCategoryOption = CategoryOption;

export type GuestAreaDataSnapshot = {
  listingAreaCtx: ListingAreaContext | null;
  areaConfigIssue: AreaConfigIssue;
  invalidMasterAreaRaw: string;
  categoriesLoading: boolean;
  /** Top-level categories for the Live like a local wizard (max 3 selectable). */
  parentCategories: GemCategoryOption[];
  /** Subcategories grouped by parent primary name. */
  subcategoriesByParentPrimary: Record<string, GemCategoryOption[]>;
  /** @deprecated Use parentCategories — kept for hiking-trails injection. */
  availableCategories: GemCategoryOption[];
  excludedLiveLikeLocalPrimaries: Set<string>;
  categoryKnowledgeByPrimary: Record<string, string>;
  categoryCatalogDocs: Record<string, unknown>[];
  discoveredPlaces: any[];
  areaGems: any[];
  areaFeatures: any[];
  localTrails: LocalTrailRecord[];
  mergedGems: any[];
  mergedFeatures: any[];
  verifiedDiscoveredPlaces: any[];
  guestEligibleTrails: LocalTrailRecord[];
  excursionListings: GuestExcursionListing[];
  excursionsLoading: boolean;
  excursionsAvailable: boolean;
};

const emptySnapshot: GuestAreaDataSnapshot = {
  listingAreaCtx: null,
  areaConfigIssue: null,
  invalidMasterAreaRaw: '',
  categoriesLoading: true,
  parentCategories: [],
  subcategoriesByParentPrimary: {},
  availableCategories: [],
  excludedLiveLikeLocalPrimaries: new Set(),
  categoryKnowledgeByPrimary: {},
  categoryCatalogDocs: [],
  discoveredPlaces: [],
  areaGems: [],
  areaFeatures: [],
  localTrails: [],
  mergedGems: [],
  mergedFeatures: [],
  verifiedDiscoveredPlaces: [],
  guestEligibleTrails: [],
  excursionListings: [],
  excursionsLoading: true,
  excursionsAvailable: false,
};

type Listener = () => void;
const listeners = new Set<Listener>();
let snapshot: GuestAreaDataSnapshot = emptySnapshot;
let prefetchKey: string | null = null;

function emit() {
  listeners.forEach((listener) => listener());
}

function patchSnapshot(partial: Partial<GuestAreaDataSnapshot>) {
  snapshot = { ...snapshot, ...partial };
  emit();
}

export function getGuestAreaDataSnapshot(): GuestAreaDataSnapshot {
  return snapshot;
}

export function subscribeGuestAreaData(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useGuestAreaData(): GuestAreaDataSnapshot {
  return useSyncExternalStore(subscribeGuestAreaData, getGuestAreaDataSnapshot);
}

type PrefetchProps = {
  property: Record<string, unknown> | null | undefined;
  propertyType: { country?: string; city?: string } | null | undefined;
  propertyGems: any[];
  propertyFeatures: any[];
};

/** Starts area listeners + category/excursion prefetch as soon as the portal has type data. */
export function GuestAreaPrefetcher({
  property,
  propertyType,
  propertyGems,
  propertyFeatures,
}: PrefetchProps) {
  const { locale, t } = useGuestLocale();
  const contentSettings = usePropertyContentLocaleSettings(property);
  const areaData = useGuestAreaData();
  const listingAreaCtx = areaData.listingAreaCtx;

  const areaKey = `${propertyType?.country ?? ''}|${propertyType?.city ?? ''}|${propertyGems.length}|${propertyFeatures.length}|${locale}|${contentSettings.primaryLocale}`;

  useEffect(() => {
    if (prefetchKey === areaKey) return;
    prefetchKey = areaKey;
    patchSnapshot({
      ...emptySnapshot,
      excludedLiveLikeLocalPrimaries: new Set(),
      mergedGems: mergeCuratedGems(propertyGems, []),
      mergedFeatures: mergeCuratedFeatures(propertyFeatures, []),
    });
  }, [areaKey, propertyGems, propertyFeatures]);

  useEffect(() => {
    let cancelled = false;

    const loadAreaAndCategories = async () => {
      patchSnapshot({
        categoriesLoading: true,
        areaConfigIssue: null,
        invalidMasterAreaRaw: '',
      });

      const { ctx: areaCtx, issue, cityRaw } = await resolvePropertyTypeAreaContext(
        propertyType ?? undefined
      );
      if (cancelled) return;

      patchSnapshot({
        listingAreaCtx: areaCtx,
        areaConfigIssue: issue,
        invalidMasterAreaRaw: cityRaw,
      });

      if (!areaCtx?.areaId) {
        patchSnapshot({
          parentCategories: [],
          subcategoriesByParentPrimary: {},
          availableCategories: [],
          excludedLiveLikeLocalPrimaries: new Set(),
          categoryKnowledgeByPrimary: {},
          categoryCatalogDocs: [],
          categoriesLoading: false,
        });
        return;
      }

      try {
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
        if (cancelled) return;

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

        patchSnapshot({
          categoryCatalogDocs: catalogDocs,
          excludedLiveLikeLocalPrimaries: excluded,
          categoryKnowledgeByPrimary: knowledge,
          parentCategories,
          subcategoriesByParentPrimary,
          availableCategories: parentCategories,
          categoriesLoading: false,
        });
      } catch (error) {
        console.error('Failed to prefetch local gem categories:', error);
        if (!cancelled) {
          patchSnapshot({
            parentCategories: [],
            subcategoriesByParentPrimary: {},
            availableCategories: [],
            excludedLiveLikeLocalPrimaries: new Set(),
            categoryKnowledgeByPrimary: {},
            categoryCatalogDocs: [],
            categoriesLoading: false,
          });
        }
      }
    };

    void loadAreaAndCategories();
    return () => {
      cancelled = true;
    };
  }, [
    propertyType?.country,
    propertyType?.city,
    locale,
    contentSettings.primaryLocale,
    contentSettings.reviewedLocales,
  ]);

  useEffect(() => {
    if (!listingAreaCtx?.areaId) {
      patchSnapshot({
        discoveredPlaces: [],
        areaGems: [],
        areaFeatures: [],
        mergedGems: mergeCuratedGems(propertyGems, []),
        mergedFeatures: mergeCuratedFeatures(propertyFeatures, []),
        verifiedDiscoveredPlaces: [],
      });
      return;
    }

    const areaBase = [
      'countries',
      listingAreaCtx.country,
      'areas',
      listingAreaCtx.areaId,
    ] as const;

    const applyAreaRows = (partial: {
      discoveredPlaces?: any[];
      areaGems?: any[];
      areaFeatures?: any[];
    }) => {
      const current = getGuestAreaDataSnapshot();
      const nextDiscovered = partial.discoveredPlaces ?? current.discoveredPlaces;
      const nextGems = partial.areaGems ?? current.areaGems;
      const nextFeatures = partial.areaFeatures ?? current.areaFeatures;
      patchSnapshot({
        discoveredPlaces: nextDiscovered,
        areaGems: nextGems,
        areaFeatures: nextFeatures,
        mergedGems: mergeCuratedGems(propertyGems, nextGems),
        mergedFeatures: mergeCuratedFeatures(propertyFeatures, nextFeatures),
        verifiedDiscoveredPlaces: nextDiscovered.filter(isGuestVerifiedDiscoveredPlace),
      });
    };

    const unsubs = [
      onSnapshot(collection(db, ...areaBase, 'discoveredPlaces'), (snap) => {
        const places = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((p: any) => p.status !== 'hidden');
        applyAreaRows({ discoveredPlaces: places });
      }),
      onSnapshot(collection(db, ...areaBase, 'localGems'), (snap) => {
        applyAreaRows({ areaGems: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
      }),
      onSnapshot(collection(db, ...areaBase, 'areaFeatures'), (snap) => {
        applyAreaRows({ areaFeatures: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
      }),
    ];

    return () => unsubs.forEach((u) => u());
  }, [
    listingAreaCtx?.areaId,
    listingAreaCtx?.country,
    propertyGems,
    propertyFeatures,
  ]);

  useEffect(() => {
    if (!listingAreaCtx?.areaId) {
      patchSnapshot({ localTrails: [], guestEligibleTrails: [] });
      return;
    }

    const trailsRef = collection(
      db,
      'countries',
      listingAreaCtx.country,
      'areas',
      listingAreaCtx.areaId,
      'localTrails'
    );
    const unsubscribe = onSnapshot(trailsRef, (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as LocalTrailRecord[];
      patchSnapshot({
        localTrails: rows,
        guestEligibleTrails: filterGuestEligibleTrails(rows),
      });
    });
    return () => unsubscribe();
  }, [listingAreaCtx?.areaId, listingAreaCtx?.country]);

  useEffect(() => {
    let cancelled = false;

    async function loadExcursions() {
      patchSnapshot({ excursionsLoading: true });
      if (!listingAreaCtx) {
        patchSnapshot({
          excursionListings: [],
          excursionsLoading: false,
          excursionsAvailable: false,
        });
        return;
      }

      try {
        const items = await loadGuestExcursionsForArea(listingAreaCtx);
        if (!cancelled) {
          patchSnapshot({
            excursionListings: items,
            excursionsLoading: false,
            excursionsAvailable: items.length > 0,
          });
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          patchSnapshot({
            excursionListings: [],
            excursionsLoading: false,
            excursionsAvailable: false,
          });
        }
      }
    }

    void loadExcursions();
    return () => {
      cancelled = true;
    };
  }, [listingAreaCtx?.areaId, listingAreaCtx?.country]);

  useEffect(() => {
    if (areaData.guestEligibleTrails.length === 0) return;
    const prev = getGuestAreaDataSnapshot().parentCategories;
    const hasHiking = prev.some(
      (c) => isHikingTrailsCategory(c.primary) || isHikingTrailsCategory(c.label)
    );
    if (hasHiking) return;
    const label = t('aiExpertHikingTrailsCategory');
    const hiking = { primary: HIKING_TRAILS_CATEGORY_PRIMARY, label };
    const next = [...prev, hiking].sort((a, b) => a.label.localeCompare(b.label));
    patchSnapshot({
      parentCategories: next,
      availableCategories: next,
    });
  }, [areaData.guestEligibleTrails.length, t]);

  return null;
}
