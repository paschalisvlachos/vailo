import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import AiExpertView from './AiExpertView';
import LegalDocumentModal from '../../components/guest/LegalDocumentModal';
import GuestLegalFooter from '../../components/guest/GuestLegalFooter';
import GuestFloatingActions from '../../components/guest/GuestFloatingActions';
import GuestReportIssueSheet from '../../components/guest/GuestReportIssueSheet';
import GuestPropertyAssistant from '../../components/guest/GuestPropertyAssistant';
import PropertyEssentials from '../../components/guest/PropertyEssentials';
import type { FeaturedKey, FeaturedPreviewsMap } from '../../lib/houseGuidePortal';
import { usePlatformLegal } from '../../hooks/usePlatformLegal';
import { 
  MapPin, Globe, CloudSun, ChevronDown, Navigation, ExternalLink, 
  Star, Smartphone, Monitor, Sparkles,
  Wifi, Copy, Check, Map, Clock, Award
} from 'lucide-react';

export default function GuestPortal() {
  const { propertySlug, typeSlug } = useParams(); 
  
  const [property, setProperty] = useState<any>(null);
  const [propertyId, setPropertyId] = useState<string | null>(null);
  const [typeId, setTypeId] = useState<string | null>(null);
  const [typeData, setTypeData] = useState<any>(null);
  const [guide, setGuide] = useState<any>(null);
  
  const [gems, setGems] = useState<any[]>([]);
  const [features, setFeatures] = useState<any[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeView, setActiveView] = useState<'portal' | 'aiExpert' | 'assistant'>('portal');
  // Starts in mobile view by default!
  const [viewMode, setViewMode] = useState<'web' | 'mobile'>('mobile');
  const [copiedWifi, setCopiedWifi] = useState(false);
  const [showPropertyMap, setShowPropertyMap] = useState(false);
  
  const [gemFilters, setGemFilters] = useState<string[]>(['All']);
  const [featureFilter, setFeatureFilter] = useState<string>('All');
  const [expandedDesc, setExpandedDesc] = useState<Record<string, boolean>>({});
  const [activeGemMap, setActiveGemMap] = useState<string | null>(null);
  const [legalModal, setLegalModal] = useState<'privacy' | 'terms' | null>(null);
  const [reportSheetOpen, setReportSheetOpen] = useState(false);
  const { content: platformLegal } = usePlatformLegal();

  // NEW: Dynamic Weather State
  const [weather, setWeather] = useState<{temp: number, max: number, min: number, city: string} | null>(null);


  useEffect(() => {
    const fetchGuestData = async () => {
      if (!propertySlug || !typeSlug) return;
      try {
        const propQuery = query(collection(db, 'properties'), where('urlSlug', '==', propertySlug));
        const propSnap = await getDocs(propQuery);
        if (propSnap.empty) { setError("Property not found."); setLoading(false); return; }
        
        const propDoc = propSnap.docs[0];
        const resolvedPropertyId = propDoc.id;
        setPropertyId(resolvedPropertyId);
        setProperty({ id: resolvedPropertyId, ...propDoc.data() });

        const typesSnap = await getDocs(collection(db, 'properties', resolvedPropertyId, 'propertyTypes'));
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
        setTypeId(targetTypeId);
        setTypeData(targetTypeData);

        const guideDoc = await getDoc(
          doc(db, 'properties', resolvedPropertyId, 'propertyTypes', targetTypeId, 'houseGuide', 'data')
        );
        if (guideDoc.exists()) setGuide(guideDoc.data());

        const gemsSnap = await getDocs(
          collection(db, 'properties', resolvedPropertyId, 'propertyTypes', targetTypeId, 'localGems')
        );
        const loadedGems = gemsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        setGems(loadedGems);

        const featuresSnap = await getDocs(collection(db, 'properties', resolvedPropertyId, 'features'));
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

  const featuredOnPortal: FeaturedKey[] = Array.isArray(guide?.featuredOnPortal)
    ? (guide.featuredOnPortal as unknown[]).filter((k): k is FeaturedKey => typeof k === 'string').slice(0, 4)
    : [];
  const featuredPreviews: FeaturedPreviewsMap =
    guide && typeof guide.previews === 'object' && guide.previews !== null
      ? (guide.previews as FeaturedPreviewsMap)
      : {};
  const heroPhoto = typeData?.photoUrl || property?.photoUrl || '';
  const heroLocation = typeData?.city || typeData?.area || property?.city || property?.area || '';

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
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#051F26] font-sans">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Lora:wght@400;500;600&display=swap');`}</style>
      <div className="relative w-16 h-16 mb-8">
        <div className="absolute inset-0 rounded-full border-2 border-[#C5A059]/30 border-t-[#C5A059] animate-spin" />
        <img src="/vailoLogo.png" alt="" className="absolute inset-2 w-auto h-auto object-contain opacity-90" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
      </div>
      <p className="text-[#C5A059] tracking-[0.25em] text-[10px] uppercase font-semibold">Preparing your stay</p>
    </div>
  );
  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-[#F3F4F6] px-6 font-sans">
      <div className="text-center max-w-sm">
        <p className="font-luxury text-xl text-[#051F26] mb-2">Something went wrong</p>
        <p className="text-red-500/90 text-sm">{error}</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#E8ECEB] flex flex-col items-center justify-start transition-all duration-500 relative pb-16 overflow-hidden font-sans">
      
      <style>
        {`
          @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=Lora:ital,wght@0,400;0,500;0,600;1,400;1,500&display=swap');
          .font-luxury { font-family: 'Lora', serif; }
          .font-sans { font-family: 'DM Sans', sans-serif; }
          .hero-text-shadow { text-shadow: 0 2px 24px rgba(0,0,0,0.35); }
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

      <div className={`w-full transition-all duration-700 ease-in-out bg-[#F3F4F6] overflow-x-hidden flex flex-col relative ${
        viewMode === 'mobile' 
          ? 'md:max-w-[400px] md:mt-10 md:mb-10 md:rounded-[40px] md:shadow-[0_24px_80px_rgba(0,0,0,0.18)] md:border-[8px] md:border-gray-900 md:min-h-[800px] md:overflow-hidden' 
          : 'max-w-none min-h-screen'
      }`}>
        
        {activeView === 'portal' ? (
          <>
            {/* ── HERO: property photo + overlay content ── */}
            <section className="relative z-10">
              <div className={`relative overflow-hidden ${viewMode === 'mobile' ? 'md:rounded-t-[30px]' : ''}`}>
                {/* Background photo or fallback gradient */}
                <div className="absolute inset-0">
                  {heroPhoto ? (
                    <img
                      src={heroPhoto}
                      alt={typeData?.propertyTypeName || property?.propertyName || 'Your stay'}
                      className="w-full h-full object-cover scale-105"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-[#0B4F5C] via-[#083A43] to-[#051F26]" />
                  )}
                </div>

                {/* Layered overlays for legibility */}
                <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/25 to-[#F3F4F6]" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#051F26]/80 via-transparent to-black/30" />

                <div className={`relative mx-auto px-5 pt-5 pb-28 min-h-[420px] flex flex-col ${viewMode === 'web' ? 'max-w-4xl' : 'max-w-md'}`}>
                  {/* Top bar */}
                  <div className="flex justify-between items-center mb-auto">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/20">
                      <img src="/vailoLogo.png" alt="Vailo" className="h-5 w-auto brightness-0 invert opacity-95" onError={(e) => { (e.target as HTMLImageElement).src = '../../../vailoLogo.png'; }} />
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setShowPropertyMap(!showPropertyMap)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-white/12 backdrop-blur-md border border-white/25 text-white text-[10px] font-semibold uppercase tracking-wider hover:bg-white/20 transition-all"
                      >
                        <MapPin size={13} className="text-[#C5A059]" />
                        {showPropertyMap ? 'Hide' : 'Map'}
                      </button>
                      <button className="flex items-center justify-center h-9 w-9 rounded-full bg-white/12 backdrop-blur-md border border-white/25 text-white hover:bg-white/20 transition-all">
                        <Globe size={15} />
                      </button>
                    </div>
                  </div>

                  {showPropertyMap && typeData?.latitude && typeData?.longitude && (
                    <div className="mt-4 rounded-2xl overflow-hidden shadow-2xl border border-white/20 animate-in slide-in-from-top-2 fade-in duration-200">
                      <iframe
                        width="100%" height="180" frameBorder="0" scrolling="no"
                        title="Property location"
                        src={`https://maps.google.com/maps?q=${typeData.latitude},${typeData.longitude}&z=14&output=embed`}
                        className="bg-gray-100"
                      />
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${typeData.latitude},${typeData.longitude}`}
                        target="_blank" rel="noopener noreferrer"
                        className="block w-full py-2.5 bg-[#0B4F5C] text-white text-center text-[10px] font-semibold tracking-widest uppercase hover:bg-[#083A43] transition-colors"
                      >
                        Open in Maps
                      </a>
                    </div>
                  )}

                  {/* Hero copy */}
                  <div className="mt-8 text-center hero-text-shadow">
                    <p className="text-[10px] font-semibold text-[#C5A059] tracking-[0.3em] uppercase mb-2">Welcome to</p>
                    <h1 className="font-luxury text-[2rem] md:text-4xl lg:text-[2.75rem] text-white leading-[1.15] font-medium">
                      {property?.propertyName}
                    </h1>
                    {typeData?.propertyTypeName && (
                      <p className="font-luxury text-lg md:text-xl text-white/85 mt-2 italic">
                        {typeData.propertyTypeName}
                      </p>
                    )}
                    {heroLocation && (
                      <p className="text-white/60 text-xs mt-3 flex items-center justify-center gap-1.5">
                        <MapPin size={12} className="text-[#C5A059]" /> {heroLocation}
                      </p>
                    )}
                  </div>

                  {/* Live Like a Local — glass CTA on hero */}
                  <div className="mt-8 w-full">
                    <button
                      onClick={() => setActiveView('aiExpert')}
                      className="group w-full rounded-2xl p-[1px] bg-gradient-to-r from-[#C5A059]/60 via-white/30 to-[#C5A059]/40 shadow-[0_8px_32px_rgba(0,0,0,0.25)] hover:shadow-[0_12px_40px_rgba(0,0,0,0.35)] transition-all duration-300 hover:-translate-y-0.5"
                    >
                      <div className="rounded-[0.9rem] bg-white/12 backdrop-blur-xl px-4 py-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-[#C5A059] to-[#a88648] flex items-center justify-center shrink-0 shadow-lg">
                            <Sparkles size={20} className="text-white" />
                          </div>
                          <div className="text-left">
                            <p className="text-white text-[15px] font-semibold tracking-wide">
                              Live like a local
                            </p>
                            <p className="text-white/65 text-[11px] mt-0.5">Your AI travel expert · curated picks</p>
                          </div>
                        </div>
                        <div className="h-8 w-8 rounded-full bg-white/15 flex items-center justify-center text-white/80 group-hover:bg-white/25 transition-colors">
                          <ChevronDown size={18} className="-rotate-90" />
                        </div>
                      </div>
                    </button>
                  </div>
                </div>
              </div>
            </section>

            {/* Weather + Wi‑Fi — same width & card style as Live like a local */}
            <div className={`mx-auto px-5 -mt-14 relative z-20 w-full space-y-3 ${viewMode === 'web' ? 'max-w-4xl' : 'max-w-md'}`}>
              <div className="group w-full rounded-2xl p-[1px] bg-gradient-to-r from-[#C5A059]/50 via-white/40 to-[#C5A059]/50 shadow-[0_8px_32px_rgba(11,79,92,0.14)] hover:shadow-[0_12px_40px_rgba(11,79,92,0.2)] transition-all duration-300 hover:-translate-y-0.5">
                <div className="rounded-[0.9rem] bg-white/95 backdrop-blur-xl px-4 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-[#FFF8E7] to-[#FBEBB5] flex items-center justify-center shrink-0 shadow-inner">
                      <CloudSun className="text-[#C5A059] w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-luxury text-2xl text-[#0B4F5C] leading-none font-medium">
                        {weather ? `${weather.temp}°` : '—°'}
                      </p>
                      <p className="text-[10px] text-gray-500 font-semibold tracking-wider uppercase mt-1 flex items-center">
                        <MapPin size={10} className="mr-1 text-[#C5A059]" />
                        {weather ? weather.city : 'Loading…'}
                      </p>
                    </div>
                  </div>
                  <div className="text-right pl-4 border-l border-gray-100">
                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Today</p>
                    <p className="text-sm font-luxury text-[#0B4F5C] font-medium">
                      {weather ? `${weather.max}° / ${weather.min}°` : '— / —'}
                    </p>
                  </div>
                </div>
              </div>

              {wifiName && (
                <div className="group w-full rounded-2xl p-[1px] bg-gradient-to-r from-[#C5A059]/50 via-white/40 to-[#C5A059]/50 shadow-[0_8px_32px_rgba(11,79,92,0.14)] hover:shadow-[0_12px_40px_rgba(11,79,92,0.2)] transition-all duration-300 hover:-translate-y-0.5">
                  <div className="rounded-[0.9rem] bg-white/95 backdrop-blur-xl px-4 py-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-[#0B4F5C]/10 to-[#0B4F5C]/5 flex items-center justify-center shrink-0">
                        <Wifi size={18} className="text-[#0B4F5C]" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider leading-none mb-1">Wi‑Fi</p>
                        <p className="text-sm font-semibold text-gray-900 truncate">{wifiName}</p>
                      </div>
                    </div>
                    {wifiPassword && (
                      <div className="flex items-center gap-2 bg-gray-50 pl-3 pr-1.5 py-1.5 rounded-xl border border-gray-100 shrink-0">
                        <p className="text-xs font-mono font-semibold text-gray-600">{wifiPassword}</p>
                        <button
                          onClick={copyWifi}
                          className={`p-1.5 rounded-lg transition-colors ${copiedWifi ? 'bg-emerald-100 text-emerald-700' : 'bg-white hover:bg-gray-100 text-[#0B4F5C] shadow-sm'}`}
                          aria-label="Copy Wi-Fi password"
                        >
                          {copiedWifi ? <Check size={14} /> : <Copy size={14} />}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Main content */}
            <div className={`mx-auto px-5 mt-10 space-y-14 pb-32 relative z-10 ${viewMode === 'web' ? 'max-w-4xl' : 'max-w-md'}`}>
              <PropertyEssentials
                featuredOnPortal={featuredOnPortal}
                previews={featuredPreviews}
                onAskAssistant={() => setActiveView('assistant')}
              />

              {gems.length > 0 && (
                <section>
                  <div className="mb-5">
                    <p className="text-[10px] font-bold text-[#C5A059] tracking-[0.25em] uppercase mb-1">Curated by your host</p>
                    <h2 className="font-luxury text-2xl text-[#051F26] font-medium">Local Gems</h2>
                    <p className="text-gray-500 text-xs mt-1.5">
                      {filteredGems.length} spot{filteredGems.length !== 1 && 's'} · places locals love
                    </p>
                  </div>
                  
                  <div className="flex flex-wrap gap-2 pb-6">
                    {allGemFilterOptions.map(filter => {
                      const isActive = gemFilters.includes(filter);
                      return (
                        <button 
                          key={filter}
                          onClick={() => handleGemFilterClick(filter)}
                          className={`whitespace-nowrap px-3.5 py-2 rounded-full text-[10px] uppercase tracking-wider font-semibold transition-all ${
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

                  <div className={`grid gap-6 md:gap-8 ${viewMode === 'web' ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1'}`}>
                    {filteredGems.map(gem => (
                      <div key={gem.id} className="bg-white rounded-2xl shadow-[0_4px_24px_-8px_rgba(11,79,92,0.1)] border border-gray-100/80 overflow-hidden flex flex-col group hover:shadow-[0_8px_32px_-8px_rgba(11,79,92,0.15)] transition-shadow duration-300">
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
                  <div className="mb-5 pt-4 border-t border-gray-200/60">
                    <p className="text-[10px] font-bold text-[#C5A059] tracking-[0.25em] uppercase mb-1">Partners</p>
                    <h2 className="font-luxury text-2xl text-[#051F26] font-medium">Guest Services</h2>
                    <p className="text-gray-500 text-xs mt-1.5">Trusted local partners</p>
                  </div>
                  
                  <div className="flex flex-wrap gap-2 pb-6">
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
                      <div key={feature.id} className="bg-white rounded-2xl shadow-[0_4px_24px_-8px_rgba(11,79,92,0.1)] border border-gray-100/80 overflow-hidden flex flex-col group hover:shadow-[0_8px_32px_-8px_rgba(11,79,92,0.15)] transition-shadow duration-300">
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

              <GuestLegalFooter
                onPrivacyClick={() => setLegalModal('privacy')}
                onTermsClick={() => setLegalModal('terms')}
              />

            </div>

          </>
        ) : activeView === 'aiExpert' ? (
          <AiExpertView 
            onClose={() => setActiveView('portal')}
            property={property}
            propertyType={typeData}
            features={features}
            gems={gems}
          />
        ) : (
          <GuestPropertyAssistant
            property={property}
            propertyType={typeData}
            guide={guide}
            onClose={() => setActiveView('portal')}
            onOpenPrivacy={() => setLegalModal('privacy')}
            onOpenTerms={() => setLegalModal('terms')}
          />
        )}
      </div>

      {activeView === 'portal' && (
        <GuestFloatingActions
          mobileFramePreview={viewMode === 'mobile'}
          onOpenAssistant={() => setActiveView('assistant')}
          onOpenReport={() => setReportSheetOpen(true)}
        />
      )}

      {legalModal === 'privacy' && (
        <LegalDocumentModal
          title="Privacy Policy"
          body={platformLegal.privacyPolicy}
          onClose={() => setLegalModal(null)}
        />
      )}
      {legalModal === 'terms' && (
        <LegalDocumentModal
          title="Terms of Use"
          body={platformLegal.termsOfUse}
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
  );
}