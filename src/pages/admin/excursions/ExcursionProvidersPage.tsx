import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getCountFromServer,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { Compass, Plus, Pencil, Trash2 } from 'lucide-react';
import { db } from '../../../lib/firebase';
import { loadCountryNames } from '../../../lib/countryNames';
import { useToast } from '../../../context/ToastContext';
import { adminPath } from '../../../lib/adminRoutes';
import {
  EXCURSION_PROVIDER_COLLECTION,
  EXCURSION_SUBCOLLECTION,
  excursionProviderStatusLabel,
  formatOperatingRegionsSummary,
  normalizeOperatingRegions,
  providerOperatesInCountry,
  uniqueCountriesFromRegions,
  type ExcursionProvider,
  type ExcursionProviderStatus,
} from '../../../lib/excursionProvider';
import { formatCurrencyAmount } from '../../../lib/excursion';
import { adminExcursionsListPath } from '../../../lib/excursion';
import AdminPageHeader, {
  AdminButtonLink,
  AdminCard,
  AdminEmptyState,
  AdminLabel,
  AdminSelect,
} from '../../../components/admin/AdminPageHeader';

function StatusBadge({ status }: { status: ExcursionProviderStatus }) {
  const styles: Record<ExcursionProviderStatus, string> = {
    active: 'bg-emerald-50 text-emerald-800 border-emerald-100',
    draft: 'bg-gray-50 text-gray-700 border-gray-200',
    suspended: 'bg-red-50 text-red-800 border-red-100',
  };
  return (
    <span
      className={`px-2.5 py-1 text-xs font-semibold rounded-full border ${styles[status]}`}
    >
      {excursionProviderStatusLabel(status)}
    </span>
  );
}

