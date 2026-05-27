import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  GUEST_LOCALE_STORAGE_KEY,
  guestT,
  normalizeGuestLocale,
  type GuestLocale,
  type GuestLocaleKey,
} from '../lib/guestLocale';
import { toGuestLocaleOptions } from '../lib/platformLanguages';
import { usePlatformLanguages } from './usePlatformLanguages';

export function useGuestLocale() {
  const { languages, loading: languagesLoading } = usePlatformLanguages();
  const localeOptions = useMemo(() => toGuestLocaleOptions(languages), [languages]);
  const availableCodes = useMemo(
    () => localeOptions.map((o) => o.code),
    [localeOptions]
  );

  const [locale, setLocaleState] = useState<GuestLocale>('en');

  useEffect(() => {
    if (languagesLoading || availableCodes.length === 0) return;
    try {
      const stored = localStorage.getItem(GUEST_LOCALE_STORAGE_KEY);
      setLocaleState(normalizeGuestLocale(stored, availableCodes));
    } catch {
      setLocaleState(normalizeGuestLocale(undefined, availableCodes));
    }
  }, [languagesLoading, availableCodes.join(',')]);

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
    document.documentElement.lang = locale || 'en';
  }, [locale]);

  const t = useCallback((key: GuestLocaleKey) => guestT(locale, key), [locale]);

  return { locale, setLocale, t, localeOptions, languagesLoading };
}
