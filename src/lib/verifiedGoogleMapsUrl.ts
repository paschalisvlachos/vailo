/** Admin-verified short Google Maps links (maps.app.goo.gl). */
const VERIFIED_MAPS_SHORT_URL =
  /^https:\/\/maps\.app\.goo\.gl\/[A-Za-z0-9_-]+\/?$/i;

export function isVerifiedGoogleMapsShortUrl(url: string): boolean {
  return VERIFIED_MAPS_SHORT_URL.test(String(url || '').trim());
}

export function verifiedGoogleMapsUrlHint(): string {
  return 'https://maps.app.goo.gl/…';
}
