/** Base path for the Vailo admin SPA (hosted at vailo.app/admin). */
export const ADMIN_BASE = '/admin';

/** Build an absolute admin path (e.g. `/admin/properties`). */
export function adminPath(subpath = ''): string {
  if (!subpath || subpath === '/') return ADMIN_BASE;
  const clean = subpath.startsWith('/') ? subpath : `/${subpath}`;
  return `${ADMIN_BASE}${clean}`;
}

/** True when pathname is under the admin app. */
export function isAdminPathname(pathname: string): boolean {
  return pathname === ADMIN_BASE || pathname.startsWith(`${ADMIN_BASE}/`);
}
