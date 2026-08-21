import {
  collection,
  doc,
  getDoc,
  getDocs,
  collectionGroup,
} from 'firebase/firestore';
import { db } from './firebase';
import { parseNeighborAreaIds } from './areaNeighbors';
import {
  dedupeCuratedPoolsDetailed,
  tagCuratedScope,
  tagNeighborScope,
  type CuratedScope,
  type NeighborContentBundle,
} from './areaNeighborGuestContent';
import { parseGemCoords } from './gemLocationMatch';
import { effectiveMaxDistanceKm } from './flexiblePicks';
import {
  buildGuestCategoryHierarchy,
  type CategoryDocRecord,
} from './categoryHierarchy';
import { gemCategoryPrimaries } from './categoryLocale';
import {
  GUEST_EXCURSION_RADIUS_KM,
  loadGuestExcursionsForListing,
  type GuestExcursionListing,
} from './guestExcursions';

export const NEIGHBOR_PREVIEW_RADIUS_OPTIONS = [5, 29, 55, 100] as const;

export type NeighborPreviewListing = {
  propertyId: string;
  propertyName: string;
  typeId: string;
  typeName: string;
  country: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
};

export type NeighborPreviewItem = {
  id: string;
  name: string;
  scope: CuratedScope;
  sourceAreaLabel?: string;
  distanceKm: number | null;
  withinRadius: boolean;
  categories: string[];
};

export type NeighborPreviewDedupe = {
  name: string;
  scope: CuratedScope;
  sourceAreaLabel?: string;
  duplicateOfName: string;
  duplicateOfScope: CuratedScope;
  duplicateOfSourceAreaLabel?: string;
};

export type NeighborPreviewExcursion = {
  id: string;
  title: string;
  providerName: string;
  scope: 'home' | 'neighbor';
  sourceAreaLabel?: string;
  distanceKm: number | null;
};

export type NeighborPreviewResult = {
  overlapEnabled: boolean;
  overlapDisabledReason: string | null;
  neighborAreas: Array<{ areaId: string; areaName: string }>;
  maxRadiusKm: number;
  effectiveRadiusKm: number;
  gems: {
    home: NeighborPreviewItem[];
    neighbor: NeighborPreviewItem[];
    deduped: NeighborPreviewDedupe[];
  };
  features: {
    home: NeighborPreviewItem[];
    neighbor: NeighborPreviewItem[];
    deduped: NeighborPreviewDedupe[];
  };
  discoveredPlaces: {
    home: NeighborPreviewItem[];
    neighbor: NeighborPreviewItem[];
    deduped: NeighborPreviewDedupe[];
  };
  excursions: {
    home: NeighborPreviewExcursion[];
    neighbor: NeighborPreviewExcursion[];
  };
  categoryMismatches: NeighborPreviewItem[];
  rawNeighborCounts: { gems: number; features: number; discoveredPlaces: number };
};

export type LoadNeighborPreviewParams = {
  country: string;
  areaId: string;
  areaName: string;
  propertyCoords: { lat: number; lng: number } | null;
  maxRadiusKm: number;
  propertyId?: string | null;
  typeId?: string | null;
  primaryLocale?: string;
};

function drivingKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function itemDisplayName(item: Record<string, unknown>): string {
  return String(item.name || item.businessName || item.title || item.id || 'Untitled').trim();
}

function distanceMeta(
  item: Record<string, unknown>,
  anchor: { lat: number; lng: number } | null,
  maxKm: number
): { distanceKm: number | null; withinRadius: boolean; included: boolean } {
  if (!anchor) return { distanceKm: null, withinRadius: true, included: true };
  const coords = parseGemCoords(item);
  if (!coords) return { distanceKm: null, withinRadius: false, included: false };
  const distanceKm = drivingKm(anchor.lat, anchor.lng, coords.lat, coords.lng);
  const hardCap = effectiveMaxDistanceKm(maxKm);
  if (distanceKm > hardCap) {
    return { distanceKm, withinRadius: false, included: false };
  }
  return { distanceKm, withinRadius: distanceKm <= maxKm, included: true };
}

function toPreviewItem(
  item: Record<string, unknown>,
  anchor: { lat: number; lng: number } | null,
  maxKm: number,
  catalogDocs: Record<string, unknown>[],
  primaryLocale: string
): NeighborPreviewItem | null {
  const meta = distanceMeta(item, anchor, maxKm);
  if (!meta.included) return null;

  const scope = (item.curatedScope as CuratedScope) || 'area';
  return {
    id: String(item.id || itemDisplayName(item)),
    name: itemDisplayName(item),
    scope,
    sourceAreaLabel:
      typeof item.sourceAreaLabel === 'string' ? item.sourceAreaLabel : undefined,
    distanceKm: meta.distanceKm,
    withinRadius: meta.withinRadius,
    categories: gemCategoryPrimaries(item, catalogDocs, primaryLocale),
  };
}

