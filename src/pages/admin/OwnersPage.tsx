import { useState, useEffect, useMemo } from 'react';
import { Users, Plus, Pencil, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { collection, collectionGroup, onSnapshot, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useToast } from '../../context/ToastContext';
import { adminPath } from '../../lib/adminRoutes';
import { formatOwnerRoleLabel, ownerRoleBadgeClass } from '../../lib/adminAccess';
import { useAdminSession } from '../../context/AdminSessionContext';
import { ownersVisibleInCrm } from '../../lib/agentOwners';
import AdminPageHeader, {
  AdminButtonLink,
  AdminCard,
  AdminEmptyState,
} from '../../components/admin/AdminPageHeader';

interface Owner {
  id: string;
  fullName: string;
  email: string;
  company: string;
  role: string;
  status: string;
  agentId?: string;
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: 'bg-emerald-50 text-emerald-800 border-emerald-100',
    trial: 'bg-vailo-teal/5 text-vailo-dark border-vailo-teal/10',
  };
  const key = status?.toLowerCase() || '';
  const cls = styles[key] || 'bg-red-50 text-red-800 border-red-100';
  return (
    <span className={`px-2.5 py-1 text-xs font-semibold rounded-full border capitalize ${cls}`}>
      {status || 'Unknown'}
    </span>
  );
}

function CountBadge({ count, title }: { count: number; title?: string }) {
  return (
    <span
      title={title}
      className="inline-flex min-w-[2rem] justify-center bg-vailo-surface-elevated text-vailo-dark py-1 px-2.5 rounded-full text-sm font-semibold tabular-nums"
    >
      {count}
    </span>
  );
}

