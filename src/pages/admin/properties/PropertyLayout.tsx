import { useEffect, useMemo, useState } from 'react';
import { useParams, Link, NavLink, Navigate, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import {
  ArrowLeft,
  Home,
  Building,
  CalendarCheck,
  Calendar as CalendarIcon,
  MapPin,
  Leaf,
  BookOpen,
  Handshake,
  Sparkles,
  AlertTriangle,
  ThumbsUp,
  Users,
  FlaskConical,
  BarChart3,
} from 'lucide-react';
import { AdminBadge } from '../../../components/admin/AdminPageHeader';
import { useUnseenGuestIssuesCount } from '../../../hooks/useUnseenGuestIssuesCount';
import { useAdminSession } from '../../../context/AdminSessionContext';
import {
  getPropertyAccessMode,
  isTabAllowedForAccess,
  type PropertyAccessMode,
} from '../../../lib/adminAccess';

const TABS = [
  { name: 'Overview', path: '', icon: Home, badgeKey: null },
  { name: 'Property Listings', path: 'types', icon: Building, badgeKey: null },
  { name: 'Reservations', path: 'reservations', icon: CalendarCheck, badgeKey: null },
  { name: 'Calendar', path: 'calendar', icon: CalendarIcon, badgeKey: null },
  { name: 'Local Gems', path: 'local-gems', icon: MapPin, badgeKey: null },
  { name: 'Green Score', path: 'green-score', icon: Leaf, badgeKey: null },
  { name: 'House Guide', path: 'house-guide', icon: BookOpen, badgeKey: null },
  { name: 'Features', path: 'features', icon: Handshake, badgeKey: null },
  { name: 'Guest Issues', path: 'guest-issues', icon: AlertTriangle, badgeKey: 'guestIssues' as const },
  { name: 'Pick Feedback', path: 'pick-feedback', icon: ThumbsUp, badgeKey: null },
  { name: 'AI Gaps', path: 'ai-gaps', icon: Sparkles, badgeKey: null },
  { name: 'House Guests', path: 'house-guests', icon: Users, badgeKey: null },
  { name: 'Visitor access', path: 'testers', icon: FlaskConical, badgeKey: null },
  { name: 'Analytics', path: 'analytics', icon: BarChart3, badgeKey: null },
];

export type PropertyRecord = {
  id: string;
  propertyName?: string;
  internalRefCode?: string;
  urlSlug?: string;
  previousUrlSlugs?: string[];
  listingKind?: string;
  country?: string;
  area?: string;
  city?: string;
  ownerId?: string;
  listingUrl?: string;
  googleMapsUrl?: string;
  createdAt?: string;
  guestPortalAccessRequired?: boolean;
};

export type PropertyOutletContext = {
  property: PropertyRecord;
  propertyId: string;
  propertyAccess: PropertyAccessMode;
  lockedListingId: string | null;
};

export default function PropertyLayout() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { profile } = useAdminSession();
  const [property, setProperty] = useState<PropertyRecord | null>(null);
  const [typeRows, setTypeRows] = useState<
    { id: string; propertyId: string; ownerId?: string }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const unseenGuestIssues = useUnseenGuestIssuesCount(id);

  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(
      doc(db, 'properties', id),
      (snap) => {
        if (snap.exists()) {
          setProperty({ id: snap.id, ...snap.data() } as PropertyRecord);
        } else {
          setProperty(null);
        }
        setLoading(false);
      },
      (err) => {
        console.error('Error fetching property:', err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(collection(db, 'properties', id, 'propertyTypes'), (snap) => {
      setTypeRows(
        snap.docs.map((d) => ({
          id: d.id,
          propertyId: id,
          ownerId: d.data().ownerId as string | undefined,
        }))
      );
    });
    return () => unsub();
  }, [id]);

  const propertyAccess = useMemo(
    () =>
      property && id
        ? getPropertyAccessMode(profile, id, property.ownerId, typeRows)
        : null,
    [profile, property, id, typeRows]
  );

  const lockedListingId = useMemo(() => {
    if (propertyAccess?.level !== 'listing_only') return null;
    const fromQuery = searchParams.get('listing');
    if (fromQuery && propertyAccess.typeIds.includes(fromQuery)) return fromQuery;
    return propertyAccess.typeIds[0] || null;
  }, [propertyAccess, searchParams]);

  const visibleTabs = useMemo(
    () => TABS.filter((tab) => isTabAllowedForAccess(tab.path, propertyAccess)),
    [propertyAccess]
  );

  const currentSegment = location.pathname.split(`/properties/${id}/`)[1]?.split('/')[0] ?? '';

  useEffect(() => {
    if (!id || !propertyAccess || loading) return;
    if (propertyAccess.level !== 'listing_only') return;

    const allowed = isTabAllowedForAccess(currentSegment, propertyAccess);
    if (!allowed && lockedListingId) {
      const target =
        currentSegment === 'house-guide'
          ? `/properties/${id}/house-guide?listing=${lockedListingId}`
          : `/properties/${id}/types?listing=${lockedListingId}`;
      navigate(target, { replace: true });
    }
  }, [id, propertyAccess, currentSegment, lockedListingId, loading, navigate]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-500 text-sm">
        Loading property…
      </div>
    );
  }
  if (!property || !propertyAccess) {
    return (
      <div className="flex items-center justify-center py-24 text-red-500 text-sm">
        Property not found.
      </div>
    );
  }

  const outletContext: PropertyOutletContext = {
    property,
    propertyId: id!,
    propertyAccess,
    lockedListingId,
  };

  return (
    <div className="admin-page">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6 sm:mb-8 pb-5 sm:pb-6 border-b border-gray-200/80">
        <div className="flex items-start sm:items-center gap-3 min-w-0">
          <Link
            to="/properties"
            className="p-2.5 rounded-xl hover:bg-vailo-teal/5 text-gray-400 hover:text-vailo-teal transition-colors shrink-0 border border-transparent hover:border-vailo-teal/10"
          >
            <ArrowLeft size={20} />
          </Link>
          <div className="min-w-0">
            <h2 className="text-xl sm:text-2xl lg:text-[1.65rem] font-bold text-vailo-dark font-luxury truncate">
              {property.propertyName}
            </h2>
            <p className="text-gray-500 text-sm mt-0.5">
              {propertyAccess.level === 'listing_only'
                ? 'Listing access — assigned unit only'
                : 'Property management'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {propertyAccess.level === 'listing_only' && (
            <AdminBadge variant="gold">Listing only</AdminBadge>
          )}
          {property.listingKind && (
            <AdminBadge variant={property.listingKind === 'hotel' ? 'gold' : 'teal'}>
              {property.listingKind === 'hotel' ? 'Hotel' : 'Property'}
            </AdminBadge>
          )}
          {property.internalRefCode && (
            <AdminBadge variant="teal">{property.internalRefCode}</AdminBadge>
          )}
        </div>
      </div>

      <div className="flex flex-col xl:flex-row gap-5 xl:gap-8">
        <nav className="xl:w-60 shrink-0">
          <div className="xl:sticky xl:top-24">
            <p className="hidden xl:block text-[10px] font-bold text-gray-400 uppercase tracking-[0.18em] mb-2.5 px-1">
              Sections
            </p>
            <div className="flex xl:flex-col gap-1.5 overflow-x-auto admin-scroll-x pb-1 xl:pb-0 -mx-1 px-1 xl:mx-0 xl:px-0 xl:bg-white xl:border xl:border-gray-100 xl:rounded-2xl xl:p-2 xl:shadow-[0_2px_16px_-6px_rgba(11,79,92,0.1)]">
              {visibleTabs.map((tab) => {
                const to =
                  tab.path === 'types' || tab.path === 'house-guide'
                    ? lockedListingId
                      ? `${tab.path}?listing=${lockedListingId}`
                      : tab.path
                    : tab.path;
                return (
                  <NavLink
                    key={tab.name}
                    to={to}
                    end={tab.path === ''}
                    className={({ isActive }) =>
                      `flex items-center gap-2 xl:gap-2.5 px-3.5 xl:px-3 py-2.5 text-xs xl:text-sm font-medium rounded-xl whitespace-nowrap shrink-0 transition-all ${
                        isActive
                          ? 'bg-vailo-teal text-white shadow-sm shadow-vailo-teal/20'
                          : 'bg-white xl:bg-transparent text-gray-600 border border-gray-100 xl:border-0 hover:bg-vailo-surface-elevated hover:text-vailo-teal'
                      }`
                    }
                  >
                    <tab.icon size={16} className="shrink-0 opacity-90" />
                    <span className="flex-1 truncate">{tab.name}</span>
                    {tab.badgeKey === 'guestIssues' && unseenGuestIssues > 0 && (
                      <span className="min-w-[20px] h-5 px-1.5 flex items-center justify-center rounded-full bg-vailo-gold text-vailo-dark text-[10px] font-bold tabular-nums">
                        {unseenGuestIssues > 99 ? '99+' : unseenGuestIssues}
                      </span>
                    )}
                  </NavLink>
                );
              })}
            </div>
          </div>
        </nav>

        <div className="flex-1 min-w-0 bg-white border border-gray-100 rounded-2xl shadow-[0_2px_16px_-6px_rgba(11,79,92,0.1)] p-4 sm:p-6 lg:p-8 xl:p-10 min-h-[420px]">
          {propertyAccess.level === 'listing_only' && lockedListingId && currentSegment === '' ? (
            <Navigate
              to={`/properties/${id}/types?listing=${lockedListingId}`}
              replace
            />
          ) : (
            <Outlet context={outletContext} />
          )}
        </div>
      </div>
    </div>
  );
}
