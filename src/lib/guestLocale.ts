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
  | 'gemsLayoutList';

const MESSAGES: Record<BuiltinGuestLocale, Record<GuestLocaleKey, string>> = {
  en: {
    welcomeTo: 'Welcome to',
    map: 'Map',
    mapTitle: 'Your stay',
    mapSubtitle: 'Property location',
    openInMaps: 'Open in Google Maps',
    getDirections: 'Get directions',
    close: 'Close',
    propertyLocation: 'Property location',
    liveLikeLocal: 'Live like a local',
    liveLikeLocalSub: 'Your AI travel expert · curated picks',
    essentials: 'Essentials',
    thingsToKnow: 'Things to know',
    googleRatingTitle: 'Enjoying your stay?',
    googleRatingSub: 'Share your experience on Google — it helps future guests.',
    rateOnGoogle: 'Rate on Google',
    reviewsOnGoogle: 'reviews on Google',
    installTitle: 'Quick access for your trip',
    installSub: 'Add Vailo to your home screen for one-tap access during your stay.',
    installCta: 'Add Vailo to Home Screen',
    installDismiss: 'Dismiss',
    installIosTitle: 'Add Vailo to your iPhone',
    installIosStep1: 'Tap the Share button at the bottom of Safari.',
    installIosStep2: 'Scroll down and tap “Add to Home Screen”.',
    installIosStep3: 'Tap Add — the Vailo icon will appear on your home screen.',
    installWaiting: 'Follow the prompt to install…',
    installSuccess: 'You can open Vailo from your home screen anytime.',
    gemsLayoutGroup: 'Local gems layout',
    gemsLayoutGrid: 'Two per row',
    gemsLayoutList: 'One per row',
  },
  el: {
    welcomeTo: 'Καλώς ήρθατε στο',
    map: 'Χάρτης',
    mapTitle: 'Η διαμονή σας',
    mapSubtitle: 'Τοποθεσία καταλύματος',
    openInMaps: 'Άνοιγμα στο Google Maps',
    getDirections: 'Οδηγίες',
    close: 'Κλείσιμο',
    propertyLocation: 'Τοποθεσία καταλύματος',
    liveLikeLocal: 'Ζήστε σαν ντόπιος',
    liveLikeLocalSub: 'Ο AI ταξιδιωτικός σας σύμβουλος',
    essentials: 'Βασικά',
    thingsToKnow: 'Χρήσιμες πληροφορίες',
    googleRatingTitle: 'Απολαμβάνετε τη διαμονή;',
    googleRatingSub: 'Αφήστε μια κριτική στο Google — βοηθάει τους επόμενους επισκέπτες.',
    rateOnGoogle: 'Βαθμολογία στο Google',
    reviewsOnGoogle: 'κριτικές στο Google',
    installTitle: 'Γρήγορη πρόσβαση για το ταξίδι σας',
    installSub: 'Προσθέστε το Vailo στην αρχική οθόνη για άμεση πρόσβαση.',
    installCta: 'Προσθήκη Vailo στην αρχική',
    installDismiss: 'Κλείσιμο',
    installIosTitle: 'Προσθήκη Vailo στο iPhone',
    installIosStep1: 'Πατήστε Κοινοποίηση στο κάτω μέρος του Safari.',
    installIosStep2: 'Κάντε scroll και επιλέξτε «Προσθήκη στην Αρχική Οθόνη».',
    installIosStep3: 'Πατήστε Προσθήκη — το εικονίδιο Vailo θα εμφανιστεί στην αρχική.',
    installWaiting: 'Ακολουθήστε τις οδηγίες εγκατάστασης…',
    installSuccess: 'Μπορείτε να ανοίξετε το Vailo από την αρχική οθόνη.',
    gemsLayoutGroup: 'Διάταξη τοπικών σημείων',
    gemsLayoutGrid: 'Δύο ανά σειρά',
    gemsLayoutList: 'Ένα ανά σειρά',
  },
  de: {
    welcomeTo: 'Willkommen in',
    map: 'Karte',
    mapTitle: 'Ihr Aufenthalt',
    mapSubtitle: 'Standort der Unterkunft',
    openInMaps: 'In Google Maps öffnen',
    getDirections: 'Route',
    close: 'Schließen',
    propertyLocation: 'Standort der Unterkunft',
    liveLikeLocal: 'Leben wie ein Einheimischer',
    liveLikeLocalSub: 'Ihr KI-Reiseexperte · kuratierte Tipps',
    essentials: 'Wichtiges',
    thingsToKnow: 'Gut zu wissen',
    googleRatingTitle: 'Gefällt Ihnen der Aufenthalt?',
    googleRatingSub: 'Bewerten Sie uns auf Google — das hilft anderen Gästen.',
    rateOnGoogle: 'Auf Google bewerten',
    reviewsOnGoogle: 'Bewertungen auf Google',
    installTitle: 'Schnellzugriff für Ihre Reise',
    installSub: 'Fügen Sie Vailo zum Startbildschirm hinzu — ein Tipp während des Aufenthalts.',
    installCta: 'Vailo zum Startbildschirm',
    installDismiss: 'Schließen',
    installIosTitle: 'Vailo auf dem iPhone hinzufügen',
    installIosStep1: 'Tippen Sie unten in Safari auf Teilen.',
    installIosStep2: 'Scrollen Sie und wählen Sie „Zum Home-Bildschirm“.',
    installIosStep3: 'Tippen Sie Hinzufügen — das Vailo-Symbol erscheint auf dem Home-Bildschirm.',
    installWaiting: 'Folgen Sie der Installationsaufforderung…',
    installSuccess: 'Sie können Vailo jederzeit vom Home-Bildschirm öffnen.',
    gemsLayoutGroup: 'Layout lokaler Tipps',
    gemsLayoutGrid: 'Zwei pro Zeile',
    gemsLayoutList: 'Eine pro Zeile',
  },
  fr: {
    welcomeTo: 'Bienvenue à',
    map: 'Carte',
    mapTitle: 'Votre séjour',
    mapSubtitle: 'Emplacement du logement',
    openInMaps: 'Ouvrir dans Google Maps',
    getDirections: 'Itinéraire',
    close: 'Fermer',
    propertyLocation: 'Emplacement du logement',
    liveLikeLocal: 'Vivre comme un local',
    liveLikeLocalSub: 'Votre expert voyage IA · sélections locales',
    essentials: 'Essentiels',
    thingsToKnow: 'À savoir',
    googleRatingTitle: 'Vous appréciez votre séjour ?',
    googleRatingSub: 'Laissez un avis sur Google — cela aide les futurs voyageurs.',
    rateOnGoogle: 'Noter sur Google',
    reviewsOnGoogle: 'avis sur Google',
    installTitle: 'Accès rapide pour votre séjour',
    installSub: 'Ajoutez Vailo à l’écran d’accueil pour un accès en un geste.',
    installCta: 'Ajouter Vailo à l’accueil',
    installDismiss: 'Fermer',
    installIosTitle: 'Ajouter Vailo sur iPhone',
    installIosStep1: 'Appuyez sur Partager en bas de Safari.',
    installIosStep2: 'Faites défiler et choisissez « Sur l’écran d’accueil ».',
    installIosStep3: 'Appuyez sur Ajouter — l’icône Vailo apparaîtra sur l’accueil.',
    installWaiting: 'Suivez l’invite d’installation…',
    installSuccess: 'Ouvrez Vailo depuis votre écran d’accueil à tout moment.',
    gemsLayoutGroup: 'Affichage des adresses',
    gemsLayoutGrid: 'Deux par ligne',
    gemsLayoutList: 'Une par ligne',
  },
  it: {
    welcomeTo: 'Benvenuto a',
    map: 'Mappa',
    mapTitle: 'Il tuo soggiorno',
    mapSubtitle: 'Posizione della struttura',
    openInMaps: 'Apri in Google Maps',
    getDirections: 'Indicazioni',
    close: 'Chiudi',
    propertyLocation: 'Posizione della struttura',
    liveLikeLocal: 'Vivi come un local',
    liveLikeLocalSub: 'Il tuo esperto di viaggio IA · scelte locali',
    essentials: 'Essenziali',
    thingsToKnow: 'Da sapere',
    googleRatingTitle: 'Ti piace il soggiorno?',
    googleRatingSub: 'Lascia una recensione su Google — aiuta i prossimi ospiti.',
    rateOnGoogle: 'Recensisci su Google',
    reviewsOnGoogle: 'recensioni su Google',
    installTitle: 'Accesso rapido per il viaggio',
    installSub: 'Aggiungi Vailo alla schermata Home per un accesso immediato.',
    installCta: 'Aggiungi Vailo alla Home',
    installDismiss: 'Chiudi',
    installIosTitle: 'Aggiungi Vailo su iPhone',
    installIosStep1: 'Tocca Condividi in basso in Safari.',
    installIosStep2: 'Scorri e scegli « Aggiungi a Home ».',
    installIosStep3: 'Tocca Aggiungi — l’icona Vailo apparirà sulla Home.',
    installWaiting: 'Segui il prompt di installazione…',
    installSuccess: 'Puoi aprire Vailo dalla schermata Home in qualsiasi momento.',
    gemsLayoutGroup: 'Layout consigli locali',
    gemsLayoutGrid: 'Due per riga',
    gemsLayoutList: 'Uno per riga',
  },
};

export function guestT(locale: GuestLocale, key: GuestLocaleKey): string {
  const builtin = locale as BuiltinGuestLocale;
  return MESSAGES[builtin]?.[key] ?? MESSAGES.en[key];
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
