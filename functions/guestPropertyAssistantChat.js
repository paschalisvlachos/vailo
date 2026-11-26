/**
 * Guest Ask Vailo chat via Google AI Studio API key.
 * Bypasses client Firebase AI Logic / Vertex App Check 401s.
 */

const axios = require("axios");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");

/** Prefer lite first — guest chat is high-volume and 3.8 often hits capacity. */
const DEFAULT_MODEL = "gemini-3.5-flash-lite";
const FALLBACK_MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-3.8-flash",
  "gemini-flash-latest",
];
const GEMINI_MAX_ATTEMPTS_PER_MODEL = 2;
const MAX_HISTORY_TURNS = 24;
const MAX_TEXT_CHARS = 8000;
const MAX_SYSTEM_CHARS = 120_000;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

function asTrimmed(value) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function geminiApiKey() {
  const apiKey = asTrimmed(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
  if (!apiKey) {
    throw new HttpsError(
      "failed-precondition",
      "GEMINI_API_KEY is not configured on Cloud Functions."
    );
  }
  if (!apiKey.startsWith("AIza")) {
    throw new HttpsError(
      "failed-precondition",
      "GEMINI_API_KEY must be a Google AI Studio API key (starts with AIza…)."
    );
  }
  return apiKey;
}

function resolvePrimaryModel() {
  const configured = asTrimmed(process.env.GEMINI_GUEST_ASSISTANT_MODEL);
  return configured || DEFAULT_MODEL;
}

function normalizeContents(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const turn of raw.slice(-MAX_HISTORY_TURNS)) {
    if (!turn || typeof turn !== "object") continue;
    const role = turn.role === "model" ? "model" : "user";
    const partsIn = Array.isArray(turn.parts) ? turn.parts : [];
    const parts = [];
    for (const part of partsIn) {
      if (!part || typeof part !== "object") continue;
      if (typeof part.text === "string" && part.text.trim()) {
        parts.push({ text: part.text.slice(0, MAX_TEXT_CHARS) });
        continue;
      }
      const inline = part.inlineData || part.inline_data;
      if (inline && typeof inline === "object") {
        const mimeType = asTrimmed(inline.mimeType || inline.mime_type);
        const data = asTrimmed(inline.data);
        if (!mimeType.startsWith("image/") || !data) continue;
        // Rough base64 size check (~4/3 of bytes)
        if (data.length > Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 64) continue;
        parts.push({ inline_data: { mime_type: mimeType, data } });
      }
    }
    if (!parts.length) continue;
    out.push({ role, parts });
  }
  return out;
}

function isTransientGeminiFailure(status, detail) {
  return (
    status === 429 ||
    status === 503 ||
    /quota|rate limit|resource_exhausted|high demand|temporarily|unavailable|try again later|overloaded|capacity/i.test(
      String(detail || "")
    )
  );
}

async function callGeminiOnce({ apiKey, model, systemInstruction, contents }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const body = {
    systemInstruction: {
      parts: [{ text: systemInstruction.slice(0, MAX_SYSTEM_CHARS) }],
    },
    contents,
    generationConfig: {
      temperature: 0.55,
      maxOutputTokens: 2048,
    },
  };

  const res = await axios.post(url, body, {
    params: { key: apiKey },
    headers: { "Content-Type": "application/json" },
    timeout: 90000,
    validateStatus: () => true,
  });

  if (res.status >= 400) {
    const detail =
      res.data?.error?.message ||
      res.data?.error?.status ||
      `HTTP ${res.status}`;
    const err = new Error(detail);
    err.status = res.status;
    err.detail = detail;
    err.transient = isTransientGeminiFailure(res.status, detail);
    throw err;
  }

  const parts = res.data?.candidates?.[0]?.content?.parts || [];
  const text = parts
    .map((p) => (typeof p.text === "string" ? p.text : ""))
    .filter(Boolean)
    .join("\n")
    .trim();

  return text;
}

async function generateAssistantReply({ apiKey, systemInstruction, contents }) {
  const primary = resolvePrimaryModel();
  const models = [primary, ...FALLBACK_MODELS.filter((m) => m !== primary)];
  let lastErr = null;

  for (const model of models) {
    for (let attempt = 0; attempt < GEMINI_MAX_ATTEMPTS_PER_MODEL; attempt += 1) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const text = await callGeminiOnce({
          apiKey,
          model,
          systemInstruction,
          contents,
        });
        return { text, model };
      } catch (err) {
        lastErr = err;
        if (!err?.transient) {
          logger.error("guestPropertyAssistantChat Gemini hard error", {
            model,
            status: err?.status,
            detail: err?.detail || err?.message,
          });
          throw new HttpsError(
            "internal",
            `Assistant model error: ${err?.detail || err?.message || "unknown"}`
          );
        }
        const delayMs = 800 * 2 ** attempt;
        logger.warn("guestPropertyAssistantChat Gemini busy, retrying", {
          model,
          attempt: attempt + 1,
          delayMs,
          detail: err?.detail || err?.message,
        });
        // eslint-disable-next-line no-await-in-loop
        await sleep(delayMs);
      }
    }
  }

  throw new HttpsError(
    "unavailable",
    `Assistant is busy right now (${lastErr?.detail || "high demand"}). Please try again in a moment.`
  );
}

function registerGuestPropertyAssistantChat({ firebaseExports }) {
  if (!firebaseExports) {
    throw new Error("registerGuestPropertyAssistantChat requires firebaseExports");
  }

  firebaseExports.askGuestPropertyAssistant = onCall(
    {
      timeoutSeconds: 90,
      memory: "512MiB",
      enforceAppCheck: false,
    },
    async (request) => {
      const data = request.data || {};
      const propertyId = asTrimmed(data.propertyId);
      const typeId = asTrimmed(data.typeId);
      const systemInstruction = asTrimmed(data.systemInstruction);
      const contents = normalizeContents(data.contents);

      if (!propertyId || !typeId) {
        throw new HttpsError("invalid-argument", "propertyId and typeId are required.");
      }
      if (!systemInstruction) {
        throw new HttpsError("invalid-argument", "systemInstruction is required.");
      }
      if (!contents.length) {
        throw new HttpsError("invalid-argument", "contents must include at least one turn.");
      }
      const last = contents[contents.length - 1];
      if (last.role !== "user") {
        throw new HttpsError(
          "invalid-argument",
          "Last content turn must be from the user."
        );
      }

      const apiKey = geminiApiKey();
      const { text, model } = await generateAssistantReply({
        apiKey,
        systemInstruction,
        contents,
      });

      return {
        text:
          text ||
          "I don't have that information in your house guide yet.",
        model,
      };
    }
  );
}

module.exports = { registerGuestPropertyAssistantChat };
