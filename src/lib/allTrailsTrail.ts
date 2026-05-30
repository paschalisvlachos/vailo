/** Public AllTrails web API key (client-side, embedded in their site). */
const ALLTRAILS_WEB_API_KEY = '3p0t5s6b5g4g0e8k3c1j3w7y5c3m4t8i';

export function allTrailsPhotoUrl(trailId?: string | null, photoUrl?: string | null): string {
  const id = String(trailId || '').trim();
  if (id) {
    return `https://www.alltrails.com/api/alltrails/v2/trails/${encodeURIComponent(id)}/photos/0?key=${ALLTRAILS_WEB_API_KEY}&size=md`;
  }
  const url = String(photoUrl || '').trim();
  if (url && !url.includes('assets.alltrails.com')) return url;
  return '';
}

/** Query params for a cleaner embedded map (no scroll zoom, no elevation chart). */
const EMBED_UI_PARAMS = 'scrollZoom=false&elevationDiagram=false';

/** Ensure widget URLs hide scroll zoom and the elevation diagram. */
export function normalizeAllTrailsEmbedSrc(src: string): string {
  const raw = String(src || '').trim();
  if (!raw.includes('alltrails.com/widget/')) return raw;
  try {
    const url = new URL(raw.includes('://') ? raw : `https://${raw}`);
    url.searchParams.set('scrollZoom', 'false');
    url.searchParams.set('elevationDiagram', 'false');
    if (!url.searchParams.has('u')) url.searchParams.set('u', 'm');
    return url.toString();
  } catch {
    return raw;
  }
}

/** Build widget iframe src — include share hash from AllTrails Share → Embed (sh=…). */
export function buildAllTrailsEmbedSrc(
  slug?: string | null,
  shareHash?: string | null
): string {
  const path = String(slug || '')
    .trim()
    .replace(/^\//, '');
  if (!path || !path.includes('trail/')) return '';
  let url = `https://www.alltrails.com/widget/${path}?${EMBED_UI_PARAMS}&u=m`;
  const sh = String(shareHash || '').trim();
  if (sh) url += `&sh=${encodeURIComponent(sh)}`;
  return url;
}

/** Extract iframe src from AllTrails Share → Embed HTML snippet. */
export function parseEmbedSrcFromIframe(html: string): string {
  const raw = String(html || '').trim();
  if (!raw) return '';
  const match = raw.match(/src=["']([^"']*alltrails\.com\/widget\/[^"']+)["']/i);
  if (!match?.[1]) return '';
  return normalizeAllTrailsEmbedSrc(match[1].replace(/&amp;/g, '&').trim());
}

/** Extract sh= token from an embed src URL or iframe HTML. */
export function extractAllTrailsShareHash(input: string): string {
  const src = input.includes('<iframe') ? parseEmbedSrcFromIframe(input) : input.trim();
  if (!src) return '';
  try {
    const url = new URL(src);
    return url.searchParams.get('sh') || '';
  } catch {
    const m = src.match(/[?&]sh=([^&]+)/i);
    return m?.[1] ? decodeURIComponent(m[1]) : '';
  }
}

export function resolveAllTrailsEmbedSrc(options: {
  embedSrc?: string | null;
  widgetUrl?: string | null;
  slug?: string | null;
  allTrailsUrl?: string | null;
  shareHash?: string | null;
}): string {
  const direct = String(options.embedSrc || options.widgetUrl || '').trim();
  if (direct.includes('alltrails.com/widget/')) return normalizeAllTrailsEmbedSrc(direct);

  const slug = String(options.slug || '').trim();
  if (slug) return buildAllTrailsEmbedSrc(slug, options.shareHash);

  const pageUrl = String(options.allTrailsUrl || '').trim();
  const match = pageUrl.match(/alltrails\.com\/(trail\/[^/?#]+)/i);
  if (match?.[1]) return buildAllTrailsEmbedSrc(match[1], options.shareHash);

  return '';
}

/** @deprecated use resolveAllTrailsEmbedSrc */
export function allTrailsWidgetUrl(
  widgetUrl?: string | null,
  slug?: string | null,
  allTrailsUrl?: string | null
): string {
  return resolveAllTrailsEmbedSrc({ widgetUrl, slug, allTrailsUrl });
}

/** Human-readable scope for an AllTrails explore / region URL. */
export function describeAllTrailsStartUrl(startUrl: string): string | null {
  const raw = startUrl.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw.includes('://') ? raw : `https://${raw}`);
    const params = url.searchParams;
    const tlLat = params.get('b_tl_lat');
    const tlLng = params.get('b_tl_lng');
    const brLat = params.get('b_br_lat');
    const brLng = params.get('b_br_lng');
    if (tlLat && tlLng && brLat && brLng) {
      const south = Math.min(Number(tlLat), Number(brLat));
      const north = Math.max(Number(tlLat), Number(brLat));
      const west = Math.min(Number(tlLng), Number(brLng));
      const east = Math.max(Number(tlLng), Number(brLng));
      if ([south, north, west, east].every(Number.isFinite)) {
        return `Trails inside your AllTrails map rectangle (lat ${south.toFixed(2)}°–${north.toFixed(2)}°, lng ${west.toFixed(2)}°–${east.toFixed(2)}°). Zoom/pan the map on AllTrails before copying the URL to change this area.`;
      }
    }
    const path = url.pathname.replace(/\/+$/, '');
    if (path && path !== '/explore' && !path.startsWith('/explore/')) {
      return `Trails linked to AllTrails page: ${path.replace(/^\//, '')}`;
    }
  } catch {
    return null;
  }
  return null;
}

export const ALLTRAILS_EMBED_IFRAME_TITLE =
  'AllTrails: Trail Guides and Maps for Hiking, Camping, and Running';
