import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';

/** Unseen guest-reported issues for one property (badge on Guest Issues tab). */
export function useUnseenGuestIssuesCount(propertyId: string | undefined) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!propertyId) {
      setCount(0);
      return;
    }
    const q = query(
      collection(db, 'properties', propertyId, 'guestIssues'),
      where('seenByHost', '==', false)
    );
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => setCount(snapshot.size),
      (err) => {
        console.error('guestIssues count listener:', err);
        setCount(0);
      }
    );
    return () => unsubscribe();
  }, [propertyId]);

  return count;
}
