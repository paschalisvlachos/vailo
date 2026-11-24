import { useEffect, useState, type ImgHTMLAttributes, type ReactNode } from 'react';
import {
  isGoogleCdnPlacePhotoUrl,
  isGooglePlacesPhotoUrl,
  isPlacesApiMediaPhotoUrl,
  mirrorPlacePhotoUrl,
  type MirrorPlacePhotoParams,
} from '../../lib/placePhotoResolver';
import { extractGooglePlaceIdFromPhotoUrl } from '../../lib/adminPhotoUrl';
import { getCachedMirrorResult } from '../../lib/photoMirrorCache';

export type MirrorContext = Pick<
  MirrorPlacePhotoParams,
  | 'country'
  | 'areaId'
  | 'docId'
  | 'googlePlaceId'
  | 'propertyId'
  | 'propertyTypeId'
  | 'propertyGemId'
>;

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src?: string | null;
  mirrorContext?: MirrorContext;
  /** Called when a Google URL was mirrored to Firebase Storage (e.g. persist to Firestore). */
  onMirrored?: (firebaseUrl: string) => void;
  fallback?: ReactNode;
};

/**
 * Renders place photos reliably:
 * - Places API media URLs are mirrored to Firebase Storage before display (cannot load in <img>).
 * - Google CDN / grass-cs URLs show immediately with referrerPolicy=no-referrer, and mirror in the background.
 */
export default function MirroredPhotoImg({
  src,
  mirrorContext,
  onMirrored,
  fallback = null,
  alt = '',
  ...imgProps
}: Props) {
  const [displaySrc, setDisplaySrc] = useState(() => {
    const trimmed = String(src || '').trim();
    if (!trimmed) return '';
    // Places API media never works in <img>; wait for mirror.
    if (isPlacesApiMediaPhotoUrl(trimmed)) return '';
    return trimmed;
  });
  const [showFallback, setShowFallback] = useState(false);
  const [isMirroring, setIsMirroring] = useState(false);

  useEffect(() => {
    const trimmed = String(src || '').trim();
    setShowFallback(false);
    setIsMirroring(false);

    if (!trimmed) {
      setDisplaySrc('');
      return;
    }

    const cached = getCachedMirrorResult(trimmed);
    if (cached !== undefined) {
      if (cached) {
        setDisplaySrc(cached);
        return;
      }
      // Prior mirror failed — still try CDN URLs with no-referrer; API media has no recovery.
      if (isPlacesApiMediaPhotoUrl(trimmed)) {
        setDisplaySrc('');
        setShowFallback(true);
        return;
      }
      setDisplaySrc(trimmed);
      return;
    }

    if (!isGooglePlacesPhotoUrl(trimmed)) {
      setDisplaySrc(trimmed);
      return;
    }

    // CDN / grass-cs: show immediately (no-referrer), mirror in background.
    // Places API media: blank until mirror finishes.
    const canShowDirect = isGoogleCdnPlacePhotoUrl(trimmed);
    setDisplaySrc(canShowDirect ? trimmed : '');
    setIsMirroring(!canShowDirect);

    let cancelled = false;
    const googlePlaceId =
      mirrorContext?.googlePlaceId || extractGooglePlaceIdFromPhotoUrl(trimmed);

    mirrorPlacePhotoUrl({
      photoUrl: trimmed,
      country: mirrorContext?.country,
      areaId: mirrorContext?.areaId,
      docId: mirrorContext?.docId,
      googlePlaceId,
      propertyId: mirrorContext?.propertyId,
      propertyTypeId: mirrorContext?.propertyTypeId,
      propertyGemId: mirrorContext?.propertyGemId,
    })
      .then((mirrored) => {
        if (cancelled) return;
        setIsMirroring(false);
        if (mirrored && !isGooglePlacesPhotoUrl(mirrored)) {
          setDisplaySrc(mirrored);
          onMirrored?.(mirrored);
        } else if (!canShowDirect) {
          setShowFallback(true);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setIsMirroring(false);
        if (!canShowDirect) setShowFallback(true);
      });

    return () => {
      cancelled = true;
    };
  }, [
    src,
    mirrorContext?.country,
    mirrorContext?.areaId,
    mirrorContext?.docId,
    mirrorContext?.googlePlaceId,
    mirrorContext?.propertyId,
    mirrorContext?.propertyTypeId,
    mirrorContext?.propertyGemId,
  ]);

  if (!src || showFallback) {
    return <>{fallback}</>;
  }

  if (isMirroring || !displaySrc) {
    return <>{fallback}</>;
  }

  // Google CDN photos need no-referrer; partner/WP hotlinks often require a normal referrer.
  const needsNoReferrer = isGooglePlacesPhotoUrl(displaySrc) || isGoogleCdnPlacePhotoUrl(displaySrc);

  return (
    <img
      {...imgProps}
      src={displaySrc}
      alt={alt}
      {...(needsNoReferrer ? { referrerPolicy: 'no-referrer' as const } : {})}
      onError={() => setShowFallback(true)}
    />
  );
}