function mapPreviewRows(
  rows: Record<string, unknown>[],
  anchor: { lat: number; lng: number } | null,
  maxKm: number,
  catalogDocs: Record<string, unknown>[],
  primaryLocale: string
): { home: NeighborPreviewItem[]; neighbor: NeighborPreviewItem[] } {
  const home: NeighborPreviewItem[] = [];
  const neighbor: NeighborPreviewItem[] = [];
  for (const row of rows) {
    const preview = toPreviewItem(row, anchor, maxKm, catalogDocs, primaryLocale);
    if (!preview) continue;
    if (preview.scope === 'neighbor') neighbor.push(preview);
    else home.push(preview);
  }
  return { home, neighbor };
}

function mapDedupes(
  dropped: Array<{ item: Record<string, unknown>; duplicateOf: Record<string, unknown> }>
): NeighborPreviewDedupe[] {
  return dropped.map(({ item, duplicateOf }) => ({
    name: itemDisplayName(item),
    scope: (item.curatedScope as CuratedScope) || 'area',
    sourceAreaLabel:
      typeof item.sourceAreaLabel === 'string' ? item.sourceAreaLabel : undefined,
    duplicateOfName: itemDisplayName(duplicateOf),
    duplicateOfScope: (duplicateOf.curatedScope as CuratedScope) || 'area',
    duplicateOfSourceAreaLabel:
      typeof duplicateOf.sourceAreaLabel === 'string' ? duplicateOf.sourceAreaLabel : undefined,
  }));
}

function mergeWithDedupeAudit(
  pools: Record<string, unknown>[][]
): { merged: Record<string, unknown>[]; deduped: NeighborPreviewDedupe[] } {
  const { kept, dropped } = dedupeCuratedPoolsDetailed(pools);
  return { merged: kept, deduped: mapDedupes(dropped) };
}

