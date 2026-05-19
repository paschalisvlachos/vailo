import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../../lib/firebase';
import { getGenerativeModel } from "firebase/ai";
import { ai } from '../../../lib/firebase';
import { ArrowLeft, Plus, MapPin, Wand2, Star, Image as ImageIcon, Pencil, Trash2, Map, Loader2, Building, Sparkles } from 'lucide-react';
import { getFunctions, httpsCallable } from 'firebase/functions';

// --- FREE GLOBAL ROUTING HELPER (OSRM API) ---
const fetchGlobalDrivingRoute = async (startLat: string, startLon: string, endLat: string, endLon: string) => {
  try {
    // OSRM expects coordinates in Lon,Lat format
    const url = `https://router.project-osrm.org/route/v1/driving/${startLon},${startLat};${endLon},${endLat}?overview=false`;
    const response = await fetch(url);
    if (!response.ok) throw new Error("Routing failed");
    
    const data = await response.json();
    if (data.routes && data.routes.length > 0) {
      const route = data.routes[0];
      
      // OSRM returns distance in meters -> convert to kilometers
      const distanceKm = (route.distance / 1000).toFixed(1);
      
      // OSRM returns duration in seconds -> convert to minutes
      const durationMins = Math.round(route.duration / 60);
      
      return {
        distanceKm,
        distanceTime: `${durationMins} min`
      };
    }
  } catch (error) {
    console.error("OSRM Global Routing Error:", error);
  }
  return null;
};

