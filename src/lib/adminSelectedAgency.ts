/** Persisted platform-admin agency selection for “Your portfolio” sidebar. */

const STORAGE_KEY = 'vailo_admin_selected_agency';

export function readSelectedAgencyId(): string | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY)?.trim() || '';
    return value || null;
  } catch {
    return null;
  }
}

export function writeSelectedAgencyId(agencyId: string | null): void {
  try {
    if (!agencyId) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    localStorage.setItem(STORAGE_KEY, agencyId);
  } catch {
    /* ignore */
  }
}
