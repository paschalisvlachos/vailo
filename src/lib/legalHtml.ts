import DOMPurify from 'dompurify';

const LEGAL_ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'ul',
  'ol',
  'li',
  'h2',
  'h3',
  'a',
  'blockquote',
];

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Browsers use div/span in contentEditable; normalize before sanitize so text is not dropped. */
function normalizeEditorHtml(html: string): string {
  return html
    .replace(/<div(\s[^>]*)?>/gi, '<p$1>')
    .replace(/<\/div>/gi, '</p>')
    .replace(/<span(\s[^>]*)?>/gi, '')
    .replace(/<\/span>/gi, '');
}

/** Safe HTML for guest display and editor load. */
export function sanitizeLegalHtml(html: string): string {
  const normalized = normalizeEditorHtml(html);
  return DOMPurify.sanitize(normalized, {
    ALLOWED_TAGS: LEGAL_ALLOWED_TAGS,
    ALLOWED_ATTR: ['href', 'target', 'rel'],
  });
}

/** Converts legacy plain-text documents to HTML for the rich editor. */
export function normalizeLegalContentForEditor(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) return '';
  if (/<[a-z][\s\S]*>/i.test(trimmed)) return sanitizeLegalHtml(trimmed);
  return trimmed
    .split(/\n\n+/)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

export function legalContentIsEmpty(html: string): boolean {
  const stripped = sanitizeLegalHtml(html)
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .trim();
  return !stripped;
}

export function legalPlainTextLength(html: string): number {
  return sanitizeLegalHtml(html)
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .trim().length;
}
