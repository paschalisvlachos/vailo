/**
 * After Vite build (base /app/): marketing at dist/, React SPA at dist/app/.
 */
import { cpSync, existsSync, mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';

const dist = join(process.cwd(), 'dist');
const appDir = join(dist, 'app');
const marketingIndex = join(process.cwd(), 'public', 'website', 'index.html');

if (!existsSync(join(dist, 'index.html'))) {
  console.error('postbuild-hosting: dist/index.html missing — run vite build first');
  process.exit(1);
}

mkdirSync(appDir, { recursive: true });

// SPA shell + bundles (index.html references /app/assets/…)
renameSync(join(dist, 'index.html'), join(appDir, 'index.html'));

const assetsDir = join(dist, 'assets');
if (existsSync(assetsDir)) {
  renameSync(assetsDir, join(appDir, 'assets'));
}

const publicDir = join(process.cwd(), 'public');
for (const name of ['V.png', 'vailoLogo.png', 'guest-portal-mockup.png']) {
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

// Marketing landing page at /
if (existsSync(marketingIndex)) {
  cpSync(marketingIndex, join(dist, 'index.html'));
} else {
  console.warn('postbuild-hosting: public/website/index.html not found');
}

const websiteDir = join(publicDir, 'website');
if (existsSync(websiteDir)) {
  const distWebsiteDir = join(dist, 'website');
  mkdirSync(distWebsiteDir, { recursive: true });

  const i18nDir = join(websiteDir, 'i18n');
  if (existsSync(i18nDir)) {
    cpSync(i18nDir, join(distWebsiteDir, 'i18n'), { recursive: true });
  }

  const i18nJs = join(websiteDir, 'i18n.js');
  if (existsSync(i18nJs)) {
    cpSync(i18nJs, join(distWebsiteDir, 'i18n.js'));
  }

  for (const name of ['favicon.ico', 'robots.txt', 'sitemap.xml', 'guest-portal-mockup.png']) {
    const src = join(websiteDir, name);
    if (existsSync(src)) cpSync(src, join(dist, name));
  }
}

console.log('postbuild-hosting: marketing → dist/index.html, SPA → dist/app/');
