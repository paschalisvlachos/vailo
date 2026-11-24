import { createPortal } from 'react-dom';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { ExternalLink, MapPin, Navigation, X } from 'lucide-react';
import {
  buildGoogleMapsEmbedUrl,
  buildPlaceMapUrls,
  isValidExternalUrl,
  openExternalUrl,
  resolveGooglePlaceIdFromDetails,
} from '../../lib/geocoding';
import {
  coordsFromGuidePin,
  guidePinDisplayTitle,
  type GuideEmergencyPin,
  type GuidePlacePin,
} from '../../lib/houseGuidePlacePins';
import type { GuestLocaleKey } from '../../lib/guestLocale';
import { GUEST_PORTAL_Z } from '../../lib/guestPortalLayers';

export type GuestMapNearbyPlace = GuidePlacePin | GuideEmergencyPin;

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
  nearbyPlaces?: GuestMapNearbyPlace[];
  t: (key: GuestLocaleKey) => string;
};

function buildMultiStopMapsUrl(
  originLat: number,
  originLng: number,
  places: GuestMapNearbyPlace[]
): string | null {
  const stops: string[] = [];
  for (const place of places) {
    const coords = coordsFromGuidePin(place);
    if (coords) {
      stops.push(`${coords.lat},${coords.lng}`);
      continue;
    }
    const link = String(place.mapsLink || '').trim();
    if (link && isValidExternalUrl(link)) {
      // Fall back to opening the first mappable place link later; skip for multi-stop.
      continue;
    }
  }
  if (stops.length === 0) return null;
  const origin = `${originLat},${originLng}`;
  const destination = stops[stops.length - 1];
  const waypoints = stops.slice(0, -1);
  const params = new URLSearchParams({
    api: '1',
    origin,
    destination,
  });
  if (waypoints.length) {
    params.set('waypoints', waypoints.join('|'));
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

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
  nearbyPlaces = [],
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
    zoom: nearbyPlaces.length > 0 ? 13 : 15,
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
  const hasValidOrigin = Number.isFinite(lat) && Number.isFinite(lng);
  const allOnMapsUrl =
    hasValidOrigin ? buildMultiStopMapsUrl(lat, lng, nearbyPlaces) : null;

  return createPortal(
    <div
      className={`fixed inset-0 ${GUEST_PORTAL_Z.detailSheet} flex items-end sm:items-center justify-center bg-[#051F26]/60 backdrop-blur-sm p-0 sm:p-4`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="property-map-title"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-lg max-h-[min(92vh,720px)] rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 duration-300"
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

        <div className="relative shrink-0 h-[200px] sm:h-[240px] bg-gray-100">
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

        {nearbyPlaces.length > 0 ? (
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-4 border-t border-gray-100">
            <div className="flex items-center justify-between gap-3 mb-3">
              <p className="text-xs font-bold uppercase tracking-wider text-gray-400">
                Nearby places · {nearbyPlaces.length}
              </p>
              {allOnMapsUrl ? (
                <button
                  type="button"
                  onClick={() => openExternalUrl(allOnMapsUrl)}
                  className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-[#C5A059]"
                >
                  Open all <ExternalLink size={12} aria-hidden />
                </button>
              ) : null}
            </div>
            <ul className="space-y-2">
              {nearbyPlaces.map((place, index) => {
                const label = guidePinDisplayTitle(place);
                const category =
                  'category' in place && typeof place.category === 'string'
                    ? place.category.trim()
                    : '';
                const link = String(place.mapsLink || '').trim();
                const hasMap = Boolean(link && isValidExternalUrl(link));
                const phone = String(place.phone || '').trim();
                return (
                  <li
                    key={`${label}|${link}|${index}`}
                    className="flex items-center gap-3 rounded-xl border border-gray-100 bg-[#F8FAFA] px-3 py-2.5"
                  >
                    <div className="h-9 w-9 rounded-lg bg-white border border-gray-100 flex items-center justify-center text-[#C5A059] shrink-0">
                      <MapPin size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      {category && category !== label ? (
                        <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">
                          {category}
                        </p>
                      ) : null}
                      <p className="text-sm font-semibold text-gray-900 truncate">{label}</p>
                      {phone ? (
                        <p className="text-xs text-gray-500 truncate">{phone}</p>
                      ) : null}
                    </div>
                    {hasMap ? (
                      <button
                        type="button"
                        onClick={() => openExternalUrl(link)}
                        className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-[#C5A059] shrink-0"
                      >
                        Map <ExternalLink size={12} aria-hidden />
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

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
