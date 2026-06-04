import { useState, useEffect, useRef, useCallback, useLayoutEffect, useMemo } from 'react';
import { collection, getDocs, onSnapshot } from 'firebase/firestore';
import { areaNameToId } from '../../lib/areaUtils';
import { getGenerativeModel } from "firebase/ai";
import { ai, db } from '../../lib/firebase';
import {
  resolveCustomLocation,
  enrichPlanWithMapLinks,
  type GeocodedPlace,
} from '../../lib/geocoding';
import { enrichPlanWithAllPhotos, type PlanPhotoContext } from '../../lib/planPhotos';
import {
  buildFlexiblePicksDbContext,
  buildFlexiblePicksPromptSection,
  effectiveMaxDistanceKm,
  normalizeFlexiblePicksPlan,
  MAX_PICKS_PER_CATEGORY,
} from '../../lib/flexiblePicks';
import {
  getRecentlyShownKeys,
  markItemsShown,
  pickKeyForItem,
} from '../../lib/picksFairness';
import {
  ensureTimelinePropertyBookends,
  type PropertyBookendContext,
} from '../../lib/timelinePropertyBookends';
import { scheduleTimelinePlan } from '../../lib/timelineScheduling';
import CategoryPickCarousel from '../../components/guest/CategoryPickCarousel';
import TrailPickCarousel from '../../components/guest/TrailPickCarousel';
import MapLinkButtons from '../../components/guest/MapLinkButtons';
import {
  buildHikingTrailCategories,
  filterGuestEligibleTrails,
  HIKING_TRAILS_CATEGORY_PRIMARY,
  isHikingTrailsCategory,
  trailCoords,
  type LocalTrailRecord,
} from '../../lib/localTrailsGuest';
import PlanOverviewMap from '../../components/guest/PlanOverviewMap';
import ExpandableDescription from '../../components/guest/ExpandableDescription';
import PlanImage from '../../components/guest/PlanImage';
import PickFeedbackButtons from '../../components/guest/PickFeedbackButtons';
import { useGuestAnalytics } from '../../context/GuestAnalyticsContext';
import { useGuestLocale } from '../../context/GuestLocaleContext';
import { guestAiLanguageBlock } from '../../lib/guestAiLanguage';
import type { GuestLocale } from '../../lib/guestLocale';
import { resolveLocalizedString } from '../../lib/propertyContentLocales';
import { usePropertyContentLocaleSettings } from '../../hooks/usePropertyContentLocaleSettings';
import { categoryPrimaryName, resolveCategoryLabel } from '../../lib/categoryLocale';
import {
  categoryEligibleForLiveLikeLocal,
  collectExcludedLiveLikeLocalPrimaries,
  filterPrimariesForLiveLikeLocal,
  stripExcludedCategoriesFromPlan,
} from '../../lib/liveLikeLocalCategories';
import { guestUiTFormat, type GuestLocaleUiKey } from '../../lib/guestLocaleUi';
import GuestLanguageMenu from '../../components/guest/GuestLanguageMenu';
import AiExpertCuratingLoader from '../../components/guest/AiExpertCuratingLoader';
import { truncateAnalyticsText } from '../../lib/guestAnalytics';
import { Sparkles, ArrowLeft, Navigation, Clock, MapPin, Send, Loader2, Compass, Heart, Eye } from 'lucide-react';

type GuestLocaleOption = { code: string; label: string; nativeLabel: string };
type GemCategoryOption = { primary: string; label: string };

const WIZARD_STEP_KEYS = ['LOCATION', 'CATEGORIES', 'DISTANCE', 'TIME'] as const;

const CURATING_STEP_KEYS: GuestLocaleUiKey[] = [
  'aiExpertCuratingStepExplore',
  'aiExpertCuratingStepMatch',
  'aiExpertCuratingStepBuild',
  'aiExpertCuratingStepFinishing',
];

const AI_EXPERT_DESC_BODY = 'text-sm text-white/70 leading-relaxed';
const AI_EXPERT_DESC_TOGGLE =
  'mt-1.5 text-sm font-semibold normal-case tracking-wide text-vailo-gold hover:text-white transition-colors min-h-[44px]';
const AI_EXPERT_PANEL =
  'rounded-2xl border border-white/15 bg-white/10 backdrop-blur-sm p-5 shadow-[0_8px_30px_rgba(5,31,38,0.2)]';
const AI_EXPERT_PANEL_TITLE = 'text-base font-semibold text-white mb-1';
const AI_EXPERT_PANEL_SUB = 'text-sm text-white/60 mb-4 leading-relaxed';
const AI_EXPERT_BTN_PRIMARY =
  'bg-gradient-to-br from-vailo-gold to-[#a88648] text-white font-semibold shadow-[0_4px_16px_rgba(197,160,89,0.4)] hover:from-[#d4ad65] hover:to-vailo-gold hover:shadow-[0_6px_22px_rgba(197,160,89,0.5)] disabled:opacity-40 transition-all';
const AI_EXPERT_BTN_PRIMARY_PILL =
  'bg-gradient-to-br from-vailo-gold to-[#a88648] text-white border border-vailo-gold/80 shadow-[0_2px_12px_rgba(197,160,89,0.35)]';
const AI_EXPERT_BTN_SECONDARY =
  'bg-vailo-gold/20 text-white border border-vailo-gold/50 font-semibold hover:bg-vailo-gold/30 hover:border-vailo-gold/70 shadow-[0_2px_12px_rgba(197,160,89,0.2)] transition-all';

interface AiExpertViewProps {
  onClose: () => void;
  property: any;
  propertyType?: any;
  features: any[];
  gems: any[];
  /** Same locale state as GuestPortal (shared via GuestLocaleProvider). */
  locale: GuestLocale;
  setLocale: (next: GuestLocale) => void;
  localeOptions: GuestLocaleOption[];
}

interface Message {
  id: string;
  role: 'ai' | 'user';
  type: 'text' | 'plan' | 'selection';
  text?: string;
  data?: any;
}

type Step = 'LOCATION' | 'CATEGORIES' | 'DISTANCE' | 'TIME' | 'DONE';

type ListingAreaContext = {
  country: string;
  masterArea: string;
  areaId: string;
};

type AreaConfigIssue = 'missing' | 'invalid-master' | null;

/** Match listing country + city/master area to a configured Area Functionality region. */
async function resolvePropertyTypeAreaContext(
  propertyType?: any
): Promise<{ ctx: ListingAreaContext | null; issue: AreaConfigIssue; cityRaw: string }> {
  const country = typeof propertyType?.country === 'string' ? propertyType.country.trim() : '';
  const cityRaw = typeof propertyType?.city === 'string' ? propertyType.city.trim() : '';

  if (!country || !cityRaw) {
    return { ctx: null, issue: 'missing', cityRaw };
  }

  const areasSnap = await getDocs(collection(db, 'countries', country, 'areas'));
  const configuredAreas = areasSnap.docs
    .map((d) => (typeof d.data().name === 'string' ? d.data().name.trim() : ''))
    .filter(Boolean);

  const match = configuredAreas.find((name) => name.toLowerCase() === cityRaw.toLowerCase());
  if (!match) {
    return { ctx: null, issue: 'invalid-master', cityRaw };
  }

  return {
    ctx: { country, masterArea: match, areaId: areaNameToId(match) },
    issue: null,
    cityRaw,
  };
}

/** Guest-facing label — neighborhood (address area) + validated master area when both exist. */
function getGuestAreaLabel(propertyType?: any, masterArea?: string): string {
  const master = masterArea || '';
  const neighborhood = typeof propertyType?.area === 'string' ? propertyType.area.trim() : '';
  if (neighborhood && master && neighborhood.toLowerCase() !== master.toLowerCase()) {
    return `${neighborhood}, ${master}`;
  }
  return neighborhood || master || 'the region';
}

/** Pull every DB-sourced item from a finalized plan (picks or timeline) for fairness tracking. */
function collectDbItemsFromPlan(plan: any): any[] {
  if (!plan) return [];
  const out: any[] = [];
  if (plan.type === 'picks' && Array.isArray(plan.categories)) {
    for (const cat of plan.categories) {
      for (const item of cat.items || []) {
        if (item?.source === 'database') out.push(item);
      }
    }
  } else if (plan.type === 'timeline' && Array.isArray(plan.plan)) {
    for (const item of plan.plan) {
      if (item?.source === 'database') out.push(item);
    }
  }
  return out;
}

/** Prepend synced AllTrails hiking categories; strip duplicate AI hiking sections. */
function mergeTrailCategoriesIntoPlan(
  plan: any,
  trailBlocks: Array<{ categoryName: string; isTrails: true; items: unknown[] }>
) {
  const withItems = trailBlocks.filter((c) => c.items.length > 0);
  if (!withItems.length) return plan;

  if (plan?.type === 'picks') {
    const existing = Array.isArray(plan.categories) ? plan.categories : [];
    const filtered = existing.filter(
      (c: { categoryName?: string }) => !isHikingTrailsCategory(String(c.categoryName || ''))
    );
    return { ...plan, categories: [...withItems, ...filtered] };
  }

  if (plan?.type === 'timeline') {
    return { ...plan, trailCategories: withItems };
  }

  return plan;
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = (b.lat - a.lat) * (Math.PI / 180);
  const dLng = (b.lng - a.lng) * (Math.PI / 180);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * (Math.PI / 180)) *
      Math.cos(b.lat * (Math.PI / 180)) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s)) * 1.35;
}

/**
 * Walks a timeline plan, drops AI stops that resolved farther than the effective
 * limit, and marks DB stops with previouslyShown when their key was seen recently.
 */
function filterTimelinePlanByDistance(
  plan: any,
  maxKm: number,
  startCoords: { lat: number; lng: number } | null,
  recentlyShown: Set<string>
): any {
  if (!plan || plan.type !== 'timeline' || !Array.isArray(plan.plan) || !startCoords) {
    return plan;
  }
  const hardCap = effectiveMaxDistanceKm(maxKm);
  const filtered = plan.plan.filter((item: any) => {
    if (item?.isProperty || item?.source === 'property') return true;
    const lat = item?.latitude ?? item?.lat;
    const lng = item?.longitude ?? item?.lng;
    if (typeof lat !== 'number' || typeof lng !== 'number') return true;
    const km = haversineKm(startCoords, { lat, lng });
    return km <= hardCap;
  }).map((item: any) => {
    if (item.source !== 'database') return item;
    const key = pickKeyForItem({
      name: item.title,
      googlePlaceId: item.googlePlaceId,
      googleMapsUrl: item.googleMapsUrl,
      latitude: item.latitude,
      longitude: item.longitude,
    });
    return { ...item, previouslyShown: !!(key && recentlyShown.has(key)) };
  });
  return { ...plan, plan: filtered };
}

// --- BULLETPROOF COORDINATE EXTRACTOR ---
const extractCoords = (obj: any) => {
  if (!obj) return null;
  
  let lat = obj.latitude ?? obj.lat ?? obj.coords?.latitude ?? obj.coords?.lat ?? obj.location?.latitude ?? obj.location?.lat;
  let lng = obj.longitude ?? obj.lng ?? obj.coords?.longitude ?? obj.coords?.lng ?? obj.location?.longitude ?? obj.location?.lng;
  
  if (typeof obj.coordinates === 'string' && obj.coordinates.includes(',')) {
    const parts = obj.coordinates.split(',');
    lat = parts[0].trim();
    lng = parts[1].trim();
  }

  if (obj.coordinates && typeof obj.coordinates.latitude === 'number') {
    lat = obj.coordinates.latitude;
    lng = obj.coordinates.longitude;
  }

  const parsedLat = parseFloat(lat);
  const parsedLng = parseFloat(lng);
  
  if (!isNaN(parsedLat) && !isNaN(parsedLng)) {
    return { lat: parsedLat, lng: parsedLng };
  }
  return null;
};

