import {
  addDoc,
  collection,
  getDocs,
  updateDoc,
  doc,
} from 'firebase/firestore';
import { db } from './firebase';
import { suggestAlternatePlaceTitles, mergeAlternateTitleLists } from './alternateTitles';
import { gemSameNameAndLocation, gemPrimaryName } from './gemLocationMatch';
import { resolvePropertyTypeAreaContext } from './listingAreaContext';

export type PropertyGemDoc = Record<string, unknown> & {
  id?: string;
  name?: string;
  category?: string;
  categories?: string[];
  description?: string;
  rating?: string | number;
  googleMapsUrl?: string;
  latitude?: string | number;
  longitude?: string | number;
  photoUrl?: string;
  isDailyTrip?: boolean;
  nameByLocale?: Record<string, string>;
  descriptionByLocale?: Record<string, string>;
};

export type SyncPropertyGemResult = 'created' | 'updated' | 'skipped' | 'no-area';

function areaGemCollection(country: string, areaId: string) {
  return collection(db, 'countries', country, 'areas', areaId, 'localGems');
}

function buildInsertedByLabel(propertyName: string, listingLabel?: string): string {
  const prop = propertyName.trim();
  const listing = listingLabel?.trim();
  if (prop && listing && listing.toLowerCase() !== prop.toLowerCase()) {
    return `${prop} / ${listing}`;
  }
  return prop || listing || 'Property listing';
}

function toAreaGemPayload(
  propertyGem: PropertyGemDoc,
  meta: {
    propertyId: string;
    propertyTypeId: string;
    propertyGemId: string;
    insertedByLabel: string;
    alternateTitles: string[];
  }
): Record<string, unknown> {
  const {
    distanceKm: _d,
    distanceTime: _t,
    isLegitPick: _l,
    createdAt: _c,
    id: _id,
    ...rest
  } = propertyGem;

  return {
    ...rest,
    name: gemPrimaryName(propertyGem),
    category: propertyGem.category || propertyGem.categories?.[0] || '',
    categories: propertyGem.categories || (propertyGem.category ? [propertyGem.category] : []),
    sourcePropertyId: meta.propertyId,
    sourcePropertyTypeId: meta.propertyTypeId,
    sourcePropertyGemId: meta.propertyGemId,
    insertedByLabel: meta.insertedByLabel,
    alternateTitles: meta.alternateTitles,
    syncedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

async function loadAreaGems(country: string, areaId: string) {
  const snap = await getDocs(areaGemCollection(country, areaId));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Array<
    Record<string, unknown> & { id: string }
  >;
}

/** Sync one property local gem into area master local gems (skip if same name+location exists). */
export async function syncPropertyGemToArea(params: {
  propertyId: string;
  propertyTypeId: string;
  propertyGemId: string;
  propertyGem: PropertyGemDoc;
  propertyName: string;
  listingLabel?: string;
  propertyType?: { country?: string; city?: string };
  areaContext?: { country: string; areaId: string; masterArea: string };
  existingAreaGems?: Array<Record<string, unknown> & { id: string }>;
  skipAiTitles?: boolean;
}): Promise<SyncPropertyGemResult> {
  let country = params.areaContext?.country;
  let areaId = params.areaContext?.areaId;
  let masterArea = params.areaContext?.masterArea;

  if (!country || !areaId) {
    const resolved = await resolvePropertyTypeAreaContext(params.propertyType);
    if (!resolved.ctx) return 'no-area';
    country = resolved.ctx.country;
    areaId = resolved.ctx.areaId;
    masterArea = resolved.ctx.masterArea;
  }

  const areaGems = params.existingAreaGems ?? (await loadAreaGems(country, areaId));
  const propertyGemWithId = { ...params.propertyGem, id: params.propertyGemId };

  const linked = areaGems.find(
    (g) =>
      g.sourcePropertyGemId === params.propertyGemId &&
      g.sourcePropertyTypeId === params.propertyTypeId
  );

  const duplicate = areaGems.find(
    (g) => g.id !== linked?.id && gemSameNameAndLocation(propertyGemWithId, g)
  );

  if (duplicate && !linked) {
    return 'skipped';
  }

  const canonicalName = gemPrimaryName(propertyGemWithId);
  const alternateTitles = params.skipAiTitles
    ? mergeAlternateTitleLists(canonicalName, (linked?.alternateTitles as string[]) || [])
    : await suggestAlternatePlaceTitles(canonicalName, {
        areaName: masterArea,
        category: String(propertyGemWithId.category || ''),
        existing: (linked?.alternateTitles as string[]) || [],
      });

  const payload = toAreaGemPayload(propertyGemWithId, {
    propertyId: params.propertyId,
    propertyTypeId: params.propertyTypeId,
    propertyGemId: params.propertyGemId,
    insertedByLabel: buildInsertedByLabel(params.propertyName, params.listingLabel),
    alternateTitles,
  });

  if (linked) {
    await updateDoc(doc(db, 'countries', country, 'areas', areaId, 'localGems', linked.id), payload);
    return 'updated';
  }

  if (duplicate) {
    return 'skipped';
  }

  await addDoc(areaGemCollection(country, areaId), {
    ...payload,
    createdAt: new Date().toISOString(),
  });
  return 'created';
}

/** Import all property local gems for listings in this master area. */
export async function syncAllPropertyGemsToArea(params: {
  country: string;
  areaId: string;
  masterArea: string;
  onProgress?: (message: string) => void;
}): Promise<{ created: number; updated: number; skipped: number; noArea: number }> {
  const stats = { created: 0, updated: 0, skipped: 0, noArea: 0 };
  const areaGems = await loadAreaGems(params.country, params.areaId);
  const propertiesSnap = await getDocs(collection(db, 'properties'));

  for (const propDoc of propertiesSnap.docs) {
    const property = propDoc.data();
    const propertyName = String(property.propertyName || propDoc.id);
    const typesSnap = await getDocs(collection(db, 'properties', propDoc.id, 'propertyTypes'));

    for (const typeDoc of typesSnap.docs) {
      const typeData = typeDoc.data();
      const city = String(typeData.city || '').trim();
      if (!city || city.toLowerCase() !== params.masterArea.toLowerCase()) continue;
      if (typeData.country && String(typeData.country) !== params.country) continue;

      const listingLabel = String(typeData.propertyTypeName || typeData.urlSlug || '').trim();
      const gemsSnap = await getDocs(
        collection(db, 'properties', propDoc.id, 'propertyTypes', typeDoc.id, 'localGems')
      );

      for (const gemDoc of gemsSnap.docs) {
        params.onProgress?.(gemPrimaryName(gemDoc.data()) || gemDoc.id);
        const result = await syncPropertyGemToArea({
          propertyId: propDoc.id,
          propertyTypeId: typeDoc.id,
          propertyGemId: gemDoc.id,
          propertyGem: { id: gemDoc.id, ...gemDoc.data() },
          propertyName,
          listingLabel,
          propertyType: { country: typeData.country, city: typeData.city },
          areaContext: {
            country: params.country,
            areaId: params.areaId,
            masterArea: params.masterArea,
          },
          existingAreaGems: areaGems,
        });

        if (result === 'created') {
          stats.created += 1;
          areaGems.push({
            id: `pending-${propDoc.id}-${gemDoc.id}`,
            ...gemDoc.data(),
            sourcePropertyGemId: gemDoc.id,
          });
        } else if (result === 'updated') stats.updated += 1;
        else if (result === 'skipped') stats.skipped += 1;
        else stats.noArea += 1;
      }
    }
  }

  return stats;
}
