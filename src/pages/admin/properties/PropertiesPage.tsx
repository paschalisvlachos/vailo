import { useState, useEffect, useMemo } from 'react';
import {
  Building2,
  Plus,
  Pencil,
  Trash2,
  User,
  MapPin,
  Search,
  Hotel,
  LayoutGrid,
  ShieldCheck,
} from 'lucide-react';
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
type KindFilter = 'all' | ListingKind;

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
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
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

  const filteredProperties = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return visibleProperties.filter((p) => {
      const kind = p.listingKind === 'hotel' ? 'hotel' : 'property';
      if (kindFilter !== 'all' && kind !== kindFilter) return false;
      if (!q) return true;
      const ownerName = owners[p.ownerId]?.fullName?.toLowerCase() || '';
      const haystack = [
        p.propertyName,
        p.internalRefCode,
        p.country,
        p.area,
        p.city,
        ownerName,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [visibleProperties, kindFilter, searchQuery, owners]);

  const sortedProperties = useMemo(() => {
    const list = [...filteredProperties];
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
  }, [filteredProperties, sortBy, latestAnalyticsByProperty]);

  const summary = useMemo(() => {
    let hotels = 0;
    let props = 0;
    let unassigned = 0;
    let gated = 0;
    for (const p of visibleProperties) {
      if (p.listingKind === 'hotel') hotels += 1;
      else props += 1;
      if (!p.ownerId || !owners[p.ownerId]) unassigned += 1;
      if (isGuestPortalAccessRequired(p)) gated += 1;
    }
    return {
      total: visibleProperties.length,
      hotels,
      properties: props,
      unassigned,
      gated,
    };
  }, [visibleProperties, owners]);

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
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            <AdminCard className="p-4">
              <div className="flex items-center gap-3">
                <span className="h-10 w-10 rounded-xl bg-vailo-teal/10 text-vailo-teal flex items-center justify-center">
                  <LayoutGrid size={18} />
                </span>
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total</p>
                  <p className="text-xl font-bold text-vailo-dark">{summary.total}</p>
                </div>
              </div>
            </AdminCard>
            <AdminCard className="p-4">
              <div className="flex items-center gap-3">
                <span className="h-10 w-10 rounded-xl bg-vailo-teal/10 text-vailo-teal flex items-center justify-center">
                  <Building2 size={18} />
                </span>
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Properties</p>
                  <p className="text-xl font-bold text-vailo-dark">{summary.properties}</p>
                </div>
              </div>
            </AdminCard>
            <AdminCard className="p-4">
              <div className="flex items-center gap-3">
                <span className="h-10 w-10 rounded-xl bg-vailo-gold/15 text-vailo-gold-muted flex items-center justify-center">
                  <Hotel size={18} />
                </span>
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Hotels</p>
                  <p className="text-xl font-bold text-vailo-dark">{summary.hotels}</p>
                </div>
              </div>
            </AdminCard>
            <AdminCard className="p-4">
              <div className="flex items-center gap-3">
                <span className="h-10 w-10 rounded-xl bg-vailo-teal/10 text-vailo-teal flex items-center justify-center">
                  <ShieldCheck size={18} />
                </span>
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Access control</p>
                  <p className="text-xl font-bold text-vailo-dark">{summary.gated}</p>
                </div>
              </div>
            </AdminCard>
          </div>

          <AdminCard className="p-4 mb-5">
            <div className="flex flex-col lg:flex-row lg:items-center gap-3 lg:gap-4">
              <div className="relative flex-1 min-w-0">
                <Search
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by name, ref, location, or owner…"
                  className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-vailo-teal/20 focus:border-vailo-teal/40"
                  aria-label="Search properties"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1">
                  {(
                    [
                      { id: 'all', label: 'All' },
                      { id: 'property', label: 'Property' },
                      { id: 'hotel', label: 'Hotel' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setKindFilter(opt.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                        kindFilter === opt.id
                          ? 'bg-vailo-teal text-white'
                          : 'text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <label htmlFor="properties-sort" className="sr-only">
                  Sort by
                </label>
                <select
                  id="properties-sort"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as PropertySort)}
                  className="px-3 py-2 border border-gray-200 rounded-xl text-sm font-medium bg-white"
                >
                  <option value="title_asc">Title A–Z</option>
                  <option value="analytics_desc">Last analytics</option>
                </select>
              </div>
            </div>
            {(searchQuery || kindFilter !== 'all') && (
              <p className="text-xs text-gray-500 mt-3">
                Showing {sortedProperties.length} of {visibleProperties.length}
                {summary.unassigned > 0 ? ` · ${summary.unassigned} unassigned` : ''}
              </p>
            )}
          </AdminCard>
        </>
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
      ) : sortedProperties.length === 0 ? (
        <AdminEmptyState
          icon={<Search size={32} />}
          title="No matches"
          description="Try a different search or clear the type filter."
        />
      ) : (
        <>
          <div className="grid gap-3 md:hidden">
            {sortedProperties.map((property) => {
              const allocatedUser = owners[property.ownerId];
              const latestAnalytics = latestAnalyticsByProperty[property.id];
              const isHotel = property.listingKind === 'hotel';
              return (
                <AdminCard key={property.id} className="overflow-hidden">
                  <div className={`h-1 ${isHotel ? 'bg-vailo-gold' : 'bg-vailo-teal'}`} />
                  <div className="p-4 flex items-start justify-between gap-3">
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
                      <div className="mt-2 flex flex-wrap gap-2">
                        <GuestPortalAccessCell property={property} />
                      </div>
                      <p className="text-xs text-gray-500 mt-2">
                        Last analytics: {formatAnalyticsDate(latestAnalytics)}
                      </p>
                      {allocatedUser ? (
                        <p className="text-sm text-gray-700 mt-2 flex items-center gap-1.5">
                          <User size={14} className="text-gray-400 shrink-0" />
                          <span className="truncate">{allocatedUser.fullName}</span>
                          <span className="text-xs text-gray-500 px-2 py-0.5 bg-gray-100 rounded-md">
                            {formatOwnerRoleLabel(allocatedUser.role)}
                          </span>
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

          <div className="hidden md:grid gap-3">
            {sortedProperties.map((property) => {
              const allocatedUser = owners[property.ownerId];
              const latestAnalytics = latestAnalyticsByProperty[property.id];
              const isHotel = property.listingKind === 'hotel';
              return (
                <AdminCard key={property.id} className="overflow-hidden group">
                  <div className="flex">
                    <div
                      className={`w-1.5 shrink-0 ${isHotel ? 'bg-vailo-gold' : 'bg-vailo-teal'}`}
                      aria-hidden
                    />
                    <div className="flex-1 min-w-0 p-4 lg:p-5">
                      <div className="flex flex-col xl:flex-row xl:items-center gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <PropertyTitleCell
                              property={property}
                              listingCount={listingCounts[property.id] ?? 0}
                              href={propertyHref(property.id)}
                            />
                            <KindBadge kind={property.listingKind} />
                          </div>
                          <p className="text-xs text-gray-500 font-mono mt-1">
                            {property.internalRefCode}
                          </p>
                        </div>
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 xl:gap-4 flex-[1.6] min-w-0">
                          <div>
                            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-1">
                              Location
                            </p>
                            <LocationCell property={property} />
                          </div>
                          <div>
                            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-1">
                              Guest portal
                            </p>
                            <GuestPortalAccessCell property={property} />
                          </div>
                          <div>
                            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-1">
                              Owner / Agent
                            </p>
                            {allocatedUser ? (
                              <div className="flex items-center gap-2 min-w-0">
                                <User size={14} className="text-gray-400 shrink-0" />
                                <span className="text-sm text-gray-700 truncate">
                                  {allocatedUser.fullName}
                                </span>
                                <span className="text-xs text-gray-500 px-2 py-0.5 bg-gray-100 rounded-md shrink-0">
                                  {formatOwnerRoleLabel(allocatedUser.role)}
                                </span>
                              </div>
                            ) : (
                              <span className="text-sm text-gray-400 italic">Unassigned</span>
                            )}
                          </div>
                          <div>
                            <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-1">
                              Last analytics
                            </p>
                            <p className="text-sm text-gray-600 whitespace-nowrap">
                              {formatAnalyticsDate(latestAnalytics)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center justify-end gap-1 shrink-0">
                          {isPlatformAdmin && (
                            <>
                              <Link
                                to={adminPath(`/properties/${property.id}/edit`)}
                                className="inline-flex p-2 text-gray-400 hover:text-vailo-teal rounded-lg"
                                title="Edit property"
                              >
                                <Pencil size={17} />
                              </Link>
                              <button
                                type="button"
                                onClick={() => handleDelete(property.id, property.propertyName)}
                                className="p-2 text-gray-400 hover:text-red-600 rounded-lg"
                                title="Delete property"
                              >
                                <Trash2 size={17} />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </AdminCard>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
