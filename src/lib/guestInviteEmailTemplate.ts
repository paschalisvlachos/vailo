/** HTML + plain-text templates for guest portal invitation emails (Resend). */

import { getGuestPortalPublicOrigin, buildInvitePortalUrl } from './guestAccess';
import { formatGuestSlug, getTypePublicSlug } from './guestPortalSlug';
import { buildPreArrivalPortalUrl, preArrivalUrlFromInviteUrl } from './guestPreArrival';
import { formatBookingDateRange } from './syncedBooking';

const PREVIEW_PASSWORD_PLACEHOLDER = '••••-••••';

/** Plain-text blurb — copy invitation, email text, WhatsApp. */
export const GUEST_INVITE_PORTAL_BENEFITS = `With Vailo, you'll have everything you need for your stay in one place, including check-in information, Wi-Fi details, house information, and useful contacts.

You can also chat with the Vailo AI Assistant to ask anything about the villa or your stay. Through the Live Like a Local feature, you can discover the best restaurants, beaches, attractions, and local experiences, with recommendations carefully selected by locals.

You can also find excursions, boat trips, and many activities that you can arrange and book.

Once activated, Vailo will be available throughout your stay, making your holiday easier, more enjoyable, and completely stress-free.`;

/** Display label for property + listing (unit) together. */
export function formatGuestStayLabel(propertyName: string, unitName: string): string {
  const property = propertyName.trim();
  const unit = unitName.trim();
  if (property && unit) return `${property} — ${unit}`;
  return property || unit || 'Your stay';
}

export type GuestInviteEmailPayload = {
  guestName: string;
  guestEmail: string;
  propertyName: string;
  unitName: string;
  /** e.g. "15 Jun – 22 Jun 2026" */
  stayRangeLabel: string;
  inviteUrl: string;
  /** Same credentials as inviteUrl, with view=preArrival */
  preArrivalUrl?: string;
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
  const stayLabel = formatGuestStayLabel(payload.propertyName, payload.unitName);
  if (payload.reinvite) {
    return `${stayLabel} — updated guest portal access`;
  }
  return `${stayLabel} — your guest portal is ready`;
}

export function buildGuestInviteEmailText(payload: GuestInviteEmailPayload): string {
  const greeting = payload.guestName.trim() || 'Guest';
  const property = payload.propertyName.trim() || 'your property';
  const unit = payload.unitName.trim();
  const stayLabel = formatGuestStayLabel(payload.propertyName, payload.unitName);
  const host = payload.hostLabel?.trim();

  const intro = payload.reinvite
    ? `We've refreshed your private guest portal access for ${stayLabel}.`
    : `Your private guest portal for ${stayLabel} is ready.`;

  const lines = [
    `Hello ${greeting},`,
    '',
    intro,
    '',
    GUEST_INVITE_PORTAL_BENEFITS,
    '',
    property ? `Property: ${property}` : '',
    unit ? `Listing: ${unit}` : '',
    payload.stayRangeLabel ? `Stay: ${payload.stayRangeLabel}` : '',
    '',
  ];
  appendGuestInviteLinkLines(lines, payload);
  lines.push(
    'Access password (same for both links):',
    payload.accessPassword,
    '',
    'Enter this password when prompted. Keep it private — it is personal to your reservation.',
    '',
    'Warm regards,',
    host || 'Your host',
    '',
    '—',
    'Powered by Vailo',
  );

  return lines.filter(Boolean).join('\n');
}

function invitePasswordIsPlaceholder(password: string): boolean {
  const trimmed = password.trim();
  return !trimmed || trimmed === PREVIEW_PASSWORD_PLACEHOLDER || trimmed.includes('•');
}

function resolvePreArrivalUrl(payload: GuestInviteEmailPayload): string {
  return payload.preArrivalUrl?.trim() || preArrivalUrlFromInviteUrl(payload.inviteUrl);
}

function appendGuestInviteLinkLines(
  lines: string[],
  payload: GuestInviteEmailPayload
): void {
  const preArrivalUrl = resolvePreArrivalUrl(payload);
  if (preArrivalUrl) {
    lines.push(
      'Before you arrive — complete your pre-arrival check-in:',
      preArrivalUrl,
      ''
    );
  }
  lines.push(
    'Your guest portal (house guide, Wi-Fi, local tips, excursions):',
    payload.inviteUrl,
    ''
  );
}

