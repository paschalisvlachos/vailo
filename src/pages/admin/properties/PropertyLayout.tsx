import { useEffect, useMemo, useState } from 'react';
import { useParams, Navigate, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { useAdminSession } from '../../../context/AdminSessionContext';
import {
  getPropertyAccessMode,
  isTabAllowedForAccess,
  type PropertyAccessMode,
} from '../../../lib/adminAccess';
import { isPreArrivalCheckInEnabled } from '../../../lib/preArrivalSettings';
import { adminPath } from '../../../lib/adminRoutes';
import { PROPERTY_ADMIN_SECTIONS } from '../../../lib/propertyAdminNav';
import { repairAgencyPortfolioNameIfNeeded } from '../../../lib/createPropertyFromAddDraft';

export type PropertyRecord = {
  id: string;
  propertyName?: string;
  internalRefCode?: string;
  urlSlug?: string;
  previousUrlSlugs?: string[];
  listingKind?: string;
  country?: string;
  area?: string;
  city?: string;
  ownerId?: string;
  listingUrl?: string;
  googleMapsUrl?: string;
  createdAt?: string;
  guestPortalAccessRequired?: boolean;
  reservationSplitEnabled?: boolean;
  /** When false, iCal sync is locked and Calendar / Reservations are hidden. */
  calendarSyncEnabled?: boolean;
  /** When false, in-portal Check in is hidden for this property. */
  preArrivalCheckInEnabled?: boolean;
  preArrivalTransferOffer?: {
    enabled?: boolean;
    label?: string;
    priceEur?: number;
    paymentNote?: string;
  };
  autoSendGuestInviteWhenReady?: boolean;
  contentPrimaryLocale?: string;
  contentEnabledLocales?: string[];
};

export type PropertyOutletContext = {
  property: PropertyRecord;
  propertyId: string;
  propertyAccess: PropertyAccessMode;
  lockedListingId: string | null;
};

const REMOVED_SEGMENTS = new Set([
  '',
  'pick-feedback',
  'ai-gaps',
  'testers',
  'overview',
  'reservations',
  'calendar',
]);

export default function PropertyLayout() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { profile } = useAdminSession();
  const [property, setProperty] = useState<PropertyRecord | null>(null);
  const [typeRows, setTypeRows] = useState<
    { id: string; propertyId: string; ownerId?: string; propertyTypeName?: string }[]
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(
      doc(db, 'properties', id),
      (snap) => {
        if (snap.exists()) {
          setProperty({ id: snap.id, ...snap.data() } as PropertyRecord);
        } else {
          setProperty(null);
        }
        setLoading(false);
      },
      (err) => {
        console.error('Error fetching property:', err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [id]);

  // Repair shells wrongly named after a listing (legacy Add Property bug).
  useEffect(() => {
    if (!id || !property?.propertyName) return;
    if (!property.ownerId || property.ownerId !== profile?.id) return;
    const agencyName = profile.company?.trim() || profile.fullName?.trim();
    if (!agencyName) return;
    void repairAgencyPortfolioNameIfNeeded({
      propertyId: id,
      currentName: property.propertyName,
      agencyName,
    });
  }, [
    id,
    property?.propertyName,
    property?.ownerId,
    profile?.id,
    profile?.company,
    profile?.fullName,
  ]);

  useEffect(() => {
    if (!id) return;
    const unsub = onSnapshot(collection(db, 'properties', id, 'propertyTypes'), (snap) => {
      setTypeRows(
        snap.docs.map((d) => ({
          id: d.id,
          propertyId: id,
          ownerId: d.data().ownerId as string | undefined,
          propertyTypeName: d.data().propertyTypeName as string | undefined,
        }))
      );
    });
    return () => unsub();
  }, [id]);

  const propertyAccess = useMemo(
    () =>
      property && id
        ? getPropertyAccessMode(profile, id, property.ownerId, typeRows)
        : null,
    [profile, property, id, typeRows]
  );

  const lockedListingId = useMemo(() => {
    if (propertyAccess?.level !== 'listing_only') return null;
    const fromQuery = searchParams.get('listing');
    if (fromQuery && propertyAccess.typeIds.includes(fromQuery)) return fromQuery;
    return propertyAccess.typeIds[0] || null;
  }, [propertyAccess, searchParams]);

  const currentSegment =
    location.pathname.split(`${adminPath(`/properties/${id}`)}/`)[1]?.split('/')[0] ?? '';

  useEffect(() => {
    if (!id || !propertyAccess || loading) return;
    if (propertyAccess.level !== 'listing_only') return;

    const allowed = isTabAllowedForAccess(currentSegment, propertyAccess);
    if (!allowed && lockedListingId) {
      const target =
        currentSegment === 'house-guide'
          ? adminPath(`/properties/${id}/house-guide?listing=${lockedListingId}`)
          : adminPath(`/properties/${id}/types?listing=${lockedListingId}`);
      navigate(target, { replace: true });
    }
  }, [id, propertyAccess, currentSegment, lockedListingId, loading, navigate]);

  const allowedSegments = useMemo(() => {
    const paths = new Set<string>(['types']); // unified Property Listings entry
    for (const tab of PROPERTY_ADMIN_SECTIONS) {
      if (tab.path === 'check-ins' && !isPreArrivalCheckInEnabled(property)) continue;
      if (propertyAccess && isTabAllowedForAccess(tab.path, propertyAccess)) {
        paths.add(tab.path);
      }
    }
    // Listing-only access: types + house-guide only
    if (propertyAccess?.level === 'listing_only') {
      return new Set(
        [...paths].filter((p) => isTabAllowedForAccess(p, propertyAccess))
      );
    }
    return paths;
  }, [property, propertyAccess]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-500 text-sm">
        Loading property…
      </div>
    );
  }
  if (!property || !propertyAccess) {
    return (
      <div className="flex items-center justify-center py-24 text-red-500 text-sm">
        Property not found.
      </div>
    );
  }

  // Overview / removed tabs → Listings
  if (REMOVED_SEGMENTS.has(currentSegment) || !allowedSegments.has(currentSegment)) {
    const listingQ = lockedListingId
      ? `?listing=${encodeURIComponent(lockedListingId)}`
      : '';
    return (
      <Navigate to={adminPath(`/properties/${id}/types${listingQ}`)} replace />
    );
  }

  const outletContext: PropertyOutletContext = {
    property,
    propertyId: id!,
    propertyAccess,
    lockedListingId,
  };

  return (
    <div className="admin-page">
      <div className="min-w-0 bg-white rounded-lg border border-[#e1e1e1] shadow-[0_10px_10px_0_rgba(0,0,0,0.08)] p-4 sm:p-6 lg:p-8 xl:p-10 min-h-[420px]">
        <Outlet context={outletContext} />
      </div>
    </div>
  );
}
