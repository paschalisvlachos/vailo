import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "./lib/firebase";
import Layout from "./components/admin/Layout";
import Login from "./components/admin/Login";
import PropertiesPage from "./pages/admin/properties/PropertiesPage";
import PropertyFormPage from "./pages/admin/properties/PropertyFormPage";
import OwnersPage from "./pages/admin/OwnersPage";
import OwnerFormPage from "./pages/admin/OwnerFormPage";
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
import LegalDocuments from "./pages/admin/LegalDocuments";
import Settings from "./pages/admin/Settings";
import AreaSelector from "./pages/admin/area/AreaSelector";
import LocalGemsCategories from "./pages/admin/area/LocalGemsCategories";
import FeaturesCategories from "./pages/admin/area/FeaturesCategories";
import FeaturesPhotos from "./pages/admin/area/FeaturesPhotos";
import AreaLocalGems from "./pages/admin/area/AreaLocalGems";
import AreaFeatures from "./pages/admin/area/AreaFeatures";
import AreaDiscoveredPlaces from "./pages/admin/area/AreaDiscoveredPlaces";
import AiGaps from "./pages/admin/properties/AiGaps";
import HouseGuests from "./pages/admin/properties/HouseGuests";
import PropertyTesters from "./pages/admin/properties/PropertyTesters";
import PropertyAnalytics from "./pages/admin/properties/PropertyAnalytics";
import GuestIssues from "./pages/admin/properties/GuestIssues";
import PickFeedback from "./pages/admin/properties/PickFeedback";
import { useNewDiscoveredPlacesCount } from "./hooks/useNewDiscoveredPlacesCount";
import { Link } from "react-router-dom";
import { AlertCircle } from "lucide-react";

import { ToastProvider } from "./context/ToastContext";
import GuestPortal from "./pages/guest/GuestPortal";
import AdminPageHeader, { AdminCard } from "./components/admin/AdminPageHeader";
import { Building2, Globe, Users, Sparkles } from "lucide-react";

function DashboardPage() {
  const newDiscoveredCount = useNewDiscoveredPlacesCount();

  return (
    <div className="admin-page">
      <AdminPageHeader
        title="Dashboard"
        description="Overview of your platform"
      />

      {newDiscoveredCount > 0 && (
        <Link
          to="/area"
          className="flex items-start gap-4 p-4 sm:p-5 mb-6 bg-vailo-gold/10 border border-vailo-gold/25 rounded-2xl hover:bg-vailo-gold/15 transition-colors"
        >
          <AlertCircle className="text-vailo-gold shrink-0 mt-0.5" size={22} />
          <div className="min-w-0">
            <p className="font-bold text-vailo-dark text-sm sm:text-base">
              {newDiscoveredCount} discovered place{newDiscoveredCount === 1 ? '' : 's'} need review
            </p>
            <p className="text-sm text-vailo-gold-muted mt-1">
              Open Area Functionality → Discovered Places to verify and promote to Local Gems.
            </p>
          </div>
        </Link>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-5 mb-8">
        {[
          { icon: Building2, label: 'Properties', to: '/properties', desc: 'Portfolio & guest portals' },
          { icon: Users, label: 'Owners CRM', to: '/owners', desc: 'Owners & agents' },
          { icon: Globe, label: 'Area data', to: '/area', desc: 'Gems, features, AI rules' },
          { icon: Sparkles, label: 'AI concierge', desc: 'Powered by guest portal', muted: true },
        ].map((item) =>
          item.to ? (
            <Link key={item.label} to={item.to}>
              <AdminCard className="p-5 sm:p-6 hover:shadow-[0_8px_30px_-12px_rgba(11,79,92,0.18)] hover:border-vailo-teal/15 transition-all h-full group">
                <div className="admin-icon-box mb-4 group-hover:bg-vailo-gold/15 group-hover:text-vailo-gold transition-colors">
                  <item.icon size={20} />
                </div>
                <p className="font-bold text-vailo-dark font-luxury">{item.label}</p>
                <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">{item.desc}</p>
              </AdminCard>
            </Link>
          ) : (
            <AdminCard key={item.label} className="p-5 sm:p-6 h-full">
              <div className="admin-icon-box-gold mb-4">
                <item.icon size={20} />
              </div>
              <p className="font-bold text-vailo-dark font-luxury">{item.label}</p>
              <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">{item.desc}</p>
            </AdminCard>
          )
        )}
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
    return (
      <div className="min-h-screen flex items-center justify-center bg-vailo-surface text-vailo-teal text-sm font-medium">
        Loading Vailo…
      </div>
    );
  }

  // NEW: A clean wrapper to protect admin routes while keeping them flat
  const AdminRoute = ({ children }: { children: React.ReactNode }) => {
    if (!user) return <Login />;
    return <Layout>{children}</Layout>;
  };

  return (
    <ToastProvider>
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
        <Route path="/add-property" element={<AdminRoute><PropertyFormPage /></AdminRoute>} />
        <Route path="/properties/:id/edit" element={<AdminRoute><PropertyFormPage /></AdminRoute>} />
        
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
          <Route path="guest-issues" element={<GuestIssues />} />
          <Route path="pick-feedback" element={<PickFeedback />} />
          <Route path="ai-gaps" element={<AiGaps />} />
          <Route path="house-guests" element={<HouseGuests />} />
          <Route path="testers" element={<PropertyTesters />} />
          <Route path="analytics" element={<PropertyAnalytics />} />
        </Route>

        <Route path="/owners" element={<AdminRoute><OwnersPage /></AdminRoute>} />
        <Route path="/add-owner" element={<AdminRoute><OwnerFormPage /></AdminRoute>} />
        <Route path="/owners/:id/edit" element={<AdminRoute><OwnerFormPage /></AdminRoute>} />
        <Route path="/billing" element={<AdminRoute><Billing /></AdminRoute>} />
        <Route path="/legal" element={<AdminRoute><LegalDocuments /></AdminRoute>} />
        <Route path="/settings" element={<AdminRoute><Settings /></AdminRoute>} />
        <Route path="/area" element={<AdminRoute><AreaSelector /></AdminRoute>} />
        <Route path="/area/:country/:area/local-gems-categories" element={<AdminRoute><LocalGemsCategories /></AdminRoute>} />
        <Route path="/area/:country/:area/features-categories" element={<AdminRoute><FeaturesCategories /></AdminRoute>} />
        <Route path="/area/:country/:area/features-photos" element={<AdminRoute><FeaturesPhotos /></AdminRoute>} />
        <Route path="/area/:country/:area/local-gems" element={<AdminRoute><AreaLocalGems /></AdminRoute>} />
        <Route path="/area/:country/:area/features" element={<AdminRoute><AreaFeatures /></AdminRoute>} />
        <Route path="/area/:country/:area/discovered-places" element={<AdminRoute><AreaDiscoveredPlaces /></AdminRoute>} />
      </Routes>
    </BrowserRouter>
    </ToastProvider>
  );
}