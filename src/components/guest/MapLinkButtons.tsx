import { Map as MapIcon, Navigation } from 'lucide-react';
import { getItemMapLinks, isValidExternalUrl, openExternalUrl } from '../../lib/geocoding';

type MapItem = Parameters<typeof getItemMapLinks>[0];

type Props = {
  item: MapItem;
  mapAreaHint: string;
  viewLabel: string;
  goLabel: string;
  className?: string;
};

/** View / Go map actions — only rendered when a valid URL can be built. */
export default function MapLinkButtons({
  item,
  mapAreaHint,
  viewLabel,
  goLabel,
  className = 'flex gap-2 flex-1',
}: Props) {
  const links = getItemMapLinks(item, mapAreaHint);
  const canView = isValidExternalUrl(links.googleMapsUrl);
  const canGo = isValidExternalUrl(links.navigateUrl);

  if (!canView && !canGo) return null;

  return (
    <div className={className}>
      {canView && (
        <button
          type="button"
          onClick={() => openExternalUrl(links.googleMapsUrl)}
          className="guest-btn-action flex-1 py-2.5 rounded-lg flex items-center justify-center transition-all bg-vailo-gold/20 border border-vailo-gold/50 text-white hover:bg-vailo-gold/30 hover:border-vailo-gold/70 shadow-[0_2px_10px_rgba(197,160,89,0.18)]"
        >
          <MapIcon size={14} className="mr-1 text-vailo-gold" /> {viewLabel}
        </button>
      )}
      {canGo && (
        <button
          type="button"
          onClick={() => openExternalUrl(links.navigateUrl)}
          className="guest-btn-action flex-1 py-2.5 rounded-lg flex items-center justify-center transition-all bg-gradient-to-br from-vailo-gold to-[#a88648] text-white hover:from-[#d4ad65] hover:to-vailo-gold shadow-[0_4px_14px_rgba(197,160,89,0.35)]"
        >
          <Navigation size={13} className="mr-1" /> {goLabel}
        </button>
      )}
    </div>
  );
}