/** Plain-text invitation for clipboard (Airbnb chat, messaging apps, etc.). */
export function buildGuestInviteClipboardText(payload: GuestInviteEmailPayload): string {
  return buildGuestInviteEmailText(payload);
}

export type OpenPortalInvitePayload = {
  propertyName: string;
  unitName: string;
  portalUrl: string;
  hostLabel?: string;
  /** When true, guest portal uses invite/password gate. */
  accessRequired?: boolean;
};

/** General plain-text portal invitation for clipboard (Airbnb, email, chat). */
export function buildOpenPortalInviteClipboardText(payload: OpenPortalInvitePayload): string {
  const property = payload.propertyName.trim() || 'your property';
  const unit = payload.unitName.trim();
  const host = payload.hostLabel?.trim();
  const url = payload.portalUrl.trim();
  const accessRequired = payload.accessRequired === true;

  const intro = accessRequired
    ? `Your private guest portal for ${property} is ready. Your host will share access details for your stay.`
    : `Your guest portal for ${property} is ready — open it anytime during your stay. No access code is required.`;

  const accessNote = accessRequired
    ? 'Open the link when you arrive — your host will provide your personal access password or invitation.'
    : 'Save the link on your phone for quick access to your house guide, local tips, and the Vailo assistant.';

  const lines = [
    'Hello,',
    '',
    intro,
    '',
    GUEST_INVITE_PORTAL_BENEFITS,
    '',
    unit ? `Accommodation: ${unit}` : '',
    '',
    'Open your portal:',
    url,
    '',
    accessNote,
    '',
    'Warm regards,',
    host || 'Your host',
    '',
    '—',
    'Powered by Vailo',
  ].filter(Boolean);

  return lines.join('\n');
}

/** Short WhatsApp invitation — link, password, and Vailo portal benefits (admin → guest). */
export function buildGuestInviteWhatsAppMessage(payload: GuestInviteEmailPayload): string {
  const greeting = payload.guestName.trim() || 'there';
  const unit = payload.unitName.trim();
  const stayLabel = formatGuestStayLabel(payload.propertyName, payload.unitName);
  const stay = payload.stayRangeLabel.trim();
  const url = payload.inviteUrl.trim();
  const preArrivalUrl = resolvePreArrivalUrl(payload);
  const passwordIsPlaceholder = invitePasswordIsPlaceholder(payload.accessPassword);

  const intro = payload.reinvite
    ? `Your guest portal access for ${stayLabel} has been updated.`
    : `Your private Vailo guest portal for ${stayLabel} is ready.`;

  const lines = [
    `Hello ${greeting},`,
    '',
    intro,
    GUEST_INVITE_PORTAL_BENEFITS,
    '',
    unit && stay ? `${unit} · ${stay}` : unit || stay ? unit || stay : '',
    '',
  ];

  if (preArrivalUrl) {
    lines.push('Pre-arrival check-in (before you arrive):', preArrivalUrl, '');
  }
  lines.push('Guest portal:', url || '(link will be available after you send the invite)', '');

  if (!passwordIsPlaceholder) {
    lines.push(
      'Access password (same for both links):',
      payload.accessPassword.trim(),
      '',
      'Enter it when prompted. Keep it private.'
    );
  } else if (payload.reinvite) {
    lines.push('Your host will share your new access password separately.');
  } else {
    lines.push('Your host will share your access password when you open the link.');
  }

  lines.push('', '— Vailo Guest Portal');

  return lines.filter(Boolean).join('\n');
}

