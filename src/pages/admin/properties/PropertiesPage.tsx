import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Building2,
  Plus,
  Pencil,
  Trash2,
  User,
  MapPin,
  Search,
  LayoutGrid,
  Rows3,
  Copy,
  Check,
  QrCode,
  Smartphone,
  Loader2,
  X,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { collection, collectionGroup, onSnapshot } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { useToast } from '../../../context/ToastContext';
import { deletePropertyListing } from '../../../lib/deletePropertyListing';
import { clonePropertyListing } from '../../../lib/clonePropertyListing';
import AdminPageHeader, {
  AdminButtonLink,
  AdminCard,
  AdminEmptyState,
} from '../../../components/admin/AdminPageHeader';
import { useAdminSession } from '../../../context/AdminSessionContext';
import { canAccessPropertyId } from '../../../lib/adminAccess';
import { adminPath } from '../../../lib/adminRoutes';
import { buildAdminGuestPortalPreviewUrl } from '../../../lib/guestAccess';
import {
  buildGuestPortalPublicListingUrl,
  downloadGuestPortalQrCode,
  guestPortalQrFilename,
} from '../../../lib/guestPortalQrCode';
import { formatGuestSlug, getTypePublicSlug } from '../../../lib/guestPortalSlug';
import {
  countListingsTowardCapacity,
  formatMaxListingsLabel,
  hasConfiguredListingCapacity,
  summarizeListingCapacity,
} from '../../../lib/ownerListingQuota';

type ListingSort = 'title_asc' | 'name_desc';
type ListingLayoutMode = 'rows' | 'boxes';

const LISTING_LAYOUT_KEY = 'vailo_property_listings_layout';

type AgencyShell = {
  id: string;
  propertyName?: string;
  ownerId?: string;
  urlSlug?: string;
  guestPortalAccessRequired?: boolean;
};

type ListingRow = {
  id: string;
  propertyId: string;
  propertyTypeName: string;
  internalRefCode?: string;
  country?: string;
  area?: string;
  city?: string;
  addressLine?: string;
  ownerId?: string;
  photoUrl?: string;
  urlSlug?: string;
  typeSlug?: string;
  raw: Record<string, unknown>;
};

function listingEditHref(propertyId: string, listingId: string) {
  return adminPath(
    `/properties/${propertyId}/types?listing=${encodeURIComponent(listingId)}`
  );
}

