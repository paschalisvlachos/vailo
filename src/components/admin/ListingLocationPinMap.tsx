import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Loader2, MapPin } from 'lucide-react';

type Props = {
  latitude: string;
  longitude: string;
  onChange: (coords: { latitude: string; longitude: string }) => void;
  addressLine?: string;
  area?: string;
  city?: string;
  country?: string;
  postCode?: string;
};

type PinSource = 'none' | 'geo' | 'geocode' | 'external' | 'user';

/** Wide Greece overview — not used as a pin location. */
const DEFAULT_CENTER: L.LatLngExpression = [38.2, 23.7];
const DEFAULT_ZOOM = 6;
/** Close street/building level when a pin is placed or autofilled. */
const PIN_ZOOM = 17;
const CITY_ZOOM = 14;
const GEOCODE_DEBOUNCE_MS = 700;

function zoomForAddressQuery(query: string): number {
  const parts = query
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length >= 3) return PIN_ZOOM;
  if (parts.length === 2) return 15;
  return CITY_ZOOM;
}

function parseCoord(value: string): number | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function coordsEqual(
  a: { lat: number; lng: number } | null | undefined,
  lat: number,
  lng: number
) {
  if (!a) return false;
  return Math.abs(a.lat - lat) < 1e-5 && Math.abs(a.lng - lng) < 1e-5;
}