export function buildGuestInviteEmailHtml(payload: GuestInviteEmailPayload): string {
  const greeting = escapeHtml(payload.guestName.trim() || 'Guest');
  const property = escapeHtml(payload.propertyName.trim() || 'Your stay');
  const unit = escapeHtml(payload.unitName.trim());
  const stayLabel = escapeHtml(formatGuestStayLabel(payload.propertyName, payload.unitName));
  const stay = escapeHtml(payload.stayRangeLabel.trim());
  const inviteUrl = escapeHtml(payload.inviteUrl.trim());
  const preArrivalUrlRaw = resolvePreArrivalUrl(payload);
  const preArrivalUrl = escapeHtml(preArrivalUrlRaw);
  const password = escapeHtml(payload.accessPassword.trim());
  const host = escapeHtml(payload.hostLabel?.trim() || 'Your host');
  const logoUrl = escapeHtml(resolveGuestInviteLogoUrl(payload.logoUrl));

  const headline = payload.reinvite ? 'Your portal access has been updated' : 'Your guest portal is ready';
  const intro = payload.reinvite
    ? `We've issued new credentials for your private guest portal at <strong>${stayLabel}</strong>. Use the link and password below — any previous password no longer works.`
    : `Welcome! Your host has opened a private guest portal for <strong>${stayLabel}</strong> with local tips, your house guide, and tools for your stay.`;

  const preheader = payload.reinvite
    ? `Updated access for ${formatGuestStayLabel(payload.propertyName, payload.unitName)} — open your guest portal`
    : `Your guest portal for ${formatGuestStayLabel(payload.propertyName, payload.unitName)} is ready`;

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
                    ${property ? `<p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#64748B;"><span style="display:inline-block;min-width:92px;font-weight:700;color:#0B4F5C;">Property</span> ${property}</p>` : ''}
                    ${unit ? `<p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#64748B;"><span style="display:inline-block;min-width:92px;font-weight:700;color:#0B4F5C;">Listing</span> ${unit}</p>` : ''}
                    ${stay ? `<p style="margin:0;font-size:13px;line-height:1.5;color:#64748B;"><span style="display:inline-block;min-width:92px;font-weight:700;color:#0B4F5C;">Dates</span> ${stay}</p>` : ''}
                  </td>
                </tr>
              </table>
              ${
                preArrivalUrlRaw
                  ? `<p style="margin:0 0 10px;font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#64748B;">Before you arrive</p>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 16px;">
                <tr>
                  <td style="border-radius:999px;background-color:#C5A059;">
                    <a href="${preArrivalUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:14px 28px;font-size:14px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;text-decoration:none;color:#051F26;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">Complete pre-arrival check-in</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 16px;font-size:13px;line-height:1.65;color:#64748B;">Share arrival details before your stay using the same password below.</p>`
                  : ''
              }
              <p style="margin:0 0 10px;font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#64748B;">Your guest portal</p>
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
              <p style="margin:0 0 24px;font-size:13px;line-height:1.65;color:#64748B;">Use either link on your phone or computer. When prompted, enter the password exactly as shown — the same password works for both. Please keep it private — it is linked to your reservation.</p>
              <p style="margin:0;font-size:15px;line-height:1.6;color:#051F26;">Warm regards,<br /><span style="color:#0B4F5C;font-weight:600;">${host}</span></p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 28px;border-top:1px solid #EEF2F4;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
              ${
                preArrivalUrlRaw
                  ? `<p style="margin:0 0 6px;font-size:11px;line-height:1.5;color:#94A3B8;">Pre-arrival check-in link:</p>
              <p style="margin:0 0 16px;font-size:11px;line-height:1.5;word-break:break-all;"><a href="${preArrivalUrl}" style="color:#0B4F5C;">${preArrivalUrl}</a></p>`
                  : ''
              }
              <p style="margin:0 0 6px;font-size:11px;line-height:1.5;color:#94A3B8;">Guest portal link:</p>
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
  preArrivalUrl:
    'https://vailo.app/villa-serenity/main-villa?invite=sample-token&lang=en&view=preArrival',
  accessPassword: 'K7M2-PQ9',
  hostLabel: 'Villa Serenity',
};

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
  let preArrivalUrl = '';
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
    preArrivalUrl = buildPreArrivalPortalUrl(
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
    preArrivalUrl = preArrivalUrlFromInviteUrl(inviteUrl);
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
    preArrivalUrl,
    accessPassword: context.accessPassword?.trim() || PREVIEW_PASSWORD_PLACEHOLDER,
    reinvite: context.reinvite,
    hostLabel: propertyName.trim() || undefined,
    logoUrl: context.logoUrl || resolveGuestInviteLogoUrl(),
  };
}
