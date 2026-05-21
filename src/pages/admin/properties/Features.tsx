import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getGenerativeModel } from "firebase/ai";
import { getFunctions, httpsCallable } from 'firebase/functions';
import { ai, db, storage } from '../../../lib/firebase';
import { Plus, Image as ImageIcon, Pencil, Trash2, Briefcase, Loader2, MapPin, Wand2, Link as LinkIcon, Phone, Mail, MessageCircle } from 'lucide-react';

export default function Features() {
  const { property, propertyId } = useOutletContext<{ property: any, propertyId: string }>();
  
  const [propertyAreaContext, setPropertyAreaContext] = useState<{country: string, areaId: string, areaName: string} | null>(null);
  
  const [features, setFeatures] = useState<any[]>([]);
  const [featuresCategories, setFeaturesCategories] = useState<any[]>([]);
  const [aiCategories, setAiCategories] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingFeatureId, setEditingFeatureId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMagicFilling, setIsMagicFilling] = useState(false);
  const [isGeneratingDesc, setIsGeneratingDesc] = useState(false);

  // 🔥 UPGRADED PHOTO MEMORY STATE 🔥
  const [customFile, setCustomFile] = useState<File | null>(null);
  const [customPreview, setCustomPreview] = useState<string | null>(null);
  const [googlePhoto, setGooglePhoto] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const initialFormState = {
    name: '',
    categories: [] as string[],
    agreement: '0', 
    description: '',
    googleMapsUrl: '',
    latitude: '',
    longitude: '',
    phoneNumber: '',
    whatsapp: '',
    email: '',
    website: '',
    photoUrl: '', // This stores the currently active/selected photo
    isMainPage: false,
    isLocal: false,
    experienceTypes: [] as string[]
  };

  const [formData, setFormData] = useState(initialFormState);

  // --- DATA FETCHING ---
  
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

  useEffect(() => {
    if (!propertyAreaContext) return;
    const { country, areaId } = propertyAreaContext;

    const catUnsub = onSnapshot(collection(db, 'countries', country, 'areas', areaId, 'featuresCategories'), (snapshot) => {
      const fetchedCats = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      fetchedCats.sort((a: any, b: any) => a.name.localeCompare(b.name));
      setFeaturesCategories(fetchedCats);
    });

    const aiUnsub = onSnapshot(collection(db, 'countries', country, 'areas', areaId, 'aiCategories'), (snapshot) => {
      const fetchedAi = snapshot.docs.map(doc => doc.data().name);
      fetchedAi.sort((a: string, b: string) => a.localeCompare(b));
      setAiCategories(fetchedAi);
    });

    return () => { catUnsub(); aiUnsub(); };
  }, [propertyAreaContext]);

  useEffect(() => {
    if (!propertyId) return;
    const featsRef = collection(db, 'properties', propertyId, 'features');
    const unsubscribe = onSnapshot(featsRef, (snapshot) => {
      const fetchedFeatures = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setFeatures(fetchedFeatures);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, [propertyId]);

  const availableMasterPhotos = featuresCategories
    .filter(cat => formData.categories.includes(cat.name))
    .flatMap(cat => cat.photos || []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      setFormData({ ...formData, [name]: (e.target as HTMLInputElement).checked });
    } else {
      setFormData({ ...formData, [name]: value });
    }
  };

  const handlePillToggle = (arrayName: 'categories' | 'experienceTypes', value: string) => {
    setFormData(prev => {
      const arr = prev[arrayName];
      if (arr.includes(value)) {
        return { ...prev, [arrayName]: arr.filter(item => item !== value) };
      } else {
        return { ...prev, [arrayName]: [...arr, value] };
      }
    });
  };

  // --- AI MAGIC FILL ---
  const handleMagicFill = async () => {
    const url = formData.googleMapsUrl;
    if (!url) return alert("Please paste a Google Maps URL first.");
    if (!propertyAreaContext) return alert("Property area data missing.");
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

      let matchedCategory = "";
      let finalDescription = googleData.description;

      try {
        const categoryNames = featuresCategories.map(c => c.name).join(', ');
        const gType = googleData.category?.replace(/_/g, ' ') || "local business";

        const prompt = `Act as a luxury travel concierge for ${propertyAreaContext.areaName}. We are adding "${googleData.name || placeNameFallback}" (Google classification: ${gType}).
        1. Pick the single most accurate category from our exact database list: [${categoryNames}]. If none fit well, return an empty string "".
        2. Write a short, engaging 2-sentence description explaining why guests should use or visit this.
        Return ONLY a valid JSON object in this exact format with no markdown wrappers:
        {"category": "Exact Category Name", "description": "Your 2 sentence description"}`;

        const model = getGenerativeModel(ai, { model: "gemini-2.5-flash" });
        const aiResult = await model.generateContent(prompt);
        const rawText = aiResult.response.text().replace(/```json/gi, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(rawText);

        if (parsed.category && featuresCategories.some(c => c.name === parsed.category)) {
          matchedCategory = parsed.category;
        }
        if (parsed.description && !googleData.description) {
          finalDescription = parsed.description;
        }
      } catch (e) {
        console.log("AI JSON mapping failed, falling back to simple match.", e);
        const gTypeLower = googleData.category?.toLowerCase().replace(/_/g, ' ') || "";
        const possibleMatch = featuresCategories.find(c => 
          gTypeLower.includes(c.name.toLowerCase()) || c.name.toLowerCase().includes(gTypeLower)
        );
        if (possibleMatch) matchedCategory = possibleMatch.name;
      }

      setFormData(prev => ({
        ...prev,
        name: googleData.name || placeNameFallback,
        categories: matchedCategory && !prev.categories.includes(matchedCategory) 
                      ? [...prev.categories, matchedCategory] 
                      : prev.categories,
        description: finalDescription || prev.description,
        latitude: googleData.latitude?.toString() || prev.latitude,
        longitude: googleData.longitude?.toString() || prev.longitude,
        phoneNumber: googleData.phoneNumber || prev.phoneNumber,
        website: googleData.websiteUri || prev.website,
        photoUrl: googleData.photoUrl || '' // Make Google photo the active one immediately
      }));

      if (googleData.photoUrl) {
        setGooglePhoto(googleData.photoUrl);
      }
    } catch (error) {
      console.error("Magic Fill Error:", error);
      alert("Could not process this link. Ensure it is a valid Google Maps place.");
    } finally {
      setIsMagicFilling(false);
    }
  };

  const handleGenerateDescription = async () => {
    if (!formData.name) return alert("Please enter a name first.");
    setIsGeneratingDesc(true);
    try {
      const cats = formData.categories.join(' and ');
      const area = propertyAreaContext?.areaName || "the local area";
      const prompt = `Write a short, luxurious 2-sentence description for a ${cats || 'feature'} called "${formData.name}" located in ${area}. Make it sound exclusive and appealing to high-end travelers. No quotes.`;
      const model = getGenerativeModel(ai, { model: "gemini-2.5-flash" });
      const result = await model.generateContent(prompt);
      setFormData(prev => ({ ...prev, description: result.response.text().trim() }));
    } catch (e) {
      console.error(e); alert("Failed to generate description.");
    } finally { setIsGeneratingDesc(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.categories.length === 0) return alert("Please select at least one Category.");
    if (formData.isLocal && formData.experienceTypes.length === 0) return alert("Please select an Experience Type for the Local tag.");

    setIsSubmitting(true);
    try {
      let finalPhotoUrl = formData.photoUrl;
      
      // Only upload if the actively selected photo is the custom one they uploaded
      if (customFile && formData.photoUrl === customPreview) {
        setIsUploadingImage(true);
        const storageRef = ref(storage, `properties/${propertyId}/features/${Date.now()}_${customFile.name}`);
        await uploadBytes(storageRef, customFile);
        finalPhotoUrl = await getDownloadURL(storageRef);
      }

      const featureData = { ...formData, photoUrl: finalPhotoUrl, updatedAt: new Date().toISOString() };

      if (editingFeatureId) {
        await updateDoc(doc(db, 'properties', propertyId, 'features', editingFeatureId), featureData);
      } else {
        await addDoc(collection(db, 'properties', propertyId, 'features'), featureData);
      }

      closeAndResetForm();
    } catch (error) { 
      alert("Failed to save feature."); 
    } finally { 
      setIsSubmitting(false); 
      setIsUploadingImage(false); 
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (window.confirm(`Delete ${name}?`)) {
      await deleteDoc(doc(db, 'properties', propertyId, 'features', id));
    }
  };

  const closeAndResetForm = () => {
    setIsFormOpen(false); 
    setEditingFeatureId(null); 
    setFormData(initialFormState); 
    setCustomFile(null); 
    setCustomPreview(null);
    setGooglePhoto(null);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center">
            <Briefcase className="mr-3 text-blue-600" size={28} />
            Property Features
          </h2>
          <p className="text-gray-500 mt-1">
            Manage services and local experiences specific to this property. 
            {propertyAreaContext && <span className="ml-1 font-medium text-blue-600">(Connected to {propertyAreaContext.areaName})</span>}
          </p>
        </div>
        {!isFormOpen && (
          <button onClick={() => { setIsFormOpen(true); setFormData(initialFormState); setCustomPreview(null); setCustomFile(null); setGooglePhoto(null); }} className="flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 transition-colors shadow-sm">
            <Plus size={18} className="mr-2" /> Add Feature
          </button>
        )}
      </div>

      {!propertyAreaContext && !isLoading && (
        <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-xl mb-6 text-sm text-yellow-800">
          <strong>Setup Required:</strong> We couldn't find an Area or City assigned to this property. Please go to the <strong>Property Types</strong> tab and ensure you have entered a City/Area. This is required to load your global categories and enable AI Magic Fill.
        </div>
      )}

      {isFormOpen && (
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden mb-8 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="px-6 py-4 bg-blue-50 border-b border-blue-100 flex items-center justify-between">
            <h3 className="text-lg font-bold text-blue-900">
              {editingFeatureId ? 'Edit Feature' : 'Add New Feature'}
            </h3>
            <button type="button" onClick={closeAndResetForm} className="text-blue-500 hover:text-blue-700 font-medium text-sm">Cancel</button>
          </div>

          <div className="p-6">
            
            {/* 1. MAGIC FILL - Fixed Alignment (items-end) */}
            <div className="flex flex-col md:flex-row gap-4 mb-8 bg-indigo-50/50 p-4 rounded-xl border border-indigo-100 items-end">
              <div className="flex-1 w-full">
                <label className="block text-xs font-bold text-indigo-900 uppercase tracking-wider mb-1">Google Maps Link</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-3 text-indigo-400" size={18} />
                  <input type="url" name="googleMapsUrl" value={formData.googleMapsUrl} onChange={handleChange} placeholder="Paste FULL or Short Google Maps URL here..." className="w-full pl-10 pr-4 py-2.5 bg-white border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
                </div>
              </div>
              <button type="button" onClick={handleMagicFill} disabled={isMagicFilling || !formData.googleMapsUrl || !propertyAreaContext} className="w-full md:w-auto h-[46px] px-6 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-lg disabled:opacity-50 transition-colors shadow-sm flex items-center justify-center whitespace-nowrap">
                {isMagicFilling ? <Loader2 size={18} className="animate-spin mr-2" /> : <Wand2 size={18} className="mr-2" />}
                AI Magic Fill
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-8">
              
              {/* 2. CORE INFO */}
              <div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Feature Name *</label>
                    <input type="text" name="name" required value={formData.name} onChange={handleChange} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Agreement (Percentage) *</label>
                    <div className="relative">
                      <input type="number" step="0.1" name="agreement" required value={formData.agreement} onChange={handleChange} placeholder="0" className="w-full pl-4 pr-10 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                      <div className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none text-gray-500 font-bold">%</div>
                    </div>
                  </div>
                </div>

                <div className="mb-6">
                  {featuresCategories.length > 0 ? (
                    <PillSelector label="Feature Categories *" options={featuresCategories.map(c => c.name)} selected={formData.categories} onToggle={(v) => handlePillToggle('categories', v)} colorClass="blue" />
                  ) : (
                     <p className="text-sm text-red-600 font-medium">No Categories found for {propertyAreaContext?.areaName || 'this area'}. Please add them in the global Area Functionality tab.</p>
                  )}
                </div>
              </div>

              {/* 3. AI DESCRIPTION */}
              <div>
                <div className="flex justify-between items-end mb-2">
                  <label className="block text-sm font-bold text-gray-700">Description *</label>
                  <button type="button" onClick={handleGenerateDescription} disabled={isGeneratingDesc || !formData.name} className="text-xs font-bold text-purple-600 flex items-center bg-purple-50 px-3 py-1.5 rounded-lg hover:bg-purple-100 transition-colors">
                    {isGeneratingDesc ? <Loader2 size={14} className="animate-spin mr-1" /> : <Wand2 size={14} className="mr-1" />} AI Write
                  </button>
                </div>
                <textarea name="description" required rows={3} value={formData.description} onChange={handleChange} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-y" />
              </div>

              {/* 4. CONTACT INFORMATION */}
              <div>
                <h3 className="text-lg font-bold border-b pb-2 mb-4 mt-8">Contact Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Phone Number</label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-3 text-gray-400" size={18} />
                      <input type="tel" name="phoneNumber" value={formData.phoneNumber} onChange={handleChange} className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">WhatsApp</label>
                    <div className="relative">
                      <MessageCircle className="absolute left-3 top-3 text-gray-400" size={18} />
                      <input type="tel" name="whatsapp" value={formData.whatsapp} onChange={handleChange} className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Email</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 text-gray-400" size={18} />
                      <input type="email" name="email" value={formData.email} onChange={handleChange} className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Website</label>
                    <div className="relative">
                      <LinkIcon className="absolute left-3 top-3 text-gray-400" size={18} />
                      <input type="url" name="website" value={formData.website} onChange={handleChange} className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                    </div>
                  </div>
                </div>
              </div>

              {/* 5. LOCATION */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Latitude</label>
                  <input type="text" name="latitude" value={formData.latitude} onChange={handleChange} className="w-full px-4 py-2.5 bg-gray-50 border border-gray-300 rounded-lg outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Longitude</label>
                  <input type="text" name="longitude" value={formData.longitude} onChange={handleChange} className="w-full px-4 py-2.5 bg-gray-50 border border-gray-300 rounded-lg outline-none" />
                </div>
              </div>

              {/* 6. COVER PHOTO (Memory Upgraded) */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Cover Photo</label>
                <div className="flex flex-col md:flex-row items-start gap-6 bg-blue-50/50 p-6 rounded-xl border border-blue-100">
                  
                  {/* Fixed Margin/Padding Issue */}
                  <div className="w-48 h-32 rounded-xl border-2 border-dashed border-gray-300 overflow-hidden bg-gray-100 flex items-center justify-center shrink-0">
                    {formData.photoUrl ? (
                      <img src={formData.photoUrl} className="w-full h-full object-cover block" />
                    ) : (
                      <div className="text-gray-400 flex flex-col items-center">
                        <ImageIcon size={24} className="mb-1" />
                        <span className="text-xs font-medium">No Image</span>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex-1 w-full">
                    <p className="text-sm font-bold text-gray-700 mb-2">Upload Custom Image</p>
                    <input type="file" accept="image/*" onChange={(e) => { 
                      if (e.target.files?.[0]) { 
                        const file = e.target.files[0];
                        const url = URL.createObjectURL(file);
                        setCustomFile(file); 
                        setCustomPreview(url); 
                        setFormData({...formData, photoUrl: url}); 
                      } 
                    }} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-bold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer mb-4" />
                    
                    {/* Selectable Thumbnail Gallery */}
                    {(availableMasterPhotos.length > 0 || googlePhoto || customPreview) && (
                      <div className="border-t border-blue-200 pt-4">
                        <p className="text-xs font-bold text-blue-900 mb-2 uppercase tracking-wider">Select Photo Source</p>
                        <div className="flex gap-3 overflow-x-auto pb-2 items-center">
                          
                          {/* Uploaded Thumbnail */}
                          {customPreview && (
                            <div className="relative shrink-0 mt-1">
                              <img src={customPreview} onClick={() => setFormData({...formData, photoUrl: customPreview})} className={`w-16 h-16 object-cover rounded-lg cursor-pointer border-[3px] hover:opacity-80 transition-all ${formData.photoUrl === customPreview ? 'border-blue-600 shadow-md scale-105' : 'border-transparent'}`} />
                              <div className="absolute top-1 left-1 bg-white/90 backdrop-blur-sm text-gray-800 text-[9px] font-bold px-1.5 py-0.5 rounded shadow-sm leading-none">Upload</div>
                            </div>
                          )}

                          {/* Google Memory Thumbnail */}
                          {googlePhoto && (
                            <div className="relative shrink-0 mt-1">
                              <img src={googlePhoto} onClick={() => setFormData({...formData, photoUrl: googlePhoto})} className={`w-16 h-16 object-cover rounded-lg cursor-pointer border-[3px] hover:opacity-80 transition-all ${formData.photoUrl === googlePhoto ? 'border-blue-600 shadow-md scale-105' : 'border-transparent'}`} />
                              {/* Fixed Badge Position */}
                              <div className="absolute top-1 left-1 bg-white/90 backdrop-blur-sm text-blue-600 text-[9px] font-bold px-1.5 py-0.5 rounded shadow-sm leading-none">Google</div>
                            </div>
                          )}

                          {/* Global Area Thumbnails */}
                          {availableMasterPhotos.map((url, idx) => (
                            <div key={idx} className="relative shrink-0 mt-1">
                              <img src={url} onClick={() => setFormData({...formData, photoUrl: url})} className={`w-16 h-16 object-cover rounded-lg cursor-pointer border-[3px] hover:opacity-80 transition-all ${formData.photoUrl === url ? 'border-blue-600 shadow-md scale-105' : 'border-transparent'}`} />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                  </div>
                </div>
              </div>

              {/* 7. DISPLAY & TARGETING */}
              <div className="bg-gray-50 p-6 rounded-xl border border-gray-200">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Display & Targeting</h3>
                
                <div className="space-y-4 mb-6">
                  <label className="flex items-start bg-white p-4 rounded-xl border border-gray-200 cursor-pointer hover:border-blue-300 transition-colors">
                    <div className="flex items-center h-5">
                      <input type="checkbox" name="isMainPage" checked={formData.isMainPage} onChange={handleChange} className="h-5 w-5 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer" />
                    </div>
                    <div className="ml-3">
                      <span className="block text-sm font-bold text-gray-900">Show on Main Page</span>
                      <span className="block text-xs text-gray-500 mt-0.5">Highlight this feature prominently on the guest portal.</span>
                    </div>
                  </label>

                  <label className="flex items-start bg-white p-4 rounded-xl border border-gray-200 cursor-pointer hover:border-purple-300 transition-colors">
                    <div className="flex items-center h-5">
                      <input type="checkbox" name="isLocal" checked={formData.isLocal} onChange={handleChange} className="h-5 w-5 text-purple-600 focus:ring-purple-500 border-gray-300 rounded cursor-pointer" />
                    </div>
                    <div className="ml-3">
                      <span className="block text-sm font-bold text-gray-900">Live Like a Local</span>
                      <span className="block text-xs text-gray-500 mt-0.5">Tag this as a highly curated local experience to unlock advanced targeting options.</span>
                    </div>
                  </label>
                </div>

                {formData.isLocal && (
                  <div className="bg-purple-50 p-5 rounded-xl border border-purple-100 animate-in fade-in slide-in-from-top-2">
                    <h3 className="text-sm font-bold text-purple-900 uppercase tracking-wider mb-2 flex items-center">
                      <Wand2 size={16} className="mr-2" /> Experience Targeting
                    </h3>
                    <p className="text-sm text-purple-700 mb-4">Select the ideal vibe for this experience. Multiple selections allowed.</p>
                    
                    {aiCategories.length === 0 ? (
                      <p className="text-sm text-purple-600 italic">No AI Categories found for this area. Please add them in the Area Functionality hub.</p>
                    ) : (
                      <PillSelector label="Experience Type *" options={aiCategories} selected={formData.experienceTypes} onToggle={(v) => handlePillToggle('experienceTypes', v)} colorClass="purple" />
                    )}
                  </div>
                )}
              </div>

              {/* SUBMIT BUTTON */}
              <div className="flex justify-end pt-4 border-t border-gray-100">
                <button type="button" onClick={closeAndResetForm} className="px-6 py-3 mr-4 text-sm font-bold text-gray-700 hover:bg-gray-200 rounded-xl transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={isSubmitting || isUploadingImage} className="flex items-center px-8 py-3 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl disabled:opacity-50 transition-colors shadow-md hover:shadow-lg">
                  {(isSubmitting || isUploadingImage) && <Loader2 size={18} className="mr-2 animate-spin" />}
                  {isUploadingImage ? 'Uploading...' : isSubmitting ? 'Saving...' : 'Save Feature'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* LIST VIEW */}
      {isLoading ? (
        <div className="py-20 text-center text-gray-400"><Loader2 size={40} className="animate-spin mx-auto mb-4" /></div>
      ) : features.length === 0 && !isFormOpen ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-xl p-12 text-center">
          <Briefcase size={40} className="mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-bold text-gray-900 mb-2">No Features Added</h3>
          <p className="text-gray-500">Create the first specific feature for this property.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feat) => (
            <div key={feat.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col">
              <div className="h-48 bg-gray-200 relative">
                {feat.photoUrl ? (
                  <img src={feat.photoUrl} className="w-full h-full object-cover block" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400"><ImageIcon size={32} /></div>
                )}
                <div className="absolute top-3 left-3 flex flex-wrap gap-1 max-w-[70%]">
                  {feat.categories?.map((cat: string) => (
                    <span key={cat} className="bg-white/90 backdrop-blur-sm px-2 py-0.5 rounded-md text-[10px] font-bold text-gray-900 shadow-sm whitespace-nowrap">
                      {cat}
                    </span>
                  ))}
                </div>
                {feat.agreement && feat.agreement !== "0" && (
                  <div className="absolute top-3 right-3 bg-blue-600 text-white px-2.5 py-1 rounded-full text-xs font-bold shadow-sm">
                    {feat.agreement}%
                  </div>
                )}
              </div>
              <div className="p-5 flex-1 flex flex-col">
                <h3 className="font-bold text-lg text-gray-900 mb-1">{feat.name}</h3>
                <p className="text-sm text-gray-500 mb-4 line-clamp-2 flex-1">{feat.description}</p>
                
                <div className="flex flex-wrap gap-2 mb-4">
                  {feat.isMainPage && <span className="text-[10px] font-bold bg-blue-100 text-blue-800 px-2 py-1 rounded-md">Main Page</span>}
                  {feat.isLocal && <span className="text-[10px] font-bold bg-purple-100 text-purple-800 px-2 py-1 rounded-md">Local Experience</span>}
                </div>

                <div className="mt-auto flex justify-end gap-2 pt-4 border-t border-gray-100">
                  <button onClick={() => { setFormData(feat); setEditingFeatureId(feat.id); setGooglePhoto(null); setCustomPreview(null); setIsFormOpen(true); }} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"><Pencil size={18} /></button>
                  <button onClick={() => handleDelete(feat.id, feat.name)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={18} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PillSelector({ label, options, selected, onToggle, colorClass }: { label: string, options: string[], selected: string[], onToggle: (val: string) => void, colorClass: 'blue' | 'purple' }) {
  const colorMap = {
    blue: { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-300' },
    purple: { bg: 'bg-purple-100', text: 'text-purple-800', border: 'border-purple-300' }
  };
  const activeStyle = colorMap[colorClass];

  return (
    <div>
      <p className="text-sm font-bold text-gray-700 mb-2">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map(opt => {
          const isSelected = selected.includes(opt);
          return (
            <button 
              key={opt} 
              type="button" 
              onClick={() => onToggle(opt)} 
              className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                isSelected 
                  ? `${activeStyle.bg} ${activeStyle.text} ${activeStyle.border} shadow-sm` 
                  : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}