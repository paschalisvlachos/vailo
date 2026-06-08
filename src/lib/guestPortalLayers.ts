/** Shared z-index classes for guest portal overlays (lowest → highest). */
export const GUEST_PORTAL_Z = {
  fab: 'z-[60]',
  languageMenu: 'z-[90]',
  mapSheet: 'z-[90]',
  houseGuide: 'z-[95]',
  legal: 'z-[100]',
  detailSheet: 'z-[110]',
  navBackdrop: 'z-[120]',
  navDrawer: 'z-[121]',
} as const;
