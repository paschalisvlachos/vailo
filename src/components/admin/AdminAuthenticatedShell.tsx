import { Outlet } from 'react-router-dom';
import { signOut, type User } from 'firebase/auth';
import { LogOut } from 'lucide-react';
import Layout from './Layout';
import Login from './Login';
import { auth } from '../../lib/firebase';
import { AdminSessionProvider, useAdminSession } from '../../context/AdminSessionContext';
import { AdminButton } from './AdminPageHeader';

function AdminSessionGate({ children }: { children: React.ReactNode }) {
  const { loading } = useAdminSession();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-vailo-surface text-vailo-teal text-sm font-medium">
        Loading your access…
      </div>
    );
  }
  return <>{children}</>;
}

function AdminAccountGate({ children }: { children: React.ReactNode }) {
  const { authUser, profile } = useAdminSession();

  if (authUser && !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-vailo-surface px-4">
        <div className="max-w-md w-full bg-white border border-gray-100 rounded-2xl shadow-lg p-8 text-center">
          <h2 className="text-xl font-bold text-vailo-dark font-luxury mb-2">Account not set up</h2>
          <p className="text-gray-500 text-sm mb-6">
            Your login is not linked to a Vailo profile. Ask your administrator to add your email in
            Owners CRM, then sign in again.
          </p>
          <AdminButton
            type="button"
            variant="secondary"
            onClick={() => void signOut(auth)}
            className="inline-flex items-center gap-2"
          >
            <LogOut size={16} />
            Sign out
          </AdminButton>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

/** Single admin shell — keeps session + layout mounted across admin route changes. */
export default function AdminAuthenticatedShell({ user }: { user: User | null }) {
  if (!user) return <Login />;

  return (
    <AdminSessionProvider>
      <AdminSessionGate>
        <AdminAccountGate>
          <Layout>
            <Outlet />
          </Layout>
        </AdminAccountGate>
      </AdminSessionGate>
    </AdminSessionProvider>
  );
}
