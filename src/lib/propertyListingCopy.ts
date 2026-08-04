import {
  createListingFromCapturedContent,
  fetchListingSubcollections,
  stripListingForCopy,
  type ClonePropertyListingResult,
} from './clonePropertyListing';

export const COPIED_LISTING_STORAGE_KEY = 'vailo_copied_property_listing';

export type CopiedPropertyListing = {
  listingData: Record<string, unknown>;
  gems: Record<string, unknown>[];
  features: Record<string, unknown>[];
  houseGuide: Record<string, unknown> | null;
  greenScore: Record<string, unknown> | null;
  sourcePropertyId: string;
  sourceTypeId: string;
  sourcePropertyName?: string;
  sourceListingName?: string;
  copiedAt: string;
};

export function readCopiedListing(): CopiedPropertyListing | null {
  try {
    const raw = sessionStorage.getItem(COPIED_LISTING_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CopiedPropertyListing;
    if (!parsed.listingData || typeof parsed.listingData !== 'object') return null;
    if (!parsed.sourcePropertyId || !parsed.sourceTypeId) return null;
    if (!Array.isArray(parsed.gems)) return null;
    if (!Array.isArray(parsed.features)) parsed.features = [];
    return parsed;
  } catch {
    return null;
  }
}

export function writeCopiedListing(payload: CopiedPropertyListing): void {
  sessionStorage.setItem(COPIED_LISTING_STORAGE_KEY, JSON.stringify(payload));
}

export function clearCopiedListing(): void {
  sessionStorage.removeItem(COPIED_LISTING_STORAGE_KEY);
}

export async function capturePropertyListingForCopy(params: {
  propertyId: string;
  typeId: string;
  typeData: Record<string, unknown>;
  propertyName?: string;
}): Promise<CopiedPropertyListing> {
  const { gems, features, houseGuide, greenScore } = await fetchListingSubcollections(
    params.propertyId,
    params.typeId
  );

  const clip: CopiedPropertyListing = {
    listingData: stripListingForCopy(params.typeData),
    gems,
    features,
    houseGuide,
    greenScore,
    sourcePropertyId: params.propertyId,
    sourceTypeId: params.typeId,
    sourcePropertyName: params.propertyName,
    sourceListingName: String(params.typeData.propertyTypeName || '').trim() || undefined,
    copiedAt: new Date().toISOString(),
  };

  writeCopiedListing(clip);
  return clip;
}

export async function pasteCopiedPropertyListing(params: {
  propertyId: string;
  clip: CopiedPropertyListing;
  existingTypes: Array<{ id: string; urlSlug?: string; typeSlug?: string }>;
  propertyName?: string;
}): Promise<ClonePropertyListingResult> {
  return createListingFromCapturedContent({
    propertyId: params.propertyId,
    sourceListingData: params.clip.listingData,
    existingTypes: params.existingTypes,
    gems: params.clip.gems,
    features: params.clip.features,
    houseGuide: params.clip.houseGuide,
    greenScore: params.clip.greenScore,
    propertyName: params.propertyName,
  });
}

export function copiedListingSummary(clip: CopiedPropertyListing): string {
  const name = clip.sourceListingName || 'Listing';
  const property = clip.sourcePropertyName ? ` from ${clip.sourcePropertyName}` : '';
  const parts = [name + property];
  if (clip.gems.length > 0) parts.push(`${clip.gems.length} gem${clip.gems.length === 1 ? '' : 's'}`);
  if (clip.features.length > 0) parts.push(`${clip.features.length} feature${clip.features.length === 1 ? '' : 's'}`);
  if (clip.houseGuide) parts.push('house guide');
  if (clip.greenScore) parts.push('green score');
  return parts.join(' · ');
}
