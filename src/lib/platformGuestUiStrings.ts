import { normalizeLocaleCode } from './propertyContentLocales';
import { buildBuiltinGuestStringsForLocale } from './guestUiBuiltinDefaults';
import type { GuestUiStringKey } from './guestUiStringCatalog';

/** Platform copies of built-ins that were superseded — auto-migrate when still unchanged. */
const STALE_GUEST_UI_OVERRIDES: Partial<Record<GuestUiStringKey, string[]>> = {
  aiExpertWelcomeCta: [
    'No tourist traps. Just real days. Where shall we begin?',
    'Χωρίς τουριστικές παγίδες. Αληθινές μέρες. Από πού ξεκινάμε;',
    'Keine Touristenfallen. Echte Tage. Wo beginnen wir?',
    'Pas de pièges à touristes. Des journées authentiques. Par où commencer ?',
    'Niente trappole per turisti. Giornate autentiche. Da dove iniziamo?',
    "I'll show you where people in {area} actually go.",
    "I'll show you where locals in {area} actually go.",
    'Ich zeige Ihnen, wohin die Menschen in {area} wirklich gehen.',
    'Je vous montre où vont vraiment les habitants de {area}.',
    'Ti mostro dove vanno davvero le persone a {area}.',
  ],
  aiExpertChatPlaceholder: [
    'Ask about a place, refine your plan, or request alternatives…',
    'Ρωτήστε για ένα μέρος, βελτιώστε το σχέδιο ή ζητήστε εναλλακτικές…',
    'Fragen Sie zu einem Ort, verfeinern Sie den Plan oder bitten Sie um Alternativen…',
    'Posez une question sur un lieu, affinez le plan ou demandez des alternatives…',
    'Chiedi un luogo, affina il piano o richiedi alternative…',
  ],
  liveLikeLocalHeroSub: [
    'AI day plans & local picks nearby',
    'Προγράμματα ημέρας & τοπικές προτάσεις',
    'Tagespläne & lokale Tipps in der Nähe',
    'Plans du jour & adresses locales',
    'Piani giornalieri e consigli locali',
  ],
  aiExpertOrEnterTown: [
    'or enter a town or village',
    'ή εισάγετε χωριό ή περιοχή',
    'oder Ort oder Dorf eingeben',
    'ou saisissez une ville ou un village',
    'oppure inserisci un paese o villaggio',
  ],
  aiExpertLocationPlaceholder: [
    'e.g. town or area',
    'π.χ. χωριό, περιοχή',
    'z. B. Ort oder Region',
    'ex. ville ou région',
    'es. paese o zona',
  ],
};

function isStaleGuestUiOverride(key: GuestUiStringKey, value: string): boolean {
  const stale = STALE_GUEST_UI_OVERRIDES[key];
  if (!stale) return false;
  const trimmed = value.trim();
  return stale.some((s) => s.trim() === trimmed);
}

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
      const current = existing[key]?.trim();
      if (!current) {
        existing[key] = text;
        localeChanged = true;
        continue;
      }
      if (
        isStaleGuestUiOverride(key as GuestUiStringKey, current) &&
        current !== text
      ) {
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
  if (custom && !isStaleGuestUiOverride(key, custom)) {
    return normalizeGuestUiToggleLabel(key, custom);
  }

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
