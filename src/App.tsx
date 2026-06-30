import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "./lib/firebase";
import { isGuestPortalUrlPath } from "./lib/guestAccess";
import GuestPortalLoadingScreen from "./components/guest/GuestPortalLoadingScreen";
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
import ExpensesPage from "./pages/admin/ExpensesPage";
import ExpenseFormPage from "./pages/admin/ExpenseFormPage";
import LegalDocuments from "./pages/admin/LegalDocuments";
import Settings from "./pages/admin/Settings";
import ChangePasswordPage from "./pages/admin/ChangePasswordPage";
import KnowledgeHub from "./pages/admin/knowledge/KnowledgeHub";
import WebKnowledge from "./pages/admin/knowledge/WebKnowledge";
import ClientKnowledge from "./pages/admin/knowledge/ClientKnowledge";
import AppCodeKnowledge from "./pages/admin/knowledge/AppCodeKnowledge";
import AreaSelector from "./pages/admin/area/AreaSelector";
import LocalGemsCategories from "./pages/admin/area/LocalGemsCategories";
import FeaturesCategories from "./pages/admin/area/FeaturesCategories";
import FeaturesPhotos from "./pages/admin/area/FeaturesPhotos";
import AreaLocalGems from "./pages/admin/area/AreaLocalGems";
import AreaFeatures from "./pages/admin/area/AreaFeatures";
import AreaDiscoveredPlaces from "./pages/admin/area/AreaDiscoveredPlaces";
import AreaLocalTrails from "./pages/admin/area/AreaLocalTrails";
import ExcursionProvidersPage from "./pages/admin/excursions/ExcursionProvidersPage";
import ExcursionProviderFormPage from "./pages/admin/excursions/ExcursionProviderFormPage";
import ExcursionProviderPortalHome from "./pages/admin/excursions/ExcursionProviderPortalHome";
import ExcursionsListPage from "./pages/admin/excursions/ExcursionsListPage";
import ExcursionFormPage from "./pages/admin/excursions/ExcursionFormPage";
import ExcursionAvailabilityPage from "./pages/admin/excursions/ExcursionAvailabilityPage";
import ExcursionDiscountsListPage from "./pages/admin/excursions/ExcursionDiscountsListPage";
import ExcursionDiscountFormPage from "./pages/admin/excursions/ExcursionDiscountFormPage";
import ExcursionBookingsListPage from "./pages/admin/excursions/ExcursionBookingsListPage";
import ExcursionBookingFormPage from "./pages/admin/excursions/ExcursionBookingFormPage";
import ExcursionBookingDetailPage from "./pages/admin/excursions/ExcursionBookingDetailPage";
import AiGaps from "./pages/admin/properties/AiGaps";
import HouseGuests from "./pages/admin/properties/HouseGuests";
import PropertyTesters from "./pages/admin/properties/PropertyTesters";
import PropertyAnalytics from "./pages/admin/properties/PropertyAnalytics";
import GuestIssues from "./pages/admin/properties/GuestIssues";
import PickFeedback from "./pages/admin/properties/PickFeedback";
import MailboxPage from "./pages/admin/MailboxPage";
import DashboardPage from "./pages/admin/DashboardPage";

import { ToastProvider } from "./context/ToastContext";
import { AdminSessionProvider, useAdminSession } from "./context/AdminSessionContext";
import {
  PlatformAdminOnly,
  PropertyAccessGuard,
  AgentOwnersGuard,
  ExcursionPortalGuard,
  ExcursionProviderAccessGuard,
  ScopedAdminHome,
} from "./components/admin/AdminAccessGuards";
import GuestPortal from "./pages/guest/GuestPortal";
import { adminPath } from "./lib/adminRoutes";

/** Dev: root `/` is the Vite entry — send visitors to the static marketing site. */
function DevMarketingRedirect() {
  useEffect(() => {
    window.location.replace('/website/index.html');
  }, []);
  return null;
}

