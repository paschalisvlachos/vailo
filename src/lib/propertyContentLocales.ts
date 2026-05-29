/**
 * Host-authored content locales: primary language + enabled translations stored in Firestore.
 * Legacy single fields (name, description) are treated as the primary locale.
 */

export type LocaleStringMap = Record<string, string>;

export type PropertyContentLocaleSettings = {
  primaryLocale: string;
  enabledLocales: string[];
  /** Locales hosts have reviewed; guests only see these (+ primary fallback). */
  reviewedLocales: string[];
};

export const DEFAULT_PRIMARY_LOCALE = 'en';

export function normalizeLocaleCode(raw: string | null | undefined): string {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 12);
}

export function parsePropertyContentLocaleSettings(
  data: Record<string, unknown> | null | undefined
): PropertyContentLocaleSettings {
  const primaryLocale = normalizeLocaleCode(
    typeof data?.contentPrimaryLocale === 'string'
      ? data.contentPrimaryLocale
      : DEFAULT_PRIMARY_LOCALE
  ) || DEFAULT_PRIMARY_LOCALE;

  let enabled: string[] = [];
  if (Array.isArray(data?.contentEnabledLocales)) {
    enabled = (data.contentEnabledLocales as unknown[])
      .map((c) => normalizeLocaleCode(String(c)))
      .filter(Boolean);
  }

  const unique = new Set<string>();
  const enabledLocales: string[] = [];
  for (const code of [primaryLocale, ...enabled]) {
    if (!code || unique.has(code)) continue;
    unique.add(code);
    enabledLocales.push(code);
  }

  let reviewed: string[] = [];
  if (Array.isArray(data?.contentReviewedLocales)) {
    reviewed = (data.contentReviewedLocales as unknown[])
      .map((c) => normalizeLocaleCode(String(c)))
      .filter(Boolean);
  }

  const reviewedLocales = [...new Set([primaryLocale, ...reviewed])].filter((c) =>
    enabledLocales.includes(c)
  );

  if (enabledLocales.length === 0) {
    return {
      primaryLocale: DEFAULT_PRIMARY_LOCALE,
      enabledLocales: [DEFAULT_PRIMARY_LOCALE],
      reviewedLocales: [DEFAULT_PRIMARY_LOCALE],
    };
  }

  return { primaryLocale, enabledLocales, reviewedLocales };
}

export function buildDefaultContentLocaleSettings(
  platformCodes: string[] = []
): PropertyContentLocaleSettings {
  const primaryLocale = normalizeLocaleCode(platformCodes[0]) || DEFAULT_PRIMARY_LOCALE;
  const enabledLocales = platformCodes.length > 0 ? [...new Set(platformCodes.map(normalizeLocaleCode).filter(Boolean))] : [primaryLocale];
  if (!enabledLocales.includes(primaryLocale)) enabledLocales.unshift(primaryLocale);
  return { primaryLocale, enabledLocales, reviewedLocales: [...enabledLocales] };
}

/**
 * Restrict property/area content locales to languages still configured in admin Settings.
 * Firestore may still list removed codes until the host saves language settings again.
 */
export function clampContentLocalesToPlatform(
  settings: PropertyContentLocaleSettings,
  platformCodes: string[]
): PropertyContentLocaleSettings {
  const platform = [...new Set(platformCodes.map(normalizeLocaleCode).filter(Boolean))];
  if (platform.length === 0) return settings;

  const platformSet = new Set(platform);
  let primary = normalizeLocaleCode(settings.primaryLocale) || DEFAULT_PRIMARY_LOCALE;
  if (!platformSet.has(primary)) {
    primary = platform[0] || DEFAULT_PRIMARY_LOCALE;
  }

  const enabledLocales: string[] = [];
  const seen = new Set<string>();
  for (const code of [primary, ...settings.enabledLocales]) {
    const c = normalizeLocaleCode(code);
    if (!c || !platformSet.has(c) || seen.has(c)) continue;
    seen.add(c);
    enabledLocales.push(c);
  }
  if (!enabledLocales.includes(primary)) {
    enabledLocales.unshift(primary);
  }

  const reviewedLocales = [...new Set([primary, ...settings.reviewedLocales])].filter((c) =>
    enabledLocales.includes(c)
  );

  return { primaryLocale: primary, enabledLocales, reviewedLocales };
}

/** True when stored locales include codes no longer on the platform list. */
export function hasStaleContentLocales(
  settings: PropertyContentLocaleSettings,
  platformCodes: string[]
): boolean {
  const platform = new Set(platformCodes.map(normalizeLocaleCode).filter(Boolean));
  if (platform.size === 0) return false;
  return settings.enabledLocales.some((c) => !platform.has(normalizeLocaleCode(c)));
}

