/** Category colors + map pin helpers for Area Local Gems admin map. */

/** Distinct, readable pin colors — assigned stably by category name. */
export const AREA_GEM_CATEGORY_COLORS = [
  '#0B7A75', // teal
  '#C45C26', // terracotta
  '#2F6FED', // blue
  '#7C3AED', // violet
  '#B45309', // amber
  '#BE185D', // rose
  '#047857', // emerald
  '#B91C1C', // red
  '#0E7490', // cyan
  '#A16207', // gold-brown
  '#4338CA', // indigo
  '#15803D', // green
] as const;

function hashCategoryKey(key: string): number {
  let h = 0;
  const s = key.trim().toLowerCase();
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

/** Stable hex color for a category primary name. */
export function colorForGemCategory(categoryPrimary: string): string {
  const key = categoryPrimary.trim();
  if (!key) return '#64748B';
  return AREA_GEM_CATEGORY_COLORS[hashCategoryKey(key) % AREA_GEM_CATEGORY_COLORS.length];
}

export function parseGemCoord(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const n = parseFloat(String(value ?? '').trim());
  return Number.isFinite(n) ? n : null;
}

export type AreaGemMapPoint = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  /** Primary category used for pin color (first matching catalog primary). */
  categoryPrimary: string;
  categoryLabel: string;
  color: string;
};

export function gemMapDivIconHtml(color: string): string {
  const safe = color.replace(/[^#a-fA-F0-9]/g, '') || '#64748B';
  return `<span style="
    display:block;
    width:18px;
    height:18px;
    border-radius:50% 50% 50% 0;
    transform:rotate(-45deg);
    background:${safe};
    border:2px solid #fff;
    box-shadow:0 1px 4px rgba(5,31,38,0.35);
  "></span>`;
}
