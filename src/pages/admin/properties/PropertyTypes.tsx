import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, where, setDoc } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../../../lib/firebase';
import { loadCountryNames } from '../../../lib/countryNames';
import { resolveGooglePlaceIdFromDetails } from '../../../lib/geocoding';
import {
  formatGuestSlug,
  getTypePublicSlug,
  mergePreviousSlugs,
  slugFromPropertyTypeName,
} from '../../../lib/guestPortalSlug';
import { buildAdminGuestPortalPreviewUrl } from '../../../lib/guestAccess';
import {
  buildGuestPortalPublicListingUrl,
  downloadGuestPortalQrCode,
  guestPortalQrFilename,
} from '../../../lib/guestPortalQrCode';
import { useToast } from '../../../context/ToastContext';
import { PLACES_USAGE_CALLER } from '../../../lib/placesApiUsageCallers';
import { ensurePersistablePhotoUrl } from '../../../lib/adminPhotoUrl';
import { adminPath } from '../../../lib/adminRoutes';
import { DEFAULT_PRIMARY_LOCALE } from '../../../lib/propertyContentLocales';
import {
  serializeGuideFormDataForSave,
  type HouseGuideFormData,
} from '../../../lib/houseGuideLocales';
import {
  ArrowLeft,
  Plus,
  Link2,
  MapPin,
  Wand2,
  Building,
  Pencil,
  Trash2,
  User,
  CalendarSync,
  ExternalLink,
  Image as ImageIcon,
  UploadCloud,
  Loader2,
  MessageCircle,
  QrCode,
  Smartphone,
  Copy,
  Check,
  ClipboardCopy,
  ClipboardPaste,
  X,
  Sparkles,
} from 'lucide-react';
import type { PropertyOutletContext } from './PropertyLayout';
import { LISTING_ALLOCATION_ROLES } from '../../../lib/adminAccess';
import {
  isAllocatedOwnerIdAllowed,
  ownersForAllocatedOwnerPicker,
} from '../../../lib/agentOwners';
import { useAdminSession } from '../../../context/AdminSessionContext';
import {
  formatICalSyncError,
  formatICalSyncSuccessMessage,
  isCalendarSyncEnabled,
  syncPropertyTypeICalCallable,
} from '../../../lib/icalSync';
import { clonePropertyListing } from '../../../lib/clonePropertyListing';
import {
  capturePropertyListingForCopy,
  clearCopiedListing,
  copiedListingSummary,
  pasteCopiedPropertyListing,
  readCopiedListing,
  type CopiedPropertyListing,
} from '../../../lib/propertyListingCopy';
import { ensureAreaDocument } from '../../../lib/ensureAreaDocument';
import MunicipalityAreaField from '../../../components/admin/MunicipalityAreaField';
import PropertyWizardListingStep from '../../../components/admin/PropertyWizardListingStep';
import HouseGuideImportPanel from '../../../components/admin/HouseGuideImportPanel';
import {
  EMPTY_WIZARD_LISTING,
  buildListingOnboardingSeedText,
  firstWizardListingErrorKey,
  getWizardListingFieldErrors,
  normalizeWizardReferenceUrls,
  scrollToWizardListingField,
  type WizardListingDraft,
  type WizardListingFieldErrors,
  type WizardListingFieldKey,
} from '../../../lib/wizardListingOnboarding';

