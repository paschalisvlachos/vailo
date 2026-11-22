import { collectionGroup, getDocs, type Firestore } from 'firebase/firestore';

/** Stored on owners.maxListings when capacity is unlimited. */
export const UNLIMITED_LISTINGS = -1;

export function isUnlimitedListings(value: unknown): boolean {
  if (value === UNLIMITED_LISTINGS) return true;
  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase();
    return trimmed === 'unlimited' || trimmed === '-1';
  }
  return false;
}

/**
 * Parse the owner CRM field for how many listings they may manage.
 * Returns -1 for unlimited, a non-negative integer for a cap, or null if unset/invalid.
 */
export function parseMaxListings(value: unknown): number | null {
  if (isUnlimitedListings(value)) return UNLIMITED_LISTINGS;
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  }
  return null;
}

/** Display label for CRM / pickers. */
export function formatMaxListingsLabel(value: unknown): string | null {
  const max = parseMaxListings(value);
  if (max == null) return null;
  if (max === UNLIMITED_LISTINGS) return 'Unlimited';
  return String(max);
}

/** True when this CRM role needs a listing capacity. */
export function roleRequiresMaxListings(role: string | undefined): boolean {
  return role === 'owner' || role === 'agent';
}

/** True when CRM capacity has been configured (limited or unlimited). */
export function hasConfiguredListingCapacity(maxListings: unknown): boolean {
  return parseMaxListings(maxListings) != null;
}

export type ListingCapacitySummary = {
  max: number | null;
  unlimited: boolean;
  used: number;
  remaining: number | null;
  canCreate: boolean;
};

/**
 * How many listings count toward this agent/owner's CRM capacity.
 * Agents: all listings under properties assigned to them.
 * Owners: listings allocated to them, plus listings under properties they own.
 */
export function countListingsTowardCapacity(
  profile: { id: string; role: string } | null | undefined,
  properties: { id: string; ownerId?: string }[],
  types: { id: string; propertyId: string; ownerId?: string }[]
): number {
  if (!profile?.id) return 0;
  if (profile.role === 'agent') {
    const managedIds = new Set(
      properties.filter((p) => p.ownerId === profile.id).map((p) => p.id)
    );
    return types.filter((t) => managedIds.has(t.propertyId)).length;
  }
  if (profile.role === 'owner') {
    const managedIds = new Set(
      properties.filter((p) => p.ownerId === profile.id).map((p) => p.id)
    );
    const counted = new Set<string>();
    for (const t of types) {
      if (t.ownerId === profile.id || managedIds.has(t.propertyId)) {
        counted.add(t.id);
      }
    }
    return counted.size;
  }
  return 0;
}

export function summarizeListingCapacity(
  maxListings: unknown,
  used: number
): ListingCapacitySummary {
  const max = parseMaxListings(maxListings);
  if (max == null) {
    return { max: null, unlimited: false, used, remaining: 0, canCreate: false };
  }
  if (max === UNLIMITED_LISTINGS) {
    return { max: UNLIMITED_LISTINGS, unlimited: true, used, remaining: null, canCreate: true };
  }
  const remaining = Math.max(0, max - used);
  return {
    max,
    unlimited: false,
    used,
    remaining,
    canCreate: remaining > 0,
  };
}

/** Message when the signed-in agent/owner cannot create another listing. */
export function creatorListingQuotaMessage(
  profile: { fullName?: string; maxListings?: unknown } | null | undefined,
  used: number
): string | null {
  const summary = summarizeListingCapacity(profile?.maxListings, used);
  if (summary.max == null) {
    return 'Your account has no listing capacity set. Ask your Vailo administrator.';
  }
  if (!summary.canCreate) {
    return `You have used all ${summary.max} listing${summary.max === 1 ? '' : 's'} in your capacity.`;
  }
  return null;
}

/**
 * Count property listings currently allocated to this owner.
 * Optionally exclude a listing id (e.g. the one being edited).
 */
export async function countAllocatedListingsForOwner(
  db: Firestore,
  ownerId: string,
  excludeTypeId?: string | null
): Promise<number> {
  const snap = await getDocs(collectionGroup(db, 'propertyTypes'));
  let count = 0;
  snap.docs.forEach((d) => {
    if (excludeTypeId && d.id === excludeTypeId) return;
    if (d.data().ownerId === ownerId) count += 1;
  });
  return count;
}

/**
 * Whether assigning `ownerId` to a listing would exceed their maxListings quota.
 * Returns null when the assignment is allowed.
 */
export function listingQuotaExceededMessage(
  owner: { fullName?: string; maxListings?: unknown } | null | undefined,
  alreadyAllocated: number
): string | null {
  if (!owner) return null;
  const max = parseMaxListings(owner.maxListings);
  if (max == null) {
    return `${owner.fullName || 'This owner'} has no listing capacity set. Edit them in Owners CRM first.`;
  }
  if (max === UNLIMITED_LISTINGS) return null;
  if (alreadyAllocated >= max) {
    return `${owner.fullName || 'This owner'} already manages ${alreadyAllocated} of ${max} allowed listings.`;
  }
  return null;
}
