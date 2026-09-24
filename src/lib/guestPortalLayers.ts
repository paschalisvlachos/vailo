/** Shared z-index classes for guest portal overlays (lowest → highest). */
export const GUEST_PORTAL_Z = {
  fab: 'z-[60]',
  /** Above detail sheets so Home/Book/Ask Vailo stay visible during Request to book. */
  bottomNav: 'z-[115]',
  languageMenu: 'z-[90]',
  mapSheet: 'z-[90]',
  houseGuide: 'z-[95]',
  legal: 'z-[100]',
  detailSheet: 'z-[110]',
  navBackdrop: 'z-[120]',
  navDrawer: 'z-[121]',
} as const;

/**
 * Full-screen guest tab shells. In admin mobile-frame preview the bottom nav is
 * `absolute` inside the phone chrome, so tabs must be `absolute` too — `fixed`
 * escapes the frame, collapses the parent, and hides the nav.
 */
export function guestSubviewPositionClass(isMobileFramePreview = false): string {
  return isMobileFramePreview ? 'absolute inset-0 z-50' : 'fixed inset-0 z-50';
}
