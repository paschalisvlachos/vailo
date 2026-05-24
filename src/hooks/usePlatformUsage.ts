import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';

export const MAGIC_FILL_UNIT_COST = 0.027;

export type PlatformUsageStats = {
  magicFill: number;
  updatedAt: Date | null;
};

const EMPTY: PlatformUsageStats = { magicFill: 0, updatedAt: null };

function currentMonthKey() {
  return new Date().toISOString().slice(0, 7);
}

function parseStats(data: Record<string, unknown> | undefined): PlatformUsageStats {
  if (!data) return EMPTY;
  const updatedAt = data.updatedAt;
  return {
    magicFill: typeof data.magicFill === 'number' ? data.magicFill : 0,
    updatedAt:
      updatedAt && typeof updatedAt === 'object' && 'toDate' in updatedAt
        ? (updatedAt as { toDate: () => Date }).toDate()
        : null,
  };
}

/** Live platform usage for the current calendar month (Magic Fill API calls). */
export function usePlatformUsage() {
  const [stats, setStats] = useState<PlatformUsageStats>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const monthKey = currentMonthKey();

  useEffect(() => {
    setLoading(true);
    const ref = doc(db, 'platformUsage', monthKey);
    const unsubscribe = onSnapshot(
      ref,
      (snapshot) => {
        setStats(parseStats(snapshot.data()));
        setError(null);
        setLoading(false);
      },
      (err) => {
        console.error('platformUsage listener:', err);
        setStats(EMPTY);
        setError('Could not load usage data.');
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, [monthKey]);

  const estimatedCost = stats.magicFill * MAGIC_FILL_UNIT_COST;

  return { stats, loading, error, monthKey, estimatedCost };
}
