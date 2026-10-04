/**
 * After Vite build (base /app/): React SPA at dist/app/.
 * Marketing pages are part of the SPA; Firebase Hosting rewrites `/` and
 * other website routes to `/app/index.html` (see firebase.json).
 */
import { cpSync, existsSync, mkdirSync, renameSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const dist = join(process.cwd(), 'dist');
const appDir = join(dist, 'app');

if (!existsSync(join(dist, 'index.html'))) {
  console.error('postbuild-hosting: dist/index.html missing — run vite build first');
  process.exit(1);
}

mkdirSync(appDir, { recursive: true });

// SPA shell + bundles (index.html references /app/assets/…)
renameSync(join(dist, 'index.html'), join(appDir, 'index.html'));

// Also serve the SPA at `/` as a real file. Firebase Hosting prefers an existing
// `index.html` over rewrites — without this, a leftover static shell can win.
cpSync(join(appDir, 'index.html'), join(dist, 'index.html'));

const assetsDir = join(dist, 'assets');
if (existsSync(assetsDir)) {
  renameSync(assetsDir, join(appDir, 'assets'));
}

const publicDir = join(process.cwd(), 'public');
for (const name of [
  'V.png',
  'vailoLogo.png',
  'guest-portal-mockup.png',
  'portal-ai-chatbot-hero.png',
  'portal-book-arrange-hero.png',
]) {
  const src = join(publicDir, name);
  if (existsSync(src)) {
    cpSync(src, join(appDir, name));
    cpSync(src, join(dist, name));
  }
}

const faviconIoDir = join(publicDir, 'favicon_io');
if (existsSync(faviconIoDir)) {
  cpSync(faviconIoDir, join(appDir, 'favicon_io'), { recursive: true });
  cpSync(faviconIoDir, join(dist, 'favicon_io'), { recursive: true });
}

// Keep SEO / legacy static assets from the old marketing folder (not the HTML shell).
const websiteDir = join(publicDir, 'website');
if (existsSync(websiteDir)) {
  for (const name of ['favicon.ico', 'robots.txt', 'sitemap.xml', 'guest-portal-mockup.png']) {
    const src = join(websiteDir, name);
    if (existsSync(src)) cpSync(src, join(dist, name));
  }

  const screenshotsDir = join(websiteDir, 'screenshots');
  if (existsSync(screenshotsDir)) {
    cpSync(screenshotsDir, join(dist, 'screenshots'), { recursive: true });
  }
}

// Vite copies public/website into dist/website; drop the old static HTML so `/website`
// is not mistaken for the live marketing site.
const distWebsiteIndex = join(dist, 'website', 'index.html');
if (existsSync(distWebsiteIndex)) {
  unlinkSync(distWebsiteIndex);
}

console.log('postbuild-hosting: SPA → dist/app/ (marketing via Hosting rewrites to /app/index.html)');
