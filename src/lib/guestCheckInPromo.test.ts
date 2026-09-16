import { describe, expect, it } from 'vitest';
import {
  resolveCanRestartCheckInDates,
  resolveCheckInStayLabel,
  resolveGuestCheckInComplete,
  resolveGuestCheckInPromoState,
} from './guestCheckInPromo';
import {
  isPreArrivalCheckInEnabled,
  shouldIncludePreArrivalInviteLink,
} from './preArrivalSettings';

describe('resolveGuestCheckInComplete', () => {
  it('is complete when any source says so', () => {
    expect(resolveGuestCheckInComplete({ checkInCompleteLocal: true })).toBe(true);
    expect(resolveGuestCheckInComplete({ sessionPreArrivalComplete: true })).toBe(true);
    expect(resolveGuestCheckInComplete({ bookingPreArrivalComplete: true })).toBe(true);
    expect(resolveGuestCheckInComplete({})).toBe(false);
  });
});

describe('resolveGuestCheckInPromoState', () => {
  it('hides check-in UI when the feature is disabled', () => {
    expect(
      resolveGuestCheckInPromoState({
        preArrivalCheckInEnabled: false,
        bookingPreArrivalComplete: true,
        sessionId: 's1',
        sessionSource: 'pre_arrival_dates',
      })
    ).toMatchObject({
      showCheckInPromo: false,
      heroSlot: 'none',
      showCompletedCheckInStrip: false,
      canRestartCheckInDates: false,
    });
  });

  it('puts incomplete check-in in the hero and LLL in the grid', () => {
    expect(
      resolveGuestCheckInPromoState({
        preArrivalCheckInEnabled: true,
        sessionBookingId: 'CHECKIN-1',
      })
    ).toEqual({
      showCheckInPromo: true,
      checkInComplete: false,
      checkInContinue: true,
      canRestartCheckInDates: false,
      heroSlot: 'check_in_promo',
      secondarySlot: 'live_like_local',
      showCompletedCheckInStrip: false,
    });
  });

  it('after complete: LLL in hero, AI in grid, strip under tiles, Wrong dates allowed', () => {
    expect(
      resolveGuestCheckInPromoState({
        preArrivalCheckInEnabled: true,
        sessionPreArrivalComplete: true,
        sessionBookingId: 'CHECKIN-1',
        sessionSource: 'pre_arrival_dates',
        sessionId: 'sess-1',
      })
    ).toEqual({
      showCheckInPromo: true,
      checkInComplete: true,
      checkInContinue: false,
      canRestartCheckInDates: true,
      heroSlot: 'live_like_local',
      secondarySlot: 'ai_assistant',
      showCompletedCheckInStrip: true,
    });
  });

  it('does not offer Wrong dates for invite sessions', () => {
    expect(
      resolveCanRestartCheckInDates({
        sessionSource: 'invite',
        sessionId: 'sess-1',
      })
    ).toBe(false);
  });
});

describe('resolveCheckInStayLabel', () => {
  it('prefers booking dates over session dates', () => {
    expect(
      resolveCheckInStayLabel({
        bookingStart: '2026-09-14',
        bookingEnd: '2026-09-18',
        sessionCheckIn: '2026-09-01',
        sessionCheckOut: '2026-09-02',
        formatRange: (s, e) => `${s}→${e}`,
      })
    ).toBe('2026-09-14→2026-09-18');
  });

  it('returns null without a full range', () => {
    expect(
      resolveCheckInStayLabel({
        sessionCheckIn: '2026-09-14',
        formatRange: (s, e) => `${s}→${e}`,
      })
    ).toBeNull();
  });
});

describe('preArrivalSettings invite link', () => {
  it('defaults check-in enabled and omits invite link once complete', () => {
    expect(isPreArrivalCheckInEnabled({})).toBe(true);
    expect(isPreArrivalCheckInEnabled({ preArrivalCheckInEnabled: false })).toBe(false);
    expect(
      shouldIncludePreArrivalInviteLink({
        preArrivalCheckInEnabled: true,
        preArrivalComplete: true,
      })
    ).toBe(false);
    expect(
      shouldIncludePreArrivalInviteLink({
        preArrivalCheckInEnabled: true,
        preArrivalComplete: false,
      })
    ).toBe(true);
  });
});
