import { doc, getDoc, writeBatch } from 'firebase/firestore';
import { db } from './firebase';

/** Firestore field on `countries/{country}/areas/{areaId}` — direct neighbor area ids (same country). */
export const AREA_NEIGHBORS_FIELD = 'neighborAreaIds';

export function parseNeighborAreaIds(
  data: Record<string, unknown> | null | undefined
): string[] {
  const raw = data?.[AREA_NEIGHBORS_FIELD];
  if (!Array.isArray(raw)) return [];
  const ids = raw
    .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
    .map((id) => id.trim());
  return [...new Set(ids)].sort();
}

/** Keep only valid ids, exclude self, dedupe. */
export function normalizeNeighborAreaIds(
  areaId: string,
  selected: string[],
  validAreaIds: Iterable<string>
): string[] {
  const valid = new Set(validAreaIds);
  const ids = selected
    .map((id) => id.trim())
    .filter((id) => id && id !== areaId && valid.has(id));
  return [...new Set(ids)].sort();
}

export type SaveAreaNeighborsResult = {
  previousNeighborIds: string[];
  savedNeighborIds: string[];
  addedSymmetric: string[];
  removedSymmetric: string[];
};

/**
 * Saves direct neighbor links for one area and keeps symmetry:
 * if A lists B, B lists A; removing either side removes both.
 */
export async function saveAreaNeighborsSymmetric(params: {
  country: string;
  areaId: string;
  nextNeighborIds: string[];
  validAreaIds: string[];
}): Promise<SaveAreaNeighborsResult> {
  const { country, areaId, validAreaIds } = params;
  const next = normalizeNeighborAreaIds(areaId, params.nextNeighborIds, validAreaIds);

  const areaRef = doc(db, 'countries', country, 'areas', areaId);
  const areaSnap = await getDoc(areaRef);
  const previous = parseNeighborAreaIds(areaSnap.exists() ? areaSnap.data() : undefined);

  const added = next.filter((id) => !previous.includes(id));
  const removed = previous.filter((id) => !next.includes(id));

  const batch = writeBatch(db);
  const now = new Date().toISOString();

  batch.update(areaRef, {
    [AREA_NEIGHBORS_FIELD]: next,
    neighborsUpdatedAt: now,
  });

  const touchNeighbor = async (neighborId: string, includeSelf: boolean) => {
    const neighborRef = doc(db, 'countries', country, 'areas', neighborId);
    const neighborSnap = await getDoc(neighborRef);
    if (!neighborSnap.exists()) return;

    const neighborCurrent = parseNeighborAreaIds(neighborSnap.data());
    const neighborNext = includeSelf
      ? [...new Set([...neighborCurrent, areaId])].sort()
      : neighborCurrent.filter((id) => id !== areaId);

    if (
      neighborNext.length === neighborCurrent.length &&
      neighborNext.every((id, i) => id === neighborCurrent[i])
    ) {
      return;
    }

    batch.update(neighborRef, {
      [AREA_NEIGHBORS_FIELD]: neighborNext,
      neighborsUpdatedAt: now,
    });
  };

  await Promise.all([
    ...added.map((id) => touchNeighbor(id, true)),
    ...removed.map((id) => touchNeighbor(id, false)),
  ]);

  await batch.commit();

  return {
    previousNeighborIds: previous,
    savedNeighborIds: next,
    addedSymmetric: added,
    removedSymmetric: removed,
  };
}

export function neighborAreaName(
  areaId: string,
  areas: Array<{ id: string; name: string }>
): string {
  return areas.find((a) => a.id === areaId)?.name || areaId;
}
