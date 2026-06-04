import { useCallback, useEffect, useRef, useState } from 'react';
import { Lock, KeyRound, FlaskConical } from 'lucide-react';
import GuestPortalLoadingScreen from './GuestPortalLoadingScreen';
import { httpsCallableMessage } from '../../lib/callableError';
import {
  clearGuestPortalSession,
  readGuestPortalSession,
  sessionMatchesUnit,
  writeGuestPortalSession,
  type GuestPortalSession,
} from '../../lib/guestAccess';
import {
  activateGuestOnSiteAccessCallable,
  grantAdminGuestPortalPreviewCallable,
  validateGuestPortalSession,
  verifyGuestInviteCallable,
  verifyGuestTesterCodeCallable,
} from '../../lib/guestPortalCallables';
import { useGuestLocale } from '../../context/GuestLocaleContext';

type Props = {
  propertyId: string;
  typeId: string;
  inviteToken: string | null;
  /** Opened from admin “Preview portal” — uses admin auth, not guest bypass. */
  adminPreview?: boolean;
  onSessionGranted?: (session: GuestPortalSession) => void;
  children: React.ReactNode;
};

type GatePhase = 'checking' | 'password' | 'tester' | 'denied' | 'granted';

export default function GuestPortalAccessGate({
  propertyId,
  typeId,
  inviteToken,
  adminPreview = false,
  onSessionGranted,
  children,
}: Props) {
  const { t } = useGuestLocale();
  const [phase, setPhase] = useState<GatePhase>('checking');
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [testerCode, setTesterCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [session, setSession] = useState<GuestPortalSession | null>(null);
  /** Bumps on each effect run so Strict Mode remount can finish bootstrap (dev-only double mount). */
  const bootstrapRunIdRef = useRef(0);

  const onSessionGrantedRef = useRef(onSessionGranted);
  onSessionGrantedRef.current = onSessionGranted;

  const grant = useCallback((s: GuestPortalSession) => {
    writeGuestPortalSession(s);
    setSession(s);
    onSessionGrantedRef.current?.(s);
    setPhase('granted');
    setError(null);
  }, []);

  const tryExistingSession = useCallback(async (): Promise<
    'granted' | 'absent' | 'revoked'
  > => {
    const stored = readGuestPortalSession();
    if (!stored || !sessionMatchesUnit(stored, propertyId, typeId)) {
      return 'absent';
    }
    try {
      const result = await validateGuestPortalSession(
        propertyId,
        typeId,
        stored.sessionId
      );
      if (result.valid && result.session) {
        if (adminPreview && result.session.source !== 'admin_preview') {
          return 'absent';
        }
        if (!adminPreview && result.session.source === 'admin_preview') {
          clearGuestPortalSession();
          return 'absent';
        }
        grant(result.session);
        return 'granted';
      }
      if (result.reason === 'booking_cancelled') {
        setError(
          'This reservation was cancelled. Guest portal access is no longer available.'
        );
        return 'revoked';
      }
      if (result.reason === 'expired') {
        setError('Your guest portal access has expired.');
        return 'revoked';
      }
    } catch {
      /* fall through */
    }
    clearGuestPortalSession();
    return 'absent';
  }, [adminPreview, propertyId, typeId, grant]);

  const tryOnSiteActivation = useCallback(async () => {
    const stored = readGuestPortalSession();
    try {
      const { session: s } = await activateGuestOnSiteAccessCallable(
        propertyId,
        typeId,
        stored?.sessionId
      );
      grant(s);
      return true;
    } catch (e) {
      setError(
        httpsCallableMessage(
          e,
          'Access is only available during your stay or with a valid invitation.'
        )
      );
      return false;
    }
  }, [propertyId, typeId, grant]);

  useEffect(() => {
    const runId = ++bootstrapRunIdRef.current;
    let cancelled = false;
    const stillActive = () => !cancelled && runId === bootstrapRunIdRef.current;

    (async () => {
      setPhase('checking');
      setError(null);

      if (adminPreview) {
        const adminSession = await tryExistingSession();
        if (!stillActive()) return;
        if (adminSession === 'granted' || adminSession === 'revoked') return;
        try {
          const { session: s } = await grantAdminGuestPortalPreviewCallable(
            propertyId,
            typeId
          );
          if (!stillActive()) return;
          grant(s);
        } catch (e) {
          if (!stillActive()) return;
          setError(
            httpsCallableMessage(
              e,
              'Sign in to the Vailo admin app in this browser, then open Preview again.'
            )
          );
          setPhase('denied');
        }
        return;
      }

      const existingSession = await tryExistingSession();
      if (!stillActive()) return;
      if (existingSession === 'granted') return;
      if (existingSession === 'revoked') {
        setPhase('denied');
        return;
      }

      if (inviteToken) {
        setPhase('password');
        return;
      }

      const activated = await tryOnSiteActivation();
      if (!stillActive()) return;
      if (!activated) setPhase('denied');
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- grant is stable; avoid re-bootstrap on parent UI state
  }, [adminPreview, inviteToken, propertyId, typeId, tryExistingSession, tryOnSiteActivation]);

  useEffect(() => {
    if (phase !== 'granted' || adminPreview || !session?.sessionId) return;

    const recheck = async () => {
      try {
        const result = await validateGuestPortalSession(
          propertyId,
          typeId,
          session.sessionId
        );
        if (result.valid && result.session) {
          writeGuestPortalSession(result.session);
          return;
        }
        clearGuestPortalSession();
        setSession(null);
        if (result.reason === 'booking_cancelled') {
          setError(
            'This reservation was cancelled. Guest portal access is no longer available.'
          );
        } else {
          setError('Your guest portal access is no longer valid.');
        }
        setPhase('denied');
      } catch {
        /* ignore transient network errors */
      }
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') void recheck();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [adminPreview, phase, propertyId, session?.sessionId, typeId]);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteToken || !password.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const stored = readGuestPortalSession();
      const { session: s } = await verifyGuestInviteCallable(
        propertyId,
        typeId,
        inviteToken,
        password.trim(),
        stored?.sessionId
      );
      grant(s);
    } catch (err) {
      setError(httpsCallableMessage(err, 'Invalid password. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleTesterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testerCode.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const { session: s } = await verifyGuestTesterCodeCallable(
        propertyId,
        typeId,
        testerCode.trim()
      );
      grant(s);
    } catch (err) {
      setError(httpsCallableMessage(err, 'Invalid or expired visitor access code.'));
    } finally {
      setSubmitting(false);
    }
  };

  if (phase === 'granted') {
    const showAdminPreviewBar = session?.source === 'admin_preview';
    return (
      <div className="min-h-screen flex flex-col">
        {session?.guestName && (
          <p className="sr-only">Welcome, {session.guestName}</p>
        )}
        {showAdminPreviewBar && (
          <div
            className="shrink-0 sticky top-0 z-50 bg-amber-500 text-amber-950 text-center text-xs font-semibold py-2 px-3 shadow-sm"
            role="status"
          >
            {t('adminPreviewBar')}
          </div>
        )}
        <div className="flex-1 min-h-0">{children}</div>
      </div>
    );
  }

  if (phase === 'checking') {
    return <GuestPortalLoadingScreen status={t('accessChecking')} />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-50 to-white px-4 py-10">
      <div className="w-full max-w-md bg-white rounded-2xl border border-gray-200 shadow-xl p-6">
        {phase === 'password' && (
          <>
            <div className="flex items-center gap-2 text-vailo-teal mb-1">
              <Lock size={20} />
              <h1 className="text-lg font-bold text-gray-900">{t('accessGuestTitle')}</h1>
            </div>
            <p className="text-sm text-gray-500 mb-4">{t('accessGuestSub')}</p>
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                  {t('accessInvitePassword')}
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-vailo-teal/20"
                />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 rounded-xl bg-vailo-teal text-white text-sm font-semibold hover:bg-vailo-teal-hover disabled:opacity-50"
              >
                {submitting ? t('accessVerifying') : t('accessContinue')}
              </button>
            </form>
          </>
        )}

        {phase === 'tester' && (
          <>
            <div className="flex items-center gap-2 text-vailo-teal mb-1">
              <FlaskConical size={20} />
              <h1 className="text-lg font-bold text-gray-900">{t('accessTesterTitle')}</h1>
            </div>
            <p className="text-sm text-gray-500 mb-4">{t('accessTesterSub')}</p>
            <form onSubmit={handleTesterSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                  {t('accessVisitorCode')}
                </label>
                <input
                  type="text"
                  value={testerCode}
                  onChange={(e) => setTesterCode(e.target.value.toUpperCase())}
                  autoCapitalize="characters"
                  required
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-mono tracking-widest outline-none focus:ring-2 focus:ring-vailo-teal/20"
                />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 rounded-xl bg-vailo-teal text-white text-sm font-semibold hover:bg-vailo-teal-hover disabled:opacity-50"
              >
                {submitting ? 'Checking…' : 'Enter portal'}
              </button>
            </form>
            <button
              type="button"
              onClick={() => {
                setPhase('denied');
                setError(null);
              }}
              className="mt-3 w-full text-xs text-gray-500 hover:text-gray-700"
            >
              Back
            </button>
          </>
        )}

        {phase === 'denied' && adminPreview && (
          <>
            <div className="flex items-center gap-2 text-vailo-teal mb-1">
              <KeyRound size={20} />
              <h1 className="text-lg font-bold text-gray-900">Admin preview</h1>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              Preview requires you to be signed in to the Vailo admin app in this browser.
            </p>
            {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="w-full py-2.5 rounded-xl bg-vailo-teal text-white text-sm font-semibold hover:bg-vailo-teal-hover"
            >
              Try again
            </button>
          </>
        )}

        {phase === 'denied' && !adminPreview && (
          <>
            <div className="flex items-center gap-2 text-vailo-teal mb-1">
              <KeyRound size={20} />
              <h1 className="text-lg font-bold text-gray-900">Access required</h1>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              This guest portal is only available during your stay, with an invitation link, or
              with a guest visitor access code.
            </p>
            {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
            <button
              type="button"
              onClick={() => void tryOnSiteActivation()}
              disabled={submitting}
              className="w-full py-2.5 rounded-xl border border-vailo-teal/20 text-vailo-teal text-sm font-semibold hover:bg-vailo-teal/5 mb-2"
            >
              {submitting ? 'Checking…' : 'I am staying here today'}
            </button>
            <button
              type="button"
              onClick={() => {
                setPhase('tester');
                setError(null);
              }}
              className="w-full py-2.5 rounded-xl bg-gray-100 text-gray-800 text-sm font-semibold hover:bg-gray-200"
            >
              I have a guest visitor access code
            </button>
          </>
        )}

        {phase === 'password' && (
          <button
            type="button"
            onClick={() => {
              setPhase('tester');
              setError(null);
            }}
            className="mt-4 w-full text-xs text-gray-500 hover:text-vailo-teal"
          >
            I have a guest visitor access code
          </button>
        )}
      </div>
    </div>
  );
}
