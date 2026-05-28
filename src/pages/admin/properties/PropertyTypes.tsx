import { useState, useEffect, useRef, useMemo } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, where } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../../../lib/firebase';
import { resolveGooglePlaceIdFromDetails } from '../../../lib/geocoding';
import { formatGuestSlug, getTypePublicSlug, mergePreviousSlugs } from '../../../lib/guestPortalSlug';
import { buildAdminGuestPortalPreviewUrl } from '../../../lib/guestAccess';
import { useToast } from '../../../context/ToastContext';
import { ArrowLeft, Plus, Link2, MapPin, Wand2, Building, Pencil, Trash2, User, CalendarSync, ExternalLink, Image as ImageIcon, UploadCloud, Loader2, MessageCircle } from 'lucide-react';
import type { PropertyOutletContext } from './PropertyLayout';

export default function PropertyTypes() {
  const { property, propertyId, propertyAccess, lockedListingId } =
    useOutletContext<PropertyOutletContext>();
  const [searchParams, setSearchParams] = useSearchParams();
  const toast = useToast();

  const isListingOnly = propertyAccess.level === 'listing_only';
  const allowedTypeIds = isListingOnly ? propertyAccess.typeIds : null;
  const listingOnlyAutoOpened = useRef(false);
  
  const [propertyTypes, setPropertyTypes] = useState<any[]>([]);
  const [owners, setOwners] = useState<any[]>([]);
  
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTypeId, setEditingTypeId] = useState<string | null>(null);
  const [isSubmittingType, setIsSubmittingType] = useState(false);
  const [isMagicFilling, setIsMagicFilling] = useState(false);
  const [isSlugManuallyEdited, setIsSlugManuallyEdited] = useState(false);
  const [slugBeforeEdit, setSlugBeforeEdit] = useState('');
  const invalidCityWarnedRef = useRef(false);
  
  // Photo upload state
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  // Master Area Database States
  const [countries, setCountries] = useState<string[]>([]);
  const [dbAreas, setDbAreas] = useState<string[]>([]);
  
  const initialFormState = {
    listingUrl: '', googleMapsUrl: '', propertyTypeName: '', urlSlug: '', 
    latitude: '', longitude: '', wifiName: '', wifiPassword: '', whatsapp: '', internalRefCode: '',
    googleRating: '', googlePlaceId: '',
    ownerId: '', iCalUrl: '', 
    photoUrl: '', addressLine: '', area: '', city: '', postCode: '', country: ''
  };
  const [typeFormData, setTypeFormData] = useState(initialFormState);

  // 1. Fetch Global Countries
  useEffect(() => {
    fetch('https://restcountries.com/v3.1/all?fields=name')
      .then(res => res.json())
      .then(data => {
        const countryNames = data
          .map((c: any) => c.name.common)
          .sort((a: string, b: string) => a.localeCompare(b));
        setCountries(countryNames);
      })
      .catch(err => console.error("Failed to fetch countries:", err));
  }, []);

  // 2. Fetch Master Areas for selected Country
  useEffect(() => {
    if (!typeFormData.country) {
      setDbAreas([]);
      return;
    }
    const unsubscribe = onSnapshot(collection(db, 'countries', typeFormData.country, 'areas'), (snapshot) => {
      const areasData = snapshot.docs.map(doc => doc.data().name);
      areasData.sort((a, b) => a.localeCompare(b));
      setDbAreas(areasData);
    });
    return () => unsubscribe();
  }, [typeFormData.country]);

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

  const cityIsInvalid =
    !!typeFormData.city &&
    dbAreas.length > 0 &&
    !dbAreas.some((a) => a.toLowerCase() === typeFormData.city.toLowerCase());

  useEffect(() => {
    if (!isFormOpen) {
      invalidCityWarnedRef.current = false;
      return;
    }
    if (!typeFormData.city || dbAreas.length === 0 || !cityIsInvalid) return;
    if (!invalidCityWarnedRef.current) {
      toast.warning(
        `"${typeFormData.city}" is not a valid City/Master Area. Select the correct region (e.g. Chania) and save.`
      );
      invalidCityWarnedRef.current = true;
    }
    setTypeFormData((prev) => ({ ...prev, city: '' }));
  }, [isFormOpen, dbAreas, typeFormData.city, cityIsInvalid, toast]);

  const visiblePropertyTypes = useMemo(() => {
    if (!allowedTypeIds) return propertyTypes;
    return propertyTypes.filter((t) => allowedTypeIds.includes(t.id));
  }, [propertyTypes, allowedTypeIds]);

  const openTypeEditor = (typeData: (typeof propertyTypes)[0]) => {
    if (isListingOnly && !propertyAccess.typeIds.includes(typeData.id)) {
      toast.error('You can only edit your assigned listing.');
      return;
    }

    let cleanSlug = typeData.urlSlug || '';
    if (property?.urlSlug && cleanSlug.startsWith(`${property.urlSlug}/`)) {
      cleanSlug = cleanSlug.replace(`${property.urlSlug}/`, '');
    }

    setTypeFormData({ ...initialFormState, ...typeData, urlSlug: cleanSlug });
    setSlugBeforeEdit(formatGuestSlug(cleanSlug));
    setEditingTypeId(typeData.id);
    setIsSlugManuallyEdited(true);
    setPhotoFile(null);
    setPhotoPreview(typeData.photoUrl || null);
    setIsFormOpen(true);

    if (isListingOnly) {
      const next = new URLSearchParams(searchParams);
      next.set('listing', typeData.id);
      setSearchParams(next, { replace: true });
    }
  };

  useEffect(() => {
    if (!isListingOnly || !lockedListingId || listingOnlyAutoOpened.current) return;
    if (propertyAccess.level === 'listing_only' && propertyAccess.typeIds.length > 1) return;
    const type = propertyTypes.find((t) => t.id === lockedListingId);
    if (!type) return;
    listingOnlyAutoOpened.current = true;
    openTypeEditor(type);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open once when single assigned listing loads
  }, [isListingOnly, lockedListingId, propertyTypes, propertyAccess]);

  const handleTypeChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    if (e.target.name === 'urlSlug') setIsSlugManuallyEdited(true);
    
    setTypeFormData(prev => {
      const newData = { ...prev, [e.target.name]: e.target.value };
      
      // Force city reset if country changes
      if (e.target.name === 'country') {
        newData.city = ''; 
      }

      // Auto-generate ONLY the child slug when typing the property name
      if (e.target.name === 'propertyTypeName' && !isSlugManuallyEdited) {
        newData.urlSlug = e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
      }

      return newData;
    });
  };

  const handleSlugChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsSlugManuallyEdited(true);
    setTypeFormData({ ...typeFormData, urlSlug: e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, '') });
  };

  const handleAutoFillMaps = async () => {
    const url = typeFormData.googleMapsUrl.trim();
    if (!url) {
      toast.warning('Please paste a Google Maps link first.');
      return;
    }

    const areaHint =
      typeFormData.city ||
      typeFormData.area ||
      property?.area ||
      property?.city ||
      property?.country ||
      '';

    setIsMagicFilling(true);

    try {
      let searchQuery = url;
      let placeNameFallback = '';

      const nameMatch = url.match(/\/place\/([^/?@]+)/);
      if (nameMatch?.[1]) {
        placeNameFallback = decodeURIComponent(nameMatch[1].replace(/\+/g, ' '));
        searchQuery = areaHint ? `${placeNameFallback} ${areaHint}` : placeNameFallback;
      }

      const functions = getFunctions();
      const getGooglePlaceDetails = httpsCallable(functions, 'getGooglePlaceDetails');
      const result = await getGooglePlaceDetails({ searchQuery, area: areaHint });
      const googleData = result.data as {
        name?: string;
        rating?: number;
        googlePlaceId?: string;
        latitude?: number;
        longitude?: number;
        websiteUri?: string;
        photoUrl?: string;
        googleMapsUrl?: string;
        addressLine?: string;
        area?: string;
        city?: string;
        postCode?: string;
        country?: string;
      };

      const listingName = googleData.name || placeNameFallback;
      const slugFromName = listingName
        ? listingName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '')
        : '';
      const googleNeighborhood = googleData.area?.trim() || '';
      const googleCity = googleData.city?.trim() || '';
      const matchedMasterArea = dbAreas.find((a) => a.toLowerCase() === googleCity.toLowerCase());

      setTypeFormData((prev) => ({
        ...prev,
        propertyTypeName: listingName || prev.propertyTypeName,
        urlSlug: !isSlugManuallyEdited && slugFromName ? slugFromName : prev.urlSlug,
        latitude: googleData.latitude?.toString() || prev.latitude,
        longitude: googleData.longitude?.toString() || prev.longitude,
        googleMapsUrl: googleData.googleMapsUrl || url,
        googleRating: googleData.rating != null ? String(googleData.rating) : prev.googleRating,
        googlePlaceId:
          resolveGooglePlaceIdFromDetails(
            { googlePlaceId: googleData.googlePlaceId, googleMapsUrl: googleData.googleMapsUrl },
            url
          ) || prev.googlePlaceId,
        listingUrl: googleData.websiteUri || prev.listingUrl,
        addressLine: googleData.addressLine || prev.addressLine,
        area: googleNeighborhood || prev.area,
        city: matchedMasterArea || prev.city,
        postCode: googleData.postCode || prev.postCode,
        country: googleData.country || prev.country,
        photoUrl: googleData.photoUrl || prev.photoUrl,
      }));

      if (googleData.photoUrl) {
        setPhotoFile(null);
        setPhotoPreview(googleData.photoUrl);
      }

      const resolvedPlaceId = resolveGooglePlaceIdFromDetails(
        { googlePlaceId: googleData.googlePlaceId, googleMapsUrl: googleData.googleMapsUrl },
        url
      );
      if (resolvedPlaceId) {
        toast.success('Google Place ID captured for guest reviews.');
      } else {
        toast.warning(
          'Coordinates and details were filled, but no Google Place ID was found. Use a full google.com/maps/place/… link if you need guest review links.'
        );
      }
    } catch (error) {
      console.error('Maps auto-fill error:', error);

      const coordMatch =
        url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) ||
        url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
      if (coordMatch) {
        setTypeFormData((prev) => ({
          ...prev,
          latitude: coordMatch[1],
          longitude: coordMatch[2],
        }));
        toast.info('Could not load full place details, but coordinates were extracted from the URL.');
      } else {
        toast.error('Could not process this link. Paste a full Google Maps place URL or a maps.app.goo.gl short link.');
      }
    } finally {
      setIsMagicFilling(false);
    }
  };

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setPhotoFile(file);
      setPhotoPreview(URL.createObjectURL(file));
    }
  };

  const handleRemovePhoto = () => {
    setPhotoFile(null);
    setPhotoPreview(null);
    setTypeFormData(prev => ({ ...prev, photoUrl: '' }));
  };

  // --- CRUD OPERATIONS --- //
  const handleEditClick = (typeData: (typeof propertyTypes)[0]) => {
    openTypeEditor(typeData);
  };

  const handleDeleteClick = async (typeId: string, typeName: string) => {
    if (isListingOnly) {
      toast.error('You cannot delete property listings.');
      return;
    }
    if (window.confirm(`Are you sure you want to delete "${typeName}"? This cannot be undone.`)) {
      try {
        await deleteDoc(doc(db, 'properties', propertyId, 'propertyTypes', typeId));
      } catch (error) {
        toast.error("Failed to delete property listing.");
      }
    }
  };

  const submitPropertyType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!propertyId) return;
    if (isListingOnly && editingTypeId && !propertyAccess.typeIds.includes(editingTypeId)) {
      toast.error('You can only edit your assigned listing.');
      return;
    }
    if (isListingOnly && !editingTypeId) {
      toast.error('You cannot create new property listings.');
      return;
    }

    if (
      !typeFormData.city ||
      !dbAreas.some((a) => a.toLowerCase() === typeFormData.city.toLowerCase())
    ) {
      toast.warning('Please select a valid City/Master Area (e.g. Chania) from the dropdown.');
      return;
    }

    setIsSubmittingType(true);
    
    try {
      let finalPhotoUrl = typeFormData.photoUrl;

      if (photoFile) {
        const storage = getStorage();
        const fileRef = ref(storage, `propertyTypes/${propertyId}/${Date.now()}_${photoFile.name}`);
        await uploadBytes(fileRef, photoFile);
        finalPhotoUrl = await getDownloadURL(fileRef);
      }

      const newSlug = formatGuestSlug(typeFormData.urlSlug);
      const existingType = editingTypeId
        ? propertyTypes.find((t) => t.id === editingTypeId)
        : null;
      const payload = {
        ...typeFormData,
        urlSlug: newSlug,
        typeSlug: newSlug,
        photoUrl: finalPhotoUrl,
        previousUrlSlugs: mergePreviousSlugs(
          existingType?.previousUrlSlugs,
          editingTypeId ? slugBeforeEdit : undefined,
          newSlug
        ),
      };

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
      toast.error("Failed to save property listing.");
    } finally {
      setIsSubmittingType(false);
    }
  };

  const cancelForm = () => {
    setIsFormOpen(false);
    setEditingTypeId(null);
    setSlugBeforeEdit('');
    setTypeFormData(initialFormState);
    setPhotoFile(null);
    setPhotoPreview(null);
    setIsSlugManuallyEdited(false);
  };

  const handleICalSync = () => {
    if (!typeFormData.iCalUrl) {
      toast.warning("Please enter a valid iCal URL first.");
      return;
    }
    toast.info("iCal Sync Initiated! (Backend cloud function required to parse .ics file and map bookings to the database).");
  };

  // --- RENDER LIST VIEW --- //
  if (!isFormOpen) {
    return (
      <div>
        <div className="flex justify-between items-center mb-6">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Configured Property Listings</h3>
            <p className="text-sm text-gray-500">Manage individual units, rooms, or tiers within this property.</p>
          </div>
          {!isListingOnly && (
            <button onClick={() => setIsFormOpen(true)} className="flex items-center px-4 py-2 bg-vailo-teal text-white rounded-xl hover:bg-vailo-teal-hover transition-colors shadow-sm">
              <Plus size={18} className="mr-2" /> Add Property Listing
            </button>
          )}
        </div>

        {visiblePropertyTypes.length === 0 ? (
          <div className="text-center py-16 bg-gray-50 rounded-xl border border-dashed border-gray-200">
            <Building size={32} className="mx-auto text-gray-400 mb-3" />
            <p className="text-gray-900 font-medium">No property listings found</p>
            <p className="text-gray-500 text-sm mt-1">Add your first room, villa, or suite listing to get started.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {visiblePropertyTypes.map(type => {
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
                      <button onClick={() => handleEditClick(type)} className="flex items-center text-sm font-medium text-vailo-teal hover:text-vailo-dark transition-colors">
                        <Pencil size={14} className="mr-1.5" /> Edit
                      </button>
                      <button 
                        onClick={() => {
                          const propSlug = formatGuestSlug(property.urlSlug);
                          const unitSlug = getTypePublicSlug(type);
                          if (!propSlug || !unitSlug) return;
                          const url = buildAdminGuestPortalPreviewUrl(
                            window.location.origin,
                            propSlug,
                            unitSlug,
                            type.id
                          );
                          window.open(url, '_blank');
                        }}
                        className="p-2 text-vailo-teal hover:text-vailo-dark hover:bg-vailo-teal/5 rounded-lg transition-colors"
                        title="Preview Guest Portal"
                      >
                        <ExternalLink size={18} />
                      </button>
                      {!isListingOnly && (
                        <button onClick={() => handleDeleteClick(type.id, type.propertyTypeName)} className="flex items-center text-sm font-medium text-gray-400 hover:text-red-600 transition-colors">
                          <Trash2 size={16} />
                        </button>
                      )}
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
    <div className="admin-page">
      <div className="flex items-center mb-6">
        <button onClick={cancelForm} className="p-2 mr-3 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
          <ArrowLeft size={20} />
        </button>
        <h3 className="text-xl font-bold text-gray-900">
          {editingTypeId ? 'Edit Property Listing' : 'Add New Property Listing'}
        </h3>
      </div>
      <form onSubmit={submitPropertyType} className="border border-gray-200 rounded-xl shadow-sm overflow-hidden bg-white">
        
        {/* URL Scraping / Auto-fill Section */}
        <div className="p-6 border-b border-gray-100 bg-gray-50 space-y-6">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Website URL</label>
            <div className="relative">
              <Link2 className="absolute left-3 top-2.5 text-gray-400" size={18} />
              <input type="url" name="listingUrl" value={typeFormData.listingUrl} onChange={handleTypeChange} className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg admin-input outline-none bg-white" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Google Maps Location Link</label>
            <div className="flex gap-3">
              <div className="relative flex-1">
                <MapPin className="absolute left-3 top-2.5 text-gray-400" size={18} />
                <input
                  type="url"
                  name="googleMapsUrl"
                  value={typeFormData.googleMapsUrl}
                  onChange={handleTypeChange}
                  placeholder="Full google.com/maps/place/… or maps.app.goo.gl/…"
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg admin-input outline-none bg-white"
                />
              </div>
              <button
                type="button"
                onClick={handleAutoFillMaps}
                disabled={isMagicFilling || !typeFormData.googleMapsUrl}
                className="flex items-center px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                {isMagicFilling ? (
                  <Loader2 size={16} className="mr-2 animate-spin text-vailo-teal" />
                ) : (
                  <Wand2 size={16} className="mr-2 text-vailo-teal" />
                )}
                {isMagicFilling ? 'Filling…' : 'Auto-fill'}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Fills listing name, coordinates, address, website, and cover photo when available.
            </p>
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
        <div className="p-6 border-b border-gray-100 bg-vailo-teal/5/30">
          <h4 className="text-sm font-bold text-gray-900 flex items-center mb-3">
            <CalendarSync size={18} className="mr-2 text-vailo-teal" /> Calendar Sync (iCal)
          </h4>
          <label className="block text-sm font-medium text-gray-700 mb-1">iCal Feed URL</label>
          <div className="flex gap-3">
            <input 
              type="url" 
              name="iCalUrl" 
              value={typeFormData.iCalUrl} 
              onChange={handleTypeChange} 
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg admin-input outline-none bg-white" 
              placeholder="https://www.airbnb.com/calendar/ical/..." 
            />
            <button 
              type="button" 
              onClick={handleICalSync} 
              className="px-6 py-2 bg-vailo-teal text-white rounded-xl hover:bg-vailo-teal-hover text-sm font-medium transition-colors shadow-sm"
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Listing name *</label>
              <input type="text" required name="propertyTypeName" value={typeFormData.propertyTypeName} onChange={handleTypeChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg admin-input outline-none" />
            </div>
            
            {/* 🔥 FIXED SLUG INPUT 🔥 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">URL Slug *</label>
              <div className="flex">
                <span className="inline-flex items-center px-3 rounded-l-lg border border-r-0 border-gray-300 bg-gray-50 text-gray-500 text-sm whitespace-nowrap overflow-hidden">
                  vailo.com/{property?.urlSlug || 'property'}/
                </span>
                <input 
                  type="text" 
                  required 
                  name="urlSlug" 
                  value={typeFormData.urlSlug} 
                  onChange={handleSlugChange} 
                  placeholder="e.g., grand-villa" 
                  className="flex-1 min-w-0 block w-full px-3 py-2 rounded-none rounded-r-lg border border-gray-300 admin-input outline-none" 
                />
              </div>
            </div>
            
            {!isListingOnly && (
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Allocated Owner</label>
                <select 
                  name="ownerId" 
                  value={typeFormData.ownerId} 
                  onChange={handleTypeChange} 
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg admin-input outline-none bg-white"
                >
                  <option value="">Select an owner...</option>
                  {owners.map(owner => (
                    <option key={owner.id} value={owner.id}>{owner.fullName} {owner.company ? `(${owner.company})` : ''}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Latitude</label>
              <input type="text" name="latitude" value={typeFormData.latitude} onChange={handleTypeChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg admin-input outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Longitude</label>
              <input type="text" name="longitude" value={typeFormData.longitude} onChange={handleTypeChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg admin-input outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Google rating (1–5)</label>
              <input
                type="number"
                min="0"
                max="5"
                step="0.1"
                name="googleRating"
                value={typeFormData.googleRating}
                onChange={handleTypeChange}
                placeholder="Filled from Maps auto-fill"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg admin-input outline-none"
              />
              <p className="text-xs text-gray-500 mt-1">Shown on the guest portal; guests can tap to leave a Google review.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Google Place ID</label>
              <input
                type="text"
                name="googlePlaceId"
                value={typeFormData.googlePlaceId}
                onChange={handleTypeChange}
                placeholder="Auto-filled from Maps"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg admin-input outline-none font-mono text-xs"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">WiFi Name</label>
              <input type="text" name="wifiName" value={typeFormData.wifiName} onChange={handleTypeChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg admin-input outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">WiFi Password</label>
              <input type="text" name="wifiPassword" value={typeFormData.wifiPassword} onChange={handleTypeChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg admin-input outline-none" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp</label>
              <div className="relative">
                <MessageCircle className="absolute left-3 top-2.5 text-gray-400" size={18} />
                <input
                  type="tel"
                  name="whatsapp"
                  value={typeFormData.whatsapp}
                  onChange={handleTypeChange}
                  placeholder="+30 69… (shown to guests as a contact button)"
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg admin-input outline-none"
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                When filled in, guests see a WhatsApp button on the portal to message you directly.
              </p>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Internal Reference Code *</label>
              <input type="text" required name="internalRefCode" value={typeFormData.internalRefCode} onChange={handleTypeChange} className="w-full px-3 py-2 border border-gray-300 bg-gray-50 text-gray-600 rounded-lg outline-none" />
            </div>
          </div>
        </div>

        {/* Address Details Section with Master Area Selectors */}
        <div className="p-6 space-y-6">
          <h4 className="text-sm font-bold text-gray-900 border-b border-gray-100 pb-2 mb-4">Address Details</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Street Address *</label>
              <input type="text" required name="addressLine" value={typeFormData.addressLine} onChange={handleTypeChange} placeholder="e.g., 123 Main St, Apt 4B" className="w-full px-3 py-2 border border-gray-300 rounded-lg admin-input outline-none" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Country *</label>
              <select required name="country" value={typeFormData.country} onChange={handleTypeChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg admin-input outline-none bg-white">
                <option value="" disabled>Select Country</option>
                {countries.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">City / Master Area *</label>
              <select required name="city" value={typeFormData.city} onChange={handleTypeChange} disabled={!typeFormData.country} className="w-full px-3 py-2 border border-gray-300 rounded-lg admin-input outline-none bg-white disabled:opacity-50">
                <option value="" disabled>{dbAreas.length === 0 ? 'No areas setup for this country' : 'Select City/Area'}</option>
                {dbAreas.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
              {cityIsInvalid && (
                <p className="text-xs text-red-500 mt-1">
                  Invalid master area stored. Re-select from the list (e.g. Chania) and save.
                </p>
              )}
              {typeFormData.country && dbAreas.length === 0 && (
                <p className="text-xs text-red-500 mt-1">Please add areas in Area Functionality first.</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Neighborhood / Area *</label>
              <input type="text" required name="area" value={typeFormData.area} onChange={handleTypeChange} placeholder="e.g., Akrotiri" className="w-full px-3 py-2 border border-gray-300 rounded-lg admin-input outline-none" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Postal Code</label>
              <input type="text" name="postCode" value={typeFormData.postCode} onChange={handleTypeChange} placeholder="e.g., 73100" className="w-full px-3 py-2 border border-gray-300 rounded-lg admin-input outline-none" />
            </div>
          </div>
        </div>

        <div className="p-6 bg-gray-50 border-t border-gray-200 flex justify-end gap-4">
          <button type="button" onClick={cancelForm} className="px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-200 rounded-lg transition-colors">Cancel</button>
          <button type="submit" disabled={isSubmittingType} className="px-5 py-2.5 text-sm font-medium text-white bg-vailo-teal hover:bg-vailo-teal-hover rounded-lg disabled:opacity-50 transition-colors shadow-sm">
            {isSubmittingType ? 'Saving...' : (editingTypeId ? 'Update Property Listing' : 'Save Property Listing')}
          </button>
        </div>
      </form>
    </div>
  );
}