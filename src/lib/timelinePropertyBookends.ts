import { placeNamesMatch } from './placeNameUtils';

export type PropertyBookendContext = {
  propertyTitle: string;
  propertyPhotoUrl?: string;
  propertyCoords: { lat: number; lng: number } | null;
  locationLabel?: string;
  defaultStartTime?: string;
  defaultEndTime?: string;
};

function isPropertyTimelineStop(
  item: Record<string, unknown> | null | undefined,
  ctx: PropertyBookendContext
): boolean {
  if (!item) return false;
  if (item.isProperty === true || item.source === 'property') return true;

  const title = String(item.title || '').trim();
  if (!title) return false;
  if (placeNamesMatch(title, ctx.propertyTitle)) return true;

  const label = (ctx.locationLabel || '').trim();
  if (label && (title === label || title.includes(label))) return true;

  const nearStripped = label.replace(/^near\s+/i, '').trim();
  if (nearStripped && placeNamesMatch(title, nearStripped)) return true;

  return false;
}

function buildPropertyStop(
  time: string,
  description: string,
  transportToNext: string,
  ctx: PropertyBookendContext
): Record<string, unknown> {
  const stop: Record<string, unknown> = {
    time,
    title: ctx.propertyTitle,
    description,
    transportToNext,
    source: 'property',
    isProperty: true,
    photoUrl: ctx.propertyPhotoUrl || '',
    googleMapsUrl: '',
    googlePlaceId: '',
  };
  if (ctx.propertyCoords) {
    stop.latitude = ctx.propertyCoords.lat;
    stop.longitude = ctx.propertyCoords.lng;
  }
  return stop;
}

/**
 * When the guest plans from their accommodation, the timeline must start and
 * end at the property — not at random stops that only inherited the property photo.
 */
export function ensureTimelinePropertyBookends(
  plan: unknown,
  ctx: PropertyBookendContext
): unknown {
  if (!plan || typeof plan !== 'object') return plan;
  const data = plan as Record<string, unknown>;
  if (data.type !== 'timeline' || !Array.isArray(data.plan) || data.plan.length === 0) {
    return plan;
  }

  const original = data.plan as Record<string, unknown>[];
  const core = original.filter((item) => !isPropertyTimelineStop(item, ctx));

  if (core.length === 0) {
    const departureOnly = buildPropertyStop(
      ctx.defaultStartTime || '09:00 AM',
      `Your day begins at ${ctx.propertyTitle}.`,
      '',
      ctx
    );
    const returnOnly = buildPropertyStop(
      ctx.defaultEndTime || departureOnly.time as string,
      `Return to ${ctx.propertyTitle} to finish your day.`,
      '',
      ctx
    );
    return { ...data, plan: [departureOnly, returnOnly] };
  }

  const peeledFirst = original.find((item) => isPropertyTimelineStop(item, ctx));
  const peeledLast = [...original].reverse().find((item) => isPropertyTimelineStop(item, ctx));

  const departureTime =
    (peeledFirst?.time as string) ||
    ctx.defaultStartTime ||
    (core[0]?.time as string) ||
    '09:00 AM';

  const returnTime =
    (peeledLast?.time as string) ||
    ctx.defaultEndTime ||
    (core[core.length - 1]?.time as string) ||
    departureTime;

  const transportToFirst =
    (typeof peeledFirst?.transportToNext === 'string' && peeledFirst.transportToNext.trim()) ||
    (typeof core[0]?.transportToNext === 'string' && core[0].transportToNext.trim()) ||
    '';

  const departure = buildPropertyStop(
    departureTime,
    `Your day begins at ${ctx.propertyTitle}.`,
    transportToFirst,
    ctx
  );

  const returnStop = buildPropertyStop(
    returnTime,
    `Return to ${ctx.propertyTitle} to finish your day.`,
    '',
    ctx
  );

  return { ...data, plan: [departure, ...core, returnStop] };
}
