import {
  collection,
  collectionGroup,
  getDocs,
  query,
  where,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db } from './firebase';
import type { Excursion } from './excursion';
import { excursionFromDoc } from './excursion';
import type { ListingAreaContext } from './listingAreaContext';
import {
  EXCURSION_PROVIDER_COLLECTION,
  EXCURSION_SUBCOLLECTION,
  normalizeOperatingRegions,
  providerOperatesInArea,
} from './excursionProvider';
import type { ExcursionProviderFleetEntry } from './excursionProviderDetails';
import { guestProviderDetailsFromDoc } from './excursionProviderDetails';
import { effectiveMaxDistanceKm } from './flexiblePicks';
import { formatNeighborAreaLabel } from './areaNeighborGuestContent';

export type GuestExcursionCuratedScope = 'home' | 'neighbor';

export type GuestExcursionListing = {
  providerId: string;
  providerName: string;
  providerLogoUrl?: string;
  providerAbout?: string;
  providerUsefulInfo?: string;
  providerFleet?: ExcursionProviderFleetEntry[];
  excursion: Excursion;
  curatedScope?: GuestExcursionCuratedScope;
  sourceAreaId?: string;
  sourceAreaLabel?: string;
};

/** Same cap as Live like a local max tier (100 km). */
export const GUEST_EXCURSION_RADIUS_KM = 100;

export type LoadGuestExcursionsParams = {
  homeArea: ListingAreaContext;
  neighborAreas?: Array<{ areaId: string; areaName: string }>;
  propertyCoords: { lat: number; lng: number } | null;
  maxRadiusKm?: number;
};

type ProviderMeta = {
  operatingRegions: ReturnType<typeof normalizeOperatingRegions>;
  providerName: string;
  providerLogoUrl?: string;
  providerAbout?: string;
  providerUsefulInfo?: string;
  providerFleet?: ExcursionProviderFleetEntry[];
};

const excursionListingsCache = new Map<string, Promise<GuestExcursionListing[]>>();
const activeProvidersByCountry = new Map<string, Promise<Map<string, ProviderMeta>>>();
let publishedExcursionsPromise: Promise<QueryDocumentSnapshot[]> | null = null;

type AreaTarget = {
  ctx: ListingAreaContext;
  scope: GuestExcursionCuratedScope;
  areaName: string;
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

function excursionMeetingCoords(excursion: Excursion): { lat: number; lng: number } | null {
  const lat = excursion.meetingPointLatitude;
  const lng = excursion.meetingPointLongitude;
  if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) {
    return null;
  }
  return { lat, lng };
}

function excursionWithinRadius(
  excursion: Excursion,
  propertyCoords: { lat: number; lng: number },
  maxKm: number
): boolean {
  const meeting = excursionMeetingCoords(excursion);
  if (!meeting) return false;
  return drivingKm(propertyCoords.lat, propertyCoords.lng, meeting.lat, meeting.lng) <= maxKm;
}

function shouldIncludeExcursion(
  excursion: Excursion,
  scope: GuestExcursionCuratedScope,
  propertyCoords: { lat: number; lng: number } | null,
  maxKm: number
): boolean {
  // Home listings come from providers assigned to the property's area — no distance gate.
  if (scope === 'home') return true;

  if (!propertyCoords) return false;

  const meeting = excursionMeetingCoords(excursion);
  if (!meeting) return false;

  return excursionWithinRadius(excursion, propertyCoords, maxKm);
}

function excursionDedupeKey(providerId: string, excursion: Excursion): string {
  return `${providerId}::${excursion.id ?? excursion.slug}`;
}

function excursionCacheKey(params: LoadGuestExcursionsParams): string {
  const neighborKey = (params.neighborAreas ?? [])
    .map((n) => n.areaId)
    .sort()
    .join('|');
  const coordsKey = params.propertyCoords
    ? `${params.propertyCoords.lat.toFixed(4)}:${params.propertyCoords.lng.toFixed(4)}`
    : 'no-coords';
  const radius = params.maxRadiusKm ?? GUEST_EXCURSION_RADIUS_KM;
  return `${params.homeArea.country}::${params.homeArea.areaId}::${neighborKey}::${coordsKey}::${radius}`;
}

