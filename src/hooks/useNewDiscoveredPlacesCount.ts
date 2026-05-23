import { useEffect, useState } from 'react';
import { collectionGroup, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';

/** Count of discovered places awaiting admin review (all areas). */
export function useNewDiscoveredPlacesCount() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const q = query(
      collectionGroup(db, 'discoveredPlaces'),
      where('reviewStatus', '==', 'new')
    );
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => setCount(snapshot.size),
      (err) => {
        console.error('discoveredPlaces count listener:', err);
        setCount(0);
      }
    );
    return () => unsubscribe();
  }, []);

  return count;
}
