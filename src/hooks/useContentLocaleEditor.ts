import { useCallback, useEffect, useRef, useState } from 'react';
import {
  buildLocalizedFirestorePayload,
  mergeLegacyIntoLocaleMap,
  normalizeLocaleCode,
  readLocaleMap,
  setLocaleFieldValue,
  type LocaleStringMap,
} from '../lib/propertyContentLocales';

export function useContentLocaleEditor(
  primaryLocale: string,
  fields: string[],
  sourceDoc?: Record<string, unknown> | null
) {
  const primary = normalizeLocaleCode(primaryLocale) || 'en';
  const [contentLocale, setContentLocale] = useState(primary);

  const buildMapsFromDoc = useCallback(
    (doc?: Record<string, unknown> | null) => {
      const initial: Record<string, LocaleStringMap> = {};
      for (const field of fields) {
        initial[field] = mergeLegacyIntoLocaleMap(
          readLocaleMap(doc, field),
          typeof doc?.[field] === 'string' ? (doc[field] as string) : undefined,
          primary
        );
      }
      return initial;
    },
    [fields, primary]
  );

  const [maps, setMaps] = useState<Record<string, LocaleStringMap>>(() => buildMapsFromDoc(sourceDoc));
  const lastSyncedSourceRef = useRef<Record<string, unknown> | null | undefined>(undefined);

  useEffect(() => {
    if (lastSyncedSourceRef.current === sourceDoc) return;
    lastSyncedSourceRef.current = sourceDoc;
    setMaps(buildMapsFromDoc(sourceDoc));
  }, [sourceDoc, buildMapsFromDoc, primary]);

  const getValue = useCallback(
    (field: string) => {
      const map = maps[field] || {};
      const code = normalizeLocaleCode(contentLocale) || primary;
      return (map[code] ?? '').toString();
    },
    [maps, contentLocale, primary]
  );

  const getValueForLocale = useCallback(
    (field: string, locale: string) => {
      const map = maps[field] || {};
      const code = normalizeLocaleCode(locale) || primary;
      return (map[code] ?? '').toString();
    },
    [maps, primary]
  );

  const setValue = useCallback(
    (field: string, value: string) => {
      const code = normalizeLocaleCode(contentLocale) || primary;
      setMaps((prev) => ({
        ...prev,
        [field]: setLocaleFieldValue(prev[field] || {}, code, value, { trim: false }),
      }));
    },
    [contentLocale, primary]
  );

  const applyPrimaryFields = useCallback(
    (values: Record<string, string>) => {
      setMaps((prev) => {
        const next = { ...prev };
        for (const [field, value] of Object.entries(values)) {
          if (!fields.includes(field)) continue;
          next[field] = setLocaleFieldValue(next[field] || {}, primary, value);
        }
        return next;
      });
    },
    [primary, fields]
  );

  const applyTranslatedFields = useCallback(
    (targetLocale: string,
    values: Record<string, string>) => {
      const code = normalizeLocaleCode(targetLocale);
      if (!code) return;
      setMaps((prev) => {
        const next = { ...prev };
        for (const [field, value] of Object.entries(values)) {
          if (!fields.includes(field)) continue;
          next[field] = setLocaleFieldValue(next[field] || {}, code, value);
        }
        return next;
      });
    },
    [fields]
  );

  const getPrimaryValue = useCallback(
    (field: string) => (maps[field]?.[primary] ?? '').toString(),
    [maps, primary]
  );

  const buildPayload = useCallback(
    () => buildLocalizedFirestorePayload(fields, maps, primary, {}),
    [fields, maps, primary]
  );

  const resetMaps = useCallback(() => {
    lastSyncedSourceRef.current = null;
    setMaps(buildMapsFromDoc(null));
    setContentLocale(primary);
  }, [buildMapsFromDoc, primary]);

  const loadFromDoc = useCallback(
    (doc: Record<string, unknown> | null | undefined, options?: { preserveLocale?: boolean }) => {
      lastSyncedSourceRef.current = doc;
      setMaps(buildMapsFromDoc(doc));
      if (!options?.preserveLocale) {
        setContentLocale(primary);
      }
    },
    [buildMapsFromDoc, primary]
  );

  return {
    contentLocale,
    setContentLocale,
    primaryLocale: primary,
    getValue,
    getValueForLocale,
    setValue,
    getPrimaryValue,
    applyPrimaryFields,
    applyTranslatedFields,
    buildPayload,
    resetMaps,
    loadFromDoc,
  };
}
