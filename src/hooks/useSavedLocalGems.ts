import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  isLocalGemSaved,
  listSavedLocalGems,
  matchesSavedLocalGemsScope,
  removeSavedLocalGem,
  saveLocalGem,
  savedLocalGemsChangeEventName,
  type SavedLocalGem,
  type SavedLocalGemInput,
} from '../lib/savedLocalGems';

export function useSavedLocalGems(propertyId: string | undefined, typeId: string | undefined) {
  const [items, setItems] = useState<SavedLocalGem[]>([]);

  const refresh = useCallback(() => {
    if (!propertyId || !typeId) {
      setItems([]);
      return;
    }
    setItems(listSavedLocalGems(propertyId, typeId));
  }, [propertyId, typeId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!propertyId || !typeId) return;
    const onChange = (event: Event) => {
      const scope = (event as CustomEvent<{ scope?: string }>).detail?.scope;
      if (matchesSavedLocalGemsScope(propertyId, typeId, scope)) refresh();
    };
    window.addEventListener(savedLocalGemsChangeEventName(), onChange);
    return () => window.removeEventListener(savedLocalGemsChangeEventName(), onChange);
  }, [propertyId, typeId, refresh]);

  const isSaved = useCallback(
    (input: SavedLocalGemInput) => {
      if (!propertyId || !typeId) return false;
      return isLocalGemSaved(propertyId, typeId, input);
    },
    [propertyId, typeId]
  );

  const save = useCallback(
    (input: SavedLocalGemInput) => {
      if (!propertyId || !typeId) return null;
      return saveLocalGem(propertyId, typeId, input);
    },
    [propertyId, typeId]
  );

  const remove = useCallback(
    (input: SavedLocalGemInput) => {
      if (!propertyId || !typeId) return false;
      return removeSavedLocalGem(propertyId, typeId, input);
    },
    [propertyId, typeId]
  );

  const categories = useMemo(() => {
    const set = new Set(items.map((item) => item.category).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [items]);

  return { items, count: items.length, categories, isSaved, save, remove, refresh };
}
