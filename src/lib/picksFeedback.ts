/**
 * Guest "thumbs up / thumbs down" feedback per recommendation.
 *
 * Stored at:  properties/{propertyId}/picksFeedback/{docId}
 * where docId is a deterministic hash of the item key (Place ID / coords / name)
 * so duplicate places get aggregated.
 *
 * The doc carries running counts + the latest local vote so the same guest can
 * toggle without inflating the totals. We never store who voted.
 */

import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
  increment,
} from 'firebase/firestore';
import { db } from './firebase';
import { pickKeyForItem } from './picksFairness';

export type FeedbackVote = 'up' | 'down' | null;

const LOCAL_VOTE_PREFIX = 'vailo:pickVote:';

function safeDocId(key: string): string {
  // Firestore doc IDs cannot contain "/". Replace any with "_".
  return key.replace(/\//g, '_').slice(0, 256);
}

function localStorageKey(propertyId: string, docId: string): string {
  return `${LOCAL_VOTE_PREFIX}${propertyId}:${docId}`;
}

function readLocalVote(propertyId: string, docId: string): FeedbackVote {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(localStorageKey(propertyId, docId));
    return raw === 'up' || raw === 'down' ? raw : null;
  } catch {
    return null;
  }
}

function writeLocalVote(propertyId: string, docId: string, vote: FeedbackVote): void {
  if (typeof window === 'undefined') return;
  try {
    if (vote === null) {
      window.localStorage.removeItem(localStorageKey(propertyId, docId));
    } else {
      window.localStorage.setItem(localStorageKey(propertyId, docId), vote);
    }
  } catch {
    // ignore
  }
}

export type PickFeedbackItem = {
  title: string;
  source?: string;
  googlePlaceId?: string;
  googleMapsUrl?: string;
  latitude?: number;
  longitude?: number;
  description?: string;
  category?: string;
};

export type PickFeedbackResult = {
  docId: string;
  previousVote: FeedbackVote;
  newVote: FeedbackVote;
};

/** Apply a thumbs-up / thumbs-down vote for a recommendation. */
export async function applyPickFeedback(
  propertyId: string,
  item: PickFeedbackItem,
  nextVote: FeedbackVote
): Promise<PickFeedbackResult> {
  const key = pickKeyForItem(item);
  if (!key) throw new Error('Cannot identify item for feedback.');
  const docId = safeDocId(key);

  const previousVote = readLocalVote(propertyId, docId);
  const ref = doc(db, 'properties', propertyId, 'picksFeedback', docId);

  // Delta on each counter (handles toggling between up/down/none).
  const deltaUp =
    (nextVote === 'up' ? 1 : 0) - (previousVote === 'up' ? 1 : 0);
  const deltaDown =
    (nextVote === 'down' ? 1 : 0) - (previousVote === 'down' ? 1 : 0);

  if (deltaUp === 0 && deltaDown === 0) {
    writeLocalVote(propertyId, docId, nextVote);
    return { docId, previousVote, newVote: nextVote };
  }

  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      key,
      title: item.title || '',
      source: item.source || 'ai',
      category: item.category || '',
      googlePlaceId: item.googlePlaceId || '',
      googleMapsUrl: item.googleMapsUrl || '',
      latitude: typeof item.latitude === 'number' ? item.latitude : null,
      longitude: typeof item.longitude === 'number' ? item.longitude : null,
      thumbsUp: Math.max(0, deltaUp),
      thumbsDown: Math.max(0, deltaDown),
      lastVoteAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    });
  } else {
    await updateDoc(ref, {
      title: item.title || snap.data().title || '',
      source: item.source || snap.data().source || 'ai',
      category: item.category || snap.data().category || '',
      googlePlaceId: item.googlePlaceId || snap.data().googlePlaceId || '',
      googleMapsUrl: item.googleMapsUrl || snap.data().googleMapsUrl || '',
      latitude:
        typeof item.latitude === 'number' ? item.latitude : (snap.data().latitude ?? null),
      longitude:
        typeof item.longitude === 'number' ? item.longitude : (snap.data().longitude ?? null),
      thumbsUp: increment(deltaUp),
      thumbsDown: increment(deltaDown),
      lastVoteAt: serverTimestamp(),
    });
  }

  writeLocalVote(propertyId, docId, nextVote);
  return { docId, previousVote, newVote: nextVote };
}

/** Look up the local vote (cheap, no Firestore read). */
export function getLocalVote(propertyId: string, item: PickFeedbackItem): FeedbackVote {
  const key = pickKeyForItem(item);
  if (!key) return null;
  return readLocalVote(propertyId, safeDocId(key));
}
