/**
 * Device-only saved picks from Live like a local.
 * Scoped per property + unit — not synced across devices or guests.
 */

import { pickKeyForItem } from './picksFairness';

const STORAGE_PREFIX = 'vailo:savedLocalGems:v1:';
const CHANGE_EVENT = 'vailo:savedLocalGemsChange';
const MAX_ITEMS = 200;

export type SavedLocalGem = {
  id: string;
  title: string;
  description?: string;
  category: string;
  source?: string;
  photoUrl?: string;
  googleMapsUrl?: string;
  googlePlaceId?: string;
  latitude?: number;
  longitude?: number;
  estimatedDistance?: string;
  beyondRadius?: boolean;
  savedAt: number;
  itemType?: 'trail' | 'pick';
  allTrailsUrl?: string;
  allTrailsId?: string;
};

export type SavedLocalGemInput = Omit<SavedLocalGem, 'id' | 'savedAt'> & {
  title: string;
  category: string;
};

function storageKey(propertyId: string, typeId: string): string {
  return `${STORAGE_PREFIX}${propertyId}:${typeId}`;
}

function scopeKey(propertyId: string, typeId: string): string {
  return `${propertyId}:${typeId}`;
}

function safeRead(propertyId: string, typeId: string): SavedLocalGem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(storageKey(propertyId, typeId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is SavedLocalGem =>
        !!entry &&
        typeof entry === 'object' &&
        typeof (entry as SavedLocalGem).id === 'string' &&
        typeof (entry as SavedLocalGem).title === 'string' &&
        typeof (entry as SavedLocalGem).category === 'string' &&
        typeof (entry as SavedLocalGem).savedAt === 'number'
    );
  } catch {
    return [];
  }
}

function safeWrite(propertyId: string, typeId: string, items: SavedLocalGem[]): void {
  if (typeof window === 'undefined') return;
  try {
    const trimmed = items
      .slice()
      .sort((a, b) => b.savedAt - a.savedAt)
      .slice(0, MAX_ITEMS);
    window.localStorage.setItem(storageKey(propertyId, typeId), JSON.stringify(trimmed));
    window.dispatchEvent(
      new CustomEvent(CHANGE_EVENT, { detail: { scope: scopeKey(propertyId, typeId) } })
    );
  } catch {
    // ignore quota / private mode
  }
}

export function savedPickKey(input: SavedLocalGemInput): string | null {
  const base = pickKeyForItem(input);
  if (base) return base;
  const trailId = String(input.allTrailsId || '').trim();
  if (trailId) return `trail:${trailId}`;
  return null;
}

export function listSavedLocalGems(propertyId: string, typeId: string): SavedLocalGem[] {
  return safeRead(propertyId, typeId);
}

export function isLocalGemSaved(
  propertyId: string,
  typeId: string,
  input: SavedLocalGemInput
): boolean {
  const id = savedPickKey(input);
  if (!id) return false;
  return safeRead(propertyId, typeId).some((item) => item.id === id);
}

export function saveLocalGem(
  propertyId: string,
  typeId: string,
  input: SavedLocalGemInput
): SavedLocalGem | null {
  const id = savedPickKey(input);
  if (!id) return null;

  const existing = safeRead(propertyId, typeId);
  const now = Date.now();
  const next: SavedLocalGem = {
    ...input,
    id,
    savedAt: now,
  };

  const without = existing.filter((item) => item.id !== id);
  safeWrite(propertyId, typeId, [next, ...without]);
  return next;
}

export function removeSavedLocalGem(
  propertyId: string,
  typeId: string,
  input: SavedLocalGemInput
): boolean {
  const id = savedPickKey(input);
  if (!id) return false;
  const existing = safeRead(propertyId, typeId);
  const filtered = existing.filter((item) => item.id !== id);
  if (filtered.length === existing.length) return false;
  safeWrite(propertyId, typeId, filtered);
  return true;
}

export function savedLocalGemsChangeEventName(): string {
  return CHANGE_EVENT;
}

export function matchesSavedLocalGemsScope(
  propertyId: string,
  typeId: string,
  scope: string | undefined
): boolean {
  return scope === scopeKey(propertyId, typeId);
}
