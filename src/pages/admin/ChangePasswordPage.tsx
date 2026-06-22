import { useEffect, useState } from 'react';
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  signOut,
} from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { Lock, AlertCircle } from 'lucide-react';
import { auth, db } from '../../lib/firebase';
import { useAdminSession } from '../../context/AdminSessionContext';
import { useToast } from '../../context/ToastContext';
import AdminPageHeader, {
  AdminAlert,
  AdminButton,
  AdminCard,
  AdminInput,
  AdminLabel,
} from '../../components/admin/AdminPageHeader';

const MIN_PASSWORD_LENGTH = 8;

function authErrorMessage(error: unknown): string {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code?: string }).code)
      : '';
  if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
    return 'Current password is incorrect.';
  }
  if (code === 'auth/weak-password') {
    return `Choose a stronger password (at least ${MIN_PASSWORD_LENGTH} characters).`;
  }
  if (code === 'auth/requires-recent-login') {
    return 'For security, sign out and sign in again, then change your password.';
  }
  if (code === 'auth/too-many-requests') {
    return 'Too many attempts. Wait a moment and try again.';
  }
  return 'Could not update your password. Please try again.';
}

export default function ChangePasswordPage() {
  const { authUser, profile } = useAdminSession();
  const toast = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [logoutCountdown, setLogoutCountdown] = useState<number | null>(null);

  useEffect(() => {
    if (logoutCountdown === null) return;
    if (logoutCountdown <= 0) {
      void signOut(auth);
      return;
    }
    const id = window.setTimeout(() => {
      setLogoutCountdown((value) => (value === null ? null : value - 1));
    }, 1000);
    return () => clearTimeout(id);
  }, [logoutCountdown]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!authUser?.email) {
      setError('Your account does not support password changes here.');
      return;
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(`New password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }
    if (newPassword === currentPassword) {
      setError('New password must be different from your current password.');
      return;
    }

    setIsSubmitting(true);
    try {
      const credential = EmailAuthProvider.credential(authUser.email, currentPassword);
      await reauthenticateWithCredential(authUser, credential);
      await updatePassword(authUser, newPassword);

      if (profile?.id) {
        await updateDoc(doc(db, 'owners', profile.id), {
          password: newPassword,
          updatedAt: new Date().toISOString(),
        });
      }

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.success('Password updated successfully.');
      setLogoutCountdown(5);
    } catch (err) {
      console.error('Change password failed:', err);
      setError(authErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {logoutCountdown !== null && logoutCountdown > 0 && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-vailo-dark/70 backdrop-blur-sm px-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 px-8 py-10 sm:px-12 sm:py-12 text-center max-w-sm w-full">
            <p className="text-sm font-semibold uppercase tracking-wider text-gray-400 mb-3">
              Password saved
            </p>
            <p className="text-5xl sm:text-6xl font-bold text-vailo-teal tabular-nums mb-3">
              {logoutCountdown}
            </p>
            <p className="text-gray-600 text-sm">
              Signing you out in {logoutCountdown} second{logoutCountdown === 1 ? '' : 's'}…
            </p>
            <p className="text-gray-400 text-xs mt-4">Sign in again with your new password.</p>
          </div>
        </div>
      )}

      <div className="admin-page max-w-xl">
        <AdminPageHeader
          title="Change password"
          description="Update your Vailo Admin login password."
          icon={<Lock size={26} />}
        />

        <AdminAlert variant="info" icon={<AlertCircle size={18} />} className="mb-6">
          Forgot your password? Contact Vailo at{' '}
          <a href="mailto:contact@vailo.app" className="font-semibold text-vailo-teal underline">
            contact@vailo.app
          </a>{' '}
          — we cannot reset it from this screen.
        </AdminAlert>

        <AdminCard className="p-6 sm:p-8">
          <form className="space-y-5" onSubmit={handleSubmit}>
            {error && (
              <AdminAlert variant="warning" icon={<AlertCircle size={18} />}>
                {error}
              </AdminAlert>
            )}

            <div>
              <AdminLabel htmlFor="currentPassword">Current password *</AdminLabel>
              <AdminInput
                id="currentPassword"
                type="password"
                required
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                disabled={isSubmitting || logoutCountdown !== null}
              />
            </div>

            <div>
              <AdminLabel htmlFor="newPassword">New password *</AdminLabel>
              <AdminInput
                id="newPassword"
                type="password"
                required
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={isSubmitting || logoutCountdown !== null}
                placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
              />
            </div>

            <div>
              <AdminLabel htmlFor="confirmPassword">Confirm new password *</AdminLabel>
              <AdminInput
                id="confirmPassword"
                type="password"
                required
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={isSubmitting || logoutCountdown !== null}
              />
            </div>

            <AdminButton
              type="submit"
              disabled={isSubmitting || logoutCountdown !== null}
              className="w-full sm:w-auto"
            >
              {isSubmitting ? 'Saving…' : 'Save new password'}
            </AdminButton>
          </form>
        </AdminCard>
      </div>
    </>
  );
}
