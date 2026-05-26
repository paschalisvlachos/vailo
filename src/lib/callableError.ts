/** User-facing message from a Firebase httpsCallable failure. */
export function httpsCallableMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const msg = String((error as { message: string }).message).trim();
    if (msg && msg !== 'INTERNAL' && msg !== 'internal') return msg;
  }
  return fallback;
}
