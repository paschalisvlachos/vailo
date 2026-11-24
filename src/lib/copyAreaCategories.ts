import { collection, doc, getDocs, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import { categoryPrimaryName } from './categoryLocale';
import { readParentCategoryId, isTopLevelCategory } from './categoryHierarchy';
import { AREA_CONTENT_PRIMARY_LOCALE } from './propertyContentLocales';

export type CategoryCollectionName = 'localGemsCategories' | 'featuresCategories';

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
const PREFERRED_TEMPLATE_AREA_IDS = ['chania', 'heraklion', 'crete', 'rethymno'];

async function countCategories(
  country: string,
  areaId: string,
  collectionName: CategoryCollectionName
): Promise<number> {
  const snap = await getDocs(
    collection(db, 'countries', country, 'areas', areaId, collectionName)
  );
  return snap.size;
}

/** Pick a category template area (same country first, then Greece defaults). */
export async function findBestCategoryTemplateArea(params: {
  preferredCountry: string;
  collectionName: CategoryCollectionName;
  excludeAreaId?: string;
}): Promise<{ country: string; areaId: string; count: number } | null> {
  const preferredCountry = params.preferredCountry.trim() || 'Greece';

  const tryArea = async (country: string, areaId: string) => {
    if (params.excludeAreaId && country === preferredCountry && areaId === params.excludeAreaId) {
      return null;
    }
    const count = await countCategories(country, areaId, params.collectionName);
    return count > 0 ? { country, areaId, count } : null;
  };

  // Fast path: known Crete hubs (most installs already have these seeded).
  if (preferredCountry === 'Greece') {
    for (const areaId of PREFERRED_TEMPLATE_AREA_IDS) {
      const hit = await tryArea('Greece', areaId);
      if (hit) return hit;
    }
  }

  const areasSnap = await getDocs(collection(db, 'countries', preferredCountry, 'areas'));
  let best: { country: string; areaId: string; count: number } | null = null;
  for (const areaDoc of areasSnap.docs) {
    const hit = await tryArea(preferredCountry, areaDoc.id);
    if (!hit) continue;
    if (!best || hit.count > best.count) best = hit;
  }
  if (best) return best;

  if (preferredCountry !== 'Greece') {
    for (const areaId of PREFERRED_TEMPLATE_AREA_IDS) {
      const hit = await tryArea('Greece', areaId);
      if (hit) return hit;
    }
    const greeceAreas = await getDocs(collection(db, 'countries', 'Greece', 'areas'));
    for (const areaDoc of greeceAreas.docs) {
      const hit = await tryArea('Greece', areaDoc.id);
      if (!hit) continue;
      if (!best || hit.count > best.count) best = hit;
    }
  }

  return best;
}

/**
 * When a new area is created empty, copy partner + gem categories from the
 * richest template area so Partners/Gems can be categorized immediately.
 */
export async function seedNewAreaCategories(params: {
  country: string;
  areaId: string;
}): Promise<{ featuresAdded: number; gemsAdded: number }> {
  const country = params.country.trim();
  const areaId = params.areaId.trim();
  if (!country || !areaId) return { featuresAdded: 0, gemsAdded: 0 };

  const [featuresTemplate, gemsTemplate] = await Promise.all([
    findBestCategoryTemplateArea({
      preferredCountry: country,
      collectionName: 'featuresCategories',
      excludeAreaId: areaId,
    }),
    findBestCategoryTemplateArea({
      preferredCountry: country,
      collectionName: 'localGemsCategories',
      excludeAreaId: areaId,
    }),
  ]);

  let featuresAdded = 0;
  let gemsAdded = 0;

  if (featuresTemplate) {
    const result = await copyAreaCategories({
      collectionName: 'featuresCategories',
      sourceCountry: featuresTemplate.country,
      sourceAreaId: featuresTemplate.areaId,
      targetCountry: country,
      targetAreaId: areaId,
    });
    featuresAdded = result.added;
  }

  if (gemsTemplate) {
    const result = await copyAreaCategories({
      collectionName: 'localGemsCategories',
      sourceCountry: gemsTemplate.country,
      sourceAreaId: gemsTemplate.areaId,
      targetCountry: country,
      targetAreaId: areaId,
    });
    gemsAdded = result.added;
  }

  return { featuresAdded, gemsAdded };
}

export async function copyAreaCategories(params: {
  collectionName: CategoryCollectionName;
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
