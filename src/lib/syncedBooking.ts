import type { GuestAccessSource, GuestInviteStatus } from './guestAccess';

export type PreArrivalIdDocument = {
  uploadedAt: string;
  /** Internal Storage path — encrypted blob, no public URL. */
  storagePath: string;
  contentType: string;
  sizeBytes?: number;
  encryptionKeyVersion?: string;
};

export type PreArrivalIdDetails = {
  documentType: 'passport' | 'national_id' | 'other';
  documentNumber: string;
  issuingCountry: string;
  /** ISO date YYYY-MM-DD */
  issueDate?: string;
  /** ISO date YYYY-MM-DD */
  expiryDate?: string;
  recordedAt: string;
};

export type PreArrivalSubmission = {
  submittedAt: string;
  guestFirstName?: string;
  guestLastName?: string;
  /** Nationality / country of residence — optional. */
  guestCountry?: string;
  expectedArrivalTime: string;
  guestCount: number;
  contactPhone: string;
  contactEmail?: string;
  /** ISO date YYYY-MM-DD */
  dateOfBirth?: string;
  specialRequests?: string;
  acceptedHouseRulesAt: string;
  houseRulesLocale?: string;
  idDocument?: PreArrivalIdDocument;
  idDetails?: PreArrivalIdDetails;
  transferRequested?: boolean;
  transferOffer?: {
    label: string;
    priceEur: number;
    paymentNote?: string;
  };
};

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
  /** Guest nationality / country of residence from check-in. */
  guestCountry?: string;
  guestDetailsComplete?: boolean;
  isInvited?: boolean;
  /** ISO timestamp — updated on send / re-invite (delivery TBD). */
  lastInvitedAt?: string;
  /** How the invitation was last delivered to the guest. */
  lastInviteChannel?: 'email' | 'whatsapp';
  inviteToken?: string;
  invitePasswordHash?: string;
  inviteStatus?: GuestInviteStatus;
  portalActivatedAt?: string;
  portalAccessUntil?: string;
  accessSource?: GuestAccessSource;
  /** Set when a reservation is cancelled — blocks portal even if invite was sent. */
  portalAccessRevokedAt?: string | null;
  /** Links segments created by splitting one reservation. */
  splitGroupId?: string;
  /** Original iCal date span before admin split — prevents re-import as one block. */
  splitFromRange?: { start: string; end: string };
  /** ISO timestamp when automated post-stay thank-you email was sent. */
  postStayThankYouSentAt?: string;
  postStayThankYouResendId?: string | null;
  /** 1-based index within splitGroupId. */
  splitPartIndex?: number;
  /** Guest completed pre-arrival check-in form. */
  preArrivalComplete?: boolean;
  preArrivalSubmittedAt?: string;
  preArrivalSubmission?: PreArrivalSubmission;
};

export type SplitBookingPart = { start: string; end: string };

export function isPropertyReservationSplitEnabled(
  property: { reservationSplitEnabled?: boolean } | null | undefined
): boolean {
  return property?.reservationSplitEnabled === true;
}

export function isSplitBookingPart(booking: SyncedBooking | null | undefined): boolean {
  return Boolean(booking?.splitGroupId && booking.splitPartIndex);
}

/** iCal block / closed dates — not a real guest name for guest-facing UI. */
export function isPlaceholderBookingGuestName(name: string | null | undefined): boolean {
  const trimmed = String(name || '').trim();
  if (!trimmed) return true;
  const lower = trimmed.toLowerCase();
  return (
    lower.includes('closed') ||
    lower.includes('blocked') ||
    lower.includes('not available') ||
    lower.includes('unavailable') ||
    lower === 'blocked date'
  );
}

/** First real guest name from booking fields, or null when only placeholders exist. */
export function resolveGuestDisplayName(options: {
  guestName?: string | null;
  summary?: string | null;
  sessionGuestName?: string | null;
}): string | null {
  for (const value of [options.guestName, options.summary, options.sessionGuestName]) {
    const trimmed = String(value || '').trim();
    if (trimmed && !isPlaceholderBookingGuestName(trimmed)) {
      return trimmed;
    }
  }
  return null;
}

export function isBookingGuestDetailsComplete(booking: SyncedBooking): boolean {
  const name = (booking.guestName || booking.summary || '').trim();
  const locale = booking.guestLocale?.trim();
  if (!name || !locale) return false;
  if (booking.guestDetailsComplete === false) return false;
  return true;
}

export type BookingInvitationStatus = 'needs_details' | 'ready_for_reservations' | 'invited';

export function getBookingInvitationStatus(booking: SyncedBooking): BookingInvitationStatus {
  if (booking.isInvited) return 'invited';
  if (isBookingGuestDetailsComplete(booking)) return 'ready_for_reservations';
  return 'needs_details';
}

export function getBookingInvitationStatusLabel(booking: SyncedBooking): string {
  const status = getBookingInvitationStatus(booking);
  if (status === 'invited') {
    if (booking.lastInviteChannel === 'whatsapp') return 'Invited · WhatsApp';
    if (booking.lastInviteChannel === 'email') return 'Invited · Email';
    return 'Invited';
  }
  if (status === 'ready_for_reservations') return 'Ready for invitation';
  return 'Needs guest details';
}

/** True on checkout day and after (invitation / invite WhatsApp actions should stop). */
export function isBookingCheckoutReached(booking: SyncedBooking): boolean {
  const endDay = parseSyncedBookingDay(booking.end);
  if (!endDay) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today.getTime() >= endDay.getTime();
}

