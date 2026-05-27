/** Strip to digits for wa.me (E.164 without +). */
export function normalizeWhatsAppPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 8) return null;
  return digits;
}

export function buildWhatsAppChatUrl(raw: string): string | null {
  const phone = normalizeWhatsAppPhone(raw);
  if (!phone) return null;
  return `https://wa.me/${phone}`;
}

/** Phone string suitable for wa.me, if the booking has a valid number. */
export function bookingWhatsAppPhone(booking: {
  guestWhatsapp?: string;
  guestPhone?: string;
}): string | null {
  const raw = (booking.guestWhatsapp || booking.guestPhone || '').trim();
  if (!raw || raw === '—') return null;
  return buildWhatsAppChatUrl(raw) ? raw : null;
}
