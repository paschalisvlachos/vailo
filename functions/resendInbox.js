const { onRequest, onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { FieldValue } = require("firebase-admin/firestore");
const { Webhook } = require("svix");
const { requirePlatformAdmin } = require("./platformAdmin");

const resendApiKey = defineSecret("RESEND_API_KEY");

const INBOX_COLLECTION = "adminInboxMessages";
const INBOX_FROM = "Vailo <info@vailo.app>";
const CONTACT_FROM = "Vailo Website <contact@vailo.app>";

function resendHeaders(apiKey) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

function threadKeyFromSubject(subject) {
  return String(subject || "")
    .replace(/^re:\s*/i, "")
    .trim()
    .toLowerCase()
    .slice(0, 200);
}

function normalizeAddressList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String);
  return [String(value)];
}

async function resendFetch(apiKey, path, options = {}) {
  const response = await fetch(`https://api.resend.com${path}`, {
    ...options,
    headers: { ...resendHeaders(apiKey), ...(options.headers || {}) },
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!response.ok) {
    throw new Error(`Resend ${response.status}: ${text}`);
  }
  return json;
}

function messageDocId(resendEmailId) {
  return `resend_${resendEmailId}`;
}

async function upsertReceivedEmail(firestore, apiKey, summary, source) {
  const resendEmailId = String(summary?.id || summary?.email_id || "").trim();
  if (!resendEmailId) return null;

  const docId = messageDocId(resendEmailId);
  const ref = firestore.collection(INBOX_COLLECTION).doc(docId);
  const existing = await ref.get();
  if (existing.exists && existing.data()?.html) {
    return docId;
  }

  const full = await resendFetch(apiKey, `/emails/receiving/${encodeURIComponent(resendEmailId)}`);

  const attachments = (full.attachments || summary.attachments || []).map((a) => ({
    id: a.id,
    filename: a.filename || "attachment",
    contentType: a.content_type || a.contentType || "application/octet-stream",
    size: a.size || null,
    resendAttachmentId: a.id,
  }));

  const payload = {
    resendEmailId,
    resendSentId: null,
    direction: "inbound",
    from: full.from || summary.from || "",
    to: normalizeAddressList(full.to || summary.to),
    cc: normalizeAddressList(full.cc || summary.cc),
    bcc: normalizeAddressList(full.bcc || summary.bcc),
    replyTo: normalizeAddressList(full.reply_to || summary.reply_to)[0] || null,
    subject: full.subject || summary.subject || "(No subject)",
    html: full.html || null,
    text: full.text || null,
    messageId: full.message_id || summary.message_id || null,
    threadKey: threadKeyFromSubject(full.subject || summary.subject),
    attachments,
    source,
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (!existing.exists) {
    payload.createdAt = FieldValue.serverTimestamp();
    payload.readAt = null;
    payload.readBy = null;
  }

  await ref.set(payload, { merge: true });
  return docId;
}

async function recordContactFormInbox(firestore, inquiry) {
  const docId = `contact_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  await firestore.collection(INBOX_COLLECTION).doc(docId).set({
    resendEmailId: null,
    resendSentId: null,
    direction: "contact_form",
    from: inquiry.email,
    to: ["info@vailo.app"],
    cc: [],
    bcc: [],
    replyTo: inquiry.email,
    subject: `Website inquiry — ${inquiry.name}`,
    html: null,
    text: [
      `Name: ${inquiry.name}`,
      `Email: ${inquiry.email}`,
      `Company: ${inquiry.company || "—"}`,
      `Role: ${inquiry.role || "—"}`,
      `Country: ${inquiry.country || "—"}`,
      `Telephone: ${inquiry.phone || "—"}`,
      "",
      inquiry.message,
    ].join("\n"),
    messageId: null,
    threadKey: threadKeyFromSubject(`Website inquiry — ${inquiry.name}`),
    attachments: [],
    source: "contact_form",
    contactFormMeta: {
      name: inquiry.name,
      company: inquiry.company || null,
      role: inquiry.role || null,
      country: inquiry.country || null,
      phone: inquiry.phone || null,
    },
    readAt: null,
    readBy: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return docId;
}

async function syncAllReceived(firestore, apiKey, logger) {
  let hasMore = true;
  let after = null;
  let synced = 0;

  while (hasMore) {
    const qs = after ? `?after=${encodeURIComponent(after)}` : "";
    const list = await resendFetch(apiKey, `/emails/receiving${qs}`);
    const items = list?.data || [];
    for (const item of items) {
      await upsertReceivedEmail(firestore, apiKey, item, "sync");
      synced += 1;
    }
    hasMore = Boolean(list?.has_more);
    after = items.length ? items[items.length - 1].id : null;
    if (!after) hasMore = false;
  }

  logger.info("resendInbox sync complete", { synced });
  return synced;
}

function registerResendInbox({ firestore, logger, firebaseExports }) {
  firebaseExports.resendInboundWebhook = onRequest(
    {
      region: "us-central1",
      maxInstances: 10,
      secrets: [resendApiKey],
    },
    async (req, res) => {
      if (req.method !== "POST") {
        res.status(405).send("Method not allowed");
        return;
      }

      const webhookSecret = String(process.env.RESEND_WEBHOOK_SECRET || "").trim();
      if (!webhookSecret) {
        logger.error("resendInboundWebhook: RESEND_WEBHOOK_SECRET not configured");
        res.status(503).json({ error: "Inbound webhook not configured" });
        return;
      }

      try {
        const wh = new Webhook(webhookSecret);
        const payload = wh.verify(req.rawBody, {
          "svix-id": req.get("svix-id") || "",
          "svix-timestamp": req.get("svix-timestamp") || "",
          "svix-signature": req.get("svix-signature") || "",
        });

        if (payload?.type === "email.received" && payload?.data?.email_id) {
          await upsertReceivedEmail(
            firestore,
            resendApiKey.value(),
            payload.data,
            "webhook"
          );
        }

        res.status(200).json({ ok: true });
      } catch (err) {
        logger.error("resendInboundWebhook failed", err);
        res.status(400).json({ error: "Webhook verification failed" });
      }
    }
  );

  firebaseExports.syncResendInbox = onCall(
    { region: "us-central1", secrets: [resendApiKey] },
    async (request) => {
      await requirePlatformAdmin(request, firestore);
      try {
        const synced = await syncAllReceived(firestore, resendApiKey.value(), logger);
        return { ok: true, synced };
      } catch (err) {
        logger.error("syncResendInbox failed", err);
        const msg = String(err?.message || err || "Resend sync failed.");
        if (/401|403|invalid api key/i.test(msg)) {
          throw new HttpsError("failed-precondition", "Resend API key is missing or invalid.");
        }
        if (/404|not found/i.test(msg)) {
          throw new HttpsError(
            "failed-precondition",
            "Resend inbound email is not configured for this domain yet."
          );
        }
        throw new HttpsError("internal", msg.slice(0, 500));
      }
    }
  );

  firebaseExports.markAdminInboxRead = onCall(
    { region: "us-central1" },
    async (request) => {
      const admin = await requirePlatformAdmin(request, firestore);
      const messageId = String(request.data?.messageId || "").trim();
      if (!messageId) {
        throw new HttpsError("invalid-argument", "messageId required.");
      }
      await firestore.collection(INBOX_COLLECTION).doc(messageId).set(
        {
          readAt: FieldValue.serverTimestamp(),
          readBy: admin.uid,
        },
        { merge: true }
      );
      return { ok: true };
    }
  );

  firebaseExports.getAdminInboxAttachment = onCall(
    { region: "us-central1", secrets: [resendApiKey] },
    async (request) => {
      await requirePlatformAdmin(request, firestore);
      const resendEmailId = String(request.data?.resendEmailId || "").trim();
      const attachmentId = String(request.data?.attachmentId || "").trim();
      if (!resendEmailId || !attachmentId) {
        throw new HttpsError("invalid-argument", "resendEmailId and attachmentId required.");
      }

      const meta = await resendFetch(
        resendApiKey.value(),
        `/emails/receiving/${encodeURIComponent(resendEmailId)}/attachments/${encodeURIComponent(attachmentId)}`
      );

      const downloadUrl = meta?.download_url || meta?.downloadUrl;
      if (!downloadUrl) {
        throw new HttpsError("not-found", "Attachment download URL not available.");
      }

      const fileRes = await fetch(downloadUrl);
      if (!fileRes.ok) {
        throw new HttpsError("internal", "Failed to download attachment.");
      }
      const buffer = Buffer.from(await fileRes.arrayBuffer());
      return {
        filename: meta?.filename || "attachment",
        contentType: meta?.content_type || meta?.contentType || "application/octet-stream",
        contentBase64: buffer.toString("base64"),
      };
    }
  );

  firebaseExports.sendAdminInboxEmail = onCall(
    { region: "us-central1", secrets: [resendApiKey] },
    async (request) => {
      const admin = await requirePlatformAdmin(request, firestore);
      const to = normalizeAddressList(request.data?.to);
      const subject = String(request.data?.subject || "").trim();
      const text = String(request.data?.text || "").trim();
      const html = String(request.data?.html || "").trim();
      const replyToMessageDocId = String(request.data?.replyToMessageDocId || "").trim();
      const attachmentsIn = Array.isArray(request.data?.attachments) ? request.data.attachments : [];

      if (!to.length) throw new HttpsError("invalid-argument", "Recipient required.");
      if (!subject) throw new HttpsError("invalid-argument", "Subject required.");
      if (!text && !html) throw new HttpsError("invalid-argument", "Message body required.");

      const headers = {};
      let inReplyTo = null;
      if (replyToMessageDocId) {
        const original = await firestore.collection(INBOX_COLLECTION).doc(replyToMessageDocId).get();
        if (original.exists && original.data()?.messageId) {
          inReplyTo = original.data().messageId;
          headers["In-Reply-To"] = inReplyTo;
          headers.References = inReplyTo;
        }
      }

      const attachments = attachmentsIn
        .slice(0, 5)
        .map((a) => ({
          filename: String(a.filename || "attachment").slice(0, 200),
          content: String(a.contentBase64 || ""),
        }))
        .filter((a) => a.content);

      const body = {
        from: INBOX_FROM,
        to,
        subject,
        text: text || undefined,
        html: html || (text ? `<pre style="font-family:system-ui,sans-serif;white-space:pre-wrap">${text.replace(/</g, "&lt;")}</pre>` : undefined),
        reply_to: admin.email,
        headers: Object.keys(headers).length ? headers : undefined,
        attachments: attachments.length ? attachments : undefined,
      };

      const sent = await resendFetch(resendApiKey.value(), "/emails", {
        method: "POST",
        body: JSON.stringify(body),
      });

      const docId = `sent_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      await firestore.collection(INBOX_COLLECTION).doc(docId).set({
        resendEmailId: null,
        resendSentId: sent?.id || null,
        direction: "outbound",
        from: INBOX_FROM,
        to,
        cc: [],
        bcc: [],
        replyTo: admin.email,
        subject,
        html: body.html || null,
        text: text || null,
        messageId: sent?.id ? `<${sent.id}@vailo.app>` : null,
        inReplyTo,
        threadKey: threadKeyFromSubject(subject),
        attachments: attachments.map((a) => ({
          filename: a.filename,
          contentType: "application/octet-stream",
          outbound: true,
        })),
        source: "admin_compose",
        readAt: FieldValue.serverTimestamp(),
        readBy: admin.uid,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      return { ok: true, id: docId, resendSentId: sent?.id || null };
    }
  );
}

module.exports = {
  registerResendInbox,
  recordContactFormInbox,
  INBOX_COLLECTION,
  CONTACT_FROM,
};
