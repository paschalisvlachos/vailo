/** Recompute timeline stop times and travel hints from coordinates (no paid routing APIs). */

export type TimelineScheduleOptions = {
  /** 24h start e.g. "09:00" */
  startTime24: string;
  /** Absolute end minute (may exceed 24h for next-day returns). */
  endMin: number;
  /** Minutes to spend at each activity stop (auto-sized if omitted). */
  minDwellMinutes?: number;
  maxDwellMinutes?: number;
};

function parseTime24ToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return 9 * 60;
  return h * 60 + m;
}

function formatTime12(minutes: number, nextDay = false): string {
  const normalized = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  const base = `${h12}:${m.toString().padStart(2, '0')} ${period}`;
  return nextDay ? `${base} (next day)` : base;
}

function extractItemCoords(item: Record<string, unknown>): { lat: number; lng: number } | null {
  const lat = item.latitude ?? item.lat;
  const lng = item.longitude ?? item.lng;
  const parsedLat = typeof lat === 'number' ? lat : parseFloat(String(lat ?? ''));
  const parsedLng = typeof lng === 'number' ? lng : parseFloat(String(lng ?? ''));
  if (!isNaN(parsedLat) && !isNaN(parsedLng)) return { lat: parsedLat, lng: parsedLng };
  return null;
}

/** Road-ish distance in km (Haversine × winding factor). */
function drivingKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371;
  const dLat = (b.lat - a.lat) * (Math.PI / 180);
  const dLng = (b.lng - a.lng) * (Math.PI / 180);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * (Math.PI / 180)) *
      Math.cos(b.lat * (Math.PI / 180)) *
      Math.sin(dLng / 2) ** 2;
  const straight = R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  return straight * 1.35;
}

function estimateDriveMinutes(km: number): number {
  if (km < 0.15) return 5;
  if (km < 1) return Math.max(5, Math.round(km * 12 + 4)); // walk / very short
  const speedKmh = km < 8 ? 40 : 55;
  return Math.max(5, Math.round((km / speedKmh) * 60));
}

function isPropertyStop(item: Record<string, unknown>): boolean {
  return item.isProperty === true || item.source === 'property';
}

function formatLegTransport(toTitle: string, driveMin: number, km: number): string {
  const dest = String(toTitle || 'next stop').trim();
  if (km < 0.8) {
    return `${driveMin} min walk · ${km.toFixed(1)} km to ${dest}`;
  }
  return `${driveMin} min drive · ${km.toFixed(1)} km to ${dest}`;
}

type LegInfo = { minutes: number; km: number };

function computeLegs(items: Record<string, unknown>[]): LegInfo[] {
  const legs: LegInfo[] = [];
  for (let i = 0; i < items.length - 1; i++) {
    const from = extractItemCoords(items[i]);
    const to = extractItemCoords(items[i + 1]);
    if (from && to) {
      const km = drivingKm(from, to);
      legs.push({ km, minutes: estimateDriveMinutes(km) });
    } else {
      legs.push({ km: 0, minutes: 12 });
    }
  }
  return legs;
}

/**
 * Assigns realistic arrival times and travel lines between stops using the guest's
 * chosen window and coordinates (when available).
 */
export function scheduleTimelinePlan(
  plan: unknown,
  options: TimelineScheduleOptions
): unknown {
  if (!plan || typeof plan !== 'object') return plan;
  const data = plan as Record<string, unknown>;
  if (data.type !== 'timeline' || !Array.isArray(data.plan) || data.plan.length < 2) {
    return plan;
  }

  const items = data.plan as Record<string, unknown>[];
  const legs = computeLegs(items);
  const totalDrive = legs.reduce((sum, leg) => sum + leg.minutes, 0);

  const startAbs = parseTime24ToMinutes(options.startTime24);
  const endAbs = options.endMin;
  const window = Math.max(60, endAbs - startAbs);

  const dwellIndices: number[] = [];
  for (let i = 0; i < items.length - 1; i++) {
    const isLastLeg = i === items.length - 2;
    if (isPropertyStop(items[i]) && i === 0) continue;
    if (isLastLeg && isPropertyStop(items[i + 1])) continue;
    dwellIndices.push(i);
  }

  const minDwell = options.minDwellMinutes ?? 45;
  const maxDwell = options.maxDwellMinutes ?? 150;
  const availableForDwell = Math.max(0, window - totalDrive);
  let dwellEach = dwellIndices.length
    ? Math.min(maxDwell, Math.max(minDwell, Math.floor(availableForDwell / dwellIndices.length)))
    : 0;

  const forwardEnd = startAbs + totalDrive + dwellEach * dwellIndices.length;
  if (forwardEnd > endAbs && dwellIndices.length > 0 && dwellEach > minDwell) {
    const excess = forwardEnd - endAbs;
    const reduce = Math.min(dwellEach - minDwell, Math.ceil(excess / dwellIndices.length));
    dwellEach = Math.max(minDwell, dwellEach - reduce);
  } else if (forwardEnd < endAbs - 20 && dwellIndices.length > 0) {
    const extra = endAbs - forwardEnd;
    dwellEach = Math.min(maxDwell, dwellEach + Math.floor(extra / dwellIndices.length));
  }

  let current = startAbs;
  const scheduled: Record<string, unknown>[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = { ...items[i] };
    const nextDay = current >= 24 * 60;
    item.time = formatTime12(current, nextDay);

    if (i < items.length - 1) {
      const leg = legs[i];
      const nextTitle = String(items[i + 1]?.title || 'next stop');
      item.transportToNext = formatLegTransport(nextTitle, leg.minutes, leg.km);
      item.legDriveMinutes = leg.minutes;
      item.legDistanceKm = leg.km;
      current += leg.minutes;

      const shouldDwell =
        dwellIndices.includes(i) &&
        !(isPropertyStop(items[i]) && i === 0);
      if (shouldDwell) {
        current += dwellEach;
      }
    } else {
      item.transportToNext = '';
    }

    scheduled.push(item);
  }

  // Pin return-to-property on the guest's chosen end time when it's the last stop.
  const lastIdx = scheduled.length - 1;
  if (lastIdx >= 0 && isPropertyStop(scheduled[lastIdx])) {
    scheduled[lastIdx] = {
      ...scheduled[lastIdx],
      time: formatTime12(endAbs, endAbs >= 24 * 60),
    };
  }

  return { ...data, plan: scheduled };
}
