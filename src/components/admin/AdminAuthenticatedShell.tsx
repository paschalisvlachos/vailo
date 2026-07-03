import { Outlet } from 'react-router-dom';
import type { User } from 'firebase/auth';
import Layout from './Layout';
import Login from './Login';
import { AdminSessionProvider, useAdminSession } from '../../context/AdminSessionContext';

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

/** Single admin shell — keeps session + layout mounted across admin route changes. */
export default function AdminAuthenticatedShell({ user }: { user: User | null }) {
  if (!user) return <Login />;

  return (
    <AdminSessionProvider>
      <AdminSessionGate>
        <Layout>
          <Outlet />
        </Layout>
      </AdminSessionGate>
    </AdminSessionProvider>
  );
}