async function loadAreaCollection(
  country: string,
  areaId: string,
  subcollection: string
): Promise<Record<string, unknown>[]> {
  const snap = await getDocs(collection(db, 'countries', country, 'areas', areaId, subcollection));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function loadNeighborBundles(
  country: string,
  neighborIds: string[],
  areaNames: Record<string, string>
): Promise<NeighborContentBundle[]> {
  const bundles: NeighborContentBundle[] = [];
  for (const neighborId of neighborIds) {
    const [gems, features, discoveredPlaces] = await Promise.all([
      loadAreaCollection(country, neighborId, 'localGems'),
      loadAreaCollection(country, neighborId, 'features'),
      loadAreaCollection(country, neighborId, 'discoveredPlaces'),
    ]);
    bundles.push({
      areaId: neighborId,
      areaName: areaNames[neighborId] || neighborId,
      gems,
      features,
      discoveredPlaces,
      trails: [],
    });
  }
  return bundles;
}

function homeCategoryPrimaries(catalogDocs: CategoryDocRecord[], primaryLocale: string): string[] {
  const { parentCategories, subcategoriesByParentPrimary } = buildGuestCategoryHierarchy(
    catalogDocs,
    primaryLocale,
    primaryLocale
  );
  const primaries = new Set<string>();
  for (const parent of parentCategories) primaries.add(parent.primary);
  for (const subs of Object.values(subcategoriesByParentPrimary)) {
    for (const sub of subs) primaries.add(sub.primary);
  }
  return Array.from(primaries);
}

function gemMatchesHomeCategories(
  gem: Record<string, unknown>,
  homeCategoryPrimaries: string[],
  catalogDocs: Record<string, unknown>[],
  primaryLocale: string
): boolean {
  const gemPrimaries = gemCategoryPrimaries(gem, catalogDocs, primaryLocale);
  if (gemPrimaries.length === 0) return false;
  const homeLower = new Set(homeCategoryPrimaries.map((p) => p.toLowerCase()));
  return gemPrimaries.some((p) => homeLower.has(p.toLowerCase()));
}

function mapExcursionRows(
  listings: GuestExcursionListing[],
  anchor: { lat: number; lng: number } | null
): { home: NeighborPreviewExcursion[]; neighbor: NeighborPreviewExcursion[] } {
  const home: NeighborPreviewExcursion[] = [];
  const neighbor: NeighborPreviewExcursion[] = [];

  for (const listing of listings) {
    const lat = listing.excursion.meetingPointLatitude;
    const lng = listing.excursion.meetingPointLongitude;
    const distanceKm =
      anchor && typeof lat === 'number' && typeof lng === 'number'
        ? drivingKm(anchor.lat, anchor.lng, lat, lng)
        : null;

    const row: NeighborPreviewExcursion = {
      id: listing.excursion.id || listing.excursion.slug,
      title: listing.excursion.title,
      providerName: listing.providerName,
      scope: listing.curatedScope === 'neighbor' ? 'neighbor' : 'home',
      sourceAreaLabel: listing.sourceAreaLabel,
      distanceKm,
    };

    if (row.scope === 'neighbor') neighbor.push(row);
    else home.push(row);
  }

  return { home, neighbor };
}

export async function loadListingsForArea(
  country: string,
  areaName: string
): Promise<NeighborPreviewListing[]> {
  const propertiesSnap = await getDocs(collection(db, 'properties'));
  const properties = new Map(
    propertiesSnap.docs.map((d) => [d.id, { id: d.id, ...d.data() } as Record<string, unknown>])
  );

  const typesSnap = await getDocs(collectionGroup(db, 'propertyTypes'));
  const listings: NeighborPreviewListing[] = [];
  const areaLower = areaName.trim().toLowerCase();

  for (const typeDoc of typesSnap.docs) {
    const propertyId = typeDoc.ref.parent.parent?.id;
    if (!propertyId) continue;
    const data = typeDoc.data() as Record<string, unknown>;
    const listingCountry = String(data.country || '').trim();
    const listingCity = String(data.city || '').trim();
    if (listingCountry !== country || listingCity.toLowerCase() !== areaLower) continue;

    const property = properties.get(propertyId);
    const latRaw = data.latitude ?? property?.latitude;
    const lngRaw = data.longitude ?? property?.longitude;
    const lat = typeof latRaw === 'number' ? latRaw : parseFloat(String(latRaw ?? ''));
    const lng = typeof lngRaw === 'number' ? lngRaw : parseFloat(String(lngRaw ?? ''));

    listings.push({
      propertyId,
      propertyName: String(property?.propertyName || propertyId),
      typeId: typeDoc.id,
      typeName: String(data.propertyTypeName || typeDoc.id),
      country: listingCountry,
      city: listingCity,
      latitude: Number.isFinite(lat) ? lat : null,
      longitude: Number.isFinite(lng) ? lng : null,
    });
  }

  return listings.sort((a, b) =>
    `${a.propertyName} ${a.typeName}`.localeCompare(`${b.propertyName} ${b.typeName}`)
  );
}

export async function loadAreaNeighborPreview(
  params: LoadNeighborPreviewParams
): Promise<NeighborPreviewResult> {
  const primaryLocale = params.primaryLocale || 'en';
  const maxRadiusKm = params.maxRadiusKm;
  const effectiveRadiusKm = effectiveMaxDistanceKm(maxRadiusKm);
  const anchor = params.propertyCoords;

  const areaSnap = await getDoc(doc(db, 'countries', params.country, 'areas', params.areaId));
  const neighborIds = parseNeighborAreaIds(areaSnap.exists() ? areaSnap.data() : undefined);

  const neighborAreaNames: Record<string, string> = {};
  await Promise.all(
    neighborIds.map(async (neighborId) => {
      const snap = await getDoc(doc(db, 'countries', params.country, 'areas', neighborId));
      neighborAreaNames[neighborId] = snap.exists()
        ? String(snap.data()?.name || neighborId).trim() || neighborId
        : neighborId;
    })
  );

  const hasCoords = !!anchor;
  const hasNeighbors = neighborIds.length > 0;
  let overlapEnabled = hasCoords && hasNeighbors;
  let overlapDisabledReason: string | null = null;
  if (!hasCoords) {
    overlapDisabledReason = 'Set property latitude/longitude to preview nearby-region content.';
  } else if (!hasNeighbors) {
    overlapDisabledReason = 'No nearby regions configured for this area.';
  }

  const neighborAreas = neighborIds.map((areaId) => ({
    areaId,
    areaName: neighborAreaNames[areaId] || areaId,
  }));

  const [homeGems, homeFeatures, homeDiscoveredPlaces, categorySnap] =
    await Promise.all([
      loadAreaCollection(params.country, params.areaId, 'localGems'),
      loadAreaCollection(params.country, params.areaId, 'features'),
      loadAreaCollection(params.country, params.areaId, 'discoveredPlaces'),
      getDocs(
        collection(db, 'countries', params.country, 'areas', params.areaId, 'localGemsCategories')
      ),
    ]);

  let propertyGems: Record<string, unknown>[] = [];
  let propertyFeatures: Record<string, unknown>[] = [];
  if (params.propertyId && params.typeId) {
    const [propGemsSnap, propFeaturesSnap] = await Promise.all([
      getDocs(
        collection(
          db,
          'properties',
          params.propertyId,
          'propertyTypes',
          params.typeId,
          'localGems'
        )
      ),
      getDocs(
        collection(
          db,
          'properties',
          params.propertyId,
          'propertyTypes',
          params.typeId,
          'features'
        )
      ),
    ]);
    propertyGems = propGemsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    propertyFeatures = propFeaturesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }

  const neighborBundles = overlapEnabled
    ? await loadNeighborBundles(params.country, neighborIds, neighborAreaNames)
    : [];

  const rawNeighborCounts = neighborBundles.reduce(
    (acc, bundle) => {
      acc.gems += bundle.gems.length;
      acc.features += bundle.features.length;
      acc.discoveredPlaces += bundle.discoveredPlaces.length;
      return acc;
    },
    { gems: 0, features: 0, discoveredPlaces: 0 }
  );

  const catalogDocs: CategoryDocRecord[] = categorySnap.docs.map((d) => ({
    id: d.id,
    data: d.data(),
  }));
  const catalogPlain = catalogDocs.map((d) => d.data);
  const homeCategoryPrimaryList = homeCategoryPrimaries(catalogDocs, primaryLocale);

  const gemPools: Record<string, unknown>[][] = [
    tagCuratedScope(propertyGems, 'property'),
    tagCuratedScope(homeGems, 'area'),
  ];
  const featurePools: Record<string, unknown>[][] = [
    tagCuratedScope(propertyFeatures, 'property'),
    tagCuratedScope(homeFeatures, 'area'),
  ];
  const discoveredPools: Record<string, unknown>[][] = [tagCuratedScope(homeDiscoveredPlaces, 'area')];

  if (overlapEnabled) {
    for (const bundle of neighborBundles) {
      gemPools.push(tagNeighborScope(bundle.gems, bundle.areaId, bundle.areaName));
      featurePools.push(tagNeighborScope(bundle.features, bundle.areaId, bundle.areaName));
      discoveredPools.push(
        tagNeighborScope(bundle.discoveredPlaces, bundle.areaId, bundle.areaName)
      );
    }
  }

  const gemsMerged = mergeWithDedupeAudit(gemPools);
  const featuresMerged = mergeWithDedupeAudit(featurePools);
  const discoveredMerged = mergeWithDedupeAudit(discoveredPools);

  const categoryMismatches: NeighborPreviewItem[] = [];
  for (const gem of gemsMerged.merged) {
    if (gem.curatedScope !== 'neighbor') continue;
    if (gemMatchesHomeCategories(gem, homeCategoryPrimaryList, catalogPlain, primaryLocale)) {
      continue;
    }
    const preview = toPreviewItem(gem, anchor, maxRadiusKm, catalogPlain, primaryLocale);
    if (preview) categoryMismatches.push(preview);
  }

  const excursions = overlapEnabled
    ? await loadGuestExcursionsForListing({
        homeArea: {
          country: params.country,
          masterArea: params.areaName,
          areaId: params.areaId,
        },
        neighborAreas,
        propertyCoords: anchor,
        maxRadiusKm: Math.min(maxRadiusKm, GUEST_EXCURSION_RADIUS_KM),
      })
    : await loadGuestExcursionsForListing({
        homeArea: {
          country: params.country,
          masterArea: params.areaName,
          areaId: params.areaId,
        },
        propertyCoords: null,
      });

  return {
    overlapEnabled,
    overlapDisabledReason,
    neighborAreas,
    maxRadiusKm,
    effectiveRadiusKm,
    gems: {
      ...mapPreviewRows(gemsMerged.merged, anchor, maxRadiusKm, catalogPlain, primaryLocale),
      deduped: gemsMerged.deduped,
    },
    features: {
      ...mapPreviewRows(featuresMerged.merged, anchor, maxRadiusKm, catalogPlain, primaryLocale),
      deduped: featuresMerged.deduped,
    },
    discoveredPlaces: {
      ...mapPreviewRows(
        discoveredMerged.merged,
        anchor,
        maxRadiusKm,
        catalogPlain,
        primaryLocale
      ),
      deduped: discoveredMerged.deduped,
    },
    excursions: mapExcursionRows(excursions, anchor),
    categoryMismatches,
    rawNeighborCounts,
  };
}
