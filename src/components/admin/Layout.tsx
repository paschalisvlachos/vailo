import { useState, useEffect, useRef } from 'react';
import {
  LayoutDashboard,
  Building2,
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
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../../lib/firebase';
import { useNewDiscoveredPlacesCount } from '../../hooks/useNewDiscoveredPlacesCount';
import { useAdminInboxUnreadCount } from '../../hooks/useAdminInboxUnreadCount';
import { useAdminSession } from '../../context/AdminSessionContext';
import { scopeFromRoute, scopeKey, isExcursionProvider, isAgent, isOwner, formatOwnerRoleLabel } from '../../lib/adminAccess';
import AdminScopeBar from './AdminScopeBar';
import ArrangeAndBookSidebarNav from './ArrangeAndBookSidebarNav';
import VailoMark from '../guest/VailoMark';
import { adminPath, ADMIN_BASE } from '../../lib/adminRoutes';

const SIDEBAR_COLLAPSED_KEY = 'vailo_admin_sidebar_collapsed';
const SIDEBAR_WIDTH = '14.375rem'; // 230px — matches Webmin

function readSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

type NavItem = {
  icon: typeof LayoutDashboard;
  label: string;
  to: string;
  badgeOnArea?: boolean;
  badgeOnMailbox?: boolean;
};

const NAV_SECTIONS: { id: string; label: string; items: NavItem[] }[] = [
  {
    id: 'general',
    label: 'General',
    items: [
      { icon: LayoutDashboard, label: 'Dashboard', to: adminPath() },
      { icon: Building2, label: 'Properties', to: adminPath('/properties') },
      { icon: Users, label: 'Owners CRM', to: adminPath('/owners') },
      { icon: Globe, label: 'Area Functionality', to: adminPath('/area'), badgeOnArea: true },
      { icon: CreditCard, label: 'Billing & Usage', to: adminPath('/billing') },
      { icon: Receipt, label: 'Expenses', to: adminPath('/expenses') },
      { icon: FileText, label: 'Legal Documents', to: adminPath('/legal') },
      { icon: Mail, label: 'Mailbox', to: adminPath('/mailbox'), badgeOnMailbox: true },
      { icon: Settings, label: 'Settings', to: adminPath('/settings') },
    ],
  },
  {
    id: 'excursions',
    label: 'Arrange and Book',
    items: [
      { icon: Star, label: 'Featured', to: adminPath('/excursions/featured') },
      { icon: Compass, label: 'Providers', to: adminPath('/excursions/providers') },
    ],
  },
  {
    id: 'knowledge',
    label: 'Knowledge',
    items: [{ icon: BookOpen, label: 'Knowledge base', to: adminPath('/knowledge') }],
  },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const newDiscoveredCount = useNewDiscoveredPlacesCount();
  const { isScopedUser, profile, scopes, activeScope, setActiveScope, isPlatformAdmin, authUser } = useAdminSession();
  const mailboxUnreadCount = useAdminInboxUnreadCount(isPlatformAdmin);
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readSidebarCollapsed);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

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
              { icon: Compass, label: 'My business', to: profilePath },
              { icon: MapPin, label: 'Excursions', to: excursionsPath },
              { icon: ClipboardList, label: 'Bookings', to: bookingsPath },
            ],
          },
        ];
      })()
    : isAgent(profile)
    ? [
        {
          id: 'portfolio',
          label: 'Your portfolio',
          items: [{ icon: Building2, label: 'Properties', to: adminPath('/properties') }],
        },
        {
          id: 'owners',
          label: 'Your owners',
          items: [{ icon: Users, label: 'Owners', to: adminPath('/owners') }],
        },
      ]
    : isOwner(profile)
    ? [
        {
          id: 'portfolio',
          label: 'Your portfolio',
          items: [{ icon: Building2, label: 'Properties', to: adminPath('/properties') }],
        },
      ]
    : NAV_SECTIONS;

  useEffect(() => {
    setMobileOpen(false);
    setUserMenuOpen(false);
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

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Error logging out:', error);
    }
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
          <p className="admin-nav-section-title">{section.label}</p>
          <div>
            {section.items.map((item) => (
              <NavItem
                key={item.to}
                icon={<item.icon size={14} strokeWidth={1.75} />}
                label={item.label}
                to={item.to}
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
    <div className="border-t border-white/10 py-2">
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
      {/* Top header — Webmin style */}
      <header className="admin-topbar sticky top-0 z-40 h-[58px] flex items-stretch shrink-0">
        <div
          className={`hidden lg:flex items-center shrink-0 border-r border-[#eeeeee] px-4 transition-[width] duration-300 ${
            sidebarCollapsed ? 'w-[72px] justify-center' : ''
          }`}
          style={sidebarCollapsed ? undefined : { width: SIDEBAR_WIDTH }}
        >
          <Link to={adminPath()} className="flex items-center gap-2.5 min-w-0">
            {sidebarCollapsed ? (
              <div className="h-8 w-8 rounded bg-vailo-teal/15 flex items-center justify-center p-1.5">
                <VailoMark className="h-full w-full object-contain" alt="Vailo" />
              </div>
            ) : (
              <>
                <div className="h-8 w-8 rounded bg-vailo-teal/15 flex items-center justify-center p-1.5 shrink-0">
                  <VailoMark className="h-full w-full object-contain" alt="Vailo" />
                </div>
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold text-vailo-dark leading-tight truncate">Vailo</p>
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
              className="lg:hidden p-2 rounded text-[#6c757d] hover:text-vailo-teal hover:bg-vailo-teal/5 transition-colors"
              aria-label="Open menu"
            >
              <Menu size={20} />
            </button>
            <button
              type="button"
              onClick={toggleSidebar}
              className="hidden lg:flex p-2 rounded text-[#6c757d] hover:text-vailo-teal hover:bg-vailo-teal/5 transition-colors"
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
                className="relative p-2 rounded text-[#6c757d] hover:text-vailo-teal hover:bg-vailo-teal/5 transition-colors"
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
                className="flex items-center gap-2 pl-1 pr-2 py-1 rounded hover:bg-black/[0.03] transition-colors"
                aria-expanded={userMenuOpen}
                aria-haspopup="menu"
              >
                <span className="h-9 w-9 rounded-full bg-vailo-teal text-white text-sm font-semibold flex items-center justify-center uppercase shrink-0">
                  {(authUser?.email?.[0] || 'V').toUpperCase()}
                </span>
                <span className="hidden sm:block text-left min-w-0 max-w-[11rem]">
                  <span className="block text-[13px] font-medium text-vailo-dark truncate">
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
                  className="absolute right-0 mt-1 w-56 bg-white py-2 z-50 border-0"
                  style={{ boxShadow: '1px 1px 15px rgba(0,0,0,0.1)' }}
                >
                  <div className="px-4 py-2 border-b border-[#eeeeee]">
                    <p className="text-sm font-semibold text-vailo-dark truncate">
                      {profile?.fullName || 'Account'}
                    </p>
                    <p className="text-xs text-gray-400 truncate">{authUser?.email}</p>
                  </div>
                  {authUser && profile && (
                    <Link
                      to={adminPath('/account/password')}
                      role="menuitem"
                      className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-600 hover:bg-vailo-surface-elevated hover:text-vailo-dark"
                      onClick={() => setUserMenuOpen(false)}
                    >
                      <KeyRound size={15} className="text-vailo-teal" />
                      Change password
                    </Link>
                  )}
                  {isPlatformAdmin && (
                    <Link
                      to={adminPath('/settings')}
                      role="menuitem"
                      className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-600 hover:bg-vailo-surface-elevated hover:text-vailo-dark"
                      onClick={() => setUserMenuOpen(false)}
                    >
                      <Settings size={15} className="text-[#17a2b8]" />
                      Settings
                    </Link>
                  )}
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-600 hover:bg-vailo-surface-elevated hover:text-vailo-dark text-left"
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
        {/* Desktop sidebar */}
        <aside
          className={`hidden lg:flex admin-sidebar-panel flex-col shrink-0 fixed bottom-0 z-30 transition-all duration-300 ease-out ${
            sidebarCollapsed ? 'w-0 overflow-hidden opacity-0 pointer-events-none' : 'opacity-100'
          }`}
          style={{
            top: 58,
            width: sidebarCollapsed ? 0 : SIDEBAR_WIDTH,
          }}
        >
          {sidebarNav}
          {sidebarFooter}
        </aside>

        {/* Mobile overlay */}
        {mobileOpen && (
          <button
            type="button"
            aria-label="Close menu"
            className="fixed inset-0 z-50 bg-black/50 lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}

        {/* Mobile sidebar */}
        <aside
          className={`fixed inset-y-0 left-0 z-50 w-[min(100vw-3rem,14.375rem)] admin-sidebar-panel flex flex-col transform transition-transform duration-300 ease-out lg:hidden ${
            mobileOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="flex items-center justify-between px-4 h-[58px] border-b border-white/10 shrink-0">
            <Link to={adminPath()} className="flex items-center gap-2" onClick={() => setMobileOpen(false)}>
              <div className="h-8 w-8 rounded bg-white/10 flex items-center justify-center p-1.5">
                <VailoMark className="h-full w-full object-contain" alt="Vailo" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white leading-tight">Vailo</p>
                <p className="text-[10px] text-white/45">{panelLabel}</p>
              </div>
            </Link>
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="p-2 rounded text-white/55 hover:text-white hover:bg-white/10"
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
            sidebarCollapsed ? 'lg:ml-0' : 'lg:ml-[14.375rem]'
          }`}
        >
          <main className="flex-1 overflow-y-auto overflow-x-hidden">
            <div className="p-4 sm:p-6 lg:p-[30px] w-full">
              <AdminScopeBar />
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

function NavItem({
  icon,
  label,
  to,
  badge = 0,
  onNavigate,
}: {
  icon: React.ReactNode;
  label: string;
  to: string;
  badge?: number;
  onNavigate?: () => void;
}) {
  const location = useLocation();
  const pathname = location.pathname;
  const isProviderProfileLink = /\/excursion-portal\/[^/]+$/.test(to);
  const active =
    to === ADMIN_BASE
      ? pathname === ADMIN_BASE
      : pathname === to ||
        (pathname.startsWith(`${to}/`) &&
          !(isProviderProfileLink && pathname.includes('/excursions')));

  return (
    <Link
      to={to}
      onClick={onNavigate}
      className={`admin-nav-link ${active ? 'is-active' : ''}`}
    >
      <span className="admin-nav-icon text-inherit shrink-0 w-5 text-left">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {badge > 0 && (
        <span className="ml-2 min-w-[18px] h-[18px] px-1.5 flex items-center justify-center rounded-full bg-vailo-gold text-vailo-dark text-[10px] font-bold">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </Link>
  );
}
