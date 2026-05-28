import type { BuiltinGuestLocale } from './guestLocale';

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
  | 'floatingWhatsapp';

export const GUEST_UI_KEY_SET = new Set<string>();

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
    "I'm here to help with anything about your stay — Wi-Fi, check-out, appliances, parking, house rules, and supplies. For restaurants, sightseeing, and day plans, use Live like a local on the home screen.",
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
};

export const GUEST_UI_MESSAGES: Record<
  BuiltinGuestLocale,
  Partial<Record<GuestLocaleUiKey, string>>
> = {
  en: UI_EN,
  el: UI_EL,
  de: {},
  fr: {},
  it: {},
};

export function guestUiT(locale: string, key: GuestLocaleUiKey): string {
  const builtin = locale as BuiltinGuestLocale;
  return (
    GUEST_UI_MESSAGES[builtin]?.[key] ??
    UI_EN[key] ??
    key
  );
}

export function guestUiTFormat(
  locale: string,
  key: GuestLocaleUiKey,
  vars: Record<string, string | number>
): string {
  let s = guestUiT(locale, key);
  for (const [k, v] of Object.entries(vars)) {
    s = s.replace(`{${k}}`, String(v));
  }
  return s;
}
