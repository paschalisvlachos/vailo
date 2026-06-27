import { createPortal } from 'react-dom';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { MapPin, Navigation, X } from 'lucide-react';
import {
  buildGoogleMapsEmbedUrl,
  buildPlaceMapUrls,
  isValidExternalUrl,
  openExternalUrl,
  resolveGooglePlaceIdFromDetails,
} from '../../lib/geocoding';
import type { GuestLocaleKey } from '../../lib/guestLocale';
import { GUEST_PORTAL_Z } from '../../lib/guestPortalLayers';

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle: string;
  addressLine?: string;
  latitude: string | number;
  longitude: string | number;
  googleMapsUrl?: string | null;
  googlePlaceId?: string | null;
  areaHint?: string;
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
  googlePlaceId,
  areaHint = '',
  t,
}: Props) {
  useBodyScrollLock(open);

  if (!open || typeof document === 'undefined') return null;

  const lat = parseFloat(String(latitude));
  const lng = parseFloat(String(longitude));
  const embedSrc = buildGoogleMapsEmbedUrl({
    title,
    areaHint,
    latitude,
    longitude,
    googlePlaceId,
    googleMapsUrl,
    zoom: 15,
  });
  const resolvedPlaceId = resolveGooglePlaceIdFromDetails({ googlePlaceId, googleMapsUrl });
  const built = buildPlaceMapUrls(resolvedPlaceId, lat, lng, title);
  const openUrl =
    (built.googleMapsUrl && isValidExternalUrl(built.googleMapsUrl)
      ? built.googleMapsUrl
      : null) ||
    (googleMapsUrl?.trim() && isValidExternalUrl(googleMapsUrl) ? googleMapsUrl.trim() : '') ||
    built.googleMapsUrl;
  const directionsUrl = built.navigateUrl;

  return createPortal(
    <div
      className={`fixed inset-0 ${GUEST_PORTAL_Z.detailSheet} flex items-end sm:items-center justify-center bg-[#051F26]/60 backdrop-blur-sm p-0 sm:p-4`}
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
              <p className="guest-eyebrow mb-1">
                {subtitle}
              </p>
              <h2 id="property-map-title" className="font-luxury text-xl text-[#051F26] font-medium truncate">
                {title}
              </h2>
              {addressLine && (
                <p className="text-sm text-gray-500 mt-1.5 flex items-start gap-1.5 leading-relaxed">
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
          <button
            type="button"
            onClick={() => openExternalUrl(openUrl)}
            className="guest-btn-action w-full py-3.5 rounded-xl bg-[#0B4F5C] hover:bg-[#083A43] text-white transition-colors flex items-center justify-center gap-2"
          >
            <MapPin size={14} className="text-[#C5A059]" />
            {t('openInMaps')}
          </button>
          <button
            type="button"
            onClick={() => openExternalUrl(directionsUrl)}
            className="guest-btn-action w-full py-3.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-[#0B4F5C] transition-colors flex items-center justify-center gap-2 border border-gray-200"
          >
            <Navigation size={14} />
            {t('getDirections')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
