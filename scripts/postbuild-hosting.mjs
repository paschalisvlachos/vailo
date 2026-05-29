/**
 * After Vite build: serve marketing site at / and the React app at /app/.
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
renameSync(join(dist, 'index.html'), join(appDir, 'index.html'));

if (existsSync(marketingIndex)) {
  cpSync(marketingIndex, join(dist, 'index.html'));
} else {
  console.warn('postbuild-hosting: public/website/index.html not found');
}

// Optional static assets co-located with the marketing page
const websiteDir = join(process.cwd(), 'public', 'website');
if (existsSync(websiteDir)) {
  for (const name of ['LdbkF.jpg', 'favicon.ico', 'robots.txt']) {
    const src = join(websiteDir, name);
    if (existsSync(src)) cpSync(src, join(dist, name));
  }
}

console.log('postbuild-hosting: marketing → dist/index.html, SPA → dist/app/index.html');
