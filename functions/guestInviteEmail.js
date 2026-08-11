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

function preArrivalUrlFromInviteUrl(inviteUrl) {
  const trimmed = String(inviteUrl || "").trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    url.searchParams.set("view", "preArrival");
    return url.toString();
  } catch {
    return trimmed;
  }
}

function resolvePreArrivalUrl(payload) {
  const explicit = String(payload.preArrivalUrl || "").trim();
  if (explicit) return explicit;
  return preArrivalUrlFromInviteUrl(payload.inviteUrl);
}

function appendGuestInviteLinkLines(lines, payload, options) {
  const preArrivalUrl = resolvePreArrivalUrl(payload);
  if (preArrivalUrl) {
    lines.push(
      "Before you arrive — complete your pre-arrival check-in:",
      preArrivalUrl,
      ""
    );
  }
  lines.push(
    "Your guest portal (house guide, Wi-Fi, local tips, excursions):",
    payload.inviteUrl,
    ""
  );
  if (options?.passwordNote) {
    lines.push(options.passwordNote, "");
  }
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

const GUEST_INVITE_PORTAL_BENEFITS = `With Vailo, you'll have everything you need for your stay in one place, including check-in information, Wi-Fi details, house information, and useful contacts.

You can also chat with the Vailo AI Assistant to ask anything about the villa or your stay. Through the Live Like a Local feature, you can discover the best restaurants, beaches, attractions, and local experiences, with recommendations carefully selected by locals.

You can also find excursions, boat trips, and many activities that you can arrange and book.

Once activated, Vailo will be available throughout your stay, making your holiday easier, more enjoyable, and completely stress-free.`;

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

function formatGuestStayLabel(propertyName, unitName) {
  const property = String(propertyName || "").trim();
  const unit = String(unitName || "").trim();
  if (property && unit) return `${property} — ${unit}`;
  return property || unit || "Your stay";
}

function buildGuestInviteEmailSubject(payload) {
  const stayLabel = formatGuestStayLabel(payload.propertyName, payload.unitName);
  if (payload.reinvite) {
    return `${stayLabel} — updated guest portal access`;
  }
  return `${stayLabel} — your guest portal is ready`;
}

function buildGuestInviteEmailText(payload) {
  const greeting = String(payload.guestName || "").trim() || "Guest";
  const property = String(payload.propertyName || "").trim() || "your property";
  const unit = String(payload.unitName || "").trim();
  const stayLabel = formatGuestStayLabel(payload.propertyName, payload.unitName);
  const host = String(payload.hostLabel || "").trim();

  const intro = payload.reinvite
    ? `We've refreshed your private guest portal access for ${stayLabel}.`
    : `Your private guest portal for ${stayLabel} is ready.`;

  const lines = [
    `Hello ${greeting},`,
    "",
    intro,
    "",
    GUEST_INVITE_PORTAL_BENEFITS,
    "",
    property ? `Property: ${property}` : "",
    unit ? `Listing: ${unit}` : "",
    payload.stayRangeLabel ? `Stay: ${payload.stayRangeLabel}` : "",
    "",
  ];
  appendGuestInviteLinkLines(lines, payload);
  lines.push(
    "Access password (same for both links):",
    payload.accessPassword,
    "",
    "Enter this password when prompted. Keep it private — it is personal to your reservation.",
    "",
    "Warm regards,",
    host || "Your host",
    "",
    "—",
    "Powered by Vailo"
  );

  return lines.filter(Boolean).join("\n");
}

function buildGuestInviteEmailHtml(payload) {
  const greeting = escapeHtml(String(payload.guestName || "").trim() || "Guest");
  const property = escapeHtml(String(payload.propertyName || "").trim() || "Your stay");
  const unit = escapeHtml(String(payload.unitName || "").trim());
  const stayLabel = escapeHtml(formatGuestStayLabel(payload.propertyName, payload.unitName));
  const stay = escapeHtml(String(payload.stayRangeLabel || "").trim());
  const inviteUrl = escapeHtml(String(payload.inviteUrl || "").trim());
  const preArrivalUrlRaw = resolvePreArrivalUrl(payload);
  const preArrivalUrl = escapeHtml(preArrivalUrlRaw);
  const password = escapeHtml(String(payload.accessPassword || "").trim());
  const host = escapeHtml(String(payload.hostLabel || "").trim() || "Your host");
  const logoUrl = escapeHtml(resolveGuestInviteLogoUrl(payload.logoUrl));

  const headline = payload.reinvite
    ? "Your portal access has been updated"
    : "Your guest portal is ready";
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
                    ${property ? `<p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#64748B;"><span style="display:inline-block;min-width:92px;font-weight:700;color:#0B4F5C;">Property</span> ${property}</p>` : ""}
                    ${unit ? `<p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#64748B;"><span style="display:inline-block;min-width:92px;font-weight:700;color:#0B4F5C;">Listing</span> ${unit}</p>` : ""}
                    ${stay ? `<p style="margin:0;font-size:13px;line-height:1.5;color:#64748B;"><span style="display:inline-block;min-width:92px;font-weight:700;color:#0B4F5C;">Dates</span> ${stay}</p>` : ""}
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
                  : ""
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
                  : ""
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

function buildGuestInviteEmailFromContext(context) {
  const propertyName = String(context.propertyName || "").trim() || "Your stay";
  const inviteUrl = String(context.inviteUrl || "").trim();
  return {
    guestName: String(context.guestName || "").trim() || "Guest",
    guestEmail: String(context.guestEmail || "").trim(),
    propertyName,
    unitName: String(context.unitName || "").trim(),
    stayRangeLabel: String(context.stayRangeLabel || "").trim(),
    inviteUrl,
    preArrivalUrl:
      String(context.preArrivalUrl || "").trim() || preArrivalUrlFromInviteUrl(inviteUrl),
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
