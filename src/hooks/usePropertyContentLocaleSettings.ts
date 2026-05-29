import { useMemo } from 'react';
import { usePlatformLanguages } from './usePlatformLanguages';
import {
  clampContentLocalesToPlatform,
  parsePropertyContentLocaleSettings,
  type PropertyContentLocaleSettings,
} from '../lib/propertyContentLocales';

/** Property content locales intersected with current admin platform languages. */
export function usePropertyContentLocaleSettings(
  property: Record<string, unknown> | null | undefined
): PropertyContentLocaleSettings {
  const { languages } = usePlatformLanguages();
  const platformCodes = useMemo(
    () => languages.map((l) => l.shortName),
    [languages]
  );

  return useMemo(() => {
    const parsed = parsePropertyContentLocaleSettings(property);
    return clampContentLocalesToPlatform(parsed, platformCodes);
  }, [property, platformCodes]);
}
