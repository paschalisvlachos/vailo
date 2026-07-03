import { collection, doc, getDocs, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import { categoryPrimaryName } from './categoryLocale';
import { readParentCategoryId, isTopLevelCategory } from './categoryHierarchy';
import { AREA_CONTENT_PRIMARY_LOCALE } from './propertyContentLocales';

const BATCH_LIMIT = 400;

export type CopyAreaCategoriesResult = {
  added: number;
  skipped: number;
  skippedNames: string[];
};

function stripCategoryForCopy(data: Record<string, unknown>): Record<string, unknown> {
  const { updatedAt, ...rest } = data;
  return {
    ...rest,
    createdAt: new Date().toISOString(),
    copiedAt: new Date().toISOString(),
  };
}

/**
 * Copy category documents from one area to another. Skips categories whose
 * English/primary name already exists on the target area. Preserves parent/subcategory links.
 */
export async function copyAreaCategories(params: {
  collectionName: 'localGemsCategories' | 'featuresCategories';
  sourceCountry: string;
  sourceAreaId: string;
  targetCountry: string;
  targetAreaId: string;
  primaryLocale?: string;
}): Promise<CopyAreaCategoriesResult> {
  const {
    collectionName,
    sourceCountry,
    sourceAreaId,
    targetCountry,
    targetAreaId,
    primaryLocale = AREA_CONTENT_PRIMARY_LOCALE,
  } = params;

  if (sourceCountry === targetCountry && sourceAreaId === targetAreaId) {
    throw new Error('Source and target area must be different.');
  }

  const sourceCol = collection(
    db,
    'countries',
    sourceCountry,
    'areas',
    sourceAreaId,
    collectionName
  );
  const targetColPath = ['countries', targetCountry, 'areas', targetAreaId, collectionName] as const;

  const [sourceSnap, targetSnap] = await Promise.all([
    getDocs(sourceCol),
    getDocs(collection(db, ...targetColPath)),
  ]);

  const existingByPrimary = new Map<string, string>();
  for (const d of targetSnap.docs) {
    const primary = categoryPrimaryName(d.data() as Record<string, unknown>, primaryLocale)
      .trim()
      .toLowerCase();
    if (primary) existingByPrimary.set(primary, d.id);
  }

  const sourceDocs = sourceSnap.docs.map((d) => ({
    id: d.id,
    data: d.data() as Record<string, unknown>,
  }));

  const parents = sourceDocs.filter((d) => isTopLevelCategory(d.data));
  const children = sourceDocs.filter((d) => !isTopLevelCategory(d.data));

  const skippedNames: string[] = [];
  const sourceIdToTargetId = new Map<string, string>();

  for (const src of sourceDocs) {
    const primary = categoryPrimaryName(src.data, primaryLocale).trim();
    if (!primary) continue;
    const existingId = existingByPrimary.get(primary.toLowerCase());
    if (existingId) {
      skippedNames.push(primary);
      sourceIdToTargetId.set(src.id, existingId);
    }
  }

  const toAddParents: Array<{ sourceId: string; payload: Record<string, unknown> }> = [];
  for (const src of parents) {
    const primary = categoryPrimaryName(src.data, primaryLocale).trim();
    if (!primary || existingByPrimary.has(primary.toLowerCase())) continue;
    toAddParents.push({ sourceId: src.id, payload: stripCategoryForCopy(src.data) });
  }

  let added = 0;

  for (let i = 0; i < toAddParents.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const { sourceId, payload } of toAddParents.slice(i, i + BATCH_LIMIT)) {
      const ref = doc(collection(db, ...targetColPath));
      batch.set(ref, payload);
      sourceIdToTargetId.set(sourceId, ref.id);
      added += 1;
    }
    await batch.commit();
  }

  const toAddChildren: Array<{ payload: Record<string, unknown> }> = [];
  for (const src of children) {
    const primary = categoryPrimaryName(src.data, primaryLocale).trim();
    if (!primary || existingByPrimary.has(primary.toLowerCase())) continue;

    const payload = stripCategoryForCopy(src.data);
    const parentId = readParentCategoryId(src.data);
    if (parentId) {
      const mappedParent = sourceIdToTargetId.get(parentId);
      if (mappedParent) payload.parentCategoryId = mappedParent;
      else delete payload.parentCategoryId;
    }
    toAddChildren.push({ payload });
  }

  for (let i = 0; i < toAddChildren.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    for (const { payload } of toAddChildren.slice(i, i + BATCH_LIMIT)) {
      batch.set(doc(collection(db, ...targetColPath)), payload);
      added += 1;
    }
    await batch.commit();
  }

  return {
    added,
    skipped: skippedNames.length,
    skippedNames,
  };
}
