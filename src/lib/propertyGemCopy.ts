import { addDoc, collection, doc, getDoc, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import { gemSameNameAndLocation, gemPrimaryName } from './gemLocationMatch';
import { syncPropertyGemToArea, type PropertyGemDoc } from './propertyGemAreaSync';

export const COPIED_GEMS_STORAGE_KEY = 'vailo_copied_property_gems';

export type CopiedPropertyGems = {
  gems: Record<string, unknown>[];
  sourcePropertyId: string;
  sourceTypeId: string;
  sourcePropertyName?: string;
  sourceListingName?: string;
  copiedAt: string;
};

export type GemPasteResult = {
  pasted: number;
  skipped: number;
  targets: number;
};

const SYNC_FIELDS = new Set([
  'id',
  'createdAt',
  'updatedAt',
  'distanceKm',
  'distanceTime',
  'sourcePropertyId',
  'sourcePropertyTypeId',
  'sourcePropertyGemId',
  'insertedByLabel',
  'alternateTitles',
  'syncedAt',
]);

export function readCopiedGems(): CopiedPropertyGems | null {
  try {
    const raw = sessionStorage.getItem(COPIED_GEMS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CopiedPropertyGems;
    if (!Array.isArray(parsed.gems) || parsed.gems.length === 0) return null;
    if (!parsed.sourcePropertyId || !parsed.sourceTypeId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeCopiedGems(payload: CopiedPropertyGems): void {
  sessionStorage.setItem(COPIED_GEMS_STORAGE_KEY, JSON.stringify(payload));
}

export function clearCopiedGems(): void {
  sessionStorage.removeItem(COPIED_GEMS_STORAGE_KEY);
}

export function stripGemForCopy(gem: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(gem)) {
    if (SYNC_FIELDS.has(key)) continue;
    out[key] = value;
  }
  return out;
}

export function gemExistsInListing(
  gem: Record<string, unknown>,
  existingGems: Record<string, unknown>[]
): boolean {
  return existingGems.some((existing) => gemSameNameAndLocation(gem, existing));
}

async function fetchDrivingRoute(
  startLat: string | number,
  startLon: string | number,
  endLat: string | number,
  endLon: string | number
): Promise<{ distanceKm: string; distanceTime: string } | null> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${startLon},${startLat};${endLon},${endLat}?overview=false`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Routing failed');
    const data = await response.json();
    if (data.routes?.length > 0) {
      const route = data.routes[0];
      return {
        distanceKm: (route.distance / 1000).toFixed(1),
        distanceTime: `${Math.round(route.duration / 60)} min`,
      };
    }
  } catch (error) {
    console.warn('[Vailo] OSRM routing failed during gem paste:', error);
  }
  return null;
}

async function buildGemPayloadForTarget(
  gem: Record<string, unknown>,
  targetType: {
    latitude?: string | number;
    longitude?: string | number;
  }
): Promise<Record<string, unknown>> {
  const payload: Record<string, unknown> = {
    ...stripGemForCopy(gem),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const toCoord = (value: unknown): string | number | null => {
    if (typeof value === 'number' && !isNaN(value)) return value;
    if (typeof value === 'string' && value.trim()) return value;
    return null;
  };

  const endLat = toCoord(gem.latitude);
  const endLng = toCoord(gem.longitude);
  const refLat = toCoord(targetType.latitude);
  const refLng = toCoord(targetType.longitude);

  if (refLat != null && refLng != null && endLat != null && endLng != null) {
    const route = await fetchDrivingRoute(refLat, refLng, endLat, endLng);
    if (route) {
      payload.distanceKm = route.distanceKm;
      payload.distanceTime = route.distanceTime;
    } else {
      payload.distanceKm = '';
      payload.distanceTime = '';
    }
  } else {
    payload.distanceKm = '';
    payload.distanceTime = '';
  }

  return payload;
}

export async function pasteGemsToListing(params: {
  gems: Record<string, unknown>[];
  propertyId: string;
  typeId: string;
  propertyName: string;
  listingLabel?: string;
  targetType: {
    latitude?: string | number;
    longitude?: string | number;
    country?: string;
    city?: string;
  };
}): Promise<{ pasted: number; skipped: number }> {
  const gemsSnap = await getDocs(
    collection(db, 'properties', params.propertyId, 'propertyTypes', params.typeId, 'localGems')
  );
  const existingGems = gemsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  let pasted = 0;
  let skipped = 0;

  for (const gem of params.gems) {
    if (gemExistsInListing(gem, existingGems)) {
      skipped += 1;
      continue;
    }

    const payload = await buildGemPayloadForTarget(gem, params.targetType);
    const gemRef = await addDoc(
      collection(
        db,
        'properties',
        params.propertyId,
        'propertyTypes',
        params.typeId,
        'localGems'
      ),
      payload
    );

    existingGems.push({ id: gemRef.id, ...payload });
    pasted += 1;

    try {
      await syncPropertyGemToArea({
        propertyId: params.propertyId,
        propertyTypeId: params.typeId,
        propertyGemId: gemRef.id,
        propertyGem: payload as PropertyGemDoc,
        propertyName: params.propertyName,
        listingLabel: params.listingLabel,
        propertyType: {
          country: params.targetType.country,
          city: params.targetType.city,
        },
      });
    } catch (syncErr) {
      console.warn('Area gem sync failed after paste:', syncErr);
    }
  }

  return { pasted, skipped };
}

export async function pasteGemsToTargets(params: {
  gems: Record<string, unknown>[];
  targets: Array<{
    propertyId: string;
    typeId: string;
    propertyName: string;
    listingName: string;
    latitude?: string | number;
    longitude?: string | number;
    country?: string;
    city?: string;
  }>;
}): Promise<GemPasteResult> {
  let pasted = 0;
  let skipped = 0;

  for (const target of params.targets) {
    const result = await pasteGemsToListing({
      gems: params.gems,
      propertyId: target.propertyId,
      typeId: target.typeId,
      propertyName: target.propertyName,
      listingLabel: target.listingName,
      targetType: {
        latitude: target.latitude,
        longitude: target.longitude,
        country: target.country,
        city: target.city,
      },
    });
    pasted += result.pasted;
    skipped += result.skipped;
  }

  return { pasted, skipped, targets: params.targets.length };
}

/** Load listing coords when only scope metadata is available. */
export async function loadListingCoords(
  propertyId: string,
  typeId: string
): Promise<{
  latitude?: string | number;
  longitude?: string | number;
  country?: string;
  city?: string;
  listingName?: string;
}> {
  const snap = await getDoc(doc(db, 'properties', propertyId, 'propertyTypes', typeId));
  if (!snap.exists()) return {};
  const data = snap.data();
  return {
    latitude: data.latitude,
    longitude: data.longitude,
    country: data.country,
    city: data.city,
    listingName: typeof data.propertyTypeName === 'string' ? data.propertyTypeName : undefined,
  };
}

export function copiedGemsSummary(clip: CopiedPropertyGems): string {
  const names = clip.gems
    .slice(0, 3)
    .map((g) => gemPrimaryName(g))
    .filter(Boolean);
  const suffix =
    clip.gems.length > 3 ? ` and ${clip.gems.length - 3} more` : '';
  return names.length > 0 ? `${names.join(', ')}${suffix}` : `${clip.gems.length} gems`;
}
