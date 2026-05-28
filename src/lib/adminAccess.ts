export type OwnerRole = 'admin' | 'agent' | 'owner';

export type OwnerProfile = {
  id: string;
  fullName: string;
  email: string;
  role: OwnerRole;
  status: string;
  company?: string;
};

export type AdminScope =
  | { kind: 'platform' }
  | {
      kind: 'property';
      propertyId: string;
      propertyName: string;
      label: string;
    }
  | {
      kind: 'listing';
      propertyId: string;
      typeId: string;
      propertyName: string;
      listingName: string;
      label: string;
    };

export type PropertyAccessMode =
  | { level: 'full' }
  | { level: 'listing_only'; typeIds: string[] };

const ACTIVE_SCOPE_KEY = 'vailo_admin_active_scope';

export function normalizeAdminEmail(email: string | null | undefined): string {
  return String(email || '').trim().toLowerCase();
}

export function isPlatformAdmin(profile: OwnerProfile | null): boolean {
  if (!profile) return true;
  return profile.role === 'admin';
}

export function isScopedUser(profile: OwnerProfile | null): boolean {
  if (!profile) return false;
  return profile.role === 'agent' || profile.role === 'owner';
}

type PropertyRow = { id: string; propertyName?: string; ownerId?: string };
type TypeRow = {
  id: string;
  propertyId: string;
  propertyTypeName?: string;
  ownerId?: string;
};

export function buildAdminScopes(
  profile: OwnerProfile | null,
  properties: PropertyRow[],
  types: TypeRow[]
): AdminScope[] {
  if (!profile || isPlatformAdmin(profile)) {
    return [{ kind: 'platform' }];
  }

  if (profile.status?.toLowerCase() === 'deactive') {
    return [];
  }

  const managedPropertyIds = new Set(
    properties.filter((p) => p.ownerId === profile.id).map((p) => p.id)
  );

  const scopes: AdminScope[] = [];

  for (const propertyId of managedPropertyIds) {
    const property = properties.find((p) => p.id === propertyId);
    const name = property?.propertyName?.trim() || 'Property';
    scopes.push({
      kind: 'property',
      propertyId,
      propertyName: name,
      label: `${name} (all listings)`,
    });
  }

  for (const type of types) {
    if (type.ownerId !== profile.id) continue;
    if (managedPropertyIds.has(type.propertyId)) continue;

    const property = properties.find((p) => p.id === type.propertyId);
    const propertyName = property?.propertyName?.trim() || 'Property';
    const listingName = type.propertyTypeName?.trim() || 'Listing';
    scopes.push({
      kind: 'listing',
      propertyId: type.propertyId,
      typeId: type.id,
      propertyName,
      listingName,
      label: `${propertyName} · ${listingName}`,
    });
  }

  return scopes;
}

/** Best admin entry path for a property the user can access. */
export function pathForPropertyLanding(
  propertyId: string,
  scopes: AdminScope[]
): string {
  const propertyScope = scopes.find(
    (s) => s.kind === 'property' && s.propertyId === propertyId
  );
  if (propertyScope) return pathForScope(propertyScope);

  const listingScope = scopes.find(
    (s) => s.kind === 'listing' && s.propertyId === propertyId
  );
  if (listingScope) return pathForScope(listingScope);

  return `/properties/${propertyId}`;
}

export function scopeKey(scope: AdminScope): string {
  if (scope.kind === 'platform') return 'platform';
  if (scope.kind === 'property') return `property:${scope.propertyId}`;
  return `listing:${scope.propertyId}:${scope.typeId}`;
}

export function readStoredScopeKey(): string | null {
  try {
    return localStorage.getItem(ACTIVE_SCOPE_KEY);
  } catch {
    return null;
  }
}

export function writeStoredScopeKey(key: string): void {
  try {
    localStorage.setItem(ACTIVE_SCOPE_KEY, key);
  } catch {
    /* ignore */
  }
}

export function resolveActiveScope(
  scopes: AdminScope[],
  preferredKey?: string | null
): AdminScope | null {
  if (scopes.length === 0) return null;
  if (scopes[0].kind === 'platform') return scopes[0];

  const stored = preferredKey ?? readStoredScopeKey();
  if (stored) {
    const match = scopes.find((s) => scopeKey(s) === stored);
    if (match) return match;
  }

  return scopes[0];
}

export function pathForScope(scope: AdminScope): string {
  if (scope.kind === 'platform') return '/properties';
  if (scope.kind === 'property') return `/properties/${scope.propertyId}`;
  return `/properties/${scope.propertyId}/types?listing=${scope.typeId}`;
}

/** Match current route to an assignment scope (for scoped users). */
export function scopeFromRoute(
  pathname: string,
  search: string,
  scopes: AdminScope[]
): AdminScope | null {
  const propertyMatch = pathname.match(/^\/properties\/([^/]+)/);
  if (!propertyMatch) return null;

  const propertyId = propertyMatch[1];
  const listing = new URLSearchParams(search).get('listing');

  if (listing) {
    const listingScope = scopes.find(
      (s) =>
        s.kind === 'listing' &&
        s.propertyId === propertyId &&
        s.typeId === listing
    );
    if (listingScope) return listingScope;
  }

  const propertyScope = scopes.find(
    (s) => s.kind === 'property' && s.propertyId === propertyId
  );
  if (propertyScope) return propertyScope;

  return null;
}

export function getPropertyAccessMode(
  profile: OwnerProfile | null,
  propertyId: string,
  propertyOwnerId: string | undefined,
  types: TypeRow[]
): PropertyAccessMode | null {
  if (!profile || isPlatformAdmin(profile)) {
    return { level: 'full' };
  }

  if (propertyOwnerId === profile.id) {
    return { level: 'full' };
  }

  const assignedTypes = types.filter(
    (t) => t.propertyId === propertyId && t.ownerId === profile.id
  );
  if (assignedTypes.length === 0) return null;

  return {
    level: 'listing_only',
    typeIds: assignedTypes.map((t) => t.id),
  };
}

export function canAccessPropertyId(
  profile: OwnerProfile | null,
  propertyId: string,
  scopes: AdminScope[]
): boolean {
  if (!profile || isPlatformAdmin(profile)) return true;
  return scopes.some(
    (s) =>
      (s.kind === 'property' && s.propertyId === propertyId) ||
      (s.kind === 'listing' && s.propertyId === propertyId)
  );
}

export const LISTING_ONLY_TAB_PATHS = new Set(['types', 'house-guide']);

export function isTabAllowedForAccess(
  tabPath: string,
  access: PropertyAccessMode | null
): boolean {
  if (!access || access.level === 'full') return true;
  return LISTING_ONLY_TAB_PATHS.has(tabPath);
}
