const fs = require("fs");
const path = require("path");
const { HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const axios = require("axios");

const INDEX_PATH = path.join(__dirname, "data", "codeKnowledgeIndex.json");
const TOP_K = 14;
const MAX_CONTEXT_CHARS = 48000;
/** Free-tier friendly default; override with GEMINI_CODE_KNOWLEDGE_MODEL (e.g. gemini-2.5-pro when billing is on). */
const DEFAULT_CODE_KNOWLEDGE_MODEL = "gemini-2.5-flash";

function resolveCodeKnowledgeModel() {
  const configured = String(process.env.GEMINI_CODE_KNOWLEDGE_MODEL || "").trim();
  return configured || DEFAULT_CODE_KNOWLEDGE_MODEL;
}

function isQuotaOrRateLimitError(err) {
  const status = err?.response?.status;
  const code = err?.response?.data?.error?.code;
  const msg = String(err?.response?.data?.error?.message || err?.message || "").toLowerCase();
  return (
    status === 429 ||
    code === 429 ||
    msg.includes("quota") ||
    msg.includes("rate limit") ||
    msg.includes("resource_exhausted")
  );
}

let cachedIndex = null;

function loadIndex() {
  if (cachedIndex) return cachedIndex;
  if (!fs.existsSync(INDEX_PATH)) {
    throw new HttpsError(
      "failed-precondition",
      "Code index missing. Run: node scripts/buildCodeKnowledgeIndex.mjs then redeploy functions."
    );
  }
  cachedIndex = JSON.parse(fs.readFileSync(INDEX_PATH, "utf8"));
  return cachedIndex;
}

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9_/.-]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

function retrieveChunks(chunks, question) {
  const tokens = tokenize(question);
  if (!tokens.length) return [];

  const scored = chunks
    .map((chunk) => {
      const pathLower = chunk.file.toLowerCase();
      const bodyLower = chunk.content.toLowerCase();
      let score = 0;
      for (const t of tokens) {
        if (pathLower.includes(t)) score += 8;
        const re = new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
        const inBody = bodyLower.match(re);
        if (inBody) score += inBody.length;
      }
      return { chunk, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) {
    return chunks.slice(0, Math.min(6, chunks.length)).map((c) => c);
  }

  const picked = [];
  let chars = 0;
  for (const { chunk } of scored) {
    if (picked.length >= TOP_K) break;
    const block = `### ${chunk.file}\n${chunk.content}\n`;
    if (chars + block.length > MAX_CONTEXT_CHARS && picked.length >= 4) break;
    picked.push(chunk);
    chars += block.length;
  }
  return picked;
}

function formatContext(picked) {
  return picked.map((c) => `### ${c.file}\n${c.content}`).join("\n\n");
}

function formatIndexForGeminiExport(index) {
  const builtAt = index.builtAt || "unknown";
  const fileCount = index.fileCount || index.chunks?.length || 0;
  const lines = [
    "# Vailo — App Code Knowledge Export",
    "",
    "Upload this file to Google Gemini (gemini.google.com or Google AI Studio) as context.",
    "Ask questions about how the Vailo guest portal, admin, and Cloud Functions work.",
    "",
    `Generated: ${builtAt}`,
    `Files in index: ${fileCount}`,
    "",
    "---",
    "",
  ];
  for (const chunk of index.chunks || []) {
    lines.push(`## ${chunk.file}`, "", chunk.content, "", "---", "");
  }
  return lines.join("\n");
}

function exportFilenameFromBuiltAt(builtAt) {
  const datePart = String(builtAt || "").slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
    return `vailo-code-knowledge-${datePart}.md`;
  }
  return "vailo-code-knowledge.md";
}

function normalizeAdminEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function platformAdminEmailsFromEnv() {
  return String(process.env.PLATFORM_ADMIN_EMAILS || "")
    .split(",")
    .map((e) => normalizeAdminEmail(e))
    .filter(Boolean);
}

/**
 * Resolve platform admin: owners doc by id (from client), by email, or env allow-list.
 * @returns {Promise<boolean>}
 */
async function requirePlatformAdmin(request, firestore) {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in as a platform admin.");
  }
  const rawEmail = String(request.auth.token?.email || "").trim();
  const email = normalizeAdminEmail(rawEmail);
  if (!email) {
    throw new HttpsError("permission-denied", "Account email required.");
  }

  const ownerId = String(request.data?.ownerId || "").trim();
  if (ownerId) {
    const doc = await firestore.collection("owners").doc(ownerId).get();
    if (doc.exists) {
      const data = doc.data();
      const docEmail = normalizeAdminEmail(data.email);
      if (data.role === "admin" && docEmail === email) {
        return true;
      }
      logger.warn("App Code Knowledge: ownerId did not match admin email", {
        ownerId,
        email,
        role: data.role,
        docEmail,
      });
    }
  }

  const emailCandidates = [...new Set([email, rawEmail.toLowerCase(), rawEmail].filter(Boolean))];
  for (const candidate of emailCandidates) {
    const snap = await firestore
      .collection("owners")
      .where("email", "==", candidate)
      .limit(1)
      .get();
    if (!snap.empty && snap.docs[0].data().role === "admin") {
      return true;
    }
  }

  if (platformAdminEmailsFromEnv().includes(email)) {
    return true;
  }

  logger.warn("App Code Knowledge: no admin match", {
    email,
    ownerId: ownerId || null,
    uid: request.auth.uid,
  });
  throw new HttpsError(
    "permission-denied",
    `No platform admin profile for "${email}". In Firestore → owners, add or edit a row with that exact email and role "admin", or set PLATFORM_ADMIN_EMAILS in functions/.env.`
  );
}

