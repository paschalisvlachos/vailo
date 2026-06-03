import type { BuiltinGuestLocale } from './guestLocale';
import {
  AI_EXPERT_UI_EN,
  AI_EXPERT_UI_EL,
  type GuestLocaleAiExpertKey,
} from './guestLocaleAiExpert';
import {
  AI_EXPERT_UI_DE,
  AI_EXPERT_UI_FR,
  AI_EXPERT_UI_IT,
  UI_DE,
  UI_FR,
  UI_IT,
} from './guestLocaleBuiltinDeFrIt';

/** Additional guest UI strings (English master; other builtins fall back via guestT). */
export type GuestLocaleUiKey =
  | 'less'
  | 'more'
  | 'loadMoreLeft'
  | 'website'
  | 'copyWifi'
  | 'wifiCopied'
  | 'failedLoadProperty'
  | 'loadingPortal'
  | 'accessChecking'
  | 'accessGuestTitle'
  | 'accessGuestSub'
  | 'accessInvitePassword'
  | 'accessVerifying'
  | 'accessContinue'
  | 'accessInvalidPassword'
  | 'accessTesterTitle'
  | 'accessTesterSub'
  | 'accessVisitorCode'
  | 'accessInvalidCode'
  | 'accessDenied'
  | 'accessCancelled'
  | 'accessExpired'
  | 'adminPreviewBar'
  | 'privacyPolicy'
  | 'termsOfUse'
  | 'translating'
  | 'filterAll'
  | 'filterHostsPicks'
  | 'filterNear'
  | 'filterDayTrips'
  | 'localGems'
  | 'features'
  | 'noGems'
  | 'assistantBack'
  | 'assistantConsentTitle'
  | 'assistantConsentBody'
  | 'assistantConsentAgree'
  | 'assistantWelcomeBody'
  | 'assistantPlaceholder'
  | 'assistantSend'
  | 'assistantReportIssue'
  | 'assistantEscalation'
  | 'assistantImageError'
  | 'assistantImageTooBig'
  | 'assistantSuggestedWifi'
  | 'assistantSuggestedCheckout'
  | 'assistantSuggestedAc'
  | 'assistantSuggestedParking'
  | 'assistantSuggestedWasher'
  | 'aiExpertBack'
  | 'aiExpertTitle'
  | 'reportIssueTitle'
  | 'floatingAssistant'
  | 'floatingReport'
  | 'floatingWhatsapp'
  | GuestLocaleAiExpertKey;

export const GUEST_UI_KEY_SET = new Set<string>();

export const BUILTIN_GUEST_UI_DEFAULTS: Record<
  BuiltinGuestLocale,
  Partial<Record<GuestLocaleUiKey, string>>
> = {
  en: {} as Record<GuestLocaleUiKey, string>,
  el: {},
  de: {},
  fr: {},
  it: {},
};

