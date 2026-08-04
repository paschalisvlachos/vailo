import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import {
  featureExistsInListing,
  featurePrimaryName,
  stripFeatureForCopy,
} from './propertyFeatureCopy';

const migrationInFlight = new Set<string>();

function listingFeaturesPath(propertyId: string, typeId: string) {
  return collection(db, 'properties', propertyId, 'propertyTypes', typeId, 'features');
}

function featureDocUpdatedAt(data: Record<string, unknown>): string {
  return String(data.updatedAt || data.createdAt || '');
}

/** Remove duplicate feature docs on a listing (same name, case-insensitive). */
export async function dedupeListingFeatures(
  propertyId: string,
  typeId: string
): Promise<number> {
  const snap = await getDocs(listingFeaturesPath(propertyId, typeId));
  if (snap.docs.length <= 1) return 0;

  const groups = new Map<string, typeof snap.docs>();
  for (const featDoc of snap.docs) {
    const name = featurePrimaryName(featDoc.data());
    if (!name) continue;
    const group = groups.get(name) || [];
    group.push(featDoc);
    groups.set(name, group);
  }

  let removed = 0;
  for (const docs of groups.values()) {
    if (docs.length <= 1) continue;

    const sorted = [...docs].sort((a, b) => {
      const aMigrated = a.data().migratedFromPropertyLevel === true ? 1 : 0;
      const bMigrated = b.data().migratedFromPropertyLevel === true ? 1 : 0;
      if (aMigrated !== bMigrated) return aMigrated - bMigrated;
      return featureDocUpdatedAt(a.data()).localeCompare(featureDocUpdatedAt(b.data()));
    });

    for (let i = 1; i < sorted.length; i += 1) {
      await deleteDoc(sorted[i].ref);
      removed += 1;
    }
  }

  return removed;
}

async function dedupeAllListingFeatures(propertyId: string): Promise<number> {
  const typesSnap = await getDocs(collection(db, 'properties', propertyId, 'propertyTypes'));
  let removed = 0;
  for (const typeDoc of typesSnap.docs) {
    removed += await dedupeListingFeatures(propertyId, typeDoc.id);
  }
  return removed;
}

async function deleteLegacyPropertyFeatures(propertyId: string): Promise<number> {
  const legacySnap = await getDocs(collection(db, 'properties', propertyId, 'features'));
  if (legacySnap.empty) return 0;

  await Promise.all(legacySnap.docs.map((featDoc) => deleteDoc(featDoc.ref)));
  return legacySnap.size;
}

/**
 * One-time migration: copy legacy property-level features into the first listing,
 * dedupe any accidental duplicates, then remove legacy property-level docs.
 */
export async function migratePropertyFeaturesToFirstListing(
  propertyId: string
): Promise<{ migrated: number; deduped: number; firstTypeId?: string }> {
  if (migrationInFlight.has(propertyId)) {
    return { migrated: 0, deduped: 0 };
  }

  migrationInFlight.add(propertyId);
  try {
    const propertyRef = doc(db, 'properties', propertyId);
    const propertySnap = await getDoc(propertyRef);
    if (!propertySnap.exists()) return { migrated: 0, deduped: 0 };

    const propertyData = propertySnap.data();
    let deduped = 0;

    if (propertyData.featuresListingMigrationAt) {
      deduped = await dedupeAllListingFeatures(propertyId);
      return { migrated: 0, deduped };
    }

    const legacySnap = await getDocs(collection(db, 'properties', propertyId, 'features'));
    const typesSnap = await getDocs(collection(db, 'properties', propertyId, 'propertyTypes'));
    if (typesSnap.empty) return { migrated: 0, deduped: 0 };

    const firstTypeId = typesSnap.docs[0].id;
    const listingFeaturesSnap = await getDocs(listingFeaturesPath(propertyId, firstTypeId));
    const existingFeatures = listingFeaturesSnap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Record<string, unknown>),
    }));

    const now = new Date().toISOString();
    let migrated = 0;

    if (!legacySnap.empty) {
      for (const featDoc of legacySnap.docs) {
        const source = featDoc.data() as Record<string, unknown>;
        if (featureExistsInListing(source, existingFeatures)) continue;

        const payload = {
          ...stripFeatureForCopy(source),
          updatedAt: now,
          migratedFromPropertyLevel: true,
        };
        const featureRef = await addDoc(listingFeaturesPath(propertyId, firstTypeId), payload);
        existingFeatures.push({ id: featureRef.id, ...payload });
        migrated += 1;
      }

      await deleteLegacyPropertyFeatures(propertyId);
    }

    deduped = await dedupeAllListingFeatures(propertyId);

    await updateDoc(propertyRef, {
      featuresListingMigrationAt: now,
    });

    return { migrated, deduped, firstTypeId };
  } finally {
    migrationInFlight.delete(propertyId);
  }
}