/** Read a localized string with legacy fallback to top-level `legacyField`. */
export function resolveLocalizedString(
  doc: Record<string, unknown> | null | undefined,
  field: string,
  locale: string,
  primaryLocale: string,
  reviewedLocales?: string[] | null
): string {
  if (!doc) return '';
  const primary = normalizeLocaleCode(primaryLocale) || DEFAULT_PRIMARY_LOCALE;
  let code = normalizeLocaleCode(locale) || primary;

  if (reviewedLocales && reviewedLocales.length > 0) {
    const allowed = new Set(reviewedLocales.map(normalizeLocaleCode));
    if (code !== primary && !allowed.has(code)) code = primary;
  }

  const mapKey = `${field}ByLocale`;
  const map = doc[mapKey];
  if (map && typeof map === 'object' && !Array.isArray(map)) {
    const byLocale = map as LocaleStringMap;
    const direct = (byLocale[code] || '').trim();
    if (direct) return direct;
    const fromPrimary = (byLocale[primary] || '').trim();
    if (fromPrimary) return fromPrimary;
    if (!reviewedLocales?.length) {
      for (const v of Object.values(byLocale)) {
        const t = (v || '').trim();
        if (t) return t;
      }
    }
  }
  const legacy = doc[field];
  return typeof legacy === 'string' ? legacy.trim() : '';
}

/** Same settings parser for area documents (countries/…/areas/{id}). */
export function parseAreaContentLocaleSettings(
  data: Record<string, unknown> | null | undefined
): PropertyContentLocaleSettings {
  return parsePropertyContentLocaleSettings(data);
}

/** Area host content is always authored in English; other locales are translations only. */
export const AREA_CONTENT_PRIMARY_LOCALE = DEFAULT_PRIMARY_LOCALE;

export function resolveAreaContentLocaleSettings(
  data: Record<string, unknown> | PropertyContentLocaleSettings | null | undefined,
  platformCodes: string[]
): PropertyContentLocaleSettings {
  const parsed =
    data && typeof data === 'object' && 'enabledLocales' in data && Array.isArray(data.enabledLocales)
      ? (data as PropertyContentLocaleSettings)
      : parseAreaContentLocaleSettings(data as Record<string, unknown> | null | undefined);

  const clamped = clampContentLocalesToPlatform(parsed, platformCodes);
  const primaryLocale = AREA_CONTENT_PRIMARY_LOCALE;
  const platformSet =
    platformCodes.length > 0
      ? new Set(platformCodes.map(normalizeLocaleCode).filter(Boolean))
      : null;

  const enabledLocales: string[] = [];
  const seen = new Set<string>();
  for (const code of [primaryLocale, ...clamped.enabledLocales]) {
    const c = normalizeLocaleCode(code);
    if (!c || seen.has(c)) continue;
    if (platformSet && c !== primaryLocale && !platformSet.has(c)) continue;
    seen.add(c);
    enabledLocales.push(c);
  }
  if (!enabledLocales.includes(primaryLocale)) {
    enabledLocales.unshift(primaryLocale);
  }

  const reviewedLocales = [...new Set([primaryLocale, ...clamped.reviewedLocales])].filter((c) =>
    enabledLocales.includes(c)
  );

  return { primaryLocale, enabledLocales, reviewedLocales };
}

export function copyPrimaryToEmptyLocales(
  maps: Record<string, LocaleStringMap>,
  fields: string[],
  primaryLocale: string,
  targetLocales: string[]
): Record<string, LocaleStringMap> {
  const primary = normalizeLocaleCode(primaryLocale) || DEFAULT_PRIMARY_LOCALE;
  const next: Record<string, LocaleStringMap> = {};
  for (const field of fields) {
    const map = { ...(maps[field] || {}) };
    const primaryText = (map[primary] || '').trim();
    for (const loc of targetLocales) {
      const code = normalizeLocaleCode(loc);
      if (!code || code === primary || !primaryText) continue;
      if (!(map[code] || '').trim()) map[code] = primaryText;
    }
    next[field] = map;
  }
  return next;
}

export function readLocaleMap(
  doc: Record<string, unknown> | null | undefined,
  field: string
): LocaleStringMap {
  const mapKey = `${field}ByLocale`;
  const map = doc?.[mapKey];
  const out: LocaleStringMap = {};
  if (map && typeof map === 'object' && !Array.isArray(map)) {
    for (const [k, v] of Object.entries(map as Record<string, unknown>)) {
      const code = normalizeLocaleCode(k);
      if (!code || typeof v !== 'string') continue;
      out[code] = v;
    }
    return coalesceLocaleMapKeys(out);
  }
  const legacy = doc?.[field];
  if (typeof legacy === 'string' && legacy.trim()) {
    /* caller must merge primary separately */
  }
  return out;
}

export function mergeLegacyIntoLocaleMap(
  map: LocaleStringMap,
  legacyValue: string | undefined,
  primaryLocale: string
): LocaleStringMap {
  const primary = normalizeLocaleCode(primaryLocale) || DEFAULT_PRIMARY_LOCALE;
  const next = { ...map };
  const legacy = (legacyValue || '').trim();
  if (legacy && !((next[primary] || '').trim())) {
    next[primary] = legacy;
  }
  return next;
}