// --- ZERO-COST MATHEMATICAL ROUTING ---
const calculateRealisticDrivingDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371; 
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2); 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); 
  const straightLineDistance = R * c; 
  return straightLineDistance * 1.35; 
};

const parseTimeToMinutes = (time: string) => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};

const to24HourString = (minutes: number) => {
  const normalized = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
};

const formatTime12 = (minutes: number, nextDay = false) => {
  const normalized = minutes % (24 * 60);
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  const base = `${h12}:${m.toString().padStart(2, '0')} ${period}`;
  return nextDay ? `${base} (next day)` : base;
};

const START_TIME_OPTIONS: string[] = [];
for (let m = 5 * 60 + 30; m <= 14 * 60; m += 30) {
  START_TIME_OPTIONS.push(to24HourString(m));
}

const MAX_RETURN_MINUTES = 24 * 60 + 5 * 60 + 30; // 5:30 AM next day

const computeEndFromDuration = (startTime: string, durationHours: number) => {
  const startMin = parseTimeToMinutes(startTime);
  const endMin = Math.min(startMin + durationHours * 60, MAX_RETURN_MINUTES);
  return {
    end24: to24HourString(endMin >= 24 * 60 ? endMin - 24 * 60 : endMin),
    endMin,
    nextDay: endMin >= 24 * 60,
  };
};

const formatTripWindow = (startTime: string, durationHours: number) => {
  const startMin = parseTimeToMinutes(startTime);
  const { endMin, nextDay } = computeEndFromDuration(startTime, durationHours);
  return `${formatTime12(startMin)} → ${formatTime12(endMin, nextDay)}`;
};

function countPlanStops(plan: unknown): number {
  if (!plan || typeof plan !== 'object') return 0;
  const p = plan as { plan?: unknown[]; categories?: { items?: unknown[] }[] };
  if (Array.isArray(p.plan)) return p.plan.length;
  if (Array.isArray(p.categories)) {
    return p.categories.reduce((n, c) => n + (c.items?.length || 0), 0);
  }
  return 0;
}