function pinIcon() {
  return L.divIcon({
    className: '',
    html: `<div style="
      width:28px;height:28px;margin-left:-14px;margin-top:-28px;
      background:#0b4f5c;border:2px solid #fff;border-radius:50% 50% 50% 0;
      transform:rotate(-45deg);
      box-shadow:0 6px 14px rgba(11,79,92,0.35);
    "><div style="
      width:10px;height:10px;border-radius:999px;background:#fff;
      position:absolute;top:7px;left:7px;
    "></div></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
  });
}

function buildAddressQuery(parts: {
  addressLine?: string;
  area?: string;
  city?: string;
  country?: string;
  postCode?: string;
}): string {
  return [parts.addressLine, parts.area, parts.city, parts.postCode, parts.country]
    .map((p) => String(p || '').trim())
    .filter(Boolean)
    .join(', ');
}

async function geocodeAddress(
  query: string
): Promise<{ lat: number; lng: number } | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'Accept-Language': 'en',
      'User-Agent': 'VailoAdmin/1.0 (contact: support@vailo.app)',
    },
  });
  if (!res.ok) return null;
  const rows = (await res.json()) as Array<{ lat?: string; lon?: string }>;
  const hit = rows?.[0];
  const lat = hit?.lat != null ? Number(hit.lat) : NaN;
  const lng = hit?.lon != null ? Number(hit.lon) : NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function attachMarker(
  map: L.Map,
  markerRef: MutableRefObject<L.Marker | null>,
  lat: number,
  lng: number,
  onDragEnd: () => void
) {
  if (!markerRef.current) {
    markerRef.current = L.marker([lat, lng], {
      icon: pinIcon(),
      draggable: true,
    }).addTo(map);
    markerRef.current.on('dragend', onDragEnd);
  } else {
    markerRef.current.setLatLng([lat, lng]);
  }
}

export default function ListingLocationPinMap({
  latitude,
  longitude,
  onChange,
  addressLine = '',
  area = '',
  city = '',
  country = '',
  postCode = '',
}: Props) {
  const mapElRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const pinSourceRef = useRef<PinSource>('none');
  const lastWrittenRef = useRef<{ lat: number; lng: number } | null>(null);
  const lastGeocodedQueryRef = useRef('');
  const addressQueryRef = useRef('');
  const [status, setStatus] = useState<'idle' | 'locating' | 'geocoding'>('idle');

  const lat = parseCoord(latitude);
  const lng = parseCoord(longitude);
  const hasPin =
    lat != null &&
    lng != null &&
    !(lat === 0 && lng === 0) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180;

  const addressQuery = useMemo(
    () => buildAddressQuery({ addressLine, area, city, country, postCode }),
    [addressLine, area, city, country, postCode]
  );
  addressQueryRef.current = addressQuery;

  const publishCoords = (nextLat: number, nextLng: number, source: PinSource, zoom = PIN_ZOOM) => {
    const map = mapRef.current;
    if (!map) return;

    pinSourceRef.current = source;
    lastWrittenRef.current = { lat: nextLat, lng: nextLng };

    attachMarker(map, markerRef, nextLat, nextLng, () => {
      const pos = markerRef.current?.getLatLng();
      if (!pos) return;
      pinSourceRef.current = 'user';
      lastWrittenRef.current = { lat: pos.lat, lng: pos.lng };
      onChangeRef.current({
        latitude: pos.lat.toFixed(6),
        longitude: pos.lng.toFixed(6),
      });
    });

    // Avoid re-zooming on every click/drag when already close enough — only pan.
    const currentZoom = map.getZoom();
    const needsZoomIn = currentZoom < zoom - 0.6;
    if (source === 'user' && !needsZoomIn) {
      map.panTo([nextLat, nextLng], { animate: true, duration: 0.25 });
    } else {
      map.flyTo([nextLat, nextLng], Math.max(currentZoom, zoom), {
        animate: true,
        duration: 0.45,
      });
    }
    onChangeRef.current({
      latitude: nextLat.toFixed(6),
      longitude: nextLng.toFixed(6),
    });
    requestAnimationFrame(() => map.invalidateSize());
  };

  useEffect(() => {
    const el = mapElRef.current;
    if (!el || mapRef.current) return;

    const startLat = parseCoord(latitude);
    const startLng = parseCoord(longitude);
    const startHasPin =
      startLat != null &&
      startLng != null &&
      !(startLat === 0 && startLng === 0) &&
      startLat >= -90 &&
      startLat <= 90 &&
      startLng >= -180 &&
      startLng <= 180;

    const map = L.map(el, {
      zoomControl: true,
      attributionControl: true,
      scrollWheelZoom: false,
    }).setView(
      startHasPin ? [startLat!, startLng!] : DEFAULT_CENTER,
      startHasPin ? PIN_ZOOM : DEFAULT_ZOOM
    );

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    map.on('click', (e: L.LeafletMouseEvent) => {
      publishCoords(e.latlng.lat, e.latlng.lng, 'user', PIN_ZOOM);
    });

    mapRef.current = map;

    if (startHasPin) {
      pinSourceRef.current = 'external';
      lastWrittenRef.current = { lat: startLat!, lng: startLng! };
      attachMarker(map, markerRef, startLat!, startLng!, () => {
        const pos = markerRef.current?.getLatLng();
        if (!pos) return;
        pinSourceRef.current = 'user';
        lastWrittenRef.current = { lat: pos.lat, lng: pos.lng };
        onChangeRef.current({
          latitude: pos.lat.toFixed(6),
          longitude: pos.lng.toFixed(6),
        });
      });
    }

    requestAnimationFrame(() => map.invalidateSize());

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- map init once
  }, []);

  // Sync marker when coords change from outside (Maps autofill / parent).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !hasPin || lat == null || lng == null) return;

    if (coordsEqual(lastWrittenRef.current, lat, lng)) {
      // Echo of our own publish — keep marker in sync without re-classifying source.
      attachMarker(map, markerRef, lat, lng, () => {
        const pos = markerRef.current?.getLatLng();
        if (!pos) return;
        pinSourceRef.current = 'user';
        lastWrittenRef.current = { lat: pos.lat, lng: pos.lng };
        onChangeRef.current({
          latitude: pos.lat.toFixed(6),
          longitude: pos.lng.toFixed(6),
        });
      });
      return;
    }

    // Parent/autofill moved the pin — lock it against geo/geocode overrides.
    pinSourceRef.current = 'external';
    lastWrittenRef.current = { lat, lng };
    // Ignore the address string that arrived with autofill so Nominatim can't yank the pin.
    const lockedQuery = addressQueryRef.current.trim();
    if (lockedQuery) {
      lastGeocodedQueryRef.current = lockedQuery;
    }
    attachMarker(map, markerRef, lat, lng, () => {
      const pos = markerRef.current?.getLatLng();
      if (!pos) return;
      pinSourceRef.current = 'user';
      lastWrittenRef.current = { lat: pos.lat, lng: pos.lng };
      onChangeRef.current({
        latitude: pos.lat.toFixed(6),
        longitude: pos.lng.toFixed(6),
      });
    });
    const currentZoom = map.getZoom();
    if (currentZoom >= PIN_ZOOM - 0.6) {
      map.panTo([lat, lng], { animate: true, duration: 0.25 });
    } else {
      map.flyTo([lat, lng], PIN_ZOOM, { animate: true, duration: 0.45 });
    }
    requestAnimationFrame(() => map.invalidateSize());
  }, [hasPin, lat, lng]);

  // Device location only when we still have no pin at all.
  useEffect(() => {
    if (hasPin || !mapRef.current) return;
    if (pinSourceRef.current !== 'none') return;
    if (!navigator.geolocation) return;

    let cancelled = false;
    setStatus('locating');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (cancelled || !mapRef.current) return;
        if (pinSourceRef.current !== 'none') {
          setStatus('idle');
          return;
        }
        if (parseCoord(latitude) != null && parseCoord(longitude) != null) {
          setStatus('idle');
          return;
        }
        publishCoords(pos.coords.latitude, pos.coords.longitude, 'geo', PIN_ZOOM);
        setStatus('idle');
      },
      () => {
        if (!cancelled) setStatus('idle');
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 }
    );

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- until first pin exists
  }, [hasPin]);

  // Follow typed address — never override Maps autofill or a user-placed pin.
  useEffect(() => {
    const query = addressQuery.trim();
    if (query.length < 3) return;
    if (query === lastGeocodedQueryRef.current) return;

    const source = pinSourceRef.current;
    if (source === 'external' || source === 'user') {
      lastGeocodedQueryRef.current = query;
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (pinSourceRef.current === 'external' || pinSourceRef.current === 'user') {
        lastGeocodedQueryRef.current = query;
        return;
      }
      setStatus('geocoding');
      geocodeAddress(query)
        .then((hit) => {
          if (cancelled || !hit || !mapRef.current) return;
          if (pinSourceRef.current === 'external' || pinSourceRef.current === 'user') {
            lastGeocodedQueryRef.current = query;
            return;
          }
          lastGeocodedQueryRef.current = query;
          publishCoords(hit.lat, hit.lng, 'geocode', zoomForAddressQuery(query));
        })
        .catch(() => {
          /* ignore geocode failures */
        })
        .finally(() => {
          if (!cancelled) setStatus('idle');
        });
    }, GEOCODE_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- debounce on address text only
  }, [addressQuery]);

  return (
    <div className="md:col-span-2 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-vailo-dark flex items-center gap-1.5">
            <MapPin size={15} className="text-vailo-teal" />
            Location pin *
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            Maps Auto-fill sets the exact pin. Otherwise it starts at your location and follows the
            address as you type — click or drag to fine-tune.
          </p>
        </div>
        <div className="text-right shrink-0">
          {status !== 'idle' ? (
            <p className="text-[11px] text-vailo-teal inline-flex items-center gap-1 font-medium">
              <Loader2 size={12} className="animate-spin" />
              {status === 'locating' ? 'Locating…' : 'Updating pin…'}
            </p>
          ) : null}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
            Latitude
          </span>
          <input
            type="text"
            inputMode="decimal"
            value={latitude}
            onChange={(e) => onChange({ latitude: e.target.value, longitude })}
            placeholder="e.g. 35.5138"
            className="mt-1 w-full rounded-lg border border-[#e1e1e1] px-2.5 py-1.5 text-xs font-mono text-vailo-dark outline-none focus:ring-2 focus:ring-vailo-teal/30"
          />
        </label>
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
            Longitude
          </span>
          <input
            type="text"
            inputMode="decimal"
            value={longitude}
            onChange={(e) => onChange({ latitude, longitude: e.target.value })}
            placeholder="e.g. 24.0180"
            className="mt-1 w-full rounded-lg border border-[#e1e1e1] px-2.5 py-1.5 text-xs font-mono text-vailo-dark outline-none focus:ring-2 focus:ring-vailo-teal/30"
          />
        </label>
      </div>
      <div
        ref={mapElRef}
        className="h-52 w-full rounded-xl border border-[#e1e1e1] overflow-hidden bg-[#eef2f1] z-0"
      />
    </div>
  );
}
