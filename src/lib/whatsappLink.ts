/** Build wa.me links for guest → host contact (opens WhatsApp app on mobile). */

export function normalizeWhatsAppPhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let digits = trimmed.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) {
    digits = digits.slice(1);
  }
  digits = digits.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}

export function buildWhatsAppUrl(phoneDigits: string, message?: string): string {
  const base = `https://wa.me/${phoneDigits}`;
  const text = message?.trim();
  if (!text) return base;
  return `${base}?text=${encodeURIComponent(text)}`;
}

export function buildGuestWhatsAppLink(
  whatsappRaw: string | undefined,
  propertyName: string,
  propertyTypeName?: string
): string | null {
  const digits = normalizeWhatsAppPhone(whatsappRaw || '');
  if (!digits) return null;

  const stayLabel = [propertyName, propertyTypeName].filter(Boolean).join(' — ');
  const message = stayLabel
    ? `Hello! I'm a guest staying at ${stayLabel}. I have a quick question about my stay.`
    : `Hello! I'm a guest at your property and have a quick question about my stay.`;

  return buildWhatsAppUrl(digits, message);
}
