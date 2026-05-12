import { useState, useEffect } from 'react';
import { useParams, Link, NavLink, Outlet } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { ArrowLeft, ExternalLink } from 'lucide-react';

const TABS = [
  { name: 'Overview', path: '' }, // Empty path means it's the default index route
  { name: 'Property Types', path: 'types' },
  { name: 'Analytics', path: 'analytics' },
  { name: 'Guests', path: 'guests' },
  { name: 'Reservations', path: 'reservations' },
  { name: 'Calendar', path: 'calendar' },
  { name: 'Local Gems', path: 'local-gems' },
  { name: 'Tickets', path: 'tickets' },
  { name: 'Green Score', path: 'green-score' },
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
    <div className="max-w-7xl mx-auto pb-12">
      {/* Header Area */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center">
          <Link to="/properties" className="p-2 mr-3 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold text-gray-900">{property.propertyName}</h2>
              <span className="px-2.5 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                {property.internalRefCode}
              </span>
            </div>
            <p className="text-gray-500 text-sm mt-1">Property Hub</p>
          </div>
        </div>

        <button 
          onClick={() => window.open(`https://vailo.app/${property.urlSlug}`, '_blank')}
          className="flex items-center px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
        >
          <ExternalLink size={16} className="mr-2 text-gray-500" />
          Preview
        </button>
      </div>

      {/* Sub-Navigation Menu */}
      <div className="bg-white border border-gray-200 rounded-t-xl border-b-0 px-2 flex overflow-x-auto no-scrollbar">
        {TABS.map((tab) => (
          <NavLink
            key={tab.name}
            to={tab.path}
            end={tab.path === ''} // Exact match for the Overview tab
            className={({ isActive }) => `whitespace-nowrap px-4 py-4 text-sm font-medium border-b-2 transition-colors ${
              isActive 
                ? 'border-blue-600 text-blue-600' 
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {tab.name}
          </NavLink>
        ))}
      </div>

      {/* Dynamic Tab Content Area via Outlet */}
      <div className="bg-white border border-gray-200 rounded-b-xl shadow-sm p-8 min-h-[500px]">
        {/* We pass the fetched property data down to whatever child component is active */}
        <Outlet context={{ property, propertyId: id }} />
      </div>
    </div>
  );
}