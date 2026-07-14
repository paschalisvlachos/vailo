/** Post-stay thank-you message for guests (email + host WhatsApp). */

import { formatGuestStayLabel } from './guestInviteEmailTemplate';
import { resolveGuestInviteLogoUrl } from './guestInviteEmailTemplate';

export type PostStayThankYouPayload = {
  guestName: string;
  propertyName: string;
  unitName: string;
  stayRangeLabel?: string;
  hostLabel?: string;
  logoUrl?: string;
};

function escapeHtml(text: string): string {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildPostStayThankYouSubject(payload: PostStayThankYouPayload): string {
  const stayLabel = formatGuestStayLabel(payload.propertyName, payload.unitName);
  return `Thank you for staying at ${stayLabel}`;
}

export function buildPostStayThankYouText(payload: PostStayThankYouPayload): string {
  const greeting = payload.guestName.trim() || 'Guest';
  const stayLabel = formatGuestStayLabel(payload.propertyName, payload.unitName);
  const host = payload.hostLabel?.trim() || payload.propertyName.trim() || 'Your host';
  const stay = payload.stayRangeLabel?.trim();

  return [
    `Hello ${greeting},`,
    '',
    `Thank you for staying with us at ${stayLabel}. We hope you had a wonderful time${stay ? ` (${stay})` : ''}.`,
    '',
    'We would be delighted to welcome you back in the future. When you are planning your next visit, please reach out — we would be glad to prepare a personal offer for you.',
    '',
    'Warm regards,',
    host,
    '',
    '—',
    'Powered by Vailo',
  ].join('\n');
}

/** Same copy as the email — for host-initiated WhatsApp to the guest. */
export function buildPostStayThankYouWhatsAppMessage(payload: PostStayThankYouPayload): string {
  return buildPostStayThankYouText(payload);
}

export function buildPostStayThankYouEmailHtml(payload: PostStayThankYouPayload): string {
  const greeting = escapeHtml(payload.guestName.trim() || 'Guest');
  const property = escapeHtml(payload.propertyName.trim() || 'Your stay');
  const unit = escapeHtml(payload.unitName.trim());
  const stayLabel = escapeHtml(formatGuestStayLabel(payload.propertyName, payload.unitName));
  const stay = escapeHtml(payload.stayRangeLabel?.trim() || '');
  const host = escapeHtml(payload.hostLabel?.trim() || payload.propertyName.trim() || 'Your host');
  const logoUrl = escapeHtml(resolveGuestInviteLogoUrl(payload.logoUrl));
  const subject = escapeHtml(buildPostStayThankYouSubject(payload));

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#EAF2F2;font-family:Georgia,'Times New Roman',serif;-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#EAF2F2;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background-color:#ffffff;border-radius:20px;overflow:hidden;border:1px solid rgba(11,79,92,0.08);box-shadow:0 12px 40px rgba(5,31,38,0.08);">
          <tr>
            <td align="center" style="padding:26px 32px 20px;background-color:#ffffff;">
              <img src="${logoUrl}" alt="Vailo" width="140" style="display:block;border:0;outline:none;height:auto;max-width:140px;margin:0 auto;" />
            </td>
          </tr>
          <tr>
            <td style="background:linear-gradient(135deg,#0B4F5C 0%,#083A43 100%);padding:24px 32px;">
              <p style="margin:0 0 8px;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:rgba(197,160,89,0.95);">Thank you</p>
              <h1 style="margin:0;font-size:26px;line-height:1.25;font-weight:500;color:#ffffff;">We hope you enjoyed your stay</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 32px 8px;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#051F26;">
              <p style="margin:0 0 16px;font-size:16px;line-height:1.6;">Hello ${greeting},</p>
              <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#334155;">Thank you for staying with us at <strong>${stayLabel}</strong>. We hope you had a wonderful time and carry fond memories of your visit.</p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px;background-color:#F8FAFA;border:1px solid #E2E8F0;border-radius:14px;">
                <tr>
                  <td style="padding:18px 20px;">
                    ${property ? `<p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#64748B;"><span style="display:inline-block;min-width:92px;font-weight:700;color:#0B4F5C;">Property</span> ${property}</p>` : ''}
                    ${unit ? `<p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#64748B;"><span style="display:inline-block;min-width:92px;font-weight:700;color:#0B4F5C;">Listing</span> ${unit}</p>` : ''}
                    ${stay ? `<p style="margin:0;font-size:13px;line-height:1.5;color:#64748B;"><span style="display:inline-block;min-width:92px;font-weight:700;color:#0B4F5C;">Dates</span> ${stay}</p>` : ''}
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:#334155;">We would be delighted to welcome you back in the future. When you are planning your next visit, please reach out — we would be glad to prepare a <strong>personal offer</strong> for you.</p>
              <p style="margin:0;font-size:15px;line-height:1.6;color:#051F26;">Warm regards,<br /><span style="color:#0B4F5C;font-weight:600;">${host}</span></p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 28px;border-top:1px solid #EEF2F4;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
              <p style="margin:0;font-size:11px;line-height:1.5;color:#94A3B8;">Powered by <a href="https://vailo.app" style="color:#0B4F5C;text-decoration:none;font-weight:600;">Vailo</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
