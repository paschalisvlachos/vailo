import { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  LayoutDashboard,
  Building2,
  Briefcase,
  Users,
  LogOut,
  KeyRound,
  CreditCard,
  FileText,
  Globe,
  Settings,
  BookOpen,
  Menu,
  X,
  PanelLeft,
  PanelLeftClose,
  Compass,
  MapPin,
  ClipboardList,
  Mail,
  Receipt,
  Star,
  Bell,
  ChevronDown,
  Info,
} from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../../lib/firebase';
import { useNewDiscoveredPlacesCount } from '../../hooks/useNewDiscoveredPlacesCount';
import { useAdminInboxUnreadCount } from '../../hooks/useAdminInboxUnreadCount';
import { useAdminSession } from '../../context/AdminSessionContext';
import { scopeFromRoute, scopeKey, isExcursionProvider, isAgent, isOwner, formatOwnerRoleLabel } from '../../lib/adminAccess';
import ArrangeAndBookSidebarNav from './ArrangeAndBookSidebarNav';
import VailoMark from '../guest/VailoMark';
import { adminPath, ADMIN_BASE } from '../../lib/adminRoutes';
import {
  PROPERTY_ADMIN_SECTIONS,
  propertyIdFromAdminPath,
} from '../../lib/propertyAdminNav';
import { propertyListingQuerySuffix } from '../../hooks/usePropertyListingQuery';

const SIDEBAR_COLLAPSED_KEY = 'vailo_admin_sidebar_collapsed';
const SIDEBAR_WIDTH = '15.5rem';

function readSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

type NavItemDef = {
  icon: typeof LayoutDashboard;
  label: string;
  to: string;
  help: string;
  badgeOnArea?: boolean;
  badgeOnMailbox?: boolean;
};