async function generateWithGemini(apiKey, systemInstruction, userPrompt, model) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const body = {
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 2048,
    },
  };

  const res = await axios.post(url, body, {
    params: { key: apiKey },
    headers: { "Content-Type": "application/json" },
    timeout: 120000,
  });

  const text = res.data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text?.trim()) {
    throw new Error("Empty model response");
  }
  return text.trim();
}

/**
 * @param {import("firebase-functions/v2/https").CallableRequest} request
 * @param {FirebaseFirestore.Firestore} firestore
 */
async function askAppCodeKnowledgeHandler(request, firestore) {
  await requirePlatformAdmin(request, firestore);

  const question = String(request.data?.question || "").trim();
  if (!question) {
    throw new HttpsError("invalid-argument", "question is required.");
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new HttpsError(
      "failed-precondition",
      "Set GEMINI_API_KEY on Cloud Functions for App Code Knowledge."
    );
  }

  const index = loadIndex();
  const picked = retrieveChunks(index.chunks || [], question);
  const context = formatContext(picked);
  const sources = picked.map((c) => c.file);

  const systemInstruction = `You are Vailo's internal App Code Knowledge assistant for platform administrators.
Answer ONLY about the Vailo product (guest portal, admin, area functionality, Firebase, Cloud Functions) using the supplied code snippets.
Rules:
- Ground every claim in the snippets; cite paths like \`src/pages/...\` inline.
- If snippets are insufficient, say what is missing — do not invent routes, collections, or features.
- Refuse general programming homework or unrelated tech questions.
- Be concise and accurate; use bullet lists for steps.`;

  const userPrompt = `CODE SNIPPETS (from repository index built ${index.builtAt || "unknown"}):
${context || "(No matching files — say the index may need rebuilding.)"}

ADMIN QUESTION:
${question}`;

  const primaryModel = resolveCodeKnowledgeModel();
  let modelUsed = primaryModel;
  let usedFallback = false;

  try {
    let answer;
    try {
      answer = await generateWithGemini(apiKey, systemInstruction, userPrompt, primaryModel);
    } catch (err) {
      const fallback = DEFAULT_CODE_KNOWLEDGE_MODEL;
      if (primaryModel !== fallback && isQuotaOrRateLimitError(err)) {
        logger.warn("App Code Knowledge: quota/rate limit on primary model, retrying", {
          primaryModel,
          fallback,
        });
        answer = await generateWithGemini(apiKey, systemInstruction, userPrompt, fallback);
        modelUsed = fallback;
        usedFallback = true;
      } else {
        throw err;
      }
    }

    return {
      answer,
      sources,
      model: modelUsed,
      modelFallback: usedFallback,
      indexBuiltAt: index.builtAt || null,
      filesInIndex: index.fileCount || 0,
    };
  } catch (err) {
    const apiMsg = err?.response?.data?.error?.message;
    const detail = apiMsg || err?.message || "Unknown error";
    logger.error("askAppCodeKnowledge failed:", err?.response?.data || err);
    const quotaHint = isQuotaOrRateLimitError(err)
      ? " Enable billing on Google AI Studio or set GEMINI_CODE_KNOWLEDGE_MODEL=gemini-2.5-flash in functions/.env."
      : "";
    throw new HttpsError(
      "internal",
      `App Code Knowledge could not call Gemini (${modelUsed}): ${detail}.${quotaHint} Check GEMINI_API_KEY and redeploy.`
    );
  }
}

async function getAppCodeKnowledgeMetaHandler(request, firestore) {
  if (firestore && request) {
    await requirePlatformAdmin(request, firestore);
  }
  return metaPayload();
}

/**
 * @param {import("firebase-functions/v2/https").CallableRequest} request
 * @param {FirebaseFirestore.Firestore} firestore
 */
async function getAppCodeKnowledgeExportHandler(request, firestore) {
  await requirePlatformAdmin(request, firestore);
  const index = loadIndex();
  const builtAt = index.builtAt || null;
  return {
    markdown: formatIndexForGeminiExport(index),
    fileCount: index.fileCount || index.chunks?.length || 0,
    builtAt,
    suggestedFilename: exportFilenameFromBuiltAt(builtAt),
  };
}

function metaPayload() {
  const model = resolveCodeKnowledgeModel();
  if (!fs.existsSync(INDEX_PATH)) {
    return { ready: false, fileCount: 0, builtAt: null, model };
  }
  const index = loadIndex();
  return {
    ready: true,
    fileCount: index.fileCount || 0,
    builtAt: index.builtAt || null,
    model,
  };
}

module.exports = {
  askAppCodeKnowledgeHandler,
  getAppCodeKnowledgeMetaHandler,
  getAppCodeKnowledgeExportHandler,
  loadIndex,
  retrieveChunks,
  formatIndexForGeminiExport,
};
