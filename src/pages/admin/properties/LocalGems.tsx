import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, ai } from '../../../lib/firebase';
import { getGenerativeModel } from "firebase/ai";
import { ArrowLeft, Plus, MapPin, Wand2, Star, Image as ImageIcon, Pencil, Trash2, Map, Loader2, Building, Sparkles } from 'lucide-react';
import { getFunctions, httpsCallable } from 'firebase/functions';

// --- FREE GLOBAL ROUTING HELPER (OSRM API) ---
const fetchGlobalDrivingRoute = async (startLat: string, startLon: string, endLat: string, endLon: string) => {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${startLon},${startLat};${endLon},${endLat}?overview=false`;
    const response = await fetch(url);
    if (!response.ok) throw new Error("Routing failed");
    
    const data = await response.json();
    if (data.routes && data.routes.length > 0) {
      const route = data.routes[0];
      const distanceKm = (route.distance / 1000).toFixed(1);
      const durationMins = Math.round(route.duration / 60);
      return { distanceKm, distanceTime: `${durationMins} min` };
    }
  } catch (error) {
    console.error("OSRM Global Routing Error:", error);
  }
  return null;
};

export default function LocalGems() {
  const { property, propertyId } = useOutletContext<{ property: any, propertyId: string }>();
  
  // Context States
  const [propertyAreaContext, setPropertyAreaContext] = useState<{country: string, areaId: string, areaName: string} | null>(null);
  const [propertyTypes, setPropertyTypes] = useState<any[]>([]);
  const [selectedTypeId, setSelectedTypeId] = useState<string>('');
  
  // Database States
  const [gems, setGems] = useState<any[]>([]);
  const [localGemsCategories, setLocalGemsCategories] = useState<string[]>([]);
  
  // UI States
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingGemId, setEditingGemId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMagicFilling, setIsMagicFilling] = useState(false);
  
  // Photo Memory States
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [googlePhoto, setGooglePhoto] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const initialFormState = {
    name: '', category: '', description: '', rating: '',
    googleMapsUrl: '', distanceKm: '', distanceTime: '',
    latitude: '', longitude: '',
    isLegitPick: false, isDailyTrip: false, photoUrl: ''
  };
  
  const [formData, setFormData] = useState(initialFormState);

  // 1. Fetch Area Context (from Parent or Types)
  useEffect(() => {
    if (!propertyId) return;
    const fetchAreaContext = async () => {
      let country = property?.country || 'Greece';
      let areaName = property?.city || property?.area || '';

      if (!areaName) {
        const typesSnap = await getDocs(collection(db, 'properties', propertyId, 'propertyTypes'));
        if (!typesSnap.empty) {
          const firstType = typesSnap.docs[0].data();
          areaName = firstType.city || firstType.area || '';
          if (firstType.country) country = firstType.country;
        }
      }

      if (areaName) {
        setPropertyAreaContext({
          country: country,
          areaName: areaName,
          areaId: areaName.toLowerCase().replace(/\s+/g, '-')
        });
      }
    };
    fetchAreaContext();
  }, [property, propertyId]);

  // 2. Fetch Master Categories & Property Types
  useEffect(() => {
    if (!propertyAreaContext) return;
    const { country, areaId } = propertyAreaContext;

    // Fetch Global Categories
    const unsubCats = onSnapshot(collection(db, 'countries', country, 'areas', areaId, 'localGemsCategories'), (snapshot) => {
      const fetchedCats = snapshot.docs.map(doc => doc.data().name);
      fetchedCats.sort((a, b) => a.localeCompare(b));
      setLocalGemsCategories(fetchedCats);
    });

    return () => unsubCats();
  }, [propertyAreaContext]);

  useEffect(() => {
    if (!propertyId) return;
    const unsubTypes = onSnapshot(collection(db, 'properties', propertyId, 'propertyTypes'), (snapshot) => {
      const typesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPropertyTypes(typesData);
      if (typesData.length > 0 && !selectedTypeId) {
        setSelectedTypeId(typesData[0].id);
      }
    });
    return () => unsubTypes();
  }, [propertyId, selectedTypeId]);

  // 3. Fetch Local Gems for selected Type
  useEffect(() => {
    if (!propertyId || !selectedTypeId) {
      setGems([]);
      return;
    }
    const unsubGems = onSnapshot(collection(db, 'properties', propertyId, 'propertyTypes', selectedTypeId, 'localGems'), (snapshot) => {
      const gemsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setGems(gemsData);
    });
    return () => unsubGems();
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
      const url = URL.createObjectURL(file);
      setImageFile(file);
      setImagePreview(url);
      setFormData(prev => ({ ...prev, photoUrl: url }));
    }
  };

  // --- SUPERCHARGED AI MAGIC FILL ---
  const handleMagicFill = async () => {
    const url = formData.googleMapsUrl;
    if (!url) return alert("Please paste a Google Maps URL first.");
    if (!propertyAreaContext) return alert("Area data missing. Ensure your property has a City/Area set.");
    setIsMagicFilling(true);

    try {
      let searchQuery = "";
      let placeNameFallback = ""; 
      
      const nameMatch = url.match(/\/place\/([^\/]+)\//);
      if (nameMatch && nameMatch[1]) {
        placeNameFallback = decodeURIComponent(nameMatch[1].replace(/\+/g, ' '));
        searchQuery = `${placeNameFallback} ${propertyAreaContext.areaName}`; 
      } else {
        searchQuery = url;
      }

      const functions = getFunctions();
      const getGooglePlaceDetails = httpsCallable(functions, 'getGooglePlaceDetails');
      const result = await getGooglePlaceDetails({ searchQuery, area: propertyAreaContext.areaName });
      const googleData: any = result.data;

      // 1. Calculate Driving Distance
      let distanceKm = "";
      let distanceTime = "";
      if (googleData.latitude && googleData.longitude) {
        const selectedTypeData = propertyTypes.find(pt => pt.id === selectedTypeId);
        const refLat = selectedTypeData?.latitude || property?.latitude;
        const refLng = selectedTypeData?.longitude || property?.longitude;

        if (refLat && refLng) {
          const routeData = await fetchGlobalDrivingRoute(refLat, refLng, googleData.latitude.toString(), googleData.longitude.toString());
          if (routeData) {
            distanceKm = routeData.distanceKm;
            distanceTime = routeData.distanceTime;
          }
        }
      }

      // 2. AI Category Matching (JSON Prompt)
      let matchedCategory = "";
      let finalDescription = googleData.description;

      try {
        const categoryNames = localGemsCategories.join(', ');
        const gType = googleData.category?.replace(/_/g, ' ') || "local spot";

        const prompt = `Act as a travel concierge for ${propertyAreaContext.areaName}. We are adding "${googleData.name || placeNameFallback}" (Google classification: ${gType}).
        1. Pick the single most accurate category from our exact database list: [${categoryNames}]. If none fit perfectly, return an empty string "".
        2. Write a short, engaging 2-sentence description explaining why guests should visit this gem.
        Return ONLY a valid JSON object in this exact format:
        {"category": "Exact Category Name", "description": "Your 2 sentence description"}`;

        const model = getGenerativeModel(ai, { model: "gemini-2.5-flash" });
        const aiResult = await model.generateContent(prompt);
        const rawText = aiResult.response.text().replace(/```json/gi, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(rawText);

        if (parsed.category && localGemsCategories.includes(parsed.category)) {
          matchedCategory = parsed.category;
        }
        if (parsed.description && !googleData.description) {
          finalDescription = parsed.description;
        }
      } catch (e) {
        console.log("AI JSON mapping failed, falling back to simple match.", e);
        const gTypeLower = googleData.category?.toLowerCase().replace(/_/g, ' ') || "";
        const possibleMatch = localGemsCategories.find(c => 
          gTypeLower.includes(c.toLowerCase()) || c.toLowerCase().includes(gTypeLower)
        );
        if (possibleMatch) matchedCategory = possibleMatch;
      }

      setFormData(prev => ({
        ...prev,
        name: googleData.name || placeNameFallback,
        category: matchedCategory || prev.category,
        rating: googleData.rating ? googleData.rating.toString() : prev.rating,
        description: finalDescription || prev.description,
        latitude: googleData.latitude?.toString() || prev.latitude,
        longitude: googleData.longitude?.toString() || prev.longitude,
        distanceKm: distanceKm,
        distanceTime: distanceTime,
        photoUrl: googleData.photoUrl || ''
      }));

      // 3. Save Google Photo to Memory
      if (googleData.photoUrl) {
        setGooglePhoto(googleData.photoUrl);
        setImagePreview(null);
        setImageFile(null);
      }

    } catch (error) {
      console.error("Magic Fill Error:", error);
      alert("Something went wrong. Make sure it's a valid link!");
    } finally {
      setIsMagicFilling(false);
    }
  };

  const submitGem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!propertyId || !selectedTypeId) return;
    setIsSubmitting(true);
    
    try {
      let finalPhotoUrl = formData.photoUrl;

      // Only upload if the actively selected photo is the custom one they uploaded
      if (imageFile && formData.photoUrl === imagePreview) {
        setIsUploadingImage(true);
        const fileRef = ref(storage, `properties/${propertyId}/types/${selectedTypeId}/gems/${Date.now()}_${imageFile.name}`);
        await uploadBytes(fileRef, imageFile);
        finalPhotoUrl = await getDownloadURL(fileRef);
      }

      const payload = { ...formData, photoUrl: finalPhotoUrl };

      if (editingGemId) {
        await updateDoc(doc(db, 'properties', propertyId, 'propertyTypes', selectedTypeId, 'localGems', editingGemId), {
          ...payload, updatedAt: new Date().toISOString()
        });
      } else {
        await addDoc(collection(db, 'properties', propertyId, 'propertyTypes', selectedTypeId, 'localGems'), {
          ...payload, createdAt: new Date().toISOString()
        });
      }

      closeAndResetForm();
    } catch (error) {
      console.error("Error saving gem:", error);
      alert("Failed to save local gem.");
    } finally {
      setIsSubmitting(false);
      setIsUploadingImage(false);
    }
  };

  const handleEditClick = (gemData: any) => {
    setFormData(gemData);
    setGooglePhoto(null);
    setImagePreview(null);
    setImageFile(null);
    setEditingGemId(gemData.id);
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

  const closeAndResetForm = () => {
    setIsFormOpen(false);
    setEditingGemId(null);
    setFormData(initialFormState);
    setImagePreview(null);
    setImageFile(null);
    setGooglePhoto(null);
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
        <div className="bg-vailo-teal/5 border border-vailo-teal/10 rounded-xl p-4 mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h4 className="text-sm font-bold text-vailo-dark">Select Unit Level</h4>
            <p className="text-xs text-vailo-teal-hover">Gems are assigned specifically to the selected property type.</p>
          </div>
          <select 
            value={selectedTypeId} 
            onChange={(e) => setSelectedTypeId(e.target.value)}
            className="px-4 py-2 bg-white border border-vailo-teal/15 rounded-lg text-sm font-medium text-gray-900 outline-none focus:ring-2 focus:ring-vailo-teal/20 focus:border-vailo-teal shadow-sm min-w-[200px]"
          >
            {propertyTypes.map(type => (
              <option key={type.id} value={type.id}>{type.propertyTypeName}</option>
            ))}
          </select>
        </div>

        <div className="flex justify-between items-center mb-6">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Local Gems</h3>
            <p className="text-sm text-gray-500">
              Curated recommendations for your guests. 
              {propertyAreaContext && <span className="ml-1 font-medium text-vailo-teal">(Area: {propertyAreaContext.areaName})</span>}
            </p>
          </div>
          <button onClick={() => setIsFormOpen(true)} className="flex items-center px-4 py-2 bg-vailo-teal text-white rounded-xl hover:bg-vailo-teal-hover transition-colors shadow-sm">
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
                            {gem.isDailyTrip && <span className="px-2 py-0.5 bg-vailo-teal/10 text-vailo-dark text-[10px] uppercase font-bold rounded-full">Daily Trip</span>}
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
                      <button onClick={() => handleEditClick(gem)} className="text-vailo-teal hover:text-vailo-dark mr-4"><Pencil size={18} /></button>
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
    <div className="w-full">
      <div className="flex items-center mb-6">
        <button onClick={closeAndResetForm} className="p-2 mr-3 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h3 className="text-xl font-bold text-gray-900">{editingGemId ? 'Edit Local Gem' : 'Add Custom Gem'}</h3>
          <p className="text-gray-500 text-sm mt-1">Adding recommendation for <span className="font-semibold text-vailo-teal">{propertyTypes.find(t => t.id === selectedTypeId)?.propertyTypeName}</span></p>
        </div>
      </div>

      <form onSubmit={submitGem} className="border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        
        {/* Smart Calculator Header */}
        <div className="p-6 border-b border-gray-100 bg-vailo-teal/5/50 space-y-2">
          <h4 className="text-sm font-bold text-vailo-dark flex items-center">
            <Wand2 size={16} className="mr-2" /> Free Smart Import Tool
          </h4>
          <p className="text-xs text-vailo-teal-hover max-w-2xl">
            Paste a Google Maps link below and click AI Magic Fill. We will extract the GPS coordinates and calculate the driving distance and time from this specific Property Type!
          </p>
        </div>

        <div className="p-6 space-y-6 bg-white">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* 1. Maps Link & Smart Calc */}
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-gray-700 mb-1">Google Maps Location Link *</label>
              <div className="flex gap-3 items-end">
                <div className="relative flex-1">
                  <MapPin className="absolute left-3 top-2.5 text-gray-400" size={18} />
                  <input type="url" required name="googleMapsUrl" value={formData.googleMapsUrl} onChange={handleChange} placeholder="https://www.google.com/maps/place/..." className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg admin-input outline-none bg-white" />
                </div>
                <button 
                  type="button" 
                  onClick={handleMagicFill} 
                  disabled={isMagicFilling || !propertyAreaContext}
                  className="flex items-center justify-center h-[42px] px-6 bg-gradient-to-r from-blue-600 to-indigo-600 border border-transparent rounded-lg text-white hover:opacity-90 font-medium transition-all shadow-sm disabled:opacity-50"
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
              <input type="text" required name="name" value={formData.name} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg admin-input outline-none" />
            </div>
            
            {/* 3. DYNAMIC CATEGORY DROPDOWN */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
              <select required name="category" value={formData.category} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg admin-input outline-none bg-white">
                <option value="" disabled>
                  {localGemsCategories.length === 0 ? "No Area Categories Found" : "Please select"}
                </option>
                {localGemsCategories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            {/* 4. GOOGLE RATING */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Google Rating (1-5)</label>
              <input type="number" min="1" max="5" step="0.1" name="rating" value={formData.rating} onChange={handleChange} placeholder="e.g. 4.8" className="w-full px-3 py-2 border border-gray-300 rounded-lg admin-input outline-none" />
            </div>

            {/* 5. VISIBLE DISTANCE FIELDS */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Distance from {propertyTypes.find(t => t.id === selectedTypeId)?.propertyTypeName || 'Property'} (km) *
              </label>
              <input type="text" required name="distanceKm" value={formData.distanceKm} onChange={handleChange} placeholder="e.g. 5.2" className="w-full px-3 py-2 border border-gray-300 rounded-lg admin-input outline-none" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Distance from {propertyTypes.find(t => t.id === selectedTypeId)?.propertyTypeName || 'Property'} (time) *
              </label>
              <input type="text" required name="distanceTime" value={formData.distanceTime} onChange={handleChange} placeholder="e.g. 15 min" className="w-full px-3 py-2 border border-gray-300 rounded-lg admin-input outline-none" />
            </div>

            {/* 6. VISIBLE LATITUDE & LONGITUDE */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Latitude</label>
              <input type="text" name="latitude" value={formData.latitude || ''} onChange={handleChange} placeholder="e.g. 35.5138" className="w-full px-3 py-2 border border-gray-300 rounded-lg admin-input outline-none" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Longitude</label>
              <input type="text" name="longitude" value={formData.longitude || ''} onChange={handleChange} placeholder="e.g. 24.0180" className="w-full px-3 py-2 border border-gray-300 rounded-lg admin-input outline-none" />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea name="description" value={formData.description} onChange={handleChange} rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-lg admin-input outline-none resize-none" placeholder="Why do you recommend this place?"></textarea>
            </div>

            {/* 7. PERFECTED PHOTO GALLERY WITH GOOGLE MEMORY */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">Photo * (Select one or upload)</label>
              
              <div className="flex flex-col sm:flex-row gap-6 items-start p-4 bg-gray-50 border border-gray-200 rounded-xl">
                
                {/* Active Photo Display */}
                <div className="w-40 h-28 rounded-lg bg-white border-2 border-gray-300 overflow-hidden flex items-center justify-center shrink-0">
                  {formData.photoUrl ? (
                    <img src={formData.photoUrl} className="w-full h-full object-cover block" />
                  ) : (
                    <ImageIcon className="text-gray-400" />
                  )}
                </div>

                <div className="flex-1 w-full">
                  <p className="text-sm font-bold text-gray-700 mb-2">Upload Custom Image</p>
                  <input type="file" accept="image/*" onChange={handleImageSelect} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-bold file:bg-vailo-teal/5 file:text-vailo-teal-hover hover:file:bg-vailo-teal/10 cursor-pointer mb-4" />
                  
                  {/* Selectable Thumbnail Gallery (Uploads & Google Data) */}
                  {(imagePreview || googlePhoto) && (
                    <div className="border-t border-gray-200 pt-3">
                      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Or select from source</p>
                      <div className="flex gap-3 overflow-x-auto pb-2 items-center">
                        
                        {/* Uploaded Thumbnail */}
                        {imagePreview && (
                          <div className="relative shrink-0 mt-1">
                            <img 
                              src={imagePreview} 
                              onClick={() => setFormData({...formData, photoUrl: imagePreview})} 
                              className={`w-16 h-16 object-cover rounded-lg cursor-pointer border-[3px] hover:opacity-80 transition-all ${formData.photoUrl === imagePreview ? 'border-blue-600 shadow-md scale-105' : 'border-transparent'}`} 
                            />
                            <div className="absolute top-1 left-1 bg-white/90 backdrop-blur-sm text-gray-800 text-[9px] font-bold px-1.5 py-0.5 rounded shadow-sm leading-none">Upload</div>
                          </div>
                        )}

                        {/* Google Memory Thumbnail */}
                        {googlePhoto && (
                          <div className="relative shrink-0 mt-1">
                            <img 
                              src={googlePhoto} 
                              onClick={() => setFormData({...formData, photoUrl: googlePhoto})} 
                              className={`w-16 h-16 object-cover rounded-lg cursor-pointer border-[3px] hover:opacity-80 transition-all ${formData.photoUrl === googlePhoto ? 'border-blue-600 shadow-md scale-105' : 'border-transparent'}`} 
                            />
                            <div className="absolute top-1 left-1 bg-white/90 backdrop-blur-sm text-vailo-teal text-[9px] font-bold px-1.5 py-0.5 rounded shadow-sm leading-none">Google</div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Toggles */}
            <div className="md:col-span-2 flex flex-col sm:flex-row gap-6 pt-4 border-t border-gray-100">
              <label className="flex items-center cursor-pointer">
                <div className="relative flex items-center">
                  <input type="checkbox" name="isLegitPick" checked={formData.isLegitPick} onChange={handleChange} className="h-5 w-5 text-vailo-teal focus:ring-vailo-teal/20 focus:border-vailo-teal border-gray-300 rounded transition-all cursor-pointer" />
                </div>
                <div className="ml-3">
                  <span className="block text-sm font-medium text-gray-900">Owner's Legit Pick</span>
                  <span className="block text-xs text-gray-500">Highlight this as a top-tier recommendation.</span>
                </div>
              </label>

              <label className="flex items-center cursor-pointer">
                <div className="relative flex items-center">
                  <input type="checkbox" name="isDailyTrip" checked={formData.isDailyTrip} onChange={handleChange} className="h-5 w-5 text-vailo-teal focus:ring-vailo-teal/20 focus:border-vailo-teal border-gray-300 rounded transition-all cursor-pointer" />
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
          <button type="button" onClick={closeAndResetForm} className="px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-200 rounded-lg transition-colors">Cancel</button>          
          
          <button type="submit" disabled={isSubmitting || isUploadingImage} className="flex items-center px-5 py-2.5 text-sm font-medium text-white bg-vailo-teal hover:bg-vailo-teal-hover rounded-lg disabled:opacity-50 transition-colors shadow-sm">
            {(isSubmitting || isUploadingImage) && <Loader2 size={16} className="mr-2 animate-spin" />}
            {isUploadingImage ? 'Uploading Image...' : isSubmitting ? 'Saving...' : (editingGemId ? 'Update Gem' : 'Add Gem')}
          </button>
        </div>
      </form>
    </div>
  );
}