import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Link2, MapPin, Wand2, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function AddProperty() {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // NEW: Track if the user has manually touched the slug field
  const [isSlugManuallyEdited, setIsSlugManuallyEdited] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    listingUrl: '',
    googleMapsUrl: '',
    propertyName: '',
    propertyTypeName: '',
    urlSlug: '',
    wifiName: '',
    wifiPassword: '',
    latitude: '',
    longitude: '',
    hostPhoneCode: '+30',
    hostPhone: '',
    ownerFullName: '',
    ownerEmail: '',
    internalRefCode: ''
  });

  // Auto-generate Ref Code on load
  useEffect(() => {
    const randomCode = `VLO-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    setFormData(prev => ({ ...prev, internalRefCode: randomCode }));
  }, []);

  // Helper to safely format strings into slugs (removes spaces, special chars)
  const formatSlugPart = (text: string) => {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
  };

  // NEW: Real-time Slug Auto-generator
  useEffect(() => {
    // Only auto-generate if the user hasn't typed in the slug field themselves
    if (!isSlugManuallyEdited) {
      const nameSlug = formatSlugPart(formData.propertyName);
      const typeSlug = formatSlugPart(formData.propertyTypeName);
      
      let combinedSlug = '';
      if (nameSlug && typeSlug) {
        combinedSlug = `${nameSlug}/${typeSlug}`;
      } else if (nameSlug) {
        combinedSlug = nameSlug;
      } else if (typeSlug) {
        combinedSlug = typeSlug;
      }

      setFormData(prev => ({ ...prev, urlSlug: combinedSlug }));
    }
  }, [formData.propertyName, formData.propertyTypeName, isSlugManuallyEdited]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    // If the user types directly into the slug field, mark it as manually edited
    if (e.target.name === 'urlSlug') {
      setIsSlugManuallyEdited(true);
    }
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleAutoFillListing = () => {
    alert("Backend connection required: Send URL to cloud function to scrape Airbnb/Booking data.");
  };

  const handleAutoFillMaps = () => {
    const regex = /@(-?\d+\.\d+),(-?\d+\.\d+)/;
    const match = formData.googleMapsUrl.match(regex);
    if (match) {
      setFormData(prev => ({ ...prev, latitude: match[1], longitude: match[2] }));
    } else {
      alert("Could not extract coordinates directly from this URL format.");
    }
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
        
        {/* Auto-fill Section */}
        <div className="p-8 border-b border-gray-100 bg-gray-50 space-y-6">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Listing URL (Airbnb or Booking)</label>
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Link2 className="absolute left-3 top-2.5 text-gray-400" size={18} />
                <input type="url" name="listingUrl" value={formData.listingUrl} onChange={handleChange} className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" placeholder="https://www.airbnb.com/rooms/..." />
              </div>
              <button type="button" onClick={handleAutoFillListing} className="flex items-center px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium transition-colors">
                <Wand2 size={16} className="mr-2 text-blue-600" /> Auto-fill details
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Google Maps Location Link</label>
            <div className="flex gap-3">
              <div className="relative flex-1">
                <MapPin className="absolute left-3 top-2.5 text-gray-400" size={18} />
                <input type="url" name="googleMapsUrl" value={formData.googleMapsUrl} onChange={handleChange} className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" placeholder="https://goo.gl/maps/..." />
              </div>
              <button type="button" onClick={handleAutoFillMaps} className="flex items-center px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium transition-colors">
                <Wand2 size={16} className="mr-2 text-blue-600" /> Auto-fill exact coordinates
              </button>
            </div>
          </div>
        </div>

        {/* Manual Data Section */}
        <div className="p-8 space-y-8">
          
          {/* General Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Property Name *</label>
              <input type="text" required name="propertyName" value={formData.propertyName} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Property Type Name *</label>
              <input type="text" required name="propertyTypeName" value={formData.propertyTypeName} onChange={handleChange} placeholder="e.g. Luxury Villa, Studio" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">URL Slug *</label>
              <input type="text" name="urlSlug" value={formData.urlSlug} onChange={handleChange} placeholder="e.g. property_name/property_type" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50" />
            </div>
          </div>

          <hr className="border-gray-100" />

          {/* Location & Utilities */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Latitude</label>
              <input type="text" name="latitude" value={formData.latitude} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Longitude</label>
              <input type="text" name="longitude" value={formData.longitude} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">WiFi Name</label>
              <input type="text" name="wifiName" value={formData.wifiName} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">WiFi Password</label>
              <input type="text" name="wifiPassword" value={formData.wifiPassword} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
          </div>

          <hr className="border-gray-100" />

          {/* Owner Info */}
          <div>
            <h3 className="text-lg font-bold text-gray-900 mb-4">Owner Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Owner Full Name *</label>
                <input type="text" required name="ownerFullName" value={formData.ownerFullName} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Owner Email *</label>
                <input type="email" required name="ownerEmail" value={formData.ownerEmail} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Host Phone</label>
                <div className="flex border border-gray-300 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500">
                  <select 
                    name="hostPhoneCode"
                    value={formData.hostPhoneCode}
                    onChange={handleChange}
                    className="bg-gray-50 text-gray-700 py-2 pl-3 pr-8 border-r border-gray-300 outline-none text-sm cursor-pointer appearance-none"
                  >
                    <option value="+30">🇬🇷 +30</option>
                    <option value="+44">🇬🇧 +44</option>
                    <option value="+1">🇺🇸 +1</option>
                    <option value="+49">🇩🇪 +49</option>
                    <option value="+33">🇫🇷 +33</option>
                    <option value="+39">🇮🇹 +39</option>
                    <option value="+34">🇪🇸 +34</option>
                    <option value="+357">🇨🇾 +357</option>
                  </select>
                  <input 
                    type="tel" 
                    name="hostPhone" 
                    value={formData.hostPhone} 
                    onChange={handleChange} 
                    className="w-full px-3 py-2 outline-none" 
                    placeholder="6912345678"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Internal Reference Code *</label>
                <input type="text" required name="internalRefCode" value={formData.internalRefCode} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 bg-gray-50 text-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                <p className="text-xs text-gray-500 mt-1">Auto-generated quick access code</p>
              </div>
            </div>
          </div>

        </div>

        {/* Footer Actions */}
        <div className="p-6 bg-gray-50 border-t border-gray-200 flex items-center justify-end gap-4">
          <Link to="/properties" className="px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-200 rounded-lg transition-colors">
            Cancel
          </Link>
          <button type="submit" disabled={isSubmitting} className="px-5 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50">
            {isSubmitting ? 'Saving...' : 'Create Property'}
          </button>
        </div>
      </form>
    </div>
  );
}