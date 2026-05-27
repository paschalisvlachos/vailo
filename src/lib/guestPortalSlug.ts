/** Normalize URL path segments for guest portal matching. */
export function formatGuestSlug(text: string | null | undefined): string {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function slugFromPropertyTypeName(name: string | null | undefined): string {
  return formatGuestSlug(name);
}

/** Canonical public slug for a property type document. */
export function getTypePublicSlug(typeData: {
  urlSlug?: string | null;
  typeSlug?: string | null;
  propertyTypeName?: string | null;
}): string {
  const explicit = formatGuestSlug(typeData.urlSlug || typeData.typeSlug);
  if (explicit) return explicit;
  return slugFromPropertyTypeName(typeData.propertyTypeName);
}

/** All slugs that should resolve to this property type (current + legacy). */
export function getTypeSlugAliases(typeData: {
  urlSlug?: string | null;
  typeSlug?: string | null;
  propertyTypeName?: string | null;
  previousUrlSlugs?: string[] | null;
}): string[] {
  const aliases = new Set<string>();
  const current = getTypePublicSlug(typeData);
  if (current) aliases.add(current);

  const prev = typeData.previousUrlSlugs;
  if (Array.isArray(prev)) {
    for (const s of prev) {
      const n = formatGuestSlug(s);
      if (n) aliases.add(n);
    }
  }

  const legacyName = slugFromPropertyTypeName(typeData.propertyTypeName);
  if (legacyName) aliases.add(legacyName);

  return [...aliases];
}

export function typeSlugMatches(
  urlSegment: string,
  typeData: {
    urlSlug?: string | null;
    typeSlug?: string | null;
    propertyTypeName?: string | null;
    previousUrlSlugs?: string[] | null;
  }
): boolean {
  const param = formatGuestSlug(urlSegment);
  if (!param) return false;
  return getTypeSlugAliases(typeData).includes(param);
}

export function getPropertySlugAliases(propertyData: {
  urlSlug?: string | null;
  previousUrlSlugs?: string[] | null;
}): string[] {
  const aliases = new Set<string>();
  const current = formatGuestSlug(propertyData.urlSlug);
  if (current) aliases.add(current);
  if (Array.isArray(propertyData.previousUrlSlugs)) {
    for (const s of propertyData.previousUrlSlugs) {
      const n = formatGuestSlug(s);
      if (n) aliases.add(n);
    }
  }
  return [...aliases];
}

export function propertySlugMatches(
  urlSegment: string,
  propertyData: { urlSlug?: string | null; previousUrlSlugs?: string[] | null }
): boolean {
  const param = formatGuestSlug(urlSegment);
  if (!param) return false;
  return getPropertySlugAliases(propertyData).includes(param);
}

/** Merge prior slug into history when the canonical slug changes. */
type TypeDoc = {
  id: string;
  data: () => {
    urlSlug?: string | null;
    typeSlug?: string | null;
    propertyTypeName?: string | null;
    previousUrlSlugs?: string[] | null;
  };
};

/** Pick the property type for a guest URL; exact urlSlug/typeSlug wins over name-based aliases. */
export function resolvePropertyTypeFromUrl(
  typeDocs: TypeDoc[],
  urlSegment: string,
  preferredTypeId?: string | null
): { id: string; data: ReturnType<TypeDoc['data']> } | null {
  const typeId = String(preferredTypeId || '').trim();
  if (typeId) {
    const byId = typeDocs.find((d) => d.id === typeId);
    if (byId) return { id: byId.id, data: byId.data() };
  }

  const param = formatGuestSlug(urlSegment);
  if (!param) return null;

  let legacyMatch: { id: string; data: ReturnType<TypeDoc['data']> } | null = null;

  for (const docSnap of typeDocs) {
    const data = docSnap.data();
    const explicit = formatGuestSlug(data.urlSlug || data.typeSlug);
    if (explicit && explicit === param) {
      return { id: docSnap.id, data };
    }
    if (!legacyMatch && getTypeSlugAliases(data).includes(param)) {
      legacyMatch = { id: docSnap.id, data };
    }
  }

  return legacyMatch;
}

/** Public guest portal URL: /{propertySlug}/{unitSlug}?typeId=… */
export function buildGuestPortalUrl(
  origin: string,
  property: { urlSlug?: string | null },
  typeData: {
    id?: string;
    urlSlug?: string | null;
    typeSlug?: string | null;
    propertyTypeName?: string | null;
  }
): string | null {
  const propSlug = formatGuestSlug(property.urlSlug);
  const unitSlug = getTypePublicSlug(typeData);
  if (!propSlug || !unitSlug) return null;
  const base = origin.replace(/\/$/, '');
  const qs = typeData.id ? `?typeId=${encodeURIComponent(typeData.id)}` : '';
  return `${base}/${propSlug}/${unitSlug}${qs}`;
}

export function mergePreviousSlugs(
  existing: string[] | null | undefined,
  oldSlug: string | null | undefined,
  newSlug: string | null | undefined
): string[] {
  const set = new Set<string>();
  if (Array.isArray(existing)) {
    for (const s of existing) {
      const n = formatGuestSlug(s);
      if (n) set.add(n);
    }
  }
  const oldNorm = formatGuestSlug(oldSlug);
  const newNorm = formatGuestSlug(newSlug);
  if (oldNorm && newNorm && oldNorm !== newNorm) {
    set.add(oldNorm);
  }
  if (newNorm) set.delete(newNorm);
  return [...set];
}