export default function PropertyTypes() {
  const { property, propertyId, propertyAccess, lockedListingId } =
    useOutletContext<PropertyOutletContext>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { isPlatformAdmin, isAgent, profile } = useAdminSession();
  const isEndOwner = profile?.role === 'owner';

  const isListingOnly = propertyAccess.level === 'listing_only';
  const calendarSyncEnabled = isCalendarSyncEnabled(property);
  const canAssignAllocatedOwner = isPlatformAdmin || isAgent;
  const canEditUrlSlug = isPlatformAdmin;
  const allowedTypeIds = isListingOnly ? propertyAccess.typeIds : null;
  const listingOnlyAutoOpened = useRef(false);
  
  const [propertyTypes, setPropertyTypes] = useState<any[]>([]);
  const [owners, setOwners] = useState<any[]>([]);

  const allocatableOwners = useMemo(
    () => ownersForAllocatedOwnerPicker(profile, owners),
    [profile, owners]
  );
  
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingTypeId, setEditingTypeId] = useState<string | null>(null);
  const [isSubmittingType, setIsSubmittingType] = useState(false);
  const [isMagicFilling, setIsMagicFilling] = useState(false);
  const [isSlugManuallyEdited, setIsSlugManuallyEdited] = useState(false);
  const [slugBeforeEdit, setSlugBeforeEdit] = useState('');
  
  // Photo upload state
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [qrDownloadingId, setQrDownloadingId] = useState<string | null>(null);
  const [copiedUrlTypeId, setCopiedUrlTypeId] = useState<string | null>(null);
  const [cloningTypeId, setCloningTypeId] = useState<string | null>(null);
  const [copyingListingId, setCopyingListingId] = useState<string | null>(null);
  const [isPastingListing, setIsPastingListing] = useState(false);
  const [copiedListingClip, setCopiedListingClip] = useState<CopiedPropertyListing | null>(() =>
    readCopiedListing()
  );
  const [isICalSyncing, setIsICalSyncing] = useState(false);

  /** Add-listing wizard (same UX as Add Property → First listing). */
  const [listingDraft, setListingDraft] = useState<WizardListingDraft>(EMPTY_WIZARD_LISTING);
  const [listingFieldErrors, setListingFieldErrors] = useState<WizardListingFieldErrors>({});
  const [listingPhotoFile, setListingPhotoFile] = useState<File | null>(null);
  const [listingPhotoPreview, setListingPhotoPreview] = useState<string | null>(null);
  const [onboardingFiles, setOnboardingFiles] = useState<File[]>([]);
  const [allocatedOwnerId, setAllocatedOwnerId] = useState('');
  const [guideFormData, setGuideFormData] = useState<HouseGuideFormData>({});
  const [guideSaving, setGuideSaving] = useState(false);
  const [postCreateImport, setPostCreateImport] = useState<{
    listingId: string;
    seedText: string;
    files: File[];
  } | null>(null);

  // Master Area Database States
  const [countries, setCountries] = useState<string[]>([]);
  const [dbAreas, setDbAreas] = useState<string[]>([]);
  
  const initialFormState = {
    listingUrl: '',
    airbnbUrl: '',
    bookingUrl: '',
    googleMapsUrl: '',
    propertyTypeName: '',
    urlSlug: '',
    latitude: '',
    longitude: '',
    wifiName: '',
    wifiPassword: '',
    whatsapp: '',
    internalRefCode: '',
    googleRating: '',
    googlePlaceId: '',
    ownerId: '',
    iCalUrl: '',
    photoUrl: '',
    addressLine: '',
    area: '',
    city: '',
    postCode: '',
    country: '',
    onboardingNotes: '',
  };
  const [typeFormData, setTypeFormData] = useState(initialFormState);

  // 1. Load country list for admin selects
  useEffect(() => {
    loadCountryNames()
      .then(setCountries)
      .catch((err) => console.error('Failed to load countries:', err));
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
    const q = query(collection(db, 'owners'), where('role', 'in', [...LISTING_ALLOCATION_ROLES]));
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

  const handleTypeChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    if (e.target.name === 'urlSlug' && canEditUrlSlug) setIsSlugManuallyEdited(true);

    setTypeFormData(prev => {
      const newData = { ...prev, [e.target.name]: e.target.value };

      // Force city reset if country changes
      if (e.target.name === 'country') {
        newData.city = '';
      }

      // Auto-generate slug from name only when creating a listing (admins may override manually)
      if (
        e.target.name === 'propertyTypeName' &&
        !isSlugManuallyEdited &&
        (!editingTypeId || canEditUrlSlug)
      ) {
        newData.urlSlug = slugFromPropertyTypeName(e.target.value);
      }

      return newData;
    });
  };

  const handleSlugChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canEditUrlSlug) return;
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
      const result = await getGooglePlaceDetails({
        searchQuery,
        area: areaHint,
        usageCaller: PLACES_USAGE_CALLER.propertyTypes,
      });
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

      let mirroredPhotoUrl = googleData.photoUrl;
      if (mirroredPhotoUrl) {
        try {
          mirroredPhotoUrl = await ensurePersistablePhotoUrl(mirroredPhotoUrl, {
            googlePlaceId: googleData.googlePlaceId,
          });
        } catch (mirrorErr) {
          console.warn('Magic Fill photo mirror failed:', mirrorErr);
          toast.warning('Listing loaded, but the Google photo could not be stored. Upload a custom image.');
          mirroredPhotoUrl = undefined;
        }
      }

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
        urlSlug:
          canEditUrlSlug && !isSlugManuallyEdited && slugFromName ? slugFromName : prev.urlSlug,
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
        photoUrl: mirroredPhotoUrl || prev.photoUrl,
      }));

      if (mirroredPhotoUrl) {
        setPhotoFile(null);
        setPhotoPreview(mirroredPhotoUrl);
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
        toast.error(
          'Could not process this link. Paste a full google.com/maps/place URL, maps.app.goo.gl, or share.google link.'
        );
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

  const handleCloneClick = async (type: (typeof propertyTypes)[0]) => {
    if (isListingOnly) {
      toast.error('You cannot create new property listings.');
      return;
    }
    if (
      !window.confirm(
        `Clone "${type.propertyTypeName}"? A new listing will be created in this property with the same settings, local gems, and house guide. Reservations and analytics are not copied.`
      )
    ) {
      return;
    }

    setCloningTypeId(type.id);
    try {
      const result = await clonePropertyListing({
        propertyId,
        sourceTypeId: type.id,
        sourceData: type,
        existingTypes: propertyTypes,
        propertyName: property?.propertyName,
      });

      const parts = [
        'Listing cloned.',
        result.gemsCopied > 0 ? `${result.gemsCopied} local gem${result.gemsCopied === 1 ? '' : 's'}` : null,
        result.featuresCopied > 0 ? `${result.featuresCopied} feature${result.featuresCopied === 1 ? '' : 's'}` : null,
        result.houseGuideCopied ? 'house guide' : null,
        result.greenScoreCopied ? 'green score' : null,
      ].filter(Boolean);

      toast.success(parts.length > 1 ? parts.join(' · ') : 'Listing cloned.');
      openTypeEditor({ id: result.newTypeId, ...result.listingData });
    } catch (error) {
      console.error('Clone listing failed:', error);
      toast.error('Failed to clone property listing.');
    } finally {
      setCloningTypeId(null);
    }
  };

  const handleCopyListingForPaste = async (type: (typeof propertyTypes)[0]) => {
    if (!isPlatformAdmin) return;
    setCopyingListingId(type.id);
    try {
      const clip = await capturePropertyListingForCopy({
        propertyId,
        typeId: type.id,
        typeData: type,
        propertyName: property?.propertyName,
      });
      setCopiedListingClip(clip);
      toast.success(
        `Copied "${type.propertyTypeName}" — open another property and click Paste listing.`
      );
    } catch (error) {
      console.error('Copy listing failed:', error);
      toast.error('Failed to copy property listing.');
    } finally {
      setCopyingListingId(null);
    }
  };

  const handlePasteCopiedListing = async () => {
    if (!isPlatformAdmin || !copiedListingClip || !propertyId) return;
    if (isListingOnly) {
      toast.error('You cannot create new property listings.');
      return;
    }
    if (
      !window.confirm(
        `Paste "${copiedListingClip.sourceListingName || 'listing'}" into ${property?.propertyName || 'this property'}? A new listing will be created with settings, local gems, house guide, and green score. Reservations and analytics are not copied.`
      )
    ) {
      return;
    }

    setIsPastingListing(true);
    try {
      const result = await pasteCopiedPropertyListing({
        propertyId,
        clip: copiedListingClip,
        existingTypes: propertyTypes,
        propertyName: property?.propertyName,
      });

      const parts = [
        'Listing pasted.',
        result.gemsCopied > 0 ? `${result.gemsCopied} local gem${result.gemsCopied === 1 ? '' : 's'}` : null,
        result.featuresCopied > 0 ? `${result.featuresCopied} feature${result.featuresCopied === 1 ? '' : 's'}` : null,
        result.houseGuideCopied ? 'house guide' : null,
        result.greenScoreCopied ? 'green score' : null,
      ].filter(Boolean);

      toast.success(parts.length > 1 ? parts.join(' · ') : 'Listing pasted.');
      openTypeEditor({ id: result.newTypeId, ...result.listingData });
    } catch (error) {
      console.error('Paste listing failed:', error);
      toast.error('Failed to paste property listing.');
    } finally {
      setIsPastingListing(false);
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

    if (!typeFormData.country?.trim() || !typeFormData.city?.trim()) {
      toast.warning('Please set country and city / master area for this listing.');
      return;
    }

    setIsSubmittingType(true);
    
    try {
      const ensuredArea = await ensureAreaDocument({
        country: typeFormData.country,
        areaName: typeFormData.city,
      });

      let finalPhotoUrl = typeFormData.photoUrl;

      if (photoFile) {
        const storage = getStorage();
        const fileRef = ref(storage, `propertyTypes/${propertyId}/${Date.now()}_${photoFile.name}`);
        await uploadBytes(fileRef, photoFile);
        finalPhotoUrl = await getDownloadURL(fileRef);
      } else if (finalPhotoUrl) {
        finalPhotoUrl = await ensurePersistablePhotoUrl(finalPhotoUrl, {
          googlePlaceId: typeFormData.googlePlaceId,
          docId: editingTypeId || undefined,
        });
      }

      const existingType = editingTypeId
        ? propertyTypes.find((t) => t.id === editingTypeId)
        : null;
      const newSlug = canEditUrlSlug
        ? formatGuestSlug(typeFormData.urlSlug)
        : editingTypeId && existingType
          ? getTypePublicSlug(existingType)
          : formatGuestSlug(typeFormData.urlSlug) ||
            slugFromPropertyTypeName(typeFormData.propertyTypeName);
      const slugChanged = canEditUrlSlug && newSlug !== getTypePublicSlug(existingType ?? {});
      const payload: Record<string, unknown> = {
        ...typeFormData,
        country: typeFormData.country.trim(),
        city: ensuredArea.areaName,
        urlSlug: newSlug,
        typeSlug: newSlug,
        photoUrl: finalPhotoUrl,
        previousUrlSlugs: slugChanged
          ? mergePreviousSlugs(
              existingType?.previousUrlSlugs,
              editingTypeId ? slugBeforeEdit : undefined,
              newSlug
            )
          : existingType?.previousUrlSlugs ?? [],
      };

      if (isEndOwner) {
        if (editingTypeId && existingType) {
          payload.ownerId = existingType.ownerId ?? '';
        } else {
          delete payload.ownerId;
        }
      } else if (
        isAgent &&
        payload.ownerId &&
        !isAllocatedOwnerIdAllowed(profile, String(payload.ownerId), owners)
      ) {
        toast.error('You can only assign owners from your list.');
        setIsSubmittingType(false);
        return;
      }

      if (editingTypeId) {
        const typeRef = doc(db, 'properties', propertyId, 'propertyTypes', editingTypeId);
        await updateDoc(typeRef, { ...payload, updatedAt: new Date().toISOString() });
      } else {
        await addDoc(collection(db, 'properties', propertyId, 'propertyTypes'), {
          ...payload, createdAt: new Date().toISOString()
        });
      }

      // Keep property-level location in sync for portfolio list / fallbacks.
      await updateDoc(doc(db, 'properties', propertyId), {
        country: typeFormData.country.trim(),
        area: ensuredArea.areaName,
        city: ensuredArea.areaName,
        updatedAt: new Date().toISOString(),
      });
      
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
    setListingDraft(EMPTY_WIZARD_LISTING);
    setListingFieldErrors({});
    setListingPhotoFile(null);
    setListingPhotoPreview(null);
    setOnboardingFiles([]);
    setAllocatedOwnerId('');
    setGuideFormData({});
    setPostCreateImport(null);
  };

  const openAddListingWizard = () => {
    if (isListingOnly) {
      toast.error('You cannot create new property listings.');
      return;
    }
    setEditingTypeId(null);
    setTypeFormData(initialFormState);
    setListingDraft(EMPTY_WIZARD_LISTING);
    setListingFieldErrors({});
    setListingPhotoFile(null);
    setListingPhotoPreview(null);
    setOnboardingFiles([]);
    setAllocatedOwnerId('');
    setPostCreateImport(null);
    setGuideFormData({});
    setIsFormOpen(true);
  };

  const submitAddListingWizard = async () => {
    if (isListingOnly) {
      toast.error('You cannot create new property listings.');
      return;
    }
    const errors = getWizardListingFieldErrors(listingDraft);
    setListingFieldErrors(errors);
    const firstKey = firstWizardListingErrorKey(errors);
    if (firstKey) {
      toast.warning('Please complete the highlighted listing fields.');
      window.setTimeout(() => scrollToWizardListingField(firstKey), 50);
      return;
    }
    if (
      isAgent &&
      allocatedOwnerId &&
      !isAllocatedOwnerIdAllowed(profile, allocatedOwnerId, owners)
    ) {
      toast.error('You can only assign owners from your list.');
      return;
    }

    setIsSubmittingType(true);
    try {
      const latNum = parseFloat(listingDraft.latitude);
      const lngNum = parseFloat(listingDraft.longitude);
      const ensuredArea = await ensureAreaDocument({
        country: listingDraft.country,
        areaName: listingDraft.city,
        lat: Number.isFinite(latNum) ? latNum : undefined,
        lng: Number.isFinite(lngNum) ? lngNum : undefined,
      });

      let finalPhotoUrl = listingDraft.photoUrl;
      if (listingPhotoFile) {
        const storage = getStorage();
        const fileRef = ref(
          storage,
          `propertyTypes/${propertyId}/${Date.now()}_${listingPhotoFile.name}`
        );
        await uploadBytes(fileRef, listingPhotoFile);
        finalPhotoUrl = await getDownloadURL(fileRef);
      } else if (finalPhotoUrl) {
        finalPhotoUrl = await ensurePersistablePhotoUrl(finalPhotoUrl, {
          googlePlaceId: listingDraft.googlePlaceId,
        });
      }

      const listingSlug =
        formatGuestSlug(listingDraft.urlSlug) ||
        slugFromPropertyTypeName(listingDraft.propertyTypeName);
      const referenceUrls = normalizeWizardReferenceUrls(listingDraft.referenceUrls);
      const primaryListingUrl = referenceUrls[0] || '';
      const ownerId = isEndOwner ? '' : allocatedOwnerId;

      const listingRef = await addDoc(collection(db, 'properties', propertyId, 'propertyTypes'), {
        propertyTypeName: listingDraft.propertyTypeName.trim(),
        urlSlug: listingSlug,
        typeSlug: listingSlug,
        previousUrlSlugs: [],
        listingUrl: primaryListingUrl,
        referenceUrls,
        airbnbUrl: '',
        bookingUrl: '',
        googleMapsUrl: listingDraft.googleMapsUrl.trim(),
        iCalUrl: calendarSyncEnabled ? listingDraft.iCalUrl.trim() : '',
        addressLine: listingDraft.addressLine.trim(),
        country: listingDraft.country.trim(),
        city: ensuredArea.areaName,
        area: listingDraft.area.trim(),
        postCode: listingDraft.postCode.trim(),
        latitude: listingDraft.latitude,
        longitude: listingDraft.longitude,
        googlePlaceId: listingDraft.googlePlaceId,
        googleRating: listingDraft.googleRating,
        photoUrl: finalPhotoUrl,
        wifiName: listingDraft.wifiName.trim(),
        wifiPassword: listingDraft.wifiPassword.trim(),
        whatsapp: listingDraft.whatsapp.trim(),
        internalRefCode:
          listingDraft.internalRefCode.trim() ||
          `TYP-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
        ownerId,
        onboardingNotes: listingDraft.onboardingNotes.trim(),
        createdAt: new Date().toISOString(),
      });

      await updateDoc(doc(db, 'properties', propertyId), {
        country: listingDraft.country.trim(),
        area: ensuredArea.areaName,
        city: ensuredArea.areaName,
        updatedAt: new Date().toISOString(),
      });

      const seedText = buildListingOnboardingSeedText({
        ...listingDraft,
        city: ensuredArea.areaName,
      });

      toast.success('Listing saved. AI Import is starting on this page.');
      setGuideFormData({});
      setPostCreateImport({
        listingId: listingRef.id,
        seedText,
        files: onboardingFiles,
      });
      window.setTimeout(() => {
        document.getElementById('wizard-house-guide-import')?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      }, 120);
    } catch (error) {
      console.error(error);
      toast.error('Failed to save property listing.');
    } finally {
      setIsSubmittingType(false);
    }
  };

  const handleICalSync = async () => {
    if (!calendarSyncEnabled) {
      toast.warning('Calendar sync is disabled for this property.');
      return;
    }
    if (!typeFormData.iCalUrl?.trim()) {
      toast.warning('Please enter a valid iCal URL first.');
      return;
    }
    if (!editingTypeId) {
      toast.warning('Save the listing first, then sync the calendar.');
      return;
    }

    setIsICalSyncing(true);
    try {
      const result = await syncPropertyTypeICalCallable(
        propertyId,
        editingTypeId,
        typeFormData.iCalUrl.trim()
      );
      toast.success(formatICalSyncSuccessMessage(result));
    } catch (error) {
      console.error('iCal sync error:', error);
      toast.error(formatICalSyncError(error));
    } finally {
      setIsICalSyncing(false);
    }
  };

  const handleDownloadQr = async (type: (typeof propertyTypes)[0]) => {
    const url = buildGuestPortalPublicListingUrl(property, type);
    if (!url) {
      toast.warning('Set property and unit URL slugs before downloading the QR code.');
      return;
    }

    setQrDownloadingId(type.id);
    try {
      await downloadGuestPortalQrCode(url, guestPortalQrFilename(property, type));
      toast.success('QR code downloaded.');
    } catch (error) {
      console.error(error);
      toast.error('Failed to generate QR code.');
    } finally {
      setQrDownloadingId(null);
    }
  };

  const copyListingUrl = (type: (typeof propertyTypes)[0]) => {
    const url = buildGuestPortalPublicListingUrl(property, type);
    if (!url) {
      toast.warning('Set property and unit URL slugs before copying the guest portal link.');
      return;
    }
    navigator.clipboard.writeText(url);
    setCopiedUrlTypeId(type.id);
    setTimeout(() => setCopiedUrlTypeId(null), 2000);
    toast.success('Guest portal URL copied.');
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
          <div className="flex flex-wrap items-center gap-2">
            {isPlatformAdmin && copiedListingClip && !isListingOnly && (
              <button
                type="button"
                onClick={() => void handlePasteCopiedListing()}
                disabled={isPastingListing}
                className="flex items-center px-4 py-2 bg-vailo-teal text-white rounded-xl hover:bg-vailo-teal-hover transition-colors shadow-sm disabled:opacity-50"
              >
                {isPastingListing ? (
                  <Loader2 size={18} className="mr-2 animate-spin" />
                ) : (
                  <ClipboardPaste size={18} className="mr-2" />
                )}
                Paste listing
              </button>
            )}
            {!isListingOnly && (
              <button
                type="button"
                onClick={openAddListingWizard}
                className="flex items-center px-4 py-2 bg-vailo-teal text-white rounded-xl hover:bg-vailo-teal-hover transition-colors shadow-sm"
              >
                <Plus size={18} className="mr-2" /> Add Property Listing
              </button>
            )}
          </div>
        </div>

        {isPlatformAdmin && copiedListingClip && (
          <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-vailo-teal/20 bg-vailo-teal/5 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-vailo-teal">Listing ready to paste</p>
              <p className="text-xs text-gray-600 truncate">{copiedListingSummary(copiedListingClip)}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {!isListingOnly && (
                <button
                  type="button"
                  onClick={() => void handlePasteCopiedListing()}
                  disabled={isPastingListing}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-vailo-teal text-white hover:bg-vailo-teal-hover disabled:opacity-50"
                >
                  {isPastingListing ? <Loader2 size={14} className="animate-spin" /> : <ClipboardPaste size={14} />}
                  Paste here
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  clearCopiedListing();
                  setCopiedListingClip(null);
                  toast.success('Copied listing cleared.');
                }}
                className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:text-gray-700 hover:bg-white/80"
                title="Clear copied listing"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        )}

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
                    <div className="flex items-center gap-1 mb-3 min-w-0">
                      <p className="text-sm text-gray-500 truncate flex-1">
                        {buildGuestPortalPublicListingUrl(property, type) || 'Set property and unit URL slugs'}
                      </p>
                      <button
                        type="button"
                        onClick={() => copyListingUrl(type)}
                        className="p-1.5 text-gray-400 hover:text-vailo-teal shrink-0"
                        title="Copy guest portal URL"
                        aria-label={`Copy portal URL for ${type.propertyTypeName}`}
                      >
                        {copiedUrlTypeId === type.id ? (
                          <Check size={16} className="text-emerald-600" />
                        ) : (
                          <Copy size={16} />
                        )}
                      </button>
                    </div>
                    
                    {type.iCalUrl && (
                      <div
                        className={`mb-3 flex items-center text-xs font-medium px-2 py-1 rounded w-max border ${
                          calendarSyncEnabled
                            ? 'text-green-700 bg-green-50 border-green-100'
                            : 'text-gray-500 bg-gray-50 border-gray-200 opacity-60'
                        }`}
                      >
                        <CalendarSync size={12} className="mr-1.5" />
                        {calendarSyncEnabled ? 'iCal linked' : 'iCal (sync disabled)'}
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
                    
                    <div className="flex flex-wrap items-center gap-2 pt-4 border-t border-gray-100 mt-auto">
                      <button onClick={() => handleEditClick(type)} className="flex items-center text-sm font-medium text-vailo-teal hover:text-vailo-dark transition-colors">
                        <Pencil size={14} className="mr-1.5" /> Edit
                      </button>
                      {!isListingOnly && (
                        <button
                          type="button"
                          onClick={() => void handleCloneClick(type)}
                          disabled={cloningTypeId === type.id}
                          className="flex items-center text-sm font-medium text-vailo-teal hover:text-vailo-dark transition-colors disabled:opacity-50"
                        >
                          {cloningTypeId === type.id ? (
                            <Loader2 size={14} className="mr-1.5 animate-spin" />
                          ) : (
                            <Copy size={14} className="mr-1.5" />
                          )}
                          Clone
                        </button>
                      )}
                      {isPlatformAdmin && (
                        <button
                          type="button"
                          onClick={() => void handleCopyListingForPaste(type)}
                          disabled={copyingListingId === type.id}
                          className="flex items-center text-sm font-medium text-vailo-teal hover:text-vailo-dark transition-colors disabled:opacity-50"
                          title="Copy entire listing to paste into another property"
                        >
                          {copyingListingId === type.id ? (
                            <Loader2 size={14} className="mr-1.5 animate-spin" />
                          ) : (
                            <ClipboardCopy size={14} className="mr-1.5" />
                          )}
                          Copy listing
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDownloadQr(type)}
                        disabled={qrDownloadingId === type.id}
                        className="flex items-center text-sm font-medium text-vailo-teal hover:text-vailo-dark transition-colors disabled:opacity-50"
                        title={buildGuestPortalPublicListingUrl(property, type) || undefined}
                      >
                        {qrDownloadingId === type.id ? (
                          <Loader2 size={14} className="mr-1.5 animate-spin" />
                        ) : (
                          <QrCode size={14} className="mr-1.5" />
                        )}
                        Download QR
                      </button>
                      <div className="flex items-center gap-1 ml-auto">
                        <button
                          type="button"
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
                          title="Open guest portal (responsive web)"
                        >
                          <ExternalLink size={18} />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const propSlug = formatGuestSlug(property.urlSlug);
                            const unitSlug = getTypePublicSlug(type);
                            if (!propSlug || !unitSlug) return;
                            const url = buildAdminGuestPortalPreviewUrl(
                              window.location.origin,
                              propSlug,
                              unitSlug,
                              type.id,
                              { mobileFrame: true }
                            );
                            window.open(url, '_blank');
                          }}
                          className="p-2 text-vailo-teal hover:text-vailo-dark hover:bg-vailo-teal/5 rounded-lg transition-colors"
                          title="Mobile preview (admin only)"
                        >
                          <Smartphone size={18} />
                        </button>
                        {!isListingOnly && (
                          <button onClick={() => handleDeleteClick(type.id, type.propertyTypeName)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
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

  // --- RENDER ADD WIZARD + AI IMPORT --- //
  if (isFormOpen && !editingTypeId) {
    return (
      <div className="admin-page space-y-6">
        <div className="flex items-center">
          <button
            type="button"
            onClick={cancelForm}
            className="p-2 mr-3 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
            disabled={Boolean(postCreateImport)}
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h3 className="text-xl font-bold text-gray-900">
              {postCreateImport ? 'House Guide · AI Import' : 'Add New Property Listing'}
            </h3>
            <p className="text-sm text-gray-500 mt-0.5">
              {postCreateImport
                ? 'Review AI placements, then continue to another listing or finish.'
                : 'Same flow as Add Property — Maps autofill, reference URLs, notes, files, then AI House Guide.'}
            </p>
          </div>
        </div>

        {!postCreateImport ? (
          <>
            <div className="rounded-3xl border border-sky-100 bg-gradient-to-br from-sky-50/90 via-teal-50/40 to-emerald-50/30 px-5 py-5 sm:px-6">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-sky-800 mb-1 flex items-center gap-1.5">
                <Sparkles size={13} className="text-amber-500" />
                New listing · {property?.propertyName || 'Property'}
              </p>
              <h4 className="text-lg font-bold text-vailo-dark font-luxury">
                Listing identity, links &amp; House Guide seed
              </h4>
              <p className="text-sm text-slate-600 mt-2 max-w-2xl leading-relaxed">
                Maps Auto-fill is the fastest path. Reference URLs, notes, and files carry into AI Import
                when you create the listing.
              </p>
            </div>

            <PropertyWizardListingStep
              value={listingDraft}
              onChange={(next) => {
                setListingDraft(next);
                setListingFieldErrors({});
              }}
              photoFile={listingPhotoFile}
              onPhotoFileChange={(file, preview) => {
                setListingPhotoFile(file);
                setListingPhotoPreview(preview);
                if (preview) {
                  setListingDraft((prev) => ({ ...prev, photoUrl: preview }));
                }
              }}
              photoPreview={listingPhotoPreview || listingDraft.photoUrl || null}
              calendarSyncEnabled={calendarSyncEnabled}
              fieldErrors={listingFieldErrors}
              onClearFieldError={(key: WizardListingFieldKey) =>
                setListingFieldErrors((prev) => {
                  const next = { ...prev };
                  delete next[key];
                  return next;
                })
              }
              onboardingFiles={onboardingFiles}
              onOnboardingFilesChange={setOnboardingFiles}
              ownerSlot={
                canAssignAllocatedOwner ? (
                  <div>
                    <label className="block text-sm font-bold text-slate-800 mb-1">
                      Allocated Owner
                    </label>
                    <select
                      value={allocatedOwnerId}
                      onChange={(e) => setAllocatedOwnerId(e.target.value)}
                      className="w-full px-3 py-2.5 border border-slate-200 rounded-xl admin-input outline-none bg-white"
                    >
                      <option value="">Select an owner…</option>
                      {(isPlatformAdmin
                        ? owners.filter((o) => o.role === 'owner')
                        : allocatableOwners
                      ).map((owner) => (
                        <option key={owner.id} value={owner.id}>
                          {owner.fullName} {owner.company ? `(${owner.company})` : ''}
                        </option>
                      ))}
                    </select>
                    {isAgent && allocatableOwners.length === 0 ? (
                      <p className="text-xs text-slate-500 mt-1">
                        Add owners under <strong>Owners</strong> in the sidebar, then assign them
                        here.
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Allocated Owner
                    </label>
                    <p className="text-sm text-gray-400 italic mb-1">No owner assigned</p>
                    <p className="text-xs text-gray-500">
                      To change allocated owner, contact Vailo at{' '}
                      <a
                        href="mailto:contact@vailo.app"
                        className="font-semibold text-vailo-teal underline hover:text-vailo-teal-hover"
                      >
                        contact@vailo.app
                      </a>
                      .
                    </p>
                  </div>
                )
              }
            />

            <div className="flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={cancelForm}
                className="px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSubmittingType}
                onClick={() => void submitAddListingWizard()}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-vailo-teal hover:bg-vailo-teal-hover rounded-xl disabled:opacity-50 transition-colors shadow-sm"
              >
                {isSubmittingType ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Sparkles size={16} />
                )}
                {isSubmittingType ? 'Saving…' : 'Create & open House Guide AI'}
              </button>
            </div>
          </>
        ) : (
          <div id="wizard-house-guide-import" className="space-y-4">
            <div className="rounded-3xl border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-teal-50/50 p-5 sm:p-6">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-amber-800 mb-1 flex items-center gap-1.5">
                <Sparkles size={13} className="text-amber-500" />
                House Guide · AI Import
              </p>
              <h4 className="text-xl font-bold text-vailo-dark font-luxury">
                Review what AI found for your guide
              </h4>
              <p className="text-sm text-slate-600 mt-2 max-w-2xl leading-relaxed">
                Your listing is saved. Import starts automatically from your notes, links, and files —
                this can take up to a minute.
              </p>
            </div>

            <HouseGuideImportPanel
              formData={guideFormData}
              contentLocale={DEFAULT_PRIMARY_LOCALE}
              primaryLocale={DEFAULT_PRIMARY_LOCALE}
              initialImportText={postCreateImport.seedText}
              initialFiles={postCreateImport.files}
              fromWizard
              autoAnalyze
              disabled={guideSaving}
              footerActions={{
                onContinueListing: () => {
                  setPostCreateImport(null);
                  setListingDraft(EMPTY_WIZARD_LISTING);
                  setListingFieldErrors({});
                  setListingPhotoFile(null);
                  setListingPhotoPreview(null);
                  setOnboardingFiles([]);
                  setAllocatedOwnerId('');
                  setGuideFormData({});
                  toast.success('Ready to add another listing.');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                },
                onFinishHouseGuide: () =>
                  navigate(
                    adminPath(
                      `/properties/${propertyId}/house-guide?listing=${encodeURIComponent(postCreateImport.listingId)}`
                    )
                  ),
                onFinishProperties: () => {
                  cancelForm();
                  navigate(adminPath('/properties'));
                },
              }}
              onApply={async (next) => {
                setGuideSaving(true);
                try {
                  const payload = serializeGuideFormDataForSave(next, DEFAULT_PRIMARY_LOCALE);
                  await setDoc(
                    doc(
                      db,
                      'properties',
                      propertyId,
                      'propertyTypes',
                      postCreateImport.listingId,
                      'houseGuide',
                      'data'
                    ),
                    {
                      ...payload,
                      updatedAt: new Date().toISOString(),
                    },
                    { merge: true }
                  );
                  setGuideFormData(next);
                } finally {
                  setGuideSaving(false);
                }
              }}
            />
          </div>
        )}
      </div>
    );
  }

  // --- RENDER EDIT FORM VIEW --- //
  return (
    <div className="admin-page">
      <div className="flex items-center mb-6">
        <button onClick={cancelForm} className="p-2 mr-3 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
          <ArrowLeft size={20} />
        </button>
        <h3 className="text-xl font-bold text-gray-900">Edit Property Listing</h3>
      </div>
      <form onSubmit={submitPropertyType} className="border border-gray-200 rounded-xl shadow-sm overflow-hidden bg-white">
        
        {/* URL Scraping / Auto-fill Section */}
        <div className="p-6 border-b border-gray-100 bg-gray-50 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Airbnb listing URL</label>
              <div className="relative">
                <Link2 className="absolute left-3 top-2.5 text-gray-400" size={18} />
                <input
                  type="url"
                  name="airbnbUrl"
                  value={typeFormData.airbnbUrl}
                  onChange={handleTypeChange}
                  placeholder="https://www.airbnb.com/rooms/…"
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg admin-input outline-none bg-white"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">Booking.com listing URL</label>
              <div className="relative">
                <Link2 className="absolute left-3 top-2.5 text-gray-400" size={18} />
                <input
                  type="url"
                  name="bookingUrl"
                  value={typeFormData.bookingUrl}
                  onChange={handleTypeChange}
                  placeholder="https://www.booking.com/hotel/…"
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg admin-input outline-none bg-white"
                />
              </div>
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Other website / channel URL</label>
            <div className="relative">
              <Link2 className="absolute left-3 top-2.5 text-gray-400" size={18} />
              <input type="url" name="listingUrl" value={typeFormData.listingUrl} onChange={handleTypeChange} className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg admin-input outline-none bg-white" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Onboarding / import notes</label>
            <textarea
              name="onboardingNotes"
              value={typeFormData.onboardingNotes}
              onChange={handleTypeChange}
              rows={3}
              placeholder="Wi‑Fi, check-in notes, extra URLs…"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg admin-textarea outline-none bg-white text-sm"
            />
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
                  placeholder="Full maps place URL, maps.app.goo.gl, or share.google/…"
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
            <CalendarSync size={18} className={`mr-2 ${calendarSyncEnabled ? 'text-vailo-teal' : 'text-gray-400'}`} /> Calendar Sync (iCal)
          </h4>
          {!calendarSyncEnabled ? (
            <p className="text-sm text-gray-500 mb-3">
              Calendar sync is turned off for this property. A Vailo administrator can enable it in
              Overview.
            </p>
          ) : null}
          <div className={!calendarSyncEnabled ? 'opacity-50' : undefined}>
            <label className="block text-sm font-medium text-gray-700 mb-1">iCal Feed URL</label>
            <div className="flex gap-3">
              <input
                type="url"
                name="iCalUrl"
                value={typeFormData.iCalUrl}
                onChange={handleTypeChange}
                disabled={!calendarSyncEnabled}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg admin-input outline-none bg-white disabled:bg-gray-50 disabled:cursor-not-allowed"
                placeholder="https://www.airbnb.com/calendar/ical/..."
              />
              <button
                type="button"
                onClick={() => void handleICalSync()}
                disabled={!calendarSyncEnabled || isICalSyncing || !typeFormData.iCalUrl?.trim()}
                className="px-6 py-2 bg-vailo-teal text-white rounded-xl hover:bg-vailo-teal-hover text-sm font-medium transition-colors shadow-sm disabled:opacity-50 disabled:bg-gray-400 inline-flex items-center gap-2"
              >
                {isICalSyncing ? <Loader2 size={16} className="animate-spin" /> : <CalendarSync size={16} />}
                {isICalSyncing ? 'Syncing…' : 'Sync Now'}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Paste the iCal export link from Airbnb, Booking.com, or your channel manager.
              {editingTypeId
                ? ' Click Sync Now to import reservations into this listing.'
                : ' Save the listing first, then sync.'}
            </p>
          </div>
        </div>

        {/* General Details & Coordinates */}
        <div className="p-6 border-b border-gray-100 space-y-6">
          <h4 className="text-sm font-bold text-gray-900 border-b border-gray-100 pb-2 mb-4">General Details</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Listing name *</label>
              <input type="text" required name="propertyTypeName" value={typeFormData.propertyTypeName} onChange={handleTypeChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg admin-input outline-none" />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">URL Slug *</label>
              {canEditUrlSlug ? (
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
              ) : (
                <>
                  <p className="text-sm text-gray-700 font-mono bg-gray-50 p-2.5 rounded-lg border border-gray-100">
                    vailo.com/{property?.urlSlug || 'property'}/{typeFormData.urlSlug || '—'}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    To change the URL slug, contact Vailo at{' '}
                    <a
                      href="mailto:contact@vailo.app"
                      className="font-semibold text-vailo-teal underline hover:text-vailo-teal-hover"
                    >
                      contact@vailo.app
                    </a>
                    .
                  </p>
                </>
              )}
            </div>
            
            {canAssignAllocatedOwner ? (
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Allocated Owner</label>
                <select
                  name="ownerId"
                  value={typeFormData.ownerId}
                  onChange={handleTypeChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg admin-input outline-none bg-white"
                >
                  <option value="">Select an owner...</option>
                  {(isPlatformAdmin ? owners.filter((o) => o.role === 'owner') : allocatableOwners).map(
                    (owner) => (
                      <option key={owner.id} value={owner.id}>
                        {owner.fullName} {owner.company ? `(${owner.company})` : ''}
                      </option>
                    )
                  )}
                </select>
                {isAgent && allocatableOwners.length === 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    Add owners under <strong>Owners</strong> in the sidebar, then assign them here.
                  </p>
                )}
              </div>
            ) : (
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Allocated Owner</label>
                {typeFormData.ownerId ? (
                  <p className="text-sm text-gray-700 flex items-center bg-gray-50 p-2.5 rounded-lg border border-gray-100 w-max mb-2">
                    <User size={14} className="mr-2 text-gray-400" />
                    {owners.find((o) => o.id === typeFormData.ownerId)?.fullName || 'Assigned owner'}
                  </p>
                ) : (
                  <p className="text-sm text-gray-400 italic mb-2">No owner assigned</p>
                )}
                <p className="text-xs text-gray-500">
                  To change allocated owner, contact Vailo at{' '}
                  <a
                    href="mailto:contact@vailo.app"
                    className="font-semibold text-vailo-teal underline hover:text-vailo-teal-hover"
                  >
                    contact@vailo.app
                  </a>
                  .
                </p>
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
              <p className="text-xs text-gray-500 mt-1">
                Country for this listing. Each property can be in a different place (for example Paris or Athens).
              </p>
            </div>

            <MunicipalityAreaField
              country={typeFormData.country}
              value={typeFormData.city}
              required
              label="City / Master Area *"
              helpText="Type the city or municipality for this listing. New places are created automatically when you save."
              onChange={(next) =>
                setTypeFormData((prev) => ({
                  ...prev,
                  city: next.name,
                }))
              }
            />

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