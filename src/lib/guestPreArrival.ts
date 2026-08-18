/** Pre-arrival check-in link helpers (step 1: dedicated URL + guest shell). */

import { buildInvitePortalUrl } from './guestAccess';
import { formatGuestStayLabel } from './guestInviteEmailTemplate';
import { formatBookingDateRange } from './syncedBooking';

export const GUEST_PRE_ARRIVAL_VIEW = 'preArrival';

const PRE_ARRIVAL_INTENT_PREFIX = 'vailo_pre_arrival_intent:';

function preArrivalIntentKey(propertyId: string, typeId: string): string {
  return `${PRE_ARRIVAL_INTENT_PREFIX}${propertyId}:${typeId}`;
}

/** Remember pre-arrival intent for this stay (survives redirects that drop query params). */
export function markPreArrivalViewIntent(propertyId: string, typeId: string): void {
  if (!propertyId || !typeId) return;
  try {
    sessionStorage.setItem(preArrivalIntentKey(propertyId, typeId), '1');
  } catch {
    /* ignore */
  }
}

export function clearPreArrivalViewIntent(propertyId: string, typeId: string): void {
  if (!propertyId || !typeId) return;
  try {
    sessionStorage.removeItem(preArrivalIntentKey(propertyId, typeId));
  } catch {
    /* ignore */
  }
}

export function hasPreArrivalViewIntent(propertyId: string, typeId: string): boolean {
  if (!propertyId || !typeId) return false;
  try {
    return sessionStorage.getItem(preArrivalIntentKey(propertyId, typeId)) === '1';
  } catch {
    return false;
  }
}

export function isPreArrivalPortalView(view: string | null | undefined): boolean {
  return view === GUEST_PRE_ARRIVAL_VIEW;
}

/** URL param or stored intent for this property/unit. */
export function resolvePreArrivalPortalView(
  view: string | null | undefined,
  propertyId: string | null | undefined,
  typeId: string | null | undefined
): boolean {
  if (isPreArrivalPortalView(view)) return true;
  if (!propertyId || !typeId) return false;
  return hasPreArrivalViewIntent(propertyId, typeId);
}

export function buildPreArrivalPortalUrl(
  origin: string,
  propertySlug: string,
  typeSlug: string,
  inviteToken: string,
  typeId?: string,
  guestLocale?: string
): string {
  const base = buildInvitePortalUrl(
    origin,
    propertySlug,
    typeSlug,
    inviteToken,
    typeId,
    guestLocale
  );
  return preArrivalUrlFromInviteUrl(base);
}

/** Same invite URL with pre-arrival view param (shared token + password). */
export function preArrivalUrlFromInviteUrl(inviteUrl: string): string {
  const trimmed = inviteUrl.trim();
  if (!trimmed) return '';
  try {
    const url = new URL(trimmed);
    url.searchParams.set('view', GUEST_PRE_ARRIVAL_VIEW);
    return url.toString();
  } catch {
    return trimmed;
  }
}

/** Open portal listing URL with pre-arrival check-in view (no invite token). */
export function buildOpenPreArrivalPortalUrl(portalUrl: string): string {
  return preArrivalUrlFromInviteUrl(portalUrl);
}

export function buildPreArrivalClipboardText(options: {
  guestName: string;
  stayRangeLabel: string;
  propertyName: string;
  unitName: string;
  preArrivalUrl: string;
  accessPassword: string;
}): string {
  const guest = options.guestName.trim() || 'Guest';
  const stay = formatGuestStayLabel(options.propertyName, options.unitName);
  return [
    `Hello ${guest},`,
    '',
    `Please complete your pre-arrival check-in for ${stay} (${options.stayRangeLabel}).`,
    '',
    `Link: ${options.preArrivalUrl}`,
    `Password: ${options.accessPassword}`,
    '',
    'Open the link on your phone, enter the password, and follow the steps before you arrive.',
    '',
    'Thank you,',
    stay,
  ].join('\n');
}

export function stayRangeLabelFromBooking(start?: string, end?: string): string {
  return formatBookingDateRange(start, end) || 'your stay dates';
}
