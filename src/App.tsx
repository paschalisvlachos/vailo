import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "./lib/firebase";
import Layout from "./components/Layout";
import Login from "./components/Login";
import PropertiesPage from "./pages/properties/PropertiesPage";
import AddProperty from "./pages/properties/AddProperty";
import OwnersPage from "./pages/OwnersPage";
import AddOwner from "./pages/AddOwner";
import PropertyLayout from "./pages/properties/PropertyLayout";
import Overview from "./pages/properties/Overview";
import PropertyTypes from "./pages/properties/PropertyTypes";
import LocalGems from "./pages/properties/LocalGems";
import GreenScore from "./pages/properties/GreenScore";
import Calendar from "./pages/properties/Calendar";
import Reservations from "./pages/properties/Reservations";

// A quick placeholder for the Dashboard page
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

  if (!user) {
    return <Login />;
  }

  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/properties" element={<PropertiesPage />} />
          <Route path="/add-property" element={<AddProperty />} />
          <Route path="/properties/:id" element={<PropertyLayout />}>
            <Route index element={<Overview />} />
            <Route path="types" element={<PropertyTypes />} />
            <Route path="local-gems" element={<LocalGems />} />
            <Route path="green-score" element={<GreenScore />} />
            <Route path="calendar" element={<Calendar />} />
            <Route path="reservations" element={<Reservations />} />
          </Route>
          <Route path="/owners" element={<OwnersPage />} />
          <Route path="/add-owner" element={<AddOwner />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}