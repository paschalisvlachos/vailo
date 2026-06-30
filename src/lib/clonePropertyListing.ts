import { addDoc, collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { formatGuestSlug } from './guestPortalSlug';
import { pasteGemsToListing, stripGemForCopy } from './propertyGemCopy';

const LISTING_DOC_OMIT_KEYS = new Set([
  'id',
  'createdAt',
  'updatedAt',
  'syncedBookings',
  'previousUrlSlugs',
]);

export type ClonePropertyListingResult = {
  newTypeId: string;
  listingData: Record<string, unknown>;
  gemsCopied: number;
  houseGuideCopied: boolean;
  greenScoreCopied: boolean;
};

function collectExistingSlugs(
  types: Array<{ id: string; urlSlug?: string; typeSlug?: string }>
): Set<string> {
  const slugs = new Set<string>();
  for (const type of types) {
    for (const raw of [type.urlSlug, type.typeSlug]) {
      const slug = formatGuestSlug(String(raw || ''));
      if (slug) slugs.add(slug);
    }
  }
  return slugs;
}

export function buildClonedListingName(sourceName: string): string {
  const trimmed = String(sourceName || '').trim() || 'Listing';
  if (/\(\s*copy\s*\)$/i.test(trimmed)) return `${trimmed} 2`;
  return `${trimmed} (Copy)`;
}

export function buildUniqueCloneSlug(baseSlug: string, existingSlugs: Set<string>): string {
  const base = formatGuestSlug(baseSlug) || 'listing';
  let candidate = `${base}-copy`;
  let n = 2;
  while (existingSlugs.has(candidate)) {
    candidate = `${base}-copy-${n}`;
    n += 1;
  }
  return candidate;
}

export function buildClonedListingPayload(
  source: Record<string, unknown>,
  existingTypes: Array<{ id: string; urlSlug?: string; typeSlug?: string }>
): Record<string, unknown> {
  const existingSlugs = collectExistingSlugs(existingTypes);
  const payload: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(source)) {
    if (LISTING_DOC_OMIT_KEYS.has(key)) continue;
    payload[key] = value;
  }

  const sourceSlug = formatGuestSlug(String(source.urlSlug || source.typeSlug || ''));
  const newSlug = buildUniqueCloneSlug(sourceSlug, existingSlugs);

  payload.propertyTypeName = buildClonedListingName(String(source.propertyTypeName || ''));
  payload.urlSlug = newSlug;
  payload.typeSlug = newSlug;
  payload.internalRefCode = `TYP-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  payload.previousUrlSlugs = [];
  payload.syncedBookings = [];
  payload.createdAt = new Date().toISOString();

  return payload;
}

export async function clonePropertyListing(params: {
  propertyId: string;
  sourceTypeId: string;
  sourceData: Record<string, unknown>;
  existingTypes: Array<{ id: string; urlSlug?: string; typeSlug?: string }>;
  propertyName?: string;
}): Promise<ClonePropertyListingResult> {
  const payload = buildClonedListingPayload(params.sourceData, params.existingTypes);

  const newRef = await addDoc(
    collection(db, 'properties', params.propertyId, 'propertyTypes'),
    payload
  );

  const gemsSnap = await getDocs(
    collection(
      db,
      'properties',
      params.propertyId,
      'propertyTypes',
      params.sourceTypeId,
      'localGems'
    )
  );
  const gems = gemsSnap.docs.map((d) => stripGemForCopy(d.data()));

  let gemsCopied = 0;
  if (gems.length > 0) {
    const result = await pasteGemsToListing({
      gems,
      propertyId: params.propertyId,
      typeId: newRef.id,
      propertyName: params.propertyName || '',
      listingLabel: String(payload.propertyTypeName || ''),
      targetType: {
        latitude: payload.latitude as string | number | undefined,
        longitude: payload.longitude as string | number | undefined,
        country: payload.country as string | undefined,
        city: payload.city as string | undefined,
      },
    });
    gemsCopied = result.pasted;
  }

  let houseGuideCopied = false;
  const sourceGuideRef = doc(
    db,
    'properties',
    params.propertyId,
    'propertyTypes',
    params.sourceTypeId,
    'houseGuide',
    'data'
  );
  const guideSnap = await getDoc(sourceGuideRef);
  if (guideSnap.exists()) {
    await setDoc(
      doc(
        db,
        'properties',
        params.propertyId,
        'propertyTypes',
        newRef.id,
        'houseGuide',
        'data'
      ),
      guideSnap.data()
    );
    houseGuideCopied = true;
  }

  let greenScoreCopied = false;
  const sourceGreenRef = doc(
    db,
    'properties',
    params.propertyId,
    'propertyTypes',
    params.sourceTypeId,
    'greenScore',
    'data'
  );
  const greenSnap = await getDoc(sourceGreenRef);
  if (greenSnap.exists()) {
    await setDoc(
      doc(
        db,
        'properties',
        params.propertyId,
        'propertyTypes',
        newRef.id,
        'greenScore',
        'data'
      ),
      greenSnap.data()
    );
    greenScoreCopied = true;
  }

  return {
    newTypeId: newRef.id,
    listingData: payload,
    gemsCopied,
    houseGuideCopied,
    greenScoreCopied,
  };
}
