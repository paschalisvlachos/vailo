import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useParams, Link, NavLink, Navigate, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import {
  ArrowLeft,
  Home,
  Building,
  CalendarCheck,
  ClipboardCheck,
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
  Info,
  X,
  type LucideIcon,
} from 'lucide-react';
import { AdminBadge } from '../../../components/admin/AdminPageHeader';
import { useUnseenGuestIssuesCount } from '../../../hooks/useUnseenGuestIssuesCount';
import { useAdminSession } from '../../../context/AdminSessionContext';
import {
  getPropertyAccessMode,
  isTabAllowedForAccess,
  type PropertyAccessMode,
} from '../../../lib/adminAccess';
import { isPreArrivalCheckInEnabled } from '../../../lib/preArrivalSettings';
import { isCalendarSyncEnabled } from '../../../lib/icalSync';
import { adminPath } from '../../../lib/adminRoutes';
import { propertyListingQuerySuffix } from '../../../hooks/usePropertyListingQuery';

type PropertyTab = {
  name: string;
  path: string;
  icon: LucideIcon;
  badgeKey: 'guestIssues' | null;
  help: string;
};

const TABS: PropertyTab[] = [
  {
    name: 'Overview',
    path: '',
    icon: Home,
    badgeKey: null,
    help: 'Property identity, guest-experience switches, languages, and high-level status. Start here to see what is set up and jump to the next incomplete area.',
  },
  {
    name: 'Property Listings',
    path: 'types',
    icon: Building,
    badgeKey: null,
    help: 'Each rentable unit under this property (name, address, Maps link, OTA URLs, photo, Wi‑Fi, iCal). Guests open the portal per listing.',
  },
  {
    name: 'Reservations',
    path: 'reservations',
    icon: CalendarCheck,
    badgeKey: null,
    help: 'Bookings imported from your calendar feeds or added manually. Used for guest access windows, invites, and stay dates.',
  },
  {
    name: 'Check-ins',
    path: 'check-ins',
    icon: ClipboardCheck,
    badgeKey: null,
    help: 'Online pre-arrival check-in responses from guests (IDs, arrival details, extras). Only relevant when Online check-in is turned on.',
  },
  {
    name: 'Calendar',
    path: 'calendar',
    icon: CalendarIcon,
    badgeKey: null,
    help: 'Availability view of synced and manual reservations. Use this to spot overlaps and confirm iCal sync is working.',
  },
  {
    name: 'Local Gems',
    path: 'local-gems',
    icon: MapPin,
    badgeKey: null,
    help: 'Curated places near this property for the guest portal (restaurants, beaches, activities). Can mix property picks with area catalog places.',
  },
  {
    name: 'Green Score',
    path: 'green-score',
    icon: Leaf,
    badgeKey: null,
    help: 'Sustainability practices and eco messaging shown to guests. Track what you already do and what you can improve.',
  },
  {
    name: 'House Guide',
    path: 'house-guide',
    icon: BookOpen,
    badgeKey: null,
    help: 'The stay handbook: check-in, Wi‑Fi, appliances, house rules, and more. Fill sections manually or with AI Import from notes and files.',
  },
  {
    name: 'Features',
    path: 'features',
    icon: Handshake,
    badgeKey: null,
    help: 'Property amenities and highlights (pool, parking, workspace, etc.) that guests see as selling points and practical info.',
  },
  {
    name: 'Guest Issues',
    path: 'guest-issues',
    icon: AlertTriangle,
    badgeKey: 'guestIssues',
    help: 'Problems guests reported from the portal (broken item, missing supply, noise). Review, resolve, and keep the stay running smoothly.',
  },
  {
    name: 'Pick Feedback',
    path: 'pick-feedback',
    icon: ThumbsUp,
    badgeKey: null,
    help: 'Guest reactions to Local Gems and AI picks (likes/dislikes). Use it to improve recommendations over time.',
  },
  {
    name: 'AI Gaps',
    path: 'ai-gaps',
    icon: Sparkles,
    badgeKey: null,
    help: 'Where the concierge AI lacks knowledge for this property. Fill gaps so guest answers stay accurate and on-brand.',
  },
  {
    name: 'House Guests',
    path: 'house-guests',
    icon: Users,
    badgeKey: null,
    help: 'Guests linked to stays and invites for this property. Manage who has portal access around their booking.',
  },
  {
    name: 'Visitor access',
    path: 'testers',
    icon: FlaskConical,
    badgeKey: null,
    help: 'Temporary visitor or tester codes so you (or partners) can open the guest portal without a real reservation.',
  },
  {
    name: 'Analytics',
    path: 'analytics',
    icon: BarChart3,
    badgeKey: null,
    help: 'Usage signals for this property: portal activity, engagement, and trends that show what guests actually use.',
  },
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
  reservationSplitEnabled?: boolean;
  /** When false, iCal sync is locked and Calendar / Reservations are hidden. */
  calendarSyncEnabled?: boolean;
  /** When false, in-portal Check in is hidden for this property. */
  preArrivalCheckInEnabled?: boolean;
  preArrivalTransferOffer?: {
    enabled?: boolean;
    label?: string;
    priceEur?: number;
    paymentNote?: string;
  };
  autoSendGuestInviteWhenReady?: boolean;
  contentPrimaryLocale?: string;
  contentEnabledLocales?: string[];
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
  const [openHelpPath, setOpenHelpPath] = useState<string | null>(null);
  const [helpAnchor, setHelpAnchor] = useState<{ top: number; left: number } | null>(null);
  const helpCardRef = useRef<HTMLDivElement>(null);
  const unseenGuestIssues = useUnseenGuestIssuesCount(id);

  const openHelpTab = useMemo(
    () => (openHelpPath == null ? null : TABS.find((t) => t.path === openHelpPath) || null),
    [openHelpPath]
  );

  useEffect(() => {
    if (!openHelpTab) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (helpCardRef.current?.contains(target)) return;
      if ((target as HTMLElement)?.closest?.('[data-tab-help-trigger]')) return;
      setOpenHelpPath(null);
      setHelpAnchor(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenHelpPath(null);
        setHelpAnchor(null);
      }
    };
    const onReposition = () => {
      setOpenHelpPath(null);
      setHelpAnchor(null);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [openHelpTab]);

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
    () =>
      TABS.filter((tab) => {
        if (tab.path === 'check-ins' && !isPreArrivalCheckInEnabled(property)) {
          return false;
        }
        if (
          (tab.path === 'reservations' || tab.path === 'calendar') &&
          !isCalendarSyncEnabled(property)
        ) {
          return false;
        }
        return isTabAllowedForAccess(tab.path, propertyAccess);
      }),
    [propertyAccess, property]
  );

  const currentSegment = location.pathname.split(`${adminPath(`/properties/${id}`)}/`)[1]?.split('/')[0] ?? '';

  useEffect(() => {
    if (!id || !propertyAccess || loading) return;
    if (propertyAccess.level !== 'listing_only') return;

    const allowed = isTabAllowedForAccess(currentSegment, propertyAccess);
    if (!allowed && lockedListingId) {
      const target =
        currentSegment === 'house-guide'
          ? adminPath(`/properties/${id}/house-guide?listing=${lockedListingId}`)
          : adminPath(`/properties/${id}/types?listing=${lockedListingId}`);
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
            to={adminPath('/properties')}
            className="p-2.5 rounded hover:bg-vailo-teal/5 text-gray-400 hover:text-vailo-teal transition-colors shrink-0 border border-transparent hover:border-vailo-teal/10"
          >
            <ArrowLeft size={20} />
          </Link>
          <div className="min-w-0">
            <h2 className="text-xl sm:text-2xl lg:text-[1.65rem] font-semibold text-vailo-dark truncate">
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
            <div className="flex xl:flex-col gap-1.5 overflow-x-auto admin-scroll-x pb-1 xl:pb-0 -mx-1 px-1 xl:mx-0 xl:px-0 xl:bg-white xl:rounded xl:p-2 xl:shadow-[1px_1px_15px_rgba(0,0,0,0.1)]">
              {visibleTabs.map((tab) => {
                const listingSuffix = propertyListingQuerySuffix(
                  lockedListingId || searchParams.get('listing')
                );
                const to =
                  tab.path === ''
                    ? listingSuffix || ''
                    : `${tab.path}${listingSuffix}`;
                const helpOpen = openHelpPath === tab.path;
                return (
                  <div
                    key={tab.name}
                    className="flex items-stretch gap-0.5 shrink-0 xl:w-full"
                  >
                    <NavLink
                      to={to}
                      end={tab.path === ''}
                      onClick={() => {
                        setOpenHelpPath(null);
                        setHelpAnchor(null);
                      }}
                      className={({ isActive }) =>
                        `flex items-center gap-2 xl:gap-2.5 pl-3.5 xl:pl-3 pr-2 py-2.5 text-xs xl:text-sm font-medium rounded-l whitespace-nowrap flex-1 min-w-0 transition-all ${
                          isActive
                            ? 'bg-vailo-teal text-white'
                            : 'bg-white xl:bg-transparent text-gray-600 border border-[#eeeeee] xl:border-0 border-r-0 hover:bg-vailo-surface-elevated hover:text-vailo-teal'
                        }`
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <tab.icon size={16} className="shrink-0 opacity-90" />
                          <span className="flex-1 truncate text-left">{tab.name}</span>
                          {tab.badgeKey === 'guestIssues' && unseenGuestIssues > 0 && (
                            <span
                              className={`min-w-[20px] h-5 px-1.5 flex items-center justify-center rounded-full text-[10px] font-bold tabular-nums ${
                                isActive
                                  ? 'bg-white/20 text-white'
                                  : 'bg-vailo-gold text-vailo-dark'
                              }`}
                            >
                              {unseenGuestIssues > 99 ? '99+' : unseenGuestIssues}
                            </span>
                          )}
                        </>
                      )}
                    </NavLink>
                    <button
                      type="button"
                      data-tab-help-trigger={tab.path || 'overview'}
                      aria-label={`About ${tab.name}`}
                      aria-expanded={helpOpen}
                      title={`About ${tab.name}`}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (helpOpen) {
                          setOpenHelpPath(null);
                          setHelpAnchor(null);
                          return;
                        }
                        const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                        const width = 288;
                        const left = Math.min(
                          Math.max(12, rect.right + 8),
                          window.innerWidth - width - 12
                        );
                        const top = Math.min(
                          Math.max(12, rect.top),
                          window.innerHeight - 160
                        );
                        setHelpAnchor({ top, left });
                        setOpenHelpPath(tab.path);
                      }}
                      className={`shrink-0 px-2.5 rounded-r border transition-colors ${
                        helpOpen
                          ? 'bg-vailo-teal text-white border-vailo-teal'
                          : 'bg-white xl:bg-transparent border-[#eeeeee] text-gray-400 hover:text-vailo-teal hover:bg-vailo-surface-elevated'
                      }`}
                    >
                      <Info size={14} strokeWidth={2.25} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </nav>

        {openHelpTab && helpAnchor
          ? createPortal(
              <div
                ref={helpCardRef}
                role="dialog"
                aria-label={`${openHelpTab.name} explained`}
                style={{ top: helpAnchor.top, left: helpAnchor.left }}
                className="admin-shell fixed z-[80] w-72 max-w-[calc(100vw-1.5rem)] rounded border border-vailo-teal/20 bg-white p-4 shadow-[1px_1px_15px_rgba(0,0,0,0.15)]"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-vailo-teal">
                    {openHelpTab.name}
                  </p>
                  <button
                    type="button"
                    aria-label="Close"
                    onClick={() => {
                      setOpenHelpPath(null);
                      setHelpAnchor(null);
                    }}
                    className="p-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                  >
                    <X size={14} />
                  </button>
                </div>
                <p className="text-sm text-slate-600 leading-relaxed">{openHelpTab.help}</p>
              </div>,
              document.body
            )
          : null}

        <div className="flex-1 min-w-0 bg-white rounded shadow-[1px_1px_15px_rgba(0,0,0,0.1)] p-4 sm:p-6 lg:p-8 xl:p-10 min-h-[420px]">
          {propertyAccess.level === 'listing_only' && lockedListingId && currentSegment === '' ? (
            <Navigate
              to={adminPath(`/properties/${id}/types?listing=${lockedListingId}`)}
              replace
            />
          ) : !isCalendarSyncEnabled(property) &&
            (currentSegment === 'calendar' || currentSegment === 'reservations') ? (
            <Navigate to={adminPath(`/properties/${id}`)} replace />
          ) : (
            <Outlet context={outletContext} />
          )}
        </div>
      </div>
    </div>
  );
}
