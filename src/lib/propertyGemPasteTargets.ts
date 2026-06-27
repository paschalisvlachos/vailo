import { collection, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import {
  isPlatformAdmin,
  type AdminScope,
  type OwnerProfile,
} from './adminAccess';
import { loadListingCoords } from './propertyGemCopy';

export type GemPasteTarget = {
  propertyId: string;
  propertyName: string;
  typeId: string;
  listingName: string;
  latitude?: string | number;
  longitude?: string | number;
  country?: string;
  city?: string;
};

function targetKey(propertyId: string, typeId: string): string {
  return `${propertyId}:${typeId}`;
}

export async function loadGemPasteTargets(
  profile: OwnerProfile | null,
  scopes: AdminScope[],
  exclude?: { propertyId: string; typeId: string }
): Promise<GemPasteTarget[]> {
  if (!profile) return [];

  const targets: GemPasteTarget[] = [];
  const seen = new Set<string>();

  const addTarget = (target: GemPasteTarget) => {
    const key = targetKey(target.propertyId, target.typeId);
    if (seen.has(key)) return;
    if (
      exclude &&
      exclude.propertyId === target.propertyId &&
      exclude.typeId === target.typeId
    ) {
      return;
    }
    seen.add(key);
    targets.push(target);
  };

  const loadTypesForProperty = async (propertyId: string, propertyName: string) => {
    const typesSnap = await getDocs(collection(db, 'properties', propertyId, 'propertyTypes'));
    for (const typeDoc of typesSnap.docs) {
      const data = typeDoc.data();
      addTarget({
        propertyId,
        propertyName,
        typeId: typeDoc.id,
        listingName: String(data.propertyTypeName || typeDoc.id),
        latitude: data.latitude,
        longitude: data.longitude,
        country: data.country,
        city: data.city,
      });
    }
  };

  if (isPlatformAdmin(profile)) {
    const propsSnap = await getDocs(collection(db, 'properties'));
    const properties = propsSnap.docs
      .map((d) => ({
        id: d.id,
        propertyName: String(d.data().propertyName || d.id),
      }))
      .sort((a, b) => a.propertyName.localeCompare(b.propertyName));

    await Promise.all(
      properties.map((prop) => loadTypesForProperty(prop.id, prop.propertyName))
    );
  } else {
    for (const scope of scopes) {
      if (scope.kind === 'property') {
        await loadTypesForProperty(scope.propertyId, scope.propertyName);
      } else if (scope.kind === 'listing') {
        const coords = await loadListingCoords(scope.propertyId, scope.typeId);
        addTarget({
          propertyId: scope.propertyId,
          propertyName: scope.propertyName,
          typeId: scope.typeId,
          listingName: scope.listingName,
          latitude: coords.latitude,
          longitude: coords.longitude,
          country: coords.country,
          city: coords.city,
        });
      }
    }
  }

  return targets.sort((a, b) => {
    const byProperty = a.propertyName.localeCompare(b.propertyName);
    if (byProperty !== 0) return byProperty;
    return a.listingName.localeCompare(b.listingName);
  });
}

export function groupGemPasteTargetsByProperty(
  targets: GemPasteTarget[]
): Array<{ propertyId: string; propertyName: string; listings: GemPasteTarget[] }> {
  const map = new Map<string, { propertyId: string; propertyName: string; listings: GemPasteTarget[] }>();

  for (const target of targets) {
    const existing = map.get(target.propertyId);
    if (existing) {
      existing.listings.push(target);
    } else {
      map.set(target.propertyId, {
        propertyId: target.propertyId,
        propertyName: target.propertyName,
        listings: [target],
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => a.propertyName.localeCompare(b.propertyName));
}
