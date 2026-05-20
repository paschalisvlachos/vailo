import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, ai } from '../../../lib/firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getGenerativeModel } from "firebase/ai";
import { ArrowLeft, Plus, MapPin, Wand2, Star, Image as ImageIcon, Pencil, Trash2, Map, Loader2, Tag } from 'lucide-react';

export default function AreaLocalGems() {
  const { country, area } = useParams<{ country: string, area: string }>();
  const navigate = useNavigate();
  
  const decodedCountry = decodeURIComponent(country || '');
  const decodedArea = decodeURIComponent(area || '');
  const areaId = decodedArea.toLowerCase().replace(/\s+/g, '-');

  const [gems, setGems] = useState<any[]>([]);
  const [categories, setCategories] = useState<{id: string, name: string}[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingGemId, setEditingGemId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMagicFilling, setIsMagicFilling] = useState(false);
  
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const initialFormState = {
    name: '',
    category: '', // 🔥 Fixed: Now explicitly empty by default
    rating: '',
    description: '',
    latitude: '',
    longitude: '',
    googleMapsUrl: '',
    photoUrl: '',
    isDailyTrip: false
  };
  
  const [formData, setFormData] = useState(initialFormState);

  // 1. Fetch Dynamic Categories
  useEffect(() => {
    if (!decodedCountry || !areaId) return;
    const catRef = collection(db, 'countries', decodedCountry, 'areas', areaId, 'localGemsCategories');
    const unsubscribe = onSnapshot(catRef, (snapshot) => {
      const fetchedCats = snapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name }));
      fetchedCats.sort((a, b) => a.name.localeCompare(b.name));
      setCategories(fetchedCats);
      // 🔥 Fixed: Removed the code that auto-selected the first category
    });
    return () => unsubscribe();
  }, [decodedCountry, areaId]);

  // 2. Fetch Area Gems
  useEffect(() => {
    if (!decodedCountry || !areaId) return;
    const gemsRef = collection(db, 'countries', decodedCountry, 'areas', areaId, 'localGems');
    const unsubscribe = onSnapshot(gemsRef, (snapshot) => {
      const fetchedGems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setGems(fetchedGems);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, [decodedCountry, areaId]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      setFormData({ ...formData, [name]: (e.target as HTMLInputElement).checked });
    } else {
      setFormData({ ...formData, [name]: value });
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  // --- AI MAGIC FILL (Upgraded for Short Links) ---
  const handleMagicFill = async () => {
    const url = formData.googleMapsUrl;
    if (!url) return alert("Please paste a Google Maps URL first.");
    setIsMagicFilling(true);

    try {
      let searchQuery = "";
      let placeNameFallback = ""; 
      
      const nameMatch = url.match(/\/place\/([^\/]+)\//);
      if (nameMatch && nameMatch[1]) {
        // It's a standard long URL, we can format it here
        placeNameFallback = decodeURIComponent(nameMatch[1].replace(/\+/g, ' '));
        searchQuery = `${placeNameFallback} ${decodedArea}`; 
      } else {
        // 🔥 THE FIX: It's a short link! We pass the raw URL directly to our smart backend.
        searchQuery = url;
      }

      const functions = getFunctions();
      const getGooglePlaceDetails = httpsCallable(functions, 'getGooglePlaceDetails');
      
      // We pass the area so the backend can append it if it unwraps a short link
      const result = await getGooglePlaceDetails({ searchQuery, area: decodedArea });
      const googleData: any = result.data;

      // Try to intelligently map Google's category to one of our dynamic categories
      let matchedCategory = ""; // Default to unselected
      const gType = googleData.category?.toLowerCase() || "";
      const possibleMatch = categories.find(c => 
        gType.includes(c.name.toLowerCase()) || c.name.toLowerCase().includes(gType)
      );
      if (possibleMatch) matchedCategory = possibleMatch.name;

      // AI Description Fallback
      let finalDescription = googleData.description;
      if (!finalDescription) {
        try {
          const prompt = `Act as a luxury travel concierge for ${decodedArea}, ${decodedCountry}. Write a short, engaging 2-sentence description for a local spot called "${googleData.name || placeNameFallback}". Tell guests why they should visit. Return ONLY the description text, no quotes.`;
          const model = getGenerativeModel(ai, { model: "gemini-2.5-flash" });
          const aiResult = await model.generateContent(prompt);
          finalDescription = aiResult.response.text().trim();
        } catch (e) {
          console.log("Gemini fallback failed.", e);
        }
      }

      setFormData(prev => ({
        ...prev,
        name: googleData.name || placeNameFallback,
        category: matchedCategory || prev.category,
        rating: googleData.rating ? googleData.rating.toString() : prev.rating,
        description: finalDescription || prev.description,
        latitude: googleData.latitude?.toString() || prev.latitude,
        longitude: googleData.longitude?.toString() || prev.longitude,
        photoUrl: googleData.photoUrl || ''
      }));

      if (googleData.photoUrl) {
        setImagePreview(googleData.photoUrl);
        setImageFile(null);
      }
    } catch (error) {
      console.error("Magic Fill Error:", error);
      alert("Could not process this link. Ensure it is a valid Google Maps place.");
    } finally {
      setIsMagicFilling(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      let finalPhotoUrl = formData.photoUrl;

      if (imageFile) {
        setIsUploadingImage(true);
        const storageRef = ref(storage, `areas/${decodedCountry}/${areaId}/gems/${Date.now()}_${imageFile.name}`);
        await uploadBytes(storageRef, imageFile);
        finalPhotoUrl = await getDownloadURL(storageRef);
        setIsUploadingImage(false);
      }

      const gemData = {
        ...formData,
        photoUrl: finalPhotoUrl,
        updatedAt: new Date().toISOString()
      };

      if (editingGemId) {
        await updateDoc(doc(db, 'countries', decodedCountry, 'areas', areaId, 'localGems', editingGemId), gemData);
      } else {
        await addDoc(collection(db, 'countries', decodedCountry, 'areas', areaId, 'localGems'), gemData);
      }

      setIsFormOpen(false);
      setEditingGemId(null);
      setFormData(initialFormState);
      setImageFile(null);
      setImagePreview(null);
      
    } catch (error) {
      console.error("Error saving Gem:", error);
      alert("Failed to save Local Gem.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (gem: any) => {
    setFormData(gem);
    setImagePreview(gem.photoUrl);
    setEditingGemId(gem.id);
    setIsFormOpen(true);
  };

  const handleDelete = async (id: string, name: string) => {
    if (window.confirm(`Are you sure you want to delete ${name}?`)) {
      await deleteDoc(doc(db, 'countries', decodedCountry, 'areas', areaId, 'localGems', id));
    }
  };

  if (categories.length === 0 && !isLoading) {
    return (
      <div className="max-w-5xl mx-auto pb-8">
        <div className="bg-white border border-dashed border-gray-300 rounded-xl p-12 text-center">
          <Tag size={40} className="mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-bold text-gray-900 mb-2">No Categories Found</h3>
          <p className="text-gray-500 mb-6">You must create at least one Local Gems Category before adding gems.</p>
          <button onClick={() => navigate(`/area/${country}/${area}/local-gems-categories`)} className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors">
            Go to Categories
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto pb-8">
      
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center">
          <button onClick={() => navigate('/area')} className="p-2 mr-4 rounded-xl hover:bg-gray-200 text-gray-500 transition-colors">
            <ArrowLeft size={24} />
          </button>
          <div>
            <h2 className="text-2xl font-bold text-gray-900 flex items-center">
              <Map className="mr-3 text-orange-600" size={28} />
              Master Local Gems
            </h2>
            <p className="text-gray-500 mt-1">
              Global gems for <span className="font-bold text-orange-700">{decodedArea}, {decodedCountry}</span>
            </p>
          </div>
        </div>
        {!isFormOpen && (
          <button onClick={() => { setFormData(initialFormState); setImagePreview(null); setImageFile(null); setIsFormOpen(true); }} className="flex items-center px-4 py-2 bg-orange-600 text-white text-sm font-bold rounded-lg hover:bg-orange-700 transition-colors shadow-sm">
            <Plus size={18} className="mr-2" /> Add Gem
          </button>
        )}
      </div>

      {/* FORM SECTION */}
      {isFormOpen && (
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden mb-8 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="px-6 py-4 bg-orange-50 border-b border-orange-100 flex items-center justify-between">
            <h3 className="text-lg font-bold text-orange-900">
              {editingGemId ? 'Edit Local Gem' : 'Add New Local Gem'}
            </h3>
            <button type="button" onClick={() => setIsFormOpen(false)} className="text-orange-500 hover:text-orange-700 font-medium text-sm">Cancel</button>
          </div>

          <div className="p-6">
            <div className="flex flex-col md:flex-row gap-4 mb-8 bg-blue-50/50 p-4 rounded-xl border border-blue-100 items-center">
              <div className="flex-1 w-full">
                <label className="block text-xs font-bold text-blue-900 uppercase tracking-wider mb-1">Google Maps Link</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-3 text-blue-400" size={18} />
                  <input type="url" name="googleMapsUrl" value={formData.googleMapsUrl} onChange={handleChange} placeholder="Paste FULL or Short Google Maps URL here..." className="w-full pl-10 pr-4 py-2.5 bg-white border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
                </div>
              </div>
              <button type="button" onClick={handleMagicFill} disabled={isMagicFilling || !formData.googleMapsUrl} className="w-full md:w-auto mt-4 md:mt-0 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg disabled:opacity-50 transition-colors shadow-sm flex items-center justify-center whitespace-nowrap">
                {isMagicFilling ? <Loader2 size={18} className="animate-spin mr-2" /> : <Wand2 size={18} className="mr-2" />}
                AI Magic Fill
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Name *</label>
                  <input type="text" name="name" required value={formData.name} onChange={handleChange} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Category *</label>
                  <select name="category" required value={formData.category} onChange={handleChange} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none bg-white">
                    {/* 🔥 Fixed: Default unselectable option added */}
                    <option value="" disabled>Select a Category...</option>
                    {categories.map(cat => <option key={cat.id} value={cat.name}>{cat.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Google Rating (1-5)</label>
                  <input type="number" step="0.1" max="5" name="rating" value={formData.rating} onChange={handleChange} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Daily Trip?</label>
                  <div className="flex items-center h-[42px]">
                    <input type="checkbox" name="isDailyTrip" checked={formData.isDailyTrip} onChange={handleChange} className="h-5 w-5 text-orange-600 rounded cursor-pointer" />
                    <span className="ml-2 text-sm text-gray-600">Tag as a full-day excursion</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">AI Description *</label>
                <textarea name="description" required rows={3} value={formData.description} onChange={handleChange} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none resize-y" />
              </div>

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

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Cover Photo</label>
                <div className="flex items-start space-x-6">
                  <div className="w-48 h-32 rounded-xl border-2 border-dashed border-gray-300 overflow-hidden bg-gray-50 flex items-center justify-center relative shrink-0">
                    {imagePreview ? (
                      <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
                    ) : (
                      <div className="text-gray-400 flex flex-col items-center">
                        <ImageIcon size={24} className="mb-1" />
                        <span className="text-xs font-medium">No Image</span>
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <input type="file" accept="image/*" onChange={handleImageChange} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-bold file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100 cursor-pointer" />
                    <p className="text-xs text-gray-500 mt-2">Uploading manually will override the Google Maps photo.</p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-4 border-t border-gray-100">
                <button type="submit" disabled={isSubmitting || isUploadingImage} className="flex items-center px-8 py-3 bg-gray-900 text-white text-sm font-bold rounded-xl hover:bg-black disabled:opacity-50 transition-colors shadow-md">
                  {(isSubmitting || isUploadingImage) ? <Loader2 size={18} className="animate-spin mr-2" /> : null}
                  Save Local Gem
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* LIST OF GEMS */}
      {isLoading ? (
        <div className="py-20 text-center text-gray-400"><Loader2 size={40} className="animate-spin mx-auto mb-4" /></div>
      ) : gems.length === 0 && !isFormOpen ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-xl p-12 text-center">
          <Map size={40} className="mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-bold text-gray-900 mb-2">No Local Gems Added</h3>
          <p className="text-gray-500">Add the first local gem for {decodedArea}.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {gems.map((gem) => (
            <div key={gem.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-shadow">
              <div className="h-48 bg-gray-200 relative">
                {gem.photoUrl ? (
                  <img src={gem.photoUrl} alt={gem.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400"><ImageIcon size={32} /></div>
                )}
                <div className="absolute top-3 left-3 bg-white/90 backdrop-blur-sm px-2.5 py-1 rounded-full text-xs font-bold text-gray-900 shadow-sm">
                  {gem.category}
                </div>
                {gem.isDailyTrip && (
                  <div className="absolute top-3 right-3 bg-blue-600 text-white px-2.5 py-1 rounded-full text-xs font-bold shadow-sm">
                    Daily Trip
                  </div>
                )}
              </div>
              <div className="p-5 flex-1 flex flex-col">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="text-lg font-bold text-gray-900 line-clamp-1">{gem.name}</h3>
                  {gem.rating && (
                    <span className="flex items-center text-sm font-bold text-gray-700 bg-yellow-100 px-2 py-0.5 rounded-md">
                      <Star size={14} className="text-yellow-500 mr-1 fill-current" /> {gem.rating}
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-500 line-clamp-3 mb-4 flex-1">{gem.description}</p>
                <div className="flex items-center justify-end gap-2 pt-4 border-t border-gray-100 mt-auto">
                  <button onClick={() => handleEdit(gem)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"><Pencil size={18} /></button>
                  <button onClick={() => handleDelete(gem.id, gem.name)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={18} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}