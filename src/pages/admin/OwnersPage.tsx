import { useState, useEffect } from 'react';
import { Users, Plus, Pencil, Trash2 } from 'lucide-react';
import { collection, onSnapshot, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
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
  propertiesCount: number;
  role: string;
  status: string;
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

export default function OwnersPage() {
  const [owners, setOwners] = useState<Owner[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'owners'), (snapshot) => {
      setOwners(
        snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as Owner[]
      );
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleDelete = async (id: string, name: string) => {
    if (window.confirm(`Delete ${name}?`)) {
      try {
        await deleteDoc(doc(db, 'owners', id));
      } catch (error) {
        console.error('Error deleting owner:', error);
        alert('Failed to delete owner.');
      }
    }
  };

  if (loading) {
    return <div className="py-16 text-center text-gray-500 text-sm">Loading CRM…</div>;
  }

  return (
    <div className="admin-page">
      <AdminPageHeader
        title="Owners CRM"
        description="Manage property owners and agents"
        icon={<Users size={26} />}
        action={
          <AdminButtonLink to="/add-owner" className="w-full sm:w-auto">
            <Plus size={18} /> Add Owner
          </AdminButtonLink>
        }
      />

      {owners.length === 0 ? (
        <AdminEmptyState
          icon={<Users size={32} />}
          title="No users yet"
          description="Add property owners or agents to assign to your portfolio."
          action={
            <AdminButtonLink to="/add-owner">
              <Plus size={18} /> Add Owner
            </AdminButtonLink>
          }
        />
      ) : (
        <>
          <div className="grid gap-3 lg:hidden">
            {owners.map((owner) => (
              <AdminCard key={owner.id} className="p-4">
                <div className="flex justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-vailo-dark truncate">{owner.fullName}</p>
                    <p className="text-sm text-gray-500 truncate">{owner.email}</p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <StatusBadge status={owner.status} />
                      <span className="text-xs text-gray-500 capitalize px-2 py-1 bg-gray-100 rounded-lg">
                        {owner.role}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <button
                      type="button"
                      className="p-2 text-gray-400 hover:text-vailo-teal rounded-lg"
                      onClick={() => alert('Edit coming soon!')}
                    >
                      <Pencil size={17} />
                    </button>
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
                    <th className="text-center">Properties</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {owners.map((owner) => (
                    <tr key={owner.id}>
                      <td>
                        <div className="font-semibold text-vailo-dark">{owner.fullName}</div>
                        <div className="text-sm text-gray-500">{owner.email}</div>
                      </td>
                      <td>{owner.company || '—'}</td>
                      <td className="text-center">
                        <span className="bg-vailo-surface-elevated text-vailo-dark py-1 px-3 rounded-full text-sm font-medium">
                          {owner.propertiesCount || 0}
                        </span>
                      </td>
                      <td className="capitalize text-gray-600">{owner.role}</td>
                      <td><StatusBadge status={owner.status} /></td>
                      <td className="text-right">
                        <button type="button" className="p-2 text-gray-400 hover:text-vailo-teal" onClick={() => alert('Edit coming soon!')}>
                          <Pencil size={17} />
                        </button>
                        <button type="button" onClick={() => handleDelete(owner.id, owner.fullName)} className="p-2 text-gray-400 hover:text-red-600">
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
