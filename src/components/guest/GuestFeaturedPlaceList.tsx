import { ExternalLink, MapPin, Phone } from 'lucide-react';
import { isValidExternalUrl, openExternalUrl } from '../../lib/geocoding';
import {
  guidePinDisplayTitle,
  type GuideEmergencyPin,
  type GuidePlacePin,
} from '../../lib/houseGuidePlacePins';
import MirroredPhotoImg from '../shared/MirroredPhotoImg';

type Props = {
  pins: Array<GuidePlacePin | GuideEmergencyPin>;
  compact?: boolean;
};

export default function GuestFeaturedPlaceList({ pins, compact = false }: Props) {
  if (!pins.length) return null;

  return (
    <ul className={compact ? 'space-y-2' : 'space-y-2.5'}>
      {pins.map((pin, index) => {
        const title = guidePinDisplayTitle(pin);
        const category =
          'category' in pin && typeof pin.category === 'string' ? pin.category.trim() : '';
        const showCategory = Boolean(category && category !== title);
        const address = String(pin.address || '').trim();
        const phone = String(pin.phone || '').trim();
        const link = String(pin.mapsLink || '').trim();
        const hasMap = Boolean(link && isValidExternalUrl(link));
        const photoUrl = String(pin.photoUrl || '').trim();
        const googlePlaceId = String(pin.googlePlaceId || '').trim();
        const key = `${title}|${link}|${phone}|${index}`;

        return (
          <li
            key={key}
            className={`flex gap-3 rounded-xl border border-gray-100 bg-[#F8FAFA] ${
              compact ? 'px-3 py-2.5' : 'px-3.5 py-3'
            }`}
          >
            <div
              className={`rounded-lg overflow-hidden bg-white border border-gray-100 shrink-0 flex items-center justify-center text-gray-300 ${
                compact ? 'h-11 w-11' : 'h-14 w-14'
              }`}
            >
              {photoUrl ? (
                <MirroredPhotoImg
                  src={photoUrl}
                  alt=""
                  className="h-full w-full object-cover"
                  mirrorContext={{ googlePlaceId: googlePlaceId || undefined }}
                  fallback={<MapPin size={compact ? 16 : 18} />}
                />
              ) : (
                <MapPin size={compact ? 16 : 18} />
              )}
            </div>

            <div className="min-w-0 flex-1">
              {showCategory ? (
                <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">
                  {category}
                </p>
              ) : null}
              <p
                className={`font-semibold text-gray-900 leading-snug ${
                  compact ? 'text-sm' : 'text-[15px]'
                }`}
              >
                {title}
              </p>
              {address ? (
                <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{address}</p>
              ) : null}
              {phone ? (
                <a
                  href={`tel:${phone.replace(/[\s().\-/]/g, '')}`}
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 text-sm text-[#0B4F5C] font-medium mt-0.5"
                >
                  <Phone size={12} className="shrink-0 opacity-70" aria-hidden />
                  {phone}
                </a>
              ) : null}
            </div>

            {hasMap ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  openExternalUrl(link);
                }}
                className="inline-flex items-center gap-1 self-center text-xs font-bold uppercase tracking-wide text-[#C5A059] shrink-0"
              >
                Map <ExternalLink size={12} aria-hidden />
              </button>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
