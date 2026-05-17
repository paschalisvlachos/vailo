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

import GuestPortal from "./pages/guest/GuestPortal";

function DashboardPage() {
  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
        <p className="text-gray-500 mt-1">Overview of your platform</p>
      </div>
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
        </Route>

        <Route path="/owners" element={<AdminRoute><OwnersPage /></AdminRoute>} />
        <Route path="/add-owner" element={<AdminRoute><AddOwner /></AdminRoute>} />
      </Routes>
    </BrowserRouter>
  );
}