/** True when checkout was at least one calendar day ago (thank-you email / WhatsApp eligible). */
export function isPostStayThankYouEligible(booking: SyncedBooking): boolean {
  const endDay = parseSyncedBookingDay(booking.end);
  if (!endDay || !isBookingGuestDetailsComplete(booking)) return false;
  const thankYouDay = new Date(endDay);
  thankYouDay.setDate(thankYouDay.getDate() + 1);
  thankYouDay.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today >= thankYouDay;
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

export function buildMarkInvitedViaWhatsAppPatch(
  booking: SyncedBooking,
  accessUntil: string
): Partial<SyncedBooking> {
  return {
    isInvited: true,
    lastInvitedAt: new Date().toISOString(),
    lastInviteChannel: 'whatsapp',
    inviteStatus: booking.inviteStatus === 'opened' ? 'opened' : 'waiting',
    portalAccessUntil: accessUntil,
    portalAccessRevokedAt: null,
    accessSource: 'invite',
  };
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
    guestCountry: existing.guestCountry,
    guestDetailsComplete: existing.guestDetailsComplete,
    inviteToken: existing.inviteToken,
    invitePasswordHash: existing.invitePasswordHash,
    inviteStatus: existing.inviteStatus,
    lastInvitedAt: existing.lastInvitedAt,
    lastInviteChannel: existing.lastInviteChannel,
    portalActivatedAt: existing.portalActivatedAt,
    portalAccessUntil: existing.portalAccessUntil,
    accessSource: existing.accessSource,
    portalAccessRevokedAt: existing.portalAccessRevokedAt,
    preArrivalComplete: existing.preArrivalComplete,
    preArrivalSubmittedAt: existing.preArrivalSubmittedAt,
    preArrivalSubmission: existing.preArrivalSubmission,
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

/** Validate stay segments for splitting one reservation into non-overlapping parts. */
export function validateReservationSplitParts(
  original: SyncedBooking,
  parts: SplitBookingPart[]
): string | null {
  if (parts.length < 2) return 'Add at least two stay segments.';

  const origStart = parseSyncedBookingDay(original.start);
  const origEnd = parseSyncedBookingDay(original.end);
  if (!origStart || !origEnd) return 'Original reservation has invalid dates.';
  if (origStart >= origEnd) return 'Original reservation has invalid dates.';

  const normalized = parts.map((part) => ({
    start: String(part.start || '').slice(0, 10),
    end: String(part.end || '').slice(0, 10),
  }));

  for (let i = 0; i < normalized.length; i += 1) {
    const part = normalized[i];
    const pStart = parseSyncedBookingDay(part.start);
    const pEnd = parseSyncedBookingDay(part.end);
    if (!pStart || !pEnd) return `Segment ${i + 1} needs valid check-in and check-out dates.`;
    if (pStart >= pEnd) return `Segment ${i + 1}: check-out must be after check-in.`;
    if (pStart < origStart || pEnd > origEnd) {
      return `Segment ${i + 1} must fall within the original stay (${formatBookingDateRange(original.start, original.end)}).`;
    }
  }

  const sorted = [...normalized].sort((a, b) => a.start.localeCompare(b.start));
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const aEnd = parseSyncedBookingDay(sorted[i].end)!;
    const bStart = parseSyncedBookingDay(sorted[i + 1].start)!;
    if (aEnd > bStart) return 'Stay segments cannot overlap each other.';
  }

  return null;
}

function copyGuestFieldsForSplit(original: SyncedBooking): Partial<SyncedBooking> {
  return sanitizeSyncedBookingForFirestore({
    summary: original.summary,
    provider: original.provider,
    guestName: original.guestName,
    guestEmail: original.guestEmail,
    guestWhatsapp: original.guestWhatsapp,
    guestPhone: original.guestPhone,
    guestLocale: original.guestLocale,
    guestDetailsComplete: original.guestDetailsComplete,
    isInvited: false,
    inviteStatus: 'not_sent',
  });
}

/** Build new booking rows from one reservation split into dated segments. */
export function buildSplitBookingsFromOriginal(
  original: SyncedBooking,
  parts: SplitBookingPart[]
): SyncedBooking[] {
  const splitGroupId = `split-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const splitFromRange = {
    start: String(original.start || '').slice(0, 10),
    end: String(original.end || '').slice(0, 10),
  };
  const guestFields = copyGuestFieldsForSplit(original);
  const sorted = [...parts]
    .map((part) => ({
      start: String(part.start || '').slice(0, 10),
      end: String(part.end || '').slice(0, 10),
    }))
    .sort((a, b) => a.start.localeCompare(b.start));

  return sorted.map((part, index) => ({
    ...guestFields,
    id: `${original.id || 'booking'}-split-${index + 1}-${Math.random().toString(36).slice(2, 7)}`,
    start: part.start,
    end: part.end,
    splitGroupId,
    splitFromRange,
    splitPartIndex: index + 1,
  }));
}

export function replaceBookingWithSplits(
  bookings: SyncedBooking[],
  target: SyncedBooking,
  splitParts: SyncedBooking[]
): SyncedBooking[] {
  const remaining = bookings.filter((b) => !matchesSyncedBooking(b, target));
  return sanitizeSyncedBookingsForFirestore(
    [...remaining, ...splitParts].sort((a, b) =>
      String(a.start || '').localeCompare(String(b.start || ''))
    )
  );
}

/** Firestore rejects explicit `undefined` field values on write. */
export function sanitizeSyncedBookingForFirestore(booking: SyncedBooking): SyncedBooking {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(booking)) {
    if (value === undefined) continue;
    out[key] = value;
  }
  return out as SyncedBooking;
}

export function sanitizeSyncedBookingsForFirestore(bookings: SyncedBooking[]): SyncedBooking[] {
  return bookings.map(sanitizeSyncedBookingForFirestore);
}
