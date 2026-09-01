import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CalendarDays, Home } from 'lucide-react';
import { formatBookingDateRange, resolveGuestDisplayName } from '../../lib/syncedBooking';
import { guestFullNameFromSubmission } from '../../lib/preArrivalSubmission';
import type { GuestPortalSession } from '../../lib/guestAccess';
import { isPreArrivalPortalView, clearPreArrivalViewIntent } from '../../lib/guestPreArrival';
import type { PreArrivalSubmission } from '../../lib/syncedBooking';
import GuestPreArrivalForm from './GuestPreArrivalForm';
import GuestCheckInDiscoverNotes from './GuestCheckInDiscoverNotes';

type BookingSummary = {
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
  session: GuestPortalSession;
  propertyId: string;
  typeId: string;
  propertyName: string;
  unitName: string;
  guide?: Record<string, unknown> | null;
  locale: string;
  contentPrimaryLocale: string;
  transferOffer?: import('../../lib/preArrivalSettings').PreArrivalTransferOffer | null;
  booking?: BookingSummary | null;
  /** Open date lookup flow — lets guest re-enter stay dates. */
  onChangeDates?: () => void;
  /** Close overlay / return to portal home without requiring ?view=preArrival. */
  onBackToPortal?: () => void;
  backToPortalLabel?: string;
  onSubmitted?: (submission: PreArrivalSubmission) => void;
};

export default function GuestPreArrivalShell({
  session,
  propertyId,
  typeId,
  propertyName,
  unitName,
  guide,
  locale,
  contentPrimaryLocale,
  transferOffer,
  booking,
  onChangeDates,
  onBackToPortal,
  backToPortalLabel,
  onSubmitted,
}: Props) {
  const [formComplete, setFormComplete] = useState(booking?.preArrivalComplete === true);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const guestName = useMemo(() => {
    const fromSubmission = guestFullNameFromSubmission(booking?.preArrivalSubmission);
    if (fromSubmission) return fromSubmission;
    return resolveGuestDisplayName({
      guestName: booking?.guestName,
      summary: booking?.summary,
      sessionGuestName: session.guestName,
    });
  }, [
    booking?.guestName,
    booking?.summary,
    booking?.preArrivalSubmission,
    session.guestName,
  ]);

  const stayStart = booking?.start || session.checkIn || undefined;
  const stayEnd = booking?.end || session.checkOut || undefined;
  const stayLabel =
    stayStart && stayEnd ? formatBookingDateRange(stayStart, stayEnd) : '';

  const openFullPortal = () => {
    clearPreArrivalViewIntent(propertyId, typeId);
    if (onBackToPortal) {
      onBackToPortal();
      return;
    }
    const next = new URLSearchParams(searchParams);
    next.delete('view');
    const qs = next.toString();
    navigate({ search: qs ? `?${qs}` : '' }, { replace: true });
  };

  if (!onBackToPortal && !isPreArrivalPortalView(searchParams.get('view'))) {
    return null;
  }

  return (
    <div className="min-h-[100dvh] bg-[#F8FAFA] text-[#051F26]">
      <div className="mx-auto max-w-lg px-5 pt-10 pb-12">
        <div className="rounded-[28px] bg-[#0B4F5C] text-white px-6 py-8 shadow-[0_24px_80px_rgba(5,31,38,0.25)]">
          <p className="guest-eyebrow text-[#C5A059]/95 mb-2">Pre-arrival check-in</p>
          <h1 className="font-luxury text-[1.75rem] leading-tight font-medium">
            {guestName ? `Welcome, ${guestName}` : 'Welcome'}
          </h1>
          <p className="text-sm text-white/75 mt-3 leading-relaxed">
            Complete your details before arrival for{' '}
            <span className="text-white font-medium">{propertyName}</span>
            {unitName ? ` · ${unitName}` : ''}.
          </p>
          {stayLabel && (
            <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/15 px-3 py-1.5 text-sm text-white/90">
                <CalendarDays size={15} />
                {stayLabel}
              </div>
              {onChangeDates && (
                <button
                  type="button"
                  onClick={onChangeDates}
                  className="text-sm font-semibold text-[#C5A059] hover:text-[#d4b06a] underline underline-offset-2"
                >
                  Wrong dates?
                </button>
              )}
            </div>
          )}
        </div>

        <GuestPreArrivalForm
          propertyId={propertyId}
          typeId={typeId}
          session={session}
          guide={guide}
          locale={locale}
          contentPrimaryLocale={contentPrimaryLocale}
          guestName={booking?.guestName}
          guestPhone={booking?.guestPhone}
          guestWhatsapp={booking?.guestWhatsapp}
          guestEmail={booking?.guestEmail}
          existingSubmission={booking?.preArrivalSubmission}
          preArrivalComplete={booking?.preArrivalComplete}
          transferOffer={transferOffer}
          onSubmitted={(submission) => {
            setFormComplete(true);
            onSubmitted?.(submission);
          }}
          onExplorePortal={onBackToPortal ? openFullPortal : undefined}
        />

        {!formComplete && <GuestCheckInDiscoverNotes className="mt-6" />}

        {(!formComplete || !onBackToPortal) && (
          <button
            type="button"
            onClick={openFullPortal}
            className="mt-6 w-full inline-flex items-center justify-center gap-2 rounded-2xl border border-[#0B4F5C]/15 bg-white px-4 py-3.5 text-sm font-semibold text-[#0B4F5C] shadow-sm hover:bg-[#0B4F5C]/[0.03] transition-colors"
          >
            <Home size={16} />
            {backToPortalLabel || 'Back to guest portal'}
          </button>
        )}
      </div>
    </div>
  );
}
