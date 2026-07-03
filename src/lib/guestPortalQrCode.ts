import QRCode from 'qrcode';
import { getGuestPortalPublicOrigin } from './guestAccess';
import { formatGuestSlug, getTypePublicSlug } from './guestPortalSlug';

export const VAILO_MARKETING_SITE_URL = 'https://www.vailo.app';
export const VAILO_QR_CENTER_LOGO_PATH = 'V.png';

export type QrCodeDownloadOptions = {
  width?: number;
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
  darkColor?: string;
  lightColor?: string;
  centerLogoUrl?: string;
  /** Logo width as a fraction of QR width (default 0.22). */
  centerLogoScale?: number;
  /** White pad around logo as a fraction of QR width (default 0.06). */
  centerLogoPadding?: number;
};

/** Resolve a public/ asset for dev (`/`) and production admin (`/app/`). */
export function resolvePublicAsset(path: string): string {
  const base = import.meta.env.BASE_URL || '/';
  const trimmed = path.replace(/^\//, '');
  return `${base}${trimmed}`;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

function fillRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number
) {
  const r = Math.min(radius, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
}

/** Generate a PNG data URL for a QR code, optionally with a centered logo. */
export async function generateQrCodePngDataUrl(
  url: string,
  options: QrCodeDownloadOptions = {}
): Promise<string> {
  const width = options.width ?? 512;
  const logoUrl = options.centerLogoUrl?.trim();
  const errorCorrectionLevel =
    options.errorCorrectionLevel ?? (logoUrl ? 'H' : 'M');
  const dark = options.darkColor ?? '#051F26';
  const light = options.lightColor ?? '#FFFFFF';

  const canvas = document.createElement('canvas');
  await QRCode.toCanvas(canvas, url, {
    errorCorrectionLevel,
    margin: 2,
    width,
    color: { dark, light },
  });

  if (logoUrl) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is not supported in this browser.');

    const logo = await loadImage(logoUrl);
    const logoScale = options.centerLogoScale ?? 0.22;
    const padScale = options.centerLogoPadding ?? 0.06;
    const logoSize = Math.round(width * logoScale);
    const pad = Math.round(width * padScale);
    const total = logoSize + pad * 2;
    const x = Math.round((width - total) / 2);
    const y = Math.round((width - total) / 2);

    ctx.fillStyle = light;
    fillRoundedRect(ctx, x, y, total, total, total * 0.14);

    ctx.drawImage(logo, x + pad, y + pad, logoSize, logoSize);
  }

  return canvas.toDataURL('image/png');
}

function triggerPngDownload(dataUrl: string, filename: string) {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename.endsWith('.png') ? filename : `${filename}.png`;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/** Generate a PNG QR code and trigger a browser download. */
export async function downloadQrCodePng(
  url: string,
  filename: string,
  options: QrCodeDownloadOptions = {}
): Promise<void> {
  const dataUrl = await generateQrCodePngDataUrl(url, options);
  triggerPngDownload(dataUrl, filename);
}

export async function downloadVailoMarketingQrCode(
  options: QrCodeDownloadOptions = {}
): Promise<void> {
  await downloadQrCodePng(VAILO_MARKETING_SITE_URL, 'vailo-app-qr.png', {
    width: 1024,
    centerLogoUrl: resolvePublicAsset(VAILO_QR_CENTER_LOGO_PATH),
    ...options,
  });
}

/** Public guest portal URL without query params — suitable for QR codes and print. */
export function buildGuestPortalPublicListingUrl(
  property: { urlSlug?: string | null },
  typeData: {
    urlSlug?: string | null;
    typeSlug?: string | null;
    propertyTypeName?: string | null;
  }
): string | null {
  const propSlug = formatGuestSlug(property.urlSlug);
  const unitSlug = getTypePublicSlug(typeData);
  if (!propSlug || !unitSlug) return null;
  return `${getGuestPortalPublicOrigin()}/${propSlug}/${unitSlug}`;
}

export function guestPortalQrFilename(
  property: { urlSlug?: string | null },
  typeData: {
    urlSlug?: string | null;
    typeSlug?: string | null;
    propertyTypeName?: string | null;
  }
): string {
  const propSlug = formatGuestSlug(property.urlSlug) || 'property';
  const unitSlug = getTypePublicSlug(typeData) || 'listing';
  return `vailo-${propSlug}-${unitSlug}-qr.png`;
}

/** Generate a PNG QR code for `url` and trigger a browser download. */
export async function downloadGuestPortalQrCode(url: string, filename: string): Promise<void> {
  await downloadQrCodePng(url, filename, { width: 512 });
}
