import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  GUEST_LOCALE_STORAGE_KEY,
  guestT,
  normalizeGuestLocale,
  type GuestLocale,
  type GuestLocaleKey,
} from '../lib/guestLocale';
import { GUEST_UI_KEY_SET, guestUiT, type GuestLocaleUiKey } from '../lib/guestLocaleUi';
import { translateGuestText, clearGuestTranslationCache } from '../lib/guestAutoTranslate';
import { guestLocaleDisplayName } from '../lib/guestAiLanguage';
import { toGuestLocaleOptions } from '../lib/platformLanguages';
import { usePlatformLanguages } from '../hooks/usePlatformLanguages';

export type GuestTKey = GuestLocaleKey | GuestLocaleUiKey;

type GuestLocaleContextValue = {
  locale: GuestLocale;
  setLocale: (next: GuestLocale) => void;
  t: (key: GuestTKey) => string;
  localeOptions: ReturnType<typeof toGuestLocaleOptions>;
  languagesLoading: boolean;
  localeLabel: string;
  translateText: (text: string) => Promise<string>;
};

const GuestLocaleContext = createContext<GuestLocaleContextValue | null>(null);

function isUiKey(key: string): key is GuestLocaleUiKey {
  return GUEST_UI_KEY_SET.has(key);
}

export function GuestLocaleProvider({
  children,
  sessionGuestLocale,
}: {
  children: ReactNode;
  sessionGuestLocale?: string | null;
}) {
  const { languages, loading: languagesLoading } = usePlatformLanguages();
  const localeOptions = useMemo(() => toGuestLocaleOptions(languages), [languages]);
  const availableCodes = useMemo(
    () => localeOptions.map((o) => o.code),
    [localeOptions]
  );

  const [locale, setLocaleState] = useState<GuestLocale>('en');
  const [ready, setReady] = useState(false);

  const applyInitialLocale = useCallback(() => {
    if (languagesLoading || availableCodes.length === 0) return;

    let stored: string | null = null;
    try {
      stored = localStorage.getItem(GUEST_LOCALE_STORAGE_KEY);
    } catch {
      stored = null;
    }

    if (stored) {
      setLocaleState(normalizeGuestLocale(stored, availableCodes));
    } else if (sessionGuestLocale) {
      setLocaleState(normalizeGuestLocale(sessionGuestLocale, availableCodes));
    } else if (typeof navigator !== 'undefined' && navigator.language) {
      const browser = navigator.language.split('-')[0];
      setLocaleState(normalizeGuestLocale(browser, availableCodes));
    } else {
      setLocaleState(normalizeGuestLocale(undefined, availableCodes));
    }
    setReady(true);
  }, [languagesLoading, availableCodes, sessionGuestLocale]);

  useEffect(() => {
    applyInitialLocale();
  }, [applyInitialLocale]);

  useEffect(() => {
    if (!ready || !sessionGuestLocale || languagesLoading) return;
    try {
      if (localStorage.getItem(GUEST_LOCALE_STORAGE_KEY)) return;
    } catch {
      /* ignore */
    }
    setLocaleState(normalizeGuestLocale(sessionGuestLocale, availableCodes));
  }, [sessionGuestLocale, ready, languagesLoading, availableCodes]);

  const setLocale = useCallback(
    (next: GuestLocale) => {
      const code = normalizeGuestLocale(next, availableCodes);
      setLocaleState(code);
      clearGuestTranslationCache();
      try {
        localStorage.setItem(GUEST_LOCALE_STORAGE_KEY, code);
      } catch {
        /* ignore */
      }
    },
    [availableCodes]
  );

  useEffect(() => {
    if (ready) {
      document.documentElement.lang = locale || 'en';
    }
  }, [locale, ready]);

  const t = useCallback(
    (key: GuestTKey) => {
      if (isUiKey(key as string)) {
        return guestUiT(locale, key as GuestLocaleUiKey);
      }
      return guestT(locale, key as GuestLocaleKey);
    },
    [locale]
  );

  const translateText = useCallback(
    (text: string) => translateGuestText(text, locale),
    [locale]
  );

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      t,
      localeOptions,
      languagesLoading: languagesLoading || !ready,
      localeLabel: guestLocaleDisplayName(locale),
      translateText,
    }),
    [locale, setLocale, t, localeOptions, languagesLoading, ready, translateText]
  );

  return (
    <GuestLocaleContext.Provider value={value}>{children}</GuestLocaleContext.Provider>
  );
}

export function useGuestLocale(): GuestLocaleContextValue {
  const ctx = useContext(GuestLocaleContext);
  if (!ctx) {
    throw new Error('useGuestLocale must be used within GuestLocaleProvider');
  }
  return ctx;
}