const NAV_SECTIONS: { id: string; label: string; items: NavItemDef[] }[] = [
  {
    id: 'general',
    label: 'General',
    items: [
      {
        icon: Briefcase,
        label: 'Agencies',
        to: adminPath('/agencies'),
        help: 'Create and manage agency portfolios. Assign agents/owners and open each agency to edit identity and settings.',
      },
      {
        icon: Building2,
        label: 'Property Listings',
        to: adminPath('/properties'),
        help: 'Create and manage property listings, house guides, calendars, and guest portals.',
      },
      {
        icon: LayoutDashboard,
        label: 'Dashboard',
        to: adminPath('/dashboard'),
        help: 'Platform overview with KPIs, usage, and activity across properties and services.',
      },
      {
        icon: Users,
        label: 'Owners CRM',
        to: adminPath('/owners'),
        help: 'Add and manage property owners you allocate to listings on your properties. You can give them access to their property only if you wish.',
      },
      {
        icon: Globe,
        label: 'Area Functionality',
        to: adminPath('/area'),
        help: 'Curate shared area content—local gems, discoveries, and trails—used across nearby properties.',
        badgeOnArea: true,
      },
      {
        icon: CreditCard,
        label: 'Billing & Usage',
        to: adminPath('/billing'),
        help: 'Review plans, usage meters, and billing-related activity for the platform.',
      },
      {
        icon: Receipt,
        label: 'Expenses',
        to: adminPath('/expenses'),
        help: 'Track operational expenses and keep a simple record of hospitality costs.',
      },
      {
        icon: FileText,
        label: 'Legal Documents',
        to: adminPath('/legal'),
        help: 'Manage legal templates and documents shown to owners, partners, or guests.',
      },
      {
        icon: Mail,
        label: 'Mailbox',
        to: adminPath('/mailbox'),
        help: 'Read and reply to inbound admin messages and notifications.',
        badgeOnMailbox: true,
      },
      {
        icon: Settings,
        label: 'Settings',
        to: adminPath('/settings'),
        help: 'Configure platform preferences, languages, and other admin defaults.',
      },
    ],
  },
  {
    id: 'excursions',
    label: 'Arrange and Book',
    items: [
      {
        icon: Star,
        label: 'Featured',
        to: adminPath('/excursions/featured'),
        help: 'Choose which Arrange & Book experiences are highlighted on the guest portal.',
      },
      {
        icon: Compass,
        label: 'Providers',
        to: adminPath('/excursions/providers'),
        help: 'Manage excursion and local-service providers, their profiles, and offerings.',
      },
    ],
  },
  {
    id: 'knowledge',
    label: 'Knowledge',
    items: [
      {
        icon: BookOpen,
        label: 'Knowledge base',
        to: adminPath('/knowledge'),
        help: 'Internal documentation about how Vailo features work for your team.',
      },
    ],
  },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const newDiscoveredCount = useNewDiscoveredPlacesCount();
  const {
    isScopedUser,
    profile,
    scopes,
    activeScope,
    setActiveScope,
    isPlatformAdmin,
    authUser,
    portfolioProperties,
    selectedAgencyId,
    selectedAgencyName,
    selectAgency,
  } = useAdminSession();
  const mailboxUnreadCount = useAdminInboxUnreadCount(isPlatformAdmin);
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readSidebarCollapsed);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const [openHelpKey, setOpenHelpKey] = useState<string | null>(null);
  const [helpAnchor, setHelpAnchor] = useState<{ top: number; left: number } | null>(null);
  const helpCardRef = useRef<HTMLDivElement>(null);

  const homePath = isPlatformAdmin ? adminPath('/properties') : adminPath();

  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  useEffect(() => {
    if (!isScopedUser || !activeScope) return;
    const matched = scopeFromRoute(location.pathname, location.search, scopes);
    if (matched && scopeKey(matched) !== scopeKey(activeScope)) {
      setActiveScope(matched);
    }
  }, [location.pathname, location.search, scopes, activeScope, isScopedUser, setActiveScope]);

  const navSections = authUser && !profile
    ? []
    : isExcursionProvider(profile)
    ? (() => {
        const providerScope = scopes.find((s) => s.kind === 'excursion_provider');
        const providerId =
          providerScope?.kind === 'excursion_provider' ? providerScope.providerId : null;
        const profilePath = providerId
          ? adminPath(`/excursion-portal/${providerId}`)
          : adminPath('/excursion-portal');
        const excursionsPath = providerId
          ? adminPath(`/excursion-portal/${providerId}/excursions`)
          : adminPath('/excursion-portal');
        const bookingsPath = providerId
          ? adminPath(`/excursion-portal/${providerId}/bookings`)
          : adminPath('/excursion-portal');
        return [
          {
            id: 'excursion-portal',
            label: 'Excursion portal',
            items: [
              {
                icon: Compass,
                label: 'My business',
                to: profilePath,
                help: 'Edit your provider profile, contact details, and business information.',
              },
              {
                icon: MapPin,
                label: 'Excursions',
                to: excursionsPath,
                help: 'Create and manage the experiences guests can book from your business.',
              },
              {
                icon: ClipboardList,
                label: 'Bookings',
                to: bookingsPath,
                help: 'Review guest booking requests and manage upcoming reservations.',
              },
            ] satisfies NavItemDef[],
          },
        ];
      })()
    : isAgent(profile) || isOwner(profile)
    ? (() => {
        const routePropertyId = propertyIdFromAdminPath(location.pathname);
        const managedShells = portfolioProperties.filter((p) => p.ownerId === profile?.id);
        const agencyPropertyId =
          routePropertyId ||
          managedShells[0]?.id ||
          portfolioProperties[0]?.id ||
          null;
        const listingSuffix = propertyListingQuerySuffix(
          new URLSearchParams(location.search).get('listing')
        );
        const portfolioItems: NavItemDef[] = [
          {
            icon: Building2,
            label: 'Property Listings',
            to: adminPath('/properties'),
            help: isAgent(profile)
              ? 'Your property listings — open a listing to manage guide, gems, and more.'
              : 'Your property listings and guest-facing setup.',
          },
        ];
        if (agencyPropertyId) {
          for (const section of PROPERTY_ADMIN_SECTIONS) {
            portfolioItems.push({
              icon: section.icon,
              label: section.name,
              to: adminPath(
                `/properties/${agencyPropertyId}/${section.path}${listingSuffix}`
              ),
              help: section.help,
            });
          }
        }
        const sections: { id: string; label: string; items: NavItemDef[] }[] = [
          {
            id: 'dashboard',
            label: 'Dashboard',
            items: [
              {
                icon: LayoutDashboard,
                label: 'Overview',
                to: adminPath('/dashboard'),
                help: 'What’s new and your agency portfolio at a glance.',
              },
            ],
          },
          {
            id: 'portfolio',
            label: 'Your portfolio',
            items: portfolioItems,
          },
        ];
        if (isAgent(profile)) {
          sections.push({
            id: 'owners',
            label: 'Your owners',
            items: [
              {
                icon: Users,
                label: 'Owners',
                to: adminPath('/owners'),
                help: 'View and manage the owners linked to your agent portfolio.',
              },
            ],
          });
        }
        sections.push({
          id: 'details',
          label: 'Your Details',
          items: [
            {
              icon: Settings,
              label: 'Settings',
              to: adminPath('/account/settings'),
              help: 'Agency overview, guest experience, and account settings.',
            },
          ],
        });
        return sections;
      })()
    : (() => {
        // Platform admin: “Your portfolio” only after explicitly selecting an agency.
        const agencyPropertyId =
          selectedAgencyId &&
          portfolioProperties.some((p) => p.id === selectedAgencyId)
            ? selectedAgencyId
            : null;
        if (!agencyPropertyId) return NAV_SECTIONS;

        const listingSuffix = propertyListingQuerySuffix(
          new URLSearchParams(location.search).get('listing')
        );
        const portfolioLabel = selectedAgencyName
          ? `Your portfolio · ${selectedAgencyName}`
          : 'Your portfolio';
        const propertyItems: NavItemDef[] = [
          {
            icon: Briefcase,
            label: 'Agency overview',
            to: adminPath(
              `/account/settings?agency=${encodeURIComponent(agencyPropertyId)}`
            ),
            help: 'Agency identity, assigned agent/owner, languages, and guest experience settings.',
          },
          {
            icon: Building2,
            label: 'Property Listings',
            to: adminPath(`/properties/${agencyPropertyId}/types`),
            help: 'Listings that belong to this agency.',
          },
          ...PROPERTY_ADMIN_SECTIONS.map((section) => ({
            icon: section.icon,
            label: section.name,
            to: adminPath(
              `/properties/${agencyPropertyId}/${section.path}${listingSuffix}`
            ),
            help: section.help,
          })),
        ];
        return [
          {
            id: 'this-property',
            label: portfolioLabel,
            items: propertyItems,
          },
          ...NAV_SECTIONS,
        ];
      })();

  const openHelpItem = useMemo(() => {
    if (!openHelpKey) return null;
    for (const section of navSections) {
      const found = section.items.find((item) => item.to === openHelpKey);
      if (found) return found;
    }
    return null;
  }, [openHelpKey, navSections]);

  useEffect(() => {
    setMobileOpen(false);
    setUserMenuOpen(false);
    setOpenHelpKey(null);
    setHelpAnchor(null);
  }, [location.pathname]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  useEffect(() => {
    if (!userMenuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!userMenuRef.current?.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [userMenuOpen]);

  useEffect(() => {
    if (!openHelpItem) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (helpCardRef.current?.contains(target)) return;
      if ((target as HTMLElement)?.closest?.('[data-nav-help-trigger]')) return;
      setOpenHelpKey(null);
      setHelpAnchor(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenHelpKey(null);
        setHelpAnchor(null);
      }
    };
    const onReposition = () => {
      setOpenHelpKey(null);
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
  }, [openHelpItem]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate(adminPath('/properties'), { replace: true });
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  const openNavHelp = (item: NavItemDef, trigger: HTMLElement) => {
    const rect = trigger.getBoundingClientRect();
    const width = 280;
    const left = Math.min(Math.max(12, rect.right + 8), window.innerWidth - width - 12);
    const top = Math.min(Math.max(12, rect.top), window.innerHeight - 140);
    setHelpAnchor({ top, left });
    setOpenHelpKey(item.to);
  };

  const panelLabel = authUser && !profile
    ? 'Account setup'
    : isExcursionProvider(profile)
      ? 'Excursion portal'
      : isScopedUser
        ? formatOwnerRoleLabel(profile?.role)
        : 'Admin Panel';

  const notificationCount = (isPlatformAdmin ? mailboxUnreadCount : 0) + newDiscoveredCount;

  const sidebarNav = (
    <nav className="flex-1 overflow-y-auto py-2">
      {navSections.map((section) => (
        <div key={section.id}>
          <div className="flex items-center justify-between gap-2 pr-2">
            <p className="admin-nav-section-title min-w-0 truncate">{section.label}</p>
            {isPlatformAdmin && section.id === 'this-property' && selectedAgencyId ? (
              <button
                type="button"
                onClick={() => {
                  selectAgency(null);
                  navigate(adminPath('/agencies'));
                  setMobileOpen(false);
                }}
                className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-vailo-teal hover:text-vailo-teal-hover"
              >
                Clear
              </button>
            ) : null}
          </div>
          <div>
            {section.items.map((item) => (
              <NavItem
                key={item.to}
                icon={<item.icon size={14} strokeWidth={1.75} />}
                label={item.label}
                to={item.to}
                help={item.help}
                helpOpen={openHelpKey === item.to}
                onHelpClick={(trigger) => {
                  if (openHelpKey === item.to) {
                    setOpenHelpKey(null);
                    setHelpAnchor(null);
                    return;
                  }
                  openNavHelp(item, trigger);
                }}
                badge={
                  'badgeOnMailbox' in item && item.badgeOnMailbox
                    ? mailboxUnreadCount
                    : 'badgeOnArea' in item && item.badgeOnArea
                      ? newDiscoveredCount
                      : 0
                }
                onNavigate={() => setMobileOpen(false)}
              />
            ))}
            {section.id === 'excursions' && (
              <ArrangeAndBookSidebarNav onNavigate={() => setMobileOpen(false)} />
            )}
          </div>
        </div>
      ))}
    </nav>
  );

  const sidebarFooter = (
    <div className="border-t border-[#e1e1e1] py-2">
      {authUser && profile && (
        <Link
          to={adminPath('/account/password')}
          onClick={() => setMobileOpen(false)}
          className="admin-nav-link"
        >
          <KeyRound size={14} className="admin-nav-icon shrink-0" />
          <span>Change password</span>
        </Link>
      )}
      <button type="button" onClick={handleLogout} className="admin-nav-link w-full text-left">
        <LogOut size={14} className="admin-nav-icon shrink-0" />
        <span>Logout</span>
      </button>
    </div>
  );

  return (
    <div className="admin-shell min-h-screen flex flex-col bg-vailo-surface">
      <header className="admin-topbar sticky top-0 z-40 h-14 flex items-stretch shrink-0">
        <div
          className={`hidden lg:flex items-center shrink-0 border-r border-[#e1e1e1] px-4 transition-[width] duration-300 ${
            sidebarCollapsed ? 'w-[72px] justify-center' : ''
          }`}
          style={sidebarCollapsed ? undefined : { width: SIDEBAR_WIDTH }}
        >
          <Link to={homePath} className="flex items-center gap-2.5 min-w-0">
            {sidebarCollapsed ? (
              <div className="h-8 w-8 rounded-md bg-[#2ec4b6]/15 flex items-center justify-center p-1.5">
                <VailoMark className="h-full w-full object-contain" alt="Vailo" />
              </div>
            ) : (
              <>
                <div className="h-8 w-8 rounded-md bg-[#2ec4b6]/15 flex items-center justify-center p-1.5 shrink-0">
                  <VailoMark className="h-full w-full object-contain" alt="Vailo" />
                </div>
                <div className="min-w-0">
                  <p className="text-[15px] font-bold text-vailo-dark leading-tight truncate">Vailo</p>
                  <p className="text-[10px] text-gray-400 font-medium truncate">{panelLabel}</p>
                </div>
              </>
            )}
          </Link>
        </div>

        <div className="flex-1 flex items-center justify-between px-3 sm:px-5 min-w-0 gap-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 rounded-md text-gray-500 hover:text-vailo-dark hover:bg-black/[0.03] transition-colors"
              aria-label="Open menu"
            >
              <Menu size={20} />
            </button>
            <button
              type="button"
              onClick={toggleSidebar}
              className="hidden lg:flex p-2 rounded-md text-gray-500 hover:text-vailo-dark hover:bg-black/[0.03] transition-colors"
              aria-label={sidebarCollapsed ? 'Show admin menu' : 'Hide admin menu'}
              aria-expanded={!sidebarCollapsed}
              title={sidebarCollapsed ? 'Show menu' : 'Hide menu'}
            >
              {sidebarCollapsed ? <PanelLeft size={18} /> : <PanelLeftClose size={18} />}
            </button>
            <span className="hidden md:inline text-sm text-gray-500 ml-2">
              Hospitality management
            </span>
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            {isPlatformAdmin && (
              <Link
                to={adminPath('/mailbox')}
                className="relative p-2 rounded-md text-gray-500 hover:text-vailo-dark hover:bg-black/[0.03] transition-colors"
                title="Mailbox"
                aria-label="Mailbox"
              >
                <Bell size={18} />
                {notificationCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-red-500" />
                )}
              </Link>
            )}

            <div className="relative" ref={userMenuRef}>
              <button
                type="button"
                onClick={() => setUserMenuOpen((open) => !open)}
                className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-md hover:bg-black/[0.03] transition-colors"
                aria-expanded={userMenuOpen}
                aria-haspopup="menu"
              >
                <span className="h-8 w-8 rounded-full bg-[#2ec4b6] text-white text-sm font-bold flex items-center justify-center uppercase shrink-0">
                  {(authUser?.email?.[0] || 'V').toUpperCase()}
                </span>
                <span className="hidden sm:block text-left min-w-0 max-w-[11rem]">
                  <span className="block text-[13px] font-semibold text-vailo-dark truncate">
                    {profile?.fullName || authUser?.email || 'Admin'}
                  </span>
                  <span className="block text-[11px] text-gray-400 truncate">
                    {authUser?.email}
                  </span>
                </span>
                <ChevronDown size={14} className="hidden sm:block text-gray-400 shrink-0" />
              </button>

              {userMenuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 mt-1.5 w-56 bg-white py-2 z-50 rounded-lg border border-[#e1e1e1] shadow-[0_10px_10px_0_rgba(0,0,0,0.08)]"
                >
                  <div className="px-4 py-2 border-b border-[#e1e1e1]">
                    <p className="text-sm font-bold text-vailo-dark truncate">
                      {profile?.fullName || 'Account'}
                    </p>
                    <p className="text-xs text-gray-400 truncate">{authUser?.email}</p>
                  </div>
                  {authUser && profile && (
                    <Link
                      to={adminPath('/account/password')}
                      role="menuitem"
                      className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-600 hover:bg-[#f5f6f8] hover:text-vailo-dark"
                      onClick={() => setUserMenuOpen(false)}
                    >
                      <KeyRound size={15} className="text-vailo-teal" />
                      Change password
                    </Link>
                  )}
                  {isPlatformAdmin ? (
                    <Link
                      to={adminPath('/settings')}
                      role="menuitem"
                      className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-600 hover:bg-[#f5f6f8] hover:text-vailo-dark"
                      onClick={() => setUserMenuOpen(false)}
                    >
                      <Settings size={15} className="text-[#2ec4b6]" />
                      Settings
                    </Link>
                  ) : profile ? (
                    <Link
                      to={adminPath('/account/settings')}
                      role="menuitem"
                      className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-600 hover:bg-[#f5f6f8] hover:text-vailo-dark"
                      onClick={() => setUserMenuOpen(false)}
                    >
                      <Settings size={15} className="text-[#2ec4b6]" />
                      Settings
                    </Link>
                  ) : null}
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-600 hover:bg-[#f5f6f8] hover:text-vailo-dark text-left"
                  >
                    <LogOut size={15} className="text-red-500" />
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        <aside
          className={`hidden lg:flex admin-sidebar-panel flex-col shrink-0 fixed bottom-0 z-30 transition-all duration-300 ease-out ${
            sidebarCollapsed ? 'w-0 overflow-hidden opacity-0 pointer-events-none' : 'opacity-100'
          }`}
          style={{
            top: 56,
            width: sidebarCollapsed ? 0 : SIDEBAR_WIDTH,
          }}
        >
          {sidebarNav}
          {sidebarFooter}
        </aside>

        {mobileOpen && (
          <button
            type="button"
            aria-label="Close menu"
            className="fixed inset-0 z-50 bg-black/40 lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}

        <aside
          className={`fixed inset-y-0 left-0 z-50 w-[min(100vw-3rem,15.5rem)] admin-sidebar-panel flex flex-col transform transition-transform duration-300 ease-out lg:hidden ${
            mobileOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="flex items-center justify-between px-4 h-14 border-b border-[#e1e1e1] shrink-0">
            <Link to={homePath} className="flex items-center gap-2" onClick={() => setMobileOpen(false)}>
              <div className="h-8 w-8 rounded-md bg-[#2ec4b6]/15 flex items-center justify-center p-1.5">
                <VailoMark className="h-full w-full object-contain" alt="Vailo" />
              </div>
              <div>
                <p className="text-sm font-bold text-vailo-dark leading-tight">Vailo</p>
                <p className="text-[10px] text-gray-400">{panelLabel}</p>
              </div>
            </Link>
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="p-2 rounded-md text-gray-500 hover:text-vailo-dark hover:bg-black/[0.03]"
              aria-label="Close menu"
            >
              <X size={18} />
            </button>
          </div>
          {sidebarNav}
          {sidebarFooter}
        </aside>

        <div
          className={`flex-1 flex flex-col min-w-0 admin-content-panel transition-[margin] duration-300 ease-out ${
            sidebarCollapsed ? 'lg:ml-0' : 'lg:ml-[15.5rem]'
          }`}
        >
          <main className="flex-1 overflow-y-auto overflow-x-hidden">
            <div className="p-4 sm:p-6 lg:px-8 lg:py-7 w-full">
              {children}
            </div>
          </main>
        </div>
      </div>

      {openHelpItem && helpAnchor
        ? createPortal(
            <div
              ref={helpCardRef}
              role="dialog"
              aria-label={`${openHelpItem.label} explained`}
              style={{ top: helpAnchor.top, left: helpAnchor.left }}
              className="admin-shell fixed z-[80] w-[280px] max-w-[calc(100vw-1.5rem)] rounded-lg border border-[#e1e1e1] bg-white p-4 shadow-[0_10px_10px_0_rgba(0,0,0,0.08)]"
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-vailo-teal">
                  {openHelpItem.label}
                </p>
                <button
                  type="button"
                  aria-label="Close"
                  onClick={() => {
                    setOpenHelpKey(null);
                    setHelpAnchor(null);
                  }}
                  className="p-1 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                >
                  <X size={14} />
                </button>
              </div>
              <p className="text-sm text-slate-600 leading-relaxed">{openHelpItem.help}</p>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

function NavItem({
  icon,
  label,
  to,
  help,
  helpOpen,
  onHelpClick,
  badge = 0,
  onNavigate,
}: {
  icon: React.ReactNode;
  label: string;
  to: string;
  help: string;
  helpOpen: boolean;
  onHelpClick: (trigger: HTMLElement) => void;
  badge?: number;
  onNavigate?: () => void;
}) {
  const location = useLocation();
  const pathname = location.pathname;
  const search = location.search;
  const hrefPath = to.split('?')[0] || to;
  const hrefSearch = to.includes('?') ? `?${to.split('?')[1]}` : '';
  const hrefParams = new URLSearchParams(hrefSearch);
  const currentParams = new URLSearchParams(search);
  const searchMatches =
    !hrefSearch ||
    [...hrefParams.entries()].every(([key, value]) => currentParams.get(key) === value);
  const isProviderProfileLink = /\/excursion-portal\/[^/]+$/.test(hrefPath);
  // Legacy property shell URL — exact match only (not /types, /features, …).
  const isPropertyShellLink = /\/admin\/properties\/[^/]+$/.test(hrefPath);
  const isAgencySettingsLink =
    hrefPath === adminPath('/account/settings') && hrefParams.has('agency');
  const isPropertiesIndex = hrefPath === adminPath('/properties');
  const isPropertyListingsLink = /\/admin\/properties\/[^/]+\/types$/.test(hrefPath);
  const exactPathOnly =
    to === ADMIN_BASE ||
    to === adminPath('/dashboard') ||
    isPropertiesIndex ||
    isPropertyShellLink;
  const active = isAgencySettingsLink
    ? pathname === hrefPath && searchMatches
    : exactPathOnly
      ? pathname === hrefPath
      : isPropertyListingsLink
        ? pathname === hrefPath || pathname.startsWith(`${hrefPath}/`)
        : (pathname === hrefPath &&
            (!hrefSearch || searchMatches)) ||
          (pathname.startsWith(`${hrefPath}/`) &&
            !(isProviderProfileLink && pathname.includes('/excursions')));

  return (
    <div className="flex items-stretch gap-0.5 px-2">
      <Link
        to={to}
        onClick={onNavigate}
        className={`admin-nav-link flex-1 min-w-0 !mx-0 ${active ? 'is-active' : ''}`}
      >
        <span className="admin-nav-icon text-inherit shrink-0 w-5 text-left">{icon}</span>
        <span className="flex-1 truncate">{label}</span>
        {badge > 0 && (
          <span className="ml-1 min-w-[18px] h-[18px] px-1.5 flex items-center justify-center rounded-full bg-vailo-gold text-vailo-dark text-[10px] font-bold">
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </Link>
      <button
        type="button"
        data-nav-help-trigger={to}
        aria-label={`About ${label}`}
        aria-expanded={helpOpen}
        title={help}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onHelpClick(e.currentTarget);
        }}
        className={`shrink-0 px-1.5 my-0.5 rounded-md transition-colors ${
          helpOpen
            ? 'bg-[#2ec4b6]/20 text-vailo-teal'
            : 'text-gray-400 hover:text-vailo-dark hover:bg-black/[0.03]'
        }`}
      >
        <Info size={13} strokeWidth={2.25} />
      </button>
    </div>
  );
}
