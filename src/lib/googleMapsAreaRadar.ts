const MAPS_SCRIPT_ID = 'vailo-google-maps-script';
const MAPS_CALLBACK_NAME = '__vailoGoogleMapsInit';

let mapsLoadPromise: Promise<typeof google.maps> | null = null;

export function getGoogleMapsApiKey(): string {
  return String(import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '').trim();
}

export function loadGoogleMapsApi(): Promise<typeof google.maps> {
  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) {
    return Promise.reject(
      new Error('Missing VITE_GOOGLE_MAPS_API_KEY in .env — add your browser Maps key and restart dev.')
    );
  }

  if (typeof window !== 'undefined' && window.google?.maps) {
    return Promise.resolve(window.google.maps);
  }

  if (mapsLoadPromise) return mapsLoadPromise;

  mapsLoadPromise = new Promise((resolve, reject) => {
    const finish = () => {
      if (window.google?.maps) resolve(window.google.maps);
      else reject(new Error('Google Maps loaded but google.maps is missing.'));
    };

    const existing = document.getElementById(MAPS_SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      if (window.google?.maps) {
        finish();
        return;
      }
      existing.addEventListener('load', finish);
      existing.addEventListener('error', () => reject(new Error('Google Maps script failed to load.')));
      return;
    }

    (window as unknown as Record<string, () => void>)[MAPS_CALLBACK_NAME] = () => {
      delete (window as unknown as Record<string, unknown>)[MAPS_CALLBACK_NAME];
      finish();
    };

    const script = document.createElement('script');
    script.id = MAPS_SCRIPT_ID;
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&loading=async&callback=${MAPS_CALLBACK_NAME}`;
    script.onerror = () => {
      delete (window as unknown as Record<string, unknown>)[MAPS_CALLBACK_NAME];
      reject(new Error('Google Maps script failed to load. Check API key and referrer restrictions.'));
    };
    document.head.appendChild(script);
  });

  return mapsLoadPromise;
}

export async function geocodeAreaCenter(
  areaName: string,
  country: string
): Promise<{ lat: number; lng: number } | null> {
  const query = [areaName, country].filter(Boolean).join(', ');
  if (!query.trim()) return null;
  try {
    const params = new URLSearchParams({
      format: 'json',
      q: query,
      limit: '1',
    });
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const hits = (await res.json()) as Array<{ lat?: string; lon?: string }>;
    const hit = hits[0];
    if (!hit?.lat || !hit?.lon) return null;
    const lat = parseFloat(hit.lat);
    const lng = parseFloat(hit.lon);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}
