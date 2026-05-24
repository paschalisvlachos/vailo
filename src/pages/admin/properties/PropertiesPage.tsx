import { useState, useEffect } from 'react';
import { Building2, Plus, Pencil, Trash2, User } from 'lucide-react';
import { Link } from 'react-router-dom';
import { collection, onSnapshot, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import AdminPageHeader, {
  AdminButtonLink,
  AdminCard,
  AdminEmptyState,
} from '../../../components/admin/AdminPageHeader';

interface Property {
  id: string;
  propertyName: string;
  ownerId: string;
  internalRefCode: string;
}

export default function PropertiesPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [owners, setOwners] = useState<Record<string, { fullName?: string; role?: string }>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubProps = onSnapshot(collection(db, 'properties'), (snapshot) => {
      setProperties(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as Property[]);
      setLoading(false);
    });
    const unsubOwners = onSnapshot(collection(db, 'owners'), (snapshot) => {
      const ownersMap: Record<string, { fullName?: string; role?: string }> = {};
      snapshot.forEach((d) => {
        ownersMap[d.id] = d.data();
      });
      setOwners(ownersMap);
    });
    return () => {
      unsubProps();
      unsubOwners();
    };
  }, []);

  const handleDelete = async (id: string, propertyName: string) => {
    if (window.confirm(`Delete "${propertyName}"?`)) {
      try {
        await deleteDoc(doc(db, 'properties', id));
      } catch {
        alert('Failed to delete property.');
      }
    }
  };

  if (loading) {
    return <div className="py-16 text-center text-gray-500 text-sm">Loading properties…</div>;
  }

  return (
    <div className="admin-page">
      <AdminPageHeader
        title="Properties"
        description="Manage your rental portfolio and guest portals"
        icon={<Building2 size={26} />}
        action={
          <AdminButtonLink to="/add-property" className="w-full sm:w-auto">
            <Plus size={18} /> Add Property
          </AdminButtonLink>
        }
      />

      {properties.length === 0 ? (
        <AdminEmptyState
          icon={<Building2 size={32} />}
          title="No properties yet"
          description="Add your first property to set up guest portals, local gems, and house guides."
          action={
            <AdminButtonLink to="/add-property">
              <Plus size={18} /> Add Property
            </AdminButtonLink>
          }
        />
      ) : (
        <>
          {/* Mobile / tablet cards */}
          <div className="grid gap-3 md:hidden">
            {properties.map((property) => {
              const allocatedUser = owners[property.ownerId];
              return (
                <AdminCard key={property.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <Link
                        to={`/properties/${property.id}`}
                        className="font-semibold text-vailo-teal hover:underline block truncate"
                      >
                        {property.propertyName}
                      </Link>
                      <p className="text-xs text-gray-500 mt-1 font-mono">{property.internalRefCode}</p>
                      {allocatedUser ? (
                        <p className="text-sm text-gray-700 mt-2 flex items-center gap-1.5">
                          <User size={14} className="text-gray-400 shrink-0" />
                          <span className="truncate">{allocatedUser.fullName}</span>
                        </p>
                      ) : (
                        <p className="text-sm text-gray-400 italic mt-2">Unassigned</p>
                      )}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button type="button" className="p-2 text-gray-400 hover:text-vailo-teal rounded-lg">
                        <Pencil size={17} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(property.id, property.propertyName)}
                        className="p-2 text-gray-400 hover:text-red-600 rounded-lg"
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                  </div>
                </AdminCard>
              );
            })}
          </div>

          {/* Desktop table */}
          <AdminCard className="hidden md:block overflow-hidden">
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Property</th>
                    <th>Owner / Agent</th>
                    <th>Ref</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {properties.map((property) => {
                    const allocatedUser = owners[property.ownerId];
                    return (
                      <tr key={property.id}>
                        <td>
                          <Link
                            to={`/properties/${property.id}`}
                            className="font-semibold text-vailo-teal hover:underline"
                          >
                            {property.propertyName}
                          </Link>
                        </td>
                        <td className="px-5 py-4 text-sm">
                          {allocatedUser ? (
                            <div className="flex items-center gap-2">
                              <User size={14} className="text-gray-400" />
                              <span>{allocatedUser.fullName}</span>
                              <span className="text-xs text-gray-500 capitalize px-2 py-0.5 bg-gray-100 rounded-md">
                                {allocatedUser.role}
                              </span>
                            </div>
                          ) : (
                            <span className="text-gray-400 italic">Unassigned</span>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-vailo-teal/5 text-vailo-teal">
                            {property.internalRefCode}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <button type="button" className="p-2 text-gray-400 hover:text-vailo-teal">
                            <Pencil size={17} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(property.id, property.propertyName)}
                            className="p-2 text-gray-400 hover:text-red-600"
                          >
                            <Trash2 size={17} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </AdminCard>
        </>
      )}
    </div>
  );
}