export default function PropertiesPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const {
    profile,
    scopes,
    isPlatformAdmin,
    isScopedUser,
    portfolioProperties,
    portfolioTypes,
  } = useAdminSession();

  const [agencies, setAgencies] = useState<AgencyShell[]>([]);
  const [listings, setListings] = useState<ListingRow[]>([]);
  const [owners, setOwners] = useState<Record<string, { fullName?: string; role?: string }>>({});
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<ListingSort>('title_asc');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedUrlId, setCopiedUrlId] = useState<string | null>(null);
  const [qrDownloadingId, setQrDownloadingId] = useState<string | null>(null);
  const [cloningId, setCloningId] = useState<string | null>(null);
  const [layoutMode, setLayoutMode] = useState<ListingLayoutMode>(() => {
    try {
      return localStorage.getItem(LISTING_LAYOUT_KEY) === 'boxes' ? 'boxes' : 'rows';
    } catch {
      return 'rows';
    }
  });
  const [phonePreview, setPhonePreview] = useState<{
    listingKey: string;
    title: string;
    url: string;
  } | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(LISTING_LAYOUT_KEY, layoutMode);
    } catch {
      /* ignore */
    }
  }, [layoutMode]);

  useEffect(() => {
    if (!phonePreview) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPhonePreview(null);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [phonePreview]);

  useEffect(() => {
    const unsubProps = onSnapshot(collection(db, 'properties'), (snapshot) => {
      setAgencies(
        snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AgencyShell, 'id'>) }))
      );
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
      const rows: ListingRow[] = [];
      snapshot.forEach((d) => {
        const propertyId = d.ref.parent.parent?.id;
        if (!propertyId) return;
        const data = d.data();
        rows.push({
          id: d.id,
          propertyId,
          propertyTypeName: String(data.propertyTypeName || '').trim() || 'Untitled listing',
          internalRefCode: typeof data.internalRefCode === 'string' ? data.internalRefCode : '',
          country: typeof data.country === 'string' ? data.country : '',
          area: typeof data.area === 'string' ? data.area : '',
          city: typeof data.city === 'string' ? data.city : '',
          addressLine: typeof data.addressLine === 'string' ? data.addressLine : '',
          ownerId: typeof data.ownerId === 'string' ? data.ownerId : '',
          photoUrl: typeof data.photoUrl === 'string' ? data.photoUrl : '',
          urlSlug: typeof data.urlSlug === 'string' ? data.urlSlug : '',
          typeSlug: typeof data.typeSlug === 'string' ? data.typeSlug : '',
          raw: { id: d.id, ...data },
        });
      });
      setListings(rows);
    });
    return () => unsubTypes();
  }, []);

  const agenciesById = useMemo(() => {
    const map: Record<string, AgencyShell> = {};
    for (const a of agencies) map[a.id] = a;
    return map;
  }, [agencies]);

  const capacity = useMemo(() => {
    if (
      !profile ||
      isPlatformAdmin ||
      (profile.role !== 'agent' && profile.role !== 'owner') ||
      !hasConfiguredListingCapacity(profile.maxListings)
    ) {
      return null;
    }
    const used = countListingsTowardCapacity(profile, portfolioProperties, portfolioTypes);
    return summarizeListingCapacity(profile.maxListings, used);
  }, [profile, isPlatformAdmin, portfolioProperties, portfolioTypes]);

  const canAddListing = isPlatformAdmin || Boolean(capacity?.canCreate);
  const canMutateListing = isPlatformAdmin || Boolean(capacity);

  const visibleListings = useMemo(() => {
    if (isPlatformAdmin) return listings;
    return listings.filter((listing) => {
      if (canAccessPropertyId(profile, listing.propertyId, scopes)) return true;
      if (profile?.id && listing.ownerId === profile.id) return true;
      return false;
    });
  }, [listings, isPlatformAdmin, profile, scopes]);

  const filteredListings = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return visibleListings;
    return visibleListings.filter((listing) => {
      const agency = agenciesById[listing.propertyId];
      const listingOwner = listing.ownerId ? owners[listing.ownerId] : undefined;
      const portalUrl = guestUrlFor(agency, listing);
      const haystack = [
        listing.propertyTypeName,
        listing.internalRefCode,
        listing.country,
        listing.area,
        listing.city,
        listing.addressLine,
        agency?.propertyName,
        listingOwner?.fullName,
        portalUrl,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [visibleListings, searchQuery, agenciesById, owners]);

  const sortedListings = useMemo(() => {
    const list = [...filteredListings];
    list.sort((a, b) =>
      sortBy === 'name_desc'
        ? b.propertyTypeName.localeCompare(a.propertyTypeName)
        : a.propertyTypeName.localeCompare(b.propertyTypeName)
    );
    return list;
  }, [filteredListings, sortBy]);

  const handleDelete = async (listing: ListingRow) => {
    if (!canMutateListing) return;
    if (
      !window.confirm(`Delete listing "${listing.propertyTypeName}"? This cannot be undone.`)
    ) {
      return;
    }
    try {
      if (phonePreview?.listingKey === `${listing.propertyId}-${listing.id}`) {
        setPhonePreview(null);
      }
      const { deletedProperty } = await deletePropertyListing({
        propertyId: listing.propertyId,
        listingId: listing.id,
      });
      toast.success(
        deletedProperty ? 'Listing removed (empty agency portfolio cleaned up).' : 'Listing deleted.'
      );
    } catch {
      toast.error('Failed to delete listing.');
    }
  };

  const handleClone = async (listing: ListingRow) => {
    if (!canMutateListing) return;
    if (!window.confirm(`Clone "${listing.propertyTypeName}"?`)) return;
    setCloningId(listing.id);
    try {
      const siblings = listings
        .filter((l) => l.propertyId === listing.propertyId)
        .map((l) => ({ id: l.id, urlSlug: l.urlSlug, typeSlug: l.typeSlug }));
      const result = await clonePropertyListing({
        propertyId: listing.propertyId,
        sourceTypeId: listing.id,
        sourceData: listing.raw,
        existingTypes: siblings,
        propertyName: agenciesById[listing.propertyId]?.propertyName,
      });
      toast.success('Listing cloned.');
      navigate(listingEditHref(listing.propertyId, result.newTypeId));
    } catch {
      toast.error('Failed to clone listing.');
    } finally {
      setCloningId(null);
    }
  };

  const handleCopyUrl = async (listing: ListingRow) => {
    const agency = agenciesById[listing.propertyId];
    const url = guestUrlFor(agency, listing);
    if (!url) {
      toast.warning('Set property and listing URL slugs before copying.');
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrlId(listing.id);
      window.setTimeout(() => setCopiedUrlId(null), 2000);
      toast.success('Guest portal URL copied.');
    } catch {
      toast.error('Could not copy URL.');
    }
  };

  const handleDownloadQr = async (listing: ListingRow) => {
    const agency = agenciesById[listing.propertyId];
    const url = guestUrlFor(agency, listing);
    if (!url) {
      toast.warning('Set property and listing URL slugs before downloading a QR code.');
      return;
    }
    setQrDownloadingId(listing.id);
    try {
      await downloadGuestPortalQrCode(
        url,
        guestPortalQrFilename(
          { urlSlug: agency?.urlSlug },
          {
            urlSlug: listing.urlSlug,
            typeSlug: listing.typeSlug,
            propertyTypeName: listing.propertyTypeName,
          }
        )
      );
    } catch {
      toast.error('Failed to download QR code.');
    } finally {
      setQrDownloadingId(null);
    }
  };

  const openPhonePreview = (listing: ListingRow) => {
    const agency = agenciesById[listing.propertyId];
    const propSlug = formatGuestSlug(agency?.urlSlug || '');
    const unitSlug = getTypePublicSlug(listing);
    if (!propSlug || !unitSlug) {
      toast.warning('Set property and listing URL slugs before opening the portal.');
      return;
    }
    // Preview iframe is sized like a real phone; outer CSS scales the mock only.
    const url = buildAdminGuestPortalPreviewUrl(
      window.location.origin,
      propSlug,
      unitSlug,
      listing.id,
      { mobileFrame: true }
    );
    setPhonePreview({
      listingKey: `${listing.propertyId}-${listing.id}`,
      title: listing.propertyTypeName,
      url,
    });
  };

  const setLayout = (mode: ListingLayoutMode) => setLayoutMode(mode);

  if (loading) {
    return <div className="py-16 text-center text-gray-500 text-sm">Loading listings…</div>;
  }

  return (
    <div className="admin-page">
      <AdminPageHeader
        title="Property Listings"
        description={
          isScopedUser
            ? capacity
              ? 'Your property listings — add more within your capacity'
              : 'Property listings assigned to your account'
            : 'Manage rentable property listings and guest portals'
        }
        icon={<Building2 size={26} />}
        action={
          canAddListing ? (
            <AdminButtonLink to={adminPath('/add-property')} variant="accent" className="w-full sm:w-auto">
              <Plus size={18} /> Add listing
            </AdminButtonLink>
          ) : undefined
        }
      />

      {capacity && (
        <AdminCard className="p-4 sm:p-5 mb-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-1">
                Capacity
              </p>
              <p className="text-xl font-bold text-vailo-dark">
                {capacity.unlimited ? 'Unlimited' : formatMaxListingsLabel(capacity.max)}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-1">
                Listings used
              </p>
              <p className="text-xl font-bold text-vailo-dark tabular-nums">{capacity.used}</p>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-1">
                Remaining
              </p>
              <p className="text-xl font-bold text-vailo-dark tabular-nums">
                {capacity.unlimited ? 'Unlimited' : capacity.remaining}
              </p>
            </div>
          </div>
        </AdminCard>
      )}

      {visibleListings.length > 0 && (
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
                placeholder="Search by listing, address, ref, or agent…"
                className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-vailo-teal/20 focus:border-vailo-teal/40"
                aria-label="Search listings"
              />
            </div>
            <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1 shrink-0">
              <button
                type="button"
                onClick={() => setLayout('rows')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  layoutMode === 'rows'
                    ? 'bg-vailo-teal text-white'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
                title="List as rows"
              >
                <Rows3 size={14} />
                Rows
              </button>
              <button
                type="button"
                onClick={() => setLayout('boxes')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  layoutMode === 'boxes'
                    ? 'bg-vailo-teal text-white'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
                title="List as boxes"
              >
                <LayoutGrid size={14} />
                Boxes
              </button>
            </div>
            <select
              id="listings-sort"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as ListingSort)}
              className="px-3 py-2 border border-gray-200 rounded-xl text-sm font-medium bg-white"
            >
              <option value="title_asc">Title A–Z</option>
              <option value="name_desc">Title Z–A</option>
            </select>
          </div>
        </AdminCard>
      )}

      {visibleListings.length === 0 ? (
        <AdminEmptyState
          icon={<Building2 size={32} />}
          title={isScopedUser ? 'No listings yet' : 'No property listings yet'}
          description={
            capacity
              ? 'Add your first property listing. It will count toward your capacity.'
              : isScopedUser
                ? 'Your account is not linked to any listing yet. Contact your Vailo administrator.'
                : 'Add a property listing to set up guest portals, local gems, and house guides.'
          }
          action={
            canAddListing ? (
              <AdminButtonLink to={adminPath('/add-property')} variant="accent">
                <Plus size={18} /> Add listing
              </AdminButtonLink>
            ) : undefined
          }
        />
      ) : sortedListings.length === 0 ? (
        <AdminEmptyState
          icon={<Search size={32} />}
          title="No matches"
          description="Try a different search."
        />
      ) : layoutMode === 'rows' ? (
        <div className="grid gap-3">
          {sortedListings.map((listing) => {
            const agency = agenciesById[listing.propertyId];
            const allocatedOwner = listing.ownerId ? owners[listing.ownerId] : undefined;
            const portalUrl = guestUrlFor(agency, listing);
            const href = listingEditHref(listing.propertyId, listing.id);
            const listingKey = `${listing.propertyId}-${listing.id}`;
            const previewOpen = phonePreview?.listingKey === listingKey;
            const area = listing.area || listing.city;

            return (
              <AdminCard
                key={listingKey}
                className={`overflow-hidden ${
                  previewOpen ? 'ring-2 ring-vailo-teal/20 border-vailo-teal/40' : ''
                }`}
              >
                <div className="flex">
                  <div className="w-1.5 shrink-0 bg-vailo-teal" aria-hidden />
                  <div className="flex-1 min-w-0 p-4 flex flex-col lg:flex-row lg:items-center gap-4">
                    {listing.photoUrl ? (
                      <img
                        src={listing.photoUrl}
                        alt=""
                        className="h-14 w-20 rounded-lg object-cover shrink-0 border border-gray-100"
                      />
                    ) : (
                      <div className="h-14 w-20 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0">
                        <Building2 size={18} className="text-gray-300" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link to={href} className="font-semibold text-vailo-teal hover:underline">
                          {listing.propertyTypeName}
                        </Link>
                        {listing.internalRefCode ? (
                          <span className="text-xs font-mono text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md">
                            {listing.internalRefCode}
                          </span>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-1 mt-1 min-w-0">
                        <p className="text-sm text-gray-500 truncate flex-1">
                          {portalUrl || 'Set property and unit URL slugs'}
                        </p>
                        <button
                          type="button"
                          onClick={() => void handleCopyUrl(listing)}
                          className="p-1 text-gray-400 hover:text-vailo-teal shrink-0"
                          title="Copy guest portal URL"
                        >
                          {copiedUrlId === listing.id ? (
                            <Check size={14} className="text-emerald-600" />
                          ) : (
                            <Copy size={14} />
                          )}
                        </button>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                        {(listing.addressLine || area || listing.country) && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin size={11} className="text-vailo-teal/50" />
                            {[listing.addressLine, area, listing.country]
                              .filter(Boolean)
                              .join(', ')}
                          </span>
                        )}
                        {allocatedOwner ? (
                          <span className="inline-flex items-center gap-1">
                            <User size={11} />
                            {allocatedOwner.fullName}
                          </span>
                        ) : (
                          <span className="italic text-gray-400">No owner assigned</span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <Link
                        to={href}
                        className="flex items-center text-sm font-medium text-vailo-teal hover:text-vailo-dark"
                      >
                        <Pencil size={14} className="mr-1.5" /> Edit
                      </Link>
                      {canMutateListing ? (
                        <button
                          type="button"
                          onClick={() => void handleClone(listing)}
                          disabled={cloningId === listing.id}
                          className="flex items-center text-sm font-medium text-vailo-teal hover:text-vailo-dark disabled:opacity-50"
                        >
                          {cloningId === listing.id ? (
                            <Loader2 size={14} className="mr-1.5 animate-spin" />
                          ) : (
                            <Copy size={14} className="mr-1.5" />
                          )}
                          Clone
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => void handleDownloadQr(listing)}
                        disabled={qrDownloadingId === listing.id}
                        className="flex items-center text-sm font-medium text-vailo-teal hover:text-vailo-dark disabled:opacity-50"
                      >
                        {qrDownloadingId === listing.id ? (
                          <Loader2 size={14} className="mr-1.5 animate-spin" />
                        ) : (
                          <QrCode size={14} className="mr-1.5" />
                        )}
                        Download QR
                      </button>
                      <button
                        type="button"
                        onClick={() => openPhonePreview(listing)}
                        className={`p-2 rounded-lg ${
                          previewOpen
                            ? 'text-vailo-teal bg-vailo-teal/10'
                            : 'text-vailo-teal hover:bg-vailo-teal/5'
                        }`}
                        title="Guest portal preview"
                      >
                        <Smartphone size={18} />
                      </button>
                      {canMutateListing ? (
                        <button
                          type="button"
                          onClick={() => void handleDelete(listing)}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                          title="Delete listing"
                        >
                          <Trash2 size={16} />
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </AdminCard>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {sortedListings.map((listing) => {
            const agency = agenciesById[listing.propertyId];
            const allocatedOwner = listing.ownerId ? owners[listing.ownerId] : undefined;
            const portalUrl = guestUrlFor(agency, listing);
            const href = listingEditHref(listing.propertyId, listing.id);
            const listingKey = `${listing.propertyId}-${listing.id}`;
            const previewOpen = phonePreview?.listingKey === listingKey;
            const area = listing.area || listing.city;

            return (
              <div
                key={listingKey}
                className={`border rounded-xl overflow-hidden hover:shadow-md transition-shadow bg-white flex flex-col ${
                  previewOpen ? 'border-vailo-teal ring-2 ring-vailo-teal/15' : 'border-gray-200'
                }`}
              >
                {listing.photoUrl ? (
                  <div className="h-32 w-full bg-gray-100">
                    <img
                      src={listing.photoUrl}
                      alt={listing.propertyTypeName}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="h-16 w-full bg-gray-50 flex items-center justify-center border-b border-gray-100">
                    <Building2 size={24} className="text-gray-300" />
                  </div>
                )}
                <div className="p-5 flex flex-col flex-1">
                  <div className="flex justify-between items-start gap-2 mb-2">
                    <h4 className="font-bold text-gray-900 leading-snug">
                      {listing.propertyTypeName}
                    </h4>
                    {listing.internalRefCode ? (
                      <span className="text-xs font-semibold bg-gray-100 text-gray-600 px-2 py-1 rounded-md shrink-0 font-mono">
                        {listing.internalRefCode}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1 mb-3 min-w-0">
                    <p className="text-sm text-gray-500 truncate flex-1">
                      {portalUrl || 'Set property and unit URL slugs'}
                    </p>
                    <button
                      type="button"
                      onClick={() => void handleCopyUrl(listing)}
                      className="p-1.5 text-gray-400 hover:text-vailo-teal shrink-0"
                    >
                      {copiedUrlId === listing.id ? (
                        <Check size={16} className="text-emerald-600" />
                      ) : (
                        <Copy size={16} />
                      )}
                    </button>
                  </div>
                  {(listing.addressLine || area || listing.country) && (
                    <p className="text-xs text-gray-500 mb-3 inline-flex items-start gap-1.5">
                      <MapPin size={12} className="mt-0.5 shrink-0 text-vailo-teal/50" />
                      <span>
                        {[listing.addressLine, area, listing.country].filter(Boolean).join(', ')}
                      </span>
                    </p>
                  )}
                  <div className="flex-1 mb-4">
                    {allocatedOwner ? (
                      <p className="text-sm text-gray-700 flex items-center bg-gray-50 p-2 rounded-lg border border-gray-100 w-max max-w-full">
                        <User size={14} className="mr-2 text-gray-400 shrink-0" />
                        <span className="truncate">{allocatedOwner.fullName}</span>
                      </p>
                    ) : (
                      <p className="text-sm text-gray-400 italic">No owner assigned</p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pt-4 border-t border-gray-100 mt-auto">
                    <Link
                      to={href}
                      className="flex items-center text-sm font-medium text-vailo-teal hover:text-vailo-dark"
                    >
                      <Pencil size={14} className="mr-1.5" /> Edit
                    </Link>
                    {canMutateListing ? (
                      <button
                        type="button"
                        onClick={() => void handleClone(listing)}
                        disabled={cloningId === listing.id}
                        className="flex items-center text-sm font-medium text-vailo-teal hover:text-vailo-dark disabled:opacity-50"
                      >
                        {cloningId === listing.id ? (
                          <Loader2 size={14} className="mr-1.5 animate-spin" />
                        ) : (
                          <Copy size={14} className="mr-1.5" />
                        )}
                        Clone
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void handleDownloadQr(listing)}
                      disabled={qrDownloadingId === listing.id}
                      className="flex items-center text-sm font-medium text-vailo-teal hover:text-vailo-dark disabled:opacity-50"
                    >
                      {qrDownloadingId === listing.id ? (
                        <Loader2 size={14} className="mr-1.5 animate-spin" />
                      ) : (
                        <QrCode size={14} className="mr-1.5" />
                      )}
                      Download QR
                    </button>
                    <div className="flex items-center gap-1 ml-auto">
                      <button
                        type="button"
                        onClick={() => openPhonePreview(listing)}
                        className={`p-2 rounded-lg ${
                          previewOpen
                            ? 'text-vailo-teal bg-vailo-teal/10'
                            : 'text-vailo-teal hover:bg-vailo-teal/5'
                        }`}
                        title="Guest portal preview"
                      >
                        <Smartphone size={18} />
                      </button>
                      {canMutateListing ? (
                        <button
                          type="button"
                          onClick={() => void handleDelete(listing)}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                        >
                          <Trash2 size={16} />
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {phonePreview
        ? createPortal(
            <GuestPortalPhonePreviewModal
              title={phonePreview.title}
              url={phonePreview.url}
              onClose={() => setPhonePreview(null)}
            />,
            document.body
          )
        : null}
    </div>
  );
}

function guestUrlFor(agency: AgencyShell | undefined, listing: ListingRow): string {
  if (!agency) return '';
  return (
    buildGuestPortalPublicListingUrl(
      { urlSlug: agency.urlSlug },
      {
        id: listing.id,
        propertyTypeName: listing.propertyTypeName,
        urlSlug: listing.urlSlug,
        typeSlug: listing.typeSlug,
      }
    ) || ''
  );
}

/** Logical phone size for the guest portal; outer CSS scales the mock so layout stays correct. */
const PREVIEW_DEVICE_WIDTH = 390;
const PREVIEW_DEVICE_HEIGHT = 844;
const PREVIEW_CHROME = 12;

function GuestPortalPhonePreviewModal({
  title,
  url,
  onClose,
}: {
  title: string;
  url: string;
  onClose: () => void;
}) {
  const [scale, setScale] = useState(0.72);

  useEffect(() => {
    const update = () => {
      const maxW = Math.max(240, window.innerWidth - 48);
      const maxH = Math.max(360, window.innerHeight - 96);
      const frameW = PREVIEW_DEVICE_WIDTH + PREVIEW_CHROME;
      const frameH = PREVIEW_DEVICE_HEIGHT + PREVIEW_CHROME + 28;
      setScale(Math.min(1, maxW / frameW, maxH / frameH));
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const frameW = (PREVIEW_DEVICE_WIDTH + PREVIEW_CHROME) * scale;
  const frameH = (PREVIEW_DEVICE_HEIGHT + PREVIEW_CHROME) * scale;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label="Guest portal preview"
      onClick={onClose}
    >
      <div className="relative" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={onClose}
          className="absolute -top-3 -right-3 z-20 h-9 w-9 rounded-full bg-white text-gray-700 shadow-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50"
          aria-label="Close guest portal preview"
        >
          <X size={18} />
        </button>
        <p className="text-center text-xs font-semibold text-white/90 mb-2 drop-shadow">
          Guest portal preview · {title}
        </p>
        <div style={{ width: frameW, height: frameH }} className="mx-auto">
          <div
            className="origin-top-left"
            style={{
              width: PREVIEW_DEVICE_WIDTH + PREVIEW_CHROME,
              height: PREVIEW_DEVICE_HEIGHT + PREVIEW_CHROME,
              transform: `scale(${scale})`,
            }}
          >
            <div className="relative rounded-[2rem] border-[6px] border-gray-900 bg-gray-900 shadow-[0_24px_80px_rgba(0,0,0,0.45)] overflow-hidden">
              <div className="absolute top-0 inset-x-0 z-30 flex justify-center pt-1.5 pointer-events-none">
                <div className="h-4 w-[5.5rem] rounded-b-2xl bg-gray-900" />
              </div>
              <iframe
                title={`Guest portal — ${title}`}
                src={url}
                width={PREVIEW_DEVICE_WIDTH}
                height={PREVIEW_DEVICE_HEIGHT}
                className="block bg-white border-0"
                allow="clipboard-write"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
