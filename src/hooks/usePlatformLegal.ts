import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import {
  EMPTY_PLATFORM_LEGAL,
  parsePlatformLegal,
  type PlatformLegalContent,
} from '../lib/platformLegal';

export function usePlatformLegal() {
  const [content, setContent] = useState<PlatformLegalContent>(EMPTY_PLATFORM_LEGAL);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ref = doc(db, 'platformSettings', 'legal');
    const unsubscribe = onSnapshot(
      ref,
      (snapshot) => {
        setContent(parsePlatformLegal(snapshot.data()));
        setError(null);
        setLoading(false);
      },
      (err) => {
        console.error('platformLegal listener:', err);
        setContent(EMPTY_PLATFORM_LEGAL);
        setError('Could not load legal documents.');
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  return { content, loading, error };
}
