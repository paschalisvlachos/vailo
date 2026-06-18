import { Link, Navigate } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { useAdminSession } from '../../../context/AdminSessionContext';
import { adminPath } from '../../../lib/adminRoutes';
import { pathForScope } from '../../../lib/adminAccess';
import AdminPageHeader, {
  AdminCard,
  AdminEmptyState,
} from '../../../components/admin/AdminPageHeader';

export default function ExcursionProviderPortalHome() {
  const { scopes, loading, profile } = useAdminSession();

  const providerScopes = scopes.filter((s) => s.kind === 'excursion_provider');

  if (loading) {
    return <div className="py-16 text-center text-gray-500 text-sm">Loading portal…</div>;
  }

  if (providerScopes.length === 1) {
    return <Navigate to={pathForScope(providerScopes[0])} replace />;
  }

  if (providerScopes.length === 0) {
    return (
      <div className="admin-page">
        <AdminEmptyState
          icon={<Compass size={32} />}
          title="No excursion business linked"
          description={`Your account (${profile?.email || 'signed in'}) is not linked to an excursion provider yet. Ask your Vailo administrator to link you from the provider settings.`}
        />
      </div>
    );
  }

  return (
    <div className="admin-page">
      <AdminPageHeader
        title="Excursion portal"
        description="Choose which business to manage"
        icon={<Compass size={26} />}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {providerScopes.map((scope) => {
          if (scope.kind !== 'excursion_provider') return null;
          return (
            <Link key={scope.providerId} to={adminPath(`/excursion-portal/${scope.providerId}`)}>
              <AdminCard className="p-5 hover:border-vailo-teal/25 hover:shadow-md transition-all h-full">
                <p className="font-bold text-vailo-dark font-luxury text-lg">{scope.providerName}</p>
                <p className="text-sm text-gray-500 mt-1">Manage profile, regions, and contact details</p>
              </AdminCard>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
