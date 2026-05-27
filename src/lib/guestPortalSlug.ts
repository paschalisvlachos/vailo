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
