/** Public marketing website pages served by the SPA (see `src/pages/website`). */
export const WEBSITE_PATHS = [
  '/',
  '/impact',
  '/features',
  '/pricing',
  '/tour-providers',
  '/contact',
  '/privacy',
  '/terms',
] as const;

/** True for public marketing pages (no auth, so the app shell should not wait for Firebase Auth). */
export function isWebsitePathname(pathname: string): boolean {
  const clean = pathname.replace(/\/+$/, '') || '/';
  return (WEBSITE_PATHS as readonly string[]).includes(clean);
}