function RoleBadge({ role }: { role: string }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 text-xs font-semibold rounded-lg border ${ownerRoleBadgeClass(role)}`}
    >
      {formatOwnerRoleLabel(role)}
    </span>
  );
}

export default function OwnersPage() {
  const toast = useToast();
  const { profile, isPlatformAdmin, isAgent } = useAdminSession();
  const [owners, setOwners] = useState<Owner[]>([]);
  const [managedPropertyCounts, setManagedPropertyCounts] = useState<Record<string, number>>({});
  const [allocatedTypeCounts, setAllocatedTypeCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubOwners = onSnapshot(collection(db, 'owners'), (snapshot) => {
      setOwners(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as Owner[]);
      setLoading(false);
    });

    const unsubProperties = onSnapshot(collection(db, 'properties'), (snapshot) => {
      const counts: Record<string, number> = {};
      snapshot.docs.forEach((d) => {
        const ownerId = d.data().ownerId as string | undefined;
        if (ownerId) counts[ownerId] = (counts[ownerId] || 0) + 1;
      });
      setManagedPropertyCounts(counts);
    });

    const unsubTypes = onSnapshot(collectionGroup(db, 'propertyTypes'), (snapshot) => {
      const counts: Record<string, number> = {};
      snapshot.docs.forEach((d) => {
        const ownerId = d.data().ownerId as string | undefined;
        if (ownerId) counts[ownerId] = (counts[ownerId] || 0) + 1;
      });
      setAllocatedTypeCounts(counts);
    });

    return () => {
      unsubOwners();
      unsubProperties();
      unsubTypes();
    };
  }, []);

  const visibleOwners = useMemo(
    () => ownersVisibleInCrm(profile, owners) as Owner[],
    [profile, owners]
  );

  const handleDelete = async (id: string, name: string) => {
    if (window.confirm(`Delete ${name}?`)) {
      try {
        await deleteDoc(doc(db, 'owners', id));
      } catch (error) {
        console.error('Error deleting owner:', error);
        toast.error('Failed to delete owner.');
      }
    }
  };

  if (loading) {
    return <div className="py-16 text-center text-gray-500 text-sm">Loading CRM…</div>;
  }

  return (
    <div className="admin-page">
      <AdminPageHeader
        title={isAgent ? 'My owners' : 'Owners CRM'}
        description={
          isAgent
            ? 'Add and manage property owners you allocate to listings on your properties.'
            : 'Manage admins, agents, owners, and excursion providers'
        }
        icon={<Users size={26} />}
        action={
          <AdminButtonLink to={adminPath('/add-owner')} className="w-full sm:w-auto">
            <Plus size={18} /> {isAgent ? 'Add owner' : 'Add user'}
          </AdminButtonLink>
        }
      />

      {visibleOwners.length === 0 ? (
        <AdminEmptyState
          icon={<Users size={32} />}
          title={isAgent ? 'No owners yet' : 'No users yet'}
          description={
            isAgent
              ? 'Add property owners here, then assign them to listings on your properties.'
              : 'Add agents, owners, or excursion providers to assign across your portfolio.'
          }
          action={
            <AdminButtonLink to={adminPath('/add-owner')}>
              <Plus size={18} /> {isAgent ? 'Add owner' : 'Add user'}
            </AdminButtonLink>
          }
        />
      ) : (
        <>
          <div className="grid gap-3 lg:hidden">
            {visibleOwners.map((owner) => (
              <AdminCard key={owner.id} className="p-4">
                <div className="flex justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-vailo-dark truncate">{owner.fullName}</p>
                    <p className="text-sm text-gray-500 truncate">{owner.email}</p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <StatusBadge status={owner.status} />
                      {isPlatformAdmin && <RoleBadge role={owner.role} />}
                    </div>
                    <div className="flex flex-wrap gap-3 mt-3 text-xs text-gray-600">
                      {!isAgent && (
                        <>
                          <span>
                            <strong className="text-vailo-teal">{managedPropertyCounts[owner.id] || 0}</strong>{' '}
                            properties managed
                          </span>
                          <span className="text-gray-300">·</span>
                        </>
                      )}
                      <span>
                        <strong className="text-vailo-gold-muted">{allocatedTypeCounts[owner.id] || 0}</strong>{' '}
                        listings allocated
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <Link
                      to={adminPath(`/owners/${owner.id}/edit`)}
                      className="p-2 text-gray-400 hover:text-vailo-teal rounded-lg"
                      title="Edit owner"
                    >
                      <Pencil size={17} />
                    </Link>
                    <button
                      type="button"
                      onClick={() => handleDelete(owner.id, owner.fullName)}
                      className="p-2 text-gray-400 hover:text-red-600 rounded-lg"
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                </div>
              </AdminCard>
            ))}
          </div>

          <AdminCard className="hidden lg:block overflow-hidden">
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Company</th>
                    {!isAgent && (
                      <th className="text-center" title="Assigned on property (agent / owner)">
                        Properties managed
                      </th>
                    )}
                    <th className="text-center" title="Allocated owner on individual property listings">
                      Listings allocated
                    </th>
                    {isPlatformAdmin && <th>Role</th>}
                    <th>Status</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleOwners.map((owner) => (
                    <tr key={owner.id}>
                      <td>
                        <div className="font-semibold text-vailo-dark">{owner.fullName}</div>
                        <div className="text-sm text-gray-500">{owner.email}</div>
                      </td>
                      <td>{owner.company || '—'}</td>
                      {!isAgent && (
                        <td className="text-center">
                          <CountBadge
                            count={managedPropertyCounts[owner.id] || 0}
                            title="Properties where this user is assigned agent or owner"
                          />
                        </td>
                      )}
                      <td className="text-center">
                        <CountBadge
                          count={allocatedTypeCounts[owner.id] || 0}
                          title="Property listings where this user is the allocated owner"
                        />
                      </td>
                      {isPlatformAdmin && (
                        <td>
                          <RoleBadge role={owner.role} />
                        </td>
                      )}
                      <td>
                        <StatusBadge status={owner.status} />
                      </td>
                      <td className="text-right">
                        <Link
                          to={adminPath(`/owners/${owner.id}/edit`)}
                          className="inline-flex p-2 text-gray-400 hover:text-vailo-teal"
                          title="Edit owner"
                        >
                          <Pencil size={17} />
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleDelete(owner.id, owner.fullName)}
                          className="p-2 text-gray-400 hover:text-red-600"
                        >
                          <Trash2 size={17} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </AdminCard>
        </>
      )}
    </div>
  );
}
