import { useEffect, useState, type ImgHTMLAttributes, type ReactNode } from 'react';
import { isGooglePlacesPhotoUrl, mirrorPlacePhotoUrl, type MirrorPlacePhotoParams } from '../../lib/placePhotoResolver';
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
 * Renders place photos reliably: Google Places media URLs are mirrored to Firebase Storage
 * before display, because they cannot be loaded in browser <img> tags.
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
    if (!trimmed || isGooglePlacesPhotoUrl(trimmed)) return '';
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

    if (!isGooglePlacesPhotoUrl(trimmed)) {
      setDisplaySrc(trimmed);
      return;
    }

    const cached = getCachedMirrorResult(trimmed);
    if (cached !== undefined) {
      if (cached) {
        setDisplaySrc(cached);
      } else {
        setDisplaySrc('');
        setShowFallback(true);
      }
      return;
    }

    let cancelled = false;
    setDisplaySrc('');
    setIsMirroring(true);

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
        } else {
          setShowFallback(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setIsMirroring(false);
          setShowFallback(true);
        }
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

  return (
    <img
      {...imgProps}
      src={displaySrc}
      alt={alt}
      onError={() => setShowFallback(true)}
    />
  );
}
