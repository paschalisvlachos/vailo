const logger = require("firebase-functions/logger");

/**
 * Expand maps.google.com/?cid=… by loading the share link in headless Chromium.
 * Places API (New) cannot resolve CIDs; legacy Place Details often isn't enabled.
 * Returns { placeName, lat, lng, finalUrl, featureId } or null.
 */
async function resolveMapsCidInBrowser(cidOrUrl) {
  const cidMatch = String(cidOrUrl || "").match(/(?:[?&]cid=|\/cid\/)?(\d{5,})/i);
  const cid = cidMatch?.[1];
  if (!cid) return null;

  let chromium;
  let puppeteer;
  try {
    chromium = require("@sparticuz/chromium");
    puppeteer = require("puppeteer-core");
  } catch (e) {
    logger.warn("CID browser resolve unavailable (chromium deps missing):", e.message || e);
    return null;
  }

  const startUrl = `https://www.google.com/maps?cid=${cid}&hl=en&gl=us`;
  let browser;
  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });
    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    );
    await page.goto(startUrl, { waitUntil: "domcontentloaded", timeout: 45000 });

    // Wait until Maps JS navigates to a /place/ URL (or timeout).
    await page
      .waitForFunction(
        () => /\/maps\/place\//i.test(window.location.href),
        { timeout: 25000 }
      )
      .catch(() => null);

    const finalUrl = page.url();
    const title = await page.title().catch(() => "");
    const placePath = finalUrl.match(/\/maps\/place\/([^/?@]+)/i)?.[1] || "";
    const placeName = placePath
      ? decodeURIComponent(placePath.replace(/\+/g, " ")).trim()
      : String(title || "")
          .split(" - ")[0]
          .split(" · ")[0]
          .replace(/Google Maps/i, "")
          .trim();
    const coords = finalUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    const featureId = finalUrl.match(/!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i)?.[1] || null;

    if (!placeName && !(coords && coords[1] && coords[2])) {
      logger.warn("CID browser resolve got no place name/coords", { cid, finalUrl });
      return null;
    }

    return {
      cid,
      placeName: placeName || "",
      lat: coords ? parseFloat(coords[1]) : null,
      lng: coords ? parseFloat(coords[2]) : null,
      finalUrl,
      featureId,
    };
  } catch (e) {
    logger.warn("CID browser resolve failed:", e.message || e);
    return null;
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        /* ignore */
      }
    }
  }
}

module.exports = { resolveMapsCidInBrowser };
