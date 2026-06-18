/** Guest portal access: invite token, on-stay assignment, testers. */

const RESERVED_GUEST_PORTAL_SLUGS = new Set(['admin', 'app', 'website']);

/** True for public guest URLs `/:propertySlug/:typeSlug` (not admin or marketing paths). */
export function isGuestPortalUrlPath(pathname: string): boolean {
  const parts = pathname.replace(/\/+$/, '').split('/').filter(Boolean);
  if (parts.length < 2) return false;
  return !RESERVED_GUEST_PORTAL_SLUGS.has(parts[0].toLowerCase());
}

/** New properties and legacy docs without the field use access control on. */
export const GUEST_PORTAL_ACCESS_REQUIRED_DEFAULT = true;

/** Only explicit `false` disables the guest access gate. */
export function isGuestPortalAccessRequired(
  property: { guestPortalAccessRequired?: boolean } | null | undefined
): boolean {
  if (property?.guestPortalAccessRequired === undefined) {
    return GUEST_PORTAL_ACCESS_REQUIRED_DEFAULT;
  }
  return property.guestPortalAccessRequired !== false;
}

export const GUEST_SESSION_STORAGE_KEY = 'vailo_guest_portal_session';

/** Canonical public origin for guest-facing URLs (override in dev via VITE_GUEST_PORTAL_ORIGIN). */
export function getGuestPortalPublicOrigin(): string {
  const fromEnv = String(import.meta.env.VITE_GUEST_PORTAL_ORIGIN || '').trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  return 'https://vailo.app';
}

export type GuestAccessSource = 'invite' | 'on_site' | 'tester' | 'admin_preview';

export type GuestInviteStatus = 'not_sent' | 'waiting' | 'opened';

export type GuestPortalSession = {
  sessionId: string;
  propertyId: string;
  typeId: string;
  bookingId?: string | null;
  testerId?: string | null;
  accessUntil: string;
  source: GuestAccessSource;
  guestName?: string;
  /** Invitation / stay default language (e.g. en, el). */
  guestLocale?: string | null;
};

export type SyncedBookingAccessFields = {
  inviteToken?: string;
  invitePasswordHash?: string;
  inviteStatus?: GuestInviteStatus;
  portalActivatedAt?: string;
  portalAccessUntil?: string;
  accessSource?: GuestAccessSource;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function parseIsoDay(iso?: string): Date | null {
  if (!iso) return null;
  const parts = iso.split('-').map(Number);
  if (parts.length < 3) return null;
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Inclusive stay window for on-site NFC assignment (check-in through check-out day). */
export function isWithinBookingStayDates(isoDay: Date, start?: string, end?: string): boolean {
  const s = parseIsoDay(start);
  const e = parseIsoDay(end);
  if (!s || !e) return false;
  const t = isoDay.getTime();
  return t >= s.getTime() && t <= e.getTime();
}

/** Portal stays open until end of calendar day, 2 days after checkout. */
export function portalAccessUntilFromEnd(end?: string): string | null {
  const e = parseIsoDay(end);
  if (!e) return null;
  const until = new Date(e.getTime() + 2 * DAY_MS);
  until.setHours(23, 59, 59, 999);
  return until.toISOString();
}

export function isSessionStillValid(session: GuestPortalSession): boolean {
  if (!session.accessUntil) return false;
  return Date.now() < new Date(session.accessUntil).getTime();
}

export function readGuestPortalSession(): GuestPortalSession | null {
  try {
    const raw = localStorage.getItem(GUEST_SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GuestPortalSession;
    if (!parsed?.sessionId || !parsed.propertyId || !parsed.typeId) return null;
    if (!isSessionStillValid(parsed)) {
      localStorage.removeItem(GUEST_SESSION_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeGuestPortalSession(session: GuestPortalSession): void {
  localStorage.setItem(GUEST_SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function clearGuestPortalSession(): void {
  localStorage.removeItem(GUEST_SESSION_STORAGE_KEY);
}

export function sessionMatchesUnit(
  session: GuestPortalSession,
  propertyId: string,
  typeId: string
): boolean {
  return session.propertyId === propertyId && session.typeId === typeId;
}

/** Guest name for booking forms — skips admin preview / tester placeholder names. */
export function guestBookingNamePrefill(): string {
  const session = readGuestPortalSession();
  if (!session?.guestName?.trim()) return '';
  if (session.source === 'admin_preview' || session.source === 'tester') return '';
  return session.guestName.trim();
}

/** Admin portal preview — requires signed-in admin + Cloud Function (not a public bypass). */
export function buildAdminGuestPortalPreviewUrl(
  origin: string,
  propertySlug: string,
  typeSlug: string,
  typeId: string,
  options?: { mobileFrame?: boolean }
): string {
  const base = origin.replace(/\/$/, '');
  const qs = new URLSearchParams({ typeId, adminPreview: '1' });
  if (options?.mobileFrame) qs.set('previewFrame', 'mobile');
  return `${base}/${propertySlug}/${typeSlug}?${qs.toString()}`;
}

export function buildInvitePortalUrl(
  origin: string,
  propertySlug: string,
  typeSlug: string,
  inviteToken: string,
  typeId?: string,
  guestLocale?: string
): string {
  const base = origin.replace(/\/$/, '');
  const qs = new URLSearchParams({ invite: inviteToken });
  if (typeId) qs.set('typeId', typeId);
  const lang = String(guestLocale || '').trim().toLowerCase();
  if (lang) qs.set('lang', lang);
  return `${base}/${propertySlug}/${typeSlug}?${qs.toString()}`;
}
