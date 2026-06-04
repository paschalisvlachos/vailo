import type { GuestLocaleKey } from './guestLocale';
import type { GuestLocaleUiKey } from './guestLocaleUi';
import { buildBuiltinGuestStringsForLocale } from './guestUiBuiltinDefaults';

export type GuestUiStringKey = GuestLocaleKey | GuestLocaleUiKey;

export type GuestUiStringGroup =
  | 'portal'
  | 'access'
  | 'content'
  | 'assistant'
  | 'aiExpert'
  | 'legal'
  | 'other';

export type GuestUiCatalogEntry = {
  key: GuestUiStringKey;
  group: GuestUiStringGroup;
  label: string;
};

function inferGroup(key: string): GuestUiStringGroup {
  if (key.startsWith('aiExpert')) return 'aiExpert';
  if (key.startsWith('access')) return 'access';
  if (key.startsWith('assistant')) return 'assistant';
  if (key === 'privacyPolicy' || key === 'termsOfUse') return 'legal';
  if (
    key.startsWith('install') ||
    key.startsWith('gemsLayout') ||
    key === 'welcomeTo' ||
    key === 'map' ||
    key.startsWith('map') ||
    key === 'openInMaps' ||
    key === 'getDirections' ||
    key === 'close' ||
    key === 'propertyLocation' ||
    key === 'liveLikeLocal' ||
    key === 'liveLikeLocalHero' ||
    key === 'liveLikeLocalHeroSub' ||
    key === 'liveLikeLocalSub' ||
    key === 'essentials' ||
    key === 'thingsToKnow' ||
    key.startsWith('googleRating') ||
    key.startsWith('rateOn') ||
    key.startsWith('reviewsOn')
  ) {
    return 'portal';
  }
  if (
    key.startsWith('filter') ||
    key === 'localGems' ||
    key === 'features' ||
    key === 'noGems' ||
    key === 'less' ||
    key === 'more' ||
    key === 'loadMoreLeft' ||
    key === 'website' ||
    key.startsWith('copyWifi') ||
    key === 'wifiCopied' ||
    key === 'failedLoadProperty' ||
    key === 'loadingPortal' ||
    key === 'guestLoadingVailo' ||
    key === 'preparingStay' ||
    key === 'accessChecking' ||
    key === 'translating'
  ) {
    return 'content';
  }
  return 'other';
}

function humanizeKey(key: string): string {
  return key
    .replace(/^aiExpert/, 'AI · ')
    .replace(/^assistant/, 'Assistant · ')
    .replace(/^access/, 'Access · ')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

const EN_BUILTIN = buildBuiltinGuestStringsForLocale('en');

export const GUEST_UI_STRING_CATALOG: GuestUiCatalogEntry[] = Object.keys(EN_BUILTIN)
  .sort()
  .map((key) => ({
    key: key as GuestUiStringKey,
    group: inferGroup(key),
    label: humanizeKey(key),
  }));

export const GUEST_UI_STRING_GROUPS: { id: GuestUiStringGroup; title: string }[] = [
  { id: 'portal', title: 'Portal & home' },
  { id: 'access', title: 'Guest access' },
  { id: 'content', title: 'Gems & filters' },
  { id: 'assistant', title: 'AI assistant' },
  { id: 'aiExpert', title: 'Live like a local' },
  { id: 'legal', title: 'Legal links' },
  { id: 'other', title: 'Other' },
];

export { buildBuiltinGuestStringsForLocale } from './guestUiBuiltinDefaults';
