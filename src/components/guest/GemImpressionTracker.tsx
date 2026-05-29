import { useEffect, useMemo, useRef } from 'react';
import { useGuestAnalytics } from '../../context/GuestAnalyticsContext';

type GemLike = { id: string; name?: string };

/**
 * Logs gem_impression once per gem id when the card is ≥50% visible for ~1s.
 */
export default function GemImpressionTracker({
  gems,
  children,
}: {
  gems: GemLike[];
  children: React.ReactNode;
}) {
  const { enabled, track } = useGuestAnalytics();
  const seenRef = useRef<Set<string>>(new Set());
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const gemIdsKey = useMemo(
    () => gems.map((g) => g.id).sort().join(','),
    [gems]
  );

  useEffect(() => {
    if (!enabled || gems.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const gemId = entry.target.getAttribute('data-gem-id');
          if (!gemId || seenRef.current.has(gemId)) continue;

          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
            if (timersRef.current.has(gemId)) continue;
            const name = entry.target.getAttribute('data-gem-name') || undefined;
            const timer = setTimeout(() => {
              timersRef.current.delete(gemId);
              if (seenRef.current.has(gemId)) return;
              seenRef.current.add(gemId);
              track('gem_impression', { gemId, gemName: name });
            }, 1000);
            timersRef.current.set(gemId, timer);
          } else {
            const t = timersRef.current.get(gemId);
            if (t) {
              clearTimeout(t);
              timersRef.current.delete(gemId);
            }
          }
        }
      },
      { threshold: [0.5] }
    );

    const nodes = document.querySelectorAll('[data-gem-id]');
    nodes.forEach((node) => observer.observe(node));

    return () => {
      observer.disconnect();
      timersRef.current.forEach((t) => clearTimeout(t));
      timersRef.current.clear();
    };
  }, [enabled, gemIdsKey, gems.length, track]);

  return <>{children}</>;
}
