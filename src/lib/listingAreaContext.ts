import { collection, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import { areaNameToId } from './areaUtils';

export type ListingAreaContext = {
  country: string;
  masterArea: string;
  areaId: string;
};

export type AreaConfigIssue = 'missing' | 'invalid-master' | null;

/** Match listing country + city/master area to a configured Area Functionality region. */
export async function resolvePropertyTypeAreaContext(propertyType?: {
  country?: string;
  city?: string;
}): Promise<{ ctx: ListingAreaContext | null; issue: AreaConfigIssue; cityRaw: string }> {
  const country = typeof propertyType?.country === 'string' ? propertyType.country.trim() : '';
  const cityRaw = typeof propertyType?.city === 'string' ? propertyType.city.trim() : '';

  if (!country || !cityRaw) {
    return { ctx: null, issue: 'missing', cityRaw };
  }

  const areasSnap = await getDocs(collection(db, 'countries', country, 'areas'));
  const configuredAreas = areasSnap.docs
    .map((d) => (typeof d.data().name === 'string' ? d.data().name.trim() : ''))
    .filter(Boolean);

  const match = configuredAreas.find((name) => name.toLowerCase() === cityRaw.toLowerCase());
  if (!match) {
    return { ctx: null, issue: 'invalid-master', cityRaw };
  }

  return {
    ctx: { country, masterArea: match, areaId: areaNameToId(match) },
    issue: null,
    cityRaw,
  };
}
