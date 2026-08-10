import { useEffect } from 'react';
import { useSyncExternalStore } from 'react';
import { collection, doc, getDoc, getDocs, onSnapshot } from 'firebase/firestore';
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
import { isGuestVerifiedDiscoveredPlace, type GuestDiscoveredPlaceRow } from './guestDiscoveredPlaces';
import {
  loadGuestExcursionsForListing,
  prefetchGuestExcursionCatalog,
  type GuestExcursionListing,
} from './guestExcursions';
import { parseNeighborAreaIds } from './areaNeighbors';
import {
  countMergedNeighborItems,
  countNeighborContent,
  mergeGuestAreaContent,
  type NeighborContentBundle,
} from './areaNeighborGuestContent';
import { useGuestLocale } from '../context/GuestLocaleContext';
import { usePropertyContentLocaleSettings } from '../hooks/usePropertyContentLocaleSettings';

export type GemCategoryOption = CategoryOption;

export type NeighborContentStats = {
  raw: { gems: number; features: number; discoveredPlaces: number; trails: number };
  merged: { gems: number; features: number; discoveredPlaces: number; trails: number };
};

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
  homeDiscoveredPlaces: any[];
  homeLocalTrails: LocalTrailRecord[];
  localTrails: LocalTrailRecord[];
  mergedGems: any[];
  mergedFeatures: any[];
  verifiedDiscoveredPlaces: any[];
  guestEligibleTrails: LocalTrailRecord[];
  excursionListings: GuestExcursionListing[];
  excursionsLoading: boolean;
  excursionsAvailable: boolean;
  neighborAreaIds: string[];
  neighborAreaNames: Record<string, string>;
  neighborBundles: NeighborContentBundle[];
  neighborOverlapEnabled: boolean;
  neighborOverlapDisabledReason: string | null;
  neighborContentStats: NeighborContentStats;
};

const emptyNeighborStats: NeighborContentStats = {
  raw: { gems: 0, features: 0, discoveredPlaces: 0, trails: 0 },
  merged: { gems: 0, features: 0, discoveredPlaces: 0, trails: 0 },
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
  homeDiscoveredPlaces: [],
  homeLocalTrails: [],
  localTrails: [],
  mergedGems: [],
  mergedFeatures: [],
  verifiedDiscoveredPlaces: [],
  guestEligibleTrails: [],
  excursionListings: [],
  excursionsLoading: true,
  excursionsAvailable: false,
  neighborAreaIds: [],
  neighborAreaNames: {},
  neighborBundles: [],
  neighborOverlapEnabled: false,
  neighborOverlapDisabledReason: null,
  neighborContentStats: emptyNeighborStats,
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
  propertyType: { country?: string; city?: string; latitude?: unknown; longitude?: unknown } | null | undefined;
  propertyGems: any[];
  propertyFeatures: any[];
};

function parsePropertyCoords(
  property: Record<string, unknown> | null | undefined,
  propertyType: PrefetchProps['propertyType']
): { lat: number; lng: number } | null {
  const latRaw = propertyType?.latitude ?? property?.latitude;
  const lngRaw = propertyType?.longitude ?? property?.longitude;
  const lat = typeof latRaw === 'number' ? latRaw : parseFloat(String(latRaw ?? ''));
  const lng = typeof lngRaw === 'number' ? lngRaw : parseFloat(String(lngRaw ?? ''));
  if (isNaN(lat) || isNaN(lng)) return null;
  return { lat, lng };
}

function neighborAreaDisplayName(
  areaId: string,
  data: Record<string, unknown> | undefined,
  names: Record<string, string>
): string {
  if (names[areaId]?.trim()) return names[areaId].trim();
  const fromDoc = typeof data?.name === 'string' ? data.name.trim() : '';
  return fromDoc || areaId;
}

