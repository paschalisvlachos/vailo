/**
 * Fairness layer for database picks shown to guests.
 *
 * Goal: spread exposure across all of a host's gems / features instead of
 * always surfacing the same closest items. Items shown recently are pushed
 * down behind fresh ones inside the same distance band.
 */

const STORAGE_KEY = 'vailo:recentPicks:v1';
const MAX_ENTRIES = 80;
const FRESHNESS_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

type Entry = { key: string; ts: number };

/** Item shape used for key computation — only the identifying fields. */
type Identifiable = {
  name?: string;
  title?: string;
  googlePlaceId?: string;
  googleMapsUrl?: string;
  latitude?: number;
  longitude?: number;
  lat?: number;
  lng?: number;
};

function safeRead(): Entry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    return parsed.filter(
      (entry: unknown): entry is Entry =>
        !!entry &&
        typeof entry === 'object' &&
        typeof (entry as Entry).key === 'string' &&
        typeof (entry as Entry).ts === 'number' &&
        now - (entry as Entry).ts < FRESHNESS_WINDOW_MS
    );
  } catch {
    return [];
  }
}

function safeWrite(entries: Entry[]): void {
  if (typeof window === 'undefined') return;
  try {
    const trimmed = entries
      .slice()
      .sort((a, b) => b.ts - a.ts)
      .slice(0, MAX_ENTRIES);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // Ignore quota / private-mode errors — fairness is best-effort.
  }
}

function bareGooglePlaceId(raw: string | undefined): string | null {
  if (!raw) return null;
  const cleaned = String(raw).replace(/^places\//, '').trim();
  return cleaned || null;
}

/** Stable identifier for an item — same key across runs identifies the same place. */
export function pickKeyForItem(item: Identifiable | null | undefined): string | null {
  if (!item) return null;

  const placeId = bareGooglePlaceId(item.googlePlaceId);
  if (placeId) return `id:${placeId}`;

  if (typeof item.googleMapsUrl === 'string') {
    const match = item.googleMapsUrl.match(/[?&](?:query_place_id|destination_place_id)=([^&]+)/i);
    if (match) return `id:${decodeURIComponent(match[1])}`;
  }

  const lat = item.latitude ?? item.lat;
  const lng = item.longitude ?? item.lng;
  if (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng)) {
    return `geo:${lat.toFixed(3)},${lng.toFixed(3)}`;
  }

  const name = (item.name ?? item.title ?? '').toString().toLowerCase().trim();
  const compact = name.replace(/[^a-z0-9\u0370-\u03ff]/g, '');
  if (compact) return `name:${compact}`;

  return null;
}

/** Set of item keys shown in the last freshness window. */
export function getRecentlyShownKeys(): Set<string> {
  return new Set(safeRead().map((entry) => entry.key));
}

/** Record that these item keys were just shown to the guest. */
export function markItemsShown(items: Array<Identifiable | null | undefined>): void {
  const keys = items
    .map((item) => pickKeyForItem(item))
    .filter((k): k is string => !!k);
  if (!keys.length) return;

  const existing = safeRead();
  const now = Date.now();
  const map = new Map<string, number>(existing.map((entry) => [entry.key, entry.ts]));
  for (const key of keys) {
    map.set(key, now); // overwrite with newest timestamp
  }
  safeWrite(Array.from(map.entries()).map(([key, ts]) => ({ key, ts })));
}

/** Manual clear (for debugging / "forget me" actions). */
export function resetPicksFairness(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