export default function ExcursionProvidersPage() {
  const toast = useToast();
  const [providers, setProviders] = useState<ExcursionProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [countries, setCountries] = useState<string[]>([]);
  const [filterCountry, setFilterCountry] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [excursionCounts, setExcursionCounts] = useState<Record<string, number>>({});
  const [portalUsersById, setPortalUsersById] = useState<
    Record<string, { fullName: string; email: string }>
  >({});
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    loadCountryNames()
      .then(setCountries)
      .catch(console.error);
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, EXCURSION_PROVIDER_COLLECTION),
      (snapshot) => {
        setProviders(
          snapshot.docs.map((d) => {
            const data = d.data();
            const operatingRegions = normalizeOperatingRegions(data);
            return {
              id: d.id,
              ...data,
              operatingRegions,
              countries: Array.isArray(data.countries)
                ? data.countries
                : uniqueCountriesFromRegions(operatingRegions),
            } as ExcursionProvider;
          })
        );
        setLoading(false);
      },
      () => {
        toast.error('Failed to load excursion providers.');
        setLoading(false);
      }
    );
    return () => unsub();
  }, [toast]);

  useEffect(() => {
    const q = query(collection(db, 'owners'), where('role', '==', 'excursion_provider'));
    const unsub = onSnapshot(q, (snapshot) => {
      const map: Record<string, { fullName: string; email: string }> = {};
      snapshot.docs.forEach((d) => {
        map[d.id] = {
          fullName: String(d.data().fullName || ''),
          email: String(d.data().email || ''),
        };
      });
      setPortalUsersById(map);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collectionGroup(db, EXCURSION_SUBCOLLECTION), (snapshot) => {
      const counts: Record<string, number> = {};
      snapshot.docs.forEach((d) => {
        const providerId = d.ref.parent.parent?.id;
        if (!providerId) return;
        counts[providerId] = (counts[providerId] || 0) + 1;
      });
      setExcursionCounts(counts);
    });
    return () => unsub();
  }, []);

  const filtered = useMemo(() => {
    return providers
      .filter((p) => providerOperatesInCountry(p, filterCountry))
      .filter((p) => !filterStatus || p.status === filterStatus)
      .sort((a, b) => (a.businessName || '').localeCompare(b.businessName || ''));
  }, [providers, filterCountry, filterStatus]);

  const handleDelete = async (provider: ExcursionProvider) => {
    const providerId = provider.id;
    if (!providerId) return;

    const linkedCount = excursionCounts[providerId] || 0;
    if (linkedCount > 0) {
      toast.error(
        `Cannot delete "${provider.businessName}" — ${linkedCount} excursion${linkedCount !== 1 ? 's are' : ' is'} still linked. Remove all excursions first.`
      );
      return;
    }

    if (
      !window.confirm(
        `Delete "${provider.businessName}"? This cannot be undone.`
      )
    ) {
      return;
    }

    setDeletingId(providerId);
    try {
      const countSnap = await getCountFromServer(
        collection(db, EXCURSION_PROVIDER_COLLECTION, providerId, EXCURSION_SUBCOLLECTION)
      );
      if (countSnap.data().count > 0) {
        toast.error(
          `Cannot delete "${provider.businessName}" — excursions were added since the list loaded. Remove all excursions first.`
        );
        return;
      }

      await deleteDoc(doc(db, EXCURSION_PROVIDER_COLLECTION, providerId));
      toast.success('Provider deleted.');
    } catch (error) {
      console.error(error);
      toast.error('Failed to delete provider.');
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return <div className="py-16 text-center text-gray-500 text-sm">Loading providers…</div>;
  }

  return (
    <div className="admin-page">
      <AdminPageHeader
        title="Excursion Providers"
        description="Manage tour operators and excursion businesses by area. Commission and contract fields are admin-only."
        icon={<Compass size={26} />}
        action={
          <AdminButtonLink to={adminPath('/excursions/providers/add')} className="w-full sm:w-auto">
            <Plus size={18} /> Add Provider
          </AdminButtonLink>
        }
      />

      <AdminCard className="p-4 sm:p-5 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <AdminLabel htmlFor="filterCountry">Filter by country</AdminLabel>
            <AdminSelect
              id="filterCountry"
              value={filterCountry}
              onChange={(e) => setFilterCountry(e.target.value)}
            >
              <option value="">All countries</option>
              {countries.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </AdminSelect>
          </div>
          <div>
            <AdminLabel htmlFor="filterStatus">Filter by status</AdminLabel>
            <AdminSelect
              id="filterStatus"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="">All statuses</option>
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </AdminSelect>
          </div>
          <div className="flex items-end">
            <p className="text-sm text-gray-500">
              {filtered.length} provider{filtered.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      </AdminCard>

      {filtered.length === 0 ? (
        <AdminEmptyState
          icon={<Compass size={32} />}
          title="No excursion providers yet"
          description="Add a tour operator or excursion business to start building your catalog."
          action={
            <AdminButtonLink to={adminPath('/excursions/providers/add')}>
              <Plus size={18} /> Add Provider
            </AdminButtonLink>
          }
        />
      ) : (
        <AdminCard className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-vailo-surface-elevated/80 text-left">
                  <th className="px-4 sm:px-6 py-3 font-semibold text-gray-600">Business</th>
                  <th className="px-4 sm:px-6 py-3 font-semibold text-gray-600">Regions</th>
                  <th className="px-4 sm:px-6 py-3 font-semibold text-gray-600">Contact</th>
                  <th className="px-4 sm:px-6 py-3 font-semibold text-gray-600">Portal user</th>
                  <th className="px-4 sm:px-6 py-3 font-semibold text-gray-600">Commission</th>
                  <th className="px-4 sm:px-6 py-3 font-semibold text-gray-600">Excursions</th>
                  <th className="px-4 sm:px-6 py-3 font-semibold text-gray-600">Status</th>
                  <th className="px-4 sm:px-6 py-3 font-semibold text-gray-600 text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((provider) => {
                  const linkedExcursions = excursionCounts[provider.id || ''] || 0;
                  const canDelete = linkedExcursions === 0;
                  const isDeleting = deletingId === provider.id;
                  const allocatedOwnerId = provider.linkedOwnerIds?.[0];
                  const allocatedUser = allocatedOwnerId
                    ? portalUsersById[allocatedOwnerId]
                    : undefined;

                  return (
                  <tr
                    key={provider.id}
                    className="border-b border-gray-50 hover:bg-vailo-surface-elevated/50 transition-colors"
                  >
                    <td className="px-4 sm:px-6 py-4">
                      <div className="flex items-center gap-3 min-w-[10rem]">
                        {provider.logoUrl ? (
                          <img
                            src={provider.logoUrl}
                            alt=""
                            className="h-9 w-9 rounded-lg object-cover border border-gray-100"
                          />
                        ) : (
                          <div className="h-9 w-9 rounded-lg bg-vailo-teal/10 flex items-center justify-center text-vailo-teal font-bold text-xs">
                            {(provider.businessName || '?').charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <p className="font-semibold text-vailo-dark">{provider.businessName}</p>
                          {provider.legalName && provider.legalName !== provider.businessName && (
                            <p className="text-xs text-gray-500">{provider.legalName}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 sm:px-6 py-4 text-gray-600">
                      <p>{formatOperatingRegionsSummary(provider.operatingRegions || [])}</p>
                      {(provider.countries?.length || 0) > 1 && (
                        <p className="text-xs text-gray-400">
                          {provider.countries!.join(', ')}
                        </p>
                      )}
                    </td>
                    <td className="px-4 sm:px-6 py-4 text-gray-600">
                      <p>{provider.email || '—'}</p>
                      <p className="text-xs text-gray-400">{provider.phone || provider.whatsapp || ''}</p>
                    </td>
                    <td className="px-4 sm:px-6 py-4 text-gray-600">
                      {allocatedUser ? (
                        <>
                          <p className="font-medium text-vailo-dark">
                            {allocatedUser.fullName || allocatedUser.email}
                          </p>
                          <p className="text-xs text-gray-400 truncate max-w-[12rem]">
                            {allocatedUser.email}
                          </p>
                        </>
                      ) : (
                        <span className="text-gray-400">Not allocated</span>
                      )}
                    </td>
                    <td className="px-4 sm:px-6 py-4">
                      {provider.commissionType === 'fixed_per_booking' ? (
                        <span className="font-medium text-vailo-dark tabular-nums">
                          {formatCurrencyAmount(provider.fixedCommissionAmount ?? 0, 'EUR')} / booking
                        </span>
                      ) : (
                        <span className="font-medium text-vailo-dark tabular-nums">
                          {provider.platformCommissionPercent ?? 0}%
                        </span>
                      )}
                    </td>
                    <td className="px-4 sm:px-6 py-4">
                      <Link
                        to={adminPath(adminExcursionsListPath(provider.id!))}
                        className="font-medium text-vailo-teal hover:underline tabular-nums"
                      >
                        {linkedExcursions} excursion{linkedExcursions !== 1 ? 's' : ''}
                      </Link>
                    </td>
                    <td className="px-4 sm:px-6 py-4">
                      <StatusBadge status={provider.status} />
                    </td>
                    <td className="px-4 sm:px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          to={adminPath(`/excursions/providers/${provider.id}/edit`)}
                          className="p-2 rounded-lg text-vailo-teal hover:bg-vailo-teal/5 transition-colors"
                          title="Edit"
                        >
                          <Pencil size={16} />
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleDelete(provider)}
                          disabled={!canDelete || isDeleting}
                          className={`p-2 rounded-lg transition-colors ${
                            canDelete
                              ? 'text-red-600 hover:bg-red-50'
                              : 'text-gray-300 cursor-not-allowed'
                          }`}
                          title={
                            canDelete
                              ? 'Delete provider'
                              : `Cannot delete — ${linkedExcursions} excursion${linkedExcursions !== 1 ? 's' : ''} linked. Remove them first.`
                          }
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </AdminCard>
      )}
    </div>
  );
}
