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
for (const name of ['favicon.svg', 'vailoLogo.png']) {
  const src = join(publicDir, name);
  if (existsSync(src)) {
    cpSync(src, join(appDir, name));
  }
}

// Marketing landing page at /
if (existsSync(marketingIndex)) {
  cpSync(marketingIndex, join(dist, 'index.html'));
} else {
  console.warn('postbuild-hosting: public/website/index.html not found');
}

const websiteDir = join(publicDir, 'website');
if (existsSync(websiteDir)) {
  for (const name of ['LdbkF.jpg', 'favicon.ico', 'robots.txt']) {
    const src = join(websiteDir, name);
    if (existsSync(src)) cpSync(src, join(dist, name));
  }
}

console.log('postbuild-hosting: marketing → dist/index.html, SPA → dist/app/');
