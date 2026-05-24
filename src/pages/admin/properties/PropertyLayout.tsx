import { useState, useEffect } from 'react';
import { useParams, Link, NavLink, Outlet } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
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
} from 'lucide-react';
import { AdminBadge } from '../../../components/admin/AdminPageHeader';

const TABS = [
  { name: 'Overview', path: '', icon: Home },
  { name: 'Property Types', path: 'types', icon: Building },
  { name: 'Reservations', path: 'reservations', icon: CalendarCheck },
  { name: 'Calendar', path: 'calendar', icon: CalendarIcon },
  { name: 'Local Gems', path: 'local-gems', icon: MapPin },
  { name: 'Green Score', path: 'green-score', icon: Leaf },
  { name: 'House Guide', path: 'house-guide', icon: BookOpen },
  { name: 'Features', path: 'features', icon: Handshake },
  { name: 'AI Gaps', path: 'ai-gaps', icon: Sparkles },
];

export default function PropertyLayout() {
  const { id } = useParams();
  const [property, setProperty] = useState<{ id: string; propertyName?: string; internalRefCode?: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProperty = async () => {
      if (!id) return;
      try {
        const docRef = doc(db, 'properties', id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setProperty({ id: docSnap.id, ...docSnap.data() });
        }
      } catch (error) {
        console.error('Error fetching property:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchProperty();
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-500 text-sm">
        Loading property…
      </div>
    );
  }
  if (!property) {
    return (
      <div className="flex items-center justify-center py-24 text-red-500 text-sm">
        Property not found.
      </div>
    );
  }

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
            <p className="text-gray-500 text-sm mt-0.5">Property management</p>
          </div>
        </div>
        {property.internalRefCode && (
          <AdminBadge variant="teal">{property.internalRefCode}</AdminBadge>
        )}
      </div>

      <div className="flex flex-col xl:flex-row gap-5 xl:gap-8">
        <nav className="xl:w-60 shrink-0">
          <div className="xl:sticky xl:top-24">
            <p className="hidden xl:block text-[10px] font-bold text-gray-400 uppercase tracking-[0.18em] mb-2.5 px-1">
              Sections
            </p>
            <div className="flex xl:flex-col gap-1.5 overflow-x-auto admin-scroll-x pb-1 xl:pb-0 -mx-1 px-1 xl:mx-0 xl:px-0 xl:bg-white xl:border xl:border-gray-100 xl:rounded-2xl xl:p-2 xl:shadow-[0_2px_16px_-6px_rgba(11,79,92,0.1)]">
              {TABS.map((tab) => (
                <NavLink
                  key={tab.name}
                  to={tab.path}
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
                  {tab.name}
                </NavLink>
              ))}
            </div>
          </div>
        </nav>

        <div className="flex-1 min-w-0 bg-white border border-gray-100 rounded-2xl shadow-[0_2px_16px_-6px_rgba(11,79,92,0.1)] p-4 sm:p-6 lg:p-8 xl:p-10 min-h-[420px]">
          <Outlet context={{ property, propertyId: id }} />
        </div>
      </div>
    </div>
  );
}
