/** Locale code from platform settings (e.g. en, el). */
export type GuestLocale = string;

export const BUILTIN_GUEST_LOCALES = ['en', 'el', 'de', 'fr', 'it'] as const;
export type BuiltinGuestLocale = (typeof BUILTIN_GUEST_LOCALES)[number];

export const GUEST_LOCALE_STORAGE_KEY = 'vailo-guest-locale';

/** Fallback when platform languages are not loaded yet. */
export const FALLBACK_GUEST_LOCALES: {
  code: GuestLocale;
  label: string;
  nativeLabel: string;
}[] = [
  { code: 'en', label: 'English', nativeLabel: 'EN' },
  { code: 'el', label: 'Greek', nativeLabel: 'EL' },
  { code: 'de', label: 'German', nativeLabel: 'DE' },
  { code: 'fr', label: 'French', nativeLabel: 'FR' },
  { code: 'it', label: 'Italian', nativeLabel: 'IT' },
];

/** @deprecated Use options from usePlatformLanguages / toGuestLocaleOptions */
export const GUEST_LOCALES = FALLBACK_GUEST_LOCALES;

export type GuestLocaleKey =
  | 'welcomeTo'
  | 'map'
  | 'mapTitle'
  | 'mapSubtitle'
  | 'openInMaps'
  | 'getDirections'
  | 'close'
  | 'propertyLocation'
  | 'liveLikeLocal'
  | 'liveLikeLocalSub'
  | 'liveLikeLocalHero'
  | 'liveLikeLocalHeroSub'
  | 'essentials'
  | 'thingsToKnow'
  | 'googleRatingTitle'
  | 'googleRatingSub'
  | 'rateOnGoogle'
  | 'reviewsOnGoogle'
  | 'installTitle'
  | 'installSub'
  | 'installCta'
  | 'installDismiss'
  | 'installIosTitle'
  | 'installIosStep1'
  | 'installIosStep2'
  | 'installIosStep3'
  | 'installWaiting'
  | 'installSuccess'
  | 'gemsLayoutGroup'
  | 'gemsLayoutGrid'
  | 'gemsLayoutList'
  | 'portalMenu'
  | 'portalMenuClose'
  | 'houseGuide'
  | 'houseGuideSheetSub'
  | 'houseGuideMenuSub'
  | 'houseGuideMenuSubEmpty'
  | 'houseGuideEmpty'
  | 'assistantProperty'
  | 'assistantPropertySub';

export { BUILTIN_PORTAL_MESSAGES } from './guestPortalBuiltin';

import { resolveGuestUiString } from './platformGuestUiStrings';

export function guestT(locale: GuestLocale, key: GuestLocaleKey): string {
  return resolveGuestUiString(locale, key);
}

export function normalizeGuestLocale(
  raw: string | null | undefined,
  availableCodes?: string[]
): GuestLocale {
  const codes =
    availableCodes && availableCodes.length > 0
      ? availableCodes
      : FALLBACK_GUEST_LOCALES.map((l) => l.code);
  const normalized = String(raw || '')
    .trim()
    .toLowerCase();
  if (normalized && codes.includes(normalized)) return normalized;
  return codes[0] ?? 'en';
}
