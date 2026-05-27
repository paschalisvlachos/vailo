import { buildWhatsAppUrl, normalizeWhatsAppPhone } from './whatsappLink';

/** Prefilled message when a guest contacts a local service partner. */
export function buildServiceInquiryMessage(
  propertyName: string,
  propertyTypeName: string | undefined,
  serviceName?: string
): string {
  const stay = [propertyName, propertyTypeName].filter(Boolean).join(', ');
  const servicePart = serviceName?.trim() ? ` (${serviceName.trim()})` : '';
  return `Hello! I am contacting you from ${stay}. I am interested in your services${servicePart}.`;
}

export function buildServiceWhatsAppLink(
  whatsappRaw: string | undefined,
  message: string
): string | null {
  const digits = normalizeWhatsAppPhone(whatsappRaw || '');
  if (!digits) return null;
  return buildWhatsAppUrl(digits, message);
}

export function buildServiceEmailLink(
  emailRaw: string | undefined,
  message: string,
  subject?: string
): string | null {
  const email = emailRaw?.trim();
  if (!email || !email.includes('@')) return null;
  const params = new URLSearchParams();
  if (subject?.trim()) params.set('subject', subject.trim());
  params.set('body', message);
  const qs = params.toString();
  return `mailto:${email}${qs ? `?${qs}` : ''}`;
}
