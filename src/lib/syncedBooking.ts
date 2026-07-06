import type { GuestAccessSource, GuestInviteStatus } from './guestAccess';

export type SyncedBooking = {
  id?: string;
  start?: string;
  end?: string;
  summary?: string;
  provider?: string;
  guestName?: string;
  guestEmail?: string;
  guestWhatsapp?: string;
  guestPhone?: string;
  guestLocale?: string;
  guestDetailsComplete?: boolean;
  isInvited?: boolean;
  /** ISO timestamp — updated on send / re-invite (delivery TBD). */
  lastInvitedAt?: string;
  inviteToken?: string;
  invitePasswordHash?: string;
  inviteStatus?: GuestInviteStatus;
  portalActivatedAt?: string;
  portalAccessUntil?: string;
  accessSource?: GuestAccessSource;
  /** Set when a reservation is cancelled — blocks portal even if invite was sent. */
  portalAccessRevokedAt?: string;
};

export function isBookingGuestDetailsComplete(booking: SyncedBooking): boolean {
  const name = booking.guestName?.trim();
  const locale = booking.guestLocale?.trim();
  return Boolean(booking.guestDetailsComplete && name && locale);
}

export type BookingInvitationStatus = 'needs_details' | 'ready_for_reservations' | 'invited';

export function getBookingInvitationStatus(booking: SyncedBooking): BookingInvitationStatus {
  if (booking.isInvited) return 'invited';
  if (isBookingGuestDetailsComplete(booking)) return 'ready_for_reservations';
  return 'needs_details';
}

/** Display range e.g. 05/06/2026 → 13/06/2026 (ISO day strings YYYY-MM-DD). */
export function formatBookingDateRange(start?: string, end?: string): string {
  const fmt = (iso?: string) => {
    if (!iso) return '—';
    const parts = iso.split('-').map(Number);
    if (parts.length < 3) return iso;
    const [y, m, d] = parts;
    return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
  };
  return `${fmt(start)} → ${fmt(end)}`;
}

export function matchesSyncedBooking(a: SyncedBooking, b: SyncedBooking): boolean {
  if (a.id && b.id) return a.id === b.id;
  return Boolean(a.start && a.end && a.start === b.start && a.end === b.end);
}

/** Parse YYYY-MM-DD (or ISO datetime prefix) to local midnight. */
export function parseSyncedBookingDay(iso?: string): Date | null {
  if (!iso) return null;
  const day = String(iso).slice(0, 10);
  const parts = day.split('-').map(Number);
  if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return null;
  const [y, m, d] = parts;
  const date = new Date(y, m - 1, d);
  date.setHours(0, 0, 0, 0);
  return date;
}

/**
 * True when a stay overlaps an inclusive admin range [rangeStart, rangeEnd].
 * Stays use check-in (inclusive) and check-out (exclusive), matching the calendar grid.
 */
export function bookingOverlapsInclusiveDateRange(
  booking: SyncedBooking,
  rangeStart: string,
  rangeEnd: string
): boolean {
  const bStart = parseSyncedBookingDay(booking.start);
  const bEnd = parseSyncedBookingDay(booking.end);
  const rStart = parseSyncedBookingDay(rangeStart);
  const rEnd = parseSyncedBookingDay(rangeEnd);
  if (!bStart || !bEnd || !rStart || !rEnd) return false;
  const rEndExclusive = new Date(rEnd);
  rEndExclusive.setDate(rEndExclusive.getDate() + 1);
  return bStart < rEndExclusive && bEnd > rStart;
}

export function filterSyncedBookingsOutsideDateRange(
  bookings: SyncedBooking[],
  rangeStart: string,
  rangeEnd: string
): SyncedBooking[] {
  return bookings.filter(
    (b) => !bookingOverlapsInclusiveDateRange(b, rangeStart, rangeEnd)
  );
}

export function countSyncedBookingsInDateRange(
  bookings: SyncedBooking[],
  rangeStart: string,
  rangeEnd: string
): number {
  return bookings.filter((b) => bookingOverlapsInclusiveDateRange(b, rangeStart, rangeEnd))
    .length;
}

export function patchSyncedBookingList(
  bookings: SyncedBooking[],
  target: SyncedBooking,
  patch: Partial<SyncedBooking>
): SyncedBooking[] {
  return bookings.map((b) => (matchesSyncedBooking(b, target) ? { ...b, ...patch } : b));
}

export type GuestDetailsPayload = {
  guestName: string;
  guestEmail: string;
  guestWhatsapp: string;
  guestLocale: string;
};

export function guestDetailsPatch(payload: GuestDetailsPayload): Partial<SyncedBooking> {
  return {
    guestName: payload.guestName,
    guestEmail: payload.guestEmail,
    guestWhatsapp: payload.guestWhatsapp,
    guestPhone: payload.guestWhatsapp,
    guestLocale: payload.guestLocale,
    guestDetailsComplete: true,
  };
}

export function mergeSyncedBookingFromExisting(
  incoming: SyncedBooking,
  existing?: SyncedBooking | null
): SyncedBooking {
  if (!existing) return incoming;
  return {
    ...incoming,
    id: existing.id || incoming.id,
    isInvited: existing.isInvited ?? incoming.isInvited,
    guestName: existing.guestName,
    guestEmail: existing.guestEmail,
    guestWhatsapp: existing.guestWhatsapp ?? existing.guestPhone,
    guestPhone: existing.guestPhone,
    guestLocale: existing.guestLocale,
    guestDetailsComplete: existing.guestDetailsComplete,
    inviteToken: existing.inviteToken,
    invitePasswordHash: existing.invitePasswordHash,
    inviteStatus: existing.inviteStatus,
    lastInvitedAt: existing.lastInvitedAt,
    portalActivatedAt: existing.portalActivatedAt,
    portalAccessUntil: existing.portalAccessUntil,
    accessSource: existing.accessSource,
    portalAccessRevokedAt: existing.portalAccessRevokedAt,
  };
}

export function isBookingPortalAccessAllowed(booking: SyncedBooking | null | undefined): boolean {
  if (!booking) return false;
  return !booking.portalAccessRevokedAt;
}

/** Withdraw invite and block portal (invite link, password, on-stay) until a new invite is sent. */
export function revokeGuestPortalAccessBooking(booking: SyncedBooking): SyncedBooking {
  const {
    inviteToken: _t,
    invitePasswordHash: _h,
    portalActivatedAt: _a,
    accessSource: _s,
    portalAccessUntil: _u,
    portalAccessRevokedAt: _r,
    ...rest
  } = booking;
  return {
    ...rest,
    isInvited: false,
    inviteStatus: 'not_sent',
    portalAccessRevokedAt: new Date().toISOString(),
  };
}

export function patchSyncedBookingListRevokeAccess(
  bookings: SyncedBooking[],
  target: SyncedBooking
): SyncedBooking[] {
  return bookings.map((b) =>
    matchesSyncedBooking(b, target) ? revokeGuestPortalAccessBooking(b) : b
  );
}
