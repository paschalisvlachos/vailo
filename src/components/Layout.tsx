import { 
  LayoutDashboard, 
  Building2, 
  Users, 
  UserSquare2, 
  Megaphone, 
  MessageSquare, 
  Wallet, 
  CalendarDays, 
  Server,
  LogOut
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';

export default function Layout({ children }: { children: React.ReactNode }) {
  
  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Error logging out:", error);
    }
  };

  return (
    <div className="flex h-screen bg-[#F8F9FA]">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
        {/* App Title / Logo Area */}
        <div className="p-6">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Vailo</h1>
          <p className="text-xs text-gray-500 mt-1">Admin Panel</p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
          <p className="px-2 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 mt-4">Main</p>
          
          <NavItem icon={<LayoutDashboard size={20} />} label="Dashboard" to="/" />
          <NavItem icon={<Building2 size={20} />} label="Properties" to="/properties" />          
          <NavItem icon={<Users size={20} />} label="Owners CRM" to="/owners" />
          <NavItem icon={<UserSquare2 size={20} />} label="Guests / CRM" to="#" />
          <NavItem icon={<Megaphone size={20} />} label="Campaigns" to="#" />
          <NavItem icon={<MessageSquare size={20} />} label="AI Conversations" to="#" />
          <NavItem icon={<Wallet size={20} />} label="Οικονομικά" to="#" />
          <NavItem icon={<CalendarDays size={20} />} label="Ημερολόγιο" to="#" />
          <NavItem icon={<Server size={20} />} label="MCP Server" to="#" />
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header */}
        <header className="h-16 border-b border-gray-200 bg-white flex items-center justify-end px-8">
          <button 
            onClick={handleLogout}
            className="flex items-center text-sm font-medium text-gray-600 hover:text-red-600 transition-colors"
          >
            <LogOut size={18} className="mr-2" />
            Logout
          </button>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-y-auto p-8">
          {children}
        </div>
      </main>
    </div>
  );
}

// Small helper component for the sidebar items
function NavItem({ icon, label, to, className = "" }: { icon: React.ReactNode, label: string, to: string, className?: string }) {
  const location = useLocation();
  // Check if the current URL matches the link's destination to highlight it
  const active = location.pathname === to;

  return (
    <Link
      to={to}
      className={`flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
        active 
          ? "bg-gray-100 text-gray-900" 
          : `text-gray-600 hover:bg-gray-50 hover:text-gray-900 ${className}`
      }`}
    >
      <span className="mr-3">{icon}</span>
      {label}
    </Link>
  );
}