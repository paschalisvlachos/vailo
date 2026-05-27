export const WEB_KNOWLEDGE_COLLECTION = 'knowledgeWebEntries';
export const CLIENT_KNOWLEDGE_COLLECTION = 'knowledgeClientQuestions';

export type WebKnowledgeEntry = {
  id: string;
  title: string;
  content: string;
  updatedAt?: string;
};

export type ClientKnowledgeEntry = {
  id: string;
  question: string;
  /** Staff-approved answer for training (HTML from rich editor). */
  staffAnswer: string;
  status: 'draft' | 'ready';
  createdAt?: string;
  updatedAt?: string;
};

export function buildWebKnowledgeCorpus(entries: WebKnowledgeEntry[], maxChars = 14000): string {
  const parts = entries
    .filter((e) => e.title.trim() || e.content.trim())
    .map((e) => `## ${e.title.trim() || 'Untitled'}\n${e.content.trim()}`);
  let text = parts.join('\n\n');
  if (text.length > maxChars) {
    text = `${text.slice(0, maxChars)}\n\n[…truncated for AI context]`;
  }
  return text;
}
