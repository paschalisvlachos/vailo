import { collection, getDocs, query, where } from 'firebase/firestore';
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
import { effectiveMaxDistanceKm } from './flexiblePicks';
import { formatNeighborAreaLabel } from './areaNeighborGuestContent';

export type GuestExcursionCuratedScope = 'home' | 'neighbor';

export type GuestExcursionListing = {
  providerId: string;
  providerName: string;
  providerLogoUrl?: string;
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

const excursionListingsCache = new Map<string, Promise<GuestExcursionListing[]>>();

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
  if (!propertyCoords) {
    return scope === 'home';
  }
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

async function loadGuestExcursionsUncached(
  params: LoadGuestExcursionsParams
): Promise<GuestExcursionListing[]> {
  const { homeArea, neighborAreas = [], propertyCoords } = params;
  const maxKm = effectiveMaxDistanceKm(params.maxRadiusKm ?? GUEST_EXCURSION_RADIUS_KM);
  const targets = buildAreaTargets(homeArea, neighborAreas, propertyCoords);

  const providersSnap = await getDocs(
    query(collection(db, EXCURSION_PROVIDER_COLLECTION), where('status', '==', 'active'))
  );

  const byKey = new Map<string, GuestExcursionListing>();

  await Promise.all(
    providersSnap.docs.map(async (providerDoc) => {
      const data = providerDoc.data() as Record<string, unknown>;
      const operatingRegions = normalizeOperatingRegions(data);
      const providerName = String(data.businessName || 'Provider');
      const providerLogoUrl = String(data.logoUrl || '').trim() || undefined;

      const matchingTargets = targets.filter((target) =>
        providerOperatesInArea({ operatingRegions }, target.ctx.country, target.ctx.areaId)
      );
      if (matchingTargets.length === 0) return;

      const excursionsSnap = await getDocs(
        collection(db, EXCURSION_PROVIDER_COLLECTION, providerDoc.id, EXCURSION_SUBCOLLECTION)
      );

      for (const excDoc of excursionsSnap.docs) {
        const excursion = excursionFromDoc(excDoc.id, excDoc.data());
        if (excursion.status !== 'published') continue;

        let chosenTarget: AreaTarget | null = null;
        for (const target of matchingTargets) {
          if (shouldIncludeExcursion(excursion, target.scope, propertyCoords, maxKm)) {
            chosenTarget = target;
            break;
          }
        }
        if (!chosenTarget) continue;

        const listing: GuestExcursionListing = {
          providerId: providerDoc.id,
          providerName,
          providerLogoUrl,
          excursion: { ...excursion, providerId: providerDoc.id },
          curatedScope: chosenTarget.scope,
          sourceAreaId:
            chosenTarget.scope === 'neighbor' ? chosenTarget.ctx.areaId : undefined,
          sourceAreaLabel:
            chosenTarget.scope === 'neighbor'
              ? formatNeighborAreaLabel(chosenTarget.areaName)
              : undefined,
        };

        byKey.set(excursionDedupeKey(providerDoc.id, excursion), listing);
      }
    })
  );

  return Array.from(byKey.values()).sort((a, b) => {
    const scopeOrder = (scope?: GuestExcursionCuratedScope) => (scope === 'neighbor' ? 1 : 0);
    const diff = scopeOrder(a.curatedScope) - scopeOrder(b.curatedScope);
    if (diff !== 0) return diff;
    return a.excursion.title.localeCompare(b.excursion.title);
  });
}

export async function loadGuestExcursionsForListing(
  params: LoadGuestExcursionsParams
): Promise<GuestExcursionListing[]> {
  const cacheKey = excursionCacheKey(params);
  let pending = excursionListingsCache.get(cacheKey);
  if (!pending) {
    pending = loadGuestExcursionsUncached(params);
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
