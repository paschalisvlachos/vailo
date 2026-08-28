/** In-portal check-in helpers. Legacy ?view=preArrival still opens the overlay. */

export const GUEST_PRE_ARRIVAL_VIEW = 'preArrival';

const PRE_ARRIVAL_INTENT_PREFIX = 'vailo_pre_arrival_intent:';

function preArrivalIntentKey(propertyId: string, typeId: string): string {
  return `${PRE_ARRIVAL_INTENT_PREFIX}${propertyId}:${typeId}`;
}

/** Drop leftover overlay intent from older dedicated check-in URLs. */
export function clearPreArrivalViewIntent(propertyId: string, typeId: string): void {
  if (!propertyId || !typeId) return;
  try {
    sessionStorage.removeItem(preArrivalIntentKey(propertyId, typeId));
  } catch {
    /* ignore */
  }
}

export function isPreArrivalPortalView(view: string | null | undefined): boolean {
  return view === GUEST_PRE_ARRIVAL_VIEW;
}
