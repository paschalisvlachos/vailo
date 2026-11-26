/**
 * Canonical Gemini model IDs for Firebase AI Logic (client).
 *
 * Prefer stable Flash for guest/admin UX. Avoid hard-coding retired IDs:
 * - gemini-2.5-flash shut down on Vertex/Agent Platform (2026-10-20)
 * - gemini-3.6-flash shut down on Agent Platform (2026-11-19)
 * - gemini-3.5-flash is deprecated (Developer API routes to 3.6)
 */
export const VAILO_GEMINI_FLASH = 'gemini-3.8-flash';

/** Guest Ask Vailo + Live Like a Local concierge chat. */
export const GUEST_CHAT_GEMINI_MODEL = VAILO_GEMINI_FLASH;
