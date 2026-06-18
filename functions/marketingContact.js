const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { FieldValue } = require("firebase-admin/firestore");

const resendApiKey = defineSecret("RESEND_API_KEY");

const CONTACT_TO = "info@vailo.app";
const CONTACT_FROM = "Vailo Website <contact@vailo.app>";
const MAX_NAME = 120;
const MAX_EMAIL = 254;
const MAX_COMPANY = 160;
const MAX_COUNTRY = 80;
const MAX_PHONE = 40;
const MAX_MESSAGE = 4000;

function setCors(req, res) {
  const origin = req.get("origin") || "";
  const allowed =
    !origin ||
    /^https:\/\/(www\.)?vailo\.app$/i.test(origin) ||
    /^http:\/\/localhost(:\d+)?$/i.test(origin);
  res.set("Access-Control-Allow-Origin", allowed ? origin || "*" : "https://vailo.app");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  res.set("Access-Control-Max-Age", "86400");
}

function trim(value, max) {
  return String(value || "").trim().slice(0, max);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPhone(phone) {
  if (!phone) return true;
  return /^[\d\s+\-().]{6,}$/.test(phone);
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildContactEmail(payload) {
  const rows = [
    ["Name", payload.name],
    ["Email", payload.email],
    ["Company", payload.company || "—"],
    ["Role", payload.role || "—"],
    ["Country", payload.country || "—"],
    ["Telephone", payload.phone || "—"],
    ["Message", payload.message],
  ];

  const text = rows.map(([label, value]) => `${label}: ${value}`).join("\n");

  const htmlRows = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:8px 12px;font-weight:600;color:#0B4F5C;vertical-align:top;white-space:nowrap;">${escapeHtml(label)}</td>` +
        `<td style="padding:8px 12px;color:#333;">${escapeHtml(value).replace(/\n/g, "<br>")}</td></tr>`
    )
    .join("");

  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:560px;color:#333;">
      <p style="margin:0 0 16px;font-size:15px;">New inquiry from the Vailo marketing website.</p>
      <table style="border-collapse:collapse;width:100%;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        ${htmlRows}
      </table>
      <p style="margin:16px 0 0;font-size:13px;color:#666;">Reply directly to this email to reach ${escapeHtml(payload.email)}.</p>
    </div>`;

  return { html, text };
}

async function deliverViaResend(apiKey, payload) {
  const { html, text } = buildContactEmail(payload);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: CONTACT_FROM,
      to: [CONTACT_TO],
      reply_to: payload.email,
      subject: `Website inquiry — ${payload.name}`,
      html,
      text,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend ${response.status}: ${body}`);
  }
}

function registerMarketingContact({ firestore, logger, firebaseExports }) {
  firebaseExports.submitMarketingContact = onRequest(
    {
      region: "us-central1",
      maxInstances: 10,
      cors: false,
      secrets: [resendApiKey],
    },
    async (req, res) => {
      setCors(req, res);

      if (req.method === "OPTIONS") {
        res.status(204).send("");
        return;
      }

      if (req.method !== "POST") {
        res.status(405).json({ error: "Method not allowed" });
        return;
      }

      const honeypot = trim(req.body?.website, 200);
      if (honeypot) {
        res.status(200).json({ ok: true });
        return;
      }

      const name = trim(req.body?.name, MAX_NAME);
      const email = trim(req.body?.email, MAX_EMAIL).toLowerCase();
      const company = trim(req.body?.company, MAX_COMPANY);
      const role = trim(req.body?.role, 80);
      const country = trim(req.body?.country, MAX_COUNTRY);
      const phone = trim(req.body?.phone, MAX_PHONE);
      const message = trim(req.body?.message, MAX_MESSAGE);

      if (!name || name.length < 2) {
        res.status(400).json({ error: "Please enter your name." });
        return;
      }
      if (!isValidEmail(email)) {
        res.status(400).json({ error: "Please enter a valid email address." });
        return;
      }
      if (!isValidPhone(phone)) {
        res.status(400).json({ error: "Please enter a valid telephone number." });
        return;
      }
      if (!message || message.length < 10) {
        res.status(400).json({ error: "Please enter a message (at least 10 characters)." });
        return;
      }

      const inquiry = {
        name,
        email,
        company: company || null,
        role: role || null,
        country: country || null,
        phone: phone || null,
        message,
        source: "marketing_website",
        userAgent: trim(req.get("user-agent"), 400) || null,
        createdAt: FieldValue.serverTimestamp(),
      };

      try {
        await firestore.collection("marketingContactInquiries").add(inquiry);
      } catch (err) {
        logger.error("marketingContact Firestore write failed", err);
        res.status(500).json({ error: "Could not save your message. Please try again." });
        return;
      }

      try {
        await deliverViaResend(resendApiKey.value(), {
          name,
          email,
          company,
          role,
          country,
          phone,
          message,
        });
        const { recordContactFormInbox } = require("./resendInbox");
        await recordContactFormInbox(firestore, {
          name,
          email,
          company,
          role,
          country,
          phone,
          message,
        });
      } catch (err) {
        logger.error("marketingContact Resend delivery failed", err);
        res.status(502).json({
          error: "Your message was saved but email delivery failed. Please try again or email info@vailo.app directly.",
        });
        return;
      }

      res.status(200).json({ ok: true });
    }
  );
}

module.exports = {
  registerMarketingContact,
  CONTACT_TO,
  CONTACT_FROM,
  escapeHtml,
  buildContactEmail,
};
