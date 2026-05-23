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
  normalizeFlexiblePicksPlan,
  PICKS_PER_CATEGORY,
} from '../../lib/flexiblePicks';
import CategoryPickCarousel from '../../components/guest/CategoryPickCarousel';
import { Sparkles, ArrowLeft, Navigation, Clock, MapPin, Send, Loader2, Map as MapIcon, Image as ImageIcon, Compass, Heart } from 'lucide-react';

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

  const getAreaName = () =>
    propertyType?.city || propertyType?.area || property?.city || property?.area || 'the region';

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
      const country = propertyType?.country || property?.country || 'Greece';
      const areaName = propertyType?.city || propertyType?.area || property?.city || property?.area || '';
      const areaId = areaNameToId(areaName);

      if (areaId && country) {
        try {
          const aiRef = collection(db, 'countries', country, 'areas', areaId, 'aiCategories');
          const aiSnap = await getDocs(aiRef);
          const aiCats = aiSnap.docs.map(d => d.data().name).filter(Boolean);
          setAvailableCategories(Array.from(new Set(aiCats)).sort());
        } catch (error) {
          console.error("Failed to fetch AI Categories:", error);
        }
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
    const country = propertyType?.country || property?.country || 'Greece';
    const areaName = propertyType?.city || propertyType?.area || property?.city || property?.area || '';
    const areaId = areaNameToId(areaName);
    if (!areaId || !country) return;

    const placesRef = collection(db, 'countries', country, 'areas', areaId, 'discoveredPlaces');
    const unsubscribe = onSnapshot(placesRef, (snapshot) => {
      const places = snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((p: any) => p.status !== 'hidden');
      setDiscoveredPlaces(places);
    });
    return () => unsubscribe();
  }, [property, propertyType]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, step, dynamicDistances]);

  const getLocationContext = () => {
    const propertyDisplayName = getPropertyDisplayName();
    const address = property?.address || propertyType?.address || '';
    const cityArea = propertyType?.city || propertyType?.area || property?.city || property?.area || '';
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

  const getPlanPhotoContext = (): PlanPhotoContext => {
    const { cityArea, country } = getLocationContext();
    const areaName = [cityArea, country].filter(Boolean).join(', ');
    const areaId = areaNameToId(cityArea);
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
      })),
    };
  };

  const finalizePlanData = async (planData: any, mapAreaHint: string, startCoords: ReturnType<typeof getStartCoords>) => {
    const withMaps = await enrichPlanWithMapLinks(planData, mapAreaHint, startCoords);
    setThinkingLabel('Loading venue photos...');
    const photoCtx: PlanPhotoContext = {
      ...getPlanPhotoContext(),
      anchorCoords: startCoords ? { lat: startCoords.lat, lng: startCoords.lng } : null,
    };
    return enrichPlanWithAllPhotos(withMaps, photoCtx);
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

    try {
      const osrmRes = await fetch(
        `https://router.project-osrm.org/route/v1/driving/${propCoords.lng},${propCoords.lat};${locLng},${locLat}?overview=false`
      );
      const osrmData = await osrmRes.json();
      if (osrmData.code === 'Ok') {
        distance = osrmData.routes[0].distance / 1000;
      } else if (osrmData.code === 'NoRoute') {
        isPossible = false;
      }
    } catch (e) {
      console.error('OSRM failed, falling back to math');
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

  const getFilteredDbSummary = (maxKmLimit: number, startCoordsOverride?: { lat: number; lng: number } | null) => {
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

    const filteredGems = filterItems(gems);
    const filteredFeatures = filterItems(features);

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
      const model = getGenerativeModel(ai, { model: "gemini-3.1-pro-preview" });

      const aiTimeFrame = timeFrameStr
        ? (() => {
            const { end24 } = computeEndFromDuration(startTime, tripDurationHours ?? 6);
            return `${startTime} to ${end24}`;
          })()
        : '';

      const { fullLocationContext } = getLocationContext();
      const startCoords = getStartCoords();
      const isNearProperty = typeof preferences.location === 'string' && preferences.location.startsWith('Near');
      const startLocationName = isNearProperty ? fullLocationContext : (locationFullNameRef.current || preferences.locationFullName || preferences.location);

      let distanceLimitNum = 9999;
      if (preferences.distance) {
        const match = preferences.distance.match(/\d+(\.\d+)?/);
        if (match) {
          distanceLimitNum = parseFloat(match[0]);
        } else if (preferences.distance.toLowerCase().includes('walk')) {
          distanceLimitNum = 2; 
        }
      }

      const filteredDatabase = getFilteredDbSummary(distanceLimitNum, startCoords);
      const { coords: propCoords } = getLocationContext();
      const isFlexiblePicks = !timeFrameStr;

      const picksDbContext = isFlexiblePicks
        ? buildFlexiblePicksDbContext(
            preferences.categories,
            distanceLimitNum,
            startCoords,
            propCoords,
            gems,
            features
          )
        : null;

      let promptText = `
        You are an elite, local luxury concierge. 
        
        CRITICAL ROUTING INSTRUCTION (POINT A):
        The user's STARTING POINT is EXACTLY: "${startLocationName}" (GPS: ${startCoords ? `${startCoords.lat}, ${startCoords.lng}` : 'Unknown'}).
        Max Distance Radius from STARTING POINT: ${distanceLimitNum}km. 
        Requested Categories: ${preferences.categories.join(', ')}.

        ${isNearProperty ? `Property Location Context: ${fullLocationContext}` : `IMPORTANT: The user is NOT starting from their accommodation. They are starting their trip from "${startLocationName}". You MUST focus strictly on generating recommendations near "${startLocationName}" within the ${distanceLimitNum}km radius. DO NOT suggest places near their accommodation.`}

        ${
          isFlexiblePicks
            ? ''
            : `VAILO DATABASE (ALREADY PRE-FILTERED TO BE STRICTLY WITHIN ${distanceLimitNum}KM OF STARTING POINT):
        ${JSON.stringify(filteredDatabase)}`
        }

        CONCIERGE RULES (STRICT ANTI-HALLUCINATION PROTOCOL):
        1. DATABASE FIRST (60/40 RULE): You MUST prioritize items from the VAILO DATABASE above, as they are mathematically proven to be within the distance limit.
        2. ZERO-TOLERANCE GEOGRAPHICAL FENCING: As an AI, you lack a live routing engine and frequently hallucinate distances.
           - If you suggest an AI place NOT in the VAILO DATABASE, you must be 1000% mathematically certain it is within ${distanceLimitNum}km of the STARTING POINT ("${startLocationName}").
           - NEVER suggest famous places from neighboring municipalities if they exceed the radius.
           - If you do not know a true local, neighborhood spot, DO NOT invent one. It is better to return ONLY database items or an empty list than to hallucinate a distance.
        3. NO FAKE MATH: For AI-generated places, you are STRICTLY FORBIDDEN from writing fake "km" distances. You MUST write the actual Town/Village name instead. For Database items, use the exact distance string provided.
        4. SPECIFIC BUSINESSES ONLY: Recommend specific, real, named businesses or attractions.
      `;

      if (aiTimeFrame) {
        promptText += `
        5. TIMEFLOW: The guest selected this timeframe: "${aiTimeFrame}".
        6. START & END POINTS: The FIRST item in the timeline MUST be departing from "${preferences.location}" and the LAST item MUST be returning to "${preferences.location}".
        
        You MUST return ONLY a valid JSON object matching this exact schema (NO markdown formatting):
        {
          "type": "timeline",
          "plan": [
            {
              "time": "e.g., 10:00 AM",
              "title": "Specific Name of Activity/Place",
              "description": "Engaging 2-sentence description.",
              "transportToNext": "For DB items: use provided distance. For AI items: Output Neighborhood name & estimated drive time (e.g., 'Located in Platanias - 15 mins drive') - NO KM ALLOWED",
              "source": "database or ai",
              "photoUrl": "Exact URL from database or empty string if AI",
              "googleMapsUrl": "Exact URL from database or empty string if AI"
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
        You MUST return ONLY a valid JSON object matching this exact schema (NO markdown formatting):
        {
          "type": "picks",
          "categories": [
            {
              "categoryName": "Name of Category",
              "items": [
                {
                  "title": "Specific local business/place name",
                  "description": "2 sentences on why LOCALS love it — not why tourists go there.",
                  "distanceKm": 12.4,
                  "beyondRadius": false,
                  "estimatedDistance": "12.4km or Further · 18.0km if beyondRadius is true",
                  "source": "database or ai",
                  "photoUrl": "Exact URL from database or empty string if AI",
                  "googleMapsUrl": "Exact URL from database or empty string if AI"
                }
              ]
            }
          ]
        }
        Return exactly ${PICKS_PER_CATEGORY} items per category, sorted closest to furthest.`;
      }

      console.log("--- AI PROMPT START (executePlan) ---");
      console.log(promptText);
      console.log("--- AI PROMPT END ---");

      const result = await model.generateContent(promptText);
      let rawText = result.response.text();
      
      const firstBrace = rawText.indexOf('{');
      const lastBrace = rawText.lastIndexOf('}');
      if (firstBrace === -1 || lastBrace === -1) throw new Error("AI did not return a recognizable JSON object.");
      
      const cleanJsonString = rawText.substring(firstBrace, lastBrace + 1);
      const parsedData = JSON.parse(cleanJsonString);

      setThinkingLabel('Pinpointing places on the map...');
      const mapAreaHint = startLocationName || preferences.location;
      let enrichedData = await finalizePlanData(parsedData, mapAreaHint, startCoords);

      if (isFlexiblePicks && picksDbContext) {
        enrichedData = normalizeFlexiblePicksPlan(
          enrichedData,
          distanceLimitNum,
          picksDbContext,
          startCoords
        );
      }

      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'ai', type: 'plan', data: enrichedData }]);

    } catch (error: any) {
      console.error("Critical AI Itinerary Error:", error);
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'ai', type: 'text', text: `I apologize, but I encountered an error while generating your plan. Error Details: ${error.message}. Please try asking a custom question below.` }]);
    } finally {
      setIsThinking(false);
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
      const model = getGenerativeModel(ai, { model: "gemini-3.1-pro-preview" });

      const { fullLocationContext } = getLocationContext();
      const startCoords = getStartCoords();
      const isNearProperty = typeof preferences.location === 'string' && preferences.location.startsWith('Near');
      const startLocationName = isNearProperty ? fullLocationContext : (locationFullNameRef.current || preferences.locationFullName || preferences.location);
      
      const conversationHistory = messages.map(m => {
        if (m.type === 'plan') return `AI generated this plan on screen: ${JSON.stringify(m.data)}`;
        if (m.text?.startsWith('welcome:')) {
          return `AI Concierge: Welcomed guest to ${m.text.replace('welcome:', '')} and offered to plan a local day.`;
        }
        if (m.type === 'selection') {
          return `Guest selected: ${m.text}`;
        }
        return `${m.role === 'ai' ? 'AI Concierge' : 'Guest'}: ${m.text}`;
      }).join('\n\n');

      let distanceLimitNum = 9999;
      if (preferences.distance) {
        const match = preferences.distance.match(/\d+(\.\d+)?/);
        if (match) {
          distanceLimitNum = parseFloat(match[0]);
        } else if (preferences.distance.toLowerCase().includes('walk')) {
          distanceLimitNum = 2; 
        }
      }
      const filteredDatabase = getFilteredDbSummary(distanceLimitNum, startCoords);

      const prompt = `
        You are the elite Vailo AI Concierge.
        The user's STARTING POINT is EXACTLY: "${startLocationName}" (GPS: ${startCoords ? `${startCoords.lat}, ${startCoords.lng}` : 'Unknown'}).
        Current itinerary preferences: ${JSON.stringify(preferences)}.
        
        ${isNearProperty ? `Property Location Context: ${fullLocationContext}` : `IMPORTANT: The user is NOT starting from their accommodation. They are starting from "${startLocationName}". Focus strictly on the area around this starting point. DO NOT suggest places near their accommodation.`}

        CONVERSATION HISTORY (What is currently on the screen):
        ${conversationHistory}
        
        VAILO DATABASE (ALREADY PRE-FILTERED BY SYSTEM TO FIT DISTANCE RULES):
        ${JSON.stringify(filteredDatabase)}

        STRICT RULES:
        1. ONLY answer questions related to local travel, day planning, itineraries, and "live like a local" advice.
        2. ULTRA CLEVER LOCAL EXPERT: 100% prioritize the VAILO DATABASE if relevant items exist near the starting point.
        3. GEOGRAPHICAL FENCING FOR AI IDEAS: You do not have a live map routing engine. You CANNOT calculate precise point-to-point kilometers for places outside the database. NEVER invent fake kilometer numbers. Use Neighborhood names instead.
        4. SPECIFIC BUSINESSES ONLY: NEVER recommend generic areas. You MUST recommend specific, real, named businesses or attractions.
        5. PRESENTATION IS EVERYTHING: If providing recommendations, return the JSON 'plan' object (either 'picks' or 'timeline'). DO NOT list recommendations in plain text.

        YOUR OUTPUT FORMAT:
        You MUST return ONLY a valid JSON object matching this exact schema (no markdown formatting):
        {
          "replyText": "Your conversational response.",
          "hasPlan": true/false,
          "plan": null OR { 
            "type": "picks" OR "timeline",
            "plan": [ { "time": "...", "title": "...", "description": "...", "transportToNext": "...", "source": "database or ai", "photoUrl": "", "googleMapsUrl": "" } ],
            "categories": [ { "categoryName": "...", "items": [ { "title": "...", "description": "...", "estimatedDistance": "Output Neighborhood Name instead of fake km if not from DB", "source": "database or ai", "photoUrl": "", "googleMapsUrl": "" } ] } ]
          }
        }

        User Query: ${userText}
      `;

      console.log("--- AI PROMPT START (handleChatSubmit) ---");
      console.log(prompt);
      console.log("--- AI PROMPT END ---");

      const result = await model.generateContent(prompt);
      let rawText = result.response.text();
      
      const firstBrace = rawText.indexOf('{');
      const lastBrace = rawText.lastIndexOf('}');
      if (firstBrace === -1 || lastBrace === -1) throw new Error("JSON Parse failed.");
      
      const parsedData = JSON.parse(rawText.substring(firstBrace, lastBrace + 1));
      
      if (parsedData.replyText) {
        setMessages(prev => [...prev, { id: Date.now().toString() + 'text', role: 'ai', type: 'text', text: parsedData.replyText }]);
      }
      
      if (parsedData.hasPlan && parsedData.plan) {
        setThinkingLabel('Pinpointing places on the map...');
        const mapAreaHint = startLocationName || preferences.location;
        const enrichedPlan = await finalizePlanData(parsedData.plan, mapAreaHint, startCoords);
        setMessages(prev => [...prev, { id: Date.now().toString() + 'plan', role: 'ai', type: 'plan', data: enrichedPlan }]);
      }

    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'ai', type: 'text', text: "I'm having trouble connecting right now. Please try again in a moment." }]);
    } finally {
      setIsThinking(false);
      setThinkingLabel('Curating your local recommendations…');
    }
  };

  const mapAreaHint =
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
                      {item.photoUrl ? (
                        <img src={item.photoUrl} alt={item.title} className="w-full h-36 object-cover" />
                      ) : (
                        <div className="w-full h-36 bg-[#eef3f2] flex items-center justify-center text-[#0B4F5C]/25">
                          <ImageIcon size={32} strokeWidth={1.5} />
                        </div>
                      )}
                      <div className="p-4">
                        <h4 className="font-semibold text-gray-900 text-base flex flex-wrap items-center gap-2 mb-2">
                          {item.title}
                          {item.source === 'database' && (
                            <span className="bg-[#C5A059]/12 text-[#8a6d2e] text-[9px] px-2 py-0.5 rounded-full uppercase tracking-wider font-semibold">
                              Vailo pick
                            </span>
                          )}
                        </h4>
                        <p className="text-gray-600 text-sm leading-relaxed mb-4">{item.description}</p>
                        
                        <div className="flex gap-2 pt-4 border-t border-[#0B4F5C]/8">
                          {(() => {
                            const links = getItemMapLinks(item, mapAreaHint);
                            return (
                              <>
                                <a href={links.googleMapsUrl} target="_blank" rel="noopener noreferrer" className="flex-1 py-2.5 bg-[#f8faf9] border border-[#0B4F5C]/10 hover:border-[#0B4F5C]/30 text-[#0B4F5C] rounded-xl text-[10px] font-semibold uppercase tracking-wider flex items-center justify-center transition-colors">
                                  <MapIcon size={14} className="mr-1.5" /> View
                                </a>
                                <a href={links.navigateUrl} target="_blank" rel="noopener noreferrer" className="flex-1 py-2.5 bg-[#0B4F5C] hover:bg-[#0a4550] text-white rounded-xl text-[10px] font-semibold uppercase tracking-wider flex items-center justify-center transition-colors shadow-sm">
                                  <Navigation size={14} className="mr-1.5" /> Directions
                                </a>
                              </>
                            );
                          })()}
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
                  />
                ))}
              </div>
            )}

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
                          placeholder="e.g. Paleochora, Chania"
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
                  {availableCategories.length > 0 ? (
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
                    <p className="text-xs text-gray-400 flex items-center gap-2">
                      <Loader2 size={14} className="animate-spin" /> Loading local categories…
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