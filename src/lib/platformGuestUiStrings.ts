import { normalizeLocaleCode } from './propertyContentLocales';
import { buildBuiltinGuestStringsForLocale } from './guestUiBuiltinDefaults';
import type { GuestUiStringKey } from './guestUiStringCatalog';

export type PlatformGuestUiStringsByLocale = Record<string, Record<string, string>>;

let runtimeOverrides: PlatformGuestUiStringsByLocale = {};

/** Updated by GuestLocaleProvider when platform settings load. */
export function setPlatformGuestUiStringsCache(overrides: PlatformGuestUiStringsByLocale) {
  runtimeOverrides = overrides;
}

export function parsePlatformGuestUiStrings(
  data: Record<string, unknown> | undefined
): PlatformGuestUiStringsByLocale {
  const raw = data?.guestUiStrings;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};

  const out: PlatformGuestUiStringsByLocale = {};
  for (const [locale, map] of Object.entries(raw as Record<string, unknown>)) {
    const code = normalizeLocaleCode(locale);
    if (!code || !map || typeof map !== 'object' || Array.isArray(map)) continue;
    const strings: Record<string, string> = {};
    for (const [key, value] of Object.entries(map as Record<string, unknown>)) {
      if (typeof value === 'string' && value.trim()) strings[key] = value.trim();
    }
    if (Object.keys(strings).length > 0) out[code] = strings;
  }
  return out;
}

export function mergeGuestStringsForLocale(
  locale: string,
  overrides: PlatformGuestUiStringsByLocale
): Record<string, string> {
  const code = normalizeLocaleCode(locale) || 'en';
  return { ...buildBuiltinGuestStringsForLocale(code), ...(overrides[code] || {}) };
}

/**
 * Add built-in defaults only where Firestore has no value yet (never overwrites edits).
 */
export function fillMissingGuestUiStrings(
  stored: PlatformGuestUiStringsByLocale,
  languageCodes: string[]
): { strings: PlatformGuestUiStringsByLocale; changed: boolean } {
  const out: PlatformGuestUiStringsByLocale = {};
  for (const [locale, map] of Object.entries(stored)) {
    out[locale] = { ...map };
  }

  let changed = false;
  for (const raw of languageCodes) {
    const code = normalizeLocaleCode(raw);
    if (!code) continue;

    const builtin = buildBuiltinGuestStringsForLocale(code);
    const existing = { ...(out[code] || {}) };
    let localeChanged = !out[code];

    for (const [key, value] of Object.entries(builtin)) {
      const text = (value || '').trim();
      if (!text) continue;
      if (!existing[key]?.trim()) {
        existing[key] = text;
        localeChanged = true;
      }
    }

    if (localeChanged) {
      out[code] = existing;
      changed = true;
    }
  }

  return { strings: out, changed };
}

export function resolveGuestUiString(
  locale: string,
  key: GuestUiStringKey,
  overrides: PlatformGuestUiStringsByLocale = runtimeOverrides,
  primaryLocale = 'en'
): string {
  const code = normalizeLocaleCode(locale) || 'en';
  const primary = normalizeLocaleCode(primaryLocale) || 'en';

  const custom = overrides[code]?.[key]?.trim();
  if (custom) return normalizeGuestUiToggleLabel(key, custom);

  const builtin = buildBuiltinGuestStringsForLocale(code)[key];
  if (builtin?.trim()) return normalizeGuestUiToggleLabel(key, builtin.trim());

  const fromPrimary = buildBuiltinGuestStringsForLocale(primary)[key];
  if (fromPrimary?.trim()) return normalizeGuestUiToggleLabel(key, fromPrimary.trim());

  const fallback = buildBuiltinGuestStringsForLocale('en')[key]?.trim() || key;
  return normalizeGuestUiToggleLabel(key, fallback);
}

/** more / less are always all-lowercase in the guest UI (built-in and platform overrides). */
function normalizeGuestUiToggleLabel(key: string, value: string): string {
  if (key === 'more' || key === 'less') return value.toLowerCase();
  return value;
}

export function formatGuestUiString(
  locale: string,
  key: GuestUiStringKey,
  vars: Record<string, string | number>,
  overrides?: PlatformGuestUiStringsByLocale,
  primaryLocale?: string
): string {
  let s = resolveGuestUiString(locale, key, overrides, primaryLocale);
  for (const [k, v] of Object.entries(vars)) {
    s = s.replaceAll(`{${k}}`, String(v));
  }
  return s;
}
