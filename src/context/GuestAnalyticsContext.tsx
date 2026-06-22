import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import {
  analyticsPortalSessionStorageKey,
  PORTAL_SESSION_DEBOUNCE_MS,
  sanitizeAnalyticsPayload,
  type GuestAnalyticsEventInput,
  type GuestAnalyticsEventType,
  type GuestAnalyticsPayload,
  type GuestAnalyticsSubjectKind,
} from '../lib/guestAnalytics';
import { getOrCreateAnonymousVisitorId } from '../lib/guestAnonymousVisitor';
import { getGuestClientDevice } from '../lib/guestDeviceInfo';
import {
  readGuestPortalSession,
  type GuestPortalSession,
} from '../lib/guestAccess';
import { logGuestPortalAnalyticsCallable } from '../lib/guestPortalCallables';

type AnalyticsSubject =
  | { kind: 'booking'; session: GuestPortalSession; id: string }
  | { kind: 'anonymous'; visitorId: string };

type GuestAnalyticsContextValue = {
  enabled: boolean;
  subjectKind: GuestAnalyticsSubjectKind | null;
  session: GuestPortalSession | null;
  track: (type: GuestAnalyticsEventType, payload?: GuestAnalyticsPayload) => void;
  trackPortalSession: () => void;
};

const GuestAnalyticsContext = createContext<GuestAnalyticsContextValue>({
  enabled: false,
  subjectKind: null,
  session: null,
  track: () => {},
  trackPortalSession: () => {},
});

function isExcludedSession(session: GuestPortalSession | null): boolean {
  return session?.source === 'admin_preview' || session?.source === 'tester';
}

function isTrackableHouseGuestSession(session: GuestPortalSession | null): boolean {
  if (!session?.bookingId) return false;
  if (isExcludedSession(session)) return false;
  return true;
}

function resolveAnalyticsSubject(
  propertyId: string | null,
  typeId: string | null,
  session: GuestPortalSession | null
): AnalyticsSubject | null {
  if (!propertyId || !typeId) return null;
  if (isExcludedSession(session)) return null;

  if (isTrackableHouseGuestSession(session)) {
    return { kind: 'booking', session: session!, id: session!.bookingId! };
  }

  return { kind: 'anonymous', visitorId: getOrCreateAnonymousVisitorId() };
}

export function GuestAnalyticsProvider({
  propertyId,
  typeId,
  children,
}: {
  propertyId: string | null;
  typeId: string | null;
  children: React.ReactNode;
}) {
  const session = useMemo(() => {
    const s = readGuestPortalSession();
    if (!propertyId || !typeId || !s) return null;
    if (s.propertyId !== propertyId || s.typeId !== typeId) return null;
    return s;
  }, [propertyId, typeId]);

  const subject = useMemo(
    () => resolveAnalyticsSubject(propertyId, typeId, session),
    [propertyId, typeId, session]
  );

  const enabled = Boolean(subject && propertyId && typeId);
  const clientDevice = useMemo(() => getGuestClientDevice(), []);
  const queueRef = useRef<GuestAnalyticsEventInput[]>([]);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushingRef = useRef(false);

  const flush = useCallback(async () => {
    if (!enabled || !subject || !propertyId || !typeId) return;
    if (flushingRef.current) return;
    const batch = queueRef.current.splice(0, 25);
    if (batch.length === 0) return;

    flushingRef.current = true;
    try {
      await logGuestPortalAnalyticsCallable({
        propertyId,
        typeId,
        sessionId: subject.kind === 'booking' ? subject.session.sessionId : undefined,
        visitorId: subject.kind === 'anonymous' ? subject.visitorId : undefined,
        clientDevice,
        events: batch,
      });
    } catch (err) {
      console.warn('guest analytics flush failed', err);
      queueRef.current.unshift(...batch);
    } finally {
      flushingRef.current = false;
    }
  }, [enabled, subject, propertyId, typeId, clientDevice]);

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    flushTimerRef.current = setTimeout(() => {
      flushTimerRef.current = null;
      void flush();
    }, 1500);
  }, [flush]);

  const track = useCallback(
    (type: GuestAnalyticsEventType, payload?: GuestAnalyticsPayload) => {
      if (!enabled || !subject) return;
      queueRef.current.push({
        type,
        payload: sanitizeAnalyticsPayload(type, payload),
      });
      scheduleFlush();
    },
    [enabled, subject, scheduleFlush]
  );

  const trackPortalSession = useCallback(() => {
    if (!enabled || !subject) return;

    const subjectId = subject.kind === 'booking' ? subject.id : subject.visitorId;
    const storageKey = analyticsPortalSessionStorageKey(subject.kind, subjectId);

    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as { at?: number };
        if (typeof parsed.at === 'number' && Date.now() - parsed.at < PORTAL_SESSION_DEBOUNCE_MS) {
          return;
        }
      }
    } catch {
      /* ignore */
    }

    track('portal_session');
    localStorage.setItem(storageKey, JSON.stringify({ at: Date.now() }));
  }, [enabled, subject, track]);

  useEffect(() => {
    if (enabled) trackPortalSession();
  }, [enabled, trackPortalSession]);

  useEffect(() => {
    const onUnload = () => {
      if (queueRef.current.length === 0 || !enabled || !subject || !propertyId || !typeId) {
        return;
      }
      void flush();
    };
    window.addEventListener('pagehide', onUnload);
    return () => {
      window.removeEventListener('pagehide', onUnload);
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
      void flush();
    };
  }, [enabled, subject, propertyId, typeId, flush]);

  const value = useMemo(
    () => ({
      enabled,
      subjectKind: subject?.kind ?? null,
      session: subject?.kind === 'booking' ? subject.session : session,
      track,
      trackPortalSession,
    }),
    [enabled, subject, session, track, trackPortalSession]
  );

  return (
    <GuestAnalyticsContext.Provider value={value}>{children}</GuestAnalyticsContext.Provider>
  );
}

export function useGuestAnalytics() {
  return useContext(GuestAnalyticsContext);
}