function buildAreaTargets(
  homeArea: ListingAreaContext,
  neighborAreas: Array<{ areaId: string; areaName: string }>,
  propertyCoords: { lat: number; lng: number } | null
): AreaTarget[] {
  const targets: AreaTarget[] = [
    { ctx: homeArea, scope: 'home', areaName: homeArea.areaId },
  ];

  if (propertyCoords && neighborAreas.length > 0) {
    for (const neighbor of neighborAreas) {
      targets.push({
        ctx: { country: homeArea.country, masterArea: neighbor.areaName, areaId: neighbor.areaId },
        scope: 'neighbor',
        areaName: neighbor.areaName,
      });
    }
  }

  return targets;
}

function providerIdFromExcursionDoc(excDoc: QueryDocumentSnapshot): string | null {
  const providerRef = excDoc.ref.parent.parent;
  return providerRef?.id ?? null;
}

async function loadActiveProviderMeta(countryFilter?: string): Promise<Map<string, ProviderMeta>> {
  const cacheKey = countryFilter?.trim() || '__all__';
  let pending = activeProvidersByCountry.get(cacheKey);
  if (!pending) {
    pending = (async () => {
      const parseSnap = (snap: Awaited<ReturnType<typeof getDocs>>) => {
        const byId = new Map<string, ProviderMeta>();
        for (const providerDoc of snap.docs) {
          const data = providerDoc.data() as Record<string, unknown>;
          const details = guestProviderDetailsFromDoc(data);
          byId.set(providerDoc.id, {
            operatingRegions: normalizeOperatingRegions(data),
            providerName: String(data.businessName || 'Provider'),
            providerLogoUrl: String(data.logoUrl || '').trim() || undefined,
            providerAbout: details.about,
            providerUsefulInfo: details.usefulInfo,
            providerFleet: details.fleet,
          });
        }
        return byId;
      };

      const country = countryFilter?.trim();
      if (country) {
        try {
          const snap = await getDocs(
            query(
              collection(db, EXCURSION_PROVIDER_COLLECTION),
              where('status', '==', 'active'),
              where('countries', 'array-contains', country)
            )
          );
          return parseSnap(snap);
        } catch (error) {
          console.warn(
            'Guest excursions: country-filtered provider query failed, falling back to all active.',
            error
          );
        }
      }

      const snap = await getDocs(
        query(collection(db, EXCURSION_PROVIDER_COLLECTION), where('status', '==', 'active'))
      );
      return parseSnap(snap);
    })().catch((error) => {
      activeProvidersByCountry.delete(cacheKey);
      throw error;
    });
    activeProvidersByCountry.set(cacheKey, pending);
  }
  return pending;
}

async function loadPublishedExcursionDocs(): Promise<QueryDocumentSnapshot[]> {
  if (!publishedExcursionsPromise) {
    publishedExcursionsPromise = getDocs(
      query(collectionGroup(db, EXCURSION_SUBCOLLECTION), where('status', '==', 'published'))
    )
      .then((snap) => snap.docs)
      .catch((error) => {
        publishedExcursionsPromise = null;
        throw error;
      });
  }
  return publishedExcursionsPromise;
}

async function loadPublishedExcursionDocsForProviders(
  providerIds: string[]
): Promise<QueryDocumentSnapshot[]> {
  if (providerIds.length === 0) return [];

  const snaps = await Promise.all(
    providerIds.map((providerId) =>
      getDocs(
        query(
          collection(db, EXCURSION_PROVIDER_COLLECTION, providerId, EXCURSION_SUBCOLLECTION),
          where('status', '==', 'published')
        )
      )
    )
  );

  return snaps.flatMap((snap) => snap.docs);
}

function buildMatchingProviderTargets(
  providers: Map<string, ProviderMeta>,
  targets: AreaTarget[]
): Map<string, AreaTarget[]> {
  const matching = new Map<string, AreaTarget[]>();

  for (const [providerId, meta] of providers) {
    const providerTargets = targets.filter((target) =>
      providerOperatesInArea({ operatingRegions: meta.operatingRegions }, target.ctx.country, target.ctx.areaId)
    );
    if (providerTargets.length > 0) {
      matching.set(providerId, providerTargets);
    }
  }

  return matching;
}