const UI_EN: Record<GuestLocaleUiKey, string> = {
  less: 'Less',
  more: 'More',
  loadMoreLeft: 'Load more · {count} left',
  website: 'Website',
  copyWifi: 'Copy Wi-Fi password',
  wifiCopied: 'Copied',
  failedLoadProperty: 'Failed to load property data.',
  loadingPortal: 'Loading your stay…',
  accessChecking: 'Checking access…',
  accessGuestTitle: 'Guest access',
  accessGuestSub: 'Enter the password from your invitation email or message.',
  accessInvitePassword: 'Invitation password',
  accessVerifying: 'Verifying…',
  accessContinue: 'Continue',
  accessInvalidPassword: 'Invalid password. Please try again.',
  accessTesterTitle: 'Guest visitor access',
  accessTesterSub: 'Enter the guest visitor access code you received by email.',
  accessVisitorCode: 'Visitor access code',
  accessInvalidCode: 'Invalid or expired visitor access code.',
  accessDenied: 'Access denied.',
  accessCancelled:
    'This reservation was cancelled. Guest portal access is no longer available.',
  accessExpired: 'Your guest portal access has expired.',
  adminPreviewBar:
    'Admin preview — guests still need an invitation, stay access, or visitor code',
  privacyPolicy: 'Privacy Policy',
  termsOfUse: 'Terms of Use',
  translating: 'Translating…',
  filterAll: 'All',
  filterHostsPicks: "Host's Picks",
  filterNear: '< 5km',
  filterDayTrips: 'Day Trips',
  localGems: 'Local gems',
  features: 'Features',
  noGems: 'No local gems to show yet.',
  assistantBack: 'Back',
  assistantConsentTitle: 'AI Assistant',
  assistantConsentBody:
    'This assistant answers questions about your stay using the property house guide. Conversations may be logged to improve service. Do not share sensitive personal data.',
  assistantConsentAgree: 'I understand — continue',
  assistantWelcomeBody:
    "Hello! I'm glad you're here — ask me anything about your stay: Wi-Fi, check-out, appliances (I can help with specific models when your host has listed them), parking, or house rules. For restaurants and day plans, try Live like a local on the home screen.",
  assistantPlaceholder: 'Ask about Wi-Fi, check-out, appliances…',
  assistantSend: 'Send',
  assistantReportIssue: 'Report issue',
  assistantEscalation:
    'Please contact your host or use Report Issue for urgent help.',
  assistantImageError: 'Please pick an image file.',
  assistantImageTooBig: 'Images must be under 4 MB.',
  assistantSuggestedWifi: 'How do I connect to the Wi-Fi?',
  assistantSuggestedCheckout: 'What time is check-out?',
  assistantSuggestedAc: 'How do I use the air conditioning?',
  assistantSuggestedParking: 'Where can I park?',
  assistantSuggestedWasher: 'How does the washing machine work?',
  aiExpertBack: 'Back to stay',
  aiExpertTitle: 'Live like a local',
  reportIssueTitle: 'Report an issue',
  floatingAssistant: 'Ask assistant',
  floatingReport: 'Report issue',
  floatingWhatsapp: 'WhatsApp host',
  ...AI_EXPERT_UI_EN,
};

for (const k of Object.keys(UI_EN)) {
  GUEST_UI_KEY_SET.add(k);
}

const UI_EL: Partial<Record<GuestLocaleUiKey, string>> = {
  less: 'Λιγότερα',
  more: 'Περισσότερα',
  accessGuestTitle: 'Πρόσβαση επισκέπτη',
  accessGuestSub: 'Εισάγετε τον κωδικό από την πρόσκλησή σας.',
  accessContinue: 'Συνέχεια',
  privacyPolicy: 'Πολιτική απορρήτου',
  termsOfUse: 'Όροι χρήσης',
  filterAll: 'Όλα',
  filterHostsPicks: 'Επιλογές οικοδεσπότη',
  localGems: 'Τοπικά σημεία',
  aiExpertBack: 'Πίσω στη διαμονή',
  aiExpertTitle: 'Ζήστε σαν ντόπιος',
  ...AI_EXPERT_UI_EL,
};

BUILTIN_GUEST_UI_DEFAULTS.en = UI_EN;
BUILTIN_GUEST_UI_DEFAULTS.el = UI_EL;
BUILTIN_GUEST_UI_DEFAULTS.de = { ...UI_DE, ...AI_EXPERT_UI_DE };
BUILTIN_GUEST_UI_DEFAULTS.fr = { ...UI_FR, ...AI_EXPERT_UI_FR };
BUILTIN_GUEST_UI_DEFAULTS.it = { ...UI_IT, ...AI_EXPERT_UI_IT };

/** @deprecated Use platform guestUiStrings; kept for admin seed reference. */
export const GUEST_UI_MESSAGES = BUILTIN_GUEST_UI_DEFAULTS;

import { formatGuestUiString, resolveGuestUiString } from './platformGuestUiStrings';

export function guestUiT(locale: string, key: GuestLocaleUiKey): string {
  return resolveGuestUiString(locale, key);
}

export function guestUiTFormat(
  locale: string,
  key: GuestLocaleUiKey,
  vars: Record<string, string | number>
): string {
  return formatGuestUiString(locale, key, vars);
}
