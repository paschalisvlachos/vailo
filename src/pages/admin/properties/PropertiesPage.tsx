import { useState, useEffect, useMemo } from 'react';
import { Building2, Plus, Pencil, Trash2, User, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';
import { collection, collectionGroup, onSnapshot, deleteDoc, doc } from 'firebase/firestore';
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
import { canAccessPropertyId, pathForPropertyLanding, formatOwnerRoleLabel } from '../../../lib/adminAccess';
import { adminPath } from '../../../lib/adminRoutes';
import { isGuestPortalAccessRequired } from '../../../lib/guestAccess';
import {
  aggregateLatestAnalyticsByProperty,
  analyticsSummaryRowFromDoc,
  formatAnalyticsDate,
} from '../../../lib/guestAnalyticsAdmin';

type PropertySort = 'title_asc' | 'analytics_desc';

interface Property {
  id: string;
  propertyName: string;
  ownerId: string;
  internalRefCode: string;
  listingKind?: ListingKind;
  country?: string;
  area?: string;
  city?: string;
  guestPortalAccessRequired?: boolean;
}

function KindBadge({ kind }: { kind?: ListingKind }) {
  const isHotel = kind === 'hotel';
  return (
    <AdminBadge variant={isHotel ? 'gold' : 'teal'}>
      {isHotel ? 'Hotel' : 'Property'}
    </AdminBadge>
  );
}

function ListingCountLink({ propertyId, count }: { propertyId: string; count: number }) {
  const label = count === 1 ? '1 listing' : `${count} listings`;
  return (
    <Link
      to={adminPath(`/properties/${propertyId}/types`)}
      className="text-sm font-normal text-gray-500 hover:text-vailo-teal hover:underline whitespace-nowrap"
    >
      ({label})
    </Link>
  );
}

function PropertyTitleCell({
  property,
  listingCount,
  href,
}: {
  property: Property;
  listingCount: number;
  href: string;
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
      <Link to={href} className="font-semibold text-vailo-teal hover:underline">
        {property.propertyName}
      </Link>
      <ListingCountLink propertyId={property.id} count={listingCount} />
    </span>
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

function GuestPortalAccessCell({ property }: { property: Property }) {
  const required = isGuestPortalAccessRequired(property);
  return required ? (
    <AdminBadge variant="teal">Access control</AdminBadge>
  ) : (
    <AdminBadge variant="neutral">Open portal</AdminBadge>
  );
}

export default function PropertiesPage() {
  const toast = useToast();
  const { profile, scopes, isPlatformAdmin, isScopedUser } = useAdminSession();
  const [properties, setProperties] = useState<Property[]>([]);
  const [listingCounts, setListingCounts] = useState<Record<string, number>>({});
  const [owners, setOwners] = useState<Record<string, { fullName?: string; role?: string }>>({});
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<PropertySort>('title_asc');
  const [stayAnalyticsRows, setStayAnalyticsRows] = useState<
    { propertyId: string; lastSeenAt: string }[]
  >([]);
  const [anonAnalyticsRows, setAnonAnalyticsRows] = useState<
    { propertyId: string; lastSeenAt: string }[]
  >([]);

  useEffect(() => {
    const unsubProps = onSnapshot(collection(db, 'properties'), (snapshot) => {
      const rows = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as Property[];
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

  useEffect(() => {
    const unsubTypes = onSnapshot(collectionGroup(db, 'propertyTypes'), (snapshot) => {
      const counts: Record<string, number> = {};
      snapshot.forEach((d) => {
        const propertyId = d.ref.parent.parent?.id;
        if (!propertyId) return;
        counts[propertyId] = (counts[propertyId] || 0) + 1;
      });
      setListingCounts(counts);
    });
    return () => unsubTypes();
  }, []);

  useEffect(() => {
    const collectRows = (snap: { docs: { data: () => Record<string, unknown> }[] }) =>
      snap.docs
        .map((d) => analyticsSummaryRowFromDoc(d.data()))
        .filter((row): row is { propertyId: string; lastSeenAt: string } => row != null);

    const unsubStay = onSnapshot(collectionGroup(db, 'guestStayAnalytics'), (snap) => {
      setStayAnalyticsRows(collectRows(snap));
    });
    const unsubAnon = onSnapshot(collectionGroup(db, 'guestAnonymousAnalytics'), (snap) => {
      setAnonAnalyticsRows(collectRows(snap));
    });
    return () => {
      unsubStay();
      unsubAnon();
    };
  }, []);

  const latestAnalyticsByProperty = useMemo(
    () => aggregateLatestAnalyticsByProperty([...stayAnalyticsRows, ...anonAnalyticsRows]),
    [stayAnalyticsRows, anonAnalyticsRows]
  );

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

  const sortedProperties = useMemo(() => {
    const list = [...visibleProperties];
    if (sortBy === 'title_asc') {
      list.sort((a, b) => a.propertyName.localeCompare(b.propertyName));
      return list;
    }
    list.sort((a, b) => {
      const aDate = latestAnalyticsByProperty[a.id] || '';
      const bDate = latestAnalyticsByProperty[b.id] || '';
      if (!aDate && !bDate) return a.propertyName.localeCompare(b.propertyName);
      if (!aDate) return 1;
      if (!bDate) return -1;
      return bDate.localeCompare(aDate);
    });
    return list;
  }, [visibleProperties, sortBy, latestAnalyticsByProperty]);

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

      {visibleProperties.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <label htmlFor="properties-sort" className="text-sm font-medium text-gray-600">
            Sort by
          </label>
          <select
            id="properties-sort"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as PropertySort)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium bg-white"
          >
            <option value="title_asc">Title A–Z</option>
            <option value="analytics_desc">Last analytics</option>
          </select>
        </div>
      )}

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
            {sortedProperties.map((property) => {
              const allocatedUser = owners[property.ownerId];
              const latestAnalytics = latestAnalyticsByProperty[property.id];
              return (
                <AdminCard key={property.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <PropertyTitleCell
                          property={property}
                          listingCount={listingCounts[property.id] ?? 0}
                          href={propertyHref(property.id)}
                        />
                        <KindBadge kind={property.listingKind} />
                      </div>
                      <p className="text-xs text-gray-500 font-mono">{property.internalRefCode}</p>
                      <div className="mt-2">
                        <LocationCell property={property} />
                      </div>
                      <div className="mt-2">
                        <GuestPortalAccessCell property={property} />
                      </div>
                      <p className="text-xs text-gray-500 mt-2">
                        Last analytics: {formatAnalyticsDate(latestAnalytics)}
                      </p>
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
                    <th>Guest portal access</th>
                    <th>Last analytics</th>
                    <th>Owner / Agent</th>
                    <th>Ref</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedProperties.map((property) => {
                    const allocatedUser = owners[property.ownerId];
                    const latestAnalytics = latestAnalyticsByProperty[property.id];
                    return (
                      <tr key={property.id}>
                        <td>
                          <PropertyTitleCell
                            property={property}
                            listingCount={listingCounts[property.id] ?? 0}
                            href={propertyHref(property.id)}
                          />
                        </td>
                        <td>
                          <KindBadge kind={property.listingKind} />
                        </td>
                        <td>
                          <LocationCell property={property} />
                        </td>
                        <td>
                          <GuestPortalAccessCell property={property} />
                        </td>
                        <td className="text-sm text-gray-600 whitespace-nowrap">
                          {formatAnalyticsDate(latestAnalytics)}
                        </td>
                        <td>
                          {allocatedUser ? (
                            <div className="flex items-center gap-2">
                              <User size={14} className="text-gray-400" />
                              <span>{allocatedUser.fullName}</span>
                              <span className="text-xs text-gray-500 px-2 py-0.5 bg-gray-100 rounded-md">
                                {formatOwnerRoleLabel(allocatedUser.role)}
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
