import { collection, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import { EXCURSION_PROVIDER_COLLECTION } from './excursionProvider';

export type ExcursionProviderAllocationConflict = {
  providerId: string;
  businessName: string;
};

/** Returns another provider that already has this owner allocated (if any). */
export async function findExcursionProviderAllocationConflict(
  ownerId: string,
  excludeProviderId?: string
): Promise<ExcursionProviderAllocationConflict | null> {
  const trimmed = ownerId.trim();
  if (!trimmed) return null;

  const snap = await getDocs(collection(db, EXCURSION_PROVIDER_COLLECTION));
  for (const docSnap of snap.docs) {
    if (excludeProviderId && docSnap.id === excludeProviderId) continue;
    const linked = docSnap.data().linkedOwnerIds;
    if (!Array.isArray(linked) || !linked.includes(trimmed)) continue;
    return {
      providerId: docSnap.id,
      businessName: String(docSnap.data().businessName || 'Excursion business').trim(),
    };
  }
  return null;
}

export function normalizeLinkedOwnerIds(ids: string[] | undefined): string[] {
  if (!Array.isArray(ids)) return [];
  const first = ids.find((id) => typeof id === 'string' && id.trim());
  return first ? [first.trim()] : [];
}
