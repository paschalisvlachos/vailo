/**
 * Shared House Guide map / emergency pin shapes.
 * Optional fields match Nearby essentials so pins can carry photo, address, etc.
 */

export type GuidePlacePin = {
  title: string;
  mapsLink: string;
  phone?: string;
  address?: string;
  photoUrl?: string;
  googlePlaceId?: string;
  rating?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  /** Essential slot id when prefilled (e.g. supermarket, airport). */
  slotId?: string;
};

export type GuideEmergencyPin = GuidePlacePin & {
  category: string;
};

export function emptyGuidePlacePin(): GuidePlacePin {
  return {
    title: '',
    mapsLink: '',
    phone: '',
    address: '',
    photoUrl: '',
    googlePlaceId: '',
    rating: null,
    latitude: null,
    longitude: null,
    slotId: '',
  };
}

export function emptyGuideEmergencyPin(): GuideEmergencyPin {
  return {
    ...emptyGuidePlacePin(),
    category: '',
  };
}

function asTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim();
}

function asOptionalNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Normalize a loose object into a GuidePlacePin (drops empty optional noise). */
export function normalizeGuidePlacePin(raw: unknown): GuidePlacePin | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const title = asTrimmedString(row.title ?? row.name);
  const mapsLink = asTrimmedString(row.mapsLink ?? row.googleMapsUrl);
  const phone = asTrimmedString(row.phone ?? row.phoneNumber);
  const address = asTrimmedString(row.address);
  const photoUrl = asTrimmedString(row.photoUrl);
  const googlePlaceId = asTrimmedString(row.googlePlaceId);
  const slotId = asTrimmedString(row.slotId);
  const rating = asOptionalNumber(row.rating);
  const latitude = asOptionalNumber(row.latitude);
  const longitude = asOptionalNumber(row.longitude);

  if (!title && !mapsLink && !phone && !address && !photoUrl) return null;

  const pin: GuidePlacePin = {
    title,
    mapsLink,
  };
  if (phone) pin.phone = phone;
  if (address) pin.address = address;
  if (photoUrl) pin.photoUrl = photoUrl;
  if (googlePlaceId) pin.googlePlaceId = googlePlaceId;
  if (slotId) pin.slotId = slotId;
  if (rating != null) pin.rating = rating;
  if (latitude != null) pin.latitude = latitude;
  if (longitude != null) pin.longitude = longitude;
  return pin;
}

export function normalizeGuideEmergencyPin(raw: unknown): GuideEmergencyPin | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const base = normalizeGuidePlacePin(raw);
  const category = asTrimmedString(row.category);
  if (!base && !category) return null;
  const pin: GuideEmergencyPin = {
    ...(base || emptyGuidePlacePin()),
    category,
  };
  if (!pin.title && !pin.phone && !pin.mapsLink && !pin.photoUrl && !category) return null;
  return pin;
}

/** Display label for a pin — prefer real place name, then category/slot label. */
export function guidePinDisplayTitle(pin: GuidePlacePin | GuideEmergencyPin): string {
  const title = String(pin.title || '').trim();
  const category =
    'category' in pin && typeof pin.category === 'string' ? pin.category.trim() : '';
  if (title && category && title !== category) return title;
  return title || category || 'Place';
}

export function normalizeGuidePlacePinList(raw: unknown): GuidePlacePin[] {
  if (!Array.isArray(raw)) return [];
  const out: GuidePlacePin[] = [];
  for (const entry of raw) {
    const pin = normalizeGuidePlacePin(entry);
    if (pin) out.push(pin);
  }
  return out;
}

export function normalizeGuideEmergencyPinList(raw: unknown): GuideEmergencyPin[] {
  if (!Array.isArray(raw)) return [];
  const out: GuideEmergencyPin[] = [];
  for (const entry of raw) {
    const pin = normalizeGuideEmergencyPin(entry);
    if (pin) out.push(pin);
  }
  return out;
}

/** Pull lat/lng from pin fields or a Google Maps URL. */
export function coordsFromGuidePin(
  pin: Pick<GuidePlacePin, 'latitude' | 'longitude' | 'mapsLink'>
): { lat: number; lng: number } | null {
  const lat = asOptionalNumber(pin.latitude);
  const lng = asOptionalNumber(pin.longitude);
  if (lat != null && lng != null && !(lat === 0 && lng === 0)) {
    return { lat, lng };
  }
  const raw = String(pin.mapsLink || '').trim();
  if (!raw) return null;
  const match =
    raw.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) ||
    raw.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/) ||
    raw.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (!match) return null;
  const fromUrlLat = asOptionalNumber(match[1]);
  const fromUrlLng = asOptionalNumber(match[2]);
  if (fromUrlLat == null || fromUrlLng == null || (fromUrlLat === 0 && fromUrlLng === 0)) {
    return null;
  }
  return { lat: fromUrlLat, lng: fromUrlLng };
}
