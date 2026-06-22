import type { OwnerProfile } from './adminAccess';
import { isAgent, isPlatformAdmin, normalizeOwnerRole } from './adminAccess';

export type OwnerCrmRow = {
  id: string;
  role?: string;
  agentId?: string;
  fullName?: string;
  company?: string;
  email?: string;
  status?: string;
};

/** Owners an agent created and may assign to listings. */
export function ownersManagedByAgent(
  owners: OwnerCrmRow[],
  agentProfileId: string
): OwnerCrmRow[] {
  return owners.filter(
    (o) => o.agentId === agentProfileId && normalizeOwnerRole(o.role) === 'owner'
  );
}

export function canAgentManageOwnerRecord(
  agentProfileId: string,
  ownerData: { agentId?: string; role?: string } | null | undefined
): boolean {
  if (!ownerData) return false;
  return (
    ownerData.agentId === agentProfileId && normalizeOwnerRole(ownerData.role) === 'owner'
  );
}

export function ownersForAllocatedOwnerPicker(
  profile: OwnerProfile | null,
  owners: OwnerCrmRow[]
): OwnerCrmRow[] {
  if (!profile) return [];
  if (isPlatformAdmin(profile)) {
    return owners.filter((o) => normalizeOwnerRole(o.role) === 'owner');
  }
  if (isAgent(profile)) {
    return ownersManagedByAgent(owners, profile.id);
  }
  return [];
}

export function ownersVisibleInCrm(
  profile: OwnerProfile | null,
  owners: OwnerCrmRow[]
): OwnerCrmRow[] {
  if (!profile || isPlatformAdmin(profile)) return owners;
  if (isAgent(profile)) return ownersManagedByAgent(owners, profile.id);
  return [];
}

export function isAllocatedOwnerIdAllowed(
  profile: OwnerProfile | null,
  ownerId: string,
  owners: OwnerCrmRow[]
): boolean {
  if (!ownerId) return true;
  if (!profile || isPlatformAdmin(profile)) return true;
  if (isAgent(profile)) {
    return ownersManagedByAgent(owners, profile.id).some((o) => o.id === ownerId);
  }
  return false;
}
