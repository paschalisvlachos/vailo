import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import {
  ANALYTICS_LAST_SESSION_KEY,
  PORTAL_SESSION_DEBOUNCE_MS,
  sanitizeAnalyticsPayload,
  type GuestAnalyticsEventInput,
  type GuestAnalyticsEventType,
  type GuestAnalyticsPayload,
} from '../lib/guestAnalytics';
import {
  readGuestPortalSession,
  type GuestPortalSession,
} from '../lib/guestAccess';
import { logGuestPortalAnalyticsCallable } from '../lib/guestPortalCallables';

type GuestAnalyticsContextValue = {
  enabled: boolean;
  session: GuestPortalSession | null;
  track: (type: GuestAnalyticsEventType, payload?: GuestAnalyticsPayload) => void;
  trackPortalSession: () => void;
};

const GuestAnalyticsContext = createContext<GuestAnalyticsContextValue>({
  enabled: false,
  session: null,
  track: () => {},
  trackPortalSession: () => {},
});

function isTrackableHouseGuestSession(session: GuestPortalSession | null): boolean {
  if (!session?.bookingId) return false;
  if (session.source === 'admin_preview' || session.source === 'tester') return false;
  return true;
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

  const enabled = isTrackableHouseGuestSession(session);
  const queueRef = useRef<GuestAnalyticsEventInput[]>([]);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushingRef = useRef(false);

  const flush = useCallback(async () => {
    if (!enabled || !session || !propertyId || !typeId) return;
    if (flushingRef.current) return;
    const batch = queueRef.current.splice(0, 25);
    if (batch.length === 0) return;

    flushingRef.current = true;
    try {
      await logGuestPortalAnalyticsCallable(propertyId, typeId, session.sessionId, batch);
    } catch (err) {
      console.warn('guest analytics flush failed', err);
      queueRef.current.unshift(...batch);
    } finally {
      flushingRef.current = false;
    }
  }, [enabled, session, propertyId, typeId]);

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    flushTimerRef.current = setTimeout(() => {
      flushTimerRef.current = null;
      void flush();
    }, 1500);
  }, [flush]);

  const track = useCallback(
    (type: GuestAnalyticsEventType, payload?: GuestAnalyticsPayload) => {
      if (!enabled || !session) return;
      queueRef.current.push({
        type,
        payload: sanitizeAnalyticsPayload(type, payload),
      });
      scheduleFlush();
    },
    [enabled, session, scheduleFlush]
  );

  const trackPortalSession = useCallback(() => {
    if (!enabled || !session?.bookingId) return;
    try {
      const raw = localStorage.getItem(ANALYTICS_LAST_SESSION_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { bookingId?: string; at?: number };
        if (
          parsed.bookingId === session.bookingId &&
          typeof parsed.at === 'number' &&
          Date.now() - parsed.at < PORTAL_SESSION_DEBOUNCE_MS
        ) {
          return;
        }
      }
    } catch {
      /* ignore */
    }
    track('portal_session');
    localStorage.setItem(
      ANALYTICS_LAST_SESSION_KEY,
      JSON.stringify({ bookingId: session.bookingId, at: Date.now() })
    );
  }, [enabled, session, track]);

  useEffect(() => {
    if (enabled) trackPortalSession();
  }, [enabled, trackPortalSession]);

  useEffect(() => {
    const onUnload = () => {
      if (queueRef.current.length === 0 || !enabled || !session || !propertyId || !typeId) {
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
  }, [enabled, session, propertyId, typeId, flush]);

  const value = useMemo(
    () => ({ enabled, session, track, trackPortalSession }),
    [enabled, session, track, trackPortalSession]
  );

  return (
    <GuestAnalyticsContext.Provider value={value}>{children}</GuestAnalyticsContext.Provider>
  );
}

export function useGuestAnalytics() {
  return useContext(GuestAnalyticsContext);
}
