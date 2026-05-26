import { useState, useEffect, useRef } from 'react';
import { collection, getDocs, onSnapshot } from 'firebase/firestore';
import { areaNameToId } from '../../lib/areaUtils';
import { getGenerativeModel } from "firebase/ai";
import { ai, db } from '../../lib/firebase';
import {
  resolveCustomLocation,
  enrichPlanWithMapLinks,
  getItemMapLinks,
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
import PlanOverviewMap from '../../components/guest/PlanOverviewMap';
import ExpandableDescription from '../../components/guest/ExpandableDescription';
import PlanImage from '../../components/guest/PlanImage';
import PickFeedbackButtons from '../../components/guest/PickFeedbackButtons';
import { Sparkles, ArrowLeft, Navigation, Clock, MapPin, Send, Loader2, Map as MapIcon, Compass, Heart, Eye } from 'lucide-react';

const WIZARD_STEPS = [
  { key: 'LOCATION', label: 'Starting point' },
  { key: 'CATEGORIES', label: 'Your interests' },
  { key: 'DISTANCE', label: 'Travel range' },
  { key: 'TIME', label: 'Your day' },
] as const;

interface AiExpertViewProps {
  onClose: () => void;
  property: any;
  propertyType?: any;
  features: any[];
  gems: any[];
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

const getReturnDurationOptions = (startTime: string) => {
  const startMin = parseTimeToMinutes(startTime);
  const maxHours = (MAX_RETURN_MINUTES - startMin) / 60;
  const presets = [
    { label: '3 hours', hours: 3 },
    { label: '4 hours', hours: 4 },
    { label: '5 hours', hours: 5 },
    { label: '6 hours', hours: 6 },
    { label: '8 hours', hours: 8 },
    { label: '10 hours', hours: 10 },
    { label: '12 hours', hours: 12 },
  ];
  const options = presets.filter((p) => p.hours <= maxHours);
  const hoursToMorning = (MAX_RETURN_MINUTES - startMin) / 60;
  if (hoursToMorning >= 3) {
    options.push({ label: 'Until 5:30 AM', hours: Math.round(hoursToMorning * 10) / 10 });
  }
  return options;
};

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

export default function AiExpertView({ onClose, property, propertyType, features, gems }: AiExpertViewProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [step, setStep] = useState<Step>('LOCATION');
  const [chatInput, setChatInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [thinkingLabel, setThinkingLabel] = useState('Curating your local recommendations…');
  const [locationCandidates, setLocationCandidates] = useState<GeocodedPlace[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [listingAreaCtx, setListingAreaCtx] = useState<ListingAreaContext | null>(null);
  const [areaConfigIssue, setAreaConfigIssue] = useState<AreaConfigIssue>(null);
  const [invalidMasterAreaRaw, setInvalidMasterAreaRaw] = useState('');
  const [dynamicDistances, setDynamicDistances] = useState<string[]>([]);
  
  // 🌟 NEW: State to hold the dynamically fetched Village/Municipality name
  const [richLocationName, setRichLocationName] = useState<string>('');
  const [discoveredPlaces, setDiscoveredPlaces] = useState<any[]>([]);

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
    if (!name) return typeName || 'your stay';
    return typeName ? `${name}, ${typeName}` : name;
  };

  const getNearPropertyLabel = () => {
    const name = property?.propertyName;
    const typeName = getPropertyTypeName();
    if (!name) return 'Near your property';
    return typeName ? `Near ${name}, ${typeName}` : `Near ${name}`;
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
        const names = gemsCatSnap.docs
          .map((d) => d.data().name)
          .filter((name): name is string => typeof name === 'string' && name.trim().length > 0)
          .map((name) => name.trim());

        setAvailableCategories(Array.from(new Set(names)).sort((a, b) => a.localeCompare(b)));
      } catch (error) {
        console.error('Failed to fetch local gem categories:', error);
        setAvailableCategories([]);
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
  }, [property, propertyType]);

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
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, step, dynamicDistances]);

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
        typeof preferences.location === 'string' && preferences.location.startsWith('Near'),
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
        message: `I apologize, but "${placeLabel}" cannot be reached by driving from ${getPropertyDisplayName()}. Please select a different starting point.`,
      };
    }

    if (distance > 120) {
      return {
        ok: false,
        message: `I apologize, but "${placeLabel}" is too far (${Math.round(distance)}km) for a day trip. Please select a starting point closer to ${getPropertyDisplayName()}.`,
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
    setThinkingLabel('Verifying location...');
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
      setThinkingLabel('Curating your local recommendations…');
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

    if (!startCoords || isNaN(maxKmLimit)) {
      return {
        gems: gems?.map(g => ({ name: g.name, category: g.category, distance: g.distanceKm ? `${g.distanceKm}km` : 'Local', description: g.description, photoUrl: g.photoUrl || '', googleMapsUrl: g.googleMapsUrl || '' })) || [],
        features: features?.map(f => ({ name: f.businessName || f.name, category: f.categories?.join(', '), distance: 'Local', description: f.description, photoUrl: f.photoUrl || '', googleMapsUrl: f.googleMapsUrl || '' })) || []
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
      gems: filteredGems.map(g => ({ name: g.name, category: g.category, distance: g.calculatedKm !== null ? `${g.calculatedKm.toFixed(1)}km` : (g.distanceKm ? `${g.distanceKm}km` : 'Local'), description: g.description, photoUrl: g.photoUrl || '', googleMapsUrl: g.googleMapsUrl || '' })),
      features: filteredFeatures.map(f => ({ name: f.businessName || f.name, category: f.categories?.join(', '), distance: f.calculatedKm !== null ? `${f.calculatedKm.toFixed(1)}km` : 'Local', description: f.description, photoUrl: f.photoUrl || '', googleMapsUrl: f.googleMapsUrl || '' }))
    };
  };

  const advanceStep = async (currentStep: Step, value: any, displayText: string) => {
    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', type: 'selection', text: displayText }]);

    if (currentStep === 'LOCATION') {
      const nearPropertyLabel = getNearPropertyLabel();
      const isNearProperty = value === nearPropertyLabel;
      let locCoords: { lat: number, lng: number } | null = null;
      let locFullName = '';
      
      if (!isNearProperty) {
        setIsThinking(true);
        setThinkingLabel('Finding your starting point...');
        try {
          const { coords: propCoords, country, cityArea } = getLocationContext();
          const resolved = await resolveCustomLocation(value, { propCoords, country, cityArea });

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
              { propCoords, country, cityArea }
            );
            if (nearby.type === 'choose' || nearby.type === 'single') {
              const candidates =
                nearby.type === 'choose'
                  ? nearby.candidates
                  : [nearby.place];
              setLocationCandidates(candidates);
              setMessages((prev) => [
                ...prev,
                { id: Date.now().toString(), role: 'ai', type: 'text', text: `${check.message}\n\nDid you mean one of these?` },
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
            { id: Date.now().toString(), role: 'ai', type: 'text', text: 'I had trouble verifying that location. Please try again.' },
          ]);
          return;
        } finally {
          setIsThinking(false);
          setThinkingLabel('Curating your local recommendations…');
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
        const isNearProperty = typeof preferences.location === 'string' && preferences.location.startsWith('Near');
        
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
      : 'Browse at my own pace';
    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', type: 'selection', text: selectionLabel }]);
    
    setStep('DONE');
    setIsThinking(true);
    setThinkingLabel('Curating your local recommendations…');

    try {
      const aiTimeFrame = timeFrameStr
        ? (() => {
            const { end24 } = computeEndFromDuration(startTime, tripDurationHours ?? 6);
            return `${startTime} to ${end24}`;
          })()
        : '';

      const { fullLocationContext, coords: propCoords } = getLocationContext();
      const startCoords = getStartCoords();
      const isNearProperty = typeof preferences.location === 'string' && preferences.location.startsWith('Near');
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

      const recentlyShown = getRecentlyShownKeys();
      const filteredDatabase = getFilteredDbSummary(distanceLimitNum, startCoords, recentlyShown);
      const isFlexiblePicks = !timeFrameStr;

      const picksDbContext = isFlexiblePicks
        ? buildFlexiblePicksDbContext(
            preferences.categories,
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

Rules:
- HARD DISTANCE LIMIT: NEVER suggest a place farther than ${hardCapKm.toFixed(0)}km from the starting point. If you cannot think of a real, named local place within that limit, return FEWER items — never pad with far-away alternatives. A small radius (e.g. 9km) must never return a 200km+ suggestion.
- 50 / 50 SPLIT: When the VAILO DATABASE has items in the requested categories, mix roughly half host-curated database picks with half your own AI picks of specific, real, named businesses or natural landmarks LOCALS actually use. Never pad with duplicates and never repeat a business that is already in the database pool.
- AI picks must be specific NAMED places (e.g. "Taverna O Manolis", "Imbros Gorge"). Never suggest a generic area, town centre, or "best of" list. If you are not sure a specific place exists in the radius, skip it.
- Leave googleMapsUrl and photoUrl EMPTY for AI picks — our system resolves the exact place link from your title + location.
- If you know an exact Google Place ID for an AI pick, include it as "googlePlaceId" — it makes the link point to that exact business.
- distanceKm is REQUIRED on every item and must be ≤ ${hardCapKm.toFixed(0)}.`;

      let promptText = `Starting point: "${startLocationName}" (GPS: ${gpsString}). Radius: ${distanceLimitNum}km (hard cap ${hardCapKm.toFixed(0)}km). Categories: ${preferences.categories.join(', ')}.

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
          preferences.categories,
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

      // Render the plan immediately — feels instant. Photos fill in next.
      const planMessageId = `${Date.now()}-plan`;
      setMessages(prev => [...prev, { id: planMessageId, role: 'ai', type: 'plan', data: initialPlan }]);
      setIsThinking(false);

      // Record which DB items we just showed so they get rotated out next time.
      markItemsShown(collectDbItemsFromPlan(initialPlan));

      // Background photo enrichment — updates the same message when ready.
      enrichPhotosInBackground(initialPlan, startCoords)
        .then((withPhotos) => {
          let finalPlan = withPhotos;
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
          setMessages(prev =>
            prev.map(m => (m.id === planMessageId ? { ...m, data: finalPlan } : m))
          );
        })
        .catch((err) => {
          console.error('Background photo enrichment failed:', err);
        });

    } catch (error: any) {
      console.error('Critical AI Itinerary Error:', error);
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'ai', type: 'text', text: `I apologize, but I encountered an error while generating your plan. Error Details: ${error.message}. Please try asking a custom question below.` }]);
      setIsThinking(false);
    } finally {
      setThinkingLabel('Curating your local recommendations…');
    }
  };

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userText = chatInput;
    setChatInput('');
    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', type: 'text', text: userText }]);
    
    if (step !== 'DONE') setStep('DONE');
    
    setIsThinking(true);
    setThinkingLabel('Curating your local recommendations…');

    try {
      const { fullLocationContext } = getLocationContext();
      const startCoords = getStartCoords();
      const isNearProperty = typeof preferences.location === 'string' && preferences.location.startsWith('Near');
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
        setMessages(prev => [...prev, {
          id: Date.now().toString() + 'text',
          role: 'ai',
          type: 'text',
          text: parsedData.replyText,
        }]);
      }

      if (parsedData.hasPlan && parsedData.plan) {
        const mapAreaHint = getGeographicAreaHint() || startLocationName || preferences.location;
        let initialPlan = applyTimelinePropertyBookends(parsedData.plan, isNearProperty);
        initialPlan = await enrichForImmediateRender(initialPlan, mapAreaHint, startCoords);
        initialPlan = filterTimelinePlanByDistance(initialPlan, distanceLimitNum, startCoords, recentlyShown);
        initialPlan = scheduleTimelineIfNeeded(initialPlan, !!preferences.timeFrame);
        const planMessageId = Date.now().toString() + 'plan';
        setMessages(prev => [...prev, { id: planMessageId, role: 'ai', type: 'plan', data: initialPlan }]);
        setIsThinking(false);

        markItemsShown(collectDbItemsFromPlan(initialPlan));

        enrichPhotosInBackground(initialPlan, startCoords)
          .then((withPhotos) => {
            let filtered = filterTimelinePlanByDistance(withPhotos, distanceLimitNum, startCoords, recentlyShown);
            filtered = scheduleTimelineIfNeeded(filtered, !!preferences.timeFrame);
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
        text: "I'm having trouble connecting right now. Please try again in a moment.",
      }]);
      setIsThinking(false);
    } finally {
      setThinkingLabel('Curating your local recommendations…');
    }
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
    setMessages([
      { id: Date.now().toString(), role: 'ai', type: 'text', text: `welcome:${getPropertyDisplayName()}` },
    ]);
  };

  const renderMessage = (msg: Message) => {
    if (msg.role === 'user') {
      if (msg.type === 'selection') return null;
      return (
        <div key={msg.id} className="flex justify-end mb-5 animate-in fade-in slide-in-from-bottom-2">
          <div className="max-w-[90%] bg-[#0B4F5C] text-white px-4 py-3 rounded-2xl rounded-tr-md shadow-[0_4px_20px_rgba(11,79,92,0.2)] text-sm leading-relaxed whitespace-pre-wrap">
            {msg.text}
          </div>
        </div>
      );
    }

    const isWelcomeMessage =
      msg.type === 'text' && (msg.text?.startsWith('welcome:') || messages[0]?.id === msg.id);

    if (isWelcomeMessage) {
      const propertyNameOnly = property?.propertyName || 'your stay';
      const typeName = getPropertyTypeName();
      const area = getAreaName();

      return (
        <div key={msg.id} className="mb-6 animate-in fade-in slide-in-from-bottom-2">
          <div className="rounded-3xl overflow-hidden border border-[#C5A059]/15 shadow-[0_12px_40px_rgba(197,160,89,0.12)]">
            <div className="bg-gradient-to-br from-[#FFFCF7] via-white to-[#F4FAFA] px-5 py-4">
              <p className="text-[9px] font-bold text-[#C5A059] tracking-[0.2em] uppercase mb-1.5">
                You&apos;re in
              </p>
              <p className="font-luxury text-xl leading-snug text-[#051F26] font-medium">
                {propertyNameOnly}
              </p>
              {typeName && (
                <p className="text-xs font-semibold text-[#0B4F5C]/55 tracking-[0.12em] uppercase mt-1">
                  {typeName}
                </p>
              )}
              <div className="flex items-center gap-2 my-3">
                <div className="h-px flex-1 bg-gradient-to-r from-[#C5A059]/45 to-transparent" />
                <Sparkles size={11} className="text-[#C5A059]/70 shrink-0" />
              </div>
              <p className="text-sm text-[#0B4F5C]/90 leading-relaxed">
                Forget the guidebooks — I&apos;ll show you where people in {area} actually go. The tavernas they pick, the coves they keep quiet, the corners tourists walk past every day.
              </p>
              <p className="text-sm font-medium text-[#0B4F5C] mt-2.5 leading-relaxed">
                No tourist traps. Just real days. Where shall we begin?
              </p>
            </div>
          </div>
        </div>
      );
    }

    if (msg.type === 'plan' && msg.data) {
      const isPicks = msg.data.type === 'picks';

      return (
        <div key={msg.id} className="mb-8 animate-in fade-in slide-in-from-bottom-2">
          <div className="bg-white/90 backdrop-blur-sm border border-[#C5A059]/20 rounded-3xl overflow-hidden shadow-[0_12px_40px_rgba(11,79,92,0.08)]">
            <div className="bg-gradient-to-r from-[#0B4F5C] to-[#0a6574] px-5 py-4 text-white">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-white/10 rounded-xl shrink-0">
                  {isPicks ? <Heart size={18} className="text-[#C5A059]" /> : <Compass size={18} className="text-[#C5A059]" />}
                </div>
                <div>
                  <h3 className="font-semibold text-base tracking-tight">
                    {isPicks ? 'Local favorites, curated for you' : 'Your day, thoughtfully planned'}
                  </h3>
                  <p className="text-white/70 text-xs mt-1 leading-relaxed">
                    {isPicks
                      ? 'Places locals genuinely choose — not tourist traps. Ordered by distance from your starting point.'
                      : 'A timeline built around authentic local experiences, from departure to return.'}
                  </p>
                </div>
              </div>
            </div>

            <div className="p-5">
            {msg.data.type === 'timeline' && (
              <div className="space-y-6 pt-1">
                {msg.data.plan?.map((item: any, idx: number) => (
                  <div key={idx} className="relative pl-6 pb-6 border-l-2 border-[#C5A059]/30 last:border-0 last:pb-0">
                    <div className="absolute w-3 h-3 bg-[#C5A059] rounded-full -left-[7px] top-1 ring-4 ring-[#C5A059]/15" />
                    <p className="font-semibold text-[#0B4F5C] text-sm mb-2">{item.time}</p>
                    
                    <div className="bg-white border border-[#0B4F5C]/8 rounded-2xl overflow-hidden shadow-[0_4px_20px_rgba(11,79,92,0.06)]">
                      <div className="relative">
                        <PlanImage
                          src={item.photoUrl}
                          alt={item.title}
                          className="w-full h-36 object-cover"
                          fallbackClassName="w-full h-36"
                        />
                        {item.previouslyShown && (
                          <span className="absolute top-3 right-3 bg-white/90 text-[#0B4F5C] text-[9px] font-semibold px-2.5 py-1 rounded-full uppercase tracking-wider shadow-sm border border-[#0B4F5C]/15 flex items-center gap-1">
                            <Eye size={10} strokeWidth={2.2} /> Seen before
                          </span>
                        )}
                      </div>
                      <div className="p-4">
                        <h4 className="font-semibold text-gray-900 text-base flex flex-wrap items-center gap-2 mb-2">
                          {item.title}
                          {(item.isProperty || item.source === 'property') ? (
                            <span className="bg-[#0B4F5C]/10 text-[#0B4F5C] text-[9px] px-2 py-0.5 rounded-full uppercase tracking-wider font-semibold">
                              Your stay
                            </span>
                          ) : item.source === 'database' ? (
                            <span className="bg-[#C5A059]/12 text-[#8a6d2e] text-[9px] px-2 py-0.5 rounded-full uppercase tracking-wider font-semibold">
                              Vailo pick
                            </span>
                          ) : null}
                        </h4>
                        <ExpandableDescription
                          text={item.description}
                          lines={3}
                          className="mb-4"
                        />

                        <div className="flex items-center justify-between gap-2 pt-4 border-t border-[#0B4F5C]/8">
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
                          <div className="flex gap-2 flex-1">
                            {(() => {
                              const links = getItemMapLinks(item, mapAreaHint);
                              return (
                                <>
                                  <a href={links.googleMapsUrl} target="_blank" rel="noopener noreferrer" className="flex-1 py-2 bg-[#f8faf9] border border-[#0B4F5C]/10 hover:border-[#0B4F5C]/30 text-[#0B4F5C] rounded-lg text-[10px] font-semibold uppercase tracking-wider flex items-center justify-center transition-colors">
                                    <MapIcon size={13} className="mr-1" /> View
                                  </a>
                                  <a href={links.navigateUrl} target="_blank" rel="noopener noreferrer" className="flex-1 py-2 bg-[#0B4F5C] hover:bg-[#0a4550] text-white rounded-lg text-[10px] font-semibold uppercase tracking-wider flex items-center justify-center transition-colors shadow-sm">
                                    <Navigation size={13} className="mr-1" /> Go
                                  </a>
                                </>
                              );
                            })()}
                          </div>
                        </div>
                      </div>
                    </div>

                    {item.transportToNext && (
                      <div className="mt-3 inline-flex items-center text-xs font-medium text-[#0B4F5C]/60 bg-[#f8faf9] px-3 py-1.5 rounded-lg border border-[#0B4F5C]/8">
                        <Navigation size={12} className="mr-2 text-[#C5A059]" /> {item.transportToNext}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {msg.data.type === 'picks' && (
              <div className="space-y-8 pt-1">
                {msg.data.categories?.map((cat: any, idx: number) => (
                  <CategoryPickCarousel
                    key={idx}
                    categoryName={cat.categoryName}
                    items={cat.items || []}
                    mapAreaHint={mapAreaHint}
                    propertyId={property?.id}
                  />
                ))}
              </div>
            )}

            <PlanOverviewMap planData={msg.data} />

            <button
              onClick={planAnotherDay}
              className="w-full mt-6 py-3.5 bg-[#f8faf9] hover:bg-[#eef3f2] text-[#0B4F5C] font-semibold text-sm rounded-2xl transition-colors border border-[#0B4F5C]/10"
            >
              Plan another day
            </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div key={msg.id} className="mb-5 animate-in fade-in slide-in-from-bottom-2">
        <div className="bg-white border border-[#0B4F5C]/8 text-gray-700 px-4 py-3.5 rounded-2xl shadow-[0_4px_20px_rgba(11,79,92,0.06)] text-sm leading-relaxed whitespace-pre-wrap">
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
      step === 'TIME' && startTime && tripDurationHours != null && !hasSchedule;

    if (!hasLocation && !hasCategories && !hasDistance && !hasSchedule && !pendingSchedule) {
      return null;
    }

    return (
      <div className="mb-4 rounded-2xl border border-[#0B4F5C]/10 bg-white/80 backdrop-blur-sm overflow-hidden shadow-[0_4px_24px_rgba(11,79,92,0.06)]">
        <div className="px-4 py-2.5 bg-gradient-to-r from-[#0B4F5C]/5 to-[#C5A059]/5 border-b border-[#0B4F5C]/8">
          <p className="text-[10px] font-bold text-[#0B4F5C]/70 uppercase tracking-[0.18em]">Your choices</p>
        </div>
        <div className="px-4 py-3 space-y-2.5">
          {hasLocation && (
            <div className="flex items-start gap-2.5">
              <MapPin size={14} className="text-[#C5A059] shrink-0 mt-0.5" />
              <span className="text-sm text-[#0B4F5C] leading-snug">{preferences.location}</span>
            </div>
          )}
          {hasCategories && (
            <div className="flex flex-wrap gap-1.5 pl-6">
              {preferences.categories.map((cat) => (
                <span
                  key={cat}
                  className="text-[11px] px-2.5 py-1 rounded-full bg-[#0B4F5C]/8 text-[#0B4F5C] font-semibold"
                >
                  {cat}
                </span>
              ))}
            </div>
          )}
          {hasDistance && (
            <div className="flex items-center gap-2.5">
              <Compass size={14} className="text-[#C5A059] shrink-0" />
              <span className="text-sm text-[#0B4F5C]">Within {preferences.distance}</span>
            </div>
          )}
          {(hasSchedule || pendingSchedule) && (
            <div className="flex items-center gap-2.5">
              <Clock size={14} className="text-[#C5A059] shrink-0" />
              <span className="text-sm text-[#0B4F5C]">
                {hasSchedule
                  ? preferences.timeFrame === 'flexible'
                    ? 'Flexible · no fixed schedule'
                    : preferences.timeFrame
                  : formatTripWindow(startTime, tripDurationHours ?? 6)}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  };

  const wizardStepIndex = step === 'DONE' ? -1 : WIZARD_STEPS.findIndex((s) => s.key === step);

  const renderWizardProgress = () => {
    if (wizardStepIndex < 0) return null;
    return (
      <div className="mb-5 px-1">
        <div className="flex items-center justify-between mb-2">
          {WIZARD_STEPS.map((s, i) => (
            <div key={s.key} className="flex flex-col items-center flex-1">
              <div
                className={`w-2 h-2 rounded-full transition-colors ${
                  i <= wizardStepIndex ? 'bg-[#C5A059]' : 'bg-[#0B4F5C]/15'
                }`}
              />
              <span
                className={`text-[9px] mt-1.5 text-center leading-tight hidden sm:block ${
                  i === wizardStepIndex ? 'text-[#0B4F5C] font-semibold' : 'text-gray-400'
                }`}
              >
                {s.label}
              </span>
            </div>
          ))}
        </div>
        <div className="h-0.5 bg-[#0B4F5C]/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#C5A059] transition-all duration-500 rounded-full"
            style={{ width: `${((wizardStepIndex + 1) / WIZARD_STEPS.length) * 100}%` }}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gradient-to-b from-[#f4f7f6] to-[#eef2f1] md:relative md:h-[800px] md:rounded-3xl md:overflow-hidden md:shadow-2xl md:border md:border-[#0B4F5C]/5">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;0,600;1,400;1,500&display=swap');
        .font-luxury { font-family: 'Lora', serif; }
      `}</style>

      <div className="relative shrink-0 overflow-hidden border-b border-[#0B4F5C]/8">
        <div className="absolute inset-0 bg-gradient-to-br from-[#EAF2F2] via-white to-[#FDF9F3]" />
        <div className="absolute inset-0 bg-[radial-gradient(#0B4F5C_1px,transparent_1px)] [background-size:28px_28px] opacity-[0.04]" />
        <div className="absolute -top-12 -right-8 w-44 h-44 bg-[#C5A059]/14 blur-3xl rounded-full pointer-events-none" />
        <div className="absolute -bottom-10 -left-10 w-36 h-36 bg-[#0B4F5C]/10 blur-3xl rounded-full pointer-events-none" />

        <div className="relative px-4 py-3.5 flex items-center gap-3">
          <button
            onClick={onClose}
            className="h-10 w-10 flex items-center justify-center rounded-full bg-white/90 border border-[#0B4F5C]/10 text-[#0B4F5C] shadow-[0_2px_12px_rgba(11,79,92,0.08)] hover:border-[#C5A059]/35 hover:shadow-md transition-all"
            aria-label="Go back"
          >
            <ArrowLeft size={18} />
          </button>

          <div className="flex-1 min-w-0">
            <p className="text-[9px] font-bold text-[#C5A059] tracking-[0.24em] uppercase">
              Vailo Concierge
            </p>
            <h2 className="font-luxury text-[1.35rem] leading-tight text-[#051F26] font-medium mt-0.5">
              Live Like a <span className="text-[#0B4F5C] italic">Local</span>
            </h2>
          </div>

          <img
            src="../../../vailoLogo.png"
            alt="Vailo"
            className="h-9 w-auto shrink-0 drop-shadow-sm hidden sm:block"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 [scrollbar-width:thin] flex flex-col">
        {messages.map(renderMessage)}

        {!isThinking && step !== 'DONE' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 mt-1 max-w-full">
            {renderWizardSummary()}
            {renderWizardProgress()}
            
            {step === 'LOCATION' && (
              <div className="bg-white rounded-2xl border border-[#0B4F5C]/8 p-5 shadow-[0_8px_30px_rgba(11,79,92,0.06)]">
                <p className="text-sm font-semibold text-[#0B4F5C] mb-1">Where does your day begin?</p>
                <p className="text-xs text-gray-500 mb-4">Your starting point shapes every recommendation we make.</p>
                {locationCandidates.length > 0 ? (
                  <div className="flex flex-col gap-2.5">
                    <p className="text-xs text-gray-500 mb-1">Which location did you mean?</p>
                    {locationCandidates.map((place) => (
                      <button
                        key={`${place.lat}-${place.lng}`}
                        onClick={() => confirmLocationChoice(place, place.label)}
                        className="group flex items-start gap-3 bg-[#f8faf9] border border-[#0B4F5C]/10 text-[#0B4F5C] px-4 py-3.5 rounded-xl text-sm font-medium text-left hover:border-[#C5A059]/40 hover:bg-[#C5A059]/5 transition-all"
                      >
                        <MapPin size={16} className="text-[#C5A059] shrink-0 mt-0.5" />
                        <span>
                          {place.label}
                          {place.distanceFromPropertyKm != null && (
                            <span className="block text-[11px] font-normal text-gray-500 mt-0.5">
                              ~{Math.round(place.distanceFromPropertyKm)} km from {getPropertyDisplayName()}
                            </span>
                          )}
                        </span>
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setLocationCandidates([])}
                      className="text-xs text-[#0B4F5C]/60 hover:text-[#0B4F5C] mt-1 text-left transition-colors"
                    >
                      Try a different spelling
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    <button
                      onClick={() => advanceStep('LOCATION', getNearPropertyLabel(), getNearPropertyLabel())}
                      className="group flex items-center gap-3 bg-[#f8faf9] border border-[#0B4F5C]/10 text-[#0B4F5C] px-4 py-3.5 rounded-xl text-sm font-medium text-left hover:border-[#C5A059]/40 hover:bg-[#C5A059]/5 transition-all"
                    >
                      <MapPin size={16} className="text-[#C5A059] shrink-0" />
                      {getPropertyDisplayName()}
                    </button>
                    <div className="relative">
                      <p className="text-[11px] text-gray-400 mb-2 text-center">or enter a town or village</p>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={customLoc}
                          onChange={(e) => setCustomLoc(e.target.value)}
                          placeholder="i.e location, area"
                          className="flex-1 px-4 py-3 bg-white border border-[#0B4F5C]/10 rounded-xl text-sm outline-none focus:border-[#C5A059]/50 focus:ring-2 focus:ring-[#C5A059]/15 transition-shadow"
                        />
                        <button
                          disabled={!customLoc.trim()}
                          onClick={() => advanceStep('LOCATION', customLoc, customLoc)}
                          className="px-5 bg-[#0B4F5C] text-white font-semibold rounded-xl disabled:opacity-40 hover:bg-[#0a4550] transition-colors"
                        >
                          Set
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {step === 'CATEGORIES' && (
              <div className="bg-white rounded-2xl border border-[#0B4F5C]/8 p-5 shadow-[0_8px_30px_rgba(11,79,92,0.06)]">
                <p className="text-sm font-semibold text-[#0B4F5C] mb-1">What would locals choose today?</p>
                <p className="text-xs text-gray-500 mb-4">Select up to three interests — we will surface the places residents actually go.</p>
                <div className="flex flex-wrap gap-2 mb-5">
                  {categoriesLoading && availableCategories.length === 0 ? (
                    <p className="text-xs text-gray-400 flex items-center gap-2">
                      <Loader2 size={14} className="animate-spin" /> Loading local categories…
                    </p>
                  ) : availableCategories.length > 0 ? (
                    availableCategories.map((cat) => (
                      <button
                        key={cat}
                        onClick={() =>
                          setSelectedCats((prev) =>
                            prev.includes(cat)
                              ? prev.filter((c) => c !== cat)
                              : prev.length < 3
                                ? [...prev, cat]
                                : prev
                          )
                        }
                        className={`px-3.5 py-2 rounded-full text-xs font-semibold transition-all border ${
                          selectedCats.includes(cat)
                            ? 'bg-[#0B4F5C] text-white border-[#0B4F5C] shadow-md'
                            : 'bg-[#f8faf9] text-[#0B4F5C]/70 border-[#0B4F5C]/10 hover:border-[#C5A059]/40'
                        }`}
                      >
                        {cat}
                      </button>
                    ))
                  ) : (
                    <p className="text-xs text-gray-500 leading-relaxed">
                      {areaConfigIssue === 'invalid-master' ? (
                        <>
                          City/Master Area on this listing is set to &ldquo;{invalidMasterAreaRaw}&rdquo;,
                          which is not a configured region in Area Functionality. Set it to the master
                          area (e.g. Chania) on the property listing — not the neighborhood or street
                          address.
                        </>
                      ) : areaConfigIssue === 'missing' ? (
                        <>
                          This listing is missing Country or City/Master Area. Your host must set both
                          on the property listing (e.g. Greece and Chania).
                        </>
                      ) : listingAreaCtx ? (
                        <>
                          No Local Gems categories are configured for {listingAreaCtx.masterArea},{' '}
                          {listingAreaCtx.country} yet. Your host can add them in Area Functionality →
                          Local Gems Categories.
                        </>
                      ) : null}
                    </p>
                  )}
                </div>
                <button
                  disabled={selectedCats.length === 0}
                  onClick={() => advanceStep('CATEGORIES', selectedCats, selectedCats.join(', '))}
                  className="w-full py-3.5 bg-[#C5A059] hover:bg-[#b8924f] text-white rounded-xl text-sm font-semibold disabled:opacity-40 transition-colors shadow-sm"
                >
                  Continue · {selectedCats.length} selected
                </button>
              </div>
            )}

            {step === 'DISTANCE' && (
              <div className="bg-white rounded-2xl border border-[#0B4F5C]/8 p-5 shadow-[0_8px_30px_rgba(11,79,92,0.06)]">
                <p className="text-sm font-semibold text-[#0B4F5C] mb-1">How far will you venture?</p>
                <p className="text-xs text-gray-500 mb-4">
                  From <span className="font-medium text-[#0B4F5C]">{preferences.location}</span> — locals know the best spots are often closer than you think.
                </p>
                <div className="flex flex-col gap-2.5">
                  {dynamicDistances.length > 0 ? (
                    dynamicDistances.map((dist, i) => (
                      <button
                        key={i}
                        onClick={() => advanceStep('DISTANCE', dist, dist)}
                        className="flex items-center gap-3 bg-[#f8faf9] border border-[#0B4F5C]/10 text-[#0B4F5C] px-4 py-3.5 rounded-xl text-sm font-medium text-left hover:border-[#C5A059]/40 hover:bg-[#C5A059]/5 transition-all"
                      >
                        <Compass size={16} className="text-[#C5A059] shrink-0" />
                        Within {dist}
                      </button>
                    ))
                  ) : (
                    <div className="flex items-center text-sm text-gray-500 py-4 px-2">
                      <Loader2 size={16} className="animate-spin mr-2 text-[#C5A059]" />
                      Mapping distances from your starting point…
                    </div>
                  )}
                </div>
              </div>
            )}

            {step === 'TIME' && (
              <div className="bg-white rounded-2xl border border-[#0B4F5C]/8 p-5 shadow-[0_8px_30px_rgba(11,79,92,0.06)]">
                <p className="text-sm font-semibold text-[#0B4F5C] mb-1">How would you like to explore?</p>
                <p className="text-xs text-gray-500 mb-4">
                  Pick a start time and how long you&apos;re out — we&apos;ll build your day around it.
                </p>

                <p className="text-[10px] font-semibold text-[#0B4F5C]/50 uppercase tracking-wider mb-2">
                  Start your day
                </p>
                <div className="flex flex-wrap gap-2 mb-5">
                  {START_TIME_OPTIONS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => {
                        setStartTime(t);
                        if (tripDurationHours == null) setTripDurationHours(6);
                      }}
                      className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all border ${
                        startTime === t
                          ? 'bg-[#0B4F5C] text-white border-[#0B4F5C] shadow-sm'
                          : 'bg-[#f8faf9] text-[#0B4F5C]/75 border-[#0B4F5C]/10 hover:border-[#C5A059]/40'
                      }`}
                    >
                      {formatTime12(parseTimeToMinutes(t))}
                    </button>
                  ))}
                </div>

                {startTime && (
                  <>
                    <p className="text-[10px] font-semibold text-[#0B4F5C]/50 uppercase tracking-wider mb-2">
                      How long are you out?
                    </p>
                    <div className="flex flex-wrap gap-2 mb-4">
                      {getReturnDurationOptions(startTime).map((opt) => (
                        <button
                          key={opt.hours}
                          type="button"
                          onClick={() => setTripDurationHours(opt.hours)}
                          className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all border ${
                            tripDurationHours === opt.hours
                              ? 'bg-[#C5A059] text-white border-[#C5A059] shadow-sm'
                              : 'bg-[#f8faf9] text-[#0B4F5C]/75 border-[#0B4F5C]/10 hover:border-[#C5A059]/40'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    {tripDurationHours != null && (
                      <p className="text-xs text-[#0B4F5C]/70 mb-4 px-3 py-2 rounded-xl bg-[#f8faf9] border border-[#0B4F5C]/8">
                        {formatTripWindow(startTime, tripDurationHours)}
                      </p>
                    )}
                  </>
                )}

                <div className="flex flex-col gap-2.5 pt-4 border-t border-[#0B4F5C]/8">
                  <button
                    disabled={!startTime || tripDurationHours == null}
                    onClick={() => executePlan('timeline')}
                    className="w-full py-3.5 bg-[#0B4F5C] hover:bg-[#0a4550] text-white rounded-xl text-sm font-semibold disabled:opacity-40 transition-colors shadow-sm flex items-center justify-center gap-2"
                  >
                    <Clock size={16} />
                    Plan my day with a timeline
                  </button>
                  <button
                    onClick={() => executePlan('')}
                    className="w-full py-3.5 bg-[#f8faf9] text-[#0B4F5C]/80 hover:text-[#0B4F5C] hover:bg-[#eef3f2] rounded-xl text-sm font-semibold transition-colors border border-[#0B4F5C]/10"
                  >
                    Browse local favorites · no fixed schedule
                  </button>
                </div>
              </div>
            )}
            
          </div>
        )}

        {isThinking && (
          <div className="flex items-center gap-2 text-sm text-[#0B4F5C] font-medium mt-4 bg-white/80 backdrop-blur-sm px-4 py-3 rounded-2xl w-max border border-[#C5A059]/20 shadow-sm">
            <Loader2 size={16} className="animate-spin text-[#C5A059]" />
            {thinkingLabel}
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      <div className="bg-white/95 backdrop-blur-sm p-3 md:p-4 shrink-0 shadow-[0_-8px_30px_rgba(11,79,92,0.06)] border-t border-[#0B4F5C]/8 z-20 relative">
        <form onSubmit={handleChatSubmit} className="flex gap-2">
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            disabled={isThinking}
            placeholder="Ask about a place, refine your plan, or request alternatives…"
            className="flex-1 bg-[#f8faf9] border border-[#0B4F5C]/10 text-gray-900 text-sm rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#C5A059]/25 focus:border-[#C5A059]/40 transition-shadow disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!chatInput.trim() || isThinking}
            className="bg-[#0B4F5C] text-white p-3 rounded-xl hover:bg-[#0a4550] disabled:opacity-40 transition-colors shadow-sm flex items-center justify-center"
          >
            <Send size={18} />
          </button>
        </form>
        <p className="text-center text-[10px] text-gray-400 mt-2.5 leading-relaxed">
          Recommendations reflect local knowledge. Always verify opening hours and routes before you go.
        </p>
      </div>

    </div>
  );
}