import { useState, useEffect, useRef } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { getGenerativeModel } from "firebase/ai";
import { ai, db } from '../../lib/firebase';
import { Sparkles, ArrowLeft, Navigation, Clock, MapPin, Send, Loader2, Bot, Map as MapIcon, Car, Image as ImageIcon } from 'lucide-react';

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
  type: 'text' | 'plan';
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

export default function AiExpertView({ onClose, property, propertyType, features, gems }: AiExpertViewProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [step, setStep] = useState<Step>('LOCATION');
  const [chatInput, setChatInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [dynamicDistances, setDynamicDistances] = useState<string[]>([]);
  
  // 🌟 NEW: State to hold the dynamically fetched Village/Municipality name
  const [richLocationName, setRichLocationName] = useState<string>('');

  const [preferences, setPreferences] = useState({
    location: '',
    categories: [] as string[],
    distance: '',
    timeFrame: ''
  });

  const [customLoc, setCustomLoc] = useState('');
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');

  useEffect(() => {
    setMessages([
      { id: Date.now().toString(), role: 'ai', type: 'text', text: `Welcome to ${property?.propertyName || 'our property'}! I am your personal Vailo AI Concierge. Let's avoid the tourist traps and plan the perfect local experience for you.` }
    ]);

    const fetchCategories = async () => {
      const country = propertyType?.country || property?.country || 'Greece';
      const areaName = propertyType?.city || propertyType?.area || property?.city || property?.area || '';
      const areaId = areaName.toLowerCase().replace(/\s+/g, '-');

      if (areaId && country) {
        try {
          const aiRef = collection(db, 'countries', country, 'areas', areaId, 'aiCategories');
          const gemsRef = collection(db, 'countries', country, 'areas', areaId, 'localGemsCategories');
          
          const [aiSnap, gemsSnap] = await Promise.all([getDocs(aiRef), getDocs(gemsRef)]);
          const aiCats = aiSnap.docs.map(d => d.data().name).filter(Boolean);
          const gemCats = gemsSnap.docs.map(d => d.data().name).filter(Boolean);

          const cats = new Set([...aiCats, ...gemCats]);
          setAvailableCategories(Array.from(cats).sort());
        } catch (error) {
          console.error("Failed to fetch Master Categories:", error);
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
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, step, dynamicDistances]);

  const getLocationContext = () => {
    const propName = property?.propertyName || 'our property';
    const typeName = propertyType?.name || propertyType?.propertyName || '';
    const address = property?.address || propertyType?.address || '';
    const cityArea = propertyType?.city || propertyType?.area || property?.city || property?.area || '';
    const pc = property?.postalCode || property?.pc || property?.zip || propertyType?.postalCode || propertyType?.pc || propertyType?.zip || ''; 
    const country = propertyType?.country || property?.country || '';

    const coords = extractCoords(property) || extractCoords(propertyType);
    const gpsString = coords ? `GPS Coordinates: ${coords.lat}, ${coords.lng}` : '';

    // 🌟 NEW: Inject the richLocationName directly into the AI's Location Context string!
    const fullLocationContext = [propName, typeName, richLocationName, address, cityArea, pc, country, gpsString]
      .filter(Boolean)
      .join(', ');

    return { propName, fullLocationContext, cityArea, country, coords };
  };

  const getFilteredDbSummary = (maxKmLimit: number) => {
    const { coords: propCoords } = getLocationContext();

    if (!propCoords || isNaN(maxKmLimit)) {
      return {
        gems: gems?.map(g => ({ name: g.name, category: g.category, distance: g.distanceKm ? `${g.distanceKm}km` : 'Local', description: g.description, photoUrl: g.photoUrl || '', googleMapsUrl: g.googleMapsUrl || '' })) || [],
        features: features?.map(f => ({ name: f.name, category: f.categories?.join(', '), distance: 'Local', description: f.description, photoUrl: f.photoUrl || '', googleMapsUrl: f.googleMapsUrl || '' })) || []
      };
    }

    const filterItems = (items: any[]) => {
      return items?.map(item => {
        const coords = extractCoords(item);
        if (!coords) return { ...item, calculatedKm: null };
        return { ...item, calculatedKm: calculateRealisticDrivingDistance(propCoords.lat, propCoords.lng, coords.lat, coords.lng) };
      }).filter(item => item.calculatedKm === null || item.calculatedKm <= maxKmLimit) || [];
    };

    const filteredGems = filterItems(gems);
    const filteredFeatures = filterItems(features);

    return {
      gems: filteredGems.map(g => ({ name: g.name, category: g.category, distance: g.calculatedKm !== null ? `${g.calculatedKm.toFixed(1)}km` : (g.distanceKm ? `${g.distanceKm}km` : 'Local'), description: g.description, photoUrl: g.photoUrl || '', googleMapsUrl: g.googleMapsUrl || '' })),
      features: filteredFeatures.map(f => ({ name: f.name, category: f.categories?.join(', '), distance: f.calculatedKm !== null ? `${f.calculatedKm.toFixed(1)}km` : 'Local', description: f.description, photoUrl: f.photoUrl || '', googleMapsUrl: f.googleMapsUrl || '' }))
    };
  };

  const advanceStep = async (currentStep: Step, value: any, displayText: string) => {
    setPreferences(prev => ({ ...prev, [currentStep.toLowerCase()]: value }));
    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', type: 'text', text: displayText }]);

    if (currentStep === 'LOCATION') {
      setStep('CATEGORIES');
    } else if (currentStep === 'CATEGORIES') {
      setStep('DISTANCE');
      await generateCleverDistances(preferences.location, value);
    } else if (currentStep === 'DISTANCE') {
      setStep('TIME');
    }
  };

  const generateCleverDistances = async (loc: string, cats: string[]) => {
    setIsThinking(true);
    try {
      const model = getGenerativeModel(ai, { model: "gemini-3.1-flash-lite" }); 
      const { propName, fullLocationContext, coords } = getLocationContext();
      
      const relevantItems = [
        ...(gems || []).filter(g => cats.includes(g.category)),
        ...(features || []).filter(f => f.categories?.some((c: string) => cats.includes(c)))
      ];

      const actualDistances = relevantItems.map(item => {
        const itemCoords = extractCoords(item);
        if (coords && itemCoords) {
          return calculateRealisticDrivingDistance(coords.lat, coords.lng, itemCoords.lat, itemCoords.lng);
        }
        return null;
      }).filter(d => d !== null) as number[];

      let distanceOptions: string[] = [];
      if (actualDistances.length === 0) {
        distanceOptions = ["10km (Local Area)", "25km (Region)", "50km (Day Trip)"];
      } else {
        const minD = Math.min(...actualDistances);
        distanceOptions = [
          `${Math.ceil(minD + 2)}km`,
          `${Math.ceil(minD + 10)}km`,
          `${Math.ceil(minD + 25)}km`
        ];
      }

      const prompt = `The user is staying at a property named "${propName}" located exactly at: ${fullLocationContext}. 
      Starting point: "${loc}". 
      If this location is geographically impossible to reach from the property for a day trip, return ["TOO_FAR"]. 
      Otherwise, return the proposed distances: ${JSON.stringify(distanceOptions)}`;
      
      const result = await model.generateContent(prompt);
      let text = result.response.text();
      
      if (text.includes("TOO_FAR")) {
        setMessages(prev => [...prev, { id: Date.now().toString(), role: 'ai', type: 'text', text: `I apologize, but "${loc}" is too far for a day trip. Please select a starting point closer to the property.` }]);
        setStep('LOCATION');
        return;
      }
      
      setDynamicDistances(distanceOptions);
    } catch (e) {
      setDynamicDistances(["10km", "25km", "50km"]);
    } finally {
      setIsThinking(false);
    }
  };

  const executePlan = async (timeFrameStr: string) => {
    setPreferences(prev => ({ ...prev, timeFrame: timeFrameStr }));
    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', type: 'text', text: timeFrameStr ? `Time: ${timeFrameStr}` : 'Flexible timing' }]);
    
    setStep('DONE');
    setIsThinking(true);
    
    try {
      const model = getGenerativeModel(ai, { model: "gemini-3.1-pro-preview" });



      const { fullLocationContext, coords } = getLocationContext();

      let distanceLimitNum = 9999;
      if (preferences.distance) {
        const match = preferences.distance.match(/\d+(\.\d+)?/);
        if (match) {
          distanceLimitNum = parseFloat(match[0]);
        } else if (preferences.distance.toLowerCase().includes('walk')) {
          distanceLimitNum = 2; 
        }
      }

      const filteredDatabase = getFilteredDbSummary(distanceLimitNum);

      let promptText = `
        You are an elite, local luxury concierge. 
        
        CRITICAL ROUTING INSTRUCTION (POINT A):
        The user is located EXACTLY at GPS Coordinates: ${coords ? `${coords.lat}, ${coords.lng}` : fullLocationContext}.
        Location Context: ${fullLocationContext}
        Max Distance Radius requested by user: ${distanceLimitNum}km. 
        Requested Categories: ${preferences.categories.join(', ')}.

        VAILO DATABASE (ALREADY PRE-FILTERED TO BE STRICTLY WITHIN ${distanceLimitNum}KM):
        ${JSON.stringify(filteredDatabase)}

        CONCIERGE RULES (STRICT ANTI-HALLUCINATION PROTOCOL):
        1. DATABASE FIRST (60/40 RULE): You MUST use items from the VAILO DATABASE above. They are mathematically proven to be within the distance limit.
        2. ZERO-TOLERANCE GEOGRAPHICAL FENCING: As an AI, you lack a live routing engine and frequently hallucinate distances in rural/coastal regions. Because the user requested a strict limit of ${distanceLimitNum}km:
           - If you suggest a place NOT in the VAILO DATABASE, you must be 1000% mathematically certain it is within ${distanceLimitNum}km of GPS ${coords ? `${coords.lat}, ${coords.lng}` : fullLocationContext}.
           - NEVER suggest famous beaches or towns from neighboring municipalities or regions.
           - If you do not know a true local, neighborhood spot, DO NOT invent one. It is better to return ONLY database items or an empty list than to hallucinate a distance.
        3. NO FAKE MATH: For AI-generated places, you are STRICTLY FORBIDDEN from writing fake "km" distances. You MUST write the actual Town/Village name instead (e.g., "Located in [Village Name] - Short Drive"). For Database items, use the exact distance string provided.
        4. SPECIFIC BUSINESSES ONLY: Recommend specific, real, named businesses or attractions.
      `;

      if (timeFrameStr) {
        promptText += `
        5. TIMEFLOW: The guest selected this timeframe: "${timeFrameStr}".
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
        promptText += `
        5. CATEGORY FOCUS: For EACH requested category (${preferences.categories.join(', ')}), list ONLY the perfectly matching recommendations based on the strict rules above.

        You MUST return ONLY a valid JSON object matching this exact schema (NO markdown formatting):
        {
          "type": "picks",
          "categories": [
            {
              "categoryName": "Name of Category",
              "items": [
                {
                  "title": "Specific Name of Place/Business",
                  "description": "Engaging 2-sentence description.",
                  "estimatedDistance": "For DB items: use provided distance. For AI items: Output Neighborhood name & estimated drive time (e.g., 'Located in Platanias - 15 mins drive') - NO KM ALLOWED",
                  "source": "database or ai",
                  "photoUrl": "Exact URL from database or empty string if AI",
                  "googleMapsUrl": "Exact URL from database or empty string if AI"
                }
              ]
            }
          ]
        }`;
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
      
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'ai', type: 'plan', data: parsedData }]);

    } catch (error: any) {
      console.error("Critical AI Itinerary Error:", error);
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'ai', type: 'text', text: `I apologize, but I encountered an error while generating your plan. Error Details: ${error.message}. Please try asking a custom question below.` }]);
    } finally {
      setIsThinking(false);
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

    try {
      const model = getGenerativeModel(ai, { model: "gemini-3.1-pro-preview" });



      const { fullLocationContext, coords } = getLocationContext();
      
      const conversationHistory = messages.map(m => {
        if (m.type === 'plan') return `AI generated this plan on screen: ${JSON.stringify(m.data)}`;
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
      const filteredDatabase = getFilteredDbSummary(distanceLimitNum);

      const prompt = `
        You are the elite Vailo AI Concierge located exactly at GPS: ${coords ? `${coords.lat}, ${coords.lng}` : fullLocationContext}.
        Location Context: ${fullLocationContext}
        Current itinerary preferences: ${JSON.stringify(preferences)}.
        
        CONVERSATION HISTORY (What is currently on the screen):
        ${conversationHistory}
        
        VAILO DATABASE (ALREADY PRE-FILTERED BY SYSTEM TO FIT DISTANCE RULES):
        ${JSON.stringify(filteredDatabase)}

        STRICT RULES:
        1. ONLY answer questions related to local travel, day planning, itineraries, and "live like a local" advice.
        2. ULTRA CLEVER LOCAL EXPERT: 100% prioritize the VAILO DATABASE. It is already mathematically filtered to fit the user's distance limits.
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
        setMessages(prev => [...prev, { id: Date.now().toString() + 'plan', role: 'ai', type: 'plan', data: parsedData.plan }]);
      }

    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'ai', type: 'text', text: "I'm having trouble connecting right now. Please try again in a moment." }]);
    } finally {
      setIsThinking(false);
    }
  };

  const planAnotherDay = () => {
    setStep('LOCATION');
    setPreferences({ location: '', categories: [], distance: '', timeFrame: '' });
    setSelectedCats([]);
    setCustomLoc('');
    setStartTime('');
    setEndTime('');
    setMessages([
      { id: Date.now().toString(), role: 'ai', type: 'text', text: "Let's plan another exciting day! Where are we starting from?" }
    ]);
  };

  const renderMessage = (msg: Message) => {
    if (msg.role === 'user') {
      return (
        <div key={msg.id} className="flex justify-end mb-4 animate-in fade-in slide-in-from-bottom-2">
          <div className="max-w-[80%] bg-[#0B4F5C] text-white p-3 rounded-2xl rounded-tr-sm shadow-sm text-sm whitespace-pre-wrap">
            {msg.text}
          </div>
        </div>
      );
    }

    if (msg.type === 'plan' && msg.data) {
      return (
        <div key={msg.id} className="mb-6 animate-in fade-in slide-in-from-bottom-2">
          <div className="bg-white border border-[#C5A059]/30 rounded-2xl p-5 shadow-md">
            <div className="flex items-center text-[#C5A059] mb-4 border-b border-gray-100 pb-3">
              <Sparkles size={20} className="mr-2" />
              <h3 className="font-bold uppercase tracking-widest text-sm">Your Curated Local Experience</h3>
            </div>

            {msg.data.type === 'timeline' && (
              <div className="space-y-6 pt-2">
                {msg.data.plan?.map((item: any, idx: number) => (
                  <div key={idx} className="relative pl-6 pb-6 border-l-2 border-[#0B4F5C]/20 last:border-0 last:pb-0">
                    <div className="absolute w-3 h-3 bg-[#C5A059] rounded-full -left-[7px] top-1 shadow-sm" />
                    <p className="font-bold text-[#0B4F5C] text-sm mb-1">{item.time}</p>
                    
                    <div className="bg-gray-50 border border-gray-100 rounded-xl overflow-hidden mt-2">
                      {item.photoUrl ? (
                        <img src={item.photoUrl} alt={item.title} className="w-full h-32 object-cover" />
                      ) : (
                        <div className="w-full h-32 bg-gray-200 flex items-center justify-center text-gray-400">
                          <ImageIcon size={32} />
                        </div>
                      )}
                      <div className="p-4">
                        <h4 className="font-bold text-gray-900 text-base flex items-center gap-2 mb-2">
                          {item.title}
                          {item.source === 'database' && <span className="bg-[#C5A059]/10 text-[#C5A059] text-[9px] px-2 py-0.5 rounded-full uppercase tracking-wider">Vailo Curated</span>}
                        </h4>
                        <p className="text-gray-600 text-sm leading-relaxed mb-4">{item.description}</p>
                        
                        <div className="flex gap-2 pt-4 border-t border-gray-200/60">
                          <a href={item.googleMapsUrl || `https://maps.google.com/?q=${encodeURIComponent(item.title)}`} target="_blank" rel="noopener noreferrer" className="flex-1 py-2.5 bg-white border border-gray-200 hover:border-[#0B4F5C] text-[#0B4F5C] rounded-lg text-[10px] font-bold uppercase tracking-widest flex items-center justify-center transition-colors">
                            <MapIcon size={14} className="mr-1.5" /> Map
                          </a>
                          <a href={`https://maps.google.com/?daddr=${encodeURIComponent(item.title)}`} target="_blank" rel="noopener noreferrer" className="flex-1 py-2.5 bg-[#0B4F5C] hover:bg-[#C5A059] text-white rounded-lg text-[10px] font-bold uppercase tracking-widest flex items-center justify-center transition-colors shadow-sm">
                            <Navigation size={14} className="mr-1.5" /> Navigate
                          </a>
                        </div>
                      </div>
                    </div>

                    {item.transportToNext && (
                      <div className="mt-4 inline-flex items-center text-xs font-medium text-gray-500 bg-white px-3 py-1.5 rounded-lg border border-gray-200 shadow-sm relative -left-3">
                        <Navigation size={12} className="mr-2 text-[#0B4F5C]" /> {item.transportToNext}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {msg.data.type === 'picks' && (
              <div className="space-y-8 pt-2">
                {msg.data.categories?.map((cat: any, idx: number) => (
                  <div key={idx}>
                    <h4 className="font-bold text-[#0B4F5C] text-base mb-3 flex items-center">
                      <MapPin size={16} className="mr-2 text-[#C5A059]"/> {cat.categoryName}
                    </h4>
                    <div className="grid gap-4">
                      {cat.items?.map((item: any, i: number) => (
                        <div key={i} className="bg-gray-50 border border-gray-100 rounded-xl overflow-hidden flex flex-col">
                          {item.photoUrl ? (
                            <img src={item.photoUrl} alt={item.title} className="w-full h-32 object-cover" />
                          ) : (
                            <div className="w-full h-32 bg-gray-200 flex items-center justify-center text-gray-400">
                              <ImageIcon size={32} />
                            </div>
                          )}
                          <div className="p-4 flex flex-col flex-1">
                            <div className="flex justify-between items-start mb-1.5">
                              <h5 className="font-bold text-gray-900">{item.title}</h5>
                              {item.source === 'database' && <span className="bg-[#C5A059]/10 text-[#C5A059] text-[9px] px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0 ml-2">Curated</span>}
                            </div>
                            <p className="text-sm text-gray-600 leading-relaxed mb-4 flex-1">{item.description}</p>
                            <p className="text-[11px] font-bold text-[#0B4F5C] uppercase tracking-wider flex items-center mb-4">
                              <Car size={12} className="mr-1.5"/> {item.estimatedDistance}
                            </p>
                            <div className="flex gap-2 mt-auto pt-4 border-t border-gray-200/60">
                              <a href={item.googleMapsUrl || `https://maps.google.com/?q=${encodeURIComponent(item.title)}`} target="_blank" rel="noopener noreferrer" className="flex-1 py-2.5 bg-white border border-gray-200 hover:border-[#0B4F5C] text-[#0B4F5C] rounded-lg text-[10px] font-bold uppercase tracking-widest flex items-center justify-center transition-colors">
                                <MapIcon size={14} className="mr-1.5" /> Map
                              </a>
                              <a href={`https://maps.google.com/?daddr=${encodeURIComponent(item.title)}`} target="_blank" rel="noopener noreferrer" className="flex-1 py-2.5 bg-[#0B4F5C] hover:bg-[#C5A059] text-white rounded-lg text-[10px] font-bold uppercase tracking-widest flex items-center justify-center transition-colors shadow-sm">
                                <Navigation size={14} className="mr-1.5" /> Navigate
                              </a>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button onClick={planAnotherDay} className="w-full mt-6 py-3.5 bg-gray-50 hover:bg-gray-100 text-[#0B4F5C] font-bold text-xs uppercase tracking-widest rounded-xl transition-colors border border-gray-200">
              Plan Another Day
            </button>
          </div>
        </div>
      );
    }

    return (
      <div key={msg.id} className="flex justify-start mb-4 animate-in fade-in slide-in-from-bottom-2">
        <Bot size={28} className="shrink-0 mr-3 mt-1 text-[#C5A059]" />
        <div className="max-w-[85%] bg-white border border-gray-100 text-gray-800 p-4 rounded-2xl rounded-tl-sm shadow-sm text-sm leading-relaxed whitespace-pre-wrap">
          {msg.text}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-50 md:relative md:h-[800px] md:rounded-3xl md:overflow-hidden md:shadow-2xl">
      
      <div className="bg-[#0B4F5C] text-white p-4 shrink-0 flex items-center justify-between shadow-md relative z-10">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h2 className="font-bold text-lg tracking-wide flex items-center">
              <Sparkles size={16} className="text-[#C5A059] mr-2" />
              Live Like a Local
            </h2>
            <p className="text-[10px] text-white/70 uppercase tracking-widest">AI Concierge</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar flex flex-col">
        {messages.map(renderMessage)}

        {!isThinking && step !== 'DONE' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 mt-2">
            
            {step === 'LOCATION' && (
              <div className="ml-10 max-w-[85%]">
                <p className="text-sm text-gray-600 font-medium mb-3">Where are we starting from?</p>
                <div className="flex flex-col gap-2">
                  <button onClick={() => advanceStep('LOCATION', `Near ${property.propertyName}`, `Near ${property.propertyName}`)} className="bg-white border border-[#C5A059]/40 text-[#0B4F5C] px-4 py-3 rounded-xl text-sm font-bold text-left hover:bg-[#C5A059]/5 transition-colors shadow-sm">
                    📍 Near {property.propertyName}
                  </button>
                  <div className="flex gap-2">
                    <input type="text" value={customLoc} onChange={e => setCustomLoc(e.target.value)} placeholder="Or enter custom location..." className="flex-1 px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:border-[#C5A059] shadow-sm" />
                    <button disabled={!customLoc.trim()} onClick={() => advanceStep('LOCATION', customLoc, customLoc)} className="px-5 bg-[#0B4F5C] text-white font-bold rounded-xl disabled:opacity-50 shadow-sm">Set</button>
                  </div>
                </div>
              </div>
            )}

            {step === 'CATEGORIES' && (
              <div className="ml-10 max-w-[85%] bg-white border border-[#C5A059]/20 p-4 rounded-2xl shadow-sm">
                <p className="text-sm text-gray-800 font-bold mb-3">What are you in the mood for? (Select up to 3)</p>
                <div className="flex flex-wrap gap-2 mb-4">
                  {availableCategories.length > 0 ? availableCategories.map(cat => (
                    <button 
                      key={cat}
                      onClick={() => setSelectedCats(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : (prev.length < 3 ? [...prev, cat] : prev))}
                      className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all border ${selectedCats.includes(cat) ? 'bg-[#0B4F5C] text-white border-[#0B4F5C] shadow-md' : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-[#C5A059]/50'}`}
                    >
                      {cat}
                    </button>
                  )) : (
                    <p className="text-xs text-gray-400">Loading local categories...</p>
                  )}
                </div>
                <button 
                  disabled={selectedCats.length === 0} 
                  onClick={() => advanceStep('CATEGORIES', selectedCats, selectedCats.join(', '))} 
                  className="w-full py-3 bg-[#C5A059] text-white rounded-xl text-sm font-bold disabled:opacity-50 shadow-sm"
                >
                  Continue with {selectedCats.length} selected
                </button>
              </div>
            )}

            {step === 'DISTANCE' && (
              <div className="ml-10 max-w-[85%]">
                <p className="text-sm text-gray-600 font-medium mb-3">Based on your choices, how far are you willing to travel from <span className="font-bold">{preferences.location}</span>?</p>
                <div className="flex flex-col gap-2">
                  {dynamicDistances.length > 0 ? dynamicDistances.map((dist, i) => (
                    <button key={i} onClick={() => advanceStep('DISTANCE', dist, dist)} className="bg-white border border-[#C5A059]/40 text-[#0B4F5C] px-4 py-3 rounded-xl text-sm font-bold text-left hover:bg-[#C5A059]/5 transition-colors shadow-sm">
                      {dist}
                    </button>
                  )) : (
                    <div className="flex items-center text-sm text-gray-400 p-4"><Loader2 size={16} className="animate-spin mr-2"/> AI analyzing area geography...</div>
                  )}
                </div>
              </div>
            )}

            {step === 'TIME' && (
              <div className="ml-10 max-w-[85%] bg-white border border-[#C5A059]/20 p-4 rounded-2xl shadow-sm">
                <p className="text-sm text-gray-800 font-bold mb-4">When are you planning to go?</p>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-gray-400 ml-1">Leave At</label>
                    <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="w-full mt-1 p-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#0B4F5C]" />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold text-gray-400 ml-1">Return By</label>
                    <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="w-full mt-1 p-2 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:border-[#0B4F5C]" />
                  </div>
                </div>
                <div className="flex flex-col gap-2 mt-4 pt-4 border-t border-gray-100">
                  <button 
                    disabled={!startTime || !endTime} 
                    onClick={() => executePlan(`${startTime} to ${endTime}`)} 
                    className="w-full py-3 bg-[#0B4F5C] text-white rounded-xl text-sm font-bold disabled:opacity-50 shadow-sm flex items-center justify-center"
                  >
                    <Clock size={16} className="mr-2"/> Create Timeline
                  </button>
                  <button 
                    onClick={() => executePlan('')} 
                    className="w-full py-3 bg-gray-100 text-gray-600 hover:text-[#0B4F5C] rounded-xl text-sm font-bold transition-colors"
                  >
                    Skip / Keep it flexible
                  </button>
                </div>
              </div>
            )}
            
          </div>
        )}

        {isThinking && (
          <div className="flex items-center text-sm text-[#C5A059] font-medium ml-4 mt-4 bg-white/50 p-3 rounded-2xl w-max border border-[#C5A059]/20 shadow-sm">
            <Loader2 size={16} className="animate-spin mr-2" /> AI is crafting your plan...
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      <div className="bg-white p-3 md:p-4 shrink-0 shadow-[0_-4px_15px_rgba(0,0,0,0.05)] border-t border-gray-100 z-20 relative">
        <form onSubmit={handleChatSubmit} className="flex gap-2">
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            disabled={isThinking}
            placeholder="Ask a question or modify the plan..."
            className="flex-1 bg-gray-50 border border-gray-200 text-gray-900 text-sm rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#C5A059]/50 transition-shadow disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!chatInput.trim() || isThinking}
            className="bg-[#0B4F5C] text-white p-3 rounded-xl hover:bg-[#0B4F5C]/90 disabled:opacity-50 transition-colors shadow-md flex items-center justify-center"
          >
            <Send size={18} className={isThinking ? "opacity-50" : ""} />
          </button>
        </form>
        <p className="text-center text-[9px] text-gray-400 mt-2 font-medium tracking-wide">
          Vailo AI may occasionally provide inaccurate travel times. Always double-check live routes.
        </p>
      </div>

    </div>
  );
}