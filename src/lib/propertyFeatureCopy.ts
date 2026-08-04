import { addDoc, collection, getDocs } from 'firebase/firestore';
import { db } from './firebase';

export const COPIED_FEATURES_STORAGE_KEY = 'vailo_copied_property_features';

export type CopiedPropertyFeatures = {
  features: Record<string, unknown>[];
  sourcePropertyId: string;
  sourceTypeId: string;
  sourcePropertyName?: string;
  sourceListingName?: string;
  copiedAt: string;
};

export type FeaturePasteResult = {
  pasted: number;
  skipped: number;
  targets: number;
};

const STRIP_FIELDS = new Set(['id', 'createdAt', 'updatedAt', 'migratedFromPropertyLevel']);

export function readCopiedFeatures(): CopiedPropertyFeatures | null {
  try {
    const raw = sessionStorage.getItem(COPIED_FEATURES_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CopiedPropertyFeatures;
    if (!Array.isArray(parsed.features) || parsed.features.length === 0) return null;
    if (!parsed.sourcePropertyId || !parsed.sourceTypeId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeCopiedFeatures(payload: CopiedPropertyFeatures): void {
  sessionStorage.setItem(COPIED_FEATURES_STORAGE_KEY, JSON.stringify(payload));
}

export function clearCopiedFeatures(): void {
  sessionStorage.removeItem(COPIED_FEATURES_STORAGE_KEY);
}

export function stripFeatureForCopy(feature: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(feature)) {
    if (STRIP_FIELDS.has(key)) continue;
    out[key] = value;
  }
  return out;
}

export function featurePrimaryName(feature: Record<string, unknown>): string {
  return String(feature.name || '').trim().toLowerCase();
}

export function featureExistsInListing(
  feature: Record<string, unknown>,
  existingFeatures: Record<string, unknown>[]
): boolean {
  const name = featurePrimaryName(feature);
  if (!name) return false;
  return existingFeatures.some((existing) => featurePrimaryName(existing) === name);
}

export async function pasteFeaturesToListing(params: {
  features: Record<string, unknown>[];
  propertyId: string;
  typeId: string;
}): Promise<{ pasted: number; skipped: number }> {
  const featuresSnap = await getDocs(
    collection(db, 'properties', params.propertyId, 'propertyTypes', params.typeId, 'features')
  );
  const existingFeatures = featuresSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  let pasted = 0;
  let skipped = 0;
  const now = new Date().toISOString();

  for (const feature of params.features) {
    if (featureExistsInListing(feature, existingFeatures)) {
      skipped += 1;
      continue;
    }

    const payload = {
      ...stripFeatureForCopy(feature),
      createdAt: now,
      updatedAt: now,
    };

    const featureRef = await addDoc(
      collection(
        db,
        'properties',
        params.propertyId,
        'propertyTypes',
        params.typeId,
        'features'
      ),
      payload
    );

    existingFeatures.push({ id: featureRef.id, ...payload });
    pasted += 1;
  }

  return { pasted, skipped };
}

export async function pasteFeaturesToTargets(params: {
  features: Record<string, unknown>[];
  targets: Array<{
    propertyId: string;
    typeId: string;
  }>;
}): Promise<FeaturePasteResult> {
  let pasted = 0;
  let skipped = 0;

  for (const target of params.targets) {
    const result = await pasteFeaturesToListing({
      features: params.features,
      propertyId: target.propertyId,
      typeId: target.typeId,
    });
    pasted += result.pasted;
    skipped += result.skipped;
  }

  return { pasted, skipped, targets: params.targets.length };
}

export function copiedFeaturesSummary(clip: CopiedPropertyFeatures): string {
  const names = clip.features
    .slice(0, 3)
    .map((f) => String(f.name || '').trim())
    .filter(Boolean);
  const suffix = clip.features.length > 3 ? ` and ${clip.features.length - 3} more` : '';
  return names.length > 0 ? `${names.join(', ')}${suffix}` : `${clip.features.length} features`;
}
