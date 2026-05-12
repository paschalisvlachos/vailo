import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { collection, addDoc, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Link2, MapPin, Wand2, ArrowLeft } from 'lucide-react';

// NEW: We define the blueprint so TypeScript knows what fields exist
interface Owner {
  id: string;
  fullName: string;
  role: string;
  company?: string;
}

export default function AddProperty() {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSlugManuallyEdited, setIsSlugManuallyEdited] = useState(false);
  
  // Apply our new Owner interface here
  const [ownersList, setOwnersList] = useState<Owner[]>([]);

  const [formData, setFormData] = useState({
    listingUrl: '',
    googleMapsUrl: '',
    propertyName: '',
    urlSlug: '',
    internalRefCode: '',
    ownerId: '' 
  });

  useEffect(() => {
    const q = query(collection(db, 'owners'), where('role', 'in', ['agent', 'owner']));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      // Cast the fetched data to our Owner interface
      const fetchedOwners = snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data() 
      })) as Owner[];
      
      fetchedOwners.sort((a, b) => {
        if (a.role === 'agent' && b.role !== 'agent') return -1;
        if (a.role !== 'agent' && b.role === 'agent') return 1;
        return a.fullName.localeCompare(b.fullName);
      });
      
      setOwnersList(fetchedOwners);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const randomCode = `VLO-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    setFormData(prev => ({ ...prev, internalRefCode: randomCode }));
  }, []);

  const formatSlugPart = (text: string) => {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
  };

  useEffect(() => {
    if (!isSlugManuallyEdited) {
      const nameSlug = formatSlugPart(formData.propertyName);
      setFormData(prev => ({ ...prev, urlSlug: nameSlug }));
    }
  }, [formData.propertyName, isSlugManuallyEdited]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    if (e.target.name === 'urlSlug') setIsSlugManuallyEdited(true);
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await addDoc(collection(db, "properties"), {
        ...formData,
        createdAt: new Date().toISOString()
      });
      navigate('/properties'); 
    } catch (error) {
      console.error("Error adding property: ", error);
      alert("Failed to save property.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto pb-12">
      <div className="flex items-center mb-6">
        <Link to="/properties" className="p-2 mr-3 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Add New Property</h2>
          <p className="text-gray-500 mt-1">Create a new property for your concierge app</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        
        <div className="p-8 border-b border-gray-100 bg-gray-50 space-y-6">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Listing URL (Airbnb or Booking)</label>
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Link2 className="absolute left-3 top-2.5 text-gray-400" size={18} />
                <input type="url" name="listingUrl" value={formData.listingUrl} onChange={handleChange} className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <button type="button" onClick={() => alert("Backend connection required.")} className="flex items-center px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium">
                <Wand2 size={16} className="mr-2 text-blue-600" /> Auto-fill details
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Google Maps Location Link</label>
            <div className="relative">
              <MapPin className="absolute left-3 top-2.5 text-gray-400" size={18} />
              <input type="url" name="googleMapsUrl" value={formData.googleMapsUrl} onChange={handleChange} className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="General property location map link..." />
            </div>
          </div>
        </div>

        <div className="p-8 space-y-8">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Property Name *</label>
              <input type="text" required name="propertyName" value={formData.propertyName} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">URL Slug *</label>
              <input type="text" name="urlSlug" value={formData.urlSlug} onChange={handleChange} placeholder="e.g. villa-paschalis" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50" />
            </div>
          </div>

          <hr className="border-gray-100" />

          {/* Relational Owner Allocation */}
          <div>
            <h3 className="text-lg font-bold text-gray-900 mb-4">Property Allocation</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Assigned Agent / Owner *</label>
                <select 
                  required
                  name="ownerId" 
                  value={formData.ownerId} 
                  onChange={handleChange} 
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                >
                  <option value="">Select a user...</option>
                  {ownersList.map(user => (
                    <option key={user.id} value={user.id}>
                      {user.role === 'agent' ? '🏢 [Agent]' : '👤 [Owner]'} - {user.fullName} {user.company ? `(${user.company})` : ''}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">Assign the main responsible user for this property.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Internal Reference Code *</label>
                <input type="text" required name="internalRefCode" value={formData.internalRefCode} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 bg-gray-50 text-gray-600 rounded-lg outline-none" />
              </div>
            </div>
          </div>

        </div>

        <div className="p-6 bg-gray-50 border-t border-gray-200 flex justify-end gap-4">
          <Link to="/properties" className="px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-200 rounded-lg">Cancel</Link>
          <button type="submit" disabled={isSubmitting} className="px-5 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50">
            {isSubmitting ? 'Saving...' : 'Create Property'}
          </button>
        </div>
      </form>
    </div>
  );
}