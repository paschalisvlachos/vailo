import { addDoc, collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { formatGuestSlug } from './guestPortalSlug';
import { pasteGemsToListing, stripGemForCopy } from './propertyGemCopy';
import { pasteFeaturesToListing, stripFeatureForCopy } from './propertyFeatureCopy';

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
  featuresCopied: number;
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

export function stripListingForCopy(source: Record<string, unknown>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (LISTING_DOC_OMIT_KEYS.has(key)) continue;
    payload[key] = value;
  }
  return payload;
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
  const payload = stripListingForCopy(source);

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

export async function fetchListingSubcollections(
  propertyId: string,
  typeId: string
): Promise<{
  gems: Record<string, unknown>[];
  features: Record<string, unknown>[];
  houseGuide: Record<string, unknown> | null;
  greenScore: Record<string, unknown> | null;
}> {
  const gemsSnap = await getDocs(
    collection(db, 'properties', propertyId, 'propertyTypes', typeId, 'localGems')
  );
  const gems = gemsSnap.docs.map((d) => stripGemForCopy(d.data()));

  const featuresSnap = await getDocs(
    collection(db, 'properties', propertyId, 'propertyTypes', typeId, 'features')
  );
  const features = featuresSnap.docs.map((d) => stripFeatureForCopy(d.data()));

  const guideSnap = await getDoc(
    doc(db, 'properties', propertyId, 'propertyTypes', typeId, 'houseGuide', 'data')
  );
  const greenSnap = await getDoc(
    doc(db, 'properties', propertyId, 'propertyTypes', typeId, 'greenScore', 'data')
  );

  return {
    gems,
    features,
    houseGuide: guideSnap.exists() ? (guideSnap.data() as Record<string, unknown>) : null,
    greenScore: greenSnap.exists() ? (greenSnap.data() as Record<string, unknown>) : null,
  };
}

export async function createListingFromCapturedContent(params: {
  propertyId: string;
  sourceListingData: Record<string, unknown>;
  existingTypes: Array<{ id: string; urlSlug?: string; typeSlug?: string }>;
  gems: Record<string, unknown>[];
  features: Record<string, unknown>[];
  houseGuide: Record<string, unknown> | null;
  greenScore: Record<string, unknown> | null;
  propertyName?: string;
}): Promise<ClonePropertyListingResult> {
  const payload = buildClonedListingPayload(params.sourceListingData, params.existingTypes);

  const newRef = await addDoc(
    collection(db, 'properties', params.propertyId, 'propertyTypes'),
    payload
  );

  let gemsCopied = 0;
  if (params.gems.length > 0) {
    const result = await pasteGemsToListing({
      gems: params.gems,
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

  let featuresCopied = 0;
  if (params.features.length > 0) {
    const result = await pasteFeaturesToListing({
      features: params.features,
      propertyId: params.propertyId,
      typeId: newRef.id,
    });
    featuresCopied = result.pasted;
  }

  let houseGuideCopied = false;
  if (params.houseGuide) {
    await setDoc(
      doc(db, 'properties', params.propertyId, 'propertyTypes', newRef.id, 'houseGuide', 'data'),
      params.houseGuide
    );
    houseGuideCopied = true;
  }

  let greenScoreCopied = false;
  if (params.greenScore) {
    await setDoc(
      doc(db, 'properties', params.propertyId, 'propertyTypes', newRef.id, 'greenScore', 'data'),
      params.greenScore
    );
    greenScoreCopied = true;
  }

  return {
    newTypeId: newRef.id,
    listingData: payload,
    gemsCopied,
    featuresCopied,
    houseGuideCopied,
    greenScoreCopied,
  };
}

export async function clonePropertyListing(params: {
  propertyId: string;
  sourceTypeId: string;
  sourceData: Record<string, unknown>;
  existingTypes: Array<{ id: string; urlSlug?: string; typeSlug?: string }>;
  propertyName?: string;
}): Promise<ClonePropertyListingResult> {
  const { gems, features, houseGuide, greenScore } = await fetchListingSubcollections(
    params.propertyId,
    params.sourceTypeId
  );

  return createListingFromCapturedContent({
    propertyId: params.propertyId,
    sourceListingData: params.sourceData,
    existingTypes: params.existingTypes,
    gems,
    features,
    houseGuide,
    greenScore,
    propertyName: params.propertyName,
  });
}
