import { getGenerativeModel } from 'firebase/ai';
import { ai } from './firebase';

function extractText(response: { response: { text: () => string } }): string {
  return response.response.text().trim();
}

/** Answer a question using stored website/platform articles only. */
export async function answerWebKnowledgeQuestion(
  corpus: string,
  question: string
): Promise<string> {
  const model = getGenerativeModel(ai, { model: 'gemini-2.5-flash' });
  const prompt = `You are Vailo's internal assistant for staff questions about the Vailo website and platform.

Rules:
- Answer ONLY from the knowledge base below. Do not invent product features or policies.
- If the knowledge base is empty or does not cover the question, say clearly that the answer is not in the knowledge base yet and suggest adding an article.
- Be concise, accurate, and professional. Use bullet points when helpful.

KNOWLEDGE BASE:
${corpus || '(No articles saved yet.)'}

STAFF QUESTION:
${question.trim()}`;

  const result = await model.generateContent(prompt);
  return extractText(result);
}

/** Draft a staff training answer for a client or owner question. */
/** Plain text for the rich editor — not stored as a separate draft field. */
export async function draftClientKnowledgeAnswer(
  webCorpus: string,
  question: string,
  existingStaffAnswer?: string
): Promise<string> {
  const model = getGenerativeModel(ai, { model: 'gemini-2.5-flash' });
  const prompt = `You help Vailo hospitality staff prepare answers to questions from property owners, managers, and partners (B2B clients).

Use the platform knowledge below when relevant. You may add reasonable hospitality SaaS context, but prefer facts from the knowledge base.

${webCorpus ? `PLATFORM KNOWLEDGE:\n${webCorpus}\n` : ''}
CLIENT / PROSPECT QUESTION:
${question.trim()}
${existingStaffAnswer?.trim() ? `\nEXISTING STAFF NOTES (improve or replace):\n${existingStaffAnswer.trim()}` : ''}

Write a clear, confident answer the team can use in calls, email, or onboarding. 2–5 short paragraphs max. No markdown headings.`;

  const result = await model.generateContent(prompt);
  return extractText(result);
}
