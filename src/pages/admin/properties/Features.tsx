import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../../lib/firebase';
import { ArrowLeft, Plus, Image as ImageIcon, Pencil, Trash2, Building, Loader2, Star, Link as LinkIcon, Phone } from 'lucide-react';

const CATEGORY_OPTIONS = [
  "Rent a Car", "Private Chef", "Massage & Spa", "Tours & Activities", 
  "Boat & Yacht", "Airport Transfer / Taxi", "Grocery Delivery", 
  "Babysitting / Childcare", "Photography / Video", "Personal Trainer / Yoga", 
  "Equipment Rental", "Other"
];

const TRAVELER_OPTIONS = ["Couple", "Family", "Group", "Adults Only"];
const EXPERIENCE_OPTIONS = [
  "Beach", "Culture", "Nature", "Hiking", "Dining", "Events & Festivals", 
  "Horse Riding", "Jeep Safari", "Boat Tours", "Water Sports", "Playground", 
  "Fitness & Sports", "Nightlife"
];
const PACE_OPTIONS = ["Relaxed", "Moderate", "Active"];

export default function Features() {
  // Notice: We only need propertyId, because features belong to the PROPERTY, not the unit.
  const { propertyId } = useOutletContext<{ propertyId: string }>();
  
  const [features, setFeatures] = useState<any[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingFeatureId, setEditingFeatureId] = useState<string | null>(null);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  
  const initialFormState = {
    businessName: '',
    description: '',
    phone: '',
    whatsapp: '',
    email: '',
    website: '',
    photoUrl: '',
    categories: [] as string[],
    showOnMain: true,
    liveLikeLocal: false,
    // Live like a local specific arrays
    travelers: [] as string[],
    experienceTypes: [] as string[],
    paces: [] as string[]
  };
  
  const [formData, setFormData] = useState(initialFormState);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  // Fetch Features Sub-collection
  useEffect(() => {
    if (!propertyId) return;
    const unsubscribe = onSnapshot(collection(db, 'properties', propertyId, 'features'), (snapshot) => {
      const featureData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setFeatures(featureData);
    });
    return () => unsubscribe();
  }, [propertyId]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData(prev => ({ ...prev, [name]: checked }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  // Helper function to toggle items in array states (The "Pill" selector logic)
  const toggleArrayItem = (arrayName: keyof typeof formData, item: string) => {
    setFormData(prev => {
      const currentArray = prev[arrayName] as string[];
      if (currentArray.includes(item)) {
        return { ...prev, [arrayName]: currentArray.filter(i => i !== item) };
      } else {
        return { ...prev, [arrayName]: [...currentArray, item] };
      }
    });
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const submitFeature = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!propertyId) return;
    if (formData.categories.length === 0) return alert("Please select at least one Category.");
    
    setIsSubmitting(true);
    
    try {
      let finalPhotoUrl = formData.photoUrl;

      // Upload image to Firebase Storage if a new one was selected
      if (imageFile) {
        setIsUploadingImage(true);
        const fileRef = ref(storage, `properties/${propertyId}/features/${Date.now()}_${imageFile.name}`);
        await uploadBytes(fileRef, imageFile);
        finalPhotoUrl = await getDownloadURL(fileRef);
        setIsUploadingImage(false);
      }

      // If Live Like Local is turned off, clear those specific arrays before saving to keep DB clean
      const payloadToSave = {
        ...formData,
        photoUrl: finalPhotoUrl,
        travelers: formData.liveLikeLocal ? formData.travelers : [],
        experienceTypes: formData.liveLikeLocal ? formData.experienceTypes : [],
        paces: formData.liveLikeLocal ? formData.paces : [],
        updatedAt: new Date().toISOString()
      };

      if (editingFeatureId) {
        await updateDoc(doc(db, 'properties', propertyId, 'features', editingFeatureId), payloadToSave);
      } else {
        await addDoc(collection(db, 'properties', propertyId, 'features'), {
          ...payloadToSave, createdAt: new Date().toISOString()
        });
      }

      setIsFormOpen(false);
      setEditingFeatureId(null);
      setFormData(initialFormState);
      setImageFile(null);
      setImagePreview(null);

    } catch (error) {
      console.error("Error saving feature:", error);
      alert("Failed to save feature.");
      setIsUploadingImage(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditClick = (featureData: any) => {
    setFormData(featureData);
    setImagePreview(featureData.photoUrl || null);
    setImageFile(null);
    setEditingFeatureId(featureData.id);
    setIsFormOpen(true);
  };

  const handleDeleteClick = async (featureId: string, featureName: string) => {
    if (window.confirm(`Are you sure you want to remove "${featureName}"?`)) {
      try {
        await deleteDoc(doc(db, 'properties', propertyId, 'features', featureId));
      } catch (error) {
        alert("Failed to delete feature.");
      }
    }
  };

  // Reusable Component for the interactive Multi-Select Pills
  const PillSelector = ({ 
    label, 
    options, 
    arrayName, 
    colorClass = "blue" 
  }: {
    label: string;
    options: string[];
    arrayName: keyof typeof initialFormState;
    colorClass?: string;
  }) => {
    const selectedArray = formData[arrayName] as string[];
    return (
      <div className="mb-6">
        <label className="block text-sm font-bold text-gray-900 mb-2">{label}</label>
        <div className="flex flex-wrap gap-2">
          {options.map((opt: string) => {
            const isSelected = selectedArray.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                onClick={() => toggleArrayItem(arrayName, opt)}
                className={`px-3 py-1.5 text-sm font-medium rounded-full transition-all border ${
                  isSelected 
                    ? `bg-${colorClass}-100 border-${colorClass}-300 text-${colorClass}-800 shadow-sm` 
                    : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300'
                }`}
              >
                {opt}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  // Reusable Component for iOS style toggle
  const CustomToggle = ({ label, description, name, checked }: any) => (
    <label className="flex items-center justify-between cursor-pointer group bg-white hover:bg-gray-50 p-4 rounded-xl border border-gray-200 transition-colors shadow-sm">
      <div className="pr-4">
        <span className="block text-sm font-bold text-gray-900">{label}</span>
        {description && <span className="block text-xs font-medium text-gray-500 mt-0.5">{description}</span>}
      </div>
      <div className="relative inline-flex items-center cursor-pointer flex-shrink-0">
        <input type="checkbox" name={name} checked={checked} onChange={handleChange} className="sr-only peer" />
        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600 shadow-inner"></div>
      </div>
    </label>
  );

  // --- UI RENDERING ---

  if (!isFormOpen) {
    return (
      <div>
        <div className="flex justify-between items-center mb-6">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Property Features</h3>
            <p className="text-sm text-gray-500">Manage partners, services, and local recommendations for this property.</p>
          </div>
          <button onClick={() => setIsFormOpen(true)} className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm text-sm font-medium">
            <Plus size={18} className="mr-2" /> Add Feature
          </button>
        </div>

        {features.length === 0 ? (
          <div className="text-center py-16 bg-gray-50 rounded-xl border border-dashed border-gray-200">
            <Building size={32} className="mx-auto text-gray-400 mb-3" />
            <p className="text-gray-900 font-medium">No features added yet</p>
            <p className="text-gray-500 text-sm mt-1">Add chefs, rentals, and local experiences for your guests.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map(feature => (
              <div key={feature.id} className="border border-gray-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow bg-white flex flex-col">
                <div className="h-40 bg-gray-100 relative">
                  {feature.photoUrl ? (
                    <img src={feature.photoUrl} alt={feature.businessName} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ImageIcon size={32} className="text-gray-300" />
                    </div>
                  )}
                  <div className="absolute top-3 right-3 flex flex-col gap-2">
                    {feature.liveLikeLocal && <span className="bg-purple-100 text-purple-800 text-[10px] uppercase font-bold px-2 py-1 rounded shadow-sm flex items-center"><Star size={10} className="mr-1 fill-current"/> Local</span>}
                    {feature.showOnMain && <span className="bg-blue-100 text-blue-800 text-[10px] uppercase font-bold px-2 py-1 rounded shadow-sm">Main Page</span>}
                  </div>
                </div>
                
                <div className="p-5 flex-1 flex flex-col">
                  <h4 className="font-bold text-gray-900 text-lg mb-1 truncate">{feature.businessName}</h4>
                  
                  <div className="flex flex-wrap gap-1 mb-3">
                    {feature.categories.map((cat: string) => (
                      <span key={cat} className="text-[10px] font-semibold bg-gray-100 text-gray-600 px-2 py-0.5 rounded-md border border-gray-200">
                        {cat}
                      </span>
                    ))}
                  </div>

                  <div className="mt-auto pt-4 flex items-center justify-between border-t border-gray-50">
                    <div className="flex gap-3">
                      {feature.phone && (
                        <a href={`tel:${feature.phone}`} title={feature.phone} className="text-gray-400 hover:text-blue-500 transition-colors">
                          <Phone size={16} />
                        </a>
                      )}
                      {feature.website && (
                        <a href={feature.website.startsWith('http') ? feature.website : `https://${feature.website}`} target="_blank" rel="noopener noreferrer" title={feature.website} className="text-gray-400 hover:text-blue-500 transition-colors">
                          <LinkIcon size={16} />
                        </a>
                      )}
                    </div>
                    <div className="flex items-center">
                      <button onClick={() => handleEditClick(feature)} className="text-blue-600 hover:text-blue-800 mr-3 p-1"><Pencil size={16} /></button>
                      <button onClick={() => handleDeleteClick(feature.id, feature.businessName)} className="text-red-500 hover:text-red-700 p-1"><Trash2 size={16} /></button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto pb-8">
      <div className="flex items-center mb-6">
        <button onClick={() => { setIsFormOpen(false); setEditingFeatureId(null); setFormData(initialFormState); setImagePreview(null); }} className="p-2 mr-3 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h3 className="text-xl font-bold text-gray-900">{editingFeatureId ? 'Edit Feature' : 'Add New Feature'}</h3>
          <p className="text-gray-500 text-sm mt-1">Provide a service or recommendation for your guests.</p>
        </div>
      </div>

      <form onSubmit={submitFeature} className="space-y-6">
        
        {/* Basic Information */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-6 border-b border-gray-100 pb-4">General Details</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <PillSelector label="Categories *" options={CATEGORY_OPTIONS} arrayName="categories" colorClass="blue" />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-bold text-gray-700 mb-1">Business Name *</label>
              <input type="text" required name="businessName" value={formData.businessName} onChange={handleChange} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-bold text-gray-700 mb-1">Description</label>
              <textarea name="description" value={formData.description} onChange={handleChange} rows={3} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none" placeholder="What makes this partner/service special?"></textarea>
            </div>

            {/* Photo Upload */}
            <div className="md:col-span-2">
              <label className="block text-sm font-bold text-gray-700 mb-1">Photo (Max 5MB)</label>
              {imagePreview ? (
                <div className="relative inline-block mt-2">
                  <img src={imagePreview} alt="Preview" className="h-48 w-auto rounded-xl object-cover border border-gray-200 shadow-sm" />
                  <button type="button" onClick={() => { setImageFile(null); setImagePreview(null); setFormData(prev => ({...prev, photoUrl: ''})); }} className="absolute -top-3 -right-3 bg-red-100 text-red-600 p-2 rounded-full hover:bg-red-200 shadow-sm">
                    <Trash2 size={16} />
                  </button>
                </div>
              ) : (
                <div className="mt-2 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-xl hover:bg-gray-50 transition-colors">
                  <div className="space-y-1 text-center">
                    <ImageIcon className="mx-auto h-12 w-12 text-gray-400" />
                    <div className="flex text-sm text-gray-600 justify-center mt-2">
                      <label className="relative cursor-pointer bg-transparent rounded-md font-bold text-blue-600 hover:text-blue-500 focus-within:outline-none">
                        <span>Upload from device</span>
                        <input type="file" className="sr-only" accept="image/*" onChange={handleImageSelect} />
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Contact Information */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-6 border-b border-gray-100 pb-4">Contact Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">Phone</label>
              <input type="tel" name="phone" value={formData.phone} onChange={handleChange} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">WhatsApp</label>
              <input type="tel" name="whatsapp" value={formData.whatsapp} onChange={handleChange} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">Email</label>
              <input type="email" name="email" value={formData.email} onChange={handleChange} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">Website</label>
              <input type="url" name="website" value={formData.website} onChange={handleChange} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
          </div>
        </div>

        {/* Visibility Toggles */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-6 border-b border-gray-100 pb-4">Display & Targeting</h3>
          <div className="grid grid-cols-1 gap-4">
            <CustomToggle 
              label="Show on Main Page" 
              description="Highlight this feature prominently on the guest portal." 
              name="showOnMain" 
              checked={formData.showOnMain} 
            />
            <CustomToggle 
              label="Live Like a Local" 
              description="Tag this as a highly curated local experience to unlock advanced targeting options." 
              name="liveLikeLocal" 
              checked={formData.liveLikeLocal} 
            />
          </div>
        </div>

        {/* CONDITIONAL: Live Like a Local Targeting */}
        {formData.liveLikeLocal && (
          <div className="bg-purple-50 border border-purple-200 rounded-xl shadow-sm p-6 animate-in slide-in-from-top-4 fade-in duration-300">
            <h3 className="text-lg font-bold text-purple-900 mb-2 flex items-center border-b border-purple-200/50 pb-4">
              <Star size={20} className="mr-2 fill-current" /> Experience Targeting
            </h3>
            <p className="text-sm text-purple-700 mb-6">Select the ideal audience and vibe for this experience. Multiple selections allowed.</p>
            
            <PillSelector label="Who's traveling?" options={TRAVELER_OPTIONS} arrayName="travelers" colorClass="purple" />
            <PillSelector label="Experience Type" options={EXPERIENCE_OPTIONS} arrayName="experienceTypes" colorClass="purple" />
            <PillSelector label="Pace" options={PACE_OPTIONS} arrayName="paces" colorClass="purple" />
          </div>
        )}

        {/* Submit */}
        <div className="flex justify-end pt-4">
          <button type="button" onClick={() => { setIsFormOpen(false); setEditingFeatureId(null); setFormData(initialFormState); setImagePreview(null); }} className="px-6 py-3 mr-4 text-sm font-bold text-gray-700 hover:bg-gray-200 rounded-xl transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={isSubmitting || isUploadingImage} className="flex items-center px-8 py-3 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl disabled:opacity-50 transition-colors shadow-md hover:shadow-lg">
            {(isSubmitting || isUploadingImage) && <Loader2 size={18} className="mr-2 animate-spin" />}
            {isUploadingImage ? 'Uploading Photo...' : isSubmitting ? 'Saving...' : 'Save Feature'}
          </button>
        </div>

      </form>
    </div>
  );
}