/** User-facing message from a Firebase httpsCallable failure. */
export function httpsCallableMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object') {
    const err = error as { message?: string; code?: string };
    const msg = String(err.message || '').trim();
    const code = String(err.code || '');

    const appCheckFailure =
      msg.includes('App not registered') ||
      msg.includes('App attestation failed') ||
      msg.toLowerCase().includes('app check') ||
      (code === 'functions/failed-precondition' &&
        (msg.toLowerCase().includes('app check') || msg.includes('app attestation')));

    if (appCheckFailure) {
      if (import.meta.env.DEV) {
        return (
          'Firebase App Check blocked this request. Restart the dev server — App Check is skipped ' +
          'locally by default. To test App Check locally, set VITE_ENABLE_APP_CHECK=true and add a ' +
          'debug token under Firebase Console → App Check → Manage debug tokens.'
        );
      }
      return (
        'Firebase App Check blocked this request. Register the web app under Firebase Console → ' +
        'App Check (reCAPTCHA Enterprise) and allow your domain in the reCAPTCHA key settings.'
      );
    }

    if (code === 'functions/permission-denied') {
      return msg || 'You do not have permission for this action.';
    }

    if (code === 'functions/unauthenticated') {
      return msg || 'Sign in again to continue.';
    }

    if (code === 'functions/internal' || msg === 'INTERNAL' || msg === 'internal') {
      if (msg && msg !== 'INTERNAL' && msg !== 'internal') return msg;
      return fallback;
    }

    if (msg && msg !== 'INTERNAL' && msg !== 'internal') return msg;
  }
  return fallback;
}
