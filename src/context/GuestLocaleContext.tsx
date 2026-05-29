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
  normalizeGuestLocale,
  type GuestLocale,
  type GuestLocaleKey,
} from '../lib/guestLocale';
import type { GuestLocaleUiKey } from '../lib/guestLocaleUi';
import { resolveGuestUiString, setPlatformGuestUiStringsCache } from '../lib/platformGuestUiStrings';
import { guestLocaleDisplayName } from '../lib/guestAiLanguage';
import { toGuestLocaleOptions } from '../lib/platformLanguages';
import { usePlatformLanguages } from '../hooks/usePlatformLanguages';
import {
  clampContentLocalesToPlatform,
  DEFAULT_PRIMARY_LOCALE,
  filterLocaleOptions,
  normalizeLocaleCode,
} from '../lib/propertyContentLocales';

export type GuestTKey = GuestLocaleKey | GuestLocaleUiKey;

type GuestLocaleContextValue = {
  locale: GuestLocale;
  setLocale: (next: GuestLocale) => void;
  t: (key: GuestTKey) => string;
  localeOptions: ReturnType<typeof toGuestLocaleOptions>;
  languagesLoading: boolean;
  localeLabel: string;
  contentPrimaryLocale: string;
  contentReviewedLocales: string[];
  /** @deprecated Runtime MT removed; returns text unchanged. */
  translateText: (text: string) => Promise<string>;
};

const GuestLocaleContext = createContext<GuestLocaleContextValue | null>(null);

export function GuestLocaleProvider({
  children,
  sessionGuestLocale,
  contentEnabledLocales,
  contentPrimaryLocale = DEFAULT_PRIMARY_LOCALE,
  contentReviewedLocales,
}: {
  children: ReactNode;
  sessionGuestLocale?: string | null;
  /** Property-enabled guest content languages; limits the language menu. */
  contentEnabledLocales?: string[] | null;
  contentPrimaryLocale?: string;
  contentReviewedLocales?: string[] | null;
}) {
  const { languages, guestUiStrings, loading: languagesLoading } = usePlatformLanguages();

  useEffect(() => {
    setPlatformGuestUiStringsCache(guestUiStrings);
  }, [guestUiStrings]);
  const platformCodes = useMemo(() => languages.map((l) => l.shortName), [languages]);
  const allLocaleOptions = useMemo(() => toGuestLocaleOptions(languages), [languages]);
  const effectiveContentLocales = useMemo(() => {
    if (!contentEnabledLocales?.length) return contentEnabledLocales ?? undefined;
    return clampContentLocalesToPlatform(
      {
        primaryLocale: contentPrimaryLocale,
        enabledLocales: contentEnabledLocales,
        reviewedLocales: contentReviewedLocales ?? [],
      },
      platformCodes
    ).enabledLocales;
  }, [contentEnabledLocales, contentPrimaryLocale, contentReviewedLocales, platformCodes]);
  const localeOptions = useMemo(
    () => filterLocaleOptions(allLocaleOptions, effectiveContentLocales),
    [allLocaleOptions, effectiveContentLocales]
  );
  const availableCodes = useMemo(
    () => localeOptions.map((o) => o.code),
    [localeOptions]
  );
  const primaryLocale = normalizeLocaleCode(contentPrimaryLocale) || DEFAULT_PRIMARY_LOCALE;
  const reviewedLocales = useMemo(
    () =>
      contentReviewedLocales && contentReviewedLocales.length > 0
        ? contentReviewedLocales.map(normalizeLocaleCode)
        : null,
    [contentReviewedLocales]
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
      return resolveGuestUiString(locale, key, guestUiStrings, primaryLocale);
    },
    [locale, guestUiStrings, primaryLocale]
  );

  const translateText = useCallback(async (text: string) => text, []);

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      t,
      localeOptions,
      languagesLoading: languagesLoading || !ready,
      localeLabel: guestLocaleDisplayName(locale),
      contentPrimaryLocale: primaryLocale,
      contentReviewedLocales: reviewedLocales || [primaryLocale],
      translateText,
    }),
    [locale, setLocale, t, localeOptions, languagesLoading, ready, translateText, primaryLocale, reviewedLocales]
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
