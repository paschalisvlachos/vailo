import { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Building2,
  Users,
  LogOut,
  CreditCard,
  FileText,
  Globe,
  Settings,
  BookOpen,
  Menu,
  X,
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../../lib/firebase';
import { useNewDiscoveredPlacesCount } from '../../hooks/useNewDiscoveredPlacesCount';
import { useAdminSession } from '../../context/AdminSessionContext';
import { scopeFromRoute, scopeKey } from '../../lib/adminAccess';
import AdminScopeBar from './AdminScopeBar';
import { adminPath, ADMIN_BASE } from '../../lib/adminRoutes';

type NavItem = {
  icon: typeof LayoutDashboard;
  label: string;
  to: string;
  badgeOnArea?: boolean;
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
      { icon: FileText, label: 'Legal Documents', to: adminPath('/legal') },
      { icon: Settings, label: 'Settings', to: adminPath('/settings') },
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
  const { isScopedUser, profile, scopes, activeScope, setActiveScope } = useAdminSession();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!isScopedUser || !activeScope) return;
    const matched = scopeFromRoute(location.pathname, location.search, scopes);
    if (matched && scopeKey(matched) !== scopeKey(activeScope)) {
      setActiveScope(matched);
    }
  }, [location.pathname, location.search, scopes, activeScope, isScopedUser, setActiveScope]);

  const navSections = isScopedUser
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
  }, [location.pathname]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  const sidebarContent = (
    <>
      <div className="p-5 lg:p-6 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-vailo-gold/30 to-vailo-gold/10 border border-vailo-gold/25 flex items-center justify-center shrink-0 shadow-inner">
            <span className="font-bold text-vailo-gold text-lg font-luxury">V</span>
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white font-luxury">Vailo</h1>
            <p className="text-[11px] text-white/45 font-medium tracking-wide">
              {isScopedUser ? profile?.role || 'Portal' : 'Admin Panel'}
            </p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-5 space-y-6 overflow-y-auto">
        {navSections.map((section) => (
          <div key={section.id}>
            <p className="px-3 text-[10px] font-bold text-white/30 uppercase tracking-[0.22em] mb-2">
              {section.label}
            </p>
            <div className="space-y-1">
              {section.items.map((item) => (
                <NavItem
                  key={item.to}
                  icon={<item.icon size={19} strokeWidth={1.75} />}
                  label={item.label}
                  to={item.to}
                  badge={item.badgeOnArea ? newDiscoveredCount : 0}
                  onNavigate={() => setMobileOpen(false)}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="p-4 border-t border-white/10">
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white/65 hover:text-white hover:bg-white/10 transition-colors"
        >
          <LogOut size={17} />
          Logout
        </button>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen bg-vailo-surface">
      <aside className="hidden lg:flex w-[17.5rem] bg-gradient-to-b from-vailo-teal to-vailo-teal-hover flex-col shrink-0 fixed inset-y-0 left-0 z-40 shadow-[4px_0_24px_-8px_rgba(5,31,38,0.35)]">
        {sidebarContent}
      </aside>

      {mobileOpen && (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-50 bg-vailo-dark/65 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[min(100vw-3rem,17.5rem)] bg-gradient-to-b from-vailo-teal to-vailo-teal-hover flex flex-col transform transition-transform duration-300 ease-out lg:hidden shadow-2xl ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="absolute top-4 right-4 p-2 rounded-xl text-white/55 hover:text-white hover:bg-white/10"
          aria-label="Close menu"
        >
          <X size={20} />
        </button>
        {sidebarContent}
      </aside>

      <div className="flex-1 flex flex-col min-w-0 lg:ml-[17.5rem]">
        <header className="sticky top-0 z-30 h-14 sm:h-[4.25rem] border-b border-gray-200/70 bg-white/92 backdrop-blur-lg flex items-center justify-between px-4 sm:px-6 lg:px-8 xl:px-10 shrink-0">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="lg:hidden p-2 -ml-1 rounded-xl text-vailo-teal hover:bg-vailo-teal/5 transition-colors"
            aria-label="Open menu"
          >
            <Menu size={22} />
          </button>

          <div className="hidden lg:flex items-center gap-2 text-sm text-gray-500">
            <span className="h-1.5 w-1.5 rounded-full bg-vailo-gold" />
            <span className="font-medium">Hospitality management</span>
          </div>

          <button
            onClick={handleLogout}
            className="hidden sm:flex items-center text-sm font-medium text-gray-500 hover:text-vailo-teal transition-colors ml-auto"
          >
            <LogOut size={17} className="mr-2 opacity-70" />
            Logout
          </button>
        </header>

        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="p-4 sm:p-6 lg:p-8 xl:p-10 w-full">
            <AdminScopeBar />
            {children}
          </div>
        </main>
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
  const active =
    to === ADMIN_BASE
      ? location.pathname === ADMIN_BASE
      : location.pathname === to || location.pathname.startsWith(`${to}/`);

  return (
    <Link
      to={to}
      onClick={onNavigate}
      className={`relative flex items-center px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
        active
          ? 'bg-white/12 text-white shadow-sm before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-6 before:w-0.5 before:rounded-full before:bg-vailo-gold'
          : 'text-white/60 hover:bg-white/6 hover:text-white/90'
      }`}
    >
      <span className={`mr-3 ${active ? 'text-vailo-gold' : 'text-white/45'}`}>{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {badge > 0 && (
        <span className="ml-2 min-w-[20px] h-5 px-1.5 flex items-center justify-center rounded-full bg-vailo-gold text-vailo-dark text-[10px] font-bold">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </Link>
  );
}
