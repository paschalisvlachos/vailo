import { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { usePlatformLanguages } from './usePlatformLanguages';
import {
  parseAreaContentLocaleSettings,
  resolveAreaContentLocaleSettings,
  type PropertyContentLocaleSettings,
} from '../lib/propertyContentLocales';

export function useAreaContentLocaleSettings(country: string, areaId: string) {
  const { languages } = usePlatformLanguages();
  const platformCodes = useMemo(
    () => languages.map((l) => l.shortName),
    [languages]
  );

  const [rawSettings, setRawSettings] = useState<PropertyContentLocaleSettings>(() =>
    parseAreaContentLocaleSettings(undefined)
  );

  useEffect(() => {
    if (!country || !areaId) return;
    return onSnapshot(doc(db, 'countries', country, 'areas', areaId), (snap) => {
      setRawSettings(
        parseAreaContentLocaleSettings(
          snap.exists() ? (snap.data() as Record<string, unknown>) : undefined
        )
      );
    });
  }, [country, areaId]);

  return useMemo(
    () => resolveAreaContentLocaleSettings(rawSettings, platformCodes),
    [rawSettings, platformCodes]
  );
}
