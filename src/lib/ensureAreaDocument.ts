import { collection, doc, getDocs, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { clearPropertyTypeAreaContextCache } from './listingAreaContext';

export function areaIdFromName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/**
 * Ensure `countries/{country}/areas/{areaId}` exists for the chosen municipality.
 * Matches existing areas case-insensitively; otherwise creates automatically.
 */
export async function ensureAreaDocument(params: {
  country: string;
  areaName: string;
  lat?: number;
  lng?: number;
}): Promise<{ country: string; areaId: string; areaName: string; created: boolean }> {
  const country = params.country.trim();
  const areaName = params.areaName.trim();
  if (!country || !areaName) {
    throw new Error('Country and area are required.');
  }

  const areasSnap = await getDocs(collection(db, 'countries', country, 'areas'));
  const existing = areasSnap.docs.find((d) => {
    const name = typeof d.data().name === 'string' ? d.data().name.trim() : '';
    return name.toLowerCase() === areaName.toLowerCase() || d.id === areaIdFromName(areaName);
  });

  if (existing) {
    const name =
      typeof existing.data().name === 'string' && existing.data().name.trim()
        ? existing.data().name.trim()
        : areaName;
    return { country, areaId: existing.id, areaName: name, created: false };
  }

  const areaId = areaIdFromName(areaName) || `area-${Date.now()}`;
  const now = new Date().toISOString();
  const payload: Record<string, unknown> = {
    name: areaName,
    createdAt: now,
    source: 'property-wizard',
  };
  if (typeof params.lat === 'number' && Number.isFinite(params.lat)) payload.lat = params.lat;
  if (typeof params.lng === 'number' && Number.isFinite(params.lng)) payload.lng = params.lng;

  await setDoc(
    doc(db, 'countries', country),
    { name: country, updatedAt: now },
    { merge: true }
  );
  await setDoc(doc(db, 'countries', country, 'areas', areaId), payload, { merge: true });
  clearPropertyTypeAreaContextCache(country, areaName);

  return { country, areaId, areaName, created: true };
}
