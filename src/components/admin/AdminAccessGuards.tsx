import { Navigate, useLocation, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAdminSession } from '../../context/AdminSessionContext';
import {
  canAccessExcursionProviderId,
  canAccessPropertyId,
  pathForExcursionProviderLanding,
  pathForScope,
  type AdminScope,
} from '../../lib/adminAccess';
import { adminPath, ADMIN_BASE } from '../../lib/adminRoutes';

export function PlatformAdminOnly({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAdminSession();
  if (loading) {
    return (
      <div className="py-16 flex items-center justify-center text-gray-500 text-sm">
        <Loader2 className="animate-spin mr-2 text-vailo-teal" />
        Loading…
      </div>
    );
  }
  if (!profile) {
    return (
      <div className="admin-page py-16 text-center max-w-md mx-auto">
        <h2 className="text-xl font-bold text-vailo-dark font-luxury mb-2">Account not set up</h2>
        <p className="text-gray-500 text-sm">
          Your login is not linked to a Vailo profile. Ask your administrator to add your email in
          Owners CRM.
        </p>
      </div>
    );
  }
  if (profile.role !== 'admin') {
    if (profile.role === 'excursion_provider') {
      return <Navigate to={adminPath('/excursion-portal')} replace />;
    }
    return <Navigate to={adminPath('/properties')} replace />;
  }
  return <>{children}</>;
}

export function ExcursionPortalGuard({ children }: { children: React.ReactNode }) {
  const { profile, loading, isPlatformAdmin } = useAdminSession();
  if (loading) {
    return (
      <div className="py-16 flex items-center justify-center text-gray-500 text-sm">
        <Loader2 className="animate-spin mr-2 text-vailo-teal" />
        Loading…
      </div>
    );
  }
  if (!profile) {
    return (
      <div className="admin-page py-16 text-center max-w-md mx-auto">
        <h2 className="text-xl font-bold text-vailo-dark font-luxury mb-2">Account not set up</h2>
        <p className="text-gray-500 text-sm">
          Your login is not linked to a Vailo profile. Ask your administrator to add your email in
          Owners CRM.
        </p>
      </div>
    );
  }
  if (isPlatformAdmin) {
    return <Navigate to={adminPath('/excursions/providers')} replace />;
  }
  if (profile?.role !== 'excursion_provider') {
    return <Navigate to={adminPath('/properties')} replace />;
  }
  return <>{children}</>;
}

export function ExcursionProviderAccessGuard({ children }: { children: React.ReactNode }) {
  const { providerId } = useParams();
  const { profile, loading, scopes } = useAdminSession();

  if (loading || !providerId) {
    return (
      <div className="py-16 text-center text-gray-500 text-sm">Loading access…</div>
    );
  }

  if (!canAccessExcursionProviderId(profile, providerId, scopes)) {
    const fallback = scopes.find((s) => s.kind === 'excursion_provider');
    if (fallback) {
      return <Navigate to={pathForScope(fallback)} replace />;
    }
    return <Navigate to={adminPath('/excursion-portal')} replace />;
  }

  return <>{children}</>;
}

export function ScopedAdminHome({ children }: { children: React.ReactNode }) {
  const { loading, scopes, activeScope, isScopedUser, profile, authUser } = useAdminSession();
  const location = useLocation();

  if (loading) {
    return (
      <div className="py-16 flex items-center justify-center text-gray-500 text-sm">
        <Loader2 className="animate-spin mr-2 text-vailo-teal" />
        Loading…
      </div>
    );
  }

  if (authUser && !profile) {
    return (
      <div className="admin-page py-16 text-center max-w-md mx-auto">
        <h2 className="text-xl font-bold text-vailo-dark font-luxury mb-2">Account not set up</h2>
        <p className="text-gray-500 text-sm">
          Your login is not linked to a Vailo profile. Ask your administrator to add your email in
          Owners CRM.
        </p>
      </div>
    );
  }

  if (profile?.role === 'excursion_provider') {
    const onPortalHome =
      location.pathname === adminPath('/excursion-portal') ||
      location.pathname.startsWith(`${adminPath('/excursion-portal')}/`);
    if (!onPortalHome) {
      return <Navigate to={pathForExcursionProviderLanding(scopes)} replace />;
    }
  }

  if (isScopedUser && activeScope && activeScope.kind !== 'platform') {
    const target = pathForScope(activeScope);
    if (location.pathname === ADMIN_BASE || location.pathname === adminPath('/properties')) {
      return <Navigate to={target} replace />;
    }
  }

  if (isScopedUser && scopes.length === 0) {
    const isProvider = profile?.role === 'excursion_provider';
    return (
      <div className="admin-page py-16 text-center max-w-md mx-auto">
        <h2 className="text-xl font-bold text-vailo-dark font-luxury mb-2">No assignments</h2>
        <p className="text-gray-500 text-sm">
          {isProvider
            ? 'Your account is not linked to an excursion business yet. Contact your Vailo administrator.'
            : 'Your account is not assigned to any property or listing yet. Contact your Vailo administrator.'}
        </p>
      </div>
    );
  }

  return <>{children}</>;
}

/** Platform admin full CRM, or agent managing their own owner list. */
export function AgentOwnersGuard({ children }: { children: React.ReactNode }) {
  const { profile, loading, isPlatformAdmin, isAgent } = useAdminSession();

  if (loading) {
    return (
      <div className="py-16 flex items-center justify-center text-gray-500 text-sm">
        <Loader2 className="animate-spin mr-2 text-vailo-teal" />
        Loading…
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="admin-page py-16 text-center max-w-md mx-auto">
        <h2 className="text-xl font-bold text-vailo-dark font-luxury mb-2">Account not set up</h2>
        <p className="text-gray-500 text-sm">
          Your login is not linked to a Vailo profile. Ask your administrator to add your email in
          Owners CRM.
        </p>
      </div>
    );
  }

  if (!isPlatformAdmin && !isAgent) {
    return <Navigate to={adminPath('/properties')} replace />;
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
    return <Navigate to={adminPath('/properties')} replace />;
  }

  return <>{children}</>;
}
