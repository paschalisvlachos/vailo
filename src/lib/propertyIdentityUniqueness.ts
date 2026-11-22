import { collection, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import { formatGuestSlug, getPropertySlugAliases } from './guestPortalSlug';

export type PropertyIdentityIndex = {
  /** Normalized slug → property id that owns it (current or previous). */
  slugOwners: Map<string, string>;
  /** Normalized internal ref → property id. */
  refOwners: Map<string, string>;
};

function normalizeInternalRef(code: string | null | undefined): string {
  return String(code || '')
    .trim()
    .toUpperCase();
}

/** Load all property slugs (incl. previous) and internal ref codes. */
export async function loadPropertyIdentityIndex(): Promise<PropertyIdentityIndex> {
  const snap = await getDocs(collection(db, 'properties'));
  const slugOwners = new Map<string, string>();
  const refOwners = new Map<string, string>();

  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    for (const slug of getPropertySlugAliases({
      urlSlug: data.urlSlug,
      previousUrlSlugs: data.previousUrlSlugs,
    })) {
      if (!slugOwners.has(slug)) slugOwners.set(slug, docSnap.id);
    }
    const ref = normalizeInternalRef(data.internalRefCode);
    if (ref && !refOwners.has(ref)) refOwners.set(ref, docSnap.id);
  }

  return { slugOwners, refOwners };
}

function isTakenByOther(
  owners: Map<string, string>,
  value: string,
  excludePropertyId?: string | null
): boolean {
  const ownerId = owners.get(value);
  if (!ownerId) return false;
  if (excludePropertyId && ownerId === excludePropertyId) return false;
  return true;
}

/**
 * Returns a unique guest slug. If `desired` collides with another property,
 * appends -2, -3, … until free.
 */
export function ensureUniquePropertySlug(
  desired: string,
  index: PropertyIdentityIndex,
  excludePropertyId?: string | null
): { value: string; changed: boolean } {
  const base = formatGuestSlug(desired) || 'property';
  let candidate = base;
  let n = 2;
  while (isTakenByOther(index.slugOwners, candidate, excludePropertyId)) {
    candidate = `${base}-${n}`;
    n += 1;
  }
  return { value: candidate, changed: candidate !== base };
}

/**
 * Returns a unique internal reference code. If `desired` collides with another
 * property, appends -2, -3, … until free.
 */
export function ensureUniqueInternalRefCode(
  desired: string,
  index: PropertyIdentityIndex,
  excludePropertyId?: string | null
): { value: string; changed: boolean } {
  const raw = String(desired || '').trim();
  const base = normalizeInternalRef(raw) || `VLO-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  // Preserve original casing style for display when possible; store uppercase norm for checks.
  const displayBase = raw || base;
  let candidateNorm = base;
  let candidateDisplay = displayBase;
  let n = 2;
  while (isTakenByOther(index.refOwners, candidateNorm, excludePropertyId)) {
    candidateNorm = `${base}-${n}`;
    candidateDisplay = `${displayBase}-${n}`;
    n += 1;
  }
  return {
    value: candidateDisplay,
    changed: candidateNorm !== base,
  };
}

export function generateInternalRefCode(): string {
  return `VLO-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
}
