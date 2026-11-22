const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const axios = require("axios");

const DEFAULT_MODEL = "gemini-2.5-flash";
const FALLBACK_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-flash-latest"];
const GEMINI_MAX_ATTEMPTS_PER_MODEL = 3;
const MAX_CATEGORIES = 80;

function resolveGeminiApiKey() {
  const apiKey = String(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "").trim();
  if (!apiKey) {
    throw new HttpsError(
      "failed-precondition",
      "Set GEMINI_API_KEY on Cloud Functions for Local Gem Magic Fill."
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
  const configured = String(process.env.GEMINI_LOCAL_GEM_MAGIC_MODEL || "").trim();
  return configured || DEFAULT_MODEL;
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

function normalizeCategoryNeedle(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveExactCategoryMatches(raws, allowed) {
  if (!Array.isArray(raws) || !Array.isArray(allowed) || allowed.length === 0) return [];
  const byKey = new Map();
  for (const name of allowed) {
    const key = normalizeCategoryNeedle(name);
    if (key) byKey.set(key, name);
  }
  const out = [];
  const seen = new Set();
  for (const raw of raws) {
    const key = normalizeCategoryNeedle(raw);
    if (!key) continue;
    const value = byKey.get(key);
    if (!value || seen.has(value.toLowerCase())) continue;
    seen.add(value.toLowerCase());
    out.push(value);
  }
  return out;
}

function parseJsonObject(text) {
  const cleaned = String(text || "")
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
  if (!cleaned) return null;
  try {
    return JSON.parse(cleaned);
  } catch {
    const brace = cleaned.match(/\{[\s\S]*\}/);
    if (!brace) return null;
    try {
      return JSON.parse(brace[0]);
    } catch {
      return null;
    }
  }
}

async function generateJson(apiKey, model, prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const { data } = await axios.post(
    `${url}?key=${encodeURIComponent(apiKey)}`,
    {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.3,
      },
    },
    { timeout: 90000 }
  );
  const text = String(data?.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
  if (!text) {
    throw new HttpsError("internal", "AI returned an empty response.");
  }
  return text;
}

async function generatePlainText(apiKey, model, prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const { data } = await axios.post(
    `${url}?key=${encodeURIComponent(apiKey)}`,
    {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.7,
      },
    },
    { timeout: 90000 }
  );
  const text = String(data?.candidates?.[0]?.content?.parts?.[0]?.text || "")
    .trim()
    .replace(/^["']|["']$/g, "");
  if (!text) {
    throw new HttpsError("internal", "AI returned an empty description.");
  }
  return text;
}

async function withRetry(fn) {
  const primaryModel = resolveModel();
  const models = [primaryModel, ...FALLBACK_MODELS.filter((m) => m !== primaryModel)];
  let lastErr = null;

  for (const model of models) {
    for (let attempt = 0; attempt < GEMINI_MAX_ATTEMPTS_PER_MODEL; attempt += 1) {
      try {
        return await fn(model);
      } catch (err) {
        lastErr = err;
        if (err instanceof HttpsError) throw err;
        if (!isTransientGeminiError(err)) throw err;
        const delayMs = 1500 * 2 ** attempt;
        logger.warn("fillLocalGemMagicAi Gemini busy, retrying", {
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

function registerLocalGemMagicAi({ firebaseExports }) {
  firebaseExports.fillLocalGemMagicAi = onCall(
    {
      region: "us-central1",
      timeoutSeconds: 120,
      memory: "512MiB",
      // Client Firebase AI (Vertex) requires App Check; this admin path uses GEMINI_API_KEY instead.
      enforceAppCheck: false,
    },
    async (request) => {
      if (!request.auth?.uid) {
        throw new HttpsError("unauthenticated", "Sign in to run Local Gem Magic Fill.");
      }

      const payload = request.data || {};
      const placeName = String(payload.placeName || "").trim();
      const googleType = String(payload.googleType || "").replace(/_/g, " ").trim();
      const areaName = String(payload.areaName || "").trim();
      const country = String(payload.country || "").trim();
      const needDescription = payload.needDescription !== false;
      const allowedCategories = Array.isArray(payload.categories)
        ? [...new Set(payload.categories.map((c) => String(c || "").trim()).filter(Boolean))].slice(
            0,
            MAX_CATEGORIES
          )
        : [];

      if (!placeName) {
        throw new HttpsError("invalid-argument", "placeName is required.");
      }
      if (!areaName) {
        throw new HttpsError("invalid-argument", "areaName is required.");
      }
      if (allowedCategories.length === 0) {
        throw new HttpsError(
          "invalid-argument",
          "No categories provided. Add Local Gems Categories for this area first."
        );
      }

      const apiKey = resolveGeminiApiKey();
      const categoryList = allowedCategories.map((name) => `"${name}"`).join(", ");

      let matchedCategories = [];
      let description = "";

      try {
        const catText = await withRetry((model) =>
          generateJson(
            apiKey,
            model,
            `You map Google Places to Vailo local-gem categories for ${areaName}${country ? `, ${country}` : ""}.
Place name: "${placeName}"
Google primary type: "${googleType || "unknown"}"

Allowed categories (copy strings EXACTLY when selecting):
[${categoryList}]

Return JSON only:
{"categories":["..."]}

Rules:
- Include EVERY allowed category that clearly fits this place (can be multiple).
- If none clearly fit, return {"categories":[]}.
- Never invent category names outside the allowed list.`
          )
        );

        const parsed = parseJsonObject(catText) || {};
        const rawCats = [];
        if (Array.isArray(parsed.categories)) {
          for (const c of parsed.categories) {
            if (typeof c === "string" && c.trim()) rawCats.push(c.trim());
          }
        }
        if (typeof parsed.category === "string" && parsed.category.trim()) {
          rawCats.push(parsed.category.trim());
        }
        matchedCategories = resolveExactCategoryMatches(rawCats, allowedCategories);
      } catch (err) {
        logger.error("fillLocalGemMagicAi category step failed", err);
        throw new HttpsError(
          "internal",
          String(err?.response?.data?.error?.message || err?.message || "Category AI failed.")
        );
      }

      if (needDescription) {
        try {
          const catsHint =
            matchedCategories.length > 0
              ? ` It fits these guest categories: ${matchedCategories.join(", ")}.`
              : googleType
                ? ` Google classifies it as: ${googleType}.`
                : "";
          description = await withRetry((model) =>
            generatePlainText(
              apiKey,
              model,
              `Act as a luxury travel concierge for ${areaName}${country ? `, ${country}` : ""}. Write a short, engaging 2-sentence description for a local spot called "${placeName}".${catsHint} Tell guests why they should visit. Return ONLY the description text, no quotes or markdown.`
            )
          );
        } catch (err) {
          logger.error("fillLocalGemMagicAi description step failed", err);
          throw new HttpsError(
            "internal",
            String(err?.response?.data?.error?.message || err?.message || "Description AI failed.")
          );
        }
      }

      return {
        categories: matchedCategories,
        description,
      };
    }
  );
}

module.exports = { registerLocalGemMagicAi };
