import {
  collection,
  collectionGroup,
  doc,
  getDocs,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';

const BATCH_LIMIT = 400;

async function commitBatches(
  updates: Array<{ ref: ReturnType<typeof doc>; data: Record<string, unknown> }>
) {
  for (let i = 0; i < updates.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    updates.slice(i, i + BATCH_LIMIT).forEach(({ ref, data }) => batch.update(ref, data));
    await batch.commit();
  }
}

export async function renameLocalGemsCategory(
  country: string,
  areaId: string,
  categoryDocId: string,
  oldName: string,
  newName: string
) {
  const trimmed = newName.trim();
  await updateDoc(
    doc(db, 'countries', country, 'areas', areaId, 'localGemsCategories', categoryDocId),
    { name: trimmed, updatedAt: new Date().toISOString() }
  );

  const updates: Array<{ ref: ReturnType<typeof doc>; data: Record<string, unknown> }> = [];

  const areaGemsSnap = await getDocs(
    collection(db, 'countries', country, 'areas', areaId, 'localGems')
  );
  areaGemsSnap.docs.forEach((gemDoc) => {
    if (gemDoc.data().category === oldName) {
      updates.push({ ref: gemDoc.ref, data: { category: trimmed } });
    }
  });

  const discoveredSnap = await getDocs(
    collection(db, 'countries', country, 'areas', areaId, 'discoveredPlaces')
  );
  discoveredSnap.docs.forEach((placeDoc) => {
    if (placeDoc.data().category === oldName) {
      updates.push({ ref: placeDoc.ref, data: { category: trimmed } });
    }
  });

  const propertyGemsSnap = await getDocs(collectionGroup(db, 'localGems'));
  propertyGemsSnap.docs.forEach((gemDoc) => {
    if (gemDoc.data().category === oldName) {
      updates.push({ ref: gemDoc.ref, data: { category: trimmed } });
    }
  });

  if (updates.length > 0) {
    await commitBatches(updates);
  }

  return updates.length;
}

export async function renameFeaturesCategory(
  country: string,
  areaId: string,
  categoryDocId: string,
  oldName: string,
  newName: string
) {
  const trimmed = newName.trim();
  await updateDoc(
    doc(db, 'countries', country, 'areas', areaId, 'featuresCategories', categoryDocId),
    { name: trimmed, updatedAt: new Date().toISOString() }
  );

  const replaceInList = (categories: unknown) => {
    if (!Array.isArray(categories)) return categories;
    return categories.map((c) => (c === oldName ? trimmed : c));
  };

  const updates: Array<{ ref: ReturnType<typeof doc>; data: Record<string, unknown> }> = [];

  const areaFeatsSnap = await getDocs(
    collection(db, 'countries', country, 'areas', areaId, 'areaFeatures')
  );
  areaFeatsSnap.docs.forEach((featDoc) => {
    const categories = featDoc.data().categories;
    if (Array.isArray(categories) && categories.includes(oldName)) {
      updates.push({ ref: featDoc.ref, data: { categories: replaceInList(categories) } });
    }
  });

  const propertyFeatsSnap = await getDocs(collectionGroup(db, 'features'));
  propertyFeatsSnap.docs.forEach((featDoc) => {
    const categories = featDoc.data().categories;
    if (Array.isArray(categories) && categories.includes(oldName)) {
      updates.push({ ref: featDoc.ref, data: { categories: replaceInList(categories) } });
    }
  });

  if (updates.length > 0) {
    await commitBatches(updates);
  }

  return updates.length;
}
