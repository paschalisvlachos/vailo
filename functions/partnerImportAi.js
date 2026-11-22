const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const axios = require("axios");

const DEFAULT_MODEL = "gemini-2.5-flash";
const FALLBACK_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-flash-latest"];
const GEMINI_MAX_ATTEMPTS_PER_MODEL = 3;
const MAX_PAGE_CHARS = 14000;
const MAX_EXTRACT_URLS = 6;
const MAX_CATEGORIES = 80;
const MAX_DISCOVER_LINKS = 40;

function resolveGeminiApiKey() {
  const apiKey = String(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "").trim();
  if (!apiKey) {
    throw new HttpsError(
      "failed-precondition",
      "Set GEMINI_API_KEY on Cloud Functions for Partner web import."
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
  const configured = String(process.env.GEMINI_PARTNER_IMPORT_MODEL || "").trim();
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

function stripTags(html) {
  return String(html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtmlEntities(raw) {
  return String(raw || "")
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      return Number.isFinite(code) ? String.fromCharCode(code) : _;
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => {
      const code = parseInt(h, 16);
      return Number.isFinite(code) ? String.fromCharCode(code) : _;
    })
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#039;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .trim();
}

function cleanServiceTitle(raw) {
  let title = decodeHtmlEntities(stripTags(raw));
  // Drop common agency suffixes: "… | Be On Holidays"
  title = title.replace(/\s*[|\-–—]\s*Be On Holidays\s*$/i, "").trim();
  title = title.replace(/\s*\|\s*[^|]+$/i, (m) => {
    // Keep if the pipe part looks like location info (CHQ), strip brand-like tails only when long.
    return m.length > 28 ? "" : m;
  }).trim();
  return title.replace(/\s+/g, " ").trim();
}

function suggestNameFromUrlSlug(url) {
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    const slug = parts[parts.length - 1] || "";
    if (!slug || slug.length < 3) return "";
    return slug
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim();
  } catch {
    return "";
  }
}

function extractHintsFromHtml(html) {
  const src = String(html || "");
  const pick = (re) => {
    const m = src.match(re);
    return m ? decodeHtmlEntities(stripTags(m[1])) : "";
  };
  const title =
    pick(/<h1[^>]*class=["'][^"']*page--hero-title[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i) ||
    pick(/<h1[^>]*>([\s\S]*?)<\/h1>/i) ||
    pick(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
    pick(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const description =
    pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
    pick(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
  const photoUrl =
    pick(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
    pick(/<div[^>]+class=["'][^"']*page--hero-image[^"']*["'][^>]*>[\s\S]*?<img[^>]+src=["']([^"']+)["']/i) ||
    pick(/<img[^>]+class=["'][^"']*object-cover[^"']*["'][^>]+src=["']([^"']+)["']/i) ||
    pick(/<img[^>]+src=["']([^"']+)["'][^>]+class=["'][^"']*object-cover[^"']*["']/i);
  return {
    title: cleanServiceTitle(title),
    description: description.trim(),
    photoUrl: /^https?:\/\//i.test(photoUrl) ? photoUrl.split("?")[0] : "",
  };
}

function featuredMediaUrlFromWpRow(row) {
  const embedded = row?._embedded?.["wp:featuredmedia"];
  const media = Array.isArray(embedded) ? embedded[0] : null;
  const source =
    media?.source_url ||
    media?.media_details?.sizes?.large?.source_url ||
    media?.media_details?.sizes?.full?.source_url ||
    media?.guid?.rendered ||
    "";
  const url = String(source || "").trim();
  return /^https?:\/\//i.test(url) ? url.split("?")[0] : "";
}

async function resolveWpFeaturedPhoto(origin, row) {
  const embedded = featuredMediaUrlFromWpRow(row);
  if (embedded) return embedded;
  const mediaId = Number(row?.featured_media || 0);
  if (!Number.isFinite(mediaId) || mediaId <= 0) return "";
  try {
    const res = await axiosGetText(`${origin}/wp-json/wp/v2/media/${mediaId}`, {
      Accept: "application/json",
      Referer: `${origin}/`,
    });
    const data = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
    const url = String(data?.source_url || data?.guid?.rendered || "").trim();
    return /^https?:\/\//i.test(url) ? url.split("?")[0] : "";
  } catch (err) {
    logger.info("WordPress media fetch miss", {
      origin,
      mediaId,
      message: String(err?.response?.status || err?.message || ""),
    });
    return "";
  }
}

/**
 * When AI returns no categories, infer clear matches from title/body vs allowed names.
 * Returns [] if nothing is a clear hit (keeps "ambiguous → none").
 */
function inferCategoriesFromText(title, text, allowed) {
  if (!Array.isArray(allowed) || allowed.length === 0) return [];
  const hay = normalizeCategoryNeedle(`${title || ""} ${text || ""}`);
  if (!hay) return [];

  const synonymRules = [
    {
      needles: ["airport transfer", "airport transfers", "private transfer", "private transfers", "taxi transfer"],
      categoryHints: ["transfer", "airport", "taxi", "transport", "chauffeur"],
    },
    {
      needles: ["car rental", "rent a car", "vehicle rental", "hire a car"],
      categoryHints: ["car", "rental", "vehicle", "auto"],
    },
    {
      needles: ["boat trip", "boat trips", "boat tour", "sailing", "yacht"],
      categoryHints: ["boat", "sail", "yacht", "cruise", "sea"],
    },
    {
      needles: ["private chef", "chef service", "in villa dining"],
      categoryHints: ["chef", "dining", "food", "culinary"],
    },
    {
      needles: ["bike rental", "bicycle", "e-bike", "ebike"],
      categoryHints: ["bike", "bicycle", "cycling"],
    },
    {
      needles: ["spa", "massage", "beauty treatment"],
      categoryHints: ["spa", "massage", "beauty", "wellness"],
    },
    {
      needles: ["fitness", "personal trainer", "yoga"],
      categoryHints: ["fitness", "yoga", "trainer", "gym"],
    },
    {
      needles: ["stroller", "baby equipment"],
      categoryHints: ["stroller", "baby", "family"],
    },
  ];

  const out = [];
  const seen = new Set();

  for (const name of allowed) {
    const key = normalizeCategoryNeedle(name);
    if (!key || key.length < 3) continue;
    let score = 0;
    if (hay.includes(key)) score += 5;
    const parts = key.split(" ").filter((p) => p.length > 3);
    if (parts.length) {
      const hits = parts.filter((p) => hay.includes(p)).length;
      if (hits === parts.length) score += 3;
      else if (hits >= Math.ceil(parts.length * 0.7)) score += 1;
    }
    for (const rule of synonymRules) {
      if (!rule.needles.some((n) => hay.includes(n))) continue;
      if (rule.categoryHints.some((h) => key.includes(h) || h.includes(key))) score += 4;
    }
    if (score < 4) continue;
    if (seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push({ name, score });
  }

  return out
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((x) => x.name);
}

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/json,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9,el;q=0.8",
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
};

async function axiosGetText(url, extraHeaders = {}) {
  const res = await axios.get(url, {
    timeout: 20000,
    maxRedirects: 5,
    responseType: "text",
    headers: { ...BROWSER_HEADERS, ...extraHeaders },
    validateStatus: (status) => status >= 200 && status < 400,
  });
  return res;
}

/**
 * WordPress REST often stays open when HTML is Cloudflare-blocked.
 * Supports /services/{slug}/ CPT and listing all services for bulk discover.
 */
async function fetchWordpressServices(pageUrl) {
  let origin;
  let pathname;
  try {
    const u = new URL(pageUrl);
    origin = u.origin;
    pathname = (u.pathname || "/").replace(/\/+$/, "") || "/";
  } catch {
    return null;
  }

  const servicesBase = `${origin}/wp-json/wp/v2/services`;
  const slugMatch = pathname.match(/\/services\/([^/]+)\/?$/i);
  const isServicesIndex =
    /\/(our-)?services\/?$/i.test(pathname) || pathname.toLowerCase().endsWith("/our-services");

  try {
    if (slugMatch) {
      const slug = decodeURIComponent(slugMatch[1]);
      const res = await axiosGetText(
        `${servicesBase}?slug=${encodeURIComponent(slug)}&_embed=wp:featuredmedia`,
        { Accept: "application/json", Referer: origin + "/" }
      );
      const rows = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
      const row = Array.isArray(rows) ? rows[0] : null;
      if (!row) return null;
      const title = cleanServiceTitle(row?.title?.rendered || row?.title || "");
      const html = String(row?.content?.rendered || row?.excerpt?.rendered || "");
      const text = htmlToPlainText(html);
      const links = extractLinksFromHtml(html, row.link || pageUrl);
      // eslint-disable-next-line no-await-in-loop
      const photoUrl = await resolveWpFeaturedPhoto(origin, row);
      return {
        url: String(row.link || pageUrl),
        status: "ok",
        note: "Fetched via WordPress REST (services)",
        html,
        text: text || title,
        links,
        hints: {
          title,
          description: htmlToPlainText(row?.excerpt?.rendered || "").slice(0, 500) || text.slice(0, 500),
          photoUrl,
        },
        wpServices: null,
      };
    }

    if (isServicesIndex) {
      const res = await axiosGetText(
        `${servicesBase}?per_page=100&_embed=wp:featuredmedia`,
        { Accept: "application/json", Referer: origin + "/" }
      );
      const rows = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
      if (!Array.isArray(rows) || rows.length === 0) return null;
      const wpServices = [];
      for (const row of rows) {
        const url = String(row.link || "").trim();
        if (!/^https?:\/\//i.test(url)) continue;
        // eslint-disable-next-line no-await-in-loop
        const photoUrl = await resolveWpFeaturedPhoto(origin, row);
        wpServices.push({
          url,
          title: cleanServiceTitle(row?.title?.rendered || row?.title || "") || "Service",
          summary: htmlToPlainText(row?.excerpt?.rendered || "").slice(0, 180),
          photoUrl,
        });
      }
      if (wpServices.length === 0) return null;
      return {
        url: pageUrl,
        status: "ok",
        note: `Listed ${wpServices.length} WordPress services`,
        html: "",
        text: wpServices.map((s) => `${s.title}: ${s.summary}`).join("\n"),
        links: wpServices.map((s) => ({ url: s.url, title: s.title })),
        hints: { title: "Services", description: "", photoUrl: "" },
        wpServices,
      };
    }
  } catch (err) {
    logger.info("WordPress services REST miss", {
      pageUrl,
      message: String(err?.response?.status || err?.message || ""),
    });
  }
  return null;
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

function normalizeUrlKey(url) {
  try {
    const u = new URL(url);
    u.hash = "";
    let path = u.pathname || "/";
    if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
    u.pathname = path;
    u.search = "";
    return u.toString().toLowerCase();
  } catch {
    return String(url || "").trim().toLowerCase();
  }
}

function extractLinksFromHtml(html, baseUrl) {
  const out = [];
  const seen = new Set();
  let base;
  try {
    base = new URL(baseUrl);
  } catch {
    return out;
  }
  const baseHost = base.hostname.replace(/^www\./, "").toLowerCase();
  const re = /<a\s[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = re.exec(String(html || ""))) && out.length < 120) {
    const hrefRaw = String(match[1] || "").trim();
    if (!hrefRaw || hrefRaw.startsWith("#") || hrefRaw.startsWith("mailto:") || hrefRaw.startsWith("tel:")) {
      continue;
    }
    if (/\.(pdf|jpg|jpeg|png|gif|webp|svg|zip|mp4|css|js)(\?|$)/i.test(hrefRaw)) continue;
    let absolute;
    try {
      absolute = new URL(hrefRaw, base).toString();
    } catch {
      continue;
    }
    if (!/^https?:\/\//i.test(absolute)) continue;
    let host;
    try {
      host = new URL(absolute).hostname.replace(/^www\./, "").toLowerCase();
    } catch {
      continue;
    }
    if (host !== baseHost) continue;
    const key = normalizeUrlKey(absolute);
    if (seen.has(key)) continue;
    if (key === normalizeUrlKey(baseUrl)) continue;
    seen.add(key);
    const title = stripTags(match[2]).slice(0, 160);
    out.push({ url: absolute.split("#")[0], title });
  }
  return out;
}

async function fetchPage(url) {
  const trimmed = String(url || "").trim();
  if (!trimmed || !/^https?:\/\//i.test(trimmed)) {
    return {
      url: trimmed,
      status: "skipped",
      note: "Invalid URL",
      html: "",
      text: "",
      links: [],
      hints: null,
      wpServices: null,
    };
  }
  if (isMapsPlaceUrl(trimmed)) {
    return {
      url: trimmed,
      status: "skipped",
      note: "Google Maps URLs are not supported here — use Google Maps import instead.",
      html: "",
      text: "",
      links: [],
      hints: null,
      wpServices: null,
    };
  }

  // Prefer WordPress REST when available — often works while HTML is Cloudflare-blocked.
  const wp = await fetchWordpressServices(trimmed);
  if (wp?.status === "ok") return wp;

  try {
    let referer = "";
    try {
      referer = new URL(trimmed).origin + "/";
    } catch {
      referer = "";
    }
    const res = await axiosGetText(trimmed, referer ? { Referer: referer } : {});

    const html = String(res.data || "");
    const hints = extractHintsFromHtml(html);
    let text = htmlToPlainText(html);
    if (!text || text.length < 80) {
      // HTML blocked/empty — still try WP again as soft fallback already done above.
      return {
        url: trimmed,
        status: "failed",
        note: "Page returned almost no readable text (JS-only page or bot wall).",
        html: "",
        text: "",
        links: [],
        hints,
        wpServices: null,
      };
    }
    if (text.length > MAX_PAGE_CHARS) {
      text = `${text.slice(0, MAX_PAGE_CHARS)}\n…[truncated]`;
    }
    const finalUrl = String(res.request?.res?.responseUrl || res.config?.url || trimmed);
    return {
      url: finalUrl,
      status: "ok",
      note: `Fetched ${text.length} characters`,
      html,
      text,
      links: extractLinksFromHtml(html, finalUrl),
      hints,
      wpServices: null,
    };
  } catch (err) {
    const status = err?.response?.status;
    const timedOut = /timeout/i.test(String(err?.message || ""));
    let note = String(err?.message || "Fetch failed");
    if (status === 403 || status === 401) note = "Site blocked the fetch (403/401).";
    else if (status === 404) note = "Page not found (404).";
    else if (timedOut) note = "Timed out fetching the page.";
    else if (status) note = `HTTP ${status}`;
    return {
      url: trimmed,
      status: "failed",
      note,
      html: "",
      text: "",
      links: [],
      hints: null,
      wpServices: null,
    };
  }
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
  const allowedList = [];
  for (const name of allowed) {
    const key = normalizeCategoryNeedle(name);
    if (!key) continue;
    byKey.set(key, name);
    allowedList.push({ key, name });
  }
  const out = [];
  const seen = new Set();
  for (const raw of raws) {
    const key = normalizeCategoryNeedle(raw);
    if (!key) continue;
    let value = byKey.get(key);
    if (!value) {
      // Fuzzy: "Airport Transfers" ↔ "Transfers" / "Private Airport Transfer"
      const fuzzy = allowedList.find(
        (a) => a.key.includes(key) || key.includes(a.key) || a.key.split(" ").every((p) => !p || key.includes(p))
      );
      value = fuzzy?.name;
    }
    if (!value || seen.has(value.toLowerCase())) continue;
    seen.add(value.toLowerCase());
    out.push(value);
  }
  return out;
}

async function generateJson(apiKey, model, prompt, { useUrlContext = false } = {}) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const generationConfig = {
    temperature: 0.2,
  };
  // responseMimeType + tools can be flaky on some models; keep JSON mime only without tools.
  if (!useUrlContext) {
    generationConfig.responseMimeType = "application/json";
  }
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig,
  };
  // URL Context lets Gemini fetch pages via Google's infra (bypasses many Cloudflare 403s
  // that block Cloud Functions datacenter IPs).
  if (useUrlContext) {
    body.tools = [{ url_context: {} }];
  }
  const { data } = await axios.post(`${url}?key=${encodeURIComponent(apiKey)}`, body, {
    timeout: 120000,
  });
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const text = parts
    .map((p) => String(p?.text || ""))
    .join("\n")
    .trim();
  if (!text) {
    const urlMeta = data?.candidates?.[0]?.urlContextMetadata || data?.candidates?.[0]?.url_context_metadata;
    logger.warn("importPartnersFromWeb empty Gemini text", { urlMeta });
    throw new HttpsError("internal", "AI returned an empty response.");
  }
  return { text, raw: data };
}

function urlContextHadSuccess(raw) {
  const meta =
    raw?.candidates?.[0]?.urlContextMetadata ||
    raw?.candidates?.[0]?.url_context_metadata ||
    null;
  const statuses =
    meta?.urlMetadata ||
    meta?.url_metadata ||
    meta?.urlRetrievalStatuses ||
    [];
  if (!Array.isArray(statuses) || statuses.length === 0) return null;
  return statuses.some((s) => {
    const st = String(s?.urlRetrievalStatus || s?.url_retrieval_status || s?.status || "").toUpperCase();
    return st.includes("SUCCESS") || st === "URL_RETRIEVAL_STATUS_SUCCESS";
  });
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
        logger.warn("importPartnersFromWeb Gemini busy, retrying", {
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

function heuristicServiceLinks(links, indexUrl) {
  const indexKey = normalizeUrlKey(indexUrl);
  const scored = links
    .map((link) => {
      const path = (() => {
        try {
          return new URL(link.url).pathname.toLowerCase();
        } catch {
          return "";
        }
      })();
      let score = 0;
      if (/\/services?\//.test(path)) score += 5;
      if (/\/(our-)?services?\/?$/.test(path)) score -= 8;
      if (/\/(blog|news|about|contact|privacy|terms|login|cart|checkout)\b/.test(path)) score -= 6;
      if ((link.title || "").length > 8) score += 1;
      if (normalizeUrlKey(link.url) === indexKey) score -= 20;
      return { ...link, score };
    })
    .filter((l) => l.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, MAX_DISCOVER_LINKS).map(({ url, title }) => ({
    url,
    title: title || "Service",
  }));
}

function normalizePartnerDraft(raw, fallbackUrl, allowedCategories, hints = null) {
  const website = String(raw?.website || fallbackUrl || "").trim();
  const name =
    cleanServiceTitle(raw?.name || raw?.title || raw?.serviceName || "") ||
    cleanServiceTitle(hints?.title || "") ||
    suggestNameFromUrlSlug(fallbackUrl || website);
  const description =
    String(raw?.description || raw?.summary || "").trim() ||
    String(hints?.description || "").trim();
  const photoUrl =
    String(raw?.photoUrl || "").trim() ||
    String(hints?.photoUrl || "").trim();
  let categories = resolveExactCategoryMatches(
    Array.isArray(raw?.categories) ? raw.categories : raw?.category ? [raw.category] : [],
    allowedCategories
  );
  if (categories.length === 0) {
    categories = inferCategoriesFromText(name, description || hints?.description || "", allowedCategories);
  }
  return {
    name,
    description,
    phoneNumber: String(raw?.phoneNumber || raw?.phone || "").trim(),
    whatsapp: String(raw?.whatsapp || "").trim(),
    email: String(raw?.email || "").trim(),
    website,
    photoUrl: /^https?:\/\//i.test(photoUrl) ? photoUrl.split("?")[0] : "",
    categories,
    sourceUrl: fallbackUrl || website,
  };
}

function cleanDiscoveredServices(rawServices, fallbackUrl) {
  const cleaned = [];
  const seen = new Set();
  for (const item of rawServices || []) {
    const url = String(item?.url || fallbackUrl || "").trim();
    if (!url || !/^https?:\/\//i.test(url)) continue;
    const key = normalizeUrlKey(url);
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push({
      url: url.split("#")[0],
      title: String(item?.title || "").trim() || "Service",
      summary: String(item?.summary || "").trim(),
    });
    if (cleaned.length >= MAX_DISCOVER_LINKS) break;
  }
  return cleaned;
}

async function discoverServices({ pageUrl, areaName, country, apiKey }) {
  const page = await fetchPage(pageUrl);

  // WordPress /wp/v2/services list is the most reliable bulk source for agency sites.
  if (Array.isArray(page.wpServices) && page.wpServices.length > 0) {
    return {
      mode: "discover",
      indexUrl: page.url || pageUrl,
      services: page.wpServices.slice(0, MAX_DISCOVER_LINKS),
    };
  }

  const candidates = page.status === "ok" ? page.links.slice(0, 80) : [];
  const heuristic = page.status === "ok" ? heuristicServiceLinks(candidates, page.url) : [];
  const linkList = candidates
    .slice(0, 60)
    .map((l, i) => `${i + 1}. ${l.title || "(no title)"} → ${l.url}`)
    .join("\n");

  const prompt = `You help a holiday rental agency import partner services from their website.
Area: ${areaName}${country ? `, ${country}` : ""}
Open and read this services page URL (use the URL context tool): ${pageUrl}

${
  page.status === "ok"
    ? `Direct fetch also succeeded. Extra page text:
"""
${page.text.slice(0, 6000)}
"""
Candidate same-site links found by our crawler:
${linkList || "(none)"}`
    : `Direct server fetch failed (${page.note || "blocked"}). Rely on the URL context tool to read the live page.`
}

Return JSON only:
{"services":[{"title":"...","url":"https://...","summary":"one short line"}]}

Rules:
- Include every distinct bookable/promoted service or cooperation listed on this page (car rental, transfers, boat trips, chef, experiences, bike rental, adventures, etc.).
- Prefer deep service detail URLs (e.g. /services/private-airport-transfers/) over the index itself, home, blog, contact, login, privacy.
- Use absolute https URLs.
- If the page itself is a single service detail page (not a list), return one service for that page URL.
- Max 25 services.`;

  let services = [];
  try {
    const { text, raw } = await withRetry((model) =>
      generateJson(apiKey, model, prompt, { useUrlContext: true })
    );
    const parsed = parseJsonObject(text) || {};
    services = cleanDiscoveredServices(parsed.services, pageUrl);
    const ctxOk = urlContextHadSuccess(raw);
    logger.info("importPartnersFromWeb discover", {
      pageUrl,
      count: services.length,
      directFetch: page.status,
      urlContextSuccess: ctxOk,
    });
  } catch (err) {
    logger.warn("importPartnersFromWeb discover URL-context AI failed", {
      message: String(err?.response?.data?.error?.message || err?.message || ""),
    });
  }

  if (services.length === 0 && heuristic.length > 0) {
    services = heuristic;
  }

  if (services.length === 0) {
    throw new HttpsError(
      "failed-precondition",
      page.status !== "ok"
        ? `Could not read that page (${page.note}). Try again, or use a single service page URL.`
        : "Could not find service links on that page. Try a single service page URL instead."
    );
  }

  return {
    mode: "discover",
    indexUrl: page.status === "ok" ? page.url : pageUrl,
    services,
  };
}

async function extractPartners({ urls, areaName, country, categories, apiKey }) {
  const allowedCategories = [...new Set(categories.map((c) => String(c || "").trim()).filter(Boolean))].slice(
    0,
    MAX_CATEGORIES
  );
  if (allowedCategories.length === 0) {
    throw new HttpsError(
      "invalid-argument",
      "No partner categories provided. Add Partner Categories for this area first."
    );
  }

  const uniqueUrls = [];
  const seen = new Set();
  for (const raw of urls) {
    const url = String(raw || "").trim();
    if (!url || !/^https?:\/\//i.test(url)) continue;
    const key = normalizeUrlKey(url);
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueUrls.push(url);
    if (uniqueUrls.length >= MAX_EXTRACT_URLS) break;
  }
  if (uniqueUrls.length === 0) {
    throw new HttpsError("invalid-argument", "Provide at least one https service page URL.");
  }

  const categoryList = allowedCategories.map((name) => `"${name}"`).join(", ");
  const partners = [];
  const failures = [];

  for (const url of uniqueUrls) {
    // eslint-disable-next-line no-await-in-loop
    const page = await fetchPage(url);
    const hints = page.hints || extractHintsFromHtml(page.html || "");
    const knownTitle = hints?.title || suggestNameFromUrlSlug(url);
    const knownDescription = hints?.description || (page.text || "").slice(0, 600);
    const knownPhotoUrl = hints?.photoUrl || "";

    // If WordPress/HTML already gave us name + body, we can skip Gemini when content is solid.
    if (page.status === "ok" && knownTitle && knownDescription && knownDescription.length > 80) {
      try {
        // Still ask AI mainly for category mapping (+ polish description).
        // eslint-disable-next-line no-await-in-loop
        const { text } = await withRetry((model) =>
          generateJson(
            apiKey,
            model,
            `Map this holiday agency service into a guest-portal partner record for ${areaName}${country ? `, ${country}` : ""}.

Known from the page:
- name: ${knownTitle}
- website: ${url}
- main photo: ${knownPhotoUrl || "(none)"}
- page text (read carefully for category clues):
"""
${(page.text || knownDescription).slice(0, 9000)}
"""

Allowed categories (copy strings EXACTLY when selecting):
[${categoryList}]

Return JSON only:
{
  "name": "${knownTitle.replace(/"/g, '\\"')}",
  "description": "2 engaging guest sentences based on the page (keep facts)",
  "phoneNumber": "",
  "whatsapp": "",
  "email": "",
  "website": "${url}",
  "photoUrl": "${knownPhotoUrl.replace(/"/g, '\\"')}",
  "categories": ["Exact Category Name"]
}

Category rules (important):
- Read the page title and text; choose every allowed category that clearly fits (e.g. airport transfers → a Transfers/Airport category if listed).
- You MAY select multiple categories when the service clearly spans more than one.
- Only return "categories": [] when truly ambiguous or nothing in the allowed list is a reasonable fit.
- Never invent category names outside the allowed list.
- Always keep photoUrl as the known main photo URL when provided (do not clear it).`
          )
        );
        const parsed = parseJsonObject(text) || {};
        if (!parsed.photoUrl && knownPhotoUrl) parsed.photoUrl = knownPhotoUrl;
        const draft = normalizePartnerDraft(parsed, url, allowedCategories, {
          ...hints,
          photoUrl: knownPhotoUrl || hints?.photoUrl || "",
        });
        if (!draft.description) draft.description = knownDescription.slice(0, 500);
        if (!draft.photoUrl && knownPhotoUrl) draft.photoUrl = knownPhotoUrl;
        partners.push(draft);
        continue;
      } catch (err) {
        logger.warn("importPartnersFromWeb extract polish failed; using page hints", {
          url,
          message: String(err?.message || ""),
        });
        partners.push(
          normalizePartnerDraft(
            {
              name: knownTitle,
              description: knownDescription.slice(0, 500),
              website: url,
              categories: [],
            },
            url,
            allowedCategories,
            hints
          )
        );
        continue;
      }
    }

    const pageHint =
      page.status === "ok"
        ? `Direct fetch text (may help):\n"""\n${page.text.slice(0, 9000)}\n"""`
        : `Direct server fetch failed (${page.note || "blocked"}). Rely on the URL context tool.`;

    try {
      // eslint-disable-next-line no-await-in-loop
      const { text } = await withRetry((model) =>
        generateJson(
          apiKey,
          model,
          `Extract one agency partner / bookable service from this web page for a guest portal in ${areaName}${country ? `, ${country}` : ""}.

Open and read this URL with the URL context tool: ${url}

${pageHint}

Known title hint (use if the page is thin): ${knownTitle || "(none)"}

Allowed categories (copy strings EXACTLY when selecting):
[${categoryList}]

Return JSON only:
{
  "name": "Service or partner name from the H1/title (required)",
  "description": "2 engaging sentences for guests",
  "phoneNumber": "",
  "whatsapp": "",
  "email": "",
  "website": "${url}",
  "photoUrl": "",
  "categories": ["Exact Category Name"]
}

Rules:
- name MUST be the service title (e.g. "Private Airport Transfers"), never empty.
- description is required.
- website should be the best booking/service URL (usually this page).
- Prefer contact details found on the page; leave blank if unknown.
- photoUrl only if an absolute https image URL for the service is clearly present; else "".
- Category rules: read the page text carefully; select every allowed category that clearly fits (multiple OK); if ambiguous or none fit, return "categories": []; never invent names outside the allowed list.`,
          { useUrlContext: true }
        )
      );

      const parsed = parseJsonObject(text) || {};
      const draft = normalizePartnerDraft(parsed, url, allowedCategories, hints);
      if (!draft.name) {
        failures.push({ url, note: "AI could not find a service name on this page." });
        continue;
      }
      if (!draft.description) {
        draft.description =
          knownDescription ||
          `Book ${draft.name} through your host for a smoother stay in ${areaName}.`;
      }
      partners.push(draft);
    } catch (err) {
      logger.error("importPartnersFromWeb extract failed", {
        url,
        message: String(err?.response?.data?.error?.message || err?.message || ""),
      });
      // Last resort: URL slug / hints so a blocked AI call still yields an editable draft.
      const fallbackName = knownTitle || suggestNameFromUrlSlug(url);
      if (fallbackName) {
        partners.push(
          normalizePartnerDraft(
            {
              name: fallbackName,
              description:
                knownDescription ||
                `Book ${fallbackName} through your host for a smoother stay in ${areaName}.`,
              website: url,
              categories: [],
            },
            url,
            allowedCategories,
            hints
          )
        );
      } else {
        failures.push({
          url,
          note: String(err?.response?.data?.error?.message || err?.message || "Extract failed"),
        });
      }
    }
  }

  return {
    mode: "extract",
    partners,
    failures,
  };
}

function registerPartnerImportAi({ firebaseExports }) {
  firebaseExports.importPartnersFromWeb = onCall(
    {
      region: "us-central1",
      timeoutSeconds: 180,
      memory: "1GiB",
      enforceAppCheck: false,
    },
    async (request) => {
      if (!request.auth?.uid) {
        throw new HttpsError("unauthenticated", "Sign in to import partners from the web.");
      }

      const payload = request.data || {};
      const mode = String(payload.mode || "").trim();
      const areaName = String(payload.areaName || "").trim();
      const country = String(payload.country || "").trim();
      const categories = Array.isArray(payload.categories) ? payload.categories : [];

      if (!areaName) {
        throw new HttpsError("invalid-argument", "areaName is required.");
      }

      const apiKey = resolveGeminiApiKey();

      try {
        if (mode === "discover") {
          const pageUrl = String(payload.pageUrl || "").trim();
          if (!pageUrl) {
            throw new HttpsError("invalid-argument", "pageUrl is required for discover.");
          }
          return await discoverServices({ pageUrl, areaName, country, apiKey });
        }

        if (mode === "extract") {
          const urls = Array.isArray(payload.urls)
            ? payload.urls
            : payload.pageUrl
              ? [payload.pageUrl]
              : [];
          return await extractPartners({ urls, areaName, country, categories, apiKey });
        }

        throw new HttpsError(
          "invalid-argument",
          'mode must be "discover" (services list page) or "extract" (one or more service pages).'
        );
      } catch (err) {
        if (err instanceof HttpsError) throw err;
        logger.error("importPartnersFromWeb failed", err);
        throw new HttpsError(
          "internal",
          String(err?.response?.data?.error?.message || err?.message || "Partner import failed.")
        );
      }
    }
  );
}

module.exports = { registerPartnerImportAi };
