const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const axios = require("axios");

const DEFAULT_MODEL = "gemini-2.5-flash";
const FALLBACK_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-flash-latest"];
const MAX_INLINE_BYTES = 8 * 1024 * 1024;
const MAX_PARTS = 16;
const MAX_URL_FETCHES = 8;
const MAX_PAGE_CHARS = 14000;
const GEMINI_MAX_ATTEMPTS_PER_MODEL = 3;

function resolveGeminiApiKey() {
  const apiKey = String(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "").trim();
  if (!apiKey) {
    throw new HttpsError(
      "failed-precondition",
      "Set GEMINI_API_KEY on Cloud Functions for House Guide AI Import."
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

function resolveModel() {
  const configured = String(process.env.GEMINI_HOUSE_GUIDE_IMPORT_MODEL || "").trim();
  return configured || DEFAULT_MODEL;
}

function normalizeParts(rawParts) {
  if (!Array.isArray(rawParts) || rawParts.length === 0) {
    throw new HttpsError("invalid-argument", "Missing content parts for AI import.");
  }
  if (rawParts.length > MAX_PARTS) {
    throw new HttpsError(
      "invalid-argument",
      `Too many attachments (max ${MAX_PARTS}). Remove some files and try again.`
    );
  }

  const parts = [];
  let totalInline = 0;

  for (const part of rawParts) {
    if (!part || typeof part !== "object") continue;
    if (typeof part.text === "string" && part.text.trim()) {
      parts.push({ text: part.text });
      continue;
    }
    const inline = part.inlineData;
    if (
      inline &&
      typeof inline === "object" &&
      typeof inline.mimeType === "string" &&
      typeof inline.data === "string" &&
      inline.data.trim()
    ) {
      const approxBytes = Math.floor((inline.data.length * 3) / 4);
      totalInline += approxBytes;
      if (totalInline > MAX_INLINE_BYTES) {
        throw new HttpsError(
          "invalid-argument",
          "Uploaded files are too large for AI import. Use smaller images/PDFs or paste text instead."
        );
      }
      parts.push({
        inlineData: {
          mimeType: inline.mimeType.trim() || "application/octet-stream",
          data: inline.data.trim(),
        },
      });
    }
  }

  if (parts.length === 0) {
    throw new HttpsError("invalid-argument", "No usable text or files to analyze.");
  }
  return parts;
}

function htmlToPlainText(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function isMapsPlaceUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    return (
      host.includes("google.") ||
      host === "maps.app.goo.gl" ||
      host === "share.google" ||
      host.includes("goo.gl")
    );
  } catch {
    return false;
  }
}

function isLikelyOtaHost(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    return (
      host.includes("airbnb.") ||
      host.includes("booking.com") ||
      host.includes("vrbo.") ||
      host.includes("homeaway.") ||
      host.includes("hotels.com") ||
      host.includes("expedia.")
    );
  } catch {
    return false;
  }
}

async function fetchUrlSource(entry) {
  const id = String(entry?.id || "").trim();
  const url = String(entry?.url || "").trim();
  const label = String(entry?.label || "Web page").trim() || "Web page";

  if (!id || !url || !/^https?:\/\//i.test(url)) {
    return {
      id: id || "unknown",
      url,
      label,
      status: "skipped",
      note: "Invalid URL",
      textPreview: "",
    };
  }

  // Google Maps / share pages are JS apps — server fetch returns almost no usable text.
  if (isMapsPlaceUrl(url)) {
    return {
      id,
      url,
      label,
      status: "skipped",
      note:
        "Google Maps pages can’t be scraped (they’re app shells). Address/name already come from Maps Auto-fill — no need to fetch this link.",
      textPreview: "",
    };
  }

  try {
    const res = await axios.get(url, {
      timeout: 20000,
      maxRedirects: 5,
      responseType: "text",
      headers: {
        // Browser-like headers reduce 403s on some hotel sites; OTAs still often block bots.
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,el;q=0.8",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
      validateStatus: (status) => status >= 200 && status < 400,
    });

    const contentType = String(res.headers["content-type"] || "").toLowerCase();
    let text = "";
    if (contentType.includes("html") || String(res.data || "").includes("<html")) {
      text = htmlToPlainText(res.data);
    } else {
      text = String(res.data || "").replace(/\s+/g, " ").trim();
    }

    // Tiny payloads usually mean a JS shell / bot wall, not real content.
    if (!text || text.length < 80) {
      return {
        id,
        url,
        label,
        status: "failed",
        note: isLikelyOtaHost(url)
          ? "OTA listing blocked bots (Airbnb/Booking/Hotels often do). Paste the listing text or upload a PDF/screenshot instead."
          : "Page returned almost no readable text (JS-only page or bot wall). Paste the useful text or upload a file instead.",
        textPreview: "",
      };
    }

    if (text.length > MAX_PAGE_CHARS) {
      text = `${text.slice(0, MAX_PAGE_CHARS)}\n…[truncated]`;
    }

    return {
      id,
      url,
      label,
      status: "ok",
      note: `Fetched ${text.length} characters`,
      textPreview: text,
    };
  } catch (err) {
    const status = err?.response?.status;
    const timedOut = /timeout/i.test(String(err?.message || ""));
    let note = String(err?.message || "Fetch failed");
    if (status === 403 || status === 401) {
      note = isLikelyOtaHost(url)
        ? `Site blocked our fetch (HTTP ${status}). OTAs usually require you to paste notes or upload a PDF.`
        : `Site blocked our fetch (HTTP ${status}). Try pasting the page text or uploading a file.`;
    } else if (timedOut) {
      note = isLikelyOtaHost(url)
        ? "Timed out — this OTA is slow or blocking bots. Paste listing text or upload a file instead."
        : "Timed out waiting for the page. Paste the text or upload a file instead.";
    } else if (status) {
      note = `HTTP ${status} while fetching page`;
    }
    return {
      id,
      url,
      label,
      status: "failed",
      note,
      textPreview: "",
    };
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientGeminiError(err) {
  if (err instanceof HttpsError) return false;
  const status = err?.response?.status;
  const code = err?.response?.data?.error?.code;
  const apiMsg = String(err?.response?.data?.error?.message || err?.message || "");
  return (
    status === 429 ||
    status === 503 ||
    code === 429 ||
    /quota|rate limit|resource_exhausted|high demand|temporarily|unavailable|try again later|overloaded/i.test(
      apiMsg
    )
  );
}

async function generateHouseGuideImportJson(apiKey, model, parts) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const { data } = await axios.post(
    `${url}?key=${encodeURIComponent(apiKey)}`,
    {
      contents: [{ role: "user", parts }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.2,
      },
    },
    { timeout: 110000 }
  );

  const text = String(data?.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
  if (!text) {
    throw new HttpsError("internal", "AI returned an empty response. Try again with clearer notes.");
  }
  return text;
}

async function generateHouseGuideImportJsonWithRetry(apiKey, primaryModel, parts) {
  const models = [
    primaryModel,
    ...FALLBACK_MODELS.filter((model) => model !== primaryModel),
  ];
  let lastErr = null;

  for (const model of models) {
    for (let attempt = 0; attempt < GEMINI_MAX_ATTEMPTS_PER_MODEL; attempt += 1) {
      try {
        const text = await generateHouseGuideImportJson(apiKey, model, parts);
        return { text, model };
      } catch (err) {
        lastErr = err;
        if (err instanceof HttpsError) throw err;
        if (!isTransientGeminiError(err)) throw err;
        const delayMs = 1500 * 2 ** attempt;
        logger.warn("analyzeHouseGuideImport Gemini busy, retrying", {
          model,
          attempt: attempt + 1,
          delayMs,
          message: String(err?.response?.data?.error?.message || err?.message || ""),
        });
        // eslint-disable-next-line no-await-in-loop
        await sleep(delayMs);
      }
    }
  }

  throw lastErr;
}

function appendFetchedSourcesToParts(parts, fetchedSources) {
  const blocks = [];
  for (const src of fetchedSources) {
    if (src.status === "ok" && src.textPreview) {
      blocks.push(
        `SOURCE [${src.id}] kind=url label="${src.label}" url=${src.url}\n"""\n${src.textPreview}\n"""`
      );
    } else {
      blocks.push(
        `SOURCE [${src.id}] kind=url label="${src.label}" url=${src.url}\n[Page not retrieved: ${src.note || src.status}. Do not invent facts for this source.]`
      );
    }
  }
  if (!blocks.length) return parts;

  const appendix = `\n\nFETCHED WEB PAGES:\n${blocks.join("\n\n")}`;
  const next = parts.map((p) => ({ ...p }));
  const lastTextIdx = [...next].map((p, i) => (p.text ? i : -1)).filter((i) => i >= 0).pop();
  if (lastTextIdx == null) {
    next.push({ text: appendix.trim() });
  } else {
    next[lastTextIdx] = { text: `${next[lastTextIdx].text}${appendix}` };
  }
  return next;
}

function registerHouseGuideImportAi({ firebaseExports }) {
  firebaseExports.analyzeHouseGuideImport = onCall(
    {
      region: "us-central1",
      timeoutSeconds: 180,
      memory: "1GiB",
      enforceAppCheck: false,
    },
    async (request) => {
      if (!request.auth?.uid) {
        throw new HttpsError("unauthenticated", "Sign in to run House Guide AI Import.");
      }

      let parts = normalizeParts(request.data?.parts);
      const skipFetchUrls = new Set(
        (Array.isArray(request.data?.skipFetchUrls) ? request.data.skipFetchUrls : [])
          .map((u) => String(u || "").trim())
          .filter(Boolean)
      );
      const fetchUrlsRaw = Array.isArray(request.data?.fetchUrls)
        ? request.data.fetchUrls
            .filter((entry) => entry && !skipFetchUrls.has(String(entry.url || "").trim()))
            .slice(0, MAX_URL_FETCHES)
        : [];

      const fetchedSources = [];
      for (const entry of fetchUrlsRaw) {
        // Sequential to be gentle on remote sites / rate limits.
        // eslint-disable-next-line no-await-in-loop
        fetchedSources.push(await fetchUrlSource(entry));
      }

      if (fetchedSources.length) {
        parts = appendFetchedSourcesToParts(parts, fetchedSources);
      }

      const apiKey = resolveGeminiApiKey();
      const model = resolveModel();

      try {
        const generated = await generateHouseGuideImportJsonWithRetry(apiKey, model, parts);
        return { text: generated.text, model: generated.model, fetchedSources };
      } catch (err) {
        if (err instanceof HttpsError) throw err;
        const status = err?.response?.status;
        const apiMsg = String(err?.response?.data?.error?.message || err?.message || "");
        logger.error("analyzeHouseGuideImport Gemini failed", {
          status,
          message: apiMsg,
        });
        if (isTransientGeminiError(err)) {
          throw new HttpsError(
            "resource-exhausted",
            "AI is busy right now (high demand). Wait a moment and try Add & re-analyse again."
          );
        }
        throw new HttpsError(
          "internal",
          apiMsg || "House Guide AI Import failed. Please try again."
        );
      }
    }
  );
}

module.exports = { registerHouseGuideImportAi };
