import { normalizePlaceName } from './placeNameUtils';

export type DiscoveredPlaceCompareInput = {
  id: string;
  name?: string;
  category?: string;
  categories?: string[];
  description?: string;
  latitude?: number | null;
  longitude?: number | null;
  googleMapsUrl?: string;
  verifiedGoogleMapsUrl?: string;
  photoUrl?: string;
  rating?: number | null;
  usageCount?: number;
  source?: string;
  alternateTitles?: string[];
};

type CompareFieldDef = {
  key: string;
  label: string;
  normalize: (place: DiscoveredPlaceCompareInput) => string;
  display: (place: DiscoveredPlaceCompareInput) => string;
};

function cleanText(value: string | undefined | null): string {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ');
}

function formatCoord(value: number | null | undefined): string {
  if (typeof value !== 'number' || isNaN(value)) return '';
  return value.toFixed(5);
}

function formatAlternateTitles(titles: string[] | undefined): string {
  if (!titles?.length) return '';
  return [...titles]
    .map((t) => normalizePlaceName(t))
    .filter(Boolean)
    .sort()
    .join(' | ');
}

function formatCategories(place: DiscoveredPlaceCompareInput): string {
  if (Array.isArray(place.categories) && place.categories.length > 0) {
    return place.categories.map((c) => cleanText(c)).filter(Boolean).join(', ');
  }
  return cleanText(place.category);
}

const COMPARE_FIELDS: CompareFieldDef[] = [
  {
    key: 'name',
    label: 'Name',
    normalize: (p) => normalizePlaceName(p.name || ''),
    display: (p) => cleanText(p.name) || '—',
  },
  {
    key: 'category',
    label: 'Categories',
    normalize: (p) => formatCategories(p).toLowerCase(),
    display: (p) => formatCategories(p) || '—',
  },
  {
    key: 'description',
    label: 'Description',
    normalize: (p) => cleanText(p.description).toLowerCase(),
    display: (p) => cleanText(p.description) || '—',
  },
  {
    key: 'coordinates',
    label: 'Coordinates',
    normalize: (p) => {
      const lat = formatCoord(p.latitude);
      const lng = formatCoord(p.longitude);
      if (!lat && !lng) return '';
      return `${lat},${lng}`;
    },
    display: (p) => {
      const lat = formatCoord(p.latitude);
      const lng = formatCoord(p.longitude);
      if (!lat && !lng) return '—';
      return `${lat}, ${lng}`;
    },
  },
  {
    key: 'verifiedGoogleMapsUrl',
    label: 'Verified Maps link',
    normalize: (p) => cleanText(p.verifiedGoogleMapsUrl).toLowerCase(),
    display: (p) => cleanText(p.verifiedGoogleMapsUrl) || '—',
  },
  {
    key: 'googleMapsUrl',
    label: 'Discovered Maps link',
    normalize: (p) => cleanText(p.googleMapsUrl).toLowerCase(),
    display: (p) => cleanText(p.googleMapsUrl) || '—',
  },
  {
    key: 'photoUrl',
    label: 'Photo URL',
    normalize: (p) => cleanText(p.photoUrl),
    display: (p) => cleanText(p.photoUrl) || '—',
  },
  {
    key: 'rating',
    label: 'Rating',
    normalize: (p) =>
      typeof p.rating === 'number' && !isNaN(p.rating) ? p.rating.toFixed(1) : '',
    display: (p) =>
      typeof p.rating === 'number' && !isNaN(p.rating) ? p.rating.toFixed(1) : '—',
  },
  {
    key: 'alternateTitles',
    label: 'Alternate titles',
    normalize: (p) => formatAlternateTitles(p.alternateTitles),
    display: (p) => (p.alternateTitles?.length ? p.alternateTitles.join(', ') : '—'),
  },
  {
    key: 'source',
    label: 'Source',
    normalize: (p) => cleanText(p.source).toLowerCase(),
    display: (p) => cleanText(p.source) || '—',
  },
];

export type CompareFieldDiff = {
  field: string;
  label: string;
  entries: Array<{ id: string; name: string; displayValue: string }>;
};

export type CompareDiscoveredPlacesResult = {
  isExactMatch: boolean;
  placeCount: number;
  differences: CompareFieldDiff[];
};

/** Compare 2+ discovered-place records field by field. */
export function compareDiscoveredPlaces(
  places: DiscoveredPlaceCompareInput[]
): CompareDiscoveredPlacesResult {
  if (places.length < 2) {
    return { isExactMatch: true, placeCount: places.length, differences: [] };
  }

  const differences: CompareFieldDiff[] = [];

  for (const field of COMPARE_FIELDS) {
    const entries = places.map((place) => ({
      id: place.id,
      name: place.name?.trim() || 'Untitled',
      normalized: field.normalize(place),
      displayValue: field.display(place),
    }));

    const uniqueNormalized = new Set(entries.map((e) => e.normalized));
    if (uniqueNormalized.size <= 1) continue;

    differences.push({
      field: field.key,
      label: field.label,
      entries: entries.map(({ id, name, displayValue: dv }) => ({ id, name, displayValue: dv })),
    });
  }

  return {
    isExactMatch: differences.length === 0,
    placeCount: places.length,
    differences,
  };
}
