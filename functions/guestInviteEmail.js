/** Guest portal invitation emails (Resend). Mirrors src/lib/guestInviteEmailTemplate.ts */

const GUEST_INVITE_FROM = "Vailo <info@vailo.app>";

function getGuestPortalPublicOrigin() {
  const fromEnv = String(process.env.GUEST_PORTAL_ORIGIN || "").trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  return "https://vailo.app";
}

function formatGuestSlug(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function getTypePublicSlug(typeData) {
  const explicit = formatGuestSlug(typeData?.urlSlug || typeData?.typeSlug);
  if (explicit) return explicit;
  return formatGuestSlug(typeData?.propertyTypeName);
}

function buildInvitePortalUrl(origin, propertySlug, typeSlug, inviteToken, typeId, guestLocale) {
  const base = String(origin || "").replace(/\/$/, "");
  const qs = new URLSearchParams({ invite: inviteToken });
  if (typeId) qs.set("typeId", typeId);
  const lang = String(guestLocale || "").trim().toLowerCase();
  if (lang) qs.set("lang", lang);
  return `${base}/${propertySlug}/${typeSlug}?${qs.toString()}`;
}

function formatBookingDateRange(start, end) {
  const fmt = (iso) => {
    if (!iso) return "—";
    const parts = String(iso).split("-").map(Number);
    if (parts.length < 3) return iso;
    const [y, m, d] = parts;
    return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
  };
  return `${fmt(start)} → ${fmt(end)}`;
}

const GUEST_INVITE_PORTAL_BENEFITS =
  "Inside you'll find your house guide, local tips, Live Like a Local recommendations, and curated restaurants and activities — everything for your stay in one place on your phone.";

function resolveGuestInviteLogoUrl(override) {
  const trimmed = String(override || "").trim();
  if (trimmed) return trimmed;
  return `${getGuestPortalPublicOrigin()}/vailoLogo.png`;
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildGuestInviteEmailSubject(payload) {
  const property = String(payload.propertyName || "").trim() || "Your stay";
  if (payload.reinvite) {
    return `${property} — updated guest portal access`;
  }
  return `${property} — your guest portal is ready`;
}

function buildGuestInviteEmailText(payload) {
  const greeting = String(payload.guestName || "").trim() || "Guest";
  const property = String(payload.propertyName || "").trim() || "your property";
  const unit = String(payload.unitName || "").trim();
  const host = String(payload.hostLabel || "").trim();

  const intro = payload.reinvite
    ? `We've refreshed your private guest portal access for ${property}.`
    : `Your private guest portal for ${property} is ready.`;

  const lines = [
    `Hello ${greeting},`,
    "",
    intro,
    "",
    GUEST_INVITE_PORTAL_BENEFITS,
    "",
    unit ? `Accommodation: ${unit}` : "",
    payload.stayRangeLabel ? `Stay: ${payload.stayRangeLabel}` : "",
    "",
    "Open your portal:",
    payload.inviteUrl,
    "",
    "Access password:",
    payload.accessPassword,
    "",
    "On the portal page, enter this password when prompted. Keep it private — it is personal to your reservation.",
    "",
    "Warm regards,",
    host || "Your host",
    "",
    "—",
    "Powered by Vailo",
  ].filter(Boolean);

  return lines.join("\n");
}

function buildGuestInviteEmailHtml(payload) {
  const greeting = escapeHtml(String(payload.guestName || "").trim() || "Guest");
  const property = escapeHtml(String(payload.propertyName || "").trim() || "Your stay");
  const unit = escapeHtml(String(payload.unitName || "").trim());
  const stay = escapeHtml(String(payload.stayRangeLabel || "").trim());
  const inviteUrl = escapeHtml(String(payload.inviteUrl || "").trim());
  const password = escapeHtml(String(payload.accessPassword || "").trim());
  const host = escapeHtml(String(payload.hostLabel || "").trim() || "Your host");
  const logoUrl = escapeHtml(resolveGuestInviteLogoUrl(payload.logoUrl));

  const headline = payload.reinvite
    ? "Your portal access has been updated"
    : "Your guest portal is ready";
  const intro = payload.reinvite
    ? `We've issued new credentials for your private guest portal at <strong>${property}</strong>. Use the link and password below — any previous password no longer works.`
    : `Welcome! Your host has opened a private guest portal for <strong>${property}</strong> with local tips, your house guide, and tools for your stay.`;

  const preheader = payload.reinvite
    ? `Updated access for ${String(payload.propertyName || "").trim() || "your stay"} — open your guest portal`
    : `Your guest portal for ${String(payload.propertyName || "").trim() || "your stay"} is ready`;

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
                    ${unit ? `<p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#64748B;"><span style="display:inline-block;min-width:92px;font-weight:700;color:#0B4F5C;">Stay at</span> ${unit}</p>` : ""}
                    ${stay ? `<p style="margin:0;font-size:13px;line-height:1.5;color:#64748B;"><span style="display:inline-block;min-width:92px;font-weight:700;color:#0B4F5C;">Dates</span> ${stay}</p>` : ""}
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

function buildGuestInviteEmailFromContext(context) {
  const propertyName = String(context.propertyName || "").trim() || "Your stay";
  return {
    guestName: String(context.guestName || "").trim() || "Guest",
    guestEmail: String(context.guestEmail || "").trim(),
    propertyName,
    unitName: String(context.unitName || "").trim(),
    stayRangeLabel: String(context.stayRangeLabel || "").trim(),
    inviteUrl: String(context.inviteUrl || "").trim(),
    accessPassword: String(context.accessPassword || "").trim(),
    reinvite: Boolean(context.reinvite),
    hostLabel: String(context.hostLabel || "").trim() || propertyName,
    logoUrl: context.logoUrl,
  };
}

async function deliverGuestInviteEmail(apiKey, toEmail, payload) {
  const to = String(toEmail || "").trim();
  if (!to || !to.includes("@")) {
    throw new Error("Invalid recipient email.");
  }

  const subject = buildGuestInviteEmailSubject(payload);
  const text = buildGuestInviteEmailText(payload);
  const html = buildGuestInviteEmailHtml(payload);

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: GUEST_INVITE_FROM,
      to: [to],
      subject,
      text,
      html,
    }),
  });

  const bodyText = await response.text();
  let json = null;
  try {
    json = bodyText ? JSON.parse(bodyText) : null;
  } catch {
    json = null;
  }
  if (!response.ok) {
    throw new Error(`Resend ${response.status}: ${bodyText}`);
  }
  return json;
}

module.exports = {
  GUEST_INVITE_FROM,
  getGuestPortalPublicOrigin,
  formatGuestSlug,
  getTypePublicSlug,
  buildInvitePortalUrl,
  formatBookingDateRange,
  buildGuestInviteEmailFromContext,
  buildGuestInviteEmailSubject,
  deliverGuestInviteEmail,
};
