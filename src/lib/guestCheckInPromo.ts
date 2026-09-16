/**
 * Pure guest-portal check-in promo / layout rules (no React I/O).
 */

export type GuestCheckInHeroSlot = 'check_in_promo' | 'live_like_local' | 'none';
export type GuestCheckInSecondarySlot = 'live_like_local' | 'ai_assistant';

export type GuestCheckInPromoState = {
  showCheckInPromo: boolean;
  checkInComplete: boolean;
  checkInContinue: boolean;
  canRestartCheckInDates: boolean;
  /** Incomplete: check-in CTA in hero. Complete: Live like a local in hero. */
  heroSlot: GuestCheckInHeroSlot;
  /** Incomplete: LLL in grid. Complete: AI Assistant takes that grid slot. */
  secondarySlot: GuestCheckInSecondarySlot;
  /** Completed check-in strip under Live like a local / Book & Arrange. */
  showCompletedCheckInStrip: boolean;
};

export function resolveGuestCheckInComplete(options: {
  checkInCompleteLocal?: boolean;
  sessionPreArrivalComplete?: boolean;
  bookingPreArrivalComplete?: boolean;
}): boolean {
  return (
    options.checkInCompleteLocal === true ||
    options.sessionPreArrivalComplete === true ||
    options.bookingPreArrivalComplete === true
  );
}

export function resolveCanRestartCheckInDates(options: {
  sessionSource?: string | null;
  sessionId?: string | null;
}): boolean {
  return options.sessionSource === 'pre_arrival_dates' && Boolean(options.sessionId);
}

export function resolveGuestCheckInPromoState(options: {
  preArrivalCheckInEnabled: boolean;
  checkInCompleteLocal?: boolean;
  sessionPreArrivalComplete?: boolean;
  bookingPreArrivalComplete?: boolean;
  sessionBookingId?: string | null;
  sessionSource?: string | null;
  sessionId?: string | null;
}): GuestCheckInPromoState {
  const showCheckInPromo = options.preArrivalCheckInEnabled === true;
  const checkInComplete = resolveGuestCheckInComplete(options);
  const checkInContinue = Boolean(options.sessionBookingId) && !checkInComplete;
  const canRestartCheckInDates = resolveCanRestartCheckInDates(options);

  if (!showCheckInPromo) {
    return {
      showCheckInPromo: false,
      checkInComplete,
      checkInContinue: false,
      canRestartCheckInDates: false,
      heroSlot: 'none',
      secondarySlot: 'live_like_local',
      showCompletedCheckInStrip: false,
    };
  }

  if (checkInComplete) {
    return {
      showCheckInPromo: true,
      checkInComplete: true,
      checkInContinue: false,
      canRestartCheckInDates,
      heroSlot: 'live_like_local',
      secondarySlot: 'ai_assistant',
      showCompletedCheckInStrip: true,
    };
  }

  return {
    showCheckInPromo: true,
    checkInComplete: false,
    checkInContinue,
    canRestartCheckInDates,
    heroSlot: 'check_in_promo',
    secondarySlot: 'live_like_local',
    showCompletedCheckInStrip: false,
  };
}

export function resolveCheckInStayLabel(options: {
  bookingStart?: string | null;
  bookingEnd?: string | null;
  sessionCheckIn?: string | null;
  sessionCheckOut?: string | null;
  formatRange: (start: string, end: string) => string;
}): string | null {
  const start = options.bookingStart || options.sessionCheckIn || undefined;
  const end = options.bookingEnd || options.sessionCheckOut || undefined;
  if (!start || !end) return null;
  const label = options.formatRange(start, end);
  return label || null;
}
