export function languageTitleForCode(
  code: string,
  languages: { shortName: string; title: string }[]
): string {
  const hit = languages.find((l) => l.shortName === code);
  return hit ? `${hit.title} (${hit.shortName})` : code;
}