export function getLocaleFieldValue(
  doc: Record<string, unknown> | null | undefined,
  field: string,
  locale: string,
  primaryLocale: string
): string {
  const primary = normalizeLocaleCode(primaryLocale) || DEFAULT_PRIMARY_LOCALE;
  const code = normalizeLocaleCode(locale) || primary;
  const map = mergeLegacyIntoLocaleMap(
    readLocaleMap(doc, field),
    typeof doc?.[field] === 'string' ? (doc[field] as string) : undefined,
    primary
  );
  return (map[code] || '').trim();
}

export function setLocaleFieldValue(
  map: LocaleStringMap,
  locale: string,
  value: string,
  options?: { trim?: boolean }
): LocaleStringMap {
  const code = normalizeLocaleCode(locale);
  if (!code) return map;
  const next = { ...map };
  const stored = options?.trim === false ? value : value.trim();
  if (stored) next[code] = stored;
  else delete next[code];
  return next;
}

/** Prefer `el` for Greek; import legacy `gr` once, never mirror el↔gr (avoids linked edits/deletes). */
export function coalesceLocaleMapKeys(map: LocaleStringMap): LocaleStringMap {
  const next = { ...map };
  if ((next.el || '').trim()) {
    delete next.gr;
    return next;
  }
  const gr = (next.gr || '').trim();
  if (gr) next.el = gr;
  delete next.gr;
  return next;
}

/** Persist maps + mirror primary onto legacy top-level fields for older readers. */
export function buildLocalizedFirestorePayload(
  fields: string[],
  maps: Record<string, LocaleStringMap>,
  primaryLocale: string,
  legacyValues: Record<string, string>
): Record<string, unknown> {
  const primary = normalizeLocaleCode(primaryLocale) || DEFAULT_PRIMARY_LOCALE;
  const payload: Record<string, unknown> = {};

  for (const field of fields) {
    const map = maps[field] || {};
    const cleaned: LocaleStringMap = {};
    for (const [k, v] of Object.entries(map)) {
      const code = normalizeLocaleCode(k);
      const t = (v || '').trim();
      if (code && t) cleaned[code] = t;
    }
    if (Object.keys(cleaned).length > 0) {
      payload[`${field}ByLocale`] = cleaned;
    }
    const primaryText = (cleaned[primary] || legacyValues[field] || '').trim();
    if (primaryText) payload[field] = primaryText;
  }

  return payload;
}

export function resolveFeaturedDigest(
  record: { digest?: string; digestByLocale?: LocaleStringMap } | undefined,
  locale: string,
  primaryLocale: string,
  reviewedLocales?: string[] | null
): string {
  if (!record) return '';
  const primary = normalizeLocaleCode(primaryLocale) || DEFAULT_PRIMARY_LOCALE;
  let code = normalizeLocaleCode(locale) || primary;
  if (reviewedLocales && reviewedLocales.length > 0) {
    const allowed = new Set(reviewedLocales.map(normalizeLocaleCode));
    if (code !== primary && !allowed.has(code)) code = primary;
  }
  const byLocale = record.digestByLocale;
  if (byLocale && typeof byLocale === 'object') {
    const direct = (byLocale[code] || '').trim();
    if (direct) return direct;
    const fromPrimary = (byLocale[primary] || '').trim();
    if (fromPrimary) return fromPrimary;
  }
  return (record.digest || '').trim();
}

export function resolveFeaturedPreviewLine(
  record:
    | {
        previewLine?: string;
        previewLineByLocale?: LocaleStringMap;
        customPreviewLine?: string;
      }
    | undefined,
  locale: string,
  primaryLocale: string,
  reviewedLocales?: string[] | null
): string {
  if (!record) return '';
  const primary = normalizeLocaleCode(primaryLocale) || DEFAULT_PRIMARY_LOCALE;
  let code = normalizeLocaleCode(locale) || primary;
  if (reviewedLocales && reviewedLocales.length > 0) {
    const allowed = new Set(reviewedLocales.map(normalizeLocaleCode));
    if (code !== primary && !allowed.has(code)) code = primary;
  }
  if (code === primary && (record.customPreviewLine || '').trim()) {
    return record.customPreviewLine!.trim();
  }
  const byLocale = record.previewLineByLocale;
  if (byLocale && typeof byLocale === 'object') {
    const direct = (byLocale[code] || '').trim();
    if (direct) return direct;
    const fromPrimary = (byLocale[primary] || '').trim();
    if (fromPrimary) return fromPrimary;
  }
  return (record.previewLine || '').trim();
}

export function filterLocaleOptions<T extends { code: string }>(
  options: T[],
  enabledLocales: string[] | undefined
): T[] {
  if (!enabledLocales || enabledLocales.length === 0) return options;
  const allowed = new Set(enabledLocales.map(normalizeLocaleCode));
  const filtered = options.filter((o) => allowed.has(normalizeLocaleCode(o.code)));
  return filtered.length > 0 ? filtered : options;
}
