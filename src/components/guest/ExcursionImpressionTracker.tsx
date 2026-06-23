import { useEffect, useMemo, useRef } from 'react';
import { useGuestAnalytics } from '../../context/GuestAnalyticsContext';

type ExcursionLike = {
  id: string;
  excursionId: string;
  excursionTitle?: string;
  providerId: string;
  providerName?: string;
};

/**
 * Logs excursion_impression once per excursion when the card is ≥50% visible for ~1s.
 */
export default function ExcursionImpressionTracker({
  excursions,
  children,
}: {
  excursions: ExcursionLike[];
  children: React.ReactNode;
}) {
  const { enabled, track } = useGuestAnalytics();
  const seenRef = useRef<Set<string>>(new Set());
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const excursionIdsKey = useMemo(
    () => excursions.map((e) => e.id).sort().join(','),
    [excursions]
  );

  useEffect(() => {
    if (!enabled || excursions.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const impressionId = entry.target.getAttribute('data-excursion-impression-id');
          if (!impressionId || seenRef.current.has(impressionId)) continue;

          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
            if (timersRef.current.has(impressionId)) continue;
            const excursionId = entry.target.getAttribute('data-excursion-id') || undefined;
            const providerId = entry.target.getAttribute('data-provider-id') || undefined;
            const excursionTitle =
              entry.target.getAttribute('data-excursion-title') || undefined;
            const providerName = entry.target.getAttribute('data-provider-name') || undefined;
            const timer = setTimeout(() => {
              timersRef.current.delete(impressionId);
              if (seenRef.current.has(impressionId)) return;
              seenRef.current.add(impressionId);
              track('excursion_impression', {
                excursionId,
                providerId,
                excursionTitle,
                providerName,
              });
            }, 1000);
            timersRef.current.set(impressionId, timer);
          } else {
            const t = timersRef.current.get(impressionId);
            if (t) {
              clearTimeout(t);
              timersRef.current.delete(impressionId);
            }
          }
        }
      },
      { threshold: [0.5] }
    );

    const nodes = document.querySelectorAll('[data-excursion-impression-id]');
    nodes.forEach((node) => observer.observe(node));

    return () => {
      observer.disconnect();
      timersRef.current.forEach((t) => clearTimeout(t));
      timersRef.current.clear();
    };
  }, [enabled, excursionIdsKey, excursions.length, track]);

  return <>{children}</>;
}
