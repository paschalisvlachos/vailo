/** Shared AI language rules for guest-facing Gemini prompts. */

const LOCALE_LABELS: Record<string, string> = {
  en: 'English',
  el: 'Greek',
  de: 'German',
  fr: 'French',
  it: 'Italian',
};

export function guestLocaleDisplayName(code: string): string {
  const c = String(code || '').trim().toLowerCase();
  return LOCALE_LABELS[c] || c.toUpperCase() || 'English';
}

export function guestAiLanguageBlock(locale: string): string {
  const label = guestLocaleDisplayName(locale);
  const code = String(locale || 'en').trim().toLowerCase() || 'en';
  return `LANGUAGE
- Default UI language: ${label} (BCP-47 code: ${code}).
- Always reply in the same language as the guest's latest message.
- If the message language is unclear or mixed, use ${label}.
- Do not switch to English unless the guest writes in English.
- For JSON fields meant for the guest (replyText, title, description, categoryName, etc.), use that same language.`;
}
