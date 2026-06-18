import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';

/** Unread admin inbox messages (platform admin only). */
export function useAdminInboxUnreadCount(enabled: boolean) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setCount(0);
      return;
    }

    const q = query(collection(db, 'adminInboxMessages'), where('readAt', '==', null));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => setCount(snapshot.size),
      (err) => {
        console.error('adminInbox unread listener:', err);
        setCount(0);
      }
    );
    return () => unsubscribe();
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      document.title = 'Vailo Admin';
      return;
    }
    document.title = count > 0 ? `(${count}) Vailo Admin` : 'Vailo Admin';
    return () => {
      document.title = 'Vailo Admin';
    };
  }, [count, enabled]);

  return count;
}
