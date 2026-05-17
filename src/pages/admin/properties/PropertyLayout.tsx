import { useState, useEffect } from 'react';
import { useParams, Link, NavLink, Outlet } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { 
  ArrowLeft, 
  Home,
  Building,
  BarChart2,
  Users,
  CalendarCheck,
  Calendar as CalendarIcon,
  MapPin,
  Ticket,
  Leaf,
  BookOpen,
  Handshake,
  TrendingUp,
  Sparkles
} from 'lucide-react';

const TABS = [
  { name: 'Overview', path: '', icon: Home },
  { name: 'Property Types', path: 'types', icon: Building },
  { name: 'Analytics', path: 'analytics', icon: BarChart2 },
  { name: 'Guests', path: 'guests', icon: Users },
  { name: 'Reservations', path: 'reservations', icon: CalendarCheck },
  { name: 'Calendar', path: 'calendar', icon: CalendarIcon },
  { name: 'Local Gems', path: 'local-gems', icon: MapPin },
  { name: 'Tickets', path: 'tickets', icon: Ticket },
  { name: 'Green Score', path: 'green-score', icon: Leaf },
  { name: 'House Guide', path: 'house-guide', icon: BookOpen },
  { name: 'Features', path: 'features', icon: Handshake },
  { name: 'Performance', path: 'performance', icon: TrendingUp },
  { name: 'AI Gaps', path: 'ai-gaps', icon: Sparkles },
];

export default function PropertyLayout() {
  const { id } = useParams();
  const [property, setProperty] = useState<any>(null);
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
        console.error("Error fetching property:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchProperty();
  }, [id]);

  if (loading) return <div className="p-8 text-center text-gray-500">Loading property details...</div>;
  if (!property) return <div className="p-8 text-center text-red-500">Property not found.</div>;

  return (
    <div className="max-w-[1400px] mx-auto pb-12">
      
      {/* Header Area */}
      <div className="flex items-center justify-between mb-8 pb-6 border-b border-gray-200">
        <div className="flex items-center">
          <Link to="/properties" className="p-2 mr-4 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
            <ArrowLeft size={22} />
          </Link>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{property.propertyName}</h2>
            <p className="text-gray-500 text-sm mt-1">Property Management Hub</p>
          </div>
        </div>

        {/* MOVED: Internal Reference Code is now on the right */}
        <div className="flex items-center">
          <span className="px-4 py-2 inline-flex text-sm font-bold rounded-lg bg-gray-100 text-gray-800 tracking-widest border border-gray-200 shadow-sm">
            {property.internalRefCode}
          </span>
        </div>
      </div>

      {/* Vertical Two-Column Layout */}
      <div className="flex flex-col md:flex-row gap-8">
        <nav className="w-full md:w-64 flex-shrink-0">
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-3 flex flex-col space-y-1 sticky top-6">
            {TABS.map((tab) => (
              <NavLink
                key={tab.name}
                to={tab.path}
                end={tab.path === ''}
                className={({ isActive }) => `flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
                  isActive 
                    ? 'bg-blue-50 text-blue-700' 
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <tab.icon size={18} className="opacity-80" />
                {tab.name}
              </NavLink>
            ))}
          </div>
        </nav>

        <div className="flex-1 bg-white border border-gray-200 rounded-xl shadow-sm p-8 min-h-[600px]">
          <Outlet context={{ property, propertyId: id }} />
        </div>
      </div>
    </div>
  );
}