function listingsFromDocs(
  excursionDocs: QueryDocumentSnapshot[],
  matchingProviders: Map<string, AreaTarget[]>,
  providers: Map<string, ProviderMeta>,
  propertyCoords: { lat: number; lng: number } | null,
  maxKm: number
): GuestExcursionListing[] {
  const byKey = new Map<string, GuestExcursionListing>();

  for (const excDoc of excursionDocs) {
    const providerId = providerIdFromExcursionDoc(excDoc);
    if (!providerId) continue;

    const matchingTargets = matchingProviders.get(providerId);
    if (!matchingTargets?.length) continue;

    const provider = providers.get(providerId);
    if (!provider) continue;

    const excursion = excursionFromDoc(excDoc.id, excDoc.data());

    let chosenTarget: AreaTarget | null = null;
    for (const target of matchingTargets) {
      if (shouldIncludeExcursion(excursion, target.scope, propertyCoords, maxKm)) {
        chosenTarget = target;
        break;
      }
    }
    if (!chosenTarget) continue;

    const listing: GuestExcursionListing = {
      providerId,
      providerName: provider.providerName,
      providerLogoUrl: provider.providerLogoUrl,
      providerAbout: provider.providerAbout,
      providerUsefulInfo: provider.providerUsefulInfo,
      providerFleet: provider.providerFleet,
      excursion: { ...excursion, providerId },
      curatedScope: chosenTarget.scope,
      sourceAreaId: chosenTarget.scope === 'neighbor' ? chosenTarget.ctx.areaId : undefined,
      sourceAreaLabel:
        chosenTarget.scope === 'neighbor'
          ? formatNeighborAreaLabel(chosenTarget.areaName)
          : undefined,
    };

    byKey.set(excursionDedupeKey(providerId, excursion), listing);
  }

  return Array.from(byKey.values()).sort((a, b) => {
    const scopeOrder = (scope?: GuestExcursionCuratedScope) => (scope === 'neighbor' ? 1 : 0);
    const diff = scopeOrder(a.curatedScope) - scopeOrder(b.curatedScope);
    if (diff !== 0) return diff;
    return a.excursion.title.localeCompare(b.excursion.title);
  });
}

async function loadGuestExcursionsUncached(
  params: LoadGuestExcursionsParams
): Promise<GuestExcursionListing[]> {
  const { homeArea, neighborAreas = [], propertyCoords } = params;
  const maxKm = effectiveMaxDistanceKm(params.maxRadiusKm ?? GUEST_EXCURSION_RADIUS_KM);
  const targets = buildAreaTargets(homeArea, neighborAreas, propertyCoords);

  const providers = await loadActiveProviderMeta(homeArea.country);

  const matchingProviders = buildMatchingProviderTargets(providers, targets);
  if (matchingProviders.size === 0) return [];

  // Prefer per-provider queries for matching providers only (much smaller than
  // a global published collectionGroup scan).
  let excursionDocs: QueryDocumentSnapshot[];
  try {
    excursionDocs = await loadPublishedExcursionDocsForProviders([...matchingProviders.keys()]);
  } catch (error) {
    console.warn(
      'Guest excursions: per-provider queries failed, falling back to collection group.',
      error
    );
    excursionDocs = await loadPublishedExcursionDocs();
  }

  return listingsFromDocs(
    excursionDocs,
    matchingProviders,
    providers,
    propertyCoords,
    maxKm
  );
}

export async function loadGuestExcursionsForListing(
  params: LoadGuestExcursionsParams
): Promise<GuestExcursionListing[]> {
  const cacheKey = excursionCacheKey(params);
  let pending = excursionListingsCache.get(cacheKey);
  if (!pending) {
    pending = loadGuestExcursionsUncached(params).catch((error) => {
      excursionListingsCache.delete(cacheKey);
      throw error;
    });
    excursionListingsCache.set(cacheKey, pending);
  }
  return pending;
}

/** Home area only — no neighbor overlap or distance filter. */
export async function loadGuestExcursionsForArea(
  ctx: ListingAreaContext
): Promise<GuestExcursionListing[]> {
  return loadGuestExcursionsForListing({
    homeArea: ctx,
    propertyCoords: null,
  });
}

/** Warm shared Firestore caches during portal boot. Safe to call without awaiting. */
export function prefetchGuestExcursionCatalog(country?: string): void {
  void loadActiveProviderMeta(country).catch(() => undefined);
}
