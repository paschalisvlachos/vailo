import { useEffect, useRef, useState } from 'react';
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  DEFAULT_PLATFORM_LANGUAGES,
  parsePlatformLanguages,
  type PlatformLanguage,
} from '../lib/platformLanguages';
import {
  fillMissingGuestUiStrings,
  parsePlatformGuestUiStrings,
  type PlatformGuestUiStringsByLocale,
} from '../lib/platformGuestUiStrings';

export function usePlatformLanguages() {
  const [languages, setLanguages] = useState<PlatformLanguage[]>(DEFAULT_PLATFORM_LANGUAGES);
  const [guestUiStrings, setGuestUiStrings] = useState<PlatformGuestUiStringsByLocale>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const syncInFlightRef = useRef(false);

  useEffect(() => {
    const ref = doc(db, 'platformSettings', 'settings');
    const unsubscribe = onSnapshot(
      ref,
      async (snapshot) => {
        const data = snapshot.data() as Record<string, unknown> | undefined;
        const parsedLanguages = parsePlatformLanguages(data);
        const parsedStrings = parsePlatformGuestUiStrings(data);
        const codes = parsedLanguages.map((l) => l.shortName);
        const { strings, changed } = fillMissingGuestUiStrings(parsedStrings, codes);

        setLanguages(parsedLanguages);
        setGuestUiStrings(strings);
        setError(null);
        setLoading(false);

        if (changed && !syncInFlightRef.current) {
          syncInFlightRef.current = true;
          try {
            await setDoc(
              ref,
              { guestUiStrings: strings, updatedAt: serverTimestamp() },
              { merge: true }
            );
          } catch (err) {
            console.warn('Auto-fill guest UI strings failed:', err);
          } finally {
            syncInFlightRef.current = false;
          }
        }
      },
      (err) => {
        console.error('platformLanguages listener:', err);
        setLanguages(DEFAULT_PLATFORM_LANGUAGES);
        setGuestUiStrings({});
        setError('Could not load languages.');
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  return { languages, guestUiStrings, loading, error };
}
