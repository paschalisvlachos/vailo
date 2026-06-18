import QRCode from 'qrcode';
import { getGuestPortalPublicOrigin } from './guestAccess';
import { formatGuestSlug, getTypePublicSlug } from './guestPortalSlug';

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
  const dataUrl = await QRCode.toDataURL(url, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 512,
    color: { dark: '#051F26', light: '#FFFFFF' },
  });

  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename.endsWith('.png') ? filename : `${filename}.png`;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
