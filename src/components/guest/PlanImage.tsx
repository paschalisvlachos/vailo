import MirroredPhotoImg, { type MirrorContext } from '../shared/MirroredPhotoImg';

type Props = {
  src?: string;
  alt?: string;
  className?: string;
  /** className applied to the Vailo-branded fallback (e.g. h-36 background). */
  fallbackClassName?: string;
  mirrorContext?: MirrorContext;
};

const brandedFallback = (fallbackClassName: string | undefined, className: string, alt: string) => (
  <div
    className={`relative flex items-center justify-center bg-gradient-to-br from-[#0B4F5C]/8 to-[#C5A059]/10 ${fallbackClassName ?? className}`}
    aria-label={alt || 'Vailo'}
  >
    <img
      src="/vailoLogo.png"
      alt=""
      className="h-12 w-auto opacity-55"
      loading="lazy"
    />
  </div>
);

/** Image with Vailo-branded fallback when src is missing or fails to load. */
export default function PlanImage({
  src,
  alt = '',
  className = '',
  fallbackClassName,
  mirrorContext,
}: Props) {
  const trimmed = typeof src === 'string' ? src.trim() : '';

  if (!trimmed) {
    return brandedFallback(fallbackClassName, className, alt);
  }

  return (
    <MirroredPhotoImg
      src={trimmed}
      alt={alt}
      loading="lazy"
      className={className}
      mirrorContext={mirrorContext}
      fallback={brandedFallback(fallbackClassName, className, alt)}
    />
  );
}
