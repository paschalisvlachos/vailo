import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../../lib/firebase';
import { normalizeAdminEmail } from '../../lib/adminAccess';
import { adminPath } from '../../lib/adminRoutes';
import { AlertCircle, Check } from 'lucide-react';
import VailoMark from '../guest/VailoMark';
import { AdminAlert, AdminButton, AdminInput, AdminLabel } from './AdminPageHeader';

function loginErrorMessage(error: unknown): string {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code?: string }).code)
      : '';
  if (code === 'auth/user-disabled') {
    return 'This account has been deactivated. Contact your administrator.';
  }
  if (code === 'auth/too-many-requests') {
    return 'Too many failed attempts. Wait a few minutes and try again.';
  }
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
    return 'Invalid email or password. If an admin recently reset your access, use the new password they set in Owners CRM (Firebase login), not an old note.';
  }
  if (code === 'auth/invalid-email') {
    return 'Enter a valid email address.';
  }
  return 'Could not sign in. Please try again.';
}

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    const normalizedEmail = normalizeAdminEmail(email);
    if (!normalizedEmail) {
      setError('Enter a valid email address.');
      setIsLoading(false);
      return;
    }

    try {
      await signInWithEmailAndPassword(auth, normalizedEmail, password);
      // Always land on Properties after login (avoids staying on the previous URL, e.g. Owners).
      navigate(adminPath('/properties'), { replace: true });
    } catch (err) {
      setError(loginErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="admin-auth min-h-screen flex items-center justify-center py-10 px-4 bg-[#f5f6f8]">
      <div className="w-full max-w-3xl grid grid-cols-1 md:grid-cols-2 bg-white overflow-hidden rounded-lg border border-[#e1e1e1] shadow-[0_10px_10px_0_rgba(0,0,0,0.08)]">
        <div className="relative min-h-[220px] md:min-h-full bg-[#08141e] p-8 md:p-10 flex flex-col justify-between text-white">
          <div>
            <div className="h-12 w-12 rounded-md bg-[#2ec4b6]/20 flex items-center justify-center p-2 mb-6">
              <VailoMark className="h-full w-full object-contain" alt="Vailo" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-4">Welcome back</h2>
            <p className="text-white/70 text-sm leading-relaxed">
              Sign in to manage properties, guest experiences, and hospitality operations.
            </p>
          </div>
          <ul className="mt-8 flex flex-wrap gap-4 text-xs text-white/55">
            <li>Hospitality management</li>
            <li>Guest portal</li>
            <li>Arrange &amp; Book</li>
          </ul>
        </div>

        <div className="p-8 md:p-10">
          <h3 className="text-xl font-bold text-vailo-dark mb-6">Sign in</h3>
          <form className="space-y-5" onSubmit={handleSubmit}>
            {error && (
              <AdminAlert variant="warning" icon={<AlertCircle size={18} />}>
                {error}
              </AdminAlert>
            )}

            <div>
              <AdminLabel htmlFor="email">Email*</AdminLabel>
              <AdminInput
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="User name"
                autoComplete="username"
              />
            </div>

            <div>
              <AdminLabel htmlFor="password">Password*</AdminLabel>
              <AdminInput
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                autoComplete="current-password"
              />
            </div>

            <AdminButton type="submit" disabled={isLoading} className="w-full">
              <span>{isLoading ? 'Signing in…' : 'Log in'}</span>
              {!isLoading && <Check className="h-4 w-4" />}
            </AdminButton>
          </form>
        </div>
      </div>
    </div>
  );
}
