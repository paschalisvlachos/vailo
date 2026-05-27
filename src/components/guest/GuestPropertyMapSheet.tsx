import { MapPin, Navigation, X } from 'lucide-react';
import { buildGoogleDirectionsUrl, buildGoogleMapsOpenUrl } from '../../lib/googleReviewUrl';
import type { GuestLocaleKey } from '../../lib/guestLocale';

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle: string;
  addressLine?: string;
  latitude: string | number;
  longitude: string | number;
  googleMapsUrl?: string | null;
  t: (key: GuestLocaleKey) => string;
};

export default function GuestPropertyMapSheet({
  open,
  onClose,
  title,
  subtitle,
  addressLine,
  latitude,
  longitude,
  googleMapsUrl,
  t,
}: Props) {
  if (!open) return null;

  const embedSrc = `https://maps.google.com/maps?q=${latitude},${longitude}&z=15&output=embed`;
  const openUrl =
    googleMapsUrl?.trim() ||
    buildGoogleMapsOpenUrl(latitude, longitude, title);
  const directionsUrl = buildGoogleDirectionsUrl(latitude, longitude);

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-[#051F26]/60 backdrop-blur-sm p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="property-map-title"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-lg max-h-[min(92vh,640px)] rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-1 sm:hidden shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-200" aria-hidden />
        </div>

        <div className="px-5 pt-2 pb-4 border-b border-gray-100 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-[#C5A059] tracking-[0.2em] uppercase mb-1">
                {subtitle}
              </p>
              <h2 id="property-map-title" className="font-luxury text-xl text-[#051F26] font-medium truncate">
                {title}
              </h2>
              {addressLine && (
                <p className="text-xs text-gray-500 mt-1.5 flex items-start gap-1.5">
                  <MapPin size={12} className="text-[#C5A059] shrink-0 mt-0.5" />
                  <span>{addressLine}</span>
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-gray-400 hover:text-[#0B4F5C] hover:bg-gray-50 shrink-0"
              aria-label={t('close')}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="relative flex-1 min-h-[220px] sm:min-h-[280px] bg-gray-100">
          <iframe
            title={t('propertyLocation')}
            width="100%"
            height="100%"
            className="absolute inset-0 border-0"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            src={embedSrc}
          />
        </div>

        <div className="p-4 flex flex-col gap-2 shrink-0 bg-white border-t border-gray-100">
          <a
            href={openUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-3 rounded-xl bg-[#0B4F5C] hover:bg-[#083A43] text-white text-[10px] font-bold uppercase tracking-[0.14em] transition-colors flex items-center justify-center gap-2"
          >
            <MapPin size={14} className="text-[#C5A059]" />
            {t('openInMaps')}
          </a>
          <a
            href={directionsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-[#0B4F5C] text-[10px] font-bold uppercase tracking-[0.14em] transition-colors flex items-center justify-center gap-2 border border-gray-200"
          >
            <Navigation size={14} />
            {t('getDirections')}
          </a>
        </div>
      </div>
    </div>
  );
}
