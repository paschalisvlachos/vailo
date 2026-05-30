import { ALLTRAILS_EMBED_IFRAME_TITLE } from '../../lib/allTrailsTrail';

type Props = {
  name?: string;
  embedSrc: string;
  allTrailsUrl?: string | null;
  className?: string;
};

/** Guest-facing AllTrails route widget + optional link to trail page. */
export default function AllTrailsTrailEmbed({
  name,
  embedSrc,
  allTrailsUrl,
  className = '',
}: Props) {
  const src = embedSrc.trim();
  const pageUrl = String(allTrailsUrl || '').trim();
  if (!src) return null;

  return (
    <div className={className}>
      <div className="rounded-2xl overflow-hidden border border-white/15 bg-black/20">
        <iframe
          className="alltrails w-full border-0"
          src={src}
          height={360}
          title={name ? `${ALLTRAILS_EMBED_IFRAME_TITLE} — ${name}` : ALLTRAILS_EMBED_IFRAME_TITLE}
          loading="lazy"
          scrolling="no"
          allow="geolocation"
        />
      </div>
      {pageUrl ? (
        <a
          href={pageUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 mt-3 text-sm font-semibold text-vailo-gold hover:text-white transition-colors"
        >
          View full trail on AllTrails →
        </a>
      ) : null}
    </div>
  );
}
