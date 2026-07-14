/** Host notification when the 24/7 assistant cannot answer from the house guide. */

const { GUEST_INVITE_FROM, getGuestPortalPublicOrigin } = require("./guestInviteEmail");

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildAssistantEscalationAdminUrl(propertyId) {
  const origin = getGuestPortalPublicOrigin();
  return `${origin}/admin/properties/${encodeURIComponent(propertyId)}/guest-issues`;
}

function buildAssistantEscalationEmailSubject(payload) {
  const property = String(payload.propertyName || "").trim() || "Your property";
  const unit = String(payload.unitName || "").trim();
  if (unit) return `${property} — guest needs help (${unit})`;
  return `${property} — guest needs help with a stay question`;
}

function buildAssistantEscalationEmailText(payload) {
  const property = String(payload.propertyName || "").trim() || "Your property";
  const unit = String(payload.unitName || "").trim();
  const question = String(payload.guestQuestion || "").trim();
  const aiResponse = String(payload.aiResponse || "").trim();
  const adminUrl = String(payload.adminUrl || "").trim();

  return [
    "A guest asked your 24/7 assistant something that isn't covered in the house guide yet.",
    "",
    `Property: ${property}`,
    unit ? `Unit: ${unit}` : "",
    "",
    "Guest question:",
    question,
    "",
    aiResponse ? `Assistant reply (shown to guest):\n${aiResponse}\n` : "",
    "Suggested next steps:",
    "• Reply to the guest if you have the answer",
    "• Add the missing detail to your house guide so the assistant can answer next time",
    "",
    adminUrl ? `View in Vailo: ${adminUrl}` : "",
    "",
    "—",
    "Powered by Vailo",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildAssistantEscalationEmailHtml(payload) {
  const property = escapeHtml(String(payload.propertyName || "").trim() || "Your property");
  const unit = escapeHtml(String(payload.unitName || "").trim());
  const question = escapeHtml(String(payload.guestQuestion || "").trim());
  const aiResponse = escapeHtml(String(payload.aiResponse || "").trim());
  const adminUrl = escapeHtml(String(payload.adminUrl || "").trim());
  const subject = escapeHtml(buildAssistantEscalationEmailSubject(payload));
  const preheader = "A guest question wasn't in the house guide — review and update your guide if needed.";

  const aiBlock = aiResponse
    ? `<p style="margin:0 0 10px;font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#64748B;">Assistant reply (shown to guest)</p>
       <p style="margin:0;font-size:14px;line-height:1.65;color:#475569;white-space:pre-wrap;">${aiResponse}</p>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#EAF2F2;font-family:Georgia,'Times New Roman',serif;-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#EAF2F2;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background-color:#ffffff;border-radius:20px;overflow:hidden;border:1px solid rgba(11,79,92,0.08);box-shadow:0 12px 40px rgba(5,31,38,0.08);">
          <tr>
            <td style="background:linear-gradient(135deg,#0B4F5C 0%,#083A43 100%);padding:24px 32px;">
              <p style="margin:0 0 8px;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:11px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:rgba(197,160,89,0.95);">24/7 Assistant</p>
              <h1 style="margin:0;font-size:26px;line-height:1.25;font-weight:500;color:#ffffff;">Guest needs your help</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px 8px;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#051F26;">
              <p style="margin:0 0 20px;font-size:15px;line-height:1.65;color:#334155;">Your guest asked something that isn't in the house guide yet. We've saved it as a guest issue and shared your assistant's reply with them.</p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 20px;background-color:#F8FAFA;border:1px solid #E2E8F0;border-radius:14px;">
                <tr>
                  <td style="padding:16px 18px;">
                    <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#64748B;"><span style="display:inline-block;min-width:72px;font-weight:700;color:#0B4F5C;">Property</span> ${property}</p>
                    ${unit ? `<p style="margin:0;font-size:13px;line-height:1.5;color:#64748B;"><span style="display:inline-block;min-width:72px;font-weight:700;color:#0B4F5C;">Unit</span> ${unit}</p>` : ""}
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 10px;font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#64748B;">Guest question</p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 20px;">
                <tr>
                  <td style="padding:16px 18px;background-color:#FFF9F0;border-left:4px solid #C5A059;border-radius:0 12px 12px 0;">
                    <p style="margin:0;font-size:15px;line-height:1.65;color:#051F26;white-space:pre-wrap;">${question}</p>
                  </td>
                </tr>
              </table>
              ${aiBlock ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px;"><tr><td style="padding:16px 18px;background-color:#F1F5F9;border-radius:12px;">${aiBlock}</td></tr></table>` : ""}
              <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#051F26;font-weight:600;">What to do next</p>
              <ul style="margin:0 0 24px;padding-left:20px;font-size:14px;line-height:1.65;color:#475569;">
                <li style="margin-bottom:6px;">Reply to the guest if you can answer directly</li>
                <li>Update your house guide so the assistant can answer this next time</li>
              </ul>
              ${
                adminUrl
                  ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 8px;">
                <tr>
                  <td style="border-radius:999px;background-color:#0B4F5C;">
                    <a href="${adminUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:14px 28px;font-size:14px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;text-decoration:none;color:#ffffff;">View guest issues</a>
                  </td>
                </tr>
              </table>`
                  : ""
              }
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 24px;border-top:1px solid #EEF2F4;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
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

async function deliverAssistantEscalationEmail(apiKey, toEmail, payload) {
  const to = String(toEmail || "").trim();
  if (!to || !to.includes("@")) {
    throw new Error("Invalid recipient email.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: GUEST_INVITE_FROM,
      to: [to],
      subject: buildAssistantEscalationEmailSubject(payload),
      text: buildAssistantEscalationEmailText(payload),
      html: buildAssistantEscalationEmailHtml(payload),
    }),
  });

  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(`Resend ${response.status}: ${bodyText}`);
  }
  try {
    return bodyText ? JSON.parse(bodyText) : null;
  } catch {
    return null;
  }
}

module.exports = {
  buildAssistantEscalationAdminUrl,
  buildAssistantEscalationEmailSubject,
  deliverAssistantEscalationEmail,
};
