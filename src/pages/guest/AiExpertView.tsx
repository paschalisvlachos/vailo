import { useState, useEffect, useRef } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { getGenerativeModel } from "firebase/ai";
import { ai, db } from '../../lib/firebase';
import { Sparkles, ArrowLeft, Navigation, Clock, MapPin, Send, Loader2, User, Bot, Map as MapIcon, Car } from 'lucide-react';

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

type Step = 'LOCATION' | 'DISTANCE' | 'TRANSPORT' | 'CATEGORIES' | 'TIME' | 'DONE';

export default function AiExpertView({ onClose, property, propertyType, features, gems }: AiExpertViewProps) {
  // Chat & Flow State
  const [messages, setMessages] = useState<Message[]>([]);
  const [step, setStep] = useState<Step>('LOCATION');
  const [chatInput, setChatInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Data & Dynamic States
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [dynamicDistances, setDynamicDistances] = useState<string[]>([]);
  
  // User Preferences
  const [preferences, setPreferences] = useState({
    location: '',
    distance: '',
    transport: '',
    categories: [] as string[],
    timeFrame: ''
  });

  // UI Temp States
  const [customLoc, setCustomLoc] = useState('');
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');

  // 1. Initial Greeting & Category Fetching
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
    fetchCategories();
  }, [property, propertyType]);

  // Auto-scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, step, dynamicDistances]);

  // --- DATABASE HELPER (Now Includes Photos and Map URLs) ---
  const getDbSummary = () => ({
    gems: gems?.map(g => ({ name: g.name, category: g.category, description: g.description, distance: g.distanceKm ? `${g.distanceKm}km` : 'Local', photoUrl: g.photoUrl || '', googleMapsUrl: g.googleMapsUrl || '' })) || [],
    features: features?.map(f => ({ name: f.name, category: f.categories?.join(', '), description: f.description, photoUrl: f.photoUrl || '', googleMapsUrl: f.googleMapsUrl || '' })) || []
  });

  // --- STATE MACHINE LOGIC ---
  const advanceStep = async (currentStep: Step, value: any, displayText: string) => {
    setPreferences(prev => ({ ...prev, [currentStep.toLowerCase()]: value }));
    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', type: 'text', text: displayText }]);

    if (currentStep === 'LOCATION') {
      setStep('DISTANCE');
      await generateCleverDistances(value);
    } else if (currentStep === 'DISTANCE') {
      setStep('TRANSPORT');
    } else if (currentStep === 'TRANSPORT') {
      setStep('CATEGORIES');
    } else if (currentStep === 'CATEGORIES') {
      setStep('TIME');
    }
  };

  const generateCleverDistances = async (loc: string) => {
    setIsThinking(true);
    try {
      const model = getGenerativeModel(ai, { model: "gemini-2.5-flash" }); 
      const prompt = `The user wants to start a day trip from "${loc}" in ${property?.city || property?.country || 'Greece'}. 
      Propose 3 realistic, clever travel radius options (e.g. Walking, Short Drive, Island Exploration). 
      Return ONLY a JSON array of 3 strings. Example: ["Walking distance (2km)", "Short drive (15km)", "Full day tour (50km+)"]`;
      
      const result = await model.generateContent(prompt);
      
      let text = result.response.text();
      const firstBracket = text.indexOf('[');
      const lastBracket = text.lastIndexOf(']');
      if (firstBracket !== -1 && lastBracket !== -1) {
        text = text.slice(firstBracket, lastBracket + 1);
      }
      
      setDynamicDistances(JSON.parse(text));
    } catch (e) {
      setDynamicDistances(["Walking distance only", "Short trip (up to 30 mins)", "Explore the region (1+ hours)"]);
    } finally {
      setIsThinking(false);
    }
  };

  // --- THE BUTTON-CLICK ORCHESTRATOR ---
  const executePlan = async (timeFrameStr: string) => {
    setPreferences(prev => ({ ...prev, timeFrame: timeFrameStr }));
    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', type: 'text', text: timeFrameStr ? `Time: ${timeFrameStr}` : 'Flexible timing' }]);
    
    setStep('DONE');
    setIsThinking(true);
    
    try {
      const model = getGenerativeModel(ai, { model: "gemini-2.5-pro" });

      let promptText = `
        You are an elite, local luxury concierge for ${propertyType?.city || property?.city || 'Greece'}. 
        Plan a day starting from: ${preferences.location}.
        Max Distance: ${preferences.distance}. 
        Transport method: ${preferences.transport}.
        Requested Categories: ${preferences.categories.join(', ')}.

        VAILO DATABASE (Use these first!):
        ${JSON.stringify(getDbSummary())}

        CONCIERGE RULES:
        1. PRIORITIZE DATABASE: You MUST try to use the items from the VAILO DATABASE above if they match the categories. Aim for a 60% database / 40% AI knowledge split.
        2. SPECIFIC PLACES ONLY: NEVER recommend generic areas, concepts, or neighborhoods. You MUST recommend specific, named businesses, restaurants, beaches, museums, or landmarks.
        3. SMART CLUSTERING: Group activities by geography. Do not make the guest travel back and forth across long distances.
        4. NO TOURIST TRAPS: When using your own AI knowledge, suggest hidden, authentic, highly-rated local spots.
      `;

      if (timeFrameStr) {
        promptText += `
        5. TIMEFLOW: The guest selected this timeframe: "${timeFrameStr}".
        6. LOGICAL ORDERING: Order activities chronologically and logically.
        
        You MUST return ONLY a valid JSON object matching this exact schema, with absolutely no markdown formatting or extra text:
        {
          "type": "timeline",
          "plan": [
            {
              "time": "e.g., 10:00 AM",
              "title": "Specific Name of Activity/Place",
              "description": "Engaging 2-sentence description of why they will love it.",
              "transportToNext": "e.g., 15 mins by Car",
              "source": "database or ai",
              "photoUrl": "Exact URL from database or empty string if AI",
              "googleMapsUrl": "Exact URL from database or empty string if AI"
            }
          ]
        }`;
      } else {
        promptText += `
        5. NO TIMEFRAME: The guest did not specify a timeframe.
        6. TOP 4 PICKS: For EACH of the requested categories (${preferences.categories.join(', ')}), provide EXACTLY 4 recommendations.

        You MUST return ONLY a valid JSON object matching this exact schema, with absolutely no markdown formatting or extra text:
        {
          "type": "picks",
          "categories": [
            {
              "categoryName": "Name of Category",
              "items": [
                {
                  "title": "Specific Name of Place/Activity",
                  "description": "Engaging 2-sentence description.",
                  "estimatedDistance": "e.g., 10 mins away",
                  "source": "database or ai",
                  "photoUrl": "Exact URL from database or empty string if AI",
                  "googleMapsUrl": "Exact URL from database or empty string if AI"
                }
              ]
            }
          ]
        }`;
      }

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

  // --- THE UNIFIED CHAT ORCHESTRATOR ---
  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userText = chatInput;
    setChatInput('');
    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', type: 'text', text: userText }]);
    
    if (step !== 'DONE') setStep('DONE');
    
    setIsThinking(true);

    try {
      const model = getGenerativeModel(ai, { model: "gemini-2.5-pro" });
      
      const conversationHistory = messages.map(m => {
        if (m.type === 'plan') return `AI generated this plan on screen: ${JSON.stringify(m.data)}`;
        return `${m.role === 'ai' ? 'AI Concierge' : 'Guest'}: ${m.text}`;
      }).join('\n\n');

      const prompt = `
        You are the elite Vailo AI Concierge for ${property?.propertyName} in ${propertyType?.city || property?.city || 'Greece'}.
        Current itinerary preferences (may be empty if user bypassed steps): ${JSON.stringify(preferences)}.
        
        CONVERSATION HISTORY (What is currently on the screen):
        ${conversationHistory}
        
        VAILO DATABASE (Use these first!):
        ${JSON.stringify(getDbSummary())}

        STRICT RULES:
        1. ONLY answer questions related to local travel, day planning, itineraries, and "live like a local" advice. Decline off-topic/personal questions politely.
        2. ULTRA CLEVER LOCAL EXPERT: 100% prioritize the VAILO DATABASE. If the user asks for recommendations, explicitly select the best matches from the database. 
        3. SPECIFIC PLACES ONLY: NEVER recommend generic areas. You MUST recommend specific, named businesses, restaurants, beaches, museums, or landmarks.
        4. PRESENTATION IS EVERYTHING: If the user asks for recommendations, filters previous results, asks for top choices, or asks to plan their day via chat, you MUST return a beautiful plan using the JSON 'plan' object (either 'picks' or 'timeline'). DO NOT list recommendations in plain text.

        YOUR OUTPUT FORMAT:
        You MUST return ONLY a valid JSON object matching this exact schema (no markdown formatting):
        {
          "replyText": "Your conversational response. Keep it brief and luxurious. (Can be empty if the plan speaks for itself)",
          "hasPlan": true/false, // True if you are providing recommendations/itineraries, false if just chatting
          "plan": null OR { // MUST match this schema if hasPlan is true!
            "type": "picks" OR "timeline",
            "plan": [ { "time": "...", "title": "Specific Place Name", "description": "...", "transportToNext": "...", "source": "database or ai", "photoUrl": "URL or empty", "googleMapsUrl": "URL or empty" } ],
            "categories": [ { "categoryName": "...", "items": [ { "title": "Specific Place Name", "description": "...", "estimatedDistance": "...", "source": "database or ai", "photoUrl": "URL or empty", "googleMapsUrl": "URL or empty" } ] } ]
          }
        }

        User Query: ${userText}
      `;

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
    setPreferences({ location: '', distance: '', transport: '', categories: [], timeFrame: '' });
    setSelectedCats([]);
    setCustomLoc('');
    setStartTime('');
    setEndTime('');
    setMessages([
      { id: Date.now().toString(), role: 'ai', type: 'text', text: "Let's plan another exciting day! Where are we starting from?" }
    ]);
  };

  // --- RENDERERS ---
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

            {/* TIMELINE RENDERER */}
            {msg.data.type === 'timeline' && (
              <div className="space-y-6 pt-2">
                {msg.data.plan?.map((item: any, idx: number) => (
                  <div key={idx} className="relative pl-6 pb-6 border-l-2 border-[#0B4F5C]/20 last:border-0 last:pb-0">
                    <div className="absolute w-3 h-3 bg-[#C5A059] rounded-full -left-[7px] top-1 shadow-sm" />
                    <p className="font-bold text-[#0B4F5C] text-sm mb-1">{item.time}</p>
                    
                    <div className="bg-gray-50 border border-gray-100 rounded-xl overflow-hidden mt-2">
                      {item.photoUrl && (
                        <img src={item.photoUrl} alt={item.title} className="w-full h-32 object-cover" />
                      )}
                      <div className="p-4">
                        <h4 className="font-bold text-gray-900 text-base flex items-center gap-2 mb-2">
                          {item.title}
                          {item.source === 'database' && <span className="bg-[#C5A059]/10 text-[#C5A059] text-[9px] px-2 py-0.5 rounded-full uppercase tracking-wider">Vailo Curated</span>}
                        </h4>
                        <p className="text-gray-600 text-sm leading-relaxed mb-4">{item.description}</p>
                        
                        <div className="flex gap-2 pt-4 border-t border-gray-200/60">
                          <a href={item.googleMapsUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.title)}`} target="_blank" rel="noopener noreferrer" className="flex-1 py-2.5 bg-white border border-gray-200 hover:border-[#0B4F5C] text-[#0B4F5C] rounded-lg text-[10px] font-bold uppercase tracking-widest flex items-center justify-center transition-colors">
                            <MapIcon size={14} className="mr-1.5" /> Map
                          </a>
                          <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(item.title)}`} target="_blank" rel="noopener noreferrer" className="flex-1 py-2.5 bg-[#0B4F5C] hover:bg-[#C5A059] text-white rounded-lg text-[10px] font-bold uppercase tracking-widest flex items-center justify-center transition-colors shadow-sm">
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

            {/* TOP PICKS RENDERER */}
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
                          {item.photoUrl && (
                            <img src={item.photoUrl} alt={item.title} className="w-full h-32 object-cover" />
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
                              <a href={item.googleMapsUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.title)}`} target="_blank" rel="noopener noreferrer" className="flex-1 py-2.5 bg-white border border-gray-200 hover:border-[#0B4F5C] text-[#0B4F5C] rounded-lg text-[10px] font-bold uppercase tracking-widest flex items-center justify-center transition-colors">
                                <MapIcon size={14} className="mr-1.5" /> Map
                              </a>
                              <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(item.title)}`} target="_blank" rel="noopener noreferrer" className="flex-1 py-2.5 bg-[#0B4F5C] hover:bg-[#C5A059] text-white rounded-lg text-[10px] font-bold uppercase tracking-widest flex items-center justify-center transition-colors shadow-sm">
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

    // Standard Conversational Bubble (No Plan Another Day button here)
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
      
      {/* Header */}
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

      {/* Scrollable Chat Area */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar flex flex-col">
        {messages.map(renderMessage)}

        {/* --- DYNAMIC STEP UI INJECTED AT BOTTOM OF CHAT --- */}
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

            {step === 'DISTANCE' && (
              <div className="ml-10 max-w-[85%]">
                <p className="text-sm text-gray-600 font-medium mb-3">How far from <span className="font-bold">{preferences.location}</span> are you willing to travel?</p>
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

            {step === 'TRANSPORT' && (
              <div className="ml-10 max-w-[85%]">
                <p className="text-sm text-gray-600 font-medium mb-3">How will you be getting around?</p>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => advanceStep('TRANSPORT', 'Car / Taxi', 'Car / Taxi')} className="bg-white border border-[#C5A059]/40 text-[#0B4F5C] p-4 rounded-xl text-sm font-bold hover:bg-[#C5A059]/5 transition-colors shadow-sm flex flex-col items-center gap-2">
                    <Car size={24} /> Car / Taxi
                  </button>
                  <button onClick={() => advanceStep('TRANSPORT', 'Public Transport / Walk', 'Public Transport / Walk')} className="bg-white border border-[#C5A059]/40 text-[#0B4F5C] p-4 rounded-xl text-sm font-bold hover:bg-[#C5A059]/5 transition-colors shadow-sm flex flex-col items-center gap-2 text-center">
                    <MapIcon size={24} /> Transit / Walk
                  </button>
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

      {/* Persistent Chat Input Box */}
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