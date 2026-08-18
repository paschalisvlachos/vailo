import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import GuestPortalLoadingScreen from './GuestPortalLoadingScreen';
import GuestPreArrivalDateLookup from './GuestPreArrivalDateLookup';
import GuestPreArrivalShell from './GuestPreArrivalShell';
import {
  clearGuestPortalSession,
  readGuestPortalSession,
  sessionMatchesUnit,
  type GuestPortalSession,
} from '../../lib/guestAccess';
import { validateGuestPortalSession } from '../../lib/guestPortalCallables';
import type { PreArrivalSubmission } from '../../lib/syncedBooking';
import type { PreArrivalTransferOffer } from '../../lib/preArrivalSettings';

type BookingRow = {
  id?: string;
  start?: string;
  end?: string;
  guestName?: string;
  summary?: string;
  guestCountry?: string;
  guestPhone?: string;
  guestWhatsapp?: string;
  guestEmail?: string;
  preArrivalComplete?: boolean;
  preArrivalSubmission?: PreArrivalSubmission;
};

type Props = {
  propertyId: string;
  typeId: string;
  propertyName: string;
  unitName: string;
  guide?: Record<string, unknown> | null;
  locale: string;
  contentPrimaryLocale: string;
  transferOffer?: PreArrivalTransferOffer | null;
  syncedBookings?: BookingRow[] | null;
  guestSession: GuestPortalSession | null;
  onSessionGranted: (session: GuestPortalSession) => void;
  onSessionCleared?: () => void;
};

type FlowPhase = 'checking' | 'lookup' | 'form';

export default function GuestOpenPreArrivalFlow({
  propertyId,
  typeId,
  propertyName,
  unitName,
  guide,
  locale,
  contentPrimaryLocale,
  transferOffer,
  syncedBookings,
  guestSession,
  onSessionGranted,
  onSessionCleared,
}: Props) {
  const [phase, setPhase] = useState<FlowPhase>('checking');
  const [session, setSession] = useState<GuestPortalSession | null>(guestSession);
  const bootstrapRunIdRef = useRef(0);

  const activeSession = session ?? guestSession ?? readGuestPortalSession();

  const booking = useMemo(() => {
    const bookingId = activeSession?.bookingId;
    if (!bookingId || !syncedBookings) return null;
    return syncedBookings.find((b) => b.id === bookingId) ?? null;
  }, [activeSession?.bookingId, syncedBookings]);

  const grant = useCallback(
    (s: GuestPortalSession) => {
      setSession(s);
      onSessionGranted(s);
      setPhase('form');
    },
    [onSessionGranted]
  );

  const handleChangeDates = useCallback(() => {
    clearGuestPortalSession();
    setSession(null);
    onSessionCleared?.();
    setPhase('lookup');
  }, [onSessionCleared]);

  useEffect(() => {
    const runId = ++bootstrapRunIdRef.current;
    let cancelled = false;
    const stillActive = () => !cancelled && runId === bootstrapRunIdRef.current;

    (async () => {
      setPhase('checking');
      const stored = readGuestPortalSession();
      if (!stored || !sessionMatchesUnit(stored, propertyId, typeId)) {
        if (!stillActive()) return;
        setPhase('lookup');
        return;
      }

      try {
        const result = await validateGuestPortalSession(
          propertyId,
          typeId,
          stored.sessionId
        );
        if (!stillActive()) return;
        if (result.valid && result.session?.bookingId) {
          grant(result.session);
          return;
        }
        if (result.reason === 'booking_cancelled') {
          clearGuestPortalSession();
        }
      } catch {
        /* fall through to lookup */
      }

      if (!stillActive()) return;
      setPhase('lookup');
    })();

    return () => {
      cancelled = true;
    };
  }, [propertyId, typeId, grant]);

  if (phase === 'checking') {
    return <GuestPortalLoadingScreen status="Loading online check-in…" />;
  }

  if (phase === 'lookup' || !activeSession?.bookingId) {
    return (
      <GuestPreArrivalDateLookup
        propertyId={propertyId}
        typeId={typeId}
        propertyName={propertyName}
        unitName={unitName}
        onSessionGranted={grant}
      />
    );
  }

  return (
    <GuestPreArrivalShell
      session={activeSession}
      propertyId={propertyId}
      typeId={typeId}
      propertyName={propertyName}
      unitName={unitName}
      guide={guide}
      locale={locale}
      contentPrimaryLocale={contentPrimaryLocale}
      transferOffer={transferOffer}
      booking={booking}
      onChangeDates={
        activeSession?.source === 'pre_arrival_dates' ? handleChangeDates : undefined
      }
    />
  );
}