function publishMergedContent(
  propertyGems: any[],
  propertyFeatures: any[],
  partial?: Partial<GuestAreaDataSnapshot>
) {
  const current = getGuestAreaDataSnapshot();
  const next = { ...current, ...partial };
  const includeNeighbors = next.neighborOverlapEnabled && next.neighborBundles.length > 0;

  const merged = mergeGuestAreaContent({
    propertyGems,
    propertyFeatures,
    homeGems: next.areaGems,
    homeFeatures: next.areaFeatures,
    homeDiscoveredPlaces: next.homeDiscoveredPlaces,
    homeTrails: next.homeLocalTrails,
    neighborBundles: next.neighborBundles,
    includeNeighbors,
  });

  const rawNeighbor = countNeighborContent(next.neighborBundles);

  patchSnapshot({
    ...partial,
    mergedGems: merged.mergedGems,
    mergedFeatures: merged.mergedFeatures,
    discoveredPlaces: merged.discoveredPlaces,
    localTrails: merged.localTrails as LocalTrailRecord[],
    verifiedDiscoveredPlaces: merged.discoveredPlaces.filter((row) =>
      isGuestVerifiedDiscoveredPlace(row as GuestDiscoveredPlaceRow)
    ),
    guestEligibleTrails: filterGuestEligibleTrails(merged.localTrails as LocalTrailRecord[]),
    neighborContentStats: {
      raw: rawNeighbor,
      merged: {
        gems: countMergedNeighborItems(merged.mergedGems),
        features: countMergedNeighborItems(merged.mergedFeatures),
        discoveredPlaces: countMergedNeighborItems(merged.discoveredPlaces),
        trails: merged.localTrails.filter((trail) => trail.curatedScope === 'neighbor').length,
      },
    },
  });
}

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
  const neighborAreaIds = areaData.neighborAreaIds;
  const neighborAreaNames = areaData.neighborAreaNames;
  const neighborOverlapEnabled = areaData.neighborOverlapEnabled;
  const propertyCoords = parsePropertyCoords(property, propertyType);

  const areaKey = `${propertyType?.country ?? ''}|${propertyType?.city ?? ''}|${locale}|${contentSettings.primaryLocale}|${propertyCoords?.lat ?? 'na'}:${propertyCoords?.lng ?? 'na'}`;

  useEffect(() => {
    prefetchGuestExcursionCatalog();
  }, []);

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
          neighborAreaIds: [],
          neighborAreaNames: {},
          neighborBundles: [],
          neighborOverlapEnabled: false,
          neighborOverlapDisabledReason: null,
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
      publishMergedContent(propertyGems, propertyFeatures, {
        discoveredPlaces: [],
        areaGems: [],
        areaFeatures: [],
        homeDiscoveredPlaces: [],
        homeLocalTrails: [],
        localTrails: [],
        neighborAreaIds: [],
        neighborAreaNames: {},
        neighborBundles: [],
        neighborOverlapEnabled: false,
        neighborOverlapDisabledReason: null,
        neighborContentStats: emptyNeighborStats,
      });
      return;
    }

    const areaRef = doc(db, 'countries', listingAreaCtx.country, 'areas', listingAreaCtx.areaId);
    let homeDiscovered: any[] = [];
    let homeGems: any[] = [];
    let homeFeatures: any[] = [];
    let homeTrails: LocalTrailRecord[] = [];
    let neighborAreaIds: string[] = [];
    let neighborAreaNames: Record<string, string> = {};

    const areaBase = [
      'countries',
      listingAreaCtx.country,
      'areas',
      listingAreaCtx.areaId,
    ] as const;

    const refreshNeighborState = () => {
      const hasNeighbors = neighborAreaIds.length > 0;
      const hasCoords = !!propertyCoords;
      let neighborOverlapEnabled = hasNeighbors && hasCoords;
      let neighborOverlapDisabledReason: string | null = null;

      if (hasNeighbors && !hasCoords) {
        neighborOverlapDisabledReason =
          'Nearby region overlap is configured, but this listing has no map coordinates yet.';
      }

      publishMergedContent(propertyGems, propertyFeatures, {
        areaGems: homeGems,
        areaFeatures: homeFeatures,
        homeDiscoveredPlaces: homeDiscovered,
        homeLocalTrails: homeTrails,
        neighborAreaIds,
        neighborAreaNames,
        neighborOverlapEnabled,
        neighborOverlapDisabledReason,
      });
    };

    const unsubs = [
      onSnapshot(areaRef, (snap) => {
        neighborAreaIds = parseNeighborAreaIds(snap.exists() ? snap.data() : undefined);
        refreshNeighborState();
      }),
      onSnapshot(collection(db, ...areaBase, 'discoveredPlaces'), (snap) => {
        homeDiscovered = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((p: any) => p.status !== 'hidden');
        refreshNeighborState();
      }),
      onSnapshot(collection(db, ...areaBase, 'localGems'), (snap) => {
        homeGems = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        refreshNeighborState();
      }),
      onSnapshot(collection(db, ...areaBase, 'areaFeatures'), (snap) => {
        homeFeatures = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        refreshNeighborState();
      }),
      onSnapshot(collection(db, ...areaBase, 'localTrails'), (snap) => {
        homeTrails = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as LocalTrailRecord[];
        refreshNeighborState();
      }),
    ];

    return () => unsubs.forEach((u) => u());
  }, [
    listingAreaCtx?.areaId,
    listingAreaCtx?.country,
    propertyGems,
    propertyFeatures,
    propertyCoords?.lat,
    propertyCoords?.lng,
  ]);

  useEffect(() => {
    if (!listingAreaCtx?.areaId) return;

    let cancelled = false;
    let neighborBundles: NeighborContentBundle[] = [];
    const neighborRows = new Map<
      string,
      {
        gems: any[];
        features: any[];
        discoveredPlaces: any[];
        trails: LocalTrailRecord[];
      }
    >();

    const publishNeighbors = () => {
      if (cancelled) return;
      const current = getGuestAreaDataSnapshot();
      neighborBundles = current.neighborAreaIds.map((areaId) => {
        const rows = neighborRows.get(areaId) || {
          gems: [],
          features: [],
          discoveredPlaces: [],
          trails: [],
        };
        return {
          areaId,
          areaName: current.neighborAreaNames[areaId] || areaId,
          gems: rows.gems,
          features: rows.features,
          discoveredPlaces: rows.discoveredPlaces,
          trails: rows.trails,
        };
      });

      publishMergedContent(propertyGems, propertyFeatures, {
        neighborBundles,
      });
    };

    const loadNeighborNames = async (ids: string[]) => {
      const names: Record<string, string> = {};
      await Promise.all(
        ids.map(async (areaId) => {
          const snap = await getDoc(
            doc(db, 'countries', listingAreaCtx.country, 'areas', areaId)
          );
          names[areaId] = neighborAreaDisplayName(
            areaId,
            snap.exists() ? snap.data() : undefined,
            names
          );
        })
      );
      if (cancelled) return;
      patchSnapshot({ neighborAreaNames: names });
      publishNeighbors();
    };

    const areaRef = doc(db, 'countries', listingAreaCtx.country, 'areas', listingAreaCtx.areaId);
    const unsubs: Array<() => void> = [];
    let activeNeighborIds: string[] = [];
    let neighborUnsubs: Array<() => void> = [];

    const clearNeighborListeners = () => {
      neighborUnsubs.forEach((u) => u());
      neighborUnsubs = [];
      neighborRows.clear();
    };

    const attachNeighborListeners = (ids: string[]) => {
      clearNeighborListeners();
      if (!propertyCoords || ids.length === 0) {
        publishNeighbors();
        return;
      }

      for (const neighborId of ids) {
        neighborRows.set(neighborId, {
          gems: [],
          features: [],
          discoveredPlaces: [],
          trails: [],
        });

        const base = [
          'countries',
          listingAreaCtx.country,
          'areas',
          neighborId,
        ] as const;

        const publishNeighbor = () => publishNeighbors();

        neighborUnsubs.push(
          onSnapshot(collection(db, ...base, 'discoveredPlaces'), (snap) => {
            const rows = neighborRows.get(neighborId);
            if (!rows) return;
            rows.discoveredPlaces = snap.docs
              .map((d) => ({ id: d.id, ...d.data() }))
              .filter((p: any) => p.status !== 'hidden');
            publishNeighbor();
          }),
          onSnapshot(collection(db, ...base, 'localGems'), (snap) => {
            const rows = neighborRows.get(neighborId);
            if (!rows) return;
            rows.gems = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            publishNeighbor();
          }),
          onSnapshot(collection(db, ...base, 'areaFeatures'), (snap) => {
            const rows = neighborRows.get(neighborId);
            if (!rows) return;
            rows.features = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            publishNeighbor();
          }),
          onSnapshot(collection(db, ...base, 'localTrails'), (snap) => {
            const rows = neighborRows.get(neighborId);
            if (!rows) return;
            rows.trails = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as LocalTrailRecord[];
            publishNeighbor();
          })
        );
      }
    };

    unsubs.push(
      onSnapshot(areaRef, (snap) => {
        const ids = parseNeighborAreaIds(snap.exists() ? snap.data() : undefined);
        if (ids.join('|') === activeNeighborIds.join('|')) return;
        activeNeighborIds = ids;
        void loadNeighborNames(ids);
        attachNeighborListeners(ids);
      })
    );

    return () => {
      cancelled = true;
      clearNeighborListeners();
      unsubs.forEach((u) => u());
    };
  }, [
    listingAreaCtx?.areaId,
    listingAreaCtx?.country,
    propertyGems,
    propertyFeatures,
    propertyCoords?.lat,
    propertyCoords?.lng,
  ]);

  useEffect(() => {
    let cancelled = false;

    async function loadExcursions() {
      if (!listingAreaCtx) {
        patchSnapshot({
          excursionListings: [],
          excursionsLoading: false,
          excursionsAvailable: false,
        });
        return;
      }

      prefetchGuestExcursionCatalog();
      patchSnapshot({ excursionsLoading: true });

      const baseParams = {
        homeArea: listingAreaCtx,
        propertyCoords,
      };

      try {
        const homeItems = await loadGuestExcursionsForListing({
          ...baseParams,
          neighborAreas: [],
        });
        if (cancelled) return;

        const waitingForNeighbors =
          neighborOverlapEnabled && neighborAreaIds.length > 0;
        patchSnapshot({
          excursionListings: homeItems,
          excursionsLoading: waitingForNeighbors,
          excursionsAvailable: homeItems.length > 0,
        });

        if (!waitingForNeighbors) return;

        const neighborAreas = neighborAreaIds.map((areaId) => ({
          areaId,
          areaName: neighborAreaNames[areaId] || areaId,
        }));
        const fullItems = await loadGuestExcursionsForListing({
          ...baseParams,
          neighborAreas,
        });
        if (cancelled) return;

        patchSnapshot({
          excursionListings: fullItems,
          excursionsLoading: false,
          excursionsAvailable: fullItems.length > 0,
        });
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
  }, [
    listingAreaCtx?.areaId,
    listingAreaCtx?.country,
    neighborOverlapEnabled,
    neighborAreaIds.join('|'),
    propertyCoords?.lat,
    propertyCoords?.lng,
  ]);

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
