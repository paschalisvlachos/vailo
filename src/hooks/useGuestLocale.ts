import { useCallback, useEffect, useState } from 'react';
import {
  GUEST_LOCALE_STORAGE_KEY,
  guestT,
  normalizeGuestLocale,
  type GuestLocale,
  type GuestLocaleKey,
} from '../lib/guestLocale';

export function useGuestLocale() {
  const [locale, setLocaleState] = useState<GuestLocale>(() => {
    try {
      return normalizeGuestLocale(localStorage.getItem(GUEST_LOCALE_STORAGE_KEY));
    } catch {
      return 'en';
    }
  });

  const setLocale = useCallback((next: GuestLocale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(GUEST_LOCALE_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale === 'el' ? 'el' : locale;
  }, [locale]);

  const t = useCallback((key: GuestLocaleKey) => guestT(locale, key), [locale]);

  return { locale, setLocale, t };
}
