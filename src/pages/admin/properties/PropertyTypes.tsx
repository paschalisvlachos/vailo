import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, where } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db } from '../../../lib/firebase';
import { ArrowLeft, Plus, Link2, MapPin, Wand2, Building, Pencil, Trash2, User, CalendarSync, ExternalLink, Image as ImageIcon, UploadCloud } from 'lucide-react';

export default function PropertyTypes() {
  const { property, propertyId } = useOutletContext<{ property: any, propertyId: string }>();
  
  const [propertyTypes, setPropertyTypes] = useState<any[]>([]);
  const [owners, setOwners] = useState<any[]>([]);
  
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTypeId, setEditingTypeId] = useState<string | null>(null);
  const [isSubmittingType, setIsSubmittingType] = useState(false);
  const [isSlugManuallyEdited, setIsSlugManuallyEdited] = useState(false);
  
  // Photo upload state
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  
  // UPDATED: Added city field and split from area
  const initialFormState = {
    listingUrl: '', googleMapsUrl: '', propertyTypeName: '', urlSlug: '', 
    latitude: '', longitude: '', wifiName: '', wifiPassword: '', internalRefCode: '',
    ownerId: '', iCalUrl: '', 
    photoUrl: '', addressLine: '', area: '', city: '', postCode: '', country: ''
  };
  const [typeFormData, setTypeFormData] = useState(initialFormState);

  useEffect(() => {
    if (!propertyId) return;
    const unsubscribe = onSnapshot(collection(db, 'properties', propertyId, 'propertyTypes'), (snapshot) => {
      const typesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPropertyTypes(typesData);
    });
    return () => unsubscribe();
  }, [propertyId]);

  useEffect(() => {
    const q = query(collection(db, 'owners'), where('role', 'in', ['agent', 'owner']));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const ownersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setOwners(ownersData);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (isFormOpen && !editingTypeId && !typeFormData.internalRefCode) {
      setTypeFormData(prev => ({ ...prev, internalRefCode: `TYP-${Math.random().toString(36).substring(2, 8).toUpperCase()}` }));
    }
  }, [isFormOpen, editingTypeId]);

  useEffect(() => {
    if (!isSlugManuallyEdited && property?.urlSlug && !editingTypeId) {
      const formattedType = typeFormData.propertyTypeName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
      if (formattedType) {
        setTypeFormData(prev => ({ ...prev, urlSlug: `${property.urlSlug}/${formattedType}` }));
      }
    }
  }, [typeFormData.propertyTypeName, isSlugManuallyEdited, property, editingTypeId]);

  const handleTypeChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    if (e.target.name === 'urlSlug') setIsSlugManuallyEdited(true);
    setTypeFormData({ ...typeFormData, [e.target.name]: e.target.value });
  };

  const handleAutoFillMaps = () => {
    const regex = /@(-?\d+\.\d+),(-?\d+\.\d+)/;
    const match = typeFormData.googleMapsUrl.match(regex);
    if (match) {
      setTypeFormData(prev => ({ ...prev, latitude: match[1], longitude: match[2] }));
    } else {
      alert("Could not extract coordinates directly from this URL format. Make sure it contains the @lat,lng format.");
    }
  };

  // Handle photo selection
  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setPhotoFile(file);
      setPhotoPreview(URL.createObjectURL(file));
    }
  };

  // NEW: Handle photo removal
  const handleRemovePhoto = () => {
    setPhotoFile(null);
    setPhotoPreview(null);
    // Erase it from the form data so it deletes from Firebase when saved
    setTypeFormData(prev => ({ ...prev, photoUrl: '' }));
  };

  // --- CRUD OPERATIONS --- //
  const handleEditClick = (typeData: any) => {
    setTypeFormData({ ...initialFormState, ...typeData });
    setEditingTypeId(typeData.id);
    setPhotoFile(null);
    setPhotoPreview(typeData.photoUrl || null);
    setIsFormOpen(true);
  };

  const handleDeleteClick = async (typeId: string, typeName: string) => {
    if (window.confirm(`Are you sure you want to delete "${typeName}"? This cannot be undone.`)) {
      try {
        await deleteDoc(doc(db, 'properties', propertyId, 'propertyTypes', typeId));
      } catch (error) {
        alert("Failed to delete property type.");
      }
    }
  };

  const submitPropertyType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!propertyId) return;
    setIsSubmittingType(true);
    
    try {
      let finalPhotoUrl = typeFormData.photoUrl;

      // Upload new photo if selected
      if (photoFile) {
        const storage = getStorage();
        const fileRef = ref(storage, `propertyTypes/${propertyId}/${Date.now()}_${photoFile.name}`);
        await uploadBytes(fileRef, photoFile);
        finalPhotoUrl = await getDownloadURL(fileRef);
      }

      const payload = { ...typeFormData, photoUrl: finalPhotoUrl };

      if (editingTypeId) {
        const typeRef = doc(db, 'properties', propertyId, 'propertyTypes', editingTypeId);
        await updateDoc(typeRef, { ...payload, updatedAt: new Date().toISOString() });
      } else {
        await addDoc(collection(db, 'properties', propertyId, 'propertyTypes'), {
          ...payload, createdAt: new Date().toISOString()
        });
      }
      
      cancelForm();
    } catch (error) {
      console.error(error);
      alert("Failed to save property type.");
    } finally {
      setIsSubmittingType(false);
    }
  };

  const cancelForm = () => {
    setIsFormOpen(false);
    setEditingTypeId(null);
    setTypeFormData(initialFormState);
    setPhotoFile(null);
    setPhotoPreview(null);
  };

  const handleICalSync = () => {
    if (!typeFormData.iCalUrl) {
      alert("Please enter a valid iCal URL first.");
      return;
    }
    alert("iCal Sync Initiated! (Backend cloud function required to parse .ics file and map bookings to the database).");
  };

  // --- RENDER LIST VIEW --- //
  if (!isFormOpen) {
    return (
      <div>
        <div className="flex justify-between items-center mb-6">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Configured Property Types</h3>
            <p className="text-sm text-gray-500">Manage individual units, rooms, or tiers within this property.</p>
          </div>
          <button onClick={() => setIsFormOpen(true)} className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm">
            <Plus size={18} className="mr-2" /> Add Property Type
          </button>
        </div>

        {propertyTypes.length === 0 ? (
          <div className="text-center py-16 bg-gray-50 rounded-xl border border-dashed border-gray-200">
            <Building size={32} className="mx-auto text-gray-400 mb-3" />
            <p className="text-gray-900 font-medium">No property types found</p>
            <p className="text-gray-500 text-sm mt-1">Add your first room, villa, or suite type to get started.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {propertyTypes.map(type => {
              const assignedOwner = owners.find(o => o.id === type.ownerId);
              
              return (
                <div key={type.id} className="border border-gray-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow group bg-white flex flex-col">
                  {type.photoUrl ? (
                    <div className="h-32 w-full bg-gray-100 relative">
                      <img src={type.photoUrl} alt={type.propertyTypeName} className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <div className="h-16 w-full bg-gray-50 flex items-center justify-center border-b border-gray-100">
                      <ImageIcon size={24} className="text-gray-300" />
                    </div>
                  )}

                  <div className="p-5 flex flex-col flex-1">
                    <div className="flex justify-between items-start mb-3">
                      <h4 className="font-bold text-gray-900">{type.propertyTypeName}</h4>
                      <span className="text-xs font-semibold bg-gray-100 text-gray-600 px-2 py-1 rounded-md">{type.internalRefCode}</span>
                    </div>
                    <p className="text-sm text-gray-500 mb-3 truncate">/{type.urlSlug}</p>
                    
                    {type.iCalUrl && (
                      <div className="mb-3 flex items-center text-xs font-medium text-green-700 bg-green-50 px-2 py-1 rounded w-max border border-green-100">
                        <CalendarSync size={12} className="mr-1.5" /> iCal Synced
                      </div>
                    )}
                    
                    <div className="flex-1">
                      {assignedOwner ? (
                        <p className="text-sm text-gray-700 flex items-center bg-gray-50 p-2 rounded-lg border border-gray-100 mb-4 w-max">
                          <User size={14} className="mr-2 text-gray-400" />
                          {assignedOwner.fullName}
                        </p>
                      ) : (
                        <p className="text-sm text-gray-400 italic mb-4">No owner assigned</p>
                      )}
                    </div>
                    
                    <div className="flex items-center justify-between pt-4 border-t border-gray-100 mt-auto">
                      <button onClick={() => handleEditClick(type)} className="flex items-center text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors">
                        <Pencil size={14} className="mr-1.5" /> Edit
                      </button>
                      <button 
                        onClick={() => {
                          const safeTypeSlug = type.typeSlug || type.propertyTypeName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
                          window.open(`/${property.urlSlug}/${safeTypeSlug}`, '_blank');
                        }}
                        className="p-2 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Preview Guest Portal"
                      >
                        <ExternalLink size={18} />
                      </button>
                      <button onClick={() => handleDeleteClick(type.id, type.propertyTypeName)} className="flex items-center text-sm font-medium text-gray-400 hover:text-red-600 transition-colors">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // --- RENDER FORM VIEW --- //
  return (
    <div className="max-w-4xl mx-auto pb-10">
      <div className="flex items-center mb-6">
        <button onClick={cancelForm} className="p-2 mr-3 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
          <ArrowLeft size={20} />
        </button>
        <h3 className="text-xl font-bold text-gray-900">
          {editingTypeId ? 'Edit Property Type' : 'Add New Property Type'}
        </h3>
      </div>
      <form onSubmit={submitPropertyType} className="border border-gray-200 rounded-xl shadow-sm overflow-hidden bg-white">
        
        {/* URL Scraping / Auto-fill Section */}
        <div className="p-6 border-b border-gray-100 bg-gray-50 space-y-6">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Listing URL (Airbnb or Booking)</label>
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Link2 className="absolute left-3 top-2.5 text-gray-400" size={18} />
                <input type="url" name="listingUrl" value={typeFormData.listingUrl} onChange={handleTypeChange} className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white" />
              </div>
              <button type="button" onClick={() => alert('OTA Scraper coming soon')} className="flex items-center px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium">
                <Wand2 size={16} className="mr-2 text-blue-600" /> Auto-fill
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Google Maps Location Link</label>
            <div className="flex gap-3">
              <div className="relative flex-1">
                <MapPin className="absolute left-3 top-2.5 text-gray-400" size={18} />
                <input type="url" name="googleMapsUrl" value={typeFormData.googleMapsUrl} onChange={handleTypeChange} className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white" />
              </div>
              <button type="button" onClick={handleAutoFillMaps} className="flex items-center px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium transition-colors">
                <Wand2 size={16} className="mr-2 text-blue-600" /> Auto-calc
              </button>
            </div>
          </div>
        </div>

        {/* Photo Upload Section */}
        <div className="p-6 border-b border-gray-100">
          <h4 className="text-sm font-bold text-gray-900 flex items-center mb-4">
            <ImageIcon size={18} className="mr-2 text-gray-500" /> Cover Photo
          </h4>
          <div className="flex items-center gap-6">
            <div className="flex-1">
              <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <UploadCloud className="w-8 h-8 mb-2 text-gray-400" />
                  <p className="text-sm text-gray-500 font-medium">Click to upload photo</p>
                </div>
                <input type="file" accept="image/*" onChange={handlePhotoSelect} className="hidden" />
              </label>
            </div>
            {/* UPDATED: Added Delete Button inside the preview */}
            {photoPreview && (
              <div className="h-32 w-48 shrink-0 rounded-lg overflow-hidden border border-gray-200 shadow-sm relative group">
                <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={handleRemovePhoto}
                  className="absolute top-2 right-2 p-1.5 bg-red-600/90 text-white rounded-md hover:bg-red-700 opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
                  title="Remove photo"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* iCal Sync Section */}
        <div className="p-6 border-b border-gray-100 bg-blue-50/30">
          <h4 className="text-sm font-bold text-gray-900 flex items-center mb-3">
            <CalendarSync size={18} className="mr-2 text-blue-600" /> Calendar Sync (iCal)
          </h4>
          <label className="block text-sm font-medium text-gray-700 mb-1">iCal Feed URL</label>
          <div className="flex gap-3">
            <input 
              type="url" 
              name="iCalUrl" 
              value={typeFormData.iCalUrl} 
              onChange={handleTypeChange} 
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white" 
              placeholder="https://www.airbnb.com/calendar/ical/..." 
            />
            <button 
              type="button" 
              onClick={handleICalSync} 
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium transition-colors shadow-sm"
            >
              Sync Now
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-2">Paste the iCal export link from Airbnb, Booking.com, or your Channel Manager to sync reservations automatically.</p>
        </div>

        {/* General Details & Coordinates */}
        <div className="p-6 border-b border-gray-100 space-y-6">
          <h4 className="text-sm font-bold text-gray-900 border-b border-gray-100 pb-2 mb-4">General Details</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Property Type Name *</label>
              <input type="text" required name="propertyTypeName" value={typeFormData.propertyTypeName} onChange={handleTypeChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">URL Slug *</label>
              <input type="text" required name="urlSlug" value={typeFormData.urlSlug} onChange={handleTypeChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50" />
            </div>
            
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Allocated Owner</label>
              <select 
                name="ownerId" 
                value={typeFormData.ownerId} 
                onChange={handleTypeChange} 
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
              >
                <option value="">Select an owner...</option>
                {owners.map(owner => (
                  <option key={owner.id} value={owner.id}>{owner.fullName} {owner.company ? `(${owner.company})` : ''}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Latitude</label>
              <input type="text" name="latitude" value={typeFormData.latitude} onChange={handleTypeChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Longitude</label>
              <input type="text" name="longitude" value={typeFormData.longitude} onChange={handleTypeChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">WiFi Name</label>
              <input type="text" name="wifiName" value={typeFormData.wifiName} onChange={handleTypeChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">WiFi Password</label>
              <input type="text" name="wifiPassword" value={typeFormData.wifiPassword} onChange={handleTypeChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Internal Reference Code *</label>
              <input type="text" required name="internalRefCode" value={typeFormData.internalRefCode} onChange={handleTypeChange} className="w-full px-3 py-2 border border-gray-300 bg-gray-50 text-gray-600 rounded-lg outline-none" />
            </div>
          </div>
        </div>

        {/* UPDATED: Address Details Section with required fields */}
        <div className="p-6 space-y-6">
          <h4 className="text-sm font-bold text-gray-900 border-b border-gray-100 pb-2 mb-4">Address Details</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Street Address *</label>
              <input type="text" required name="addressLine" value={typeFormData.addressLine} onChange={handleTypeChange} placeholder="e.g., 123 Main St, Apt 4B" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Area *</label>
              <input type="text" required name="area" value={typeFormData.area} onChange={handleTypeChange} placeholder="e.g., Akrotiri" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">City *</label>
              <input type="text" required name="city" value={typeFormData.city} onChange={handleTypeChange} placeholder="e.g., Chania" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Postal Code</label>
              <input type="text" name="postCode" value={typeFormData.postCode} onChange={handleTypeChange} placeholder="e.g., 73100" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Country *</label>
              <input type="text" required name="country" value={typeFormData.country} onChange={handleTypeChange} placeholder="e.g., Greece" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
          </div>
        </div>

        <div className="p-6 bg-gray-50 border-t border-gray-200 flex justify-end gap-4">
          <button type="button" onClick={cancelForm} className="px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-200 rounded-lg transition-colors">Cancel</button>
          <button type="submit" disabled={isSubmittingType} className="px-5 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 transition-colors shadow-sm">
            {isSubmittingType ? 'Saving...' : (editingTypeId ? 'Update Property Type' : 'Save Property Type')}
          </button>
        </div>
      </form>
    </div>
  );
}