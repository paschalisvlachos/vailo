import type { BuiltinGuestLocale } from './guestLocale';
import { BUILTIN_PORTAL_MESSAGES } from './guestPortalBuiltin';
import { BUILTIN_GUEST_UI_DEFAULTS } from './guestLocaleUi';
import { normalizeLocaleCode } from './propertyContentLocales';

/** Merged built-in guest UI + portal strings for one locale code. */
export function buildBuiltinGuestStringsForLocale(locale: string): Record<string, string> {
  const code = normalizeLocaleCode(locale) || 'en';
  const builtin = code as BuiltinGuestLocale;
  const merged: Record<string, string> = {
    ...BUILTIN_GUEST_UI_DEFAULTS.en,
    ...BUILTIN_PORTAL_MESSAGES.en,
  };
  const ui = BUILTIN_GUEST_UI_DEFAULTS[builtin];
  if (ui) Object.assign(merged, ui);
  const portal = BUILTIN_PORTAL_MESSAGES[builtin];
  if (portal) Object.assign(merged, portal);
  return merged;
}

export function buildBuiltinGuestUiStringsSeed(): Record<string, Record<string, string>> {
  const codes: BuiltinGuestLocale[] = ['en', 'el', 'de', 'fr', 'it'];
  const out: Record<string, Record<string, string>> = {};
  for (const code of codes) {
    out[code] = buildBuiltinGuestStringsForLocale(code);
  }
  return out;
}
