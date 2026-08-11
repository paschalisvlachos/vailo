/** Partner agreement invitation emails (Resend). */

const PARTNER_AGREEMENT_FROM = "Vailo <info@vailo.app>";

function getPublicOrigin() {
  const fromEnv = String(process.env.GUEST_PORTAL_ORIGIN || "").trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  return "https://vailo.app";
}

function buildPartnerAgreementUrl(token) {
  const base = getPublicOrigin();
  const qs = new URLSearchParams({ token: String(token || "").trim() });
  return `${base}/partner-agreement?${qs.toString()}`;
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildPartnerAgreementEmailSubject(agreementLabel) {
  return `Vailo — please review and accept your ${agreementLabel}`;
}

function buildPartnerAgreementEmailText(payload) {
  const name = String(payload.recipientName || "").trim() || "Partner";
  const agreementLabel = String(payload.agreementLabel || "partner agreement").trim();
  const url = String(payload.agreementUrl || "").trim();
  const lines = [
    `Dear ${name},`,
    "",
    `Please review and accept the Vailo ${agreementLabel}.`,
    "",
    "Open the link below to read the agreement and confirm your acceptance:",
    url,
    "",
    "If you did not expect this email, you can ignore it.",
    "",
    "Kind regards,",
    "The Vailo Team",
  ];
  return lines.join("\n");
}

function buildPartnerAgreementEmailHtml(payload) {
  const name = escapeHtml(String(payload.recipientName || "").trim() || "Partner");
  const agreementLabel = escapeHtml(
    String(payload.agreementLabel || "partner agreement").trim()
  );
  const url = escapeHtml(String(payload.agreementUrl || "").trim());
  return `<!DOCTYPE html>
<html lang="en">
<body style="font-family: Georgia, 'Times New Roman', serif; color: #051F26; line-height: 1.6; margin: 0; padding: 24px; background: #f7f9fa;">
  <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 32px; border: 1px solid #e5e7eb;">
    <p style="margin-top: 0;">Dear ${name},</p>
    <p>Please review and accept the Vailo <strong>${agreementLabel}</strong>.</p>
    <p style="margin: 28px 0;">
      <a href="${url}" style="display: inline-block; background: #0B4F5C; color: #ffffff; text-decoration: none; padding: 12px 22px; border-radius: 8px; font-weight: 600;">
        Review and accept agreement
      </a>
    </p>
    <p style="font-size: 14px; color: #6b7280;">Or copy this link into your browser:<br><a href="${url}" style="color: #0B4F5C; word-break: break-all;">${url}</a></p>
    <p style="font-size: 14px; color: #6b7280; margin-bottom: 0;">If you did not expect this email, you can ignore it.</p>
    <p style="margin-top: 28px; margin-bottom: 0;">Kind regards,<br>The Vailo Team</p>
  </div>
</body>
</html>`;
}

async function deliverPartnerAgreementEmail(apiKey, toEmail, payload) {
  const to = String(toEmail || "").trim();
  if (!to || !to.includes("@")) {
    throw new Error("Invalid recipient email.");
  }

  const subject = buildPartnerAgreementEmailSubject(payload.agreementLabel);
  const text = buildPartnerAgreementEmailText(payload);
  const html = buildPartnerAgreementEmailHtml(payload);

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: PARTNER_AGREEMENT_FROM,
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
  buildPartnerAgreementUrl,
  buildPartnerAgreementEmailSubject,
  deliverPartnerAgreementEmail,
};
