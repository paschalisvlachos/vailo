import { lazy, Suspense, useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "./lib/firebase";
import { isGuestPortalUrlPath } from "./lib/guestAccess";
import GuestPortalLoadingScreen from "./components/guest/GuestPortalLoadingScreen";
import AdminAuthenticatedShell from "./components/admin/AdminAuthenticatedShell";
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
import AreaRadar from "./pages/admin/area/AreaRadar";
import AreaNeighborPreview from "./pages/admin/area/AreaNeighborPreview";
import ExcursionProvidersPage from "./pages/admin/excursions/ExcursionProvidersPage";
import ExcursionProviderFormPage from "./pages/admin/excursions/ExcursionProviderFormPage";
import ExcursionProviderPortalHome from "./pages/admin/excursions/ExcursionProviderPortalHome";
import ExcursionsListPage from "./pages/admin/excursions/ExcursionsListPage";
import ExcursionProviderDetailsPage from "./pages/admin/excursions/ExcursionProviderDetailsPage";
import ExcursionFormPage from "./pages/admin/excursions/ExcursionFormPage";
import ExcursionAvailabilityPage from "./pages/admin/excursions/ExcursionAvailabilityPage";
import ExcursionDiscountsListPage from "./pages/admin/excursions/ExcursionDiscountsListPage";
import ExcursionDiscountFormPage from "./pages/admin/excursions/ExcursionDiscountFormPage";
import ExcursionBookingsListPage from "./pages/admin/excursions/ExcursionBookingsListPage";
import ExcursionBookingFormPage from "./pages/admin/excursions/ExcursionBookingFormPage";
import ExcursionBookingDetailPage from "./pages/admin/excursions/ExcursionBookingDetailPage";
import PartnerAgreementPage from "./pages/PartnerAgreementPage";
import AiGaps from "./pages/admin/properties/AiGaps";
import HouseGuests from "./pages/admin/properties/HouseGuests";
import PropertyTesters from "./pages/admin/properties/PropertyTesters";
import PropertyAnalytics from "./pages/admin/properties/PropertyAnalytics";
import GuestIssues from "./pages/admin/properties/GuestIssues";
import PickFeedback from "./pages/admin/properties/PickFeedback";
import MailboxPage from "./pages/admin/MailboxPage";
import DashboardPage from "./pages/admin/DashboardPage";

import { ToastProvider } from "./context/ToastContext";
import {
  PlatformAdminOnly,
  PropertyAccessGuard,
  AgentOwnersGuard,
  ExcursionPortalGuard,
  ExcursionProviderAccessGuard,
  ScopedAdminHome,
} from "./components/admin/AdminAccessGuards";
import { ADMIN_BASE, adminPath } from "./lib/adminRoutes";

const GuestPortal = lazy(() => import("./pages/guest/GuestPortal"));

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
  const [loading, setLoading] = useState(() =>
    typeof window !== "undefined" ? !isGuestPortalUrlPath(window.location.pathname) : true
  );

  useEffect(() => {
    const guestPortalPath = isGuestPortalUrlPath(window.location.pathname);
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!guestPortalPath) {
        setLoading(false);
      }
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

        {/* Admin app — one session shell for all routes (avoids reload on every navigation) */}
        <Route path={ADMIN_BASE} element={<AdminAuthenticatedShell user={user} />}>
          <Route index element={<PlatformAdminOnly><DashboardPage /></PlatformAdminOnly>} />
          <Route path="mailbox" element={<PlatformAdminOnly><MailboxPage /></PlatformAdminOnly>} />
          <Route path="inbox" element={<Navigate to={adminPath('/mailbox')} replace />} />
          <Route
            path="properties"
            element={
              <ScopedAdminHome>
                <PropertiesPage />
              </ScopedAdminHome>
            }
          />
          <Route path="add-property" element={<PlatformAdminOnly><PropertyFormPage /></PlatformAdminOnly>} />
          <Route path="properties/:id/edit" element={<PlatformAdminOnly><PropertyFormPage /></PlatformAdminOnly>} />
          <Route
            path="properties/:id"
            element={
              <PropertyAccessGuard>
                <PropertyLayout />
              </PropertyAccessGuard>
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

          <Route path="owners" element={<AgentOwnersGuard><OwnersPage /></AgentOwnersGuard>} />
          <Route path="add-owner" element={<AgentOwnersGuard><OwnerFormPage /></AgentOwnersGuard>} />
          <Route path="owners/:id/edit" element={<AgentOwnersGuard><OwnerFormPage /></AgentOwnersGuard>} />
          <Route path="billing" element={<PlatformAdminOnly><Billing /></PlatformAdminOnly>} />
          <Route path="expenses" element={<PlatformAdminOnly><ExpensesPage /></PlatformAdminOnly>} />
          <Route path="expenses/add" element={<PlatformAdminOnly><ExpenseFormPage /></PlatformAdminOnly>} />
          <Route path="expenses/:id/edit" element={<PlatformAdminOnly><ExpenseFormPage /></PlatformAdminOnly>} />
          <Route path="legal" element={<PlatformAdminOnly><LegalDocuments /></PlatformAdminOnly>} />
          <Route path="settings" element={<PlatformAdminOnly><Settings /></PlatformAdminOnly>} />
          <Route path="account/password" element={<ChangePasswordPage />} />
          <Route path="knowledge" element={<PlatformAdminOnly><KnowledgeHub /></PlatformAdminOnly>} />
          <Route path="knowledge/web" element={<PlatformAdminOnly><WebKnowledge /></PlatformAdminOnly>} />
          <Route path="knowledge/client" element={<PlatformAdminOnly><ClientKnowledge /></PlatformAdminOnly>} />
          <Route path="knowledge/code" element={<PlatformAdminOnly><AppCodeKnowledge /></PlatformAdminOnly>} />
          <Route path="area" element={<PlatformAdminOnly><AreaSelector /></PlatformAdminOnly>} />
          <Route path="area/:country/:area/local-gems-categories" element={<PlatformAdminOnly><LocalGemsCategories /></PlatformAdminOnly>} />
          <Route path="area/:country/:area/features-categories" element={<PlatformAdminOnly><FeaturesCategories /></PlatformAdminOnly>} />
          <Route path="area/:country/:area/features-photos" element={<PlatformAdminOnly><FeaturesPhotos /></PlatformAdminOnly>} />
          <Route path="area/:country/:area/local-gems" element={<PlatformAdminOnly><AreaLocalGems /></PlatformAdminOnly>} />
          <Route path="area/:country/:area/features" element={<PlatformAdminOnly><AreaFeatures /></PlatformAdminOnly>} />
          <Route path="area/:country/:area/discovered-places" element={<PlatformAdminOnly><AreaDiscoveredPlaces /></PlatformAdminOnly>} />
          <Route path="area/:country/:area/area-radar" element={<PlatformAdminOnly><AreaRadar /></PlatformAdminOnly>} />
          <Route path="area/:country/:area/local-trails" element={<PlatformAdminOnly><AreaLocalTrails /></PlatformAdminOnly>} />
          <Route path="area/:country/:area/overlap-preview" element={<PlatformAdminOnly><AreaNeighborPreview /></PlatformAdminOnly>} />

          <Route path="excursions/providers" element={<PlatformAdminOnly><ExcursionProvidersPage /></PlatformAdminOnly>} />
          <Route path="excursions/providers/add" element={<PlatformAdminOnly><ExcursionProviderFormPage /></PlatformAdminOnly>} />
          <Route path="excursions/providers/:id/edit" element={<PlatformAdminOnly><ExcursionProviderFormPage /></PlatformAdminOnly>} />
          <Route path="excursions/providers/:providerId/bookings" element={<PlatformAdminOnly><ExcursionBookingsListPage /></PlatformAdminOnly>} />
          <Route path="excursions/providers/:providerId/excursions" element={<PlatformAdminOnly><ExcursionsListPage /></PlatformAdminOnly>} />
          <Route path="excursions/providers/:providerId/details" element={<PlatformAdminOnly><ExcursionProviderDetailsPage /></PlatformAdminOnly>} />
          <Route path="excursions/providers/:providerId/excursions/add" element={<PlatformAdminOnly><ExcursionFormPage /></PlatformAdminOnly>} />
          <Route path="excursions/providers/:providerId/excursions/:excursionId/edit" element={<PlatformAdminOnly><ExcursionFormPage /></PlatformAdminOnly>} />
          <Route path="excursions/providers/:providerId/excursions/:excursionId/availability" element={<PlatformAdminOnly><ExcursionAvailabilityPage /></PlatformAdminOnly>} />
          <Route path="excursions/providers/:providerId/excursions/:excursionId/discounts" element={<PlatformAdminOnly><ExcursionDiscountsListPage /></PlatformAdminOnly>} />
          <Route path="excursions/providers/:providerId/excursions/:excursionId/discounts/add" element={<PlatformAdminOnly><ExcursionDiscountFormPage /></PlatformAdminOnly>} />
          <Route path="excursions/providers/:providerId/excursions/:excursionId/discounts/:discountId/edit" element={<PlatformAdminOnly><ExcursionDiscountFormPage /></PlatformAdminOnly>} />
          <Route path="excursions/providers/:providerId/excursions/:excursionId/bookings" element={<PlatformAdminOnly><ExcursionBookingsListPage /></PlatformAdminOnly>} />
          <Route path="excursions/providers/:providerId/excursions/:excursionId/bookings/add" element={<PlatformAdminOnly><ExcursionBookingFormPage /></PlatformAdminOnly>} />
          <Route path="excursions/providers/:providerId/excursions/:excursionId/bookings/:bookingId" element={<PlatformAdminOnly><ExcursionBookingDetailPage /></PlatformAdminOnly>} />

          <Route path="excursion-portal" element={<ExcursionPortalGuard><ExcursionProviderPortalHome /></ExcursionPortalGuard>} />
          <Route path="excursion-portal/:providerId" element={<ExcursionPortalGuard><ExcursionProviderAccessGuard><ExcursionProviderFormPage /></ExcursionProviderAccessGuard></ExcursionPortalGuard>} />
          <Route path="excursion-portal/:providerId/bookings" element={<ExcursionPortalGuard><ExcursionProviderAccessGuard><ExcursionBookingsListPage /></ExcursionProviderAccessGuard></ExcursionPortalGuard>} />
          <Route path="excursion-portal/:providerId/excursions" element={<ExcursionPortalGuard><ExcursionProviderAccessGuard><ExcursionsListPage /></ExcursionProviderAccessGuard></ExcursionPortalGuard>} />
          <Route path="excursion-portal/:providerId/details" element={<ExcursionPortalGuard><ExcursionProviderAccessGuard><ExcursionProviderDetailsPage /></ExcursionProviderAccessGuard></ExcursionPortalGuard>} />
          <Route path="excursion-portal/:providerId/excursions/add" element={<ExcursionPortalGuard><ExcursionProviderAccessGuard><ExcursionFormPage /></ExcursionProviderAccessGuard></ExcursionPortalGuard>} />
          <Route path="excursion-portal/:providerId/excursions/:excursionId/edit" element={<ExcursionPortalGuard><ExcursionProviderAccessGuard><ExcursionFormPage /></ExcursionProviderAccessGuard></ExcursionPortalGuard>} />
          <Route path="excursion-portal/:providerId/excursions/:excursionId/availability" element={<ExcursionPortalGuard><ExcursionProviderAccessGuard><ExcursionAvailabilityPage /></ExcursionProviderAccessGuard></ExcursionPortalGuard>} />
          <Route path="excursion-portal/:providerId/excursions/:excursionId/discounts" element={<ExcursionPortalGuard><ExcursionProviderAccessGuard><ExcursionDiscountsListPage /></ExcursionProviderAccessGuard></ExcursionPortalGuard>} />
          <Route path="excursion-portal/:providerId/excursions/:excursionId/discounts/add" element={<ExcursionPortalGuard><ExcursionProviderAccessGuard><ExcursionDiscountFormPage /></ExcursionProviderAccessGuard></ExcursionPortalGuard>} />
          <Route path="excursion-portal/:providerId/excursions/:excursionId/discounts/:discountId/edit" element={<ExcursionPortalGuard><ExcursionProviderAccessGuard><ExcursionDiscountFormPage /></ExcursionProviderAccessGuard></ExcursionPortalGuard>} />
          <Route path="excursion-portal/:providerId/excursions/:excursionId/bookings" element={<ExcursionPortalGuard><ExcursionProviderAccessGuard><ExcursionBookingsListPage /></ExcursionProviderAccessGuard></ExcursionPortalGuard>} />
          <Route path="excursion-portal/:providerId/excursions/:excursionId/bookings/add" element={<ExcursionPortalGuard><ExcursionProviderAccessGuard><ExcursionBookingFormPage /></ExcursionProviderAccessGuard></ExcursionPortalGuard>} />
          <Route path="excursion-portal/:providerId/excursions/:excursionId/bookings/:bookingId" element={<ExcursionPortalGuard><ExcursionProviderAccessGuard><ExcursionBookingDetailPage /></ExcursionProviderAccessGuard></ExcursionPortalGuard>} />
        </Route>

        <Route path="/partner-agreement" element={<PartnerAgreementPage />} />

        {/* Guest portal (vailo.app/:property/:unit) — after /admin routes */}
        <Route
          path="/:propertySlug/:typeSlug"
          element={
            <Suspense fallback={<GuestPortalLoadingScreen status="Loading Vailo" />}>
              <GuestPortal />
            </Suspense>
          }
        />
      </Routes>
    </BrowserRouter>
    </ToastProvider>
  );
}