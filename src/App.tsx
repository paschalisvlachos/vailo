import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "./lib/firebase";
import Layout from "./components/admin/Layout";
import Login from "./components/admin/Login";
import PropertiesPage from "./pages/admin/properties/PropertiesPage";
import AddProperty from "./pages/admin/properties/AddProperty";
import OwnersPage from "./pages/admin/OwnersPage";
import AddOwner from "./pages/admin/AddOwner";
import PropertyLayout from "./pages/admin/properties/PropertyLayout";
import Overview from "./pages/admin/properties/Overview";
import PropertyTypes from "./pages/admin/properties/PropertyTypes";
import LocalGems from "./pages/admin/properties/LocalGems";
import GreenScore from "./pages/admin/properties/GreenScore";
import Calendar from "./pages/admin/properties/Calendar";
import Reservations from "./pages/admin/properties/Reservations";
import HouseGuide from "./pages/admin/properties/HouseGuide";
import Features from "./pages/admin/properties/Features";
import Billing from "./pages/admin/Billing";
import AreaSelector from "./pages/admin/area/AreaSelector";
import AiCategories from "./pages/admin/area/AiCategories";
import LocalGemsCategories from "./pages/admin/area/LocalGemsCategories";
import FeaturesCategories from "./pages/admin/area/FeaturesCategories";
import FeaturesPhotos from "./pages/admin/area/FeaturesPhotos";
import AreaLocalGems from "./pages/admin/area/AreaLocalGems";
import AreaFeatures from "./pages/admin/area/AreaFeatures";
import AreaDiscoveredPlaces from "./pages/admin/area/AreaDiscoveredPlaces";
import AiGaps from "./pages/admin/properties/AiGaps";
import { useNewDiscoveredPlacesCount } from "./hooks/useNewDiscoveredPlacesCount";
import { Link } from "react-router-dom";
import { AlertCircle } from "lucide-react";

import GuestPortal from "./pages/guest/GuestPortal";

function DashboardPage() {
  const newDiscoveredCount = useNewDiscoveredPlacesCount();

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
        <p className="text-gray-500 mt-1">Overview of your platform</p>
      </div>

      {newDiscoveredCount > 0 && (
        <Link
          to="/area"
          className="flex items-start gap-4 p-5 mb-6 bg-amber-50 border border-amber-200 rounded-xl hover:bg-amber-100/80 transition-colors"
        >
          <AlertCircle className="text-amber-600 shrink-0 mt-0.5" size={24} />
          <div>
            <p className="font-bold text-amber-900">
              {newDiscoveredCount} discovered place{newDiscoveredCount === 1 ? '' : 's'} need review
            </p>
            <p className="text-sm text-amber-800/90 mt-1">
              Guest AI imported new venues from Google. Open Area Functionality → Discovered Places to verify coordinates, photos, and promote to Local Gems.
            </p>
          </div>
        </Link>
      )}

      <div className="p-8 border-4 border-dashed border-gray-200 rounded-xl bg-gray-50 text-center text-gray-400">
        Dashboard Data Cards Go Here.
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-[#F8F9FA]">Loading Vailo...</div>;
  }

  // NEW: A clean wrapper to protect admin routes while keeping them flat
  const AdminRoute = ({ children }: { children: React.ReactNode }) => {
    if (!user) return <Login />;
    return <Layout>{children}</Layout>;
  };

  return (
    <BrowserRouter>
      <Routes>
        {/* ======================================= */}
        {/* PUBLIC ROUTES                           */}
        {/* ======================================= */}
        <Route path="/:propertySlug/:typeSlug" element={<GuestPortal />} />

        {/* ======================================= */}
        {/* FLATTENED ADMIN ROUTES                  */}
        {/* ======================================= */}
        <Route path="/" element={<AdminRoute><DashboardPage /></AdminRoute>} />
        <Route path="/properties" element={<AdminRoute><PropertiesPage /></AdminRoute>} />
        <Route path="/add-property" element={<AdminRoute><AddProperty /></AdminRoute>} />
        
        {/* React Router now knows this takes priority over the GuestPortal route! */}
        <Route path="/properties/:id" element={<AdminRoute><PropertyLayout /></AdminRoute>}>
          <Route index element={<Overview />} />
          <Route path="types" element={<PropertyTypes />} />
          <Route path="local-gems" element={<LocalGems />} />
          <Route path="green-score" element={<GreenScore />} />
          <Route path="calendar" element={<Calendar />} />
          <Route path="reservations" element={<Reservations />} />
          <Route path="house-guide" element={<HouseGuide />} />
          <Route path="features" element={<Features />} />
          <Route path="ai-gaps" element={<AiGaps />} />
        </Route>

        <Route path="/owners" element={<AdminRoute><OwnersPage /></AdminRoute>} />
        <Route path="/add-owner" element={<AdminRoute><AddOwner /></AdminRoute>} />
        <Route path="/billing" element={<AdminRoute><Billing /></AdminRoute>} />
        <Route path="/area" element={<AdminRoute><AreaSelector /></AdminRoute>} />
        <Route path="/area/:country/:area/ai-categories" element={<AdminRoute><AiCategories /></AdminRoute>} />
        <Route path="/area/:country/:area/local-gems-categories" element={<AdminRoute><LocalGemsCategories /></AdminRoute>} />
        <Route path="/area/:country/:area/features-categories" element={<AdminRoute><FeaturesCategories /></AdminRoute>} />
        <Route path="/area/:country/:area/features-photos" element={<AdminRoute><FeaturesPhotos /></AdminRoute>} />
        <Route path="/area/:country/:area/local-gems" element={<AdminRoute><AreaLocalGems /></AdminRoute>} />
        <Route path="/area/:country/:area/features" element={<AdminRoute><AreaFeatures /></AdminRoute>} />
        <Route path="/area/:country/:area/discovered-places" element={<AdminRoute><AreaDiscoveredPlaces /></AdminRoute>} />
      </Routes>
    </BrowserRouter>
  );
}