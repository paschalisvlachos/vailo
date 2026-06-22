import { useNavigate } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { useAdminSession, useAdminSessionNavigate } from '../../context/AdminSessionContext';
import { scopeKey, type AdminScope, formatOwnerRoleLabel } from '../../lib/adminAccess';

export default function AdminScopeBar() {
  const { scopes, activeScope, profile, isScopedUser } = useAdminSession();
  const navigateToScope = useAdminSessionNavigate();
  const navigate = useNavigate();

  if (!isScopedUser || !activeScope || activeScope.kind === 'platform') {
    return null;
  }

  if (scopes.length <= 1) {
    return (
      <div className="mb-6 flex flex-wrap items-center gap-2 rounded-xl border border-vailo-teal/15 bg-vailo-teal/5 px-4 py-3">
        <p className="text-sm text-vailo-dark">
          <span className="font-semibold">{profile?.fullName}</span>
          <span className="text-gray-500"> · {activeScope.label}</span>
        </p>
      </div>
    );
  }

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const key = e.target.value;
    const scope = scopes.find((s) => scopeKey(s) === key);
    if (!scope) return;
    const path = navigateToScope(scope);
    navigate(path);
  };

  return (
    <div className="mb-6 rounded-xl border border-vailo-teal/15 bg-white shadow-sm px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-0.5">
          Your assignments
        </p>
        <p className="text-sm text-gray-600">
          Signed in as <span className="font-semibold text-vailo-dark">{profile?.fullName}</span>
          {profile?.role && (
            <span className="text-gray-400"> ({formatOwnerRoleLabel(profile.role)})</span>
          )}
        </p>
      </div>
      <label className="flex items-center gap-2 shrink-0 w-full sm:w-auto sm:min-w-[280px]">
        <span className="text-xs font-semibold text-gray-500 whitespace-nowrap">Switch to</span>
        <div className="relative flex-1">
          <select
            value={scopeKey(activeScope)}
            onChange={handleChange}
            className="w-full appearance-none rounded-lg border border-gray-200 bg-vailo-surface-elevated pl-3 pr-9 py-2.5 text-sm font-medium text-vailo-dark outline-none focus:ring-2 focus:ring-vailo-teal/20 focus:border-vailo-teal/40"
          >
            {scopes.map((scope: AdminScope) => (
              <option key={scopeKey(scope)} value={scopeKey(scope)}>
                {scope.kind === 'platform' ? 'All properties' : scope.label}
              </option>
            ))}
          </select>
          <ChevronDown
            size={16}
            className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400"
          />
        </div>
      </label>
    </div>
  );
}
