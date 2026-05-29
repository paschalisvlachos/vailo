import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';
import {
  buildCategoryNamePayload,
  renameValueInLocaleMap,
  patchLinkedExperienceTypes,
  patchLinkedGemCategory,
  patchLinkedFeatureCategoriesList,
} from './categoryLocale';
import {
  mergeLegacyIntoLocaleMap,
  AREA_CONTENT_PRIMARY_LOCALE,
  readLocaleMap,
} from './propertyContentLocales';

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

async function updateCategoryDoc(
  country: string,
  areaId: string,
  collectionName: 'localGemsCategories' | 'featuresCategories',
  categoryDocId: string,
  oldName: string,
  newName: string
) {
  const trimmed = newName.trim();
  const primary = AREA_CONTENT_PRIMARY_LOCALE;

  const ref = doc(db, 'countries', country, 'areas', areaId, collectionName, categoryDocId);
  const snap = await getDoc(ref);
  const existing = snap.exists() ? (snap.data() as Record<string, unknown>) : {};
  const merged = mergeLegacyIntoLocaleMap(
    readLocaleMap(existing, 'name'),
    typeof existing.name === 'string' ? (existing.name as string) : oldName,
    primary
  );
  const nextMap = renameValueInLocaleMap(merged, oldName, trimmed) ?? merged;
  nextMap[primary] = trimmed;
  const payload = buildCategoryNamePayload({ name: nextMap }, primary);
  await updateDoc(ref, { ...payload, updatedAt: new Date().toISOString() });
}

export async function renameLocalGemsCategory(
  country: string,
  areaId: string,
  categoryDocId: string,
  oldName: string,
  newName: string
) {
  const trimmed = newName.trim();
  await updateCategoryDoc(country, areaId, 'localGemsCategories', categoryDocId, oldName, trimmed);

  const updates: Array<{ ref: ReturnType<typeof doc>; data: Record<string, unknown> }> = [];

  const areaGemsSnap = await getDocs(
    collection(db, 'countries', country, 'areas', areaId, 'localGems')
  );
  areaGemsSnap.docs.forEach((gemDoc) => {
    const patch = patchLinkedGemCategory(gemDoc.data() as Record<string, unknown>, oldName, trimmed);
    if (patch) updates.push({ ref: gemDoc.ref, data: patch });
  });

  const discoveredSnap = await getDocs(
    collection(db, 'countries', country, 'areas', areaId, 'discoveredPlaces')
  );
  discoveredSnap.docs.forEach((placeDoc) => {
    const patch = patchLinkedGemCategory(placeDoc.data() as Record<string, unknown>, oldName, trimmed);
    if (patch) updates.push({ ref: placeDoc.ref, data: patch });
  });

  const propertyGemsSnap = await getDocs(collectionGroup(db, 'localGems'));
  propertyGemsSnap.docs.forEach((gemDoc) => {
    const patch = patchLinkedGemCategory(gemDoc.data() as Record<string, unknown>, oldName, trimmed);
    if (patch) updates.push({ ref: gemDoc.ref, data: patch });
  });

  const areaFeatsSnap = await getDocs(
    collection(db, 'countries', country, 'areas', areaId, 'areaFeatures')
  );
  areaFeatsSnap.docs.forEach((featDoc) => {
    const data = featDoc.data() as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    const cats = patchLinkedFeatureCategoriesList(data.categories, oldName, trimmed);
    if (cats) patch.categories = cats;
    const exp = patchLinkedExperienceTypes(data.experienceTypes, oldName, trimmed);
    if (exp) patch.experienceTypes = exp;
    if (Object.keys(patch).length > 0) updates.push({ ref: featDoc.ref, data: patch });
  });

  if (updates.length > 0) await commitBatches(updates);
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
  await updateCategoryDoc(country, areaId, 'featuresCategories', categoryDocId, oldName, trimmed);

  const updates: Array<{ ref: ReturnType<typeof doc>; data: Record<string, unknown> }> = [];

  const areaFeatsSnap = await getDocs(
    collection(db, 'countries', country, 'areas', areaId, 'areaFeatures')
  );
  areaFeatsSnap.docs.forEach((featDoc) => {
    const data = featDoc.data() as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    const cats = patchLinkedFeatureCategoriesList(data.categories, oldName, trimmed);
    if (cats) patch.categories = cats;
    if (Object.keys(patch).length > 0) updates.push({ ref: featDoc.ref, data: patch });
  });

  const propertyFeatsSnap = await getDocs(collectionGroup(db, 'features'));
  propertyFeatsSnap.docs.forEach((featDoc) => {
    const data = featDoc.data() as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    const cats = patchLinkedFeatureCategoriesList(data.categories, oldName, trimmed);
    if (cats) patch.categories = cats;
    if (Object.keys(patch).length > 0) updates.push({ ref: featDoc.ref, data: patch });
  });

  if (updates.length > 0) await commitBatches(updates);
  return updates.length;
}
