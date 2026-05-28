import { Navigate, useLocation, useParams } from 'react-router-dom';
import { useAdminSession } from '../../context/AdminSessionContext';
import {
  canAccessPropertyId,
  isPlatformAdmin,
  pathForScope,
  type AdminScope,
} from '../../lib/adminAccess';

export function PlatformAdminOnly({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAdminSession();
  if (loading) return null;
  if (!isPlatformAdmin(profile)) {
    return <Navigate to="/properties" replace />;
  }
  return <>{children}</>;
}

export function ScopedAdminHome({ children }: { children: React.ReactNode }) {
  const { loading, scopes, activeScope, isScopedUser } = useAdminSession();
  const location = useLocation();

  if (loading) return null;

  if (isScopedUser && activeScope && activeScope.kind !== 'platform') {
    const target = pathForScope(activeScope);
    if (location.pathname === '/' || location.pathname === '/properties') {
      return <Navigate to={target} replace />;
    }
  }

  if (isScopedUser && scopes.length === 0) {
    return (
      <div className="admin-page py-16 text-center max-w-md mx-auto">
        <h2 className="text-xl font-bold text-vailo-dark font-luxury mb-2">No assignments</h2>
        <p className="text-gray-500 text-sm">
          Your account is not linked to any property or listing yet. Contact your Vailo administrator.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}

export function PropertyAccessGuard({ children }: { children: React.ReactNode }) {
  const { id: propertyId } = useParams();
  const { profile, loading, scopes } = useAdminSession();

  if (loading || !propertyId) {
    return (
      <div className="py-16 text-center text-gray-500 text-sm">Loading access…</div>
    );
  }

  if (!canAccessPropertyId(profile, propertyId, scopes)) {
    const fallback = scopes.find((s): s is Exclude<AdminScope, { kind: 'platform' }> => s.kind !== 'platform');
    if (fallback) {
      return <Navigate to={pathForScope(fallback)} replace />;
    }
    return <Navigate to="/properties" replace />;
  }

  return <>{children}</>;
}