export default function AiExpertView({
  onClose,
  property,
  propertyType,
  features,
  gems,
  locale,
  setLocale,
  localeOptions,
}: AiExpertViewProps) {
  const { track } = useGuestAnalytics();
  const { t } = useGuestLocale();
  const contentSettings = usePropertyContentLocaleSettings(
    property as Record<string, unknown> | undefined
  );
  const tf = (key: GuestLocaleUiKey, vars: Record<string, string | number>) =>
    guestUiTFormat(locale, key, vars);

  const wizardSteps = useMemo(
    () =>
      WIZARD_STEP_KEYS.map((key) => ({
        key,
        label: t(
          key === 'LOCATION'
            ? 'aiExpertWizardLocation'
            : key === 'CATEGORIES'
              ? 'aiExpertWizardCategories'
              : key === 'DISTANCE'
                ? 'aiExpertWizardDistance'
                : 'aiExpertWizardTime'
        ),
      })),
    [locale, t]
  );

  const getReturnDurationOptions = useCallback(
    (startTime: string) => {
      const startMin = parseTimeToMinutes(startTime);
      const maxHours = (MAX_RETURN_MINUTES - startMin) / 60;
      const presets: { key: GuestLocaleUiKey; hours: number }[] = [
        { key: 'aiExpertDuration3h', hours: 3 },
        { key: 'aiExpertDuration4h', hours: 4 },
        { key: 'aiExpertDuration5h', hours: 5 },
        { key: 'aiExpertDuration6h', hours: 6 },
        { key: 'aiExpertDuration8h', hours: 8 },
        { key: 'aiExpertDuration10h', hours: 10 },
        { key: 'aiExpertDuration12h', hours: 12 },
      ];
      const options = presets
        .filter((p) => p.hours <= maxHours)
        .map((p) => ({ label: t(p.key), hours: p.hours }));
      const hoursToMorning = (MAX_RETURN_MINUTES - startMin) / 60;
      if (hoursToMorning >= 3) {
        options.push({
          label: t('aiExpertDurationUntilMorning'),
          hours: Math.round(hoursToMorning * 10) / 10,
        });
      }
      return options;
    },
    [locale, t]
  );

  const [messages, setMessages] = useState<Message[]>([]);
  const [step, setStep] = useState<Step>('LOCATION');
  const [chatInput, setChatInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [thinkingLabel, setThinkingLabel] = useState<GuestLocaleUiKey>('aiExpertThinking');
  const [curatingStepIndex, setCuratingStepIndex] = useState(0);
  const [locationCandidates, setLocationCandidates] = useState<GeocodedPlace[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const chatTextareaRef = useRef<HTMLTextAreaElement>(null);
  const isFirstScrollRef = useRef(true);
  const prevMessagesLenRef = useRef(0);
  const [timeChoiceMode, setTimeChoiceMode] = useState<'choose' | 'timeline'>('choose');

  const CHAT_TEXTAREA_MAX_PX = 128;

  const resizeChatTextarea = useCallback(() => {
    const el = chatTextareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const next = Math.min(el.scrollHeight, CHAT_TEXTAREA_MAX_PX);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > CHAT_TEXTAREA_MAX_PX ? 'auto' : 'hidden';
  }, []);

  const [availableCategories, setAvailableCategories] = useState<GemCategoryOption[]>([]);
  const [excludedLiveLikeLocalPrimaries, setExcludedLiveLikeLocalPrimaries] = useState<Set<string>>(
    () => new Set()
  );
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [listingAreaCtx, setListingAreaCtx] = useState<ListingAreaContext | null>(null);
  const [areaConfigIssue, setAreaConfigIssue] = useState<AreaConfigIssue>(null);
  const [invalidMasterAreaRaw, setInvalidMasterAreaRaw] = useState('');
  const [dynamicDistances, setDynamicDistances] = useState<string[]>([]);
  
  // 🌟 NEW: State to hold the dynamically fetched Village/Municipality name
  const [richLocationName, setRichLocationName] = useState<string>('');
  const [discoveredPlaces, setDiscoveredPlaces] = useState<any[]>([]);
  const [localTrails, setLocalTrails] = useState<LocalTrailRecord[]>([]);
  const guestEligibleTrails = useMemo(() => filterGuestEligibleTrails(localTrails), [localTrails]);
  const propertyCoords = useMemo(
    () => extractCoords(property) || extractCoords(propertyType),
    [property, propertyType]
  );

  const [preferences, setPreferences] = useState({
    location: '',
    locationCoords: null as { lat: number, lng: number } | null,
    locationFullName: '',
    categories: [] as string[],
    distance: '',
    timeFrame: ''
  });

  const [customLoc, setCustomLoc] = useState('');
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  const [startTime, setStartTime] = useState('09:00');
  const [tripDurationHours, setTripDurationHours] = useState<number | null>(6);

  // Ref keeps starting-point coords in sync immediately (avoids stale closure in async wizard steps)
  const locationCoordsRef = useRef<{ lat: number; lng: number } | null>(null);
  const locationFullNameRef = useRef('');

  const getPropertyTypeName = () =>
    propertyType?.propertyTypeName || propertyType?.name || '';

  const getPropertyDisplayName = () => {
    const name = property?.propertyName;
    const typeName = getPropertyTypeName();
    if (!name) return typeName || t('aiExpertYourStay');
    return typeName ? `${name}, ${typeName}` : name;
  };

  const getNearPropertyLabel = () => {
    const name = property?.propertyName;
    const typeName = getPropertyTypeName();
    if (!name) return t('aiExpertNearYourProperty');
    const label = typeName ? `${name}, ${typeName}` : name;
    return tf('aiExpertNearProperty', { name: label });
  };

  const isNearPropertyLocation = (location: string) => {
    if (!location) return false;
    return location === getNearPropertyLabel() || location.startsWith('Near ');
  };

  const getAreaName = () => getGuestAreaLabel(propertyType, listingAreaCtx?.masterArea);

  /**
   * Geographic hint we pass to Google Maps "View" URLs and to Nominatim. MUST be
   * a real city / region, not the user's start-point label, otherwise queries
   * like "Omprogialos, Near Villa Petra, Villa Petra Philippos" return a list of
   * results instead of the place card. Always falls back to something useful.
   */
  const getGeographicAreaHint = (): string => {
    const masterArea = listingAreaCtx?.masterArea || '';
    const country = propertyType?.country || property?.country || '';
    const parts = [masterArea, country].filter(Boolean);
    if (parts.length > 0) return parts.join(', ');
    // last-resort fallbacks — still avoid using a property name as a place hint
    return richLocationName || propertyType?.city || property?.city || '';
  };

  useEffect(() => {
    setMessages([
      {
        id: Date.now().toString(),
        role: 'ai',
        type: 'text',
        text: `welcome:${getPropertyDisplayName()}`,
      },
    ]);

    const fetchCategories = async () => {
      setCategoriesLoading(true);
      setAreaConfigIssue(null);
      setInvalidMasterAreaRaw('');

      const { ctx: areaCtx, issue, cityRaw } = await resolvePropertyTypeAreaContext(propertyType);
      setListingAreaCtx(areaCtx);
      setAreaConfigIssue(issue);
      setInvalidMasterAreaRaw(cityRaw);

      if (!areaCtx?.areaId) {
        setAvailableCategories([]);
        setExcludedLiveLikeLocalPrimaries(new Set());
        setCategoriesLoading(false);
        return;
      }

      try {
        const gemsCatSnap = await getDocs(
          collection(
            db,
            'countries',
            areaCtx.country,
            'areas',
            areaCtx.areaId,
            'localGemsCategories'
          )
        );
        const categoryDocs = gemsCatSnap.docs.map((d) => ({
          data: d.data() as Record<string, unknown>,
        }));
        setExcludedLiveLikeLocalPrimaries(
          collectExcludedLiveLikeLocalPrimaries(categoryDocs, contentSettings.primaryLocale)
        );
        const byPrimary = new Map<string, GemCategoryOption>();
        for (const { data } of categoryDocs) {
          if (!categoryEligibleForLiveLikeLocal(data, contentSettings.primaryLocale)) continue;
          const primary = categoryPrimaryName(data, contentSettings.primaryLocale).trim();
          const label =
            resolveCategoryLabel(
              data,
              locale,
              contentSettings.primaryLocale,
              contentSettings.reviewedLocales
            ).trim() || primary;
          if (!byPrimary.has(primary)) byPrimary.set(primary, { primary, label });
        }
        setAvailableCategories(
          Array.from(byPrimary.values()).sort((a, b) => a.label.localeCompare(b.label))
        );
      } catch (error) {
        console.error('Failed to fetch local gem categories:', error);
        setAvailableCategories([]);
        setExcludedLiveLikeLocalPrimaries(new Set());
      } finally {
        setCategoriesLoading(false);
      }
    };

    // 🌟 NEW: Zero-Cost Reverse Geocoding via OpenStreetMap
    const fetchRichLocation = async () => {
      const coords = extractCoords(property) || extractCoords(propertyType);
      if (!coords) return;
      
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${coords.lat}&lon=${coords.lng}&zoom=14&addressdetails=1`, {
          headers: { 'Accept-Language': 'en' }
        });
        const data = await res.json();
        
        if (data && data.address) {
          // Extracts "Maza", "Apokoronas", etc.
          const village = data.address.village || data.address.town || data.address.city_district || '';
          const municipality = data.address.municipality || data.address.county || '';
          
          const richName = [village, municipality].filter(Boolean).join(', ');
          setRichLocationName(richName);
          console.log("📍 Reverse Geocoder Found:", richName);
        }
      } catch (error) {
        console.error("Free Geocoding failed:", error);
      }
    };

    fetchCategories();
    fetchRichLocation();
  }, [property, propertyType, locale, contentSettings.primaryLocale, contentSettings.reviewedLocales]);

  useEffect(() => {
    if (!listingAreaCtx?.areaId) return;

    const placesRef = collection(
      db,
      'countries',
      listingAreaCtx.country,
      'areas',
      listingAreaCtx.areaId,
      'discoveredPlaces'
    );
    const unsubscribe = onSnapshot(placesRef, (snapshot) => {
      const places = snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((p: any) => p.status !== 'hidden');
      setDiscoveredPlaces(places);
    });
    return () => unsubscribe();
  }, [listingAreaCtx]);

  useEffect(() => {
    if (!listingAreaCtx?.areaId) {
      setLocalTrails([]);
      return;
    }

    const trailsRef = collection(
      db,
      'countries',
      listingAreaCtx.country,
      'areas',
      listingAreaCtx.areaId,
      'localTrails'
    );
    const unsubscribe = onSnapshot(trailsRef, (snapshot) => {
      const rows = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as LocalTrailRecord[];
      setLocalTrails(rows);
    });
    return () => unsubscribe();
  }, [listingAreaCtx]);

  useEffect(() => {
    if (guestEligibleTrails.length === 0) return;
    setAvailableCategories((prev) => {
      const hasHiking = prev.some(
        (c) => isHikingTrailsCategory(c.primary) || isHikingTrailsCategory(c.label)
      );
      if (hasHiking) return prev;
      const label = t('aiExpertHikingTrailsCategory');
      return [...prev, { primary: HIKING_TRAILS_CATEGORY_PRIMARY, label }].sort((a, b) =>
        a.label.localeCompare(b.label)
      );
    });
  }, [guestEligibleTrails.length, t]);

  const resolveCategoryDisplayLabel = useCallback(
    (primary: string) =>
      availableCategories.find((c) => c.primary === primary)?.label ?? primary,
    [availableCategories]
  );

  useEffect(() => {
    if (step === 'TIME') setTimeChoiceMode('choose');
  }, [step]);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    if (isFirstScrollRef.current) {
      isFirstScrollRef.current = false;
      requestAnimationFrame(() => {
        el.scrollTop = 0;
      });
      prevMessagesLenRef.current = messages.length;
      return;
    }

    const messagesGrew = messages.length > prevMessagesLenRef.current;
    const lastMsg = messages[messages.length - 1];
    prevMessagesLenRef.current = messages.length;

    requestAnimationFrame(() => {
      if (messagesGrew && lastMsg?.type === 'plan') {
        const planEl = el.querySelector('[data-ai-expert-plan]');
        if (planEl) {
          planEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
          el.scrollTop = 0;
        }
        return;
      }

      if (isThinking && step === 'DONE' && !messages.some((m) => m.type === 'plan')) {
        el.scrollTop = 0;
        return;
      }

      if (messagesGrew && (lastMsg?.role === 'user' || step !== 'DONE')) {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });
  }, [messages, isThinking, step]);

  useEffect(() => {
    const hasPlanMessage = messages.some((message) => message.type === 'plan');
    if (!isThinking || step !== 'DONE' || hasPlanMessage) {
      setCuratingStepIndex(0);
      return;
    }

    setThinkingLabel(CURATING_STEP_KEYS[0]);
    const id = window.setInterval(() => {
      setCuratingStepIndex((prev) => {
        const next = (prev + 1) % CURATING_STEP_KEYS.length;
        setThinkingLabel(CURATING_STEP_KEYS[next]);
        return next;
      });
    }, 2800);

    return () => window.clearInterval(id);
  }, [isThinking, step, messages]);

  const getLocationContext = () => {
    const propertyDisplayName = getPropertyDisplayName();
    const address = property?.address || propertyType?.address || '';
    const cityArea = listingAreaCtx?.masterArea || '';
    const pc = property?.postalCode || property?.pc || property?.zip || propertyType?.postalCode || propertyType?.pc || propertyType?.zip || ''; 
    const country = propertyType?.country || property?.country || '';

    const coords = extractCoords(property) || extractCoords(propertyType);
    const gpsString = coords ? `GPS Coordinates: ${coords.lat}, ${coords.lng}` : '';

    const fullLocationContext = [propertyDisplayName, richLocationName, address, cityArea, pc, country, gpsString]
      .filter(Boolean)
      .join(', ');

    return { propName: propertyDisplayName, fullLocationContext, cityArea, country, coords };
  };

  const getStartCoords = () => {
    const { coords: propCoords } = getLocationContext();
    return locationCoordsRef.current ?? preferences.locationCoords ?? propCoords;
  };

  const getPropertyBookendContext = (): PropertyBookendContext => {
    const { coords: propCoords } = getLocationContext();
    const startCoords = getStartCoords();
    const { endMin, nextDay } = computeEndFromDuration(startTime, tripDurationHours ?? 6);
    return {
      propertyTitle: getPropertyDisplayName(),
      propertyPhotoUrl: propertyType?.photoUrl || property?.photoUrl || '',
      propertyCoords: startCoords || propCoords,
      locationLabel: preferences.location,
      defaultStartTime: formatTime12(parseTimeToMinutes(startTime)),
      defaultEndTime: formatTime12(endMin, nextDay),
    };
  };

  const applyTimelinePropertyBookends = (plan: any, isNearProperty: boolean) => {
    if (!isNearProperty || !plan || plan.type !== 'timeline') return plan;
    return ensureTimelinePropertyBookends(plan, getPropertyBookendContext());
  };

  const scheduleTimelineIfNeeded = (plan: any, hasTimedWindow: boolean) => {
    if (!hasTimedWindow || !plan || plan.type !== 'timeline') return plan;
    const { endMin } = computeEndFromDuration(startTime, tripDurationHours ?? 6);
    return scheduleTimelinePlan(plan, {
      startTime24: startTime,
      endMin,
    });
  };

  const getPlanPhotoContext = (): PlanPhotoContext => {
    const { cityArea, country } = getLocationContext();
    const areaName = [cityArea, country].filter(Boolean).join(', ');
    const areaId = listingAreaCtx?.areaId || areaNameToId(cityArea);
    return {
      propertyPhotoUrl: propertyType?.photoUrl || property?.photoUrl || '',
      propertyName: getPropertyDisplayName(),
      locationLabel: preferences.location || '',
      usePropertyPhotoOnBookends:
        isNearPropertyLocation(preferences.location),
      areaName: areaName || country || 'Greece',
      country,
      areaId,
      gems,
      features,
      discoveredPlaces: discoveredPlaces.map((p) => ({
        name: p.name,
        photoUrl: p.photoUrl,
        googleMapsUrl: p.googleMapsUrl,
        googlePlaceId: p.googlePlaceId,
        latitude: p.latitude,
        longitude: p.longitude,
      })),
    };
  };

  /** Fast pass: just adds map URLs (no network for photos) — for immediate render. */
  const enrichForImmediateRender = async (
    planData: any,
    mapAreaHint: string,
    startCoords: ReturnType<typeof getStartCoords>
  ) => {
    return enrichPlanWithMapLinks(planData, mapAreaHint, startCoords);
  };

  /** Background pass: pulls photo URLs from our DB / cloud function. */
  const enrichPhotosInBackground = async (
    planData: any,
    startCoords: ReturnType<typeof getStartCoords>
  ) => {
    const photoCtx: PlanPhotoContext = {
      ...getPlanPhotoContext(),
      anchorCoords: startCoords ? { lat: startCoords.lat, lng: startCoords.lng } : null,
    };
    return enrichPlanWithAllPhotos(planData, photoCtx);
  };

  const validateDrivingFromProperty = async (
    locLat: number,
    locLng: number,
    placeLabel: string
  ): Promise<{ ok: true } | { ok: false; message: string }> => {
    const { coords: propCoords } = getLocationContext();
    if (!propCoords) return { ok: true };

    let distance = calculateRealisticDrivingDistance(propCoords.lat, propCoords.lng, locLat, locLng);
    let isPossible = true;

    // Skip OSRM for nearby destinations — math is accurate enough and saves 1–3s per call.
    // Only verify routability for far destinations where math may misjudge.
    if (distance > 30) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      try {
        const osrmRes = await fetch(
          `https://router.project-osrm.org/route/v1/driving/${propCoords.lng},${propCoords.lat};${locLng},${locLat}?overview=false`,
          { signal: controller.signal }
        );
        const osrmData = await osrmRes.json();
        if (osrmData.code === 'Ok') {
          distance = osrmData.routes[0].distance / 1000;
        } else if (osrmData.code === 'NoRoute') {
          isPossible = false;
        }
      } catch {
        // OSRM unavailable / timed out — keep math estimate.
      } finally {
        clearTimeout(timeoutId);
      }
    }

    if (!isPossible) {
      return {
        ok: false,
        message: tf('aiExpertErrorNoDrive', {
          place: placeLabel,
          property: getPropertyDisplayName(),
        }),
      };
    }

    if (distance > 120) {
      return {
        ok: false,
        message: tf('aiExpertErrorTooFarDayTrip', {
          place: placeLabel,
          km: Math.round(distance),
          property: getPropertyDisplayName(),
        }),
      };
    }

    return { ok: true };
  };

  const applyStartingLocation = (place: GeocodedPlace, userLabel: string) => {
    locationCoordsRef.current = { lat: place.lat, lng: place.lng };
    locationFullNameRef.current = place.displayName;
    setPreferences((prev) => ({
      ...prev,
      location: userLabel,
      locationCoords: { lat: place.lat, lng: place.lng },
      locationFullName: place.displayName,
    }));
    setLocationCandidates([]);
    setCustomLoc('');
    setStep('CATEGORIES');
  };

  const confirmLocationChoice = async (place: GeocodedPlace, userLabel: string) => {
    setIsThinking(true);
    setThinkingLabel('aiExpertVerifyingLocation');
    try {
      const check = await validateDrivingFromProperty(place.lat, place.lng, place.label);
      if (check.ok === false) {
        setMessages((prev) => [
          ...prev,
          { id: Date.now().toString(), role: 'ai', type: 'text', text: check.message },
        ]);
        return;
      }
      applyStartingLocation(place, userLabel);
    } finally {
      setIsThinking(false);
      setThinkingLabel('aiExpertThinking');
    }
  };

  /**
   * Fair sort for the timeline DB summary — same logic as flexible picks:
   * legit picks first, fresh > recently-shown, distance band, then random tiebreaker.
   * The AI sees variety on every call without losing the "nearer first" intuition.
   */
  const fairSort = <T extends {
    calculatedKm: number | null;
    isLegitPick?: boolean;
    name?: string;
    businessName?: string;
    googlePlaceId?: string;
    googleMapsUrl?: string;
    latitude?: number;
    longitude?: number;
  }>(items: T[], recentlyShown: Set<string>): T[] => {
    return items
      .map((item) => ({
        item,
        key: pickKeyForItem({
          name: item.name ?? item.businessName,
          googlePlaceId: item.googlePlaceId,
          googleMapsUrl: item.googleMapsUrl,
          latitude: item.latitude,
          longitude: item.longitude,
        }),
        rng: Math.random(),
      }))
      .sort((a, b) => {
        const aLegit = a.item.isLegitPick ? 1 : 0;
        const bLegit = b.item.isLegitPick ? 1 : 0;
        if (aLegit !== bLegit) return bLegit - aLegit;
        const aStale = a.key && recentlyShown.has(a.key) ? 1 : 0;
        const bStale = b.key && recentlyShown.has(b.key) ? 1 : 0;
        if (aStale !== bStale) return aStale - bStale;
        const aBand = a.item.calculatedKm == null ? 9999 : Math.floor(a.item.calculatedKm / 3);
        const bBand = b.item.calculatedKm == null ? 9999 : Math.floor(b.item.calculatedKm / 3);
        if (aBand !== bBand) return aBand - bBand;
        return a.rng - b.rng;
      })
      .map((entry) => entry.item);
  };

  const getFilteredDbSummary = (
    maxKmLimit: number,
    startCoordsOverride?: { lat: number; lng: number } | null,
    recentlyShown: Set<string> = new Set()
  ) => {
    const { coords: propCoords } = getLocationContext();
    const startCoords = startCoordsOverride ?? getStartCoords();

    const primary = contentSettings.primaryLocale;
    const reviewed = contentSettings.reviewedLocales;

    const localizeGem = (g: any) => ({
      ...g,
      name: resolveLocalizedString(g, 'name', locale, primary, reviewed),
      description: resolveLocalizedString(g, 'description', locale, primary, reviewed),
      category: resolveLocalizedString(g, 'category', locale, primary, reviewed),
    });
    const localizeFeature = (f: any) => ({
      ...f,
      name: resolveLocalizedString(f, 'name', locale, primary, reviewed) || f.businessName,
      description: resolveLocalizedString(f, 'description', locale, primary, reviewed),
    });

    if (!startCoords || isNaN(maxKmLimit)) {
      return {
        gems: gems?.map((g) => {
          const lg = localizeGem(g);
          return { name: lg.name, category: lg.category, distance: g.distanceKm ? `${g.distanceKm}km` : 'Local', description: lg.description, photoUrl: g.photoUrl || '', googleMapsUrl: g.googleMapsUrl || '' };
        }) || [],
        features: features?.map((f) => {
          const lf = localizeFeature(f);
          return { name: lf.name, category: f.categories?.join(', '), distance: 'Local', description: lf.description, photoUrl: f.photoUrl || '', googleMapsUrl: f.googleMapsUrl || '' };
        }) || []
      };
    }

    const filterItems = (items: any[]) => {
      return items?.map(item => {
        let coords = extractCoords(item);
        if (!coords) coords = propCoords; // assume property location if missing
        
        if (!coords) return { ...item, calculatedKm: null };
        return { ...item, calculatedKm: calculateRealisticDrivingDistance(startCoords!.lat, startCoords!.lng, coords.lat, coords.lng) };
      }).filter(item => item.calculatedKm === null || item.calculatedKm <= maxKmLimit) || [];
    };

    const filteredGems = fairSort(filterItems(gems), recentlyShown);
    const filteredFeatures = fairSort(filterItems(features), recentlyShown);

    return {
      gems: filteredGems.map((g) => {
        const lg = localizeGem(g);
        return {
          name: lg.name,
          category: lg.category,
          distance: g.calculatedKm !== null ? `${g.calculatedKm.toFixed(1)}km` : (g.distanceKm ? `${g.distanceKm}km` : 'Local'),
          description: lg.description,
          photoUrl: g.photoUrl || '',
          googleMapsUrl: g.googleMapsUrl || '',
        };
      }),
      features: filteredFeatures.map((f) => {
        const lf = localizeFeature(f);
        return {
          name: lf.name,
          category: f.categories?.join(', '),
          distance: f.calculatedKm !== null ? `${f.calculatedKm.toFixed(1)}km` : 'Local',
          description: lf.description,
          photoUrl: f.photoUrl || '',
          googleMapsUrl: f.googleMapsUrl || '',
        };
      }),
    };
  };

  const advanceStep = async (currentStep: Step, value: any, displayText: string) => {
    track('ai_expert_selection', { text: truncateAnalyticsText(displayText) });
    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', type: 'selection', text: displayText }]);

    if (currentStep === 'LOCATION') {
      const nearPropertyLabel = getNearPropertyLabel();
      const isNearProperty = value === nearPropertyLabel;
      let locCoords: { lat: number, lng: number } | null = null;
      let locFullName = '';
      
      if (!isNearProperty) {
        setIsThinking(true);
        setThinkingLabel('aiExpertFindingLocation');
        try {
          const { coords: propCoords, country, cityArea } = getLocationContext();
          const resolved = await resolveCustomLocation(value, { propCoords, country, cityArea }, locale);

          if (resolved.type === 'not_found') {
            setMessages((prev) => [
              ...prev,
              { id: Date.now().toString(), role: 'ai', type: 'text', text: resolved.message },
            ]);
            return;
          }

          if (resolved.type === 'choose') {
            setLocationCandidates(resolved.candidates);
            setMessages((prev) => [
              ...prev,
              { id: Date.now().toString(), role: 'ai', type: 'text', text: resolved.message },
            ]);
            return;
          }

          const check = await validateDrivingFromProperty(
            resolved.place.lat,
            resolved.place.lng,
            resolved.place.label
          );
          if (check.ok === false) {
            const nearby = await resolveCustomLocation(
              cityArea ? `${value}, ${cityArea}` : value,
              { propCoords, country, cityArea },
              locale
            );
            if (nearby.type === 'choose' || nearby.type === 'single') {
              const candidates =
                nearby.type === 'choose'
                  ? nearby.candidates
                  : [nearby.place];
              setLocationCandidates(candidates);
              setMessages((prev) => [
                ...prev,
                {
                  id: Date.now().toString(),
                  role: 'ai',
                  type: 'text',
                  text: `${check.message}\n\n${t('aiExpertDidYouMeanSuffix')}`,
                },
              ]);
              return;
            }
            setMessages((prev) => [
              ...prev,
              { id: Date.now().toString(), role: 'ai', type: 'text', text: check.message },
            ]);
            return;
          }

          locCoords = { lat: resolved.place.lat, lng: resolved.place.lng };
          locFullName = resolved.place.displayName;
        } catch (error) {
          console.error('Free Geocoding failed:', error);
          setMessages((prev) => [
            ...prev,
            { id: Date.now().toString(), role: 'ai', type: 'text', text: t('aiExpertErrorVerifyFailed') },
          ]);
          return;
        } finally {
          setIsThinking(false);
          setThinkingLabel('aiExpertThinking');
        }
      } else {
        const { coords: propCoords } = getLocationContext();
        locCoords = propCoords;
      }

      locationCoordsRef.current = locCoords;
      locationFullNameRef.current = locFullName;
      setPreferences((prev) => ({
        ...prev,
        location: value,
        locationCoords: locCoords,
        locationFullName: locFullName,
      }));
      setLocationCandidates([]);
      setStep('CATEGORIES');
    } else if (currentStep === 'CATEGORIES') {
      setPreferences(prev => ({ ...prev, categories: value }));
      setStep('DISTANCE');
      await generateCleverDistances(value, getStartCoords());
    } else if (currentStep === 'DISTANCE') {
      setPreferences(prev => ({ ...prev, distance: value }));
      setStep('TIME');
    }
  };

  const generateCleverDistances = async (cats: string[], startCoords: { lat: number; lng: number } | null) => {
    setIsThinking(true);
    try {
      const { coords: propCoords } = getLocationContext();
      
      const relevantItems = [
        ...(gems || []).filter(g => cats.includes(g.category)),
        ...(features || []).filter(f => f.categories?.some((c: string) => cats.includes(c)))
      ];

      if (cats.some(isHikingTrailsCategory)) {
        for (const trail of guestEligibleTrails) {
          const coords = trailCoords(trail);
          if (coords && startCoords) {
            relevantItems.push({ latitude: coords.lat, longitude: coords.lng });
          }
        }
      }

      const actualDistances = relevantItems.map(item => {
        let itemCoords = extractCoords(item);
        if (!itemCoords) itemCoords = propCoords; // assume property location if missing
        
        if (startCoords && itemCoords) {
          return calculateRealisticDrivingDistance(startCoords.lat, startCoords.lng, itemCoords.lat, itemCoords.lng);
        }
        return null;
      }).filter(d => d !== null) as number[];

      let distanceOptions: string[] = [];
      if (actualDistances.length === 0) {
        distanceOptions = ["5km (Local Area)", "15km (Region)", "30km (Day Trip)"];
      } else {
        const minD = Math.min(...actualDistances);
        const isNearProperty = isNearPropertyLocation(preferences.location);
        
        if (!isNearProperty && minD > 10) {
          // If they entered a custom location and the nearest DB item is >10km away,
          // don't force huge minimum distances to reach the DB items. Give standard local options.
          distanceOptions = ["5km (Local Area)", "15km (Region)", "30km (Day Trip)"];
        } else {
          distanceOptions = [
            `${Math.ceil(minD + 2)}km`,
            `${Math.ceil(minD + 10)}km`,
            `${Math.ceil(minD + 25)}km`
          ];
        }
      }

      setDynamicDistances(distanceOptions);
    } catch (e) {
      setDynamicDistances(["10km", "25km", "50km"]);
    } finally {
      setIsThinking(false);
    }
  };

  const executePlan = async (timeFrameStr: string) => {
    const friendlySchedule = timeFrameStr
      ? formatTripWindow(startTime, tripDurationHours ?? 6)
      : 'flexible';
    setPreferences(prev => ({ ...prev, timeFrame: friendlySchedule }));
    const selectionLabel = timeFrameStr
      ? formatTripWindow(startTime, tripDurationHours ?? 6)
      : t('aiExpertBrowseOwnPace');
    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', type: 'selection', text: selectionLabel }]);
    
    setStep('DONE');
    setIsThinking(true);
    setCuratingStepIndex(0);
    setThinkingLabel(CURATING_STEP_KEYS[0]);

    try {
      const aiTimeFrame = timeFrameStr
        ? (() => {
            const { end24 } = computeEndFromDuration(startTime, tripDurationHours ?? 6);
            return `${startTime} to ${end24}`;
          })()
        : '';

      const { fullLocationContext, coords: propCoords } = getLocationContext();
      const startCoords = getStartCoords();
      const isNearProperty = isNearPropertyLocation(preferences.location);
      const startLocationName = isNearProperty ? fullLocationContext : (locationFullNameRef.current || preferences.locationFullName || preferences.location);
      const gpsString = startCoords ? `${startCoords.lat}, ${startCoords.lng}` : 'Unknown';

      let distanceLimitNum = 9999;
      if (preferences.distance) {
        const match = preferences.distance.match(/\d+(\.\d+)?/);
        if (match) {
          distanceLimitNum = parseFloat(match[0]);
        } else if (preferences.distance.toLowerCase().includes('walk')) {
          distanceLimitNum = 2;
        }
      }

      const liveLikeLocalCategories = filterPrimariesForLiveLikeLocal(
        preferences.categories,
        excludedLiveLikeLocalPrimaries
      );
      const hikingCategories = liveLikeLocalCategories.filter(isHikingTrailsCategory);
      const nonHikingCategories = liveLikeLocalCategories.filter((c) => !isHikingTrailsCategory(c));
      const trailCategoryBlocks =
        hikingCategories.length > 0
          ? buildHikingTrailCategories(
              hikingCategories,
              guestEligibleTrails,
              startCoords,
              distanceLimitNum,
              resolveCategoryDisplayLabel
            )
          : [];
      const trailsOnlySelection = hikingCategories.length > 0 && nonHikingCategories.length === 0;

      if (trailsOnlySelection) {
        const categories = trailCategoryBlocks.filter((c) => c.items.length > 0);
        if (categories.length === 0) {
          setMessages((prev) => [
            ...prev,
            { id: Date.now().toString(), role: 'ai', type: 'text', text: t('aiExpertNoTrailsInRange') },
          ]);
          setIsThinking(false);
          return;
        }

        const initialPlan = { type: 'picks', categories };
        const planMessageId = `${Date.now()}-plan`;
        track('ai_expert_plan', {
          planStopCount: categories.reduce((n, c) => n + c.items.length, 0),
          planCategories: categories.map((c) => c.categoryName),
        });
        setMessages((prev) => [
          ...prev,
          { id: planMessageId, role: 'ai', type: 'plan', data: initialPlan },
        ]);
        setIsThinking(false);
        return;
      }

      if (liveLikeLocalCategories.length === 0) {
        setMessages((prev) => [
          ...prev,
          { id: Date.now().toString(), role: 'ai', type: 'text', text: t('aiExpertErrorPlan') },
        ]);
        setIsThinking(false);
        return;
      }

      const recentlyShown = getRecentlyShownKeys();
      const filteredDatabase = getFilteredDbSummary(distanceLimitNum, startCoords, recentlyShown);
      const isFlexiblePicks = !timeFrameStr;
      const aiCategories =
        nonHikingCategories.length > 0 ? nonHikingCategories : liveLikeLocalCategories;

      const picksDbContext = isFlexiblePicks
        ? buildFlexiblePicksDbContext(
            aiCategories,
            distanceLimitNum,
            startCoords,
            propCoords,
            gems,
            features,
            recentlyShown
          )
        : null;

      const hardCapKm = effectiveMaxDistanceKm(distanceLimitNum);

      const systemInstruction = `You are Vailo, an elite local concierge. Reply only with a valid JSON object (no markdown, no prose outside JSON).

${guestAiLanguageBlock(locale)}

Rules:
- HARD DISTANCE LIMIT: NEVER suggest a place farther than ${hardCapKm.toFixed(0)}km from the starting point. If you cannot think of a real, named local place within that limit, return FEWER items — never pad with far-away alternatives. A small radius (e.g. 9km) must never return a 200km+ suggestion.
- 50 / 50 SPLIT: When the VAILO DATABASE has items in the requested categories, mix roughly half host-curated database picks with half your own AI picks of specific, real, named businesses or natural landmarks LOCALS actually use. Never pad with duplicates and never repeat a business that is already in the database pool.
- AI picks must be specific NAMED places (e.g. "Taverna O Manolis", "Imbros Gorge"). Never suggest a generic area, town centre, or "best of" list. If you are not sure a specific place exists in the radius, skip it.
- Leave googleMapsUrl and photoUrl EMPTY for AI picks — our system resolves the exact place link from your title + location.
- If you know an exact Google Place ID for an AI pick, include it as "googlePlaceId" — it makes the link point to that exact business.
- distanceKm is REQUIRED on every item and must be ≤ ${hardCapKm.toFixed(0)}.`;

      let promptText = `Starting point: "${startLocationName}" (GPS: ${gpsString}). Radius: ${distanceLimitNum}km (hard cap ${hardCapKm.toFixed(0)}km). Categories: ${aiCategories.join(', ')}.

${isNearProperty
  ? `Property context: ${fullLocationContext}`
  : `User is NOT at their accommodation. Focus strictly on places near "${startLocationName}". Do not suggest places near their accommodation.`}

${
  isFlexiblePicks
    ? ''
    : `VAILO DATABASE (already pre-filtered within ${distanceLimitNum}km of starting point — use roughly half of timeline stops from here, alternated with your own NAMED AI picks. Never repeat a database business):
${JSON.stringify(filteredDatabase)}`
}`;

      if (aiTimeFrame) {
        promptText += `

Timeframe: ${aiTimeFrame}. Stops must be ordered for a logical route starting and ending at the guest's starting point. We compute exact times and driving/walking legs from GPS — do NOT invent schedules or travel text.

Return JSON with this schema:
{
  "type": "timeline",
  "plan": [
    {
      "time": "",
      "title": "Specific place name",
      "description": "Engaging 2-sentence description.",
      "transportToNext": "",
      "source": "database" | "ai",
      "googlePlaceId": "Place ID if you know it (improves the map link). Empty string otherwise.",
      "photoUrl": "Exact URL from DB or empty string for AI picks",
      "googleMapsUrl": "Exact URL from DB or empty string for AI picks"
    }
  ]
}`;
      } else {
        promptText += buildFlexiblePicksPromptSection(
          aiCategories,
          distanceLimitNum,
          picksDbContext!
        );
        promptText += `

Return JSON with this schema:
{
  "type": "picks",
  "categories": [
    {
      "categoryName": "Name of Category",
      "items": [
        {
          "title": "Specific local business/place name",
          "description": "2 sentences on why LOCALS love it — not why tourists go.",
          "distanceKm": 12.4,
          "beyondRadius": false,
          "estimatedDistance": "12.4km — or 'Further · 18.0km' when beyondRadius is true",
          "source": "database" | "ai",
          "googlePlaceId": "Place ID if you know it (AI picks only — improves accuracy). Empty otherwise.",
          "photoUrl": "Exact URL from DB or empty string for AI picks",
          "googleMapsUrl": "Exact URL from DB or empty string for AI picks"
        }
      ]
    }
  ]
}
Up to ${MAX_PICKS_PER_CATEGORY} unique items per category. Fill from within ${distanceLimitNum}km first; if fewer remain, add distinct places from extended range (beyondRadius: true). Never list the same business twice. Sort closest to furthest.`;
      }

      const model = getGenerativeModel(ai, {
        model: 'gemini-2.5-flash',
        systemInstruction: { role: 'system', parts: [{ text: systemInstruction }] },
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.7,
        },
      });

      const result = await model.generateContent(promptText);
      const rawText = result.response.text();

      let parsedData: any;
      try {
        parsedData = JSON.parse(rawText);
      } catch {
        const firstBrace = rawText.indexOf('{');
        const lastBrace = rawText.lastIndexOf('}');
        if (firstBrace === -1 || lastBrace === -1) throw new Error('AI did not return a recognizable JSON object.');
        parsedData = JSON.parse(rawText.substring(firstBrace, lastBrace + 1));
      }

      const mapAreaHint = getGeographicAreaHint() || startLocationName || preferences.location;
      let initialPlan = applyTimelinePropertyBookends(parsedData, isNearProperty);
      initialPlan = mergeTrailCategoriesIntoPlan(initialPlan, trailCategoryBlocks);
      initialPlan = await enrichForImmediateRender(initialPlan, mapAreaHint, startCoords);

      if (isFlexiblePicks && picksDbContext) {
        initialPlan = normalizeFlexiblePicksPlan(
          initialPlan,
          distanceLimitNum,
          picksDbContext,
          startCoords,
          recentlyShown
        );
      } else {
        initialPlan = filterTimelinePlanByDistance(initialPlan, distanceLimitNum, startCoords, recentlyShown);
        initialPlan = scheduleTimelineIfNeeded(initialPlan, !!timeFrameStr);
      }

      initialPlan = stripExcludedCategoriesFromPlan(initialPlan, excludedLiveLikeLocalPrimaries) ?? initialPlan;

      // Render the plan immediately — feels instant. Photos fill in next.
      const planMessageId = `${Date.now()}-plan`;
      track('ai_expert_plan', {
        planStopCount: countPlanStops(initialPlan),
        planCategories: Array.isArray(initialPlan?.categories)
          ? initialPlan.categories
              .map((c: { categoryName?: string }) => c.categoryName)
              .filter(Boolean)
          : undefined,
      });
      setMessages(prev => [...prev, { id: planMessageId, role: 'ai', type: 'plan', data: initialPlan }]);
      setIsThinking(false);

      // Record which DB items we just showed so they get rotated out next time.
      markItemsShown(collectDbItemsFromPlan(initialPlan));

      // Background photo enrichment — updates the same message when ready.
      enrichPhotosInBackground(initialPlan, startCoords)
        .then((withPhotos) => {
          let finalPlan = withPhotos;
          finalPlan = mergeTrailCategoriesIntoPlan(finalPlan, trailCategoryBlocks);
          if (isFlexiblePicks && picksDbContext) {
            finalPlan = normalizeFlexiblePicksPlan(
              finalPlan,
              distanceLimitNum,
              picksDbContext,
              startCoords,
              recentlyShown
            );
          } else {
            finalPlan = filterTimelinePlanByDistance(finalPlan, distanceLimitNum, startCoords, recentlyShown);
            finalPlan = scheduleTimelineIfNeeded(finalPlan, !!timeFrameStr);
          }
          finalPlan =
            stripExcludedCategoriesFromPlan(
              finalPlan as Record<string, unknown>,
              excludedLiveLikeLocalPrimaries
            ) ?? finalPlan;
          setMessages(prev =>
            prev.map(m => (m.id === planMessageId ? { ...m, data: finalPlan } : m))
          );
        })
        .catch((err) => {
          console.error('Background photo enrichment failed:', err);
        });

    } catch (error: any) {
      console.error('Critical AI Itinerary Error:', error);
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'ai', type: 'text', text: t('aiExpertErrorPlan') }]);
      setIsThinking(false);
    } finally {
      setThinkingLabel('aiExpertThinking');
    }
  };

  useLayoutEffect(() => {
    resizeChatTextarea();
  }, [chatInput, resizeChatTextarea]);

  useLayoutEffect(() => {
    resizeChatTextarea();
  }, [resizeChatTextarea]);

  const submitChatMessage = async () => {
    if (!chatInput.trim() || isThinking) return;

    const userText = chatInput.trim();
    setChatInput('');
    track('ai_expert_user_message', { text: truncateAnalyticsText(userText) });
    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', type: 'text', text: userText }]);
    
    if (step !== 'DONE') setStep('DONE');
    
    setIsThinking(true);
    setThinkingLabel('aiExpertThinking');

    try {
      const { fullLocationContext } = getLocationContext();
      const startCoords = getStartCoords();
      const isNearProperty = isNearPropertyLocation(preferences.location);
      const startLocationName = isNearProperty
        ? fullLocationContext
        : (locationFullNameRef.current || preferences.locationFullName || preferences.location);
      const gpsString = startCoords ? `${startCoords.lat}, ${startCoords.lng}` : 'Unknown';

      const conversationHistory = messages
        .map(m => {
          if (m.type === 'plan') return `AI generated plan on screen: ${JSON.stringify(m.data)}`;
          if (m.text?.startsWith('welcome:')) {
            return `AI: Welcomed guest to ${m.text.replace('welcome:', '')}.`;
          }
          if (m.type === 'selection') return `Guest selected: ${m.text}`;
          return `${m.role === 'ai' ? 'AI' : 'Guest'}: ${m.text}`;
        })
        .join('\n');

      let distanceLimitNum = 9999;
      if (preferences.distance) {
        const match = preferences.distance.match(/\d+(\.\d+)?/);
        if (match) {
          distanceLimitNum = parseFloat(match[0]);
        } else if (preferences.distance.toLowerCase().includes('walk')) {
          distanceLimitNum = 2;
        }
      }
      const recentlyShown = getRecentlyShownKeys();
      const filteredDatabase = getFilteredDbSummary(distanceLimitNum, startCoords, recentlyShown);

      const systemInstruction = `You are Vailo, an elite local concierge. Always reply with a single valid JSON object (no markdown).

${guestAiLanguageBlock(locale)}

Rules:
- Only answer questions about local travel, day planning, itineraries, and "live like a local" advice.
- 50 / 50 SPLIT when providing a plan: mix roughly half host-curated VAILO DATABASE picks with half your own specific, real, named AI picks (NEVER duplicate a business already in the database).
- AI picks must be specific NAMED places — never a generic area or town centre. Skip a slot if you are not sure.
- Leave photoUrl and googleMapsUrl EMPTY for AI picks — our system resolves the exact place link.
- Include googlePlaceId for AI picks if you know it.
- Never invent kilometer distances for AI picks. Use neighborhood/village names instead.
- If providing recommendations, embed them inside the JSON 'plan' object — not in replyText.`;

      const prompt = `Starting point: "${startLocationName}" (GPS: ${gpsString}).
Preferences: ${JSON.stringify(preferences)}.

${isNearProperty
  ? `Property context: ${fullLocationContext}`
  : `User is NOT at their accommodation. Focus on places near "${startLocationName}".`}

Conversation so far:
${conversationHistory}

VAILO DATABASE (pre-filtered):
${JSON.stringify(filteredDatabase)}

Return JSON with this schema:
{
  "replyText": "Your conversational reply.",
  "hasPlan": true | false,
  "plan": null | {
    "type": "picks" | "timeline",
    "plan": [ { "time": "", "title": "", "description": "", "transportToNext": "", "source": "database" | "ai", "photoUrl": "", "googleMapsUrl": "" } ],
    "categories": [ { "categoryName": "", "items": [ { "title": "", "description": "", "estimatedDistance": "", "source": "database" | "ai", "photoUrl": "", "googleMapsUrl": "" } ] } ]
  }
}

User: ${userText}`;

      const model = getGenerativeModel(ai, {
        model: 'gemini-2.5-flash',
        systemInstruction: { role: 'system', parts: [{ text: systemInstruction }] },
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.7,
        },
      });

      const result = await model.generateContent(prompt);
      const rawText = result.response.text();

      let parsedData: any;
      try {
        parsedData = JSON.parse(rawText);
      } catch {
        const firstBrace = rawText.indexOf('{');
        const lastBrace = rawText.lastIndexOf('}');
        if (firstBrace === -1 || lastBrace === -1) throw new Error('JSON Parse failed.');
        parsedData = JSON.parse(rawText.substring(firstBrace, lastBrace + 1));
      }

      if (parsedData.replyText) {
        track('ai_expert_reply', { text: truncateAnalyticsText(parsedData.replyText, 1000) });
        setMessages(prev => [...prev, {
          id: Date.now().toString() + 'text',
          role: 'ai',
          type: 'text',
          text: parsedData.replyText,
        }]);
      }

      if (parsedData.hasPlan && parsedData.plan) {
        track('ai_expert_plan', {
          planStopCount: countPlanStops(parsedData.plan),
          planCategories: Array.isArray(parsedData.plan?.categories)
            ? parsedData.plan.categories
                .map((c: { categoryName?: string }) => c.categoryName)
                .filter(Boolean)
            : undefined,
        });
        const mapAreaHint = getGeographicAreaHint() || startLocationName || preferences.location;
        let initialPlan = applyTimelinePropertyBookends(parsedData.plan, isNearProperty);
        initialPlan = await enrichForImmediateRender(initialPlan, mapAreaHint, startCoords);
        initialPlan = filterTimelinePlanByDistance(initialPlan, distanceLimitNum, startCoords, recentlyShown);
        initialPlan = scheduleTimelineIfNeeded(initialPlan, !!preferences.timeFrame);
        initialPlan =
          stripExcludedCategoriesFromPlan(initialPlan, excludedLiveLikeLocalPrimaries) ?? initialPlan;
        const planMessageId = Date.now().toString() + 'plan';
        setMessages(prev => [...prev, { id: planMessageId, role: 'ai', type: 'plan', data: initialPlan }]);
        setIsThinking(false);

        markItemsShown(collectDbItemsFromPlan(initialPlan));

        enrichPhotosInBackground(initialPlan, startCoords)
          .then((withPhotos) => {
            let filtered = filterTimelinePlanByDistance(withPhotos, distanceLimitNum, startCoords, recentlyShown);
            filtered = scheduleTimelineIfNeeded(filtered, !!preferences.timeFrame);
            filtered =
              stripExcludedCategoriesFromPlan(filtered, excludedLiveLikeLocalPrimaries) ?? filtered;
            setMessages(prev =>
              prev.map(m => (m.id === planMessageId ? { ...m, data: filtered } : m))
            );
          })
          .catch((err) => console.error('Background photo enrichment failed:', err));
      } else {
        setIsThinking(false);
      }

    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'ai',
        type: 'text',
        text: t('aiExpertErrorConnect'),
      }]);
      setIsThinking(false);
    } finally {
      setThinkingLabel('aiExpertThinking');
    }
  };

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void submitChatMessage();
  };

  const handleChatKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey) return;
    e.preventDefault();
    void submitChatMessage();
  };

  // Used for "View" / "Directions" buttons rendered after the plan returns. We
  // prefer a real geographic hint (e.g. "Chania, Greece") so Google Maps lands
  // on the place card, not a list of results that include the property name.
  const mapAreaHint =
    getGeographicAreaHint() ||
    locationFullNameRef.current ||
    preferences.locationFullName ||
    preferences.location ||
    richLocationName;

  const planAnotherDay = () => {
    setStep('LOCATION');
    locationCoordsRef.current = null;
    locationFullNameRef.current = '';
    setLocationCandidates([]);
    setPreferences({ location: '', locationCoords: null, locationFullName: '', categories: [], distance: '', timeFrame: '' });
    setSelectedCats([]);
    setCustomLoc('');
    setStartTime('09:00');
    setTripDurationHours(6);
    setTimeChoiceMode('choose');
    isFirstScrollRef.current = true;
    setMessages([
      { id: Date.now().toString(), role: 'ai', type: 'text', text: `welcome:${getPropertyDisplayName()}` },
    ]);
  };

  const renderMessage = (msg: Message) => {
    if (msg.role === 'user') {
      if (msg.type === 'selection') return null;
      return (
        <div key={msg.id} className="flex justify-end mb-5 animate-in fade-in duration-300">
          <div className="max-w-[90%] bg-white/12 text-white px-4 py-3 rounded-2xl rounded-tr-md border border-white/10 shadow-sm text-base leading-relaxed whitespace-pre-wrap">
            {msg.text}
          </div>
        </div>
      );
    }

    const isWelcomeMessage =
      msg.type === 'text' && (msg.text?.startsWith('welcome:') || messages[0]?.id === msg.id);

    if (isWelcomeMessage) {
      const propertyNameOnly = property?.propertyName || t('aiExpertYourStay');
      const typeName = getPropertyTypeName();
      const area = getAreaName();

      return (
        <div key={msg.id} className="mb-6 animate-in fade-in duration-300">
          <div className="rounded-3xl overflow-hidden border border-white/15 bg-white/10 backdrop-blur-sm shadow-[0_12px_40px_rgba(5,31,38,0.2)]">
            <div className="px-5 py-4">
              <p className="guest-eyebrow mb-1.5 text-white/45">
                {t('aiExpertYoureIn')}
              </p>
              <p className="font-luxury text-xl sm:text-2xl leading-snug text-white font-medium">
                {propertyNameOnly}
              </p>
              {typeName && (
                <p className="text-sm font-semibold text-white/55 tracking-[0.08em] uppercase mt-1">
                  {typeName}
                </p>
              )}
              <div className="flex items-center gap-2 my-3">
                <div className="h-px flex-1 bg-gradient-to-r from-vailo-gold/45 to-transparent" />
                <Sparkles size={11} className="text-vailo-gold/70 shrink-0" />
              </div>
              <p className="text-base text-white/85 leading-relaxed">
                {tf('aiExpertWelcomeBody', { area })}
              </p>
              <p className="text-base font-medium text-white mt-2.5 leading-relaxed">
                {t('aiExpertWelcomeCta')}
              </p>
            </div>
          </div>
        </div>
      );
    }

    if (msg.type === 'plan' && msg.data) {
      const isPicks = msg.data.type === 'picks';

      return (
        <div key={msg.id} data-ai-expert-plan className="mb-8 animate-in fade-in duration-300">
          <div className="bg-white/10 backdrop-blur-sm border border-white/15 rounded-3xl overflow-hidden shadow-[0_12px_40px_rgba(5,31,38,0.25)]">
            <div className="bg-gradient-to-r from-vailo-teal/80 to-vailo-teal-light/90 px-5 py-4 text-white border-b border-white/10">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-white/10 rounded-xl shrink-0">
                  {isPicks ? <Heart size={18} className="text-vailo-gold" /> : <Compass size={18} className="text-vailo-gold" />}
                </div>
                <div>
                  <h3 className="font-semibold text-lg tracking-tight">
                    {isPicks ? t('aiExpertPlanPicksTitle') : t('aiExpertPlanTimelineTitle')}
                  </h3>
                  <p className="text-white/70 text-sm mt-1 leading-relaxed">
                    {isPicks ? t('aiExpertPlanPicksSub') : t('aiExpertPlanTimelineSub')}
                  </p>
                </div>
              </div>
            </div>

            <div className="p-5">
            {msg.data.trailCategories?.length > 0 && (
              <div className="space-y-8 pt-1 mb-8">
                {msg.data.trailCategories.map((cat: any, idx: number) => (
                  <TrailPickCarousel
                    key={`trail-${idx}`}
                    categoryName={cat.categoryName}
                    items={cat.items || []}
                    propertyId={property?.id}
                    propertyCoords={propertyCoords}
                    viewMapLabel={t('aiExpertView')}
                    goMapLabel={t('aiExpertGo')}
                  />
                ))}
              </div>
            )}

            {msg.data.type === 'timeline' && (
              <div className="space-y-6 pt-1">
                {msg.data.plan?.map((item: any, idx: number) => (
                  <div key={idx} className="relative pl-6 pb-6 border-l-2 border-vailo-gold/30 last:border-0 last:pb-0">
                    <div className="absolute w-3 h-3 bg-vailo-gold rounded-full -left-[7px] top-1 ring-4 ring-vailo-gold/15" />
                    <p className="font-semibold text-vailo-gold text-base mb-2">{item.time}</p>
                    
                    <div className="bg-white/8 border border-white/10 rounded-2xl overflow-hidden">
                      <div className="relative">
                        <PlanImage
                          src={item.photoUrl}
                          alt={item.title}
                          className="w-full h-36 object-cover"
                          fallbackClassName="w-full h-36"
                        />
                        {item.previouslyShown && (
                          <span className="guest-badge absolute top-3 right-3 bg-vailo-teal/90 text-white px-2.5 py-1 shadow-sm border border-white/15 flex items-center gap-1">
                            <Eye size={11} strokeWidth={2.2} /> {t('aiExpertSeenBefore')}
                          </span>
                        )}
                      </div>
                      <div className="p-4">
                        <h4 className="font-semibold text-white text-base flex flex-wrap items-center gap-2 mb-2">
                          {item.title}
                          {(item.isProperty || item.source === 'property') ? (
                            <span className="guest-badge bg-white/12 text-white border border-white/15">
                              {t('aiExpertBadgeYourStay')}
                            </span>
                          ) : item.source === 'database' ? (
                            <span className="guest-badge bg-vailo-gold/20 text-vailo-gold border border-vailo-gold/25">
                              {t('aiExpertBadgeVailoPick')}
                            </span>
                          ) : null}
                        </h4>
                        <ExpandableDescription
                          text={item.description}
                          lines={3}
                          className="mb-4"
                          bodyClassName={AI_EXPERT_DESC_BODY}
                          toggleClassName={AI_EXPERT_DESC_TOGGLE}
                        />

                        <div className="flex items-center justify-between gap-2 pt-4 border-t border-white/10">
                          {!(item.isProperty || item.source === 'property') && (
                          <PickFeedbackButtons
                            propertyId={property?.id}
                            item={{
                              title: item.title,
                              source: item.source,
                              googlePlaceId: item.googlePlaceId,
                              googleMapsUrl: item.googleMapsUrl,
                              latitude: item.latitude,
                              longitude: item.longitude,
                              description: item.description,
                            }}
                          />
                          )}
                          <MapLinkButtons
                            item={item}
                            mapAreaHint={mapAreaHint}
                            viewLabel={t('aiExpertView')}
                            goLabel={t('aiExpertGo')}
                          />
                        </div>
                      </div>
                    </div>

                    {item.transportToNext && (
                      <div className="mt-3 inline-flex items-center text-sm font-medium text-white/70 bg-white/8 px-3 py-2 rounded-lg border border-white/10">
                        <Navigation size={12} className="mr-2 text-vailo-gold" /> {item.transportToNext}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {msg.data.type === 'picks' && (
              <div className="space-y-8 pt-1">
                {msg.data.categories?.map((cat: any, idx: number) =>
                  cat.isTrails || cat.items?.[0]?.itemType === 'trail' ? (
                    <TrailPickCarousel
                      key={idx}
                      categoryName={cat.categoryName}
                      items={cat.items || []}
                      propertyId={property?.id}
                      propertyCoords={propertyCoords}
                      viewMapLabel={t('aiExpertView')}
                      goMapLabel={t('aiExpertGo')}
                    />
                  ) : (
                    <CategoryPickCarousel
                      key={idx}
                      categoryName={cat.categoryName}
                      items={cat.items || []}
                      mapAreaHint={mapAreaHint}
                      propertyId={property?.id}
                      viewMapLabel={t('aiExpertView')}
                      goMapLabel={t('aiExpertGo')}
                    />
                  )
                )}
              </div>
            )}

            <PlanOverviewMap planData={msg.data} />

            <button
              onClick={planAnotherDay}
              className="w-full mt-6 py-4 min-h-[48px] rounded-2xl text-base transition-all border border-vailo-gold/45 bg-vailo-gold/15 text-white font-semibold hover:bg-vailo-gold/25 hover:border-vailo-gold/65 shadow-[0_2px_12px_rgba(197,160,89,0.2)]"
            >
              {t('aiExpertPlanAnotherDay')}
            </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div key={msg.id} className="mb-5 animate-in fade-in duration-300">
        <div className="bg-white/10 border border-white/15 text-white/90 px-4 py-3.5 rounded-2xl text-base leading-relaxed whitespace-pre-wrap">
          {msg.text}
        </div>
      </div>
    );
  };

  const renderWizardSummary = () => {
    if (step === 'DONE') return null;

    const hasLocation = Boolean(preferences.location);
    const hasCategories = preferences.categories.length > 0;
    const hasDistance = Boolean(preferences.distance);
    const hasSchedule = Boolean(preferences.timeFrame);
    const pendingSchedule =
      step === 'TIME' &&
      timeChoiceMode === 'timeline' &&
      startTime &&
      tripDurationHours != null &&
      !hasSchedule;

    if (!hasLocation && !hasCategories && !hasDistance && !hasSchedule && !pendingSchedule) {
      return null;
    }

    return (
      <div className="mb-4 rounded-2xl border border-white/15 bg-white/10 backdrop-blur-sm overflow-hidden">
        <div className="px-4 py-2.5 border-b border-white/10">
          <p className="guest-eyebrow text-white/45">{t('aiExpertYourChoices')}</p>
        </div>
        <div className="px-4 py-3 space-y-2.5">
          {hasLocation && (
            <div className="flex items-start gap-2.5">
              <MapPin size={14} className="text-vailo-gold shrink-0 mt-0.5" />
              <span className="text-base text-white leading-snug">{preferences.location}</span>
            </div>
          )}
          {hasCategories && (
            <div className="flex flex-wrap gap-1.5 pl-6">
              {filterPrimariesForLiveLikeLocal(
                preferences.categories,
                excludedLiveLikeLocalPrimaries
              ).map((cat) => (
                <span
                  key={cat}
                  className="text-xs sm:text-sm px-3 py-1.5 rounded-full bg-white/12 text-white font-semibold border border-white/10"
                >
                  {cat}
                </span>
              ))}
            </div>
          )}
          {hasDistance && (
            <div className="flex items-center gap-2.5">
              <Compass size={14} className="text-vailo-gold shrink-0" />
              <span className="text-base text-white">
                {tf('aiExpertWithinDistance', { distance: preferences.distance })}
              </span>
            </div>
          )}
          {(hasSchedule || pendingSchedule) && (
            <div className="flex items-center gap-2.5">
              <Clock size={14} className="text-vailo-gold shrink-0" />
              <span className="text-base text-white">
                {hasSchedule
                  ? preferences.timeFrame === 'flexible'
                    ? t('aiExpertFlexibleSchedule')
                    : preferences.timeFrame
                  : formatTripWindow(startTime, tripDurationHours ?? 6)}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  };

  const wizardStepIndex = step === 'DONE' ? -1 : wizardSteps.findIndex((s) => s.key === step);

  const renderWizardProgress = () => {
    if (wizardStepIndex < 0) return null;
    return (
      <div className="mb-5 px-1">
        <div className="flex items-center justify-between mb-2">
          {wizardSteps.map((s, i) => (
            <div key={s.key} className="flex flex-col items-center flex-1">
              <div
                className={`w-2 h-2 rounded-full transition-colors ${
                  i <= wizardStepIndex ? 'bg-vailo-gold' : 'bg-white/20'
                }`}
              />
              <span
                className={`text-[10px] sm:text-xs mt-1.5 text-center leading-tight ${
                  i === wizardStepIndex ? 'text-white font-semibold' : 'text-white/40'
                }`}
              >
                {s.label}
              </span>
            </div>
          ))}
        </div>
        <div className="h-0.5 bg-white/15 rounded-full overflow-hidden">
          <div
            className="h-full bg-vailo-gold transition-all duration-500 rounded-full"
            style={{ width: `${((wizardStepIndex + 1) / wizardSteps.length) * 100}%` }}
          />
        </div>
      </div>
    );
  };

  const renderThinkingLoader = () => {
    if (!isThinking) return null;

    const isInitialCurating =
      step === 'DONE' && !messages.some((message) => message.type === 'plan');

    if (isInitialCurating) {
      const steps = CURATING_STEP_KEYS.map((key) => ({ key, label: t(key) }));
      return (
        <AiExpertCuratingLoader
          headline={t(thinkingLabel)}
          hint={t('aiExpertCuratingHint')}
          steps={steps}
          activeStepIndex={curatingStepIndex}
        />
      );
    }

    return <AiExpertCuratingLoader headline={t(thinkingLabel)} compact />;
  };

  return (
    <div className="guest-mobile fixed inset-0 z-50 flex flex-col overflow-hidden bg-gradient-to-b from-vailo-teal to-vailo-teal-hover md:relative md:h-[800px] md:rounded-3xl md:shadow-[4px_0_48px_-8px_rgba(5,31,38,0.45)] md:border md:border-white/10">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;0,600;1,400;1,500&display=swap');
        .font-luxury { font-family: 'Lora', serif; }
        @keyframes ai-expert-shimmer {
          0% { transform: translateX(-120%); }
          100% { transform: translateX(320%); }
        }
        .ai-expert-shimmer-bar {
          animation: ai-expert-shimmer 1.8s ease-in-out infinite;
        }
        .ai-expert-scroll {
          scrollbar-width: thin;
          scrollbar-color: rgba(197, 160, 89, 0.45) rgba(255, 255, 255, 0.08);
        }
        .ai-expert-scroll::-webkit-scrollbar {
          width: 6px;
        }
        .ai-expert-scroll::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.06);
          border-radius: 9999px;
        }
        .ai-expert-scroll::-webkit-scrollbar-thumb {
          background: rgba(197, 160, 89, 0.45);
          border-radius: 9999px;
        }
        .ai-expert-scroll::-webkit-scrollbar-thumb:hover {
          background: rgba(197, 160, 89, 0.65);
        }
      `}</style>

      <div className="relative shrink-0 z-30 overflow-hidden border-b border-white/10 isolate">
        <div className="absolute -top-12 -right-8 w-44 h-44 bg-vailo-gold/10 blur-3xl rounded-full pointer-events-none" />
        <div className="absolute -bottom-10 -left-10 w-36 h-36 bg-white/5 blur-3xl rounded-full pointer-events-none" />

        <div className="relative z-10 px-4 py-3.5 flex items-center gap-2.5 sm:gap-3">
          <button
            onClick={onClose}
            className="h-11 w-11 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-white/10 border border-white/15 text-white hover:bg-white/15 transition-all"
            aria-label={t('aiExpertBackAria')}
          >
            <ArrowLeft size={20} />
          </button>

          <div className="flex-1 min-w-0">
            <p className="guest-eyebrow text-[10px] sm:text-xs text-white/45">
              {t('aiExpertConcierge')}
            </p>
            <h2 className="font-luxury text-lg sm:text-xl leading-tight text-white font-medium mt-0.5">
              {t('aiExpertTitle')}
            </h2>
          </div>

          <GuestLanguageMenu
            variant="hero"
            locale={locale}
            onChange={setLocale}
            options={localeOptions}
          />
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-vailo-gold/30 to-vailo-gold/10 border border-vailo-gold/25 flex items-center justify-center shrink-0 shadow-inner hidden sm:flex">
            <span className="font-bold text-vailo-gold text-sm font-luxury">V</span>
          </div>
        </div>
      </div>

      <div
        ref={scrollContainerRef}
        className="relative z-0 flex-1 min-h-0 overflow-y-auto overflow-x-hidden ai-expert-scroll p-4 md:p-6 flex flex-col"
      >
        {messages.map(renderMessage)}

        {!isThinking && step !== 'DONE' && (
          <div className="animate-in fade-in mt-1 w-full min-w-0 max-w-full">
            {renderWizardSummary()}
            {renderWizardProgress()}
            
            {step === 'LOCATION' && (
              <div className={AI_EXPERT_PANEL}>
                <p className={AI_EXPERT_PANEL_TITLE}>{t('aiExpertLocationTitle')}</p>
                <p className={AI_EXPERT_PANEL_SUB}>{t('aiExpertLocationSub')}</p>
                {locationCandidates.length > 0 ? (
                  <div className="flex flex-col gap-2.5">
                    <p className="text-sm text-white/60 mb-1">{t('aiExpertWhichLocation')}</p>
                    {locationCandidates.map((place) => (
                      <button
                        key={`${place.lat}-${place.lng}`}
                        onClick={() => confirmLocationChoice(place, place.label)}
                        className="group flex items-start gap-3 bg-white/8 border border-white/15 text-white px-4 py-4 min-h-[48px] rounded-xl text-base font-medium text-left hover:border-vailo-gold/40 hover:bg-vailo-gold/10 transition-all"
                      >
                        <MapPin size={16} className="text-vailo-gold shrink-0 mt-0.5" />
                        <span>
                          {place.label}
                          {place.distanceFromPropertyKm != null && (
                            <span className="block text-sm font-normal text-white/55 mt-0.5">
                              {tf('aiExpertKmFromProperty', {
                                km: Math.round(place.distanceFromPropertyKm),
                                name: getPropertyDisplayName(),
                              })}
                            </span>
                          )}
                        </span>
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setLocationCandidates([])}
                      className="text-sm text-white/55 hover:text-white mt-1 text-left transition-colors min-h-[44px]"
                    >
                      {t('aiExpertTryDifferentSpelling')}
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    <button
                      onClick={() => advanceStep('LOCATION', getNearPropertyLabel(), getNearPropertyLabel())}
                      className="group flex items-center gap-3 bg-white/8 border border-white/15 text-white px-4 py-4 min-h-[48px] rounded-xl text-base font-medium text-left hover:border-vailo-gold/40 hover:bg-vailo-gold/10 transition-all"
                    >
                      <MapPin size={16} className="text-vailo-gold shrink-0" />
                      {getPropertyDisplayName()}
                    </button>
                    <div className="relative">
                      <p className="text-sm text-white/60 mb-2 text-center">{t('aiExpertOrEnterTown')}</p>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={customLoc}
                          onChange={(e) => setCustomLoc(e.target.value)}
                          placeholder={t('aiExpertLocationPlaceholder')}
                          className="guest-input flex-1 bg-white/8 border border-white/15 text-white placeholder:text-white/40 focus:border-vailo-gold/50 focus:ring-2 focus:ring-vailo-gold/15 transition-shadow"
                        />
                        <button
                          disabled={!customLoc.trim()}
                          onClick={() => advanceStep('LOCATION', customLoc, customLoc)}
                          className={`px-5 min-h-[48px] rounded-xl text-base ${AI_EXPERT_BTN_PRIMARY}`}
                        >
                          {t('aiExpertSet')}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {step === 'CATEGORIES' && (
              <div className={AI_EXPERT_PANEL}>
                <p className={AI_EXPERT_PANEL_TITLE}>{t('aiExpertCategoriesTitle')}</p>
                <p className={AI_EXPERT_PANEL_SUB}>{t('aiExpertCategoriesSub')}</p>
                <div className="flex flex-wrap gap-2 mb-5">
                  {categoriesLoading && availableCategories.length === 0 ? (
                    <p className="text-sm text-white/50 flex items-center gap-2">
                      <Loader2 size={14} className="animate-spin text-vailo-gold" /> {t('aiExpertLoadingCategories')}
                    </p>
                  ) : availableCategories.length > 0 ? (
                    availableCategories.map((cat) => (
                      <button
                        key={cat.primary}
                        onClick={() =>
                          setSelectedCats((prev) =>
                            prev.includes(cat.primary)
                              ? prev.filter((c) => c !== cat.primary)
                              : prev.length < 3
                                ? [...prev, cat.primary]
                                : prev
                          )
                        }
                        className={`guest-pill px-4 py-2.5 rounded-full text-sm font-semibold transition-all border ${
                          selectedCats.includes(cat.primary)
                            ? AI_EXPERT_BTN_PRIMARY_PILL
                            : 'bg-white/8 text-white/80 border-white/15 hover:border-vailo-gold/40'
                        }`}
                      >
                        {cat.label}
                      </button>
                    ))
                  ) : (
                    <p className="text-sm text-white/60 leading-relaxed">
                      {areaConfigIssue === 'invalid-master' ? (
                        tf('aiExpertAreaInvalidMaster', { area: invalidMasterAreaRaw })
                      ) : areaConfigIssue === 'missing' ? (
                        t('aiExpertAreaMissing')
                      ) : listingAreaCtx ? (
                        tf('aiExpertAreaNoCategories', {
                          masterArea: listingAreaCtx.masterArea,
                          country: listingAreaCtx.country,
                        })
                      ) : null}
                    </p>
                  )}
                </div>
                <button
                  disabled={selectedCats.length === 0}
                  onClick={() =>
                    advanceStep(
                      'CATEGORIES',
                      selectedCats,
                      selectedCats
                        .map(
                          (p) =>
                            availableCategories.find((c) => c.primary === p)?.label ?? p
                        )
                        .join(', ')
                    )
                  }
                  className={`w-full py-4 min-h-[48px] rounded-xl text-base disabled:opacity-40 ${AI_EXPERT_BTN_PRIMARY}`}
                >
                  {tf('aiExpertContinueSelected', { count: selectedCats.length })}
                </button>
              </div>
            )}

            {step === 'DISTANCE' && (
              <div className={AI_EXPERT_PANEL}>
                <p className={AI_EXPERT_PANEL_TITLE}>{t('aiExpertDistanceTitle')}</p>
                <p className={AI_EXPERT_PANEL_SUB}>
                  {tf('aiExpertDistanceSub', { location: preferences.location })}
                </p>
                <div className="flex flex-col gap-2.5">
                  {dynamicDistances.length > 0 ? (
                    dynamicDistances.map((dist, i) => (
                      <button
                        key={i}
                        onClick={() => advanceStep('DISTANCE', dist, dist)}
                        className="flex items-center gap-3 bg-white/8 border border-white/15 text-white px-4 py-4 min-h-[48px] rounded-xl text-base font-medium text-left hover:border-vailo-gold/40 hover:bg-vailo-gold/10 transition-all"
                      >
                        <Compass size={16} className="text-vailo-gold shrink-0" />
                        {tf('aiExpertWithinDistance', { distance: dist })}
                      </button>
                    ))
                  ) : (
                    <div className="flex items-center text-sm text-white/60 py-4 px-2">
                      <Loader2 size={16} className="animate-spin mr-2 text-vailo-gold" />
                      {t('aiExpertMappingDistances')}
                    </div>
                  )}
                </div>
              </div>
            )}

            {step === 'TIME' && (
              <div className={AI_EXPERT_PANEL}>
                <p className={AI_EXPERT_PANEL_TITLE}>{t('aiExpertTimeTitle')}</p>

                {timeChoiceMode === 'choose' ? (
                  <div className="flex flex-col gap-2.5 mt-4">
                    <button
                      type="button"
                      onClick={() => executePlan('')}
                      className={`w-full py-4 min-h-[48px] rounded-xl text-base flex items-center justify-center gap-2 ${AI_EXPERT_BTN_PRIMARY}`}
                    >
                      <Heart size={16} className="text-white shrink-0" />
                      {t('aiExpertBrowseFavoritesBtn')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setTimeChoiceMode('timeline')}
                      className={`w-full py-4 min-h-[48px] rounded-xl text-base flex items-center justify-center gap-2 ${AI_EXPERT_BTN_SECONDARY}`}
                    >
                      <Clock size={16} className="text-vailo-gold shrink-0" />
                      {t('aiExpertPlanTimelineBtn')}
                    </button>
                  </div>
                ) : (
                  <>
                    <p className={AI_EXPERT_PANEL_SUB}>{t('aiExpertTimeSub')}</p>

                    <p className="guest-eyebrow text-white/45 mb-2">
                      {t('aiExpertStartDay')}
                    </p>
                    <div className="grid grid-cols-3 gap-2 mb-5">
                      {START_TIME_OPTIONS.map((timeOption) => (
                        <button
                          key={timeOption}
                          type="button"
                          onClick={() => {
                            setStartTime(timeOption);
                            if (tripDurationHours == null) setTripDurationHours(6);
                          }}
                          className={`w-full px-2 py-2.5 min-h-[40px] rounded-xl text-sm font-semibold transition-all border ${
                            startTime === timeOption
                              ? AI_EXPERT_BTN_PRIMARY_PILL
                              : 'bg-white/8 text-white/80 border-white/15 hover:border-vailo-gold/40'
                          }`}
                        >
                          {formatTime12(parseTimeToMinutes(timeOption))}
                        </button>
                      ))}
                    </div>

                    {startTime && (
                      <>
                        <p className="guest-eyebrow text-white/45 mb-2">
                          {t('aiExpertHowLongOut')}
                        </p>
                        <div className="grid grid-cols-3 gap-2 mb-4">
                          {getReturnDurationOptions(startTime).map((opt) => (
                            <button
                              key={opt.hours}
                              type="button"
                              onClick={() => setTripDurationHours(opt.hours)}
                              className={`w-full px-2 py-2.5 min-h-[40px] rounded-xl text-sm font-semibold transition-all border ${
                                tripDurationHours === opt.hours
                                  ? AI_EXPERT_BTN_PRIMARY_PILL
                                  : 'bg-white/8 text-white/80 border-white/15 hover:border-vailo-gold/40'
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                        {tripDurationHours != null && (
                          <p className="text-sm text-white/75 mb-4 px-3 py-2.5 rounded-xl bg-white/8 border border-white/10 leading-relaxed">
                            {formatTripWindow(startTime, tripDurationHours)}
                          </p>
                        )}
                      </>
                    )}

                    <div className="flex flex-col gap-2.5 pt-4 border-t border-white/10">
                      <button
                        type="button"
                        disabled={!startTime || tripDurationHours == null}
                        onClick={() => executePlan('timeline')}
                        className={`w-full py-4 min-h-[48px] rounded-xl text-base disabled:opacity-40 flex items-center justify-center gap-2 ${AI_EXPERT_BTN_PRIMARY}`}
                      >
                        <Clock size={16} className="text-white shrink-0" />
                        {t('aiExpertPlanTimelineBtn')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setTimeChoiceMode('choose')}
                        className="w-full py-3 min-h-[44px] rounded-xl text-sm font-semibold text-white/70 hover:text-white transition-colors"
                      >
                        {t('aiExpertBackAria')}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
            
          </div>
        )}

        {renderThinkingLoader()}
        
        <div ref={messagesEndRef} />
      </div>

      <div className="bg-vailo-teal-hover/95 backdrop-blur-sm p-3 md:p-4 shrink-0 border-t border-white/10 z-20 relative">
        <form onSubmit={handleChatSubmit} className="flex gap-2 items-end">
          <textarea
            ref={chatTextareaRef}
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onInput={resizeChatTextarea}
            onKeyDown={handleChatKeyDown}
            disabled={isThinking}
            rows={1}
            placeholder={t('aiExpertChatPlaceholder')}
            aria-label={t('aiExpertChatAria')}
            className="flex-1 text-base leading-normal px-4 py-2.5 rounded-xl outline-none bg-white/10 border border-white/15 text-white placeholder:text-white/40 focus:ring-2 focus:ring-vailo-gold/25 focus:border-vailo-gold/40 transition-[height,box-shadow] disabled:opacity-50 resize-none overflow-y-auto max-h-32"
          />
          <button
            type="submit"
            disabled={!chatInput.trim() || isThinking}
            className={`min-h-[48px] min-w-[48px] p-3 rounded-xl flex items-center justify-center shrink-0 self-end ${AI_EXPERT_BTN_PRIMARY}`}
            aria-label={t('aiExpertSendAria')}
          >
            <Send size={20} />
          </button>
        </form>
        <p className="text-center text-xs text-white/40 mt-2.5 leading-relaxed">
          {t('aiExpertChatDisclaimer')}
        </p>
      </div>

    </div>
  );
}