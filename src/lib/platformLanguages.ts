export const PLATFORM_SETTINGS_DOC = 'platformSettings/settings';

export type PlatformLanguage = {
  id: string;
  title: string;
  shortName: string;
};

export const DEFAULT_PLATFORM_LANGUAGES: PlatformLanguage[] = [
  { id: 'lang-en', title: 'English', shortName: 'en' },
  { id: 'lang-el', title: 'Greek', shortName: 'el' },
  { id: 'lang-de', title: 'German', shortName: 'de' },
  { id: 'lang-fr', title: 'French', shortName: 'fr' },
  { id: 'lang-italian', title: 'Italian', shortName: 'it' },
];

export function createLanguageId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `lang_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function normalizeShortName(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 12);
}

export function parsePlatformLanguages(data: Record<string, unknown> | undefined): PlatformLanguage[] {
  if (!data || !Array.isArray(data.languages)) return [...DEFAULT_PLATFORM_LANGUAGES];
  const parsed = (data.languages as unknown[])
    .map((row) => {
      if (!row || typeof row !== 'object') return null;
      const r = row as Record<string, unknown>;
      const id = typeof r.id === 'string' ? r.id : '';
      const title = typeof r.title === 'string' ? r.title.trim() : '';
      const shortName = normalizeShortName(typeof r.shortName === 'string' ? r.shortName : '');
      if (!id || !title || !shortName) return null;
      return { id, title, shortName };
    })
    .filter((l): l is PlatformLanguage => l !== null);

  const seen = new Set<string>();
  const unique: PlatformLanguage[] = [];
  for (const lang of parsed) {
    if (seen.has(lang.shortName)) continue;
    seen.add(lang.shortName);
    unique.push(lang);
  }
  return unique.length > 0 ? unique : [...DEFAULT_PLATFORM_LANGUAGES];
}

export function toGuestLocaleOptions(languages: PlatformLanguage[]) {
  return languages.map((lang) => ({
    code: lang.shortName,
    label: lang.title,
    nativeLabel: lang.shortName.toUpperCase(),
  }));
}
