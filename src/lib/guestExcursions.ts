import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from './firebase';
import type { Excursion } from './excursion';
import { excursionFromDoc } from './excursion';
import type { ListingAreaContext } from './listingAreaContext';
import {
  EXCURSION_PROVIDER_COLLECTION,
  EXCURSION_SUBCOLLECTION,
  normalizeOperatingRegions,
  providerOperatesInArea,
} from './excursionProvider';

export type GuestExcursionListing = {
  providerId: string;
  providerName: string;
  providerLogoUrl?: string;
  excursion: Excursion;
};

export async function loadGuestExcursionsForArea(
  ctx: ListingAreaContext
): Promise<GuestExcursionListing[]> {
  const providersSnap = await getDocs(
    query(collection(db, EXCURSION_PROVIDER_COLLECTION), where('status', '==', 'active'))
  );

  const listings: GuestExcursionListing[] = [];

  await Promise.all(
    providersSnap.docs.map(async (providerDoc) => {
      const data = providerDoc.data() as Record<string, unknown>;
      const operatingRegions = normalizeOperatingRegions(data);
      if (!providerOperatesInArea({ operatingRegions }, ctx.country, ctx.areaId)) {
        return;
      }

      const providerName = String(data.businessName || 'Provider');
      const providerLogoUrl = String(data.logoUrl || '').trim() || undefined;
      const excursionsSnap = await getDocs(
        collection(db, EXCURSION_PROVIDER_COLLECTION, providerDoc.id, EXCURSION_SUBCOLLECTION)
      );

      for (const excDoc of excursionsSnap.docs) {
        const excursion = excursionFromDoc(excDoc.id, excDoc.data());
        if (excursion.status !== 'published') continue;
        listings.push({
          providerId: providerDoc.id,
          providerName,
          providerLogoUrl,
          excursion: { ...excursion, providerId: providerDoc.id },
        });
      }
    })
  );

  return listings.sort((a, b) => a.excursion.title.localeCompare(b.excursion.title));
}
