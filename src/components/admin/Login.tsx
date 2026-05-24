import { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../../lib/firebase';
import { Mail, Lock, ArrowRight, AlertCircle } from 'lucide-react';
import { AdminAlert, AdminButton, AdminInput, AdminLabel } from './AdminPageHeader';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch {
      setError('Invalid email or password. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-vailo-dark via-vailo-teal to-vailo-teal-hover flex flex-col justify-center py-10 px-4 sm:px-6">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center mb-8">
        <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-vailo-gold/30 to-vailo-gold/10 border border-vailo-gold/30 mb-5 shadow-lg shadow-vailo-dark/20">
          <span className="text-2xl font-bold text-vailo-gold font-luxury">V</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight font-luxury">Vailo Admin</h1>
        <p className="mt-2 text-sm text-white/55">Sign in to manage properties and guest experiences</p>
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white/95 backdrop-blur-xl py-8 px-5 sm:px-10 rounded-2xl shadow-2xl border border-white/20">
          <form className="space-y-5" onSubmit={handleSubmit}>
            {error && (
              <AdminAlert variant="warning" icon={<AlertCircle size={18} />}>
                {error}
              </AdminAlert>
            )}

            <div>
              <AdminLabel htmlFor="email">Email</AdminLabel>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <AdminInput
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10"
                  placeholder="admin@vailo.com"
                />
              </div>
            </div>

            <div>
              <AdminLabel htmlFor="password">Password</AdminLabel>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <AdminInput
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <AdminButton type="submit" disabled={isLoading} className="w-full py-3 shadow-lg shadow-vailo-teal/25">
              {isLoading ? 'Signing in…' : 'Sign in'}
              {!isLoading && <ArrowRight className="h-4 w-4" />}
            </AdminButton>
          </form>
        </div>
      </div>
    </div>
  );
}
