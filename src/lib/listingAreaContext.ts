import { collection, getDocs } from 'firebase/firestore';
import { db } from './firebase';

export type ListingAreaContext = {
  country: string;
  masterArea: string;
  areaId: string;
};

export type AreaConfigIssue = 'missing' | 'invalid-master' | null;

export type PropertyTypeAreaLookup = { country?: string; city?: string };

type AreaContextResult = {
  ctx: ListingAreaContext | null;
  issue: AreaConfigIssue;
  cityRaw: string;
};

const areaContextCache = new Map<string, Promise<AreaContextResult>>();

function areaContextCacheKey(country: string, cityRaw: string): string {
  return `${country.toLowerCase()}::${cityRaw.toLowerCase()}`;
}

async function resolvePropertyTypeAreaContextUncached(
  country: string,
  cityRaw: string
): Promise<AreaContextResult> {
  const areasSnap = await getDocs(collection(db, 'countries', country, 'areas'));
  const matchDoc = areasSnap.docs.find((d) => {
    const name = typeof d.data().name === 'string' ? d.data().name.trim() : '';
    return name.toLowerCase() === cityRaw.toLowerCase();
  });

  if (!matchDoc) {
    return { ctx: null, issue: 'invalid-master', cityRaw };
  }

  const masterArea =
    typeof matchDoc.data().name === 'string' ? matchDoc.data().name.trim() : cityRaw;

  return {
    ctx: { country, masterArea, areaId: matchDoc.id },
    issue: null,
    cityRaw,
  };
}

/** Match listing country + city/master area to a configured Area Functionality region. */
export async function resolvePropertyTypeAreaContext(
  propertyType?: PropertyTypeAreaLookup
): Promise<AreaContextResult> {
  const country = typeof propertyType?.country === 'string' ? propertyType.country.trim() : '';
  const cityRaw = typeof propertyType?.city === 'string' ? propertyType.city.trim() : '';

  if (!country || !cityRaw) {
    return { ctx: null, issue: 'missing', cityRaw };
  }

  const cacheKey = areaContextCacheKey(country, cityRaw);
  let pending = areaContextCache.get(cacheKey);
  if (!pending) {
    pending = resolvePropertyTypeAreaContextUncached(country, cityRaw);
    areaContextCache.set(cacheKey, pending);
  }
  return pending;
}
