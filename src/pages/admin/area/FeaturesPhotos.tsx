import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAreaRouteParams } from '../../../hooks/useAreaRouteParams';
import { collection, doc, onSnapshot, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../../lib/firebase';
import { useToast } from '../../../context/ToastContext';
import { adminPath } from '../../../lib/adminRoutes';
import { Image as ImageIcon, Upload, X, Loader2, Tag } from 'lucide-react';
import AreaHubBackLink from '../../../components/admin/AreaHubBackLink';

export default function FeaturesPhotos() {
  const navigate = useNavigate();
  const toast = useToast();
  const { country: decodedCountry, areaId, areaName: decodedArea } = useAreaRouteParams();

  // Notice we added an optional photos string array to our category type
  const [categories, setCategories] = useState<{id: string, name: string, photos?: string[]}[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Track which specific category is currently uploading an image
  const [uploadingCatId, setUploadingCatId] = useState<string | null>(null);

  // Fetch Features Categories from Firestore
  useEffect(() => {
    if (!decodedCountry || !areaId) return;

    const colRef = collection(db, 'countries', decodedCountry, 'areas', areaId, 'featuresCategories');
    const unsubscribe = onSnapshot(colRef, (snapshot) => {
      const fetchedCats = snapshot.docs.map(doc => ({ 
        id: doc.id, 
        name: doc.data().name,
        photos: doc.data().photos || [] // Default to empty array if no photos exist yet
      }));
      fetchedCats.sort((a, b) => a.name.localeCompare(b.name));
      setCategories(fetchedCats);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [decodedCountry, areaId]);

  // Handle uploading a new photo
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>, categoryId: string) => {
    const file = e.target.files?.[0];
    if (!file || !decodedCountry || !areaId) return;

    setUploadingCatId(categoryId);
    try {
      // 1. Upload to Firebase Storage in a structured global folder
      const storageRef = ref(storage, `areas/${decodedCountry}/${areaId}/features/${categoryId}/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      
      // 2. Get the public URL
      const photoUrl = await getDownloadURL(storageRef);

      // 3. Save the URL to the Firestore document using arrayUnion
      const catRef = doc(db, 'countries', decodedCountry, 'areas', areaId, 'featuresCategories', categoryId);
      await updateDoc(catRef, {
        photos: arrayUnion(photoUrl)
      });
      
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Failed to upload photo.");
    } finally {
      setUploadingCatId(null);
      // Reset the file input so the same file can be uploaded again if needed
      e.target.value = '';
    }
  };

  // Handle removing a photo
  const handleRemovePhoto = async (categoryId: string, photoUrl: string) => {
    if (!window.confirm("Remove this photo?")) return;
    
    try {
      const catRef = doc(db, 'countries', decodedCountry, 'areas', areaId, 'featuresCategories', categoryId);
      await updateDoc(catRef, {
        photos: arrayRemove(photoUrl)
      });
    } catch (error) {
      console.error("Error removing photo:", error);
      toast.error("Failed to remove photo.");
    }
  };

  return (
    <div className="admin-page">
      
      <AreaHubBackLink />

      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 flex items-center">
          <ImageIcon className="mr-3 text-pink-600 shrink-0" size={28} />
          Features Photos
        </h2>
        <p className="text-sm text-gray-500 mt-2">
          Manage global stock photos for features in <span className="font-bold text-pink-700">{decodedArea}, {decodedCountry}</span>
        </p>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <Loader2 size={40} className="animate-spin mb-4 text-pink-500" />
          <p>Loading categories...</p>
        </div>
      ) : categories.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-xl p-12 text-center">
          <Tag size={40} className="mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-bold text-gray-900 mb-2">No Features Categories Found</h3>
          <p className="text-gray-500 mb-6">You must create at least one Features Category before adding photos.</p>
          <button onClick={() => navigate(adminPath(`/area/${encodeURIComponent(decodedCountry)}/${encodeURIComponent(areaId)}/features-categories`))} className="px-6 py-3 bg-pink-600 text-white font-medium rounded-lg hover:bg-pink-700 transition-colors">
            Go to Features Categories
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {categories.map((cat) => (
            <div key={cat.id} className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              
              {/* Category Header */}
              <div className="px-6 py-4 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                <h3 className="text-base font-bold text-gray-900 flex items-center">
                  <Tag size={18} className="text-pink-500 mr-2" />
                  {cat.name}
                </h3>
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider bg-white px-3 py-1 rounded-full border border-gray-200 shadow-sm">
                  {cat.photos?.length || 0} Photos
                </span>
              </div>

              {/* Photos Gallery */}
              <div className="p-6">
                <div className="flex flex-wrap gap-4">
                  
                  {/* Upload Button Block */}
                  <label className={`relative flex flex-col items-center justify-center w-32 h-32 border-2 border-dashed rounded-xl cursor-pointer transition-all ${uploadingCatId === cat.id ? 'bg-gray-100 border-gray-300 pointer-events-none' : 'border-gray-300 bg-gray-50 hover:bg-pink-50 hover:border-pink-300'}`}>
                    {uploadingCatId === cat.id ? (
                      <div className="flex flex-col items-center text-gray-400">
                        <Loader2 size={24} className="animate-spin mb-2 text-pink-500" />
                        <span className="text-xs font-medium">Uploading...</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center text-gray-500">
                        <Upload size={24} className="mb-2 text-pink-500" />
                        <span className="text-xs font-medium">Add Photo</span>
                      </div>
                    )}
                    <input 
                      type="file" 
                      className="hidden" 
                      accept="image/*" 
                      onChange={(e) => handlePhotoUpload(e, cat.id)} 
                      disabled={uploadingCatId === cat.id}
                    />
                  </label>

                  {/* Render Existing Photos */}
                  {cat.photos && cat.photos.map((photoUrl, index) => (
                    <div key={index} className="relative group w-32 h-32">
                      <img 
                        src={photoUrl} 
                        alt={`${cat.name} ${index + 1}`} 
                        className="w-full h-full object-cover rounded-xl border border-gray-200 shadow-sm"
                      />
                      {/* Delete Overlay (Appears on Hover) */}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl flex items-center justify-center">
                        <button 
                          onClick={() => handleRemovePhoto(cat.id, photoUrl)}
                          className="p-2 bg-white text-red-600 rounded-full hover:bg-red-50 shadow-lg transform hover:scale-105 transition-all"
                          title="Remove Photo"
                        >
                          <X size={16} className="font-bold" />
                        </button>
                      </div>
                    </div>
                  ))}
                  
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}