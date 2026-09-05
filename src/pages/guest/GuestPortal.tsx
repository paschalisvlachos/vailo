import { useState, useEffect, useMemo, useCallback, useRef, lazy, Suspense } from 'react';
import { useParams, useNavigate, useSearchParams, Navigate } from 'react-router-dom';
import { collection, query, where, getDocs, doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
const AiExpertView = lazy(() => import('./AiExpertView'));
const GuestPropertyAssistant = lazy(() => import('../../components/guest/GuestPropertyAssistant'));
const GuestExcursions = lazy(() => import('../../components/guest/GuestExcursions'));
const GuestSavedLocalGems = lazy(() => import('../../components/guest/GuestSavedLocalGems'));
import LegalDocumentModal from '../../components/guest/LegalDocumentModal';
import GuestLegalFooter from '../../components/guest/GuestLegalFooter';
import GuestFloatingActions from '../../components/guest/GuestFloatingActions';
import GuestReportIssueSheet from '../../components/guest/GuestReportIssueSheet';
import GuestPropertyMapSheet from '../../components/guest/GuestPropertyMapSheet';
import GuestExcursionsPromoCard from '../../components/guest/GuestExcursionsPromoCard';
import GuestAddToHomeBanner from '../../components/guest/GuestAddToHomeBanner';
import GuestPortalHome from '../../components/guest/GuestPortalHome';
import GuestPortalAccessGate from '../../components/guest/GuestPortalAccessGate';
import GuestOpenPreArrivalFlow from '../../components/guest/GuestOpenPreArrivalFlow';
import GuestPortalLoadingScreen from '../../components/guest/GuestPortalLoadingScreen';
import GemImpressionTracker from '../../components/guest/GemImpressionTracker';
import MirroredPhotoImg from '../../components/shared/MirroredPhotoImg';
import { GuestAnalyticsProvider, useGuestAnalytics } from '../../context/GuestAnalyticsContext';
import {
  getFeaturedConfig,
  PORTAL_FEATURED_CAP,
  type FeaturedKey,
  type FeaturedPreviewsMap,
} from '../../lib/houseGuidePortal';
import { usePlatformLegal } from '../../hooks/usePlatformLegal';
import { GuestLocaleProvider, useGuestLocale } from '../../context/GuestLocaleContext';
import { guestUiTFormat } from '../../lib/guestLocaleUi';
import { buildGoogleMapsEmbedUrl, getItemMapLinks, openExternalUrl } from '../../lib/geocoding';
import GuestLocalizedText from '../../components/guest/GuestLocalizedText';
import ExpandableDescription from '../../components/guest/ExpandableDescription';
import {
  clampContentLocalesToPlatform,
  parsePropertyContentLocaleSettings,
  resolveLocalizedString,
  type PropertyContentLocaleSettings,
} from '../../lib/propertyContentLocales';
import { usePlatformLanguages } from '../../hooks/usePlatformLanguages';
import { usePwaInstall } from '../../hooks/usePwaInstall';
import { useGuestPwaManifest } from '../../hooks/useGuestPwaManifest';
import { buildGuestWhatsAppLink } from '../../lib/whatsappLink';
import { isGuestPortalAccessRequired, readGuestPortalSession, writeGuestPortalSession, sessionMatchesOpenPreArrivalContext, type GuestPortalSession } from '../../lib/guestAccess';
import { isPreArrivalPortalView, clearPreArrivalViewIntent } from '../../lib/guestPreArrival';
import { isPreArrivalCheckInEnabled } from '../../lib/preArrivalSettings';
import { isCalendarSyncEnabled } from '../../lib/icalSync';
import { validateGuestPortalSession } from '../../lib/guestPortalCallables';
import { buildGoogleReviewUrl } from '../../lib/googleReviewUrl';
import {
  GuestAreaPrefetcher,
  useGuestAreaData,
} from '../../lib/guestAreaDataStore';
import {
  formatGuestSlug,
  getTypePublicSlug,
  resolvePropertyTypeFromUrl,
} from '../../lib/guestPortalSlug';
import { adminPath } from '../../lib/adminRoutes';
import { gemCategoryPrimaries } from '../../lib/categoryLocale';

const RESERVED_PORTAL_SLUGS = new Set(['admin', 'app', 'website']);
import { 
  MapPin, Navigation, 
  Star, Map, Clock, Award
} from 'lucide-react';

const GEMS_PAGE_SIZE = 5;

function GuestSubviewFallback() {
  return <GuestPortalLoadingScreen status="Loading…" />;
}

function GemDescription({
  gemId,
  gemName,
  gem,
}: {
  gemId: string;
  gemName?: string;
  gem: GuestGem;
}) {
  const { track } = useGuestAnalytics();
  return (
    <ExpandableDescription
      doc={gem}
      field="description"
      lines={2}
      className="mb-3"
      bodyClassName="guest-body-sm"
      toggleClassName="text-[#C5A059] text-sm font-bold normal-case mt-1 hover:underline tracking-wide min-h-[44px]"
      onExpand={() => track('gem_description_expand', { gemId, gemName })}
    />
  );
}

type GuestGem = {
  id: string;
  name?: string;
  description?: string;
  nameByLocale?: Record<string, string>;
  descriptionByLocale?: Record<string, string>;
  categoryByLocale?: Record<string, string>;
  photoUrl?: string;
  category?: string;
  rating?: number;
  distanceKm?: number;
  latitude?: number;
  longitude?: number;
  googleMapsUrl?: string;
  googlePlaceId?: string;
  isLegitPick?: boolean;
  isDailyTrip?: boolean;
  [key: string]: unknown;
};

/** Paginated gem cards — state stays here so "Load more" does not re-render the whole portal. */
function GuestGemsGrid({
  gems,
  listKey,
  mapAreaHint,
  propertyId,
  typeId,
}: {
  gems: GuestGem[];
  listKey: string;
  mapAreaHint: string;
  propertyId: string;
  typeId: string;
}) {
  const { locale, contentPrimaryLocale, contentReviewedLocales } = useGuestLocale();
  const [visibleCount, setVisibleCount] = useState(GEMS_PAGE_SIZE);
  const [activeGemMap, setActiveGemMap] = useState<string | null>(null);

  useEffect(() => {
    setVisibleCount(GEMS_PAGE_SIZE);
    setActiveGemMap(null);
  }, [listKey]);

  const visibleGems = gems.slice(0, visibleCount);
  const hasMore = visibleGems.length < gems.length;

  const handleLoadMore = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setVisibleCount((n) => Math.min(n + GEMS_PAGE_SIZE, gems.length));
  };

  return (
    <>
      <div className="grid grid-cols-1 gap-4">
        {visibleGems.map((gem) => {
          const gemName =
            resolveLocalizedString(gem, 'name', locale, contentPrimaryLocale, contentReviewedLocales) ||
            gem.name ||
            '';
          const gemCategory = gemCategoryPrimaries(
            gem,
            [],
            contentPrimaryLocale,
            locale
          ).join(' · ');
          const mapLinks = getItemMapLinks(
            {
              title: gemName,
              googleMapsUrl: gem.googleMapsUrl,
              googlePlaceId: gem.googlePlaceId,
              latitude: gem.latitude,
              longitude: gem.longitude,
            },
            mapAreaHint
          );
          const gemEmbedSrc = buildGoogleMapsEmbedUrl({
            title: gemName,
            areaHint: mapAreaHint,
            latitude: gem.latitude,
            longitude: gem.longitude,
            googlePlaceId: gem.googlePlaceId,
            googleMapsUrl: gem.googleMapsUrl,
            zoom: 14,
          });
          return (
          <div
            key={gem.id}
            data-gem-id={gem.id}
            data-gem-name={gemName}
            className="bg-white rounded-xl shadow-[0_4px_24px_-8px_rgba(11,79,92,0.1)] border border-gray-100/80 overflow-hidden flex flex-col group hover:shadow-[0_8px_32px_-8px_rgba(11,79,92,0.15)] transition-shadow duration-300"
          >
            <div className="relative bg-gray-100 overflow-hidden shrink-0 h-36 sm:h-40">
              {gem.photoUrl ? (
                <MirroredPhotoImg
                  src={gem.photoUrl}
                  alt={gemName}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  mirrorContext={{
                    docId: gem.id,
                    googlePlaceId:
                      typeof gem.googlePlaceId === 'string' ? gem.googlePlaceId : null,
                    propertyId,
                    propertyTypeId: typeId,
                    propertyGemId: gem.id,
                  }}
                  onMirrored={(firebaseUrl) => {
                    void updateDoc(
                      doc(db, 'properties', propertyId, 'propertyTypes', typeId, 'localGems', gem.id),
                      { photoUrl: firebaseUrl, updatedAt: new Date().toISOString() }
                    ).catch(() => {});
                  }}
                  fallback={
                    <div className="w-full h-full flex items-center justify-center text-[#C5A059]">
                      <MapPin size={32} />
                    </div>
                  }
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[#C5A059]">
                  <MapPin size={32} />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-[#051F26]/70 via-transparent to-transparent" />

              <div className="absolute top-2 left-2 flex flex-col gap-1 z-10 max-w-[85%]">
                {gem.isLegitPick && (
                  <span className="guest-badge bg-white/95 text-[#0B4F5C] border border-white/50 shadow-sm flex items-center w-fit">
                    <Award size={10} className="mr-1 text-[#C5A059]" /> Pick
                  </span>
                )}
                {gem.isDailyTrip && (
                  <span className="guest-badge bg-[#0B4F5C]/95 text-white shadow-sm flex items-center w-fit">
                    <Clock size={10} className="mr-1 text-[#C5A059]" /> Trip
                  </span>
                )}
              </div>

              <div className="absolute bottom-2 left-2 right-2 z-10 flex justify-between items-end gap-1">
                {gem.rating ? (
                  <span className="guest-badge bg-white text-gray-900 shadow-md flex items-center">
                    <Star size={11} className="mr-0.5 text-amber-400 fill-current" /> {gem.rating}
                  </span>
                ) : (
                  <div />
                )}
                {gem.distanceKm != null && (
                  <span className="guest-badge bg-[#C5A059] text-white shadow-md flex items-center shrink-0">
                    <Navigation size={10} className="mr-0.5" /> {gem.distanceKm}km
                  </span>
                )}
              </div>
            </div>

            {activeGemMap === gem.id && (
              <div className="w-full bg-gray-100 border-b border-gray-200 h-48 sm:h-52">
                <iframe
                  title={`Map — ${gemName || 'location'}`}
                  width="100%"
                  height="100%"
                  frameBorder="0"
                  scrolling="no"
                  src={gemEmbedSrc}
                />
              </div>
            )}

            <div className="p-4 flex-1 flex flex-col min-w-0">
              <p className="text-sm text-[#C5A059] font-bold uppercase tracking-wider mb-1 truncate">
                {gemCategory || 'Location'}
              </p>
              <h3 className="guest-card-title mb-2 line-clamp-2">
                <GuestLocalizedText
                  doc={gem}
                  field="name"
                  locale={locale}
                  primaryLocale={contentPrimaryLocale}
                  reviewedLocales={contentReviewedLocales}
                />
              </h3>

              {(gem.description || gem.descriptionByLocale) && (
                <GemDescription gemId={gem.id} gemName={gemName} gem={gem} />
              )}

              <div className="mt-auto pt-3 border-t border-gray-100 flex gap-2">
                <button
                  type="button"
                  onClick={() => setActiveGemMap(activeGemMap === gem.id ? null : gem.id)}
                  className="guest-btn-action flex-1 bg-gray-100 hover:bg-gray-200 text-[#0B4F5C] border border-gray-200"
                >
                  <Map size={14} className="shrink-0" /> Map
                </button>
                <button
                  type="button"
                  onClick={() => openExternalUrl(mapLinks.navigateUrl)}
                  className="guest-btn-action flex-1 bg-[#0B4F5C] hover:bg-[#C5A059] text-white shadow-sm"
                >
                  <Navigation size={14} className="shrink-0" /> Route
                </button>
              </div>
            </div>
          </div>
        );
        })}
      </div>
      {hasMore && (
        <button
          type="button"
          onClick={handleLoadMore}
          className="guest-btn-action mt-4 w-full py-4 rounded-xl border border-[#0B4F5C]/20 bg-white text-[#0B4F5C] hover:bg-[#0B4F5C]/5 transition-colors shadow-sm"
        >
          {guestUiTFormat(locale, 'loadMoreLeft', { count: gems.length - visibleGems.length })}
        </button>
      )}
    </>
  );
}

function GuestPortalPage({
  onSessionLocale,
  onContentLocaleSettings,
}: {
  onSessionLocale?: (locale: string | null) => void;
  onContentLocaleSettings?: (settings: PropertyContentLocaleSettings) => void;
}) {
  const { languages } = usePlatformLanguages();
  const platformCodes = useMemo(() => languages.map((l) => l.shortName), [languages]);
  const { propertySlug, typeSlug } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  if (propertySlug && RESERVED_PORTAL_SLUGS.has(propertySlug.toLowerCase())) {
    if (typeSlug?.toLowerCase() === 'area') {
      return <Navigate to={adminPath('/area')} replace />;
    }
    return <Navigate to={adminPath()} replace />;
  }
  const typeIdFromQuery = searchParams.get('typeId') || searchParams.get('type');
  const inviteTokenFromQuery = searchParams.get('invite');
  const adminPreviewFromQuery = searchParams.get('adminPreview') === '1';
  const isMobileFramePreview =
    adminPreviewFromQuery && searchParams.get('previewFrame') === 'mobile';

  const [property, setProperty] = useState<any>(null);
  const [propertyId, setPropertyId] = useState<string | null>(null);
  const [typeId, setTypeId] = useState<string | null>(null);
  const [typeData, setTypeData] = useState<any>(null);
  const [guide, setGuide] = useState<any>(null);
  
  const [gems, setGems] = useState<any[]>([]);
  const [features, setFeatures] = useState<any[]>([]);
  
  const [resolving, setResolving] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeView, setActiveView] = useState<'portal' | 'aiExpert' | 'assistant' | 'excursions' | 'savedGems'>('portal');
  const [copiedWifi, setCopiedWifi] = useState(false);
  const [propertyMapOpen, setPropertyMapOpen] = useState(false);
  const { locale, setLocale, t, localeOptions, contentPrimaryLocale } = useGuestLocale();
  const { resolved: platformLegalResolved } = usePlatformLegal(locale);
  const pwaInstall = usePwaInstall();
  
  const [gemFilters, setGemFilters] = useState<string[]>([]);
  const [legalModal, setLegalModal] = useState<'privacy' | 'terms' | null>(null);
  const [reportSheetOpen, setReportSheetOpen] = useState(false);
  const [serviceDetailOpen, setServiceDetailOpen] = useState(false);
  const [excursionOverlayOpen, setExcursionOverlayOpen] = useState(false);
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [checkInCompleteLocal, setCheckInCompleteLocal] = useState(false);
  const {
    excursionListings,
    excursionsLoading,
    listingAreaCtx,
  } = useGuestAreaData();
  const guestLoadKeyRef = useRef<string | null>(null);
  const [guestSession, setGuestSession] = useState<GuestPortalSession | null>(() =>
    readGuestPortalSession()
  );

  const handleSessionGranted = useCallback(
    (session: GuestPortalSession) => {
      writeGuestPortalSession(session);
      setGuestSession(session);
      if (session.preArrivalComplete) {
        setCheckInCompleteLocal(true);
      }
      onSessionLocale?.(session.guestLocale?.trim() || null);
    },
    [onSessionLocale]
  );

  const handleSessionCleared = useCallback(() => {
    setGuestSession(null);
    setCheckInCompleteLocal(false);
  }, []);

  const markCheckInComplete = useCallback(() => {
    setCheckInCompleteLocal(true);
    const stored = readGuestPortalSession();
    if (!stored) return;
    const next = { ...stored, preArrivalComplete: true };
    writeGuestPortalSession(next);
    setGuestSession(next);
  }, []);

  const activeGuestSession = guestSession ?? readGuestPortalSession();

  const preArrivalCheckInEnabled = isPreArrivalCheckInEnabled(property);

  useEffect(() => {
    if (!propertyId || !typeId || resolving) return;
    if (!isPreArrivalPortalView(searchParams.get('view'))) return;
    clearPreArrivalViewIntent(propertyId, typeId);
    const next = new URLSearchParams(searchParams);
    next.delete('view');
    navigate({ search: next.toString() ? `?${next.toString()}` : '' }, { replace: true });
    if (preArrivalCheckInEnabled) {
      setCheckInOpen(true);
    }
  }, [
    propertyId,
    typeId,
    resolving,
    searchParams,
    navigate,
    preArrivalCheckInEnabled,
  ]);

  useEffect(() => {
    if (!propertyId || resolving) return;
    const stored = guestSession ?? readGuestPortalSession();
    if (!stored?.sessionId || stored.propertyId !== propertyId) return;
    if (!sessionMatchesOpenPreArrivalContext(stored, propertyId, typeId || stored.typeId)) {
      return;
    }
    if (stored.preArrivalComplete) {
      setCheckInCompleteLocal(true);
      return;
    }

    let cancelled = false;
    void validateGuestPortalSession(propertyId, stored.typeId, stored.sessionId)
      .then((result) => {
        if (cancelled || !result.valid) return;
        if (result.session) {
          writeGuestPortalSession(result.session);
          setGuestSession(result.session);
        }
        if (result.preArrivalComplete || result.session?.preArrivalComplete) {
          setCheckInCompleteLocal(true);
        }
      })
      .catch(() => {
        /* keep Check in visible until we know */
      });

    return () => {
      cancelled = true;
    };
  }, [propertyId, typeId, resolving, guestSession?.sessionId, guestSession?.preArrivalComplete]);

  const preArrivalBooking = useMemo(() => {
    const bookingId = activeGuestSession?.bookingId;
    if (!bookingId || !typeData?.syncedBookings) return null;
    const list = typeData.syncedBookings as Array<{
      id?: string;
      start?: string;
      end?: string;
      guestName?: string;
      summary?: string;
      guestCountry?: string;
      guestPhone?: string;
      guestWhatsapp?: string;
      guestEmail?: string;
      preArrivalComplete?: boolean;
      preArrivalSubmission?: import('../../lib/syncedBooking').PreArrivalSubmission;
    }>;
    const match = list.find((b) => b.id === bookingId);
    if (!match) return null;
    return {
      start: match.start,
      end: match.end,
      guestName: match.guestName,
      summary: match.summary,
      guestCountry: match.guestCountry,
      guestPhone: match.guestPhone,
      guestWhatsapp: match.guestWhatsapp,
      guestEmail: match.guestEmail,
      preArrivalComplete: match.preArrivalComplete,
      preArrivalSubmission: match.preArrivalSubmission,
    };
  }, [activeGuestSession?.bookingId, typeData?.syncedBookings]);

  const checkInComplete =
    checkInCompleteLocal ||
    activeGuestSession?.preArrivalComplete === true ||
    preArrivalBooking?.preArrivalComplete === true;
  const showCheckInPromo = Boolean(preArrivalCheckInEnabled);
  const checkInContinue = Boolean(activeGuestSession?.bookingId) && !checkInComplete;

  const { track } = useGuestAnalytics();
  const openLiveLikeLocal = useCallback(() => {
    track('live_like_local_open');
    setActiveView('aiExpert');
  }, [track]);
  const openAssistant = useCallback(() => setActiveView('assistant'), []);
  const openExcursions = useCallback(() => {
    track('excursions_open');
    setActiveView('excursions');
  }, [track]);

  useEffect(() => {
    const fetchGuestData = async () => {
      if (!propertySlug || !typeSlug) return;
      const loadKey = `${formatGuestSlug(propertySlug)}|${typeSlug}|${typeIdFromQuery ?? ''}`;
      const isNewTarget = guestLoadKeyRef.current !== loadKey;
      if (!isNewTarget && propertyId) return;
      guestLoadKeyRef.current = loadKey;
      setResolving(true);
      setError(null);
      if (isNewTarget) {
        setGems([]);
        setFeatures([]);
      }
      try {
        const slugParam = formatGuestSlug(propertySlug);
        let propDoc = null;

        const propSnap = await getDocs(
          query(collection(db, 'properties'), where('urlSlug', '==', slugParam))
        );
        if (!propSnap.empty) {
          propDoc = propSnap.docs[0];
        } else {
          const legacyPropSnap = await getDocs(
            query(collection(db, 'properties'), where('previousUrlSlugs', 'array-contains', slugParam))
          );
          if (!legacyPropSnap.empty) propDoc = legacyPropSnap.docs[0];
        }

        if (!propDoc) {
          setError('Property not found.');
          setResolving(false);
          return;
        }

        const resolvedPropertyId = propDoc.id;
        const propData = propDoc.data();
        setPropertyId(resolvedPropertyId);
        setProperty({ id: resolvedPropertyId, ...propData });
        onContentLocaleSettings?.(
          clampContentLocalesToPlatform(
            parsePropertyContentLocaleSettings(propData),
            platformCodes
          )
        );

        let targetTypeId: string | null = null;
        let targetTypeData: Record<string, unknown> | null = null;
        const preferredTypeId = String(typeIdFromQuery || '').trim();

        if (preferredTypeId) {
          const typeDocSnap = await getDoc(
            doc(db, 'properties', resolvedPropertyId, 'propertyTypes', preferredTypeId)
          );
          if (typeDocSnap.exists()) {
            targetTypeId = typeDocSnap.id;
            targetTypeData = typeDocSnap.data();
          }
        }

        if (!targetTypeId) {
          const typesSnap = await getDocs(
            collection(db, 'properties', resolvedPropertyId, 'propertyTypes')
          );
          const typeMatch = resolvePropertyTypeFromUrl(
            typesSnap.docs,
            typeSlug || '',
            typeIdFromQuery
          );
          if (!typeMatch) {
            setError('Unit not found.');
            setResolving(false);
            return;
          }
          targetTypeId = typeMatch.id;
          targetTypeData = typeMatch.data;
        }

        setTypeId(targetTypeId);
        setTypeData(targetTypeData);
        setResolving(false);

        const guideRef = doc(
          db,
          'properties',
          resolvedPropertyId,
          'propertyTypes',
          targetTypeId,
          'houseGuide',
          'data'
        );
        const gemsRef = collection(
          db,
          'properties',
          resolvedPropertyId,
          'propertyTypes',
          targetTypeId,
          'localGems'
        );
        const featuresRef = collection(
          db,
          'properties',
          resolvedPropertyId,
          'propertyTypes',
          targetTypeId,
          'features'
        );

        const guidePromise = getDoc(guideRef);
        const gemsPromise = getDocs(gemsRef);
        const featuresPromise = getDocs(featuresRef);

        const guideDoc = await guidePromise;
        if (guideDoc.exists()) setGuide(guideDoc.data());

        const [gemsSnap, featuresSnap] = await Promise.all([gemsPromise, featuresPromise]);
        setGems(gemsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setFeatures(featuresSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error("Error loading guest portal:", err);
        setError("Failed to load property data.");
        setResolving(false);
      }
    };
    fetchGuestData();
  }, [propertySlug, typeSlug, typeIdFromQuery]);

  useEffect(() => {
    if (resolving || error || !property || !typeData) return;
    const canonicalProperty = formatGuestSlug(property.urlSlug);
    const canonicalType = getTypePublicSlug(typeData);
    if (!canonicalProperty || !canonicalType) return;
    if (propertySlug !== canonicalProperty || typeSlug !== canonicalType) {
      const qs = new URLSearchParams(searchParams);
      if (typeId && !qs.has('typeId') && !qs.has('type')) {
        qs.set('typeId', typeId);
      }
      const qsString = qs.toString();
      navigate(
        `/${canonicalProperty}/${canonicalType}${qsString ? `?${qsString}` : ''}`,
        { replace: true }
      );
    }
  }, [
    resolving,
    error,
    property,
    typeData,
    propertySlug,
    typeSlug,
    typeId,
    navigate,
    searchParams,
  ]);

  const showExcursionsPromo = Boolean(listingAreaCtx?.areaId);

  const wifiName = typeData?.wifiName || guide?.wifiName || property?.wifiName;
  const wifiPassword = typeData?.wifiPassword || guide?.wifiPassword || property?.wifiPassword;

  const whatsappHref = useMemo(
    () =>
      buildGuestWhatsAppLink(
        typeData?.whatsapp,
        property?.propertyName || 'your stay',
        typeData?.propertyTypeName
      ),
    [typeData?.whatsapp, typeData?.propertyTypeName, property?.propertyName]
  );

  const featuredOnPortal: FeaturedKey[] = Array.isArray(guide?.featuredOnPortal)
    ? (guide.featuredOnPortal as unknown[])
        .filter((k): k is string => typeof k === 'string')
        .filter((k): k is FeaturedKey => !!getFeaturedConfig(k))
        .slice(0, PORTAL_FEATURED_CAP)
    : [];
  const featuredPreviews: FeaturedPreviewsMap =
    guide && typeof guide.previews === 'object' && guide.previews !== null
      ? (guide.previews as FeaturedPreviewsMap)
      : {};
  const heroPhoto = typeData?.photoUrl || property?.photoUrl || '';
  const heroLocation = typeData?.city || typeData?.area || property?.city || property?.area || '';

  const propertyLat = typeData?.latitude ?? property?.latitude;
  const propertyLng = typeData?.longitude ?? property?.longitude;
  const hasPropertyCoords =
    propertyLat != null &&
    propertyLng != null &&
    !Number.isNaN(parseFloat(String(propertyLat))) &&
    !Number.isNaN(parseFloat(String(propertyLng)));

  const googleRating = parseFloat(String(typeData?.googleRating ?? ''));
  const showGoogleRating = !Number.isNaN(googleRating) && googleRating > 0;
  const googleReviewUrl = useMemo(
    () =>
      buildGoogleReviewUrl({
        googlePlaceId: typeData?.googlePlaceId,
        googleMapsUrl: typeData?.googleMapsUrl,
        latitude: propertyLat,
        longitude: propertyLng,
        propertyTypeName: typeData?.propertyTypeName,
      }),
    [typeData, propertyLat, propertyLng]
  );

  const mapAreaHint = useMemo(() => {
    const parts = [typeData?.area, typeData?.city, typeData?.country].filter(Boolean);
    return parts.join(', ');
  }, [typeData]);

  const websiteUrl = useMemo(() => {
    const raw = String(typeData?.listingUrl || property?.listingUrl || '').trim();
    if (!raw) return null;
    return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  }, [typeData?.listingUrl, property?.listingUrl]);

  useGuestPwaManifest(property?.propertyName, typeData?.propertyTypeName);

  const copyWifi = () => {
    if (wifiPassword) {
      navigator.clipboard.writeText(wifiPassword);
      setCopiedWifi(true);
      setTimeout(() => setCopiedWifi(false), 2000);
    }
  };

  const gemCategories = Array.from(
    new Set(gems.flatMap((g) => gemCategoryPrimaries(g, [], contentPrimaryLocale, locale)))
  );
  const allGemFilterOptions = ['All', "Host's Picks", '< 5km', 'Day Trips', ...gemCategories];

  const handleGemFilterClick = (filter: string) => {
    if (filter === 'All') {
      setGemFilters(['All']);
      return;
    }
    setGemFilters((prev) => {
      const base = prev.includes('All') ? [] : prev.filter((f) => f !== 'All');
      if (base.includes(filter)) {
        const next = base.filter((f) => f !== filter);
        return next;
      }
      return [...base, filter];
    });
  };

  const filteredGems = useMemo(() => {
    if (gemFilters.length === 0 || gemFilters.includes('All')) return gems;
    return gems.filter((gem) => {
      let matches = false;
      if (gemFilters.includes("Host's Picks") && gem.isLegitPick) matches = true;
      if (gemFilters.includes('< 5km') && Number(gem.distanceKm) < 5) matches = true;
      if (gemFilters.includes('Day Trips') && gem.isDailyTrip) matches = true;
      if (
        gemCategoryPrimaries(gem, [], contentPrimaryLocale, locale).some((cat) =>
          gemFilters.includes(cat)
        )
      ) {
        matches = true;
      }
      return matches;
    });
  }, [gems, gemFilters, contentPrimaryLocale, locale]);

  const gemFilterKey = gemFilters.join('\u0001');

  /** Property features flagged for the guest portal (admin: "Show on Main Page"). */
  const portalFeatures = useMemo(
    () =>
      features.filter(
        (f: { isMainPage?: boolean; showOnMain?: boolean }) =>
          f.isMainPage === true || f.showOnMain === true
      ),
    [features]
  );

  const checkoutDateLabel = useMemo(() => {
    const end = preArrivalBooking?.end;
    if (!end) return null;
    const iso = String(end).slice(0, 10);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00`) : new Date(end);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' });
  }, [preArrivalBooking?.end, locale]);

  const excursionHeroUrl = useMemo(() => {
    const withPhoto =
      excursionListings.find((listing) => {
        const excursion = listing.excursion;
        const search = [
          excursion.title,
          excursion.subtitle,
          ...(excursion.categories || []),
        ]
          .join(' ')
          .toLowerCase();
        return (
          excursion.heroPhotoUrl?.trim() &&
          /\b(boat|sail|sailing|yacht|cruise|sea|marine|catamaran)\b/.test(search)
        );
      }) ||
      excursionListings.find((listing) => listing.excursion.heroPhotoUrl?.trim());
    return withPhoto?.excursion.heroPhotoUrl?.trim();
  }, [excursionListings]);

  const liveLikeLocalHeroUrl = useMemo(() => {
    const scenic = gems.find((gem) => {
      const search = [
        gem.name,
        gem.category,
        ...(Array.isArray(gem.categories) ? gem.categories : []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return (
        gem.photoUrl &&
        /\b(village|harbour|harbor|old town|coast|viewpoint|scenic|landmark|beach)\b/.test(search)
      );
    });
    const picked =
      scenic ||
      gems.find((gem) => gem.isLegitPick && gem.photoUrl) ||
      gems.find((gem) => gem.photoUrl);
    return typeof picked?.photoUrl === 'string' ? picked.photoUrl : undefined;
  }, [gems]);

  const showHomeLocalGems = false;
  const showHomeFloatingActions = false;

  if (resolving) return <GuestPortalLoadingScreen status={t('preparingStay')} />;
  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-[#F3F4F6] px-6 font-sans">
      <div className="text-center max-w-sm">
        <p className="font-luxury text-xl text-[#051F26] mb-2">Something went wrong</p>
        <p className="text-red-500/90 text-sm">{error}</p>
      </div>
    </div>
  );

  const portalMain = (
    <>
      {typeData ? (
        <GuestAreaPrefetcher
          property={property}
          propertyType={typeData}
          propertyGems={gems}
          propertyFeatures={features}
        />
      ) : null}
    <div className="min-h-screen bg-[#F7F7F5] flex flex-col items-center justify-start transition-all duration-500 relative overflow-hidden font-sans">
      <style>
        {`
          .font-luxury { font-family: 'Playfair Display', Georgia, serif; }
          .font-sans { font-family: 'Montserrat', Arial, sans-serif; }
          .hero-text-shadow { text-shadow: 0 2px 28px rgba(0,0,0,0.45); }
        `}
      </style>

      <div className={`guest-mobile w-full transition-all duration-700 ease-in-out bg-[#F7F7F5] overflow-x-hidden flex flex-col relative ${
        isMobileFramePreview
          ? 'md:max-w-[400px] md:mt-10 md:mb-10 md:rounded-[40px] md:shadow-[0_24px_80px_rgba(0,0,0,0.18)] md:border-[8px] md:border-gray-900 md:min-h-[800px] md:overflow-hidden'
          : 'max-w-none min-h-screen'
      }`}>
        
        {activeView === 'portal' ? (
          <>
            <GuestPortalHome
              t={t}
              locale={locale}
              setLocale={setLocale}
              localeOptions={localeOptions}
              isMobileFramePreview={isMobileFramePreview}
              propertyName={property?.propertyName}
              propertyTypeName={typeData?.propertyTypeName}
              heroPhoto={heroPhoto}
              heroLocation={heroLocation}
              propertyId={propertyId}
              typeId={typeId}
              googlePlaceId={typeData?.googlePlaceId}
              featuredOnPortal={featuredOnPortal}
              featuredPreviews={featuredPreviews}
              onLiveLikeLocal={openLiveLikeLocal}
              onAssistant={openAssistant}
              showExcursions={showExcursionsPromo}
              onExcursions={openExcursions}
              excursionHeroUrl={excursionHeroUrl}
              liveLikeLocalHeroUrl={liveLikeLocalHeroUrl}
              hasPropertyCoords={hasPropertyCoords}
              onOpenMap={() => setPropertyMapOpen(true)}
              websiteUrl={websiteUrl}
              googleRating={showGoogleRating ? googleRating : undefined}
              googleReviewUrl={googleReviewUrl}
              whatsappHref={whatsappHref}
              pwaBanner={
                pwaInstall.showBanner ? (
                  <GuestAddToHomeBanner
                    t={t}
                    canPromptNative={pwaInstall.canPromptNative}
                    onDismiss={pwaInstall.dismiss}
                    onInstall={pwaInstall.promptInstall}
                    propertyLabel={
                      property?.propertyName && typeData?.propertyTypeName
                        ? `${property.propertyName} · ${typeData.propertyTypeName}`
                        : property?.propertyName
                    }
                  />
                ) : null
              }
              showCheckInPromo={showCheckInPromo}
              checkInComplete={checkInComplete}
              checkInContinue={checkInContinue}
              onOpenCheckIn={() => setCheckInOpen(true)}
              wifiName={wifiName}
              wifiPassword={wifiPassword}
              copiedWifi={copiedWifi}
              onCopyWifi={copyWifi}
              guide={guide && typeof guide === 'object' ? (guide as Record<string, unknown>) : null}
              checkoutDateLabel={checkoutDateLabel}
              portalFeatures={portalFeatures}
              onServiceDetailOpenChange={setServiceDetailOpen}
              legalFooter={
                <GuestLegalFooter
                  onPrivacyClick={() => setLegalModal('privacy')}
                  onTermsClick={() => setLegalModal('terms')}
                />
              }
            />

            {hasPropertyCoords && (
              <GuestPropertyMapSheet
                open={propertyMapOpen}
                onClose={() => setPropertyMapOpen(false)}
                title={typeData?.propertyTypeName || property?.propertyName || t('mapTitle')}
                subtitle={t('mapSubtitle')}
                addressLine={
                  [typeData?.addressLine, typeData?.area, typeData?.city].filter(Boolean).join(', ') ||
                  undefined
                }
                latitude={propertyLat!}
                longitude={propertyLng!}
                googleMapsUrl={typeData?.googleMapsUrl}
                googlePlaceId={typeData?.googlePlaceId}
                areaHint={mapAreaHint}
                t={t}
              />
            )}

            {showHomeLocalGems && showExcursionsPromo && (
              <GuestExcursionsPromoCard
                locale={locale}
                listings={excursionListings}
                loading={excursionsLoading && excursionListings.length === 0}
                onOpen={openExcursions}
                t={t}
              />
            )}

            {showHomeLocalGems && gems.length > 0 && (
              <div className={`mx-auto px-5 mt-6 space-y-6 pb-28 relative z-10 ${!isMobileFramePreview ? 'max-w-4xl' : 'max-w-md'}`}>
                <div className="flex flex-wrap gap-1.5 pb-4">
                  {allGemFilterOptions.map((filter) => {
                    const isActive =
                      filter === 'All'
                        ? gemFilters.includes('All')
                        : gemFilters.includes(filter);
                    return (
                      <button
                        type="button"
                        key={filter}
                        onClick={() => handleGemFilterClick(filter)}
                        className={`guest-pill whitespace-nowrap transition-all ${
                          isActive
                            ? 'bg-[#0B4F5C] text-white shadow-md'
                            : 'bg-white text-gray-500 border border-gray-200/80 hover:border-[#C5A059]/50 hover:text-[#0B4F5C]'
                        }`}
                      >
                        {filter}
                      </button>
                    );
                  })}
                </div>
                {propertyId && typeId ? (
                  <GuestGemsGrid
                    gems={filteredGems}
                    listKey={gemFilterKey}
                    mapAreaHint={mapAreaHint}
                    propertyId={propertyId}
                    typeId={typeId}
                  />
                ) : null}
              </div>
            )}
          </>
        ) : activeView === 'aiExpert' ? (
          <Suspense fallback={<GuestSubviewFallback />}>
            <AiExpertView
              onClose={() => setActiveView('portal')}
              property={property}
              propertyType={typeData}
              features={features}
              gems={gems}
              locale={locale}
              setLocale={setLocale}
              localeOptions={localeOptions}
            />
          </Suspense>
        ) : activeView === 'excursions' ? (
          <Suspense fallback={<GuestSubviewFallback />}>
            <GuestExcursions
              propertyId={propertyId}
              typeId={typeId}
              propertyType={typeData}
              prefetchedListings={excursionListings}
              prefetchedLoading={excursionsLoading}
              onClose={() => setActiveView('portal')}
              onOverlayOpenChange={setExcursionOverlayOpen}
            />
          </Suspense>
        ) : activeView === 'savedGems' && propertyId && typeId ? (
          <Suspense fallback={<GuestSubviewFallback />}>
            <GuestSavedLocalGems
              propertyId={propertyId}
              typeId={typeId}
              mapAreaHint={mapAreaHint}
              onClose={() => setActiveView('portal')}
            />
          </Suspense>
        ) : (
          <Suspense fallback={<GuestSubviewFallback />}>
            <GuestPropertyAssistant
              propertyId={propertyId}
              typeId={typeId}
              property={property}
              propertyType={typeData}
            guide={guide}
            onClose={() => setActiveView('portal')}
            onOpenPrivacy={() => setLegalModal('privacy')}
            onOpenTerms={() => setLegalModal('terms')}
            onOpenReport={() => {
              setActiveView('portal');
              setReportSheetOpen(true);
            }}
          />
          </Suspense>
        )}

        {checkInOpen && propertyId && typeId && property && (
          <div
            className={`${
              isMobileFramePreview ? 'absolute' : 'fixed'
            } inset-0 z-[90] overflow-y-auto bg-[#F8FAFA]`}
          >
            <GuestOpenPreArrivalFlow
              propertyId={propertyId}
              typeId={typeId}
              propertyName={property?.propertyName || 'Property'}
              unitName={typeData?.propertyTypeName || 'Unit'}
              guide={guide && typeof guide === 'object' ? (guide as Record<string, unknown>) : null}
              locale={locale}
              contentPrimaryLocale={contentPrimaryLocale}
              transferOffer={property?.preArrivalTransferOffer}
              syncedBookings={
                Array.isArray(typeData?.syncedBookings)
                  ? (typeData.syncedBookings as Array<{
                      id?: string;
                      start?: string;
                      end?: string;
                      guestName?: string;
                      guestPhone?: string;
                      guestWhatsapp?: string;
                      guestEmail?: string;
                      preArrivalComplete?: boolean;
                      preArrivalSubmission?: import('../../lib/syncedBooking').PreArrivalSubmission;
                    }>)
                  : null
              }
              guestSession={guestSession}
              verifyReservationDates={isCalendarSyncEnabled(property)}
              onSessionGranted={handleSessionGranted}
              onSessionCleared={handleSessionCleared}
              onBackToPortal={() => setCheckInOpen(false)}
              backToPortalLabel={t('checkInBackToPortal')}
              onCheckInComplete={markCheckInComplete}
            />
          </div>
        )}
      </div>

      {showHomeFloatingActions &&
        activeView === 'portal' &&
        !checkInOpen &&
        !serviceDetailOpen &&
        !excursionOverlayOpen &&
        !propertyMapOpen &&
        !reportSheetOpen &&
        !legalModal && (
        <GuestFloatingActions
          mobileFramePreview={isMobileFramePreview}
          onOpenAssistant={() => setActiveView('assistant')}
          onOpenReport={() => setReportSheetOpen(true)}
          whatsappHref={whatsappHref}
        />
      )}

      {legalModal === 'privacy' && (
        <LegalDocumentModal
          title={t('privacyPolicy')}
          body={platformLegalResolved.privacyPolicy}
          onClose={() => setLegalModal(null)}
        />
      )}
      {legalModal === 'terms' && (
        <LegalDocumentModal
          title={t('termsOfUse')}
          body={platformLegalResolved.termsOfUse}
          onClose={() => setLegalModal(null)}
        />
      )}

      {reportSheetOpen && activeView === 'portal' && propertyId && typeId && (
        <GuestReportIssueSheet
          propertyId={propertyId}
          propertyTypeId={typeId}
          propertyName={property?.propertyName || 'Property'}
          propertyTypeName={typeData?.propertyTypeName || 'Unit'}
          guide={guide}
          onClose={() => setReportSheetOpen(false)}
        />
      )}
    </div>
    </>
  );

  const portalContent =
    propertyId && typeId ? (
      <GuestAnalyticsProvider propertyId={propertyId} typeId={typeId}>
        <GemImpressionTracker gems={gems}>{portalMain}</GemImpressionTracker>
      </GuestAnalyticsProvider>
    ) : (
      portalMain
    );

  if (isGuestPortalAccessRequired(property) && propertyId && typeId) {
    return (
      <GuestPortalAccessGate
        propertyId={propertyId}
        typeId={typeId}
        inviteToken={inviteTokenFromQuery}
        adminPreview={adminPreviewFromQuery}
        onSessionGranted={handleSessionGranted}
      >
        {portalContent}
      </GuestPortalAccessGate>
    );
  }

  return portalContent;
}

export default function GuestPortal() {
  const [searchParams] = useSearchParams();
  const langFromUrl = searchParams.get('lang');
  const [sessionLocale, setSessionLocale] = useState<string | null>(langFromUrl);
  const [contentLocaleSettings, setContentLocaleSettings] =
    useState<PropertyContentLocaleSettings | null>(null);

  return (
    <GuestLocaleProvider
      sessionGuestLocale={sessionLocale ?? langFromUrl}
      contentEnabledLocales={contentLocaleSettings?.enabledLocales}
      contentPrimaryLocale={contentLocaleSettings?.primaryLocale}
      contentReviewedLocales={contentLocaleSettings?.reviewedLocales}
    >
      <GuestPortalPage
        onSessionLocale={setSessionLocale}
        onContentLocaleSettings={setContentLocaleSettings}
      />
    </GuestLocaleProvider>
  );
}