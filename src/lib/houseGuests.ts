import {
  formatBookingDateRange,
  isBookingGuestDetailsComplete,
  type SyncedBooking,
} from './syncedBooking';

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
};

type PropertyTypeWithBookings = {
  id: string;
  propertyTypeName?: string;
  syncedBookings?: SyncedBooking[];
};

export function collectHouseGuests(propertyTypes: PropertyTypeWithBookings[]): HouseGuestRow[] {
  const rows: HouseGuestRow[] = [];

  for (const type of propertyTypes) {
    const unitName = type.propertyTypeName?.trim() || 'Unit';
    for (const booking of type.syncedBookings || []) {
      if (!isBookingGuestDetailsComplete(booking)) continue;
      if (!booking.start || !booking.end) continue;

      rows.push({
        id: booking.id || `${type.id}-${booking.start}-${booking.end}`,
        typeId: type.id,
        unitName,
        guestName: booking.guestName!.trim(),
        guestEmail: booking.guestEmail!.trim(),
        guestWhatsapp: (booking.guestWhatsapp || booking.guestPhone || '').trim() || '—',
        guestLocale: booking.guestLocale!.trim(),
        start: booking.start,
        end: booking.end,
        dateRange: formatBookingDateRange(booking.start, booking.end),
        provider: booking.provider,
      });
    }
  }

  return rows.sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime());
}

export function languageTitleForCode(
  code: string,
  languages: { shortName: string; title: string }[]
): string {
  const hit = languages.find((l) => l.shortName === code);
  return hit ? `${hit.title} (${hit.shortName})` : code;
}
