/** HTML + plain-text templates for guest portal invitation emails (Resend). */

import { getGuestPortalPublicOrigin, buildInvitePortalUrl } from './guestAccess';
import { formatGuestSlug, getTypePublicSlug } from './guestPortalSlug';
import { formatBookingDateRange } from './syncedBooking';

export type GuestInviteEmailPayload = {
  guestName: string;
  guestEmail: string;
  propertyName: string;
  unitName: string;
  /** e.g. "15 Jun – 22 Jun 2026" */
  stayRangeLabel: string;
  inviteUrl: string;
  accessPassword: string;
  /** First invite vs refreshed credentials */
  reinvite?: boolean;
  /** Optional sign-off, e.g. property or host name */
  hostLabel?: string;
  /** Absolute URL — defaults to {origin}/vailoLogo.png */
  logoUrl?: string;
};

export function resolveGuestInviteLogoUrl(override?: string): string {
  const trimmed = String(override || '').trim();
  if (trimmed) return trimmed;
  return `${getGuestPortalPublicOrigin()}/vailoLogo.png`;
}

function escapeHtml(text: string): string {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildGuestInviteEmailSubject(payload: GuestInviteEmailPayload): string {
  const property = payload.propertyName.trim() || 'Your stay';
  if (payload.reinvite) {
    return `${property} — updated guest portal access`;
  }
  return `${property} — your guest portal is ready`;
}

export function buildGuestInviteEmailText(payload: GuestInviteEmailPayload): string {
  const greeting = payload.guestName.trim() || 'Guest';
  const property = payload.propertyName.trim() || 'your property';
  const unit = payload.unitName.trim();
  const host = payload.hostLabel?.trim();

  const intro = payload.reinvite
    ? `We've refreshed your private guest portal access for ${property}.`
    : `Your private guest portal for ${property} is ready.`;

  const lines = [
    `Hello ${greeting},`,
    '',
    intro,
    '',
    unit ? `Accommodation: ${unit}` : '',
    payload.stayRangeLabel ? `Stay: ${payload.stayRangeLabel}` : '',
    '',
    'Open your portal:',
    payload.inviteUrl,
    '',
    'Access password:',
    payload.accessPassword,
    '',
    'On the portal page, enter this password when prompted. Keep it private — it is personal to your reservation.',
    '',
    'Warm regards,',
    host || 'Your host',
    '',
    '—',
    'Powered by Vailo',
  ].filter(Boolean);

  return lines.join('\n');
}

export function buildGuestInviteEmailHtml(payload: GuestInviteEmailPayload): string {
  const greeting = escapeHtml(payload.guestName.trim() || 'Guest');
  const property = escapeHtml(payload.propertyName.trim() || 'Your stay');
  const unit = escapeHtml(payload.unitName.trim());
  const stay = escapeHtml(payload.stayRangeLabel.trim());
  const inviteUrl = escapeHtml(payload.inviteUrl.trim());
  const password = escapeHtml(payload.accessPassword.trim());
  const host = escapeHtml(payload.hostLabel?.trim() || 'Your host');
  const logoUrl = escapeHtml(resolveGuestInviteLogoUrl(payload.logoUrl));

  const headline = payload.reinvite ? 'Your portal access has been updated' : 'Your guest portal is ready';
  const intro = payload.reinvite
    ? `We've issued new credentials for your private guest portal at <strong>${property}</strong>. Use the link and password below — any previous password no longer works.`
    : `Welcome! Your host has opened a private guest portal for <strong>${property}</strong> with local tips, your house guide, and tools for your stay.`;

  const preheader = payload.reinvite
    ? `Updated access for ${payload.propertyName.trim() || 'your stay'} — open your guest portal`
    : `Your guest portal for ${payload.propertyName.trim() || 'your stay'} is ready`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>${escapeHtml(buildGuestInviteEmailSubject(payload))}</title>
</head>
<body style="margin:0;padding:0;background-color:#EAF2F2;font-family:Georgia,'Times New Roman',serif;-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#EAF2F2;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background-color:#ffffff;border-radius:20px;overflow:hidden;border:1px solid rgba(11,79,92,0.08);box-shadow:0 12px 40px rgba(5,31,38,0.08);">
          <tr>
            <td align="center" style="padding:26px 32px 20px;background-color:#ffffff;">
              <img src="${logoUrl}" alt="Vailo" width="140" style="display:block;border:0;outline:none;text-decoration:none;height:auto;max-width:140px;margin:0 auto;" />
            </td>
          </tr>
          <tr>
            <td style="background:linear-gradient(135deg,#0B4F5C 0%,#083A43 100%);padding:24px 32px 24px;">
              <p style="margin:0 0 8px;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:rgba(197,160,89,0.95);">Guest Portal</p>
              <h1 style="margin:0;font-size:28px;line-height:1.2;font-weight:500;color:#ffffff;">${escapeHtml(headline)}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 32px 8px;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#051F26;">
              <p style="margin:0 0 16px;font-size:16px;line-height:1.6;">Hello ${greeting},</p>
              <p style="margin:0 0 24px;font-size:15px;line-height:1.65;color:#334155;">${intro}</p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px;background-color:#F8FAFA;border:1px solid #E2E8F0;border-radius:14px;">
                <tr>
                  <td style="padding:18px 20px;">
                    ${unit ? `<p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#64748B;"><span style="display:inline-block;min-width:92px;font-weight:700;color:#0B4F5C;">Stay at</span> ${unit}</p>` : ''}
                    ${stay ? `<p style="margin:0;font-size:13px;line-height:1.5;color:#64748B;"><span style="display:inline-block;min-width:92px;font-weight:700;color:#0B4F5C;">Dates</span> ${stay}</p>` : ''}
                  </td>
                </tr>
              </table>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 28px;">
                <tr>
                  <td style="border-radius:999px;background-color:#0B4F5C;">
                    <a href="${inviteUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:14px 28px;font-size:14px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;text-decoration:none;color:#ffffff;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">Open guest portal</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 10px;font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#64748B;">Your access password</p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px;">
                <tr>
                  <td align="center" style="padding:18px 20px;background-color:#051F26;border-radius:14px;">
                    <span style="font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:24px;font-weight:700;letter-spacing:0.22em;color:#C5A059;">${password}</span>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 24px;font-size:13px;line-height:1.65;color:#64748B;">Tap the button above on your phone or computer. When prompted, enter the password exactly as shown. Please keep it private — it is linked to your reservation.</p>
              <p style="margin:0;font-size:15px;line-height:1.6;color:#051F26;">Warm regards,<br /><span style="color:#0B4F5C;font-weight:600;">${host}</span></p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 28px;border-top:1px solid #EEF2F4;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
              <p style="margin:0 0 6px;font-size:11px;line-height:1.5;color:#94A3B8;">If the button doesn't work, copy this link into your browser:</p>
              <p style="margin:0 0 16px;font-size:11px;line-height:1.5;word-break:break-all;"><a href="${inviteUrl}" style="color:#0B4F5C;">${inviteUrl}</a></p>
              <p style="margin:0;font-size:11px;line-height:1.5;color:#94A3B8;">Powered by <a href="https://vailo.app" style="color:#0B4F5C;text-decoration:none;font-weight:600;">Vailo</a></p>
              <p style="margin:12px 0 0;">
                <img src="${logoUrl}" alt="Vailo" width="88" style="display:block;border:0;outline:none;height:auto;max-width:88px;opacity:0.85;" />
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export const GUEST_INVITE_EMAIL_SAMPLE: GuestInviteEmailPayload = {
  guestName: 'Alexandra Papadopoulou',
  guestEmail: 'alexandra@example.com',
  propertyName: 'Villa Serenity',
  unitName: 'Main Villa',
  stayRangeLabel: '15 Jun – 22 Jun 2026',
  inviteUrl: 'https://vailo.app/villa-serenity/main-villa?invite=sample-token&lang=en',
  accessPassword: 'K7M2-PQ9',
  hostLabel: 'Villa Serenity',
};

const PREVIEW_PASSWORD_PLACEHOLDER = '••••-••••';

export type GuestInviteEmailBookingContext = {
  guestName?: string;
  guestEmail?: string;
  summary?: string;
  start?: string;
  end?: string;
  guestLocale?: string;
  inviteToken?: string;
};

export function buildGuestInviteEmailPayloadFromBooking(context: {
  booking: GuestInviteEmailBookingContext;
  propertyName: string;
  unitName: string;
  propertySlug?: string;
  unitType?: { urlSlug?: string; typeSlug?: string; propertyTypeName?: string };
  typeId: string;
  origin?: string;
  reinvite?: boolean;
  /** Plain password — only when just generated (e.g. after send). */
  accessPassword?: string;
  inviteToken?: string;
  logoUrl?: string;
}): GuestInviteEmailPayload {
  const { booking, propertyName, unitName, typeId } = context;
  const origin = (context.origin || getGuestPortalPublicOrigin()).replace(/\/$/, '');
  const unitSlug = context.unitType ? getTypePublicSlug(context.unitType) : '';

  const token = context.inviteToken || booking.inviteToken;
  let inviteUrl = '';
  const propSlugFormatted = formatGuestSlug(context.propertySlug || '');
  if (propSlugFormatted && unitSlug && token) {
    inviteUrl = buildInvitePortalUrl(
      origin,
      propSlugFormatted,
      unitSlug,
      token,
      typeId,
      booking.guestLocale
    );
  } else if (propSlugFormatted && unitSlug) {
    const qs = new URLSearchParams({ typeId });
    const lang = String(booking.guestLocale || '').trim().toLowerCase();
    if (lang) qs.set('lang', lang);
    qs.set('invite', 'generated-on-send');
    inviteUrl = `${origin}/${propSlugFormatted}/${unitSlug}?${qs.toString()}`;
  } else {
    inviteUrl = `${origin}/…`;
  }

  return {
    guestName: booking.guestName?.trim() || booking.summary?.trim() || 'Guest',
    guestEmail: booking.guestEmail?.trim() || '',
    propertyName: propertyName.trim() || 'Your stay',
    unitName: unitName.trim(),
    stayRangeLabel: formatBookingDateRange(booking.start, booking.end),
    inviteUrl,
    accessPassword: context.accessPassword?.trim() || PREVIEW_PASSWORD_PLACEHOLDER,
    reinvite: context.reinvite,
    hostLabel: propertyName.trim() || undefined,
    logoUrl: context.logoUrl || resolveGuestInviteLogoUrl(),
  };
}
