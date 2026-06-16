/**
 * Guest-facing discovered-places helpers — verified pool vs admin review queue.
 */

import { getFunctions, httpsCallable } from 'firebase/functions';

export type GuestDiscoveredPlaceRow = {
  id?: string;
  name?: string;
  category?: string;
  description?: string;
  latitude?: number | null;
  longitude?: number | null;
  photoUrl?: string;
  googleMapsUrl?: string;
  googlePlaceId?: string;
  reviewStatus?: string;
  status?: string;
  source?: string;
};

/** Reviewed discovered places eligible for the curated guest pool (not free-text queue). */
export function isGuestVerifiedDiscoveredPlace(row: GuestDiscoveredPlaceRow): boolean {
  if (String(row.status || '').toLowerCase() === 'hidden') return false;
  if (String(row.reviewStatus || '').toLowerCase() !== 'reviewed') return false;
  const lat = typeof row.latitude === 'number' ? row.latitude : null;
  const lng = typeof row.longitude === 'number' ? row.longitude : null;
  if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) return false;
  const photo = String(row.photoUrl || '').trim();
  const maps = String(row.googleMapsUrl || '').trim();
  return Boolean(photo || maps);
}

export type UnverifiedAiMention = {
  title: string;
  description?: string;
  category?: string;
  failureReason?: string;
};

/** Persist failed AI picks for admin review — no Google billing, not guest-cache eligible. */
export async function persistUnverifiedAiMentions(
  mentions: UnverifiedAiMention[],
  ctx: { country: string; areaId: string }
): Promise<void> {
  if (!ctx.country || !ctx.areaId || mentions.length === 0) return;

  const callable = httpsCallable(getFunctions(), 'recordGuestDiscoveredMention');
  await Promise.all(
    mentions.map((m) =>
      callable({
        name: m.title,
        description: m.description || '',
        category: m.category || '',
        country: ctx.country,
        areaId: ctx.areaId,
        failureReason: m.failureReason || '',
        verified: false,
      }).catch((err) => {
        console.warn('[Vailo] recordGuestDiscoveredMention failed:', m.title, err);
      })
    )
  );
}
