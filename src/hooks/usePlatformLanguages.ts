import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  DEFAULT_PLATFORM_LANGUAGES,
  parsePlatformLanguages,
  type PlatformLanguage,
} from '../lib/platformLanguages';

export function usePlatformLanguages() {
  const [languages, setLanguages] = useState<PlatformLanguage[]>(DEFAULT_PLATFORM_LANGUAGES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ref = doc(db, 'platformSettings', 'settings');
    const unsubscribe = onSnapshot(
      ref,
      (snapshot) => {
        setLanguages(parsePlatformLanguages(snapshot.data()));
        setError(null);
        setLoading(false);
      },
      (err) => {
        console.error('platformLanguages listener:', err);
        setLanguages(DEFAULT_PLATFORM_LANGUAGES);
        setError('Could not load languages.');
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  return { languages, loading, error };
}
