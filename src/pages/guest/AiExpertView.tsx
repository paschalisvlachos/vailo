import { useState, useEffect, useRef } from 'react';
import { Sparkles, ArrowLeft, Navigation, Clock, Star, Map, X } from 'lucide-react';
import { getGenerativeModel } from "firebase/ai";
import { ai } from '../../lib/firebase';

interface AiExpertViewProps {
  onClose: () => void;
  property: any;
  propertyType?: any;
  features: any[];
  gems: any[];
}

interface ChatMessage {
  id: string;
  sender: 'ai' | 'user';
  text: string;
  isOptions?: boolean;
  options?: string[];
  multi?: boolean;
  isTimeSelector?: boolean;
}

export default function AiExpertView({ onClose, property, propertyType, features, gems }: AiExpertViewProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [itineraryData, setItineraryData] = useState<any | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [startVal, setStartVal] = useState<number | ''>('');
  const [returnVal, setReturnVal] = useState<number | ''>('');

  const script = [
    { key: 'transport', text: "Hello! I'm your Vailo AI Travel Expert. Let's craft the perfect local experience to avoid touristic traps and live like a local. First, How will you be getting around?", options: ['Car', 'Public Transport / Walking'], multi: false },
    { key: 'distance', text: "How far are you willing to travel?", options: ['up to 10km', 'up to 30km', 'up to 50km', 'Flexible'], multi: false },
    { key: 'pace', text: "Got it. And how should we pace the day?", options: ['Relaxed', 'Normal', 'Active'], multi: false },
    { key: 'vibe', text: "What kind of experience are you looking for? (Select up to 3)", options: ['Beach', 'Culture', 'Nature', 'Hiking', 'Dining', 'Events & Festivals', 'Horse Riding', 'Jeep Safari', 'Boat Tours', 'Water Sports', 'Playground', 'Fitness & Sports', 'Nightlife'], multi: true },
    { key: 'timeframe', text: "Finally, let's set the exact timeframe. When do you want to head out, and when do you want to return?", isTimeSelector: true }
  ];

  const [currentStep, setCurrentStep] = useState(0);
  const [multiSelection, setMultiSelection] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Record<string, any>>({});

  useEffect(() => {
    if (messages.length === 0) {
      setTimeout(() => {
        setMessages([{ id: `msg-0-${Date.now()}`, sender: 'ai', text: script[0].text, isOptions: true, options: script[0].options, multi: script[0].multi }]);
      }, 500);
    }
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleReset = () => {
    setItineraryData(null);
    setCurrentStep(0);
    setAnswers({});
    setMultiSelection([]);
    setStartVal('');
    setReturnVal('');
    setMessages([{ id: `msg-0-${Date.now()}`, sender: 'ai', text: script[0].text, isOptions: true, options: script[0].options, multi: script[0].multi }]);
  };

  const handleOptionClick = (option: string) => {
    if (option === 'Try different settings') {
      handleReset();
      return;
    }
    const stepData = script[currentStep];
    if (stepData.multi) {
      setMultiSelection(prev => 
        prev.includes(option) ? prev.filter(o => o !== option) : [...prev, option].slice(0, 3)
      );
    } else {
      submitAnswer([option]);
    }
  };

  const getLabelFromValue = (val: number) => {
    const h = Math.floor(val) % 12 || 12;
    const m = val % 1 === 0.5 ? '30' : '00';
    const isNextDay = val >= 24;
    const ampm = (val % 24) < 12 ? 'AM' : 'PM';
    return `${h}:${m} ${ampm}${isNextDay ? ' (Next Day)' : ''}`;
  };

  const submitTimeframe = () => {
    const startStr = getLabelFromValue(Number(startVal));
    const returnStr = getLabelFromValue(Number(returnVal));
    submitAnswer([`From ${startStr} to ${returnStr}`], { startStr, returnStr });
  };

  const submitAnswer = (selectedAnswers: string[], payload?: any) => {
    const stepData = script[currentStep];
    const answerText = selectedAnswers.join(', ');

    setMessages(prev => prev.map(m => m.id === `msg-${currentStep}` ? { ...m, isOptions: false, isTimeSelector: false } : m));
    setMessages(prev => [...prev, { id: `ans-${currentStep}-${Date.now()}`, sender: 'user', text: answerText }]);
    setAnswers(prev => ({ ...prev, [stepData.key]: selectedAnswers }));
    setMultiSelection([]);

    if (currentStep < script.length - 1) {
      setCurrentStep(prev => prev + 1);
      setTimeout(() => {
        setMessages(prev => [...prev, { 
          id: `msg-${currentStep + 1}`, 
          sender: 'ai', 
          text: script[currentStep + 1].text, 
          isOptions: script[currentStep + 1].options ? true : false, 
          options: script[currentStep + 1].options,
          multi: script[currentStep + 1].multi,
          isTimeSelector: script[currentStep + 1].isTimeSelector
        }]);
      }, 600);
    } else {
      setTimeout(() => {
        setMessages(prev => [...prev, { id: 'final', sender: 'ai', text: "Understood. I’m diving into our local database to pull the best options for you. My goal is to bypass the typical tourist spots and give you an authentic local experience." }]);
        startAI(payload.startStr, payload.returnStr); 
      }, 600);
    }
  };

  const deg2rad = (deg: number) => deg * (Math.PI/180);
  const getDistanceFromLatLonInKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    if (!lat1 || !lon1 || !lat2 || !lon2) return 999; 
    const R = 6371; 
    const dLat = deg2rad(lat2-lat1);
    const dLon = deg2rad(lon2-lon1);
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; 
  };

  // SMART GOOGLE MAPS URL BUILDER
  const getMapUrl = (item: any, type: 'view' | 'navigate') => {
    const baseUrl = type === 'view' 
      ? 'https://www.google.com/maps/search/?api=1&query=' 
      : 'https://www.google.com/maps/dir/?api=1&destination=';
    
    // If it has real database coordinates (and isn't the AI's fallback "0")
    if (item.latitude && item.longitude && item.latitude !== 0 && item.longitude !== 0) {
      return `${baseUrl}${item.latitude},${item.longitude}`;
    }
    
    // If it's an AI-generated place, use a smart text search query so Google resolves it perfectly!
    const region = property?.area || property?.city || '';
    const searchName = encodeURIComponent(`${item.title}, ${region}`);
    return `${baseUrl}${searchName}`;
  };

  const startAI = async (parsedStart: string, parsedReturn: string) => {
    setIsGenerating(true);
    
    try {
      const distanceChoice = answers.distance?.[0] || '';
      let maxDist = 999; 
      if (distanceChoice.includes('10')) maxDist = 10;
      else if (distanceChoice.includes('30')) maxDist = 30;
      else if (distanceChoice.includes('50')) maxDist = 50;

      const baseName = propertyType?.propertyTypeName || property?.propertyName || "The Property";
      const baseImage = propertyType?.photoUrl || property?.photoUrl || '';
      
      const baseLat = parseFloat(property?.latitude);
      const baseLng = parseFloat(property?.longitude);
      const baseAddress = [property?.addressLine, property?.area, property?.city, property?.country].filter(Boolean).join(', ');

      let validPartners = features.filter(f => f.liveLikeLocal);
      let validGems = [...gems];

      if (maxDist < 999 && !isNaN(baseLat) && !isNaN(baseLng)) {
        validPartners = validPartners.filter(f => getDistanceFromLatLonInKm(baseLat, baseLng, parseFloat(f.latitude), parseFloat(f.longitude)) <= maxDist);
        validGems = validGems.filter(g => getDistanceFromLatLonInKm(baseLat, baseLng, parseFloat(g.latitude), parseFloat(g.longitude)) <= maxDist);
      }

      const availableItems = [
        ...validPartners.map(f => ({ title: f.businessName, categories: f.categories || [], desc: f.description, lat: f.latitude, lng: f.longitude, img: f.photoUrl, isPartner: true })),
        ...validGems.map(g => ({ title: g.name, categories: [g.category], desc: g.description, lat: g.latitude, lng: g.longitude, img: g.photoUrl, isPartner: false }))
      ];

      const isPublicTransport = answers.transport?.[0].includes('Public Transport');

      // THE "PROPER NOUNS & GRACEFUL ALTERNATIVE" CONCIERGE PROMPT
      const prompt = `
        Act as an elite local travel concierge creating a JSON timeline. You are an expert in finding non-touristy, hidden gems. Write rich descriptions, but be CLINICALLY PRECISE with your location names.
        User profile: Transport: ${answers.transport?.[0]}, Pace: ${answers.pace?.[0]}, Vibes: ${answers.vibe?.join(', ')}, Distance limit: ${maxDist}km. Timeframe: ${parsedStart} to ${parsedReturn}.
        Base Property: ${baseName} at ${baseAddress} (Lat ${baseLat}, Lng ${baseLng}). Base Image: ${baseImage}.
        Available Database items: ${JSON.stringify(availableItems)}

        CRITICAL RULES:
        1. NO GENERIC TITLES (ABSOLUTE PRIORITY): The 'title' field for any destination MUST be the exact Proper Noun of a real, specific business, restaurant, or geographical landmark that exists on Google Maps. 
           - CORRECT TITLES: "Zoraida Horse Riding", "Kalyvaki Beach", "Taverna Leonidas", "Lake Kournas".
           - BANNED TITLES: "Morning Horse Riding", "Hidden Beach Cove", "A Taste of Local Flavors", "Azure Boat Tour". 
           If you use a descriptive or generic title, the Google Maps routing will fail. You MUST provide a specific proper noun.
        2. GEOGRAPHIC LEASH & THE GRACEFUL ALTERNATIVE: Try to stay strictly within the ${maxDist}km limit. However, if it is impossible to find a real, named place that matches the exact requested vibe within this range, you MUST propose a similar/related alternative experience instead. If you do this, you MUST naturally inform the guest in the 'introMessage' (e.g., "While there isn't a horse riding stable exactly within your requested distance, I have arranged a beautiful coastal nature hike for you instead...").
        3. THE "MAIN VIBE" DOMINANCE: The user explicitly requested: ${answers.vibe?.join(', ')}. This MUST take up 80% of their day. If they asked for 'Beach', give them a massive 4 to 6 hour stay at the beach! DO NOT hijack the itinerary with unrelated database items.
        4. THE ONE MEAL EXCEPTION: If the timeframe is over 5 hours and they didn't select 'Dining', you are allowed to add EXACTLY ONE specific, named local lunch/dining spot. Keep it focused on the main vibe.
        5. PERFECT TIMING & MATH: The first item MUST depart the Base at exactly ${parsedStart}. The last item MUST return to the Base at exactly ${parsedReturn}. Adjust the 'stayDuration' of the main destination to ensure the math perfectly fills the time window.
        6. SEAMLESS CONCIERGE: Scan the Database items first for vibe matches. If they lack matching vibes, seamlessly blend in your expert knowledge. NEVER mention "databases", "algorithms", or "missing items". Speak purely as a human concierge.
        7. ACTION TYPES: The JSON array MUST use EXACTLY these actionTypes: "depart" for the first item, "return" for the last item, and "stay" for all intermediate destinations.
        8. COORDINATES FOR EXPERT PLACES: If you invent an expert knowledge place that is not in the database, you MUST set its latitude to 0 and longitude to 0 so our system can search it via name instead.

        Return ONLY a strict JSON object:
        {
          "introMessage": "A warm, engaging welcome message introducing the beautifully paced, curated itinerary. If you had to swap the requested vibe for a similar alternative due to distance limits, explain it naturally here.",
          "timeline": [
            { 
              "actionTime": "${parsedStart}",
              "actionType": "depart",
              "title": "Departure from ${baseName}", 
              "description": "Begin your tailored local day...",
              "latitude": ${isNaN(baseLat) ? 0 : baseLat},
              "longitude": ${isNaN(baseLng) ? 0 : baseLng},
              "isPartner": false,
              "img": "${baseImage}",
              "distanceFromPreviousKm": 0,
              "stayDuration": "",
              "leaveAtTime": "${parsedStart}",
              "transitText": "Enjoy a scenic, short drive of roughly 5km (~10 mins) towards the coast."
            },
            { 
              "actionTime": "TIME_CALCULATED",
              "actionType": "stay",
              "title": "Kalyvaki Beach", 
              "description": "Rich description of enjoying the main vibe...",
              "latitude": 35.1,
              "longitude": 24.1,
              "isPartner": true,
              "img": "URL or empty",
              "distanceFromPreviousKm": 5,
              "stayDuration": "5 hours",
              "leaveAtTime": "TIME_CALCULATED",
              "transitText": "Leave and head to your next stop."
            },
            { 
              "actionTime": "${parsedReturn}",
              "actionType": "return",
              "title": "Return to ${baseName}", 
              "description": "End of your local experience.",
              "latitude": ${isNaN(baseLat) ? 0 : baseLat},
              "longitude": ${isNaN(baseLng) ? 0 : baseLng},
              "isPartner": false,
              "img": "${baseImage}",
              "distanceFromPreviousKm": 5,
              "stayDuration": "",
              "leaveAtTime": "${parsedReturn}",
              "transitText": ""
            }
          ]
        }
      `;

      const model = getGenerativeModel(ai, { 
        model: "gemini-2.5-flash", 
        generationConfig: { responseMimeType: "application/json" }
      });

      const result = await model.generateContent(prompt);
      const cleanResponse = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
      const parsedData = JSON.parse(cleanResponse);
      
      const finalTimeline = parsedData.timeline.map((item: any) => {
        let travelTime = "";
        let transportIcon = "car";
        if (item.distanceFromPreviousKm) {
          if (isPublicTransport) {
            travelTime = `~${Math.round(item.distanceFromPreviousKm * 12)} mins`;
            transportIcon = "walk";
          } else {
            travelTime = `~${Math.round(item.distanceFromPreviousKm * 2)} mins drive`;
            transportIcon = "car";
          }
        }
        return { ...item, travelTime, transportIcon, isPublicTransport };
      });

      setItineraryData({ ...parsedData, timeline: finalTimeline });
    } catch (error) {
      console.error("AI Generation Error:", error);
      setMessages(prev => [...prev, { id: 'error', sender: 'ai', text: "I had trouble calculating the route. Please try again." }]);
    } finally {
      setIsGenerating(false);
    }
  };

  const startOptions: { val: number; label: string }[] = [];
  for (let i = 6; i <= 18; i += 0.5) {
    startOptions.push({ val: i, label: getLabelFromValue(i) });
  }

  const returnOptions: { val: number; label: string }[] = [];
  if (startVal !== '') {
    for (let i = Number(startVal) + 3; i <= 30; i += 0.5) {
      returnOptions.push({ val: i, label: getLabelFromValue(i) });
    }
  }

  return (
    <div className="min-h-full w-full bg-[#F3F4F6] animate-in fade-in slide-in-from-right-8 duration-500 flex flex-col font-sans">
      <div className="p-4 flex items-center justify-between bg-white border-b border-gray-200 sticky top-0 z-20 shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="h-8 w-8 bg-gray-50 hover:bg-gray-100 rounded-full flex items-center justify-center text-gray-500 transition-colors">
            <ArrowLeft size={16} />
          </button>
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 bg-[#0B4F5C] rounded-full flex items-center justify-center">
              <Sparkles size={14} className="text-[#C5A059]" />
            </div>
            <div>
              <h2 className="font-luxury text-[15px] text-[#051F26] leading-none font-medium">AI Travel Expert</h2>
              <p className="text-[9px] uppercase tracking-[0.1em] font-bold text-[#C5A059] mt-0.5">Live like a local</p>
            </div>
          </div>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <X size={20} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-6">
        
        {!itineraryData && (
          <div className="flex flex-col gap-6 max-w-2xl mx-auto w-full pb-20">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                {msg.sender === 'ai' && (
                  <div className="h-6 w-6 rounded-full bg-[#0B4F5C] flex items-center justify-center shrink-0 mr-2 mt-1 shadow-sm">
                    <Sparkles size={10} className="text-[#C5A059]" />
                  </div>
                )}
                <div className={`max-w-[85%] flex flex-col gap-3`}>
                  <div className={`p-4 rounded-[1.25rem] text-[13px] leading-relaxed ${
                    msg.sender === 'user' ? 'bg-[#C5A059] text-white rounded-tr-sm shadow-md' : 'bg-white text-[#051F26] rounded-tl-sm shadow-sm border border-gray-100 font-medium'
                  }`}>
                    {msg.text}
                  </div>

                  {msg.isOptions && msg.options && (
                    <div className="flex flex-wrap gap-2 mt-1">
                      {msg.options.map(opt => {
                        const isSelected = msg.multi ? multiSelection.includes(opt) : false;
                        return (
                          <button
                            key={opt}
                            onClick={() => handleOptionClick(opt)}
                            className={`px-4 py-2.5 rounded-xl text-[11px] uppercase tracking-wider font-bold text-left transition-all border ${
                              isSelected ? 'bg-[#0B4F5C] border-[#0B4F5C] text-white shadow-md' : 'bg-white border-gray-200 text-gray-600 hover:border-[#C5A059] hover:text-[#0B4F5C]'
                            }`}
                          >
                            {opt}
                          </button>
                        );
                      })}
                      {msg.multi && multiSelection.length > 0 && (
                        <button onClick={() => submitAnswer(multiSelection)} className="mt-2 w-full py-3.5 bg-[#C5A059] text-white rounded-xl text-[11px] font-bold uppercase tracking-[0.15em] flex justify-center items-center shadow-md animate-in fade-in">
                          Confirm Selection
                        </button>
                      )}
                    </div>
                  )}

                  {msg.isTimeSelector && (
                    <div className="bg-white p-5 rounded-[1.25rem] border border-gray-200 shadow-sm mt-1">
                      <div className="flex gap-4">
                        <div className="flex-1">
                          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Start Time</label>
                          <select value={startVal} onChange={(e) => { setStartVal(Number(e.target.value)); setReturnVal(''); }} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium text-[#051F26] focus:outline-none focus:border-[#C5A059]">
                            <option value="" disabled>Select...</option>
                            {startOptions.map(opt => <option key={`start-${opt.val}`} value={opt.val}>{opt.label}</option>)}
                          </select>
                        </div>
                        <div className="flex-1">
                          <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Return Time</label>
                          <select value={returnVal} disabled={startVal === ''} onChange={(e) => setReturnVal(Number(e.target.value))} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium text-[#051F26] focus:outline-none focus:border-[#C5A059] disabled:opacity-50">
                            <option value="" disabled>Select...</option>
                            {returnOptions.map(opt => <option key={`end-${opt.val}`} value={opt.val}>{opt.label}</option>)}
                          </select>
                        </div>
                      </div>
                      <button disabled={startVal === '' || returnVal === ''} onClick={submitTimeframe} className={`mt-5 w-full py-3.5 text-white rounded-xl text-[11px] font-bold uppercase tracking-[0.15em] flex justify-center items-center shadow-md transition-all ${startVal === '' || returnVal === '' ? 'bg-gray-300 cursor-not-allowed' : 'bg-[#C5A059] hover:bg-[#b08d4a]'}`}>
                        Confirm Timeframe
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            
            {isGenerating && (
              <div className="flex justify-start animate-in fade-in duration-300">
                <div className="h-6 w-6 rounded-full bg-[#0B4F5C] flex items-center justify-center shrink-0 mr-2 mt-1">
                  <Sparkles size={10} className="text-[#C5A059]" />
                </div>
                <div className="bg-white p-4 rounded-[1.25rem] rounded-tl-sm shadow-sm border border-gray-100 flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 bg-[#C5A059] rounded-full animate-bounce"></div>
                  <div className="w-1.5 h-1.5 bg-[#C5A059] rounded-full animate-bounce" style={{ animationDelay: '0.15s' }}></div>
                  <div className="w-1.5 h-1.5 bg-[#C5A059] rounded-full animate-bounce" style={{ animationDelay: '0.3s' }}></div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}

        {itineraryData && !isGenerating && (
          <div className="max-w-2xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700 pb-10">
            
            <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100 text-center">
              <Sparkles className="mx-auto text-[#C5A059] mb-3" size={24} />
              <p className="text-[#051F26] font-medium leading-relaxed">{itineraryData.introMessage}</p>
            </div>

            <div className="relative border-l-2 border-[#0B4F5C]/20 ml-4 md:ml-6 pl-8 md:pl-10 space-y-2">
              
              {itineraryData.timeline.map((item: any, i: number) => (
                <div key={i} className="relative mb-6">
                  <div className="absolute -left-[45px] md:-left-[53px] top-0 h-7 w-7 bg-white border-[3px] border-[#C5A059] rounded-full flex items-center justify-center shadow-md z-10">
                    <div className="h-2 w-2 bg-[#0B4F5C] rounded-full"></div>
                  </div>
                  
                  <div className="flex flex-col gap-1 mb-3 pt-0.5">
                    <span className="text-[11px] font-bold text-[#0B4F5C] uppercase tracking-[0.15em] flex items-center">
                      <Clock size={12} className="mr-1.5 text-[#C5A059]" /> {item.actionTime}
                    </span>
                  </div>

                  {(item.actionType === 'depart' || item.actionType === 'return') ? (
                    <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden group">
                      {item.img && (
                        <div className="relative h-24 bg-gray-100 overflow-hidden">
                          <img src={item.img} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 opacity-80" />
                          <div className="absolute inset-0 bg-gradient-to-t from-[#051F26]/60 via-transparent to-transparent pointer-events-none"></div>
                          <div className="absolute bottom-3 left-4 flex gap-2">
                            <span className="text-white text-[10px] uppercase font-bold tracking-[0.15em] drop-shadow-md">
                              {item.actionType === 'depart' ? 'Starting Point' : 'Ending Point'}
                            </span>
                          </div>
                        </div>
                      )}
                      <div className="p-5">
                        <h3 className="font-bold text-[#051F26] text-lg">{item.title}</h3>
                        <p className="text-[13px] text-gray-500 mt-1">{item.description}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden group">
                      {item.img && (
                        <div className="relative h-48 bg-gray-100 overflow-hidden">
                          <img src={item.img} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                          <div className="absolute inset-0 bg-gradient-to-t from-[#051F26]/80 via-transparent to-transparent pointer-events-none"></div>
                          
                          <div className="absolute top-4 left-4 flex gap-2">
                            {item.isPartner && (
                              <span className="bg-white/95 text-[#0B4F5C] text-[9px] uppercase tracking-[0.15em] font-bold px-3 py-1.5 rounded-full shadow-md flex items-center">
                                <Star size={10} className="mr-1.5 text-[#C5A059] fill-[#C5A059]" /> Host Partner
                              </span>
                            )}
                            {item.stayDuration && (
                              <span className="bg-[#051F26]/80 backdrop-blur-md text-white border border-white/20 text-[9px] uppercase tracking-[0.15em] font-bold px-3 py-1.5 rounded-full flex items-center">
                                <Clock size={10} className="mr-1.5 text-[#C5A059]" /> Stay ~{item.stayDuration}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                      
                      <div className="p-6">
                        <h3 className="font-luxury text-[22px] text-[#051F26] mb-3">{item.title}</h3>
                        <p className="text-[14px] text-gray-500 font-light leading-relaxed mb-6">{item.description}</p>
                        
                        <div className="flex gap-2 border-t border-gray-100 pt-5">
                          <a href={getMapUrl(item, 'view')} target="_blank" rel="noopener noreferrer" className="flex-1 py-3 bg-gray-50 hover:bg-gray-100 text-[#0B4F5C] rounded-xl text-[10px] font-bold uppercase tracking-widest flex items-center justify-center border border-gray-200 transition-colors">
                            <Map size={14} className="mr-1.5" /> View on Map
                          </a>
                          <a href={getMapUrl(item, 'navigate')} target="_blank" rel="noopener noreferrer" className="flex-1 py-3 bg-[#0B4F5C] hover:bg-[#C5A059] text-white rounded-xl text-[10px] font-bold uppercase tracking-widest flex items-center justify-center shadow-md transition-all">
                            <Navigation size={14} className="mr-1.5" /> Navigate
                          </a>
                        </div>
                      </div>
                    </div>
                  )}

                  {item.transitText && (
                    <div className="mt-6 mb-2 pl-4 border-l-2 border-dashed border-[#C5A059]/50">
                      <p className="text-[13px] text-gray-500 italic font-medium flex items-center">
                        <Navigation size={12} className="mr-2 text-[#C5A059]" /> {item.transitText}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="pt-6 border-t border-gray-200">
              <button onClick={handleReset} className="w-full py-4 bg-white border border-gray-200 text-[#0B4F5C] rounded-2xl text-[11px] font-bold uppercase tracking-[0.2em] shadow-sm hover:bg-gray-50 transition-colors">
                Plan another day
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}