import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import AiExpertView from './AiExpertView';
import { 
  MapPin, Globe, CloudSun, ChevronDown, Navigation, ExternalLink, 
  Star, Smartphone, Monitor, Key, FileText, Wrench, Coffee, PhoneCall, Sparkles,
  Wifi, Copy, Check, Map, Clock, Award
} from 'lucide-react';

export default function GuestPortal() {
  const { propertySlug, typeSlug } = useParams(); 
  
  const [property, setProperty] = useState<any>(null);
  const [typeData, setTypeData] = useState<any>(null);
  const [guide, setGuide] = useState<any>(null);
  
  const [gems, setGems] = useState<any[]>([]);
  const [features, setFeatures] = useState<any[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeView, setActiveView] = useState<'portal' | 'aiExpert'>('portal');
  // Starts in mobile view by default!
  const [viewMode, setViewMode] = useState<'web' | 'mobile'>('mobile');
  const [openGuideSection, setOpenGuideSection] = useState<string | null>(null);
  const [copiedWifi, setCopiedWifi] = useState(false);
  const [showPropertyMap, setShowPropertyMap] = useState(false);
  
  const [gemFilters, setGemFilters] = useState<string[]>(['All']);
  const [featureFilter, setFeatureFilter] = useState<string>('All');
  const [expandedDesc, setExpandedDesc] = useState<Record<string, boolean>>({});
  const [activeGemMap, setActiveGemMap] = useState<string | null>(null);

  // NEW: Dynamic Weather State
  const [weather, setWeather] = useState<{temp: number, max: number, min: number, city: string} | null>(null);

  const getGuideIcon = (id: string) => {
    switch(id) {
      case 'checkIn': return <Key size={18} className="text-[#C5A059]" />;
      case 'rules': return <FileText size={18} className="text-[#0B4F5C]" />;
      case 'technical': return <Wrench size={18} className="text-gray-400" />;
      case 'daily': return <Coffee size={18} className="text-[#C5A059]" />;
      case 'emergency': return <PhoneCall size={18} className="text-red-400" />;
      default: return <Sparkles size={18} className="text-[#0B4F5C]" />;
    }
  };

  useEffect(() => {
    const fetchGuestData = async () => {
      if (!propertySlug || !typeSlug) return;
      try {
        const propQuery = query(collection(db, 'properties'), where('urlSlug', '==', propertySlug));
        const propSnap = await getDocs(propQuery);
        if (propSnap.empty) { setError("Property not found."); setLoading(false); return; }
        
        const propDoc = propSnap.docs[0];
        const propertyId = propDoc.id;
        setProperty(propDoc.data());

        const typesSnap = await getDocs(collection(db, 'properties', propertyId, 'propertyTypes'));
        let targetTypeId = null;
        let targetTypeData = null;
        
        typesSnap.forEach(doc => {
          const data = doc.data();
          const safeSlug = data.typeSlug || data.propertyTypeName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
          if (safeSlug === typeSlug) {
            targetTypeId = doc.id;
            targetTypeData = data;
          }
        });
        
        if (!targetTypeId) { setError("Unit not found."); setLoading(false); return; }
        const typeId = targetTypeId;
        setTypeData(targetTypeData);

        const guideDoc = await getDoc(doc(db, 'properties', propertyId, 'propertyTypes', typeId, 'houseGuide', 'data'));
        if (guideDoc.exists()) setGuide(guideDoc.data());

        const gemsSnap = await getDocs(collection(db, 'properties', propertyId, 'propertyTypes', typeId, 'localGems'));
        const loadedGems = gemsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        setGems(loadedGems);

        const featuresSnap = await getDocs(collection(db, 'properties', propertyId, 'features'));
        const loadedFeatures = featuresSnap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter((f: any) => f.showOnMain === true);
        setFeatures(loadedFeatures);

      } catch (err) {
        console.error("Error loading guest portal:", err);
        setError("Failed to load property data.");
      } finally {
        setLoading(false);
      }
    };
    fetchGuestData();
  }, [propertySlug, typeSlug]);

  // NEW: Fetch Dynamic Weather when Property Data Loads
  useEffect(() => {
    const fetchWeather = async () => {
      let lat = parseFloat(typeData?.latitude || property?.latitude);
      let lon = parseFloat(typeData?.longitude || property?.longitude);
      const displayCity = typeData?.city || typeData?.area || property?.city || property?.area || 'Local Area';

      // Fallback coordinates (Chania) just in case the property coords are missing
      if (isNaN(lat) || isNaN(lon)) {
        lat = 35.5138;
        lon = 24.0180;
      }

      try {
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&daily=temperature_2m_max,temperature_2m_min&timezone=auto`);
        const data = await res.json();
        
        if (data?.current_weather && data?.daily) {
          setWeather({
            temp: Math.round(data.current_weather.temperature),
            max: Math.round(data.daily.temperature_2m_max[0]),
            min: Math.round(data.daily.temperature_2m_min[0]),
            city: displayCity
          });
        }
      } catch (err) {
        console.error("Weather fetch error:", err);
      }
    };

    if (property || typeData) {
      fetchWeather();
    }
  }, [property, typeData]);

  const wifiName = typeData?.wifiName || guide?.wifiName || property?.wifiName;
  const wifiPassword = typeData?.wifiPassword || guide?.wifiPassword || property?.wifiPassword;

  const copyWifi = () => {
    if (wifiPassword) {
      navigator.clipboard.writeText(wifiPassword);
      setCopiedWifi(true);
      setTimeout(() => setCopiedWifi(false), 2000);
    }
  };

  const toggleDesc = (id: string) => {
    setExpandedDesc(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleGuide = (section: string) => {
    setOpenGuideSection(openGuideSection === section ? null : section);
  };

  const gemCategories = Array.from(new Set(gems.map(g => g.category).filter(Boolean)));
  const allGemFilterOptions = ['All', "Host's Picks", '< 5km', 'Day Trips', ...gemCategories];

  const handleGemFilterClick = (filter: string) => {
    if (filter === 'All') {
      setGemFilters(['All']);
    } else {
      let newFilters = gemFilters.includes('All') ? [] : [...gemFilters];
      if (newFilters.includes(filter)) {
        newFilters = newFilters.filter(f => f !== filter);
        if (newFilters.length === 0) newFilters = ['All'];
      } else {
        newFilters.push(filter);
      }
      setGemFilters(newFilters);
    }
  };

  const filteredGems = gems.filter(gem => {
    if (gemFilters.includes('All')) return true;
    let matches = false;
    if (gemFilters.includes("Host's Picks") && gem.isLegitPick) matches = true;
    if (gemFilters.includes('< 5km') && gem.distanceKm < 5) matches = true;
    if (gemFilters.includes('Day Trips') && gem.isDailyTrip) matches = true;
    if (gemFilters.includes(gem.category)) matches = true;
    return matches;
  });

  const featureCategories = ['All', ...Array.from(new Set(features.map(f => f.categories?.[0]).filter(Boolean)))];
  const filteredFeatures = featureFilter === 'All' ? features : features.filter(f => f.categories?.[0] === featureFilter);

  if (loading) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#F3F4F6] font-sans">
      <img src="../../../vailoLogo.png" alt="Vailo" className="h-12 w-auto mb-6 animate-pulse" />
      <div className="text-[#C5A059] tracking-[0.2em] text-[11px] uppercase font-bold">Preparing your experience</div>
    </div>
  );
  if (error) return <div className="min-h-screen flex items-center justify-center bg-[#F3F4F6] text-red-500 font-luxury text-lg">{error}</div>;

  return (
    <div className="min-h-screen bg-[#E5E7EB] flex flex-col items-center justify-start transition-all duration-500 relative pb-16 overflow-hidden font-sans">
      
      <style>
        {`
          @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=Lora:ital,wght@0,400;0,500;0,600;1,400;1,500&display=swap');
          .font-luxury { font-family: 'Lora', serif; }
          .font-sans { font-family: 'DM Sans', sans-serif; }
        `}
      </style>

      {/* FLOATING VIEW TOGGLE */}
      <div className="fixed bottom-6 right-6 z-50 hidden md:flex items-center bg-white text-gray-500 rounded-full p-1 shadow-[0_4px_20px_rgba(0,0,0,0.08)] border border-gray-200">
        <button onClick={() => setViewMode('mobile')} className={`p-2.5 rounded-full transition-all ${viewMode === 'mobile' ? 'bg-[#0B4F5C] text-[#C5A059] shadow-sm' : 'hover:bg-gray-100'}`}>
          <Smartphone size={18} />
        </button>
        <button onClick={() => setViewMode('web')} className={`p-2.5 rounded-full transition-all ${viewMode === 'web' ? 'bg-[#0B4F5C] text-[#C5A059] shadow-sm' : 'hover:bg-gray-100'}`}>
          <Monitor size={18} />
        </button>
      </div>

      <div className={`w-full transition-all duration-700 ease-in-out bg-[#F3F4F6] overflow-x-hidden flex flex-col ${
        viewMode === 'mobile' 
          ? 'md:max-w-[400px] md:mt-10 md:mb-10 md:rounded-[40px] md:shadow-[0_20px_60px_rgba(0,0,0,0.15)] md:border-[10px] md:border-gray-900 md:min-h-[800px] relative' 
          : 'max-w-none min-h-screen'
      }`}>
        
        {activeView === 'portal' ? (
          <>
            {/* TOP ELEGANT SPLIT BACKGROUND */}
            <div className="relative bg-gradient-to-b from-[#EAF0F0] to-[#E0E7E7] pt-8 pb-[60px] z-10 rounded-t-[40px] md:rounded-none shadow-[0_4px_20px_-10px_rgba(0,0,0,0.05)] border-b border-[#D4E0E0]">
              
              <div className="absolute inset-0 bg-[radial-gradient(#0B4F5C_1px,transparent_1px)] [background-size:30px_30px] opacity-[0.03]"></div>
              <div className="absolute top-[2%] right-[-10%] w-[300px] h-[300px] bg-[#C5A059] opacity-[0.06] blur-[80px] rounded-full"></div>
              <div className="absolute top-[10%] left-[-20%] w-[300px] h-[300px] bg-[#0B4F5C] opacity-[0.05] blur-[100px] rounded-full"></div>

              {/* ALIGNMENT FIX: Strict uniform wrapper for the top content */}
              <div className={`mx-auto relative z-10 px-5 ${viewMode === 'web' ? 'max-w-4xl' : 'max-w-md'}`}>
                
                <div className="flex justify-between items-center mb-5">
                  <button 
                    onClick={() => setShowPropertyMap(!showPropertyMap)}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-white shadow-sm rounded-full border border-gray-200 text-[#0B4F5C] hover:bg-gray-50 transition-all text-[11px] font-semibold uppercase tracking-[0.15em]"
                  >
                    <MapPin size={14} className="text-[#C5A059]" /> {showPropertyMap ? 'Hide Map' : 'Location'}
                  </button>
                  <button className="flex items-center justify-center h-9 w-9 bg-white shadow-sm rounded-full border border-gray-200 text-[#0B4F5C] hover:bg-gray-50 transition-all">
                    <Globe size={16} />
                  </button>
                </div>

                {showPropertyMap && typeData?.latitude && typeData?.longitude && (
                  <div className="mb-6 rounded-2xl overflow-hidden shadow-md border border-gray-200 animate-in slide-in-from-top-2 fade-in duration-200">
                    <iframe 
                      width="100%" height="200" frameBorder="0" scrolling="no" 
                      src={`https://maps.google.com/maps?q=${typeData.latitude},${typeData.longitude}&z=14&output=embed`}
                      className="bg-gray-100"
                    ></iframe>
                    <a 
                      href={`https://www.google.com/maps/search/?api=1&query=${typeData.latitude},${typeData.longitude}`} 
                      target="_blank" rel="noopener noreferrer"
                      className="block w-full py-2.5 bg-[#0B4F5C] text-white text-center text-[11px] font-semibold tracking-[0.15em] uppercase hover:bg-[#083A43] transition-colors"
                    >
                      Open in Maps App
                    </a>
                  </div>
                )}

                <div className="flex justify-center mb-6">
                  <img src="../../../vailoLogo.png" alt="Vailo" className="h-20 md:h-24 w-auto object-contain transition-all drop-shadow-sm" />
                </div>

                <div className="text-center">
                  <p className="text-[10px] md:text-[11px] font-bold text-[#C5A059] tracking-[0.2em] uppercase mb-3">Welcome to</p>
                  <h1 className="font-luxury text-3xl md:text-4xl lg:text-5xl text-[#051F26] leading-tight font-medium">
                    {property?.propertyName}
                  </h1>
                  {typeData?.propertyTypeName && (
                    <h2 className="font-luxury text-lg md:text-xl text-[#0B4F5C]/80 mt-1.5 mb-4 italic font-medium">
                      {typeData.propertyTypeName}
                    </h2>
                  )}
                  
                  <div className="flex items-center justify-center space-x-3 mb-8 mt-5">
                    <div className="h-[1px] w-8 bg-gradient-to-r from-transparent to-[#C5A059]/40"></div>
                    <p className="text-[9px] md:text-[10px] font-bold tracking-[0.15em] uppercase text-[#0B4F5C]/70">Discover local treasures – Enjoy your Vacations</p>
                    <div className="h-[1px] w-8 bg-gradient-to-l from-transparent to-[#C5A059]/40"></div>
                  </div>
                </div>

                {/* ALIGNMENT FIX: Removed double padding class, spanning 100% of parent */}
                <div className="w-full mb-4 relative z-30">
                  <button 
                    onClick={() => setActiveView('aiExpert')}
                    className="w-full bg-gradient-to-r from-[#051F26] to-[#0B4F5C] rounded-[1.25rem] p-4 md:p-5 flex items-center justify-between shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-0.5"
                  >
                    <div className="flex items-center gap-3 md:gap-4">
                      <div className="h-9 w-9 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                        <Sparkles size={18} className="text-[#C5A059]" />
                      </div>
                      <div className="text-left">
                        <p className="text-white text-[14px] md:text-[15px] font-medium tracking-wide">
                          <span className="font-bold text-[#C5A059]">Live like a local</span>
                        </p>
                        <p className="text-white/80 text-[11px] md:text-[12px] mt-0.5">Your AI travel expert</p>
                      </div>
                    </div>
                    <div className="text-white/50 p-1.5 rounded-full">
                      <ChevronDown size={18} className="-rotate-90" />
                    </div>
                  </button>
                </div>
              </div>
            </div>

            {/* ALIGNMENT FIX: Strict uniform px-5 grid */}
            <div className={`mx-auto px-5 -mt-[44px] relative z-30 ${viewMode === 'web' ? 'max-w-4xl' : 'max-w-md'}`}>
              <div className="bg-white/95 backdrop-blur-xl rounded-[1.25rem] p-4 flex items-center justify-between shadow-[0_10px_25px_-10px_rgba(11,79,92,0.15)] border border-white">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 md:h-14 md:w-14 bg-gradient-to-br from-[#FFF8E7] to-[#FBEBB5] rounded-full flex items-center justify-center shrink-0 shadow-inner border border-amber-100/50">
                    <CloudSun className="text-[#C5A059] w-6 h-6 md:w-7 md:h-7" />
                  </div>
                  <div>
                    <p className="font-luxury text-xl md:text-2xl text-[#0B4F5C] leading-none font-medium">
                      {weather ? `${weather.temp}°C` : '--°C'}
                    </p>
                    <div className="text-[10px] md:text-[11px] text-gray-500 font-bold tracking-[0.15em] uppercase mt-1 flex items-center">
                      <MapPin size={10} className="mr-1 text-[#C5A059]" /> 
                      {weather ? weather.city : 'Loading...'}
                    </div>
                  </div>
                </div>
                <div className="text-right pl-4 border-l border-gray-100">
                  <p className="text-[9px] md:text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em] mb-0.5">High/Low</p>
                  <p className="text-sm md:text-base font-luxury text-[#0B4F5C] font-medium">
                    {weather ? `${weather.max}° / ${weather.min}°` : '- / -'}
                  </p>
                </div>
              </div>
            </div>

            {wifiName && (
              /* ALIGNMENT FIX: Strict uniform px-5 grid */
              <div className={`mx-auto px-5 mt-4 relative z-30 ${viewMode === 'web' ? 'max-w-4xl' : 'max-w-md'}`}>
                <div className="bg-white rounded-[1.25rem] p-4 flex items-center justify-between shadow-sm border border-gray-100">
                  <div className="flex items-center gap-3">
                    <div className="bg-gray-100 p-2.5 rounded-xl border border-gray-200 text-[#0B4F5C]">
                      <Wifi size={18} />
                    </div>
                    <div>
                      <p className="text-[9px] font-bold text-gray-400 uppercase tracking-[0.15em] leading-none mb-1">Network</p>
                      <p className="text-[13px] font-bold text-gray-900 leading-none">{wifiName}</p>
                    </div>
                  </div>
                  
                  {wifiPassword && (
                    <div className="flex flex-col items-end">
                      <div className="flex items-center gap-2 bg-gray-100 pl-3 pr-1.5 py-1.5 rounded-lg border border-gray-200">
                        <p className="text-[12px] font-mono font-semibold text-gray-700 tracking-wide">{wifiPassword}</p>
                        <button 
                          onClick={copyWifi}
                          className={`p-1.5 rounded-md transition-colors ${copiedWifi ? 'bg-green-100 text-green-700' : 'bg-white hover:bg-gray-200 text-[#0B4F5C] shadow-sm'}`}
                        >
                          {copiedWifi ? <Check size={14} /> : <Copy size={14} />}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ALIGNMENT FIX: Strict uniform px-5 grid */}
            <div className={`mx-auto px-5 mt-10 space-y-12 pb-12 relative z-20 ${viewMode === 'web' ? 'max-w-4xl' : 'max-w-md'}`}>
              
              <section>
                <div className="mb-6 text-center">
                  <h2 className="font-luxury text-xl md:text-2xl text-[#051F26] font-medium">Property Guide</h2>
                </div>
                
                <div className="bg-white rounded-[1.5rem] shadow-sm border border-gray-100 overflow-hidden">
                  {[
                    { id: 'checkIn', title: 'Arrival Instructions', content: guide?.checkIn },
                    { id: 'rules', title: 'Property Rules', content: guide?.rules },
                    { id: 'technical', title: 'Appliance Guide', content: guide?.technical },
                    { id: 'daily', title: 'Daily Needs', content: guide?.daily },
                    { id: 'emergency', title: 'Emergency Info', content: guide?.emergency },
                  ].map((section, index) => (
                    <div key={section.id} className={index !== 0 ? 'border-t border-gray-100' : ''}>
                      <button 
                        onClick={() => toggleGuide(section.id)}
                        className="w-full flex items-center p-4 md:p-5 text-left hover:bg-gray-50/80 transition-colors group"
                      >
                        <div className="h-9 w-9 rounded-xl bg-white border border-gray-200 shadow-sm flex items-center justify-center mr-4 shrink-0 group-hover:scale-105 transition-all">
                          {getGuideIcon(section.id)}
                        </div>
                        <span className={`flex-1 font-luxury text-[15px] md:text-base transition-colors font-medium ${openGuideSection === section.id ? 'text-[#0B4F5C]' : 'text-gray-800'}`}>
                          {section.title}
                        </span>
                        <div className={`p-1.5 rounded-full transition-all ${openGuideSection === section.id ? 'bg-[#0B4F5C] text-white shadow-sm rotate-180' : 'text-gray-400'}`}>
                          <ChevronDown size={16} />
                        </div>
                      </button>
                      <div className={`transition-all duration-300 ease-in-out overflow-hidden ${openGuideSection === section.id ? 'max-h-[800px] opacity-100' : 'max-h-0 opacity-0'}`}>
                        <div className="px-5 pb-6 pt-1 ml-[3.25rem] text-[13px] text-gray-600 whitespace-pre-wrap leading-relaxed">
                          {section.content || 'Information will be provided shortly.'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {gems.length > 0 && (
                <section>
                  <div className="mb-6 text-center">
                    <h2 className="font-luxury text-xl md:text-2xl text-[#051F26] font-medium">Local Gems</h2>
                    <p className="text-[#C5A059] text-[10px] md:text-[11px] tracking-[0.15em] uppercase mt-2 font-bold">
                      Showing {filteredGems.length} spot{filteredGems.length !== 1 && 's'}
                    </p>
                  </div>
                  
                  <div className="flex flex-wrap gap-2.5 pb-6 justify-center items-center">
                    {allGemFilterOptions.map(filter => {
                      const isActive = gemFilters.includes(filter);
                      return (
                        <button 
                          key={filter}
                          onClick={() => handleGemFilterClick(filter)}
                          className={`whitespace-nowrap px-4 py-2 rounded-full text-[10px] uppercase tracking-[0.1em] font-bold transition-all ${
                            isActive 
                              ? 'bg-[#0B4F5C] text-white shadow-md border border-[#0B4F5C]' 
                              : 'bg-white text-gray-500 border border-gray-200 hover:border-[#C5A059] hover:text-[#0B4F5C]'
                          }`}
                        >
                          {filter}
                        </button>
                      );
                    })}
                  </div>

                  <div className={`grid gap-6 md:gap-8 ${viewMode === 'web' ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1'}`}>
                    {filteredGems.map(gem => (
                      <div key={gem.id} className="bg-white rounded-[1.5rem] shadow-sm border border-gray-200 overflow-hidden flex flex-col group">
                        <div className="relative h-48 bg-gray-100 overflow-hidden shrink-0">
                          {gem.photoUrl ? (
                            <img src={gem.photoUrl} alt={gem.name} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-[#C5A059]"><MapPin size={32} /></div>
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-[#051F26]/70 via-transparent to-transparent"></div>
                          
                          <div className="absolute top-4 left-4 flex flex-col gap-2 z-10">
                            {gem.isLegitPick && (
                              <span className="bg-white/95 text-[#0B4F5C] border border-white/50 text-[9px] uppercase tracking-[0.15em] font-bold px-3 py-1.5 rounded-full shadow-sm flex items-center w-fit">
                                <Award size={10} className="mr-1.5 text-[#C5A059]" /> Host's Pick
                              </span>
                            )}
                            {gem.isDailyTrip && (
                              <span className="bg-[#0B4F5C]/95 text-white border border-[#0B4F5C] text-[9px] uppercase tracking-[0.15em] font-bold px-3 py-1.5 rounded-full shadow-sm flex items-center w-fit">
                                <Clock size={10} className="mr-1.5 text-[#C5A059]" /> Day Trip
                              </span>
                            )}
                          </div>
                          
                          <div className="absolute bottom-4 left-4 right-4 z-10 flex justify-between items-end">
                            {gem.rating ? (
                              <span className="bg-white text-gray-900 text-[11px] font-bold px-2.5 py-1 rounded-full shadow-md flex items-center">
                                <Star size={12} className="mr-1 text-amber-400 fill-current" /> {gem.rating}
                              </span>
                            ) : <div></div>}
                            
                            {gem.distanceKm && (
                              <div className="flex flex-col items-end gap-1">
                                <span className="bg-[#C5A059] text-white text-[10px] font-bold px-2.5 py-1 rounded-full shadow-md flex items-center">
                                  <Navigation size={10} className="mr-1.5" /> {gem.distanceKm} km
                                </span>
                                <span className="text-white text-[10px] font-medium drop-shadow-md pr-1">
                                  ~{Math.round(gem.distanceKm * 2)} mins
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        {activeGemMap === gem.id && (
                          <div className="h-48 w-full bg-gray-100 border-b border-gray-200">
                            <iframe 
                              width="100%" height="100%" frameBorder="0" scrolling="no" 
                              src={`https://maps.google.com/maps?q=${gem.latitude},${gem.longitude}&z=14&output=embed`}
                            ></iframe>
                          </div>
                        )}

                        <div className="p-5 md:p-6 flex-1 flex flex-col">
                          <p className="text-[9px] text-[#C5A059] font-bold uppercase tracking-[0.15em] mb-2">{gem.category || 'Location'}</p>
                          <h3 className="font-luxury text-lg md:text-xl font-medium text-[#051F26] leading-tight mb-3">{gem.name}</h3>
                          
                          {gem.description && (
                            <div className="mb-5">
                              <p className={`text-[13px] text-gray-600 font-normal leading-relaxed ${!expandedDesc[gem.id] && 'line-clamp-2'}`}>
                                {gem.description}
                              </p>
                              {gem.description.length > 90 && (
                                <button onClick={() => toggleDesc(gem.id)} className="text-[#C5A059] text-[10px] font-bold mt-1.5 hover:underline uppercase tracking-widest">
                                  {expandedDesc[gem.id] ? 'Read Less' : 'Read More'}
                                </button>
                              )}
                            </div>
                          )}
                          
                          <div className="mt-auto pt-5 border-t border-gray-100 flex gap-3">
                            <button 
                              onClick={() => setActiveGemMap(activeGemMap === gem.id ? null : gem.id)}
                              className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-[#0B4F5C] rounded-xl text-[10px] uppercase tracking-[0.15em] font-bold transition-all flex items-center justify-center border border-gray-200"
                            >
                              <Map size={14} className="mr-1.5"/> Map
                            </button>
                            <a 
                              href={`https://www.google.com/maps/dir/?api=1&destination=${gem.latitude},${gem.longitude}`} 
                              target="_blank" rel="noopener noreferrer" 
                              className="flex-1 py-3 bg-[#0B4F5C] hover:bg-[#C5A059] text-white rounded-xl text-[10px] uppercase tracking-[0.15em] font-bold transition-all flex items-center justify-center shadow-sm"
                            >
                              <Navigation size={14} className="mr-1.5"/> Route
                            </a>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {features.length > 0 && (
                <section>
                  <div className="mb-6 text-center pt-8 border-t border-gray-200">
                    <h2 className="font-luxury text-xl md:text-2xl text-[#051F26] font-medium">Guest Services</h2>
                    <p className="text-[#C5A059] text-[10px] md:text-[11px] tracking-[0.15em] uppercase mt-2 font-bold">Trusted Partners</p>
                  </div>
                  
                  <div className="flex flex-wrap gap-2.5 pb-6 justify-center items-center">
                    {featureCategories.map(cat => (
                      <button 
                        key={cat} onClick={() => setFeatureFilter(cat)}
                        className={`whitespace-nowrap px-4 py-2 rounded-full text-[10px] uppercase tracking-[0.1em] font-bold transition-all ${
                          featureFilter === cat ? 'bg-[#0B4F5C] text-white shadow-sm' : 'bg-white text-gray-500 border border-gray-200 hover:border-[#C5A059]'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>

                  <div className={`grid gap-6 md:gap-8 ${viewMode === 'web' ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1'}`}>
                    {filteredFeatures.map(feature => (
                      <div key={feature.id} className="bg-white rounded-[1.5rem] shadow-sm border border-gray-200 overflow-hidden flex flex-col group">
                        <div className="relative h-44 bg-gray-100 overflow-hidden shrink-0">
                          {feature.photoUrl ? (
                            <img src={feature.photoUrl} alt={feature.businessName} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-[#C5A059]"><Sparkles size={28} /></div>
                          )}
                          <div className="absolute top-4 left-4 z-10">
                            {feature.liveLikeLocal && (
                              <span className="bg-[#C5A059]/95 text-white text-[9px] uppercase tracking-[0.15em] font-bold px-3 py-1.5 rounded-full shadow-sm flex items-center">
                                <Star size={10} className="mr-1.5 fill-current" /> Local Pick
                              </span>
                            )}
                          </div>
                        </div>
                        
                        <div className="p-5 md:p-6 flex-1 flex flex-col">
                          <p className="text-[9px] text-gray-400 font-bold uppercase tracking-[0.15em] mb-2">{feature.categories?.[0]}</p>
                          <h3 className="font-luxury text-base md:text-lg font-medium text-[#051F26] leading-tight mb-3">{feature.businessName}</h3>
                          {feature.description && <p className="text-[13px] text-gray-600 line-clamp-2 mb-5 font-normal leading-relaxed">{feature.description}</p>}
                          
                          <div className="mt-auto pt-5 border-t border-gray-100">
                            <a 
                              href={feature.website || (feature.phone ? `tel:${feature.phone}` : '#')} 
                              target={feature.website ? "_blank" : "_self"} 
                              rel="noopener noreferrer" 
                              className="w-full py-3 bg-gray-100 hover:bg-[#0B4F5C] text-[#0B4F5C] hover:text-[#C5A059] rounded-xl text-[10px] uppercase tracking-[0.15em] font-bold transition-all flex items-center justify-center border border-gray-200"
                            >
                              <ExternalLink size={14} className="mr-2"/> Connect
                            </a>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <div className="text-center pt-10 pb-8 mt-10 relative z-20">
                <img src="../../../vailoLogo.png" alt="Vailo" className="h-8 md:h-10 w-auto mx-auto mb-4 grayscale opacity-50 hover:grayscale-0 hover:opacity-100 transition-all" />
                <p className="text-[9px] font-bold text-gray-500 tracking-[0.2em] uppercase">Powered by Vailo AI Concierge</p>
              </div>

            </div>
          </>
        ) : (
          <AiExpertView 
            onClose={() => setActiveView('portal')}
            property={property}
            propertyType={typeData}
            features={features}
            gems={gems}
          />
        )}
      </div>
    </div>
  );
}