/** Old admin URLs (pre-/admin) → /admin/… */
function LegacyAdminRedirect() {
  const { pathname, search } = useLocation();
  return <Navigate to={`${adminPath()}${pathname}${search}`} replace />;
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
    if (typeof window !== "undefined" && isGuestPortalUrlPath(window.location.pathname)) {
      return <GuestPortalLoadingScreen status="Loading Vailo" />;
    }
    return (
      <div className="min-h-screen flex items-center justify-center bg-vailo-surface text-vailo-teal text-sm font-medium">
        Loading Vailo…
      </div>
    );
  }

  function AdminSessionGate({ children }: { children: React.ReactNode }) {
    const { loading } = useAdminSession();
    if (loading) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-vailo-surface text-vailo-teal text-sm font-medium">
          Loading your access…
        </div>
      );
    }
    return <>{children}</>;
  }

  const AdminRoute = ({ children }: { children: React.ReactNode }) => {
    if (!user) return <Login />;
    return (
      <AdminSessionProvider>
        <AdminSessionGate>
          <Layout>{children}</Layout>
        </AdminSessionGate>
      </AdminSessionProvider>
    );
  };

  return (
    <ToastProvider>
    <BrowserRouter>
      <Routes>
        {/* Dev only: production serves static marketing at / */}
        {import.meta.env.DEV && (
          <Route path="/" element={<DevMarketingRedirect />} />
        )}

        {/* Legacy admin URLs → /admin/… */}
        <Route path="/properties/*" element={<LegacyAdminRedirect />} />
        <Route path="/owners/*" element={<LegacyAdminRedirect />} />
        <Route path="/billing/*" element={<LegacyAdminRedirect />} />
        <Route path="/legal/*" element={<LegacyAdminRedirect />} />
        <Route path="/settings/*" element={<LegacyAdminRedirect />} />
        <Route path="/knowledge/*" element={<LegacyAdminRedirect />} />
        <Route path="/area/*" element={<LegacyAdminRedirect />} />
        <Route path="/add-property/*" element={<LegacyAdminRedirect />} />
        <Route path="/add-owner/*" element={<LegacyAdminRedirect />} />

        {/* Admin app (vailo.app/admin) */}
        <Route path={adminPath()} element={<AdminRoute><PlatformAdminOnly><DashboardPage /></PlatformAdminOnly></AdminRoute>} />
        <Route path={adminPath('/mailbox')} element={<AdminRoute><PlatformAdminOnly><MailboxPage /></PlatformAdminOnly></AdminRoute>} />
        <Route path={adminPath('/inbox')} element={<Navigate to={adminPath('/mailbox')} replace />} />
        <Route
          path={adminPath('/properties')}
          element={
            <AdminRoute>
              <ScopedAdminHome>
                <PropertiesPage />
              </ScopedAdminHome>
            </AdminRoute>
          }
        />
        <Route path={adminPath('/add-property')} element={<AdminRoute><PlatformAdminOnly><PropertyFormPage /></PlatformAdminOnly></AdminRoute>} />
        <Route path={adminPath('/properties/:id/edit')} element={<AdminRoute><PlatformAdminOnly><PropertyFormPage /></PlatformAdminOnly></AdminRoute>} />

        <Route
          path={adminPath('/properties/:id')}
          element={
            <AdminRoute>
              <PropertyAccessGuard>
                <PropertyLayout />
              </PropertyAccessGuard>
            </AdminRoute>
          }
        >
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

        <Route path={adminPath('/owners')} element={<AdminRoute><AgentOwnersGuard><OwnersPage /></AgentOwnersGuard></AdminRoute>} />
        <Route path={adminPath('/add-owner')} element={<AdminRoute><AgentOwnersGuard><OwnerFormPage /></AgentOwnersGuard></AdminRoute>} />
        <Route path={adminPath('/owners/:id/edit')} element={<AdminRoute><AgentOwnersGuard><OwnerFormPage /></AgentOwnersGuard></AdminRoute>} />
        <Route path={adminPath('/billing')} element={<AdminRoute><PlatformAdminOnly><Billing /></PlatformAdminOnly></AdminRoute>} />
        <Route path={adminPath('/expenses')} element={<AdminRoute><PlatformAdminOnly><ExpensesPage /></PlatformAdminOnly></AdminRoute>} />
        <Route path={adminPath('/expenses/add')} element={<AdminRoute><PlatformAdminOnly><ExpenseFormPage /></PlatformAdminOnly></AdminRoute>} />
        <Route path={adminPath('/expenses/:id/edit')} element={<AdminRoute><PlatformAdminOnly><ExpenseFormPage /></PlatformAdminOnly></AdminRoute>} />
        <Route path={adminPath('/legal')} element={<AdminRoute><PlatformAdminOnly><LegalDocuments /></PlatformAdminOnly></AdminRoute>} />
        <Route path={adminPath('/settings')} element={<AdminRoute><PlatformAdminOnly><Settings /></PlatformAdminOnly></AdminRoute>} />
        <Route
          path={adminPath('/account/password')}
          element={
            <AdminRoute>
              <ChangePasswordPage />
            </AdminRoute>
          }
        />
        <Route path={adminPath('/knowledge')} element={<AdminRoute><PlatformAdminOnly><KnowledgeHub /></PlatformAdminOnly></AdminRoute>} />
        <Route path={adminPath('/knowledge/web')} element={<AdminRoute><PlatformAdminOnly><WebKnowledge /></PlatformAdminOnly></AdminRoute>} />
        <Route path={adminPath('/knowledge/client')} element={<AdminRoute><PlatformAdminOnly><ClientKnowledge /></PlatformAdminOnly></AdminRoute>} />
        <Route path={adminPath('/knowledge/code')} element={<AdminRoute><PlatformAdminOnly><AppCodeKnowledge /></PlatformAdminOnly></AdminRoute>} />
        <Route path={adminPath('/area')} element={<AdminRoute><PlatformAdminOnly><AreaSelector /></PlatformAdminOnly></AdminRoute>} />
        <Route path={adminPath('/area/:country/:area/local-gems-categories')} element={<AdminRoute><PlatformAdminOnly><LocalGemsCategories /></PlatformAdminOnly></AdminRoute>} />
        <Route path={adminPath('/area/:country/:area/features-categories')} element={<AdminRoute><PlatformAdminOnly><FeaturesCategories /></PlatformAdminOnly></AdminRoute>} />
        <Route path={adminPath('/area/:country/:area/features-photos')} element={<AdminRoute><PlatformAdminOnly><FeaturesPhotos /></PlatformAdminOnly></AdminRoute>} />
        <Route path={adminPath('/area/:country/:area/local-gems')} element={<AdminRoute><PlatformAdminOnly><AreaLocalGems /></PlatformAdminOnly></AdminRoute>} />
        <Route path={adminPath('/area/:country/:area/features')} element={<AdminRoute><PlatformAdminOnly><AreaFeatures /></PlatformAdminOnly></AdminRoute>} />
        <Route path={adminPath('/area/:country/:area/discovered-places')} element={<AdminRoute><PlatformAdminOnly><AreaDiscoveredPlaces /></PlatformAdminOnly></AdminRoute>} />
        <Route path={adminPath('/area/:country/:area/local-trails')} element={<AdminRoute><PlatformAdminOnly><AreaLocalTrails /></PlatformAdminOnly></AdminRoute>} />

        <Route path={adminPath('/excursions/providers')} element={<AdminRoute><PlatformAdminOnly><ExcursionProvidersPage /></PlatformAdminOnly></AdminRoute>} />
        <Route path={adminPath('/excursions/providers/add')} element={<AdminRoute><PlatformAdminOnly><ExcursionProviderFormPage /></PlatformAdminOnly></AdminRoute>} />
        <Route path={adminPath('/excursions/providers/:id/edit')} element={<AdminRoute><PlatformAdminOnly><ExcursionProviderFormPage /></PlatformAdminOnly></AdminRoute>} />
        <Route path={adminPath('/excursions/providers/:providerId/bookings')} element={<AdminRoute><PlatformAdminOnly><ExcursionBookingsListPage /></PlatformAdminOnly></AdminRoute>} />

        <Route path={adminPath('/excursions/providers/:providerId/excursions')} element={<AdminRoute><PlatformAdminOnly><ExcursionsListPage /></PlatformAdminOnly></AdminRoute>} />
        <Route path={adminPath('/excursions/providers/:providerId/excursions/add')} element={<AdminRoute><PlatformAdminOnly><ExcursionFormPage /></PlatformAdminOnly></AdminRoute>} />
        <Route path={adminPath('/excursions/providers/:providerId/excursions/:excursionId/edit')} element={<AdminRoute><PlatformAdminOnly><ExcursionFormPage /></PlatformAdminOnly></AdminRoute>} />
        <Route path={adminPath('/excursions/providers/:providerId/excursions/:excursionId/availability')} element={<AdminRoute><PlatformAdminOnly><ExcursionAvailabilityPage /></PlatformAdminOnly></AdminRoute>} />
        <Route path={adminPath('/excursions/providers/:providerId/excursions/:excursionId/discounts')} element={<AdminRoute><PlatformAdminOnly><ExcursionDiscountsListPage /></PlatformAdminOnly></AdminRoute>} />
        <Route path={adminPath('/excursions/providers/:providerId/excursions/:excursionId/discounts/add')} element={<AdminRoute><PlatformAdminOnly><ExcursionDiscountFormPage /></PlatformAdminOnly></AdminRoute>} />
        <Route path={adminPath('/excursions/providers/:providerId/excursions/:excursionId/discounts/:discountId/edit')} element={<AdminRoute><PlatformAdminOnly><ExcursionDiscountFormPage /></PlatformAdminOnly></AdminRoute>} />
        <Route path={adminPath('/excursions/providers/:providerId/excursions/:excursionId/bookings')} element={<AdminRoute><PlatformAdminOnly><ExcursionBookingsListPage /></PlatformAdminOnly></AdminRoute>} />
        <Route path={adminPath('/excursions/providers/:providerId/excursions/:excursionId/bookings/add')} element={<AdminRoute><PlatformAdminOnly><ExcursionBookingFormPage /></PlatformAdminOnly></AdminRoute>} />
        <Route path={adminPath('/excursions/providers/:providerId/excursions/:excursionId/bookings/:bookingId')} element={<AdminRoute><PlatformAdminOnly><ExcursionBookingDetailPage /></PlatformAdminOnly></AdminRoute>} />

        <Route path={adminPath('/excursion-portal')} element={<AdminRoute><ExcursionPortalGuard><ExcursionProviderPortalHome /></ExcursionPortalGuard></AdminRoute>} />
        <Route path={adminPath('/excursion-portal/:providerId')} element={<AdminRoute><ExcursionPortalGuard><ExcursionProviderAccessGuard><ExcursionProviderFormPage /></ExcursionProviderAccessGuard></ExcursionPortalGuard></AdminRoute>} />
        <Route path={adminPath('/excursion-portal/:providerId/bookings')} element={<AdminRoute><ExcursionPortalGuard><ExcursionProviderAccessGuard><ExcursionBookingsListPage /></ExcursionProviderAccessGuard></ExcursionPortalGuard></AdminRoute>} />
        <Route path={adminPath('/excursion-portal/:providerId/excursions')} element={<AdminRoute><ExcursionPortalGuard><ExcursionProviderAccessGuard><ExcursionsListPage /></ExcursionProviderAccessGuard></ExcursionPortalGuard></AdminRoute>} />
        <Route path={adminPath('/excursion-portal/:providerId/excursions/add')} element={<AdminRoute><ExcursionPortalGuard><ExcursionProviderAccessGuard><ExcursionFormPage /></ExcursionProviderAccessGuard></ExcursionPortalGuard></AdminRoute>} />
        <Route path={adminPath('/excursion-portal/:providerId/excursions/:excursionId/edit')} element={<AdminRoute><ExcursionPortalGuard><ExcursionProviderAccessGuard><ExcursionFormPage /></ExcursionProviderAccessGuard></ExcursionPortalGuard></AdminRoute>} />
        <Route path={adminPath('/excursion-portal/:providerId/excursions/:excursionId/availability')} element={<AdminRoute><ExcursionPortalGuard><ExcursionProviderAccessGuard><ExcursionAvailabilityPage /></ExcursionProviderAccessGuard></ExcursionPortalGuard></AdminRoute>} />
        <Route path={adminPath('/excursion-portal/:providerId/excursions/:excursionId/discounts')} element={<AdminRoute><ExcursionPortalGuard><ExcursionProviderAccessGuard><ExcursionDiscountsListPage /></ExcursionProviderAccessGuard></ExcursionPortalGuard></AdminRoute>} />
        <Route path={adminPath('/excursion-portal/:providerId/excursions/:excursionId/discounts/add')} element={<AdminRoute><ExcursionPortalGuard><ExcursionProviderAccessGuard><ExcursionDiscountFormPage /></ExcursionProviderAccessGuard></ExcursionPortalGuard></AdminRoute>} />
        <Route path={adminPath('/excursion-portal/:providerId/excursions/:excursionId/discounts/:discountId/edit')} element={<AdminRoute><ExcursionPortalGuard><ExcursionProviderAccessGuard><ExcursionDiscountFormPage /></ExcursionProviderAccessGuard></ExcursionPortalGuard></AdminRoute>} />
        <Route path={adminPath('/excursion-portal/:providerId/excursions/:excursionId/bookings')} element={<AdminRoute><ExcursionPortalGuard><ExcursionProviderAccessGuard><ExcursionBookingsListPage /></ExcursionProviderAccessGuard></ExcursionPortalGuard></AdminRoute>} />
        <Route path={adminPath('/excursion-portal/:providerId/excursions/:excursionId/bookings/add')} element={<AdminRoute><ExcursionPortalGuard><ExcursionProviderAccessGuard><ExcursionBookingFormPage /></ExcursionProviderAccessGuard></ExcursionPortalGuard></AdminRoute>} />
        <Route path={adminPath('/excursion-portal/:providerId/excursions/:excursionId/bookings/:bookingId')} element={<AdminRoute><ExcursionPortalGuard><ExcursionProviderAccessGuard><ExcursionBookingDetailPage /></ExcursionProviderAccessGuard></ExcursionPortalGuard></AdminRoute>} />

        {/* Guest portal (vailo.app/:property/:unit) — after /admin routes */}
        <Route path="/:propertySlug/:typeSlug" element={<GuestPortal />} />
      </Routes>
    </BrowserRouter>
    </ToastProvider>
  );
}