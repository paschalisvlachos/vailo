import { useState, useEffect } from 'react';
import { Building2, Plus, Pencil, Trash2, User, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';
import { collection, onSnapshot, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { useToast } from '../../../context/ToastContext';
import AdminPageHeader, {
  AdminBadge,
  AdminButtonLink,
  AdminCard,
  AdminEmptyState,
} from '../../../components/admin/AdminPageHeader';
import type { ListingKind } from './PropertyFormPage';
import { useAdminSession } from '../../../context/AdminSessionContext';
import { canAccessPropertyId, pathForPropertyLanding } from '../../../lib/adminAccess';
import { adminPath } from '../../../lib/adminRoutes';

interface Property {
  id: string;
  propertyName: string;
  ownerId: string;
  internalRefCode: string;
  listingKind?: ListingKind;
  country?: string;
  area?: string;
  city?: string;
}

function KindBadge({ kind }: { kind?: ListingKind }) {
  const isHotel = kind === 'hotel';
  return (
    <AdminBadge variant={isHotel ? 'gold' : 'teal'}>
      {isHotel ? 'Hotel' : 'Property'}
    </AdminBadge>
  );
}

function LocationCell({ property }: { property: Property }) {
  const area = property.area || property.city;
  if (!property.country && !area) {
    return <span className="text-gray-400 italic text-sm">Not set</span>;
  }
  return (
    <span className="text-sm text-gray-600 inline-flex items-center gap-1.5">
      <MapPin size={13} className="text-vailo-teal/50 shrink-0" />
      {[area, property.country].filter(Boolean).join(', ')}
    </span>
  );
}

export default function PropertiesPage() {
  const toast = useToast();
  const { profile, scopes, isPlatformAdmin, isScopedUser } = useAdminSession();
  const [properties, setProperties] = useState<Property[]>([]);
  const [owners, setOwners] = useState<Record<string, { fullName?: string; role?: string }>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubProps = onSnapshot(collection(db, 'properties'), (snapshot) => {
      const rows = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as Property[];
      rows.sort((a, b) => a.propertyName.localeCompare(b.propertyName));
      setProperties(rows);
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
        toast.error('Failed to delete property.');
      }
    }
  };

  const visibleProperties = isPlatformAdmin
    ? properties
    : properties.filter((p) => canAccessPropertyId(profile, p.id, scopes));

  const propertyHref = (propertyId: string) =>
    isPlatformAdmin ? adminPath(`/properties/${propertyId}`) : pathForPropertyLanding(propertyId, scopes);

  if (loading) {
    return <div className="py-16 text-center text-gray-500 text-sm">Loading properties…</div>;
  }

  return (
    <div className="admin-page">
      <AdminPageHeader
        title="Properties"
        description={
          isScopedUser
            ? 'Properties and listings assigned to your account'
            : 'Manage your rental portfolio and guest portals'
        }
        icon={<Building2 size={26} />}
        action={
          isPlatformAdmin ? (
            <AdminButtonLink to={adminPath('/add-property')} className="w-full sm:w-auto">
              <Plus size={18} /> Add Property
            </AdminButtonLink>
          ) : undefined
        }
      />

      {visibleProperties.length === 0 ? (
        <AdminEmptyState
          icon={<Building2 size={32} />}
          title={isScopedUser ? 'No assignments' : 'No properties yet'}
          description={
            isScopedUser
              ? 'Your account is not linked to any property or listing yet. Contact your Vailo administrator.'
              : 'Add your first property to set up guest portals, local gems, and house guides.'
          }
          action={
            isPlatformAdmin ? (
              <AdminButtonLink to={adminPath('/add-property')}>
                <Plus size={18} /> Add Property
              </AdminButtonLink>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="grid gap-3 md:hidden">
            {visibleProperties.map((property) => {
              const allocatedUser = owners[property.ownerId];
              return (
                <AdminCard key={property.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <Link
                          to={propertyHref(property.id)}
                          className="font-semibold text-vailo-teal hover:underline truncate"
                        >
                          {property.propertyName}
                        </Link>
                        <KindBadge kind={property.listingKind} />
                      </div>
                      <p className="text-xs text-gray-500 font-mono">{property.internalRefCode}</p>
                      <div className="mt-2">
                        <LocationCell property={property} />
                      </div>
                      {allocatedUser ? (
                        <p className="text-sm text-gray-700 mt-2 flex items-center gap-1.5">
                          <User size={14} className="text-gray-400 shrink-0" />
                          <span className="truncate">{allocatedUser.fullName}</span>
                        </p>
                      ) : (
                        <p className="text-sm text-gray-400 italic mt-2">Unassigned</p>
                      )}
                    </div>
                    {isPlatformAdmin && (
                      <div className="flex gap-1 shrink-0">
                        <Link
                          to={adminPath(`/properties/${property.id}/edit`)}
                          className="p-2 text-gray-400 hover:text-vailo-teal rounded-lg"
                          title="Edit property"
                        >
                          <Pencil size={17} />
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleDelete(property.id, property.propertyName)}
                          className="p-2 text-gray-400 hover:text-red-600 rounded-lg"
                        >
                          <Trash2 size={17} />
                        </button>
                      </div>
                    )}
                  </div>
                </AdminCard>
              );
            })}
          </div>

          <AdminCard className="hidden md:block overflow-hidden">
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Property</th>
                    <th>Type</th>
                    <th>Location</th>
                    <th>Owner / Agent</th>
                    <th>Ref</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleProperties.map((property) => {
                    const allocatedUser = owners[property.ownerId];
                    return (
                      <tr key={property.id}>
                        <td>
                          <Link
                            to={propertyHref(property.id)}
                            className="font-semibold text-vailo-teal hover:underline"
                          >
                            {property.propertyName}
                          </Link>
                        </td>
                        <td>
                          <KindBadge kind={property.listingKind} />
                        </td>
                        <td>
                          <LocationCell property={property} />
                        </td>
                        <td>
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
                        <td>
                          <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-vailo-teal/5 text-vailo-teal font-mono">
                            {property.internalRefCode}
                          </span>
                        </td>
                        <td className="text-right">
                          {isPlatformAdmin && (
                            <>
                              <Link
                                to={adminPath(`/properties/${property.id}/edit`)}
                                className="inline-flex p-2 text-gray-400 hover:text-vailo-teal"
                                title="Edit property"
                              >
                                <Pencil size={17} />
                              </Link>
                              <button
                                type="button"
                                onClick={() => handleDelete(property.id, property.propertyName)}
                                className="p-2 text-gray-400 hover:text-red-600"
                              >
                                <Trash2 size={17} />
                              </button>
                            </>
                          )}
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
