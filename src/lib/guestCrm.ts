import {
  formatPreArrivalTimeDisplay,
} from './preArrivalSubmission';
import {
  formatBookingDateRange,
  isBookingGuestDetailsComplete,
  type SyncedBooking,
} from './syncedBooking';
import { formatPreArrivalTransferPrice } from './preArrivalSettings';

export type GuestCrmProfile = {
  id: string;
  primaryName?: string;
  primaryEmail?: string;
  primaryPhone?: string;
  guestLocale?: string;
  stayCount?: number;
  lastStayEnd?: string;
  lastPreArrivalAt?: string;
  lastExpectedArrivalTime?: string;
  lastGuestCount?: number;
  lastTransferRequested?: boolean;
  updatedAt?: string;
};

export type HouseGuestRow = {
  id: string;
  typeId: string;
  unitName: string;
  guestName: string;
  guestEmail: string;
  guestWhatsapp: string;
  guestLocale: string;
  dateRange: string;
  start: string;
  end: string;
  provider?: string;
  preArrivalComplete?: boolean;
  expectedArrivalTime?: string;
  guestCount?: number;
  transferRequested?: boolean;
  transferLabel?: string;
  transferPriceLabel?: string;
  returningGuest?: boolean;
  priorStayCount?: number;
};

type PropertyTypeWithBookings = {
  id: string;
  propertyTypeName?: string;
  syncedBookings?: SyncedBooking[];
};

function guestIdentityKey(booking: SyncedBooking): string {
  const email = booking.guestEmail?.trim().toLowerCase();
  if (email && email.includes('@')) return `email:${email}`;
  const phone = (booking.guestWhatsapp || booking.guestPhone || '').replace(/\D/g, '');
  if (phone.length >= 6) return `phone:${phone}`;
  const name = (booking.guestName || booking.summary || '').trim().toLowerCase();
  return `name:${name || booking.id || 'unknown'}`;
}

export function collectHouseGuests(propertyTypes: PropertyTypeWithBookings[]): HouseGuestRow[] {
  const stayCountByIdentity = new Map<string, number>();

  for (const type of propertyTypes) {
    for (const booking of type.syncedBookings || []) {
      if (!isBookingGuestDetailsComplete(booking)) continue;
      if (!booking.start || !booking.end) continue;
      const key = guestIdentityKey(booking);
      stayCountByIdentity.set(key, (stayCountByIdentity.get(key) || 0) + 1);
    }
  }

  const rows: HouseGuestRow[] = [];

  for (const type of propertyTypes) {
    const unitName = type.propertyTypeName?.trim() || 'Unit';
    for (const booking of type.syncedBookings || []) {
      if (!isBookingGuestDetailsComplete(booking)) continue;
      if (!booking.start || !booking.end) continue;

      const submission = booking.preArrivalSubmission;
      const identityKey = guestIdentityKey(booking);
      const priorStayCount = stayCountByIdentity.get(identityKey) || 1;

      rows.push({
        id: booking.id || `${type.id}-${booking.start}-${booking.end}`,
        typeId: type.id,
        unitName,
        guestName: booking.guestName!.trim(),
        guestEmail: booking.guestEmail?.trim() || '',
        guestWhatsapp: (booking.guestWhatsapp || booking.guestPhone || '').trim() || '—',
        guestLocale: booking.guestLocale!.trim(),
        start: booking.start,
        end: booking.end,
        dateRange: formatBookingDateRange(booking.start, booking.end),
        provider: booking.provider,
        preArrivalComplete: booking.preArrivalComplete,
        expectedArrivalTime: submission?.expectedArrivalTime
          ? formatPreArrivalTimeDisplay(submission.expectedArrivalTime)
          : undefined,
        guestCount: submission?.guestCount,
        transferRequested: submission?.transferRequested,
        transferLabel: submission?.transferOffer?.label,
        transferPriceLabel:
          submission?.transferOffer?.priceEur != null
            ? formatPreArrivalTransferPrice(submission.transferOffer.priceEur)
            : undefined,
        returningGuest: priorStayCount > 1,
        priorStayCount,
      });
    }
  }

  return rows.sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime());
}
