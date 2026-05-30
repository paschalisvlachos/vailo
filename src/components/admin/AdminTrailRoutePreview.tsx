import { ExternalLink } from 'lucide-react';
import { AdminLabel } from './AdminPageHeader';
import { ALLTRAILS_EMBED_IFRAME_TITLE, normalizeAllTrailsEmbedSrc } from '../../lib/allTrailsTrail';

const linkBtnBase =
  'inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors';

type Props = {
  name?: string;
  embedSrc?: string | null;
  allTrailsUrl?: string | null;
};

/** Official AllTrails route widget (Share → Embed) + link to trail page. */
export default function AdminTrailRoutePreview({ name, embedSrc, allTrailsUrl }: Props) {
  const iframeSrc = normalizeAllTrailsEmbedSrc(String(embedSrc || '').trim());
  const pageUrl = String(allTrailsUrl || '').trim();

  return (
    <div className="sm:col-span-2 lg:col-span-3">
      <AdminLabel>Route map (AllTrails embed)</AdminLabel>
      <p className="text-xs text-gray-500 mb-3 leading-relaxed">
        The full trail path is drawn by AllTrails inside this frame (not stored as GPX in Vailo).
        Guests see the route here; use the link below for reviews and navigation on AllTrails.
      </p>

      {iframeSrc ? (
        <>
          <p className="text-[11px] text-gray-400 mb-2 font-mono truncate" title={iframeSrc}>
            {iframeSrc}
          </p>
        <div className="rounded-xl overflow-hidden border border-gray-200 bg-white mb-3">
          <iframe
            className="alltrails w-full border-0"
            src={iframeSrc}
            height={400}
            title={name ? `${ALLTRAILS_EMBED_IFRAME_TITLE} — ${name}` : ALLTRAILS_EMBED_IFRAME_TITLE}
            loading="lazy"
            scrolling="no"
            allow="geolocation"
          />
        </div>
        </>
      ) : (
        <div className="rounded-xl border border-dashed border-amber-200 bg-amber-50/80 px-4 py-6 text-sm text-amber-900 mb-3 leading-relaxed">
          No embed URL on this trail yet — run <strong>Synchronize</strong> to import it from
          AllTrails automatically.
        </div>
      )}

      {pageUrl ? (
        <a
          href={pageUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`${linkBtnBase} bg-vailo-gold hover:bg-vailo-gold-hover text-vailo-dark shadow-sm shadow-vailo-gold/25`}
        >
          <ExternalLink size={16} />
          More on AllTrails
        </a>
      ) : null}
    </div>
  );
}