export default function LocalGems() {
  const { property, propertyId } = useOutletContext<{ property: any, propertyId: string }>();
  
  // NEW: State for Property Types and Selected Type
  const [propertyTypes, setPropertyTypes] = useState<any[]>([]);
  const [selectedTypeId, setSelectedTypeId] = useState<string>('');
  
  const [gems, setGems] = useState<any[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingGemId, setEditingGemId] = useState<string | null>(null);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  
  const initialFormState = {
    name: '', category: '', description: '', rating: '',
    googleMapsUrl: '', distanceKm: '', distanceTime: '',
    latitude: '', longitude: '',
    isLegitPick: false, isDailyTrip: false, photoUrl: ''
  };
  
  const [formData, setFormData] = useState(initialFormState);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [suggestedPhotos, setSuggestedPhotos] = useState<string[]>([]);

  // Add this near your other state variables
  const [isMagicFilling, setIsMagicFilling] = useState(false);

  const handleMagicFill = async () => {
    const url = formData.googleMapsUrl;
    if (!url) return alert("Please paste a Google Maps URL first.");
    setIsMagicFilling(true);

    try {
      // 1. EXTRACT NAME FROM URL to use as our Search Query
      const nameMatch = url.match(/\/place\/([^\/]+)\//);
      let placeName = "";
      
      if (nameMatch && nameMatch[1]) {
        placeName = decodeURIComponent(nameMatch[1].replace(/\+/g, ' '));
        const searchQuery = `${placeName} Crete`; 

        // 2. CALL OUR SECURE FIREBASE BOUNCER (Google Places API)
        const functions = getFunctions();
        const getGooglePlaceDetails = httpsCallable(functions, 'getGooglePlaceDetails');
        
        const result = await getGooglePlaceDetails({ searchQuery });
        const googleData: any = result.data;

        // 3. MAP GOOGLE'S CATEGORIES TO YOUR UI DROPDOWN
        let uiCategory = "sightseeing"; 
        const gType = googleData.category?.toLowerCase() || "";
        if (gType.includes("restaurant") || gType.includes("cafe") || gType.includes("food")) uiCategory = "restaurant";
        if (gType.includes("bar") || gType.includes("night_club")) uiCategory = "bar/nightlife";
        if (gType.includes("shopping") || gType.includes("store")) uiCategory = "shopping";

        // 4. SMART DESCRIPTION FALLBACK (Gemini AI)
        let finalDescription = googleData.description;
        
        // If Google doesn't have an editorial summary, Gemini writes a beautiful one instantly!
        if (!finalDescription) {
          try {
            const prompt = `Act as a luxury travel concierge for Crete. Write a short, engaging 2-sentence description for a local ${uiCategory} called "${googleData.name || placeName}". Tell guests why they should visit. Return ONLY the description text, no quotes.`;
            const model = getGenerativeModel(ai, { model: "gemini-2.5-flash" });
            const aiResult = await model.generateContent(prompt);
            finalDescription = aiResult.response.text().trim();
          } catch (e) {
            console.log("Gemini description fallback failed.", e);
          }
        }

        // 5. CALCULATE DRIVING DISTANCE (100% Free via OSRM)
        let distance = "";
        let time = "";
        
        if (googleData.latitude && googleData.longitude) {
          const selectedTypeData = propertyTypes.find(pt => pt.id === selectedTypeId);
          const refLat = selectedTypeData?.latitude || property?.latitude;
          const refLng = selectedTypeData?.longitude || property?.longitude;

          if (refLat && refLng) {
            const routeData = await fetchGlobalDrivingRoute(refLat, refLng, googleData.latitude.toString(), googleData.longitude.toString());
            if (routeData) {
              distance = routeData.distanceKm;
              time = routeData.distanceTime;
            }
          }
        }

        // 6. UPDATE ALL STATE AT ONCE
        setFormData(prev => ({
          ...prev,
          name: googleData.name || placeName,
          category: uiCategory,
          rating: googleData.rating ? googleData.rating.toString() : prev.rating,
          description: finalDescription || prev.description, // Uses Google's OR Gemini's!
          latitude: googleData.latitude?.toString() || prev.latitude,
          longitude: googleData.longitude?.toString() || prev.longitude,
          distanceKm: distance,
          distanceTime: time,
          photoUrl: googleData.photoUrl || ''
        }));

        if (googleData.photoUrl) {
          setImagePreview(googleData.photoUrl);
          setImageFile(null);
        }

      } else {
        alert("Could not extract the Place Name. Ensure you paste the FULL web URL.");
      }

    } catch (error) {
      console.error("Magic Fill Error:", error);
      alert("Something went wrong while asking Google for the data.");
    } finally {
      setIsMagicFilling(false);
    }
  };

  // 1. Fetch Property Types so we can populate the dropdown
  useEffect(() => {
    if (!propertyId) return;
    const unsubscribe = onSnapshot(collection(db, 'properties', propertyId, 'propertyTypes'), (snapshot) => {
      const typesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPropertyTypes(typesData);
      
      // Auto-select the first property type if none is selected yet
      if (typesData.length > 0 && !selectedTypeId) {
        setSelectedTypeId(typesData[0].id);
      }
    });
    return () => unsubscribe();
  }, [propertyId, selectedTypeId]);

  // 2. Fetch Gems SUB-COLLECTION based on the SELECTED Property Type
  useEffect(() => {
    if (!propertyId || !selectedTypeId) {
      setGems([]);
      return;
    }
    const unsubscribe = onSnapshot(collection(db, 'properties', propertyId, 'propertyTypes', selectedTypeId, 'localGems'), (snapshot) => {
      const gemsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setGems(gemsData);
    });
    return () => unsubscribe();
  }, [propertyId, selectedTypeId]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData({ ...formData, [name]: checked });
    } else {
      setFormData({ ...formData, [name]: value });
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const submitGem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!propertyId || !selectedTypeId) return;
    setIsSubmitting(true);
    
    try {
      let finalPhotoUrl = formData.photoUrl;

      // Notice how the image path is now scoped to the specific type!
      if (imageFile) {
        setIsUploadingImage(true);
        const fileRef = ref(storage, `properties/${propertyId}/types/${selectedTypeId}/gems/${Date.now()}_${imageFile.name}`);
        await uploadBytes(fileRef, imageFile);
        finalPhotoUrl = await getDownloadURL(fileRef);
        setIsUploadingImage(false);
      }

      const payload = { ...formData, photoUrl: finalPhotoUrl };

      // Save to Firestore under the specific Property Type
      if (editingGemId) {
        await updateDoc(doc(db, 'properties', propertyId, 'propertyTypes', selectedTypeId, 'localGems', editingGemId), {
          ...payload, updatedAt: new Date().toISOString()
        });
      } else {
        await addDoc(collection(db, 'properties', propertyId, 'propertyTypes', selectedTypeId, 'localGems'), {
          ...payload, createdAt: new Date().toISOString()
        });
      }

      setIsFormOpen(false);
      setEditingGemId(null);
      setFormData(initialFormState);
      setImageFile(null);
      setImagePreview(null);

    } catch (error) {
      console.error("Error saving gem:", error);
      alert("Failed to save local gem.");
      setIsUploadingImage(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditClick = (gemData: any) => {
    setFormData(gemData);
    setImagePreview(gemData.photoUrl || null);
    setImageFile(null);
    setEditingGemId(gemData.id);
    setSuggestedPhotos([]);
    setIsFormOpen(true);
  };

  const handleDeleteClick = async (gemId: string, gemName: string) => {
    if (window.confirm(`Are you sure you want to remove "${gemName}"?`)) {
      try {
        await deleteDoc(doc(db, 'properties', propertyId, 'propertyTypes', selectedTypeId, 'localGems', gemId));
      } catch (error) {
        alert("Failed to delete gem.");
      }
    }
  };

  // --- EDGE CASE: No Property Types Exist ---
  if (propertyTypes.length === 0) {
    return (
      <div className="text-center py-16 bg-gray-50 rounded-xl border border-dashed border-gray-200">
        <Building size={32} className="mx-auto text-gray-400 mb-3" />
        <h3 className="text-xl font-bold text-gray-900 mb-2">No Property Types Configured</h3>
        <p className="text-gray-500 max-w-sm mx-auto mb-6">
          Local gems are assigned to specific units. Please go to the <b>Property Types</b> tab and create a unit before adding local gems.
        </p>
      </div>
    );
  }

  // --- UI RENDERING ---
  if (!isFormOpen) {
    return (
      <div>
        {/* NEW: Property Type Selector */}
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h4 className="text-sm font-bold text-blue-900">Select Unit Level</h4>
            <p className="text-xs text-blue-700">Gems are assigned specifically to the selected property type.</p>
          </div>
          <select 
            value={selectedTypeId} 
            onChange={(e) => setSelectedTypeId(e.target.value)}
            className="px-4 py-2 bg-white border border-blue-200 rounded-lg text-sm font-medium text-gray-900 outline-none focus:ring-2 focus:ring-blue-500 shadow-sm min-w-[200px]"
          >
            {propertyTypes.map(type => (
              <option key={type.id} value={type.id}>{type.propertyTypeName}</option>
            ))}
          </select>
        </div>

        <div className="flex justify-between items-center mb-6">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Local Gems</h3>
            <p className="text-sm text-gray-500">Curated recommendations for your guests.</p>
          </div>
          <button onClick={() => setIsFormOpen(true)} className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm">
            <Plus size={18} className="mr-2" /> Add Custom Gem
          </button>
        </div>

        {gems.length === 0 ? (
          <div className="text-center py-16 bg-gray-50 rounded-xl border border-dashed border-gray-200">
            <Map size={32} className="mx-auto text-gray-400 mb-3" />
            <p className="text-gray-900 font-medium">No local gems found for this unit</p>
            <p className="text-gray-500 text-sm mt-1">Add restaurants, beaches, and sights to create a digital guidebook.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Gem</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Rating</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Distance</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {gems.map(gem => (
                  <tr key={gem.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        {gem.photoUrl ? (
                          <img src={gem.photoUrl} alt={gem.name} className="h-10 w-10 rounded-lg object-cover mr-3 border border-gray-200" />
                        ) : (
                          <div className="h-10 w-10 rounded-lg bg-gray-100 flex items-center justify-center mr-3 border border-gray-200">
                            <ImageIcon size={16} className="text-gray-400" />
                          </div>
                        )}
                        <div>
                          <div className="font-medium text-gray-900 flex items-center">
                            {gem.name}
                          </div>
                          <div className="flex mt-1">
                            {gem.isLegitPick && <span className="mr-1 px-2 py-0.5 bg-yellow-100 text-yellow-800 text-[10px] uppercase font-bold rounded-full">Legit Pick</span>}
                            {gem.isDailyTrip && <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-[10px] uppercase font-bold rounded-full">Daily Trip</span>}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 capitalize">{gem.category.replace('/', ' / ')}</td>
                    <td className="px-6 py-4 text-sm text-center">
                      <div className="flex items-center justify-center text-gray-900 font-medium">
                        <Star size={14} className="text-yellow-400 fill-current mr-1" />
                        {gem.rating}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {gem.distanceKm ? `${gem.distanceKm} km (${gem.distanceTime})` : 'N/A'}
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-medium">
                      <button onClick={() => handleEditClick(gem)} className="text-blue-600 hover:text-blue-900 mr-4"><Pencil size={18} /></button>
                      <button onClick={() => handleDeleteClick(gem.id, gem.name)} className="text-red-600 hover:text-red-900"><Trash2 size={18} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center mb-6">
        <button onClick={() => { setIsFormOpen(false); setEditingGemId(null); setFormData(initialFormState); setImagePreview(null); }} className="p-2 mr-3 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h3 className="text-xl font-bold text-gray-900">{editingGemId ? 'Edit Local Gem' : 'Add Custom Gem'}</h3>
          <p className="text-gray-500 text-sm mt-1">Adding recommendation for <span className="font-semibold text-blue-600">{propertyTypes.find(t => t.id === selectedTypeId)?.propertyTypeName}</span></p>
        </div>
      </div>

      <form onSubmit={submitGem} className="border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        
        {/* Smart Calculator Header */}
        <div className="p-6 border-b border-gray-100 bg-blue-50/50 space-y-2">
          <h4 className="text-sm font-bold text-blue-900 flex items-center">
            <Wand2 size={16} className="mr-2" /> Free Smart Import Tool
          </h4>
          <p className="text-xs text-blue-700 max-w-2xl">
            Paste a Google Maps link below and click AI Magic Fill. We will extract the GPS coordinates and calculate the driving distance and time from this specific Property Type!
          </p>
        </div>

        <div className="p-6 space-y-6 bg-white">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* 1. Maps Link & Smart Calc (WIDER: md:col-span-2) */}
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-gray-700 mb-1">Google Maps Location Link *</label>
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <MapPin className="absolute left-3 top-2.5 text-gray-400" size={18} />
                  <input type="url" required name="googleMapsUrl" value={formData.googleMapsUrl} onChange={handleChange} placeholder="https://www.google.com/maps/place/..." className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white" />
                </div>
                <button 
                  type="button" 
                  onClick={handleMagicFill} 
                  disabled={isMagicFilling}
                  className="flex items-center px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 border border-transparent rounded-lg text-white hover:opacity-90 font-medium transition-all shadow-sm disabled:opacity-50"
                >
                  {isMagicFilling ? <Loader2 size={16} className="mr-2 animate-spin" /> : <Sparkles size={16} className="mr-2" />}
                  {isMagicFilling ? 'Filling...' : 'AI Magic Fill'}
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1.5 italic">Paste the FULL web URL to magically extract the name, distance, description, and rating.</p>
            </div>

            <hr className="md:col-span-2 border-gray-100" />

            {/* 2. Basic Info */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Gem Name *</label>
              <input type="text" required name="name" value={formData.name} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            
            {/* 3. ESSENTIAL CATEGORY WITH PRESELECT */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
              <select required name="category" value={formData.category} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white">
                <option value="" disabled>Please select</option>
                <option value="restaurant">Restaurant</option>
                <option value="beach">Beach</option>
                <option value="sightseeing">Sightseeing</option>
                <option value="shopping">Shopping</option>
                <option value="bar/nightlife">Bar / Nightlife</option>
                <option value="delivery">Delivery</option>
                <option value="host's favorite">Host's Favorite</option>
              </select>
            </div>

            {/* 4. EMPTY 1-5 GOOGLE RATING */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Google Rating (1-5)</label>
              <input type="number" min="1" max="5" step="0.1" name="rating" value={formData.rating} onChange={handleChange} placeholder="e.g. 4.8" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>

            {/* 5. VISIBLE DISTANCE FIELDS */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Distance from {propertyTypes.find(t => t.id === selectedTypeId)?.propertyTypeName || 'Property'} (km) *
              </label>
              <input type="text" required name="distanceKm" value={formData.distanceKm} onChange={handleChange} placeholder="e.g. 5.2" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Distance from {propertyTypes.find(t => t.id === selectedTypeId)?.propertyTypeName || 'Property'} (time) *
              </label>
              <input type="text" required name="distanceTime" value={formData.distanceTime} onChange={handleChange} placeholder="e.g. 15 min" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>

            {/* 6. VISIBLE LATITUDE & LONGITUDE */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Latitude</label>
              <input type="text" name="latitude" value={formData.latitude || ''} onChange={handleChange} placeholder="e.g. 35.5138" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Longitude</label>
              <input type="text" name="longitude" value={formData.longitude || ''} onChange={handleChange} placeholder="e.g. 24.0180" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea name="description" value={formData.description} onChange={handleChange} rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none" placeholder="Why do you recommend this place?"></textarea>
            </div>

            {/* NEW: Smart Photo Selection & Upload */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">Photo * (Select one or upload)</label>
              
              {/* The AI Suggested Photo Gallery */}
              {suggestedPhotos.length > 0 && (
                <div className="mb-4 p-4 bg-gray-50 border border-gray-200 rounded-xl">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3 flex items-center">
                    <Sparkles size={12} className="mr-1.5 text-blue-600" /> AI Found Photos (Click to select)
                  </p>
                  <div className="flex gap-3 overflow-x-auto pb-2 custom-scrollbar">
                    {suggestedPhotos.map((url, i) => (
                      <img 
                        key={i} 
                        src={url} 
                        alt="Suggested" 
                        // NEW: If the image is broken/blocked by Google, hide it instantly!
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        onClick={() => { 
                          setFormData(prev => ({...prev, photoUrl: url})); 
                          setImageFile(null); 
                          setImagePreview(url); 
                        }}
                        className={`h-24 w-32 shrink-0 object-cover rounded-lg cursor-pointer transition-all border-[3px] ${
                          formData.photoUrl === url && !imageFile 
                            ? 'border-blue-600 shadow-md scale-[1.02]' 
                            : 'border-transparent hover:border-gray-300'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* The Selected Preview & Upload Box */}
              <div className="flex flex-col sm:flex-row gap-4 items-start">
                
                {(imagePreview || formData.photoUrl) && (
                  <div className="relative inline-block shrink-0">
                    <img src={imagePreview || formData.photoUrl} alt="Preview" className="h-32 w-48 rounded-xl object-cover border-2 border-blue-600 shadow-sm" />
                    <div className="absolute top-2 left-2 bg-blue-600 text-white text-[10px] font-bold px-2.5 py-1 rounded-md shadow-sm uppercase tracking-wider">
                      Selected
                    </div>
                    <button 
                      type="button" 
                      onClick={() => { setImageFile(null); setImagePreview(null); setFormData(prev => ({...prev, photoUrl: ''})); }}
                      className="absolute -top-2 -right-2 bg-white text-red-500 border border-red-100 p-1.5 rounded-full hover:bg-red-50 shadow-md transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}

                <div className={`flex-1 w-full flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-xl hover:bg-gray-50 transition-colors ${imagePreview || formData.photoUrl ? 'opacity-70 hover:opacity-100' : ''}`}>
                  <div className="space-y-1 text-center">
                    <ImageIcon className="mx-auto h-8 w-8 text-gray-400" />
                    <div className="flex text-sm text-gray-600 justify-center mt-2">
                      <label className="relative cursor-pointer bg-transparent rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none">
                        <span>Upload your own file</span>
                        <input type="file" className="sr-only" accept="image/*" onChange={(e) => {
                          handleImageSelect(e);
                          setFormData(prev => ({...prev, photoUrl: ''})); // Clear gallery selection if they upload
                        }} />
                      </label>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">PNG, JPG up to 5MB</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Toggles */}
            <div className="md:col-span-2 flex flex-col sm:flex-row gap-6 pt-4 border-t border-gray-100">
              <label className="flex items-center cursor-pointer">
                <div className="relative flex items-center">
                  <input type="checkbox" name="isLegitPick" checked={formData.isLegitPick} onChange={handleChange} className="h-5 w-5 text-blue-600 focus:ring-blue-500 border-gray-300 rounded transition-all cursor-pointer" />
                </div>
                <div className="ml-3">
                  <span className="block text-sm font-medium text-gray-900">Owner's Legit Pick</span>
                  <span className="block text-xs text-gray-500">Highlight this as a top-tier recommendation.</span>
                </div>
              </label>

              <label className="flex items-center cursor-pointer">
                <div className="relative flex items-center">
                  <input type="checkbox" name="isDailyTrip" checked={formData.isDailyTrip} onChange={handleChange} className="h-5 w-5 text-blue-600 focus:ring-blue-500 border-gray-300 rounded transition-all cursor-pointer" />
                </div>
                <div className="ml-3">
                  <span className="block text-sm font-medium text-gray-900">Daily Trip</span>
                  <span className="block text-xs text-gray-500">Tag this as a full-day excursion.</span>
                </div>
              </label>
            </div>

          </div>
        </div>

        <div className="p-6 bg-gray-50 border-t border-gray-200 flex justify-end gap-4">
          <button type="button" onClick={() => { setIsFormOpen(false); setEditingGemId(null); setFormData(initialFormState); setImagePreview(null); setSuggestedPhotos([]); }} className="px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-200 rounded-lg transition-colors">Cancel</button>          
          
          <button type="submit" disabled={isSubmitting || isUploadingImage} className="flex items-center px-5 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 transition-colors shadow-sm">
            {(isSubmitting || isUploadingImage) && <Loader2 size={16} className="mr-2 animate-spin" />}
            {isUploadingImage ? 'Uploading Image...' : isSubmitting ? 'Saving...' : (editingGemId ? 'Update Gem' : 'Add Gem')}
          </button>
        </div>
      </form>
    </div>
  );
}