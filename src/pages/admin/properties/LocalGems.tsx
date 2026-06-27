import { useState, useEffect, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, ai, cloudFunctions } from '../../../lib/firebase';
import { useToast } from '../../../context/ToastContext';
import { getGenerativeModel } from "firebase/ai";
import { ArrowLeft, Plus, MapPin, Wand2, Star, Image as ImageIcon, Pencil, Trash2, Map, Loader2, Building, Sparkles, ExternalLink, Copy, ClipboardPaste, X } from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { httpsCallableMessage } from '../../../lib/callableError';
import { PLACES_USAGE_CALLER } from '../../../lib/placesApiUsageCallers';
import { formatGuestSlug, getTypePublicSlug } from '../../../lib/guestPortalSlug';
import { buildAdminGuestPortalPreviewUrl } from '../../../lib/guestAccess';
import ContentLocaleTabs from '../../../components/admin/ContentLocaleTabs';
import { usePlatformLanguages } from '../../../hooks/usePlatformLanguages';
import { useContentLocaleEditor } from '../../../hooks/useContentLocaleEditor';
import { translateContentFields } from '../../../lib/adminContentTranslate';
import { resolveLocalizedString } from '../../../lib/propertyContentLocales';
import { usePropertyContentLocaleSettings } from '../../../hooks/usePropertyContentLocaleSettings';
import { Languages, Loader2 as Loader2Icon } from 'lucide-react';
import {
  categoryPrimaryName,
  categorySelectionIncludes,
  gemCategoryPrimaries,
  normalizeCategorySelectionList,
  resolveCategoryLabel,
} from '../../../lib/categoryLocale';
import CategoryPillSelector from '../../../components/admin/CategoryPillSelector';
import { syncPropertyGemToArea } from '../../../lib/propertyGemAreaSync';
import CopyGemsModal from '../../../components/admin/CopyGemsModal';
import MirroredPhotoImg from '../../../components/shared/MirroredPhotoImg';
import { ensurePersistablePhotoUrl } from '../../../lib/adminPhotoUrl';
import {
  clearCopiedGems,
  readCopiedGems,
  writeCopiedGems,
  type CopiedPropertyGems,
} from '../../../lib/propertyGemCopy';

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
  const toast = useToast();
  
  // Context States
  const [propertyAreaContext, setPropertyAreaContext] = useState<{country: string, areaId: string, areaName: string} | null>(null);
  const [propertyTypes, setPropertyTypes] = useState<any[]>([]);
  const [selectedTypeId, setSelectedTypeId] = useState<string>('');
  
  // Database States
  const [gems, setGems] = useState<any[]>([]);
  const [localGemsCategoryDocs, setLocalGemsCategoryDocs] = useState<
    { id: string; data: Record<string, unknown> }[]
  >([]);
  
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
    name: '', category: '', categories: [] as string[], description: '', rating: '',
    googleMapsUrl: '', distanceKm: '', distanceTime: '',
    latitude: '', longitude: '',
    googlePlaceId: '',
    isLegitPick: false, isDailyTrip: false, photoUrl: ''
  };
  
  const [formData, setFormData] = useState(initialFormState);
  const [editingSourceDoc, setEditingSourceDoc] = useState<Record<string, unknown> | null>(null);
  const [isLocaleTranslating, setIsLocaleTranslating] = useState(false);
  const [selectedGemIds, setSelectedGemIds] = useState<Set<string>>(new Set());
  const [copiedClip, setCopiedClip] = useState<CopiedPropertyGems | null>(() => readCopiedGems());
  const [pasteModalOpen, setPasteModalOpen] = useState(false);

  const localeSettings = usePropertyContentLocaleSettings(property);
  const { languages } = usePlatformLanguages();
  const languageOptions = useMemo(
    () => languages.map((l) => ({ code: l.shortName, label: l.title })),
    [languages]
  );
  const localeEditor = useContentLocaleEditor(
    localeSettings.primaryLocale,
    ['name', 'description'],
    editingSourceDoc
  );

  const categoryCatalogDocs = useMemo(
    () => localGemsCategoryDocs.map((c) => c.data),
    [localGemsCategoryDocs]
  );

  const normalizedGemCategories = useMemo(
    () =>
      normalizeCategorySelectionList(
        formData.categories,
        categoryCatalogDocs,
        localeSettings.primaryLocale
      ),
    [formData.categories, categoryCatalogDocs, localeSettings.primaryLocale]
  );

  const categoryPillOptions = useMemo(
    () =>
      localGemsCategoryDocs.map((cat) => {
        const primaryName = categoryPrimaryName(cat.data, localeSettings.primaryLocale);
        const label = resolveCategoryLabel(
          cat.data,
          localeEditor.contentLocale,
          localeSettings.primaryLocale
        );
        return { value: primaryName, label: label || primaryName };
      }),
    [localGemsCategoryDocs, localeEditor.contentLocale, localeSettings.primaryLocale]
  );

  const handleCategoryPillToggle = (value: string) => {
    setFormData((prev) => {
      const current = normalizeCategorySelectionList(
        prev.categories,
        categoryCatalogDocs,
        localeSettings.primaryLocale
      );
      const lower = value.toLowerCase();
      const has = current.some((c) => c.toLowerCase() === lower);
      const next = has
        ? current.filter((c) => c.toLowerCase() !== lower)
        : [...current, value];
      const normalized = normalizeCategorySelectionList(
        next,
        categoryCatalogDocs,
        localeSettings.primaryLocale
      );
      return {
        ...prev,
        categories: normalized,
        category: normalized[0] || '',
      };
    });
  };

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
    const unsubCats = onSnapshot(
      collection(db, 'countries', country, 'areas', areaId, 'localGemsCategories'),
      (snapshot) => {
        const fetchedCats = snapshot.docs.map((d) => ({
          id: d.id,
          data: d.data() as Record<string, unknown>,
        }));
        fetchedCats.sort((a, b) =>
          categoryPrimaryName(a.data, localeSettings.primaryLocale).localeCompare(
            categoryPrimaryName(b.data, localeSettings.primaryLocale)
          )
        );
        setLocalGemsCategoryDocs(fetchedCats);
      }
    );

    return () => unsubCats();
  }, [propertyAreaContext, localeSettings.primaryLocale]);

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

  useEffect(() => {
    setSelectedGemIds(new Set());
  }, [selectedTypeId]);

  const selectedGems = useMemo(
    () => gems.filter((g) => selectedGemIds.has(g.id)),
    [gems, selectedGemIds]
  );
  const allGemsSelected = gems.length > 0 && selectedGemIds.size === gems.length;

  const toggleGemSelection = (gemId: string) => {
    setSelectedGemIds((prev) => {
      const next = new Set(prev);
      if (next.has(gemId)) next.delete(gemId);
      else next.add(gemId);
      return next;
    });
  };

  const toggleSelectAllGems = () => {
    if (allGemsSelected) {
      setSelectedGemIds(new Set());
    } else {
      setSelectedGemIds(new Set(gems.map((g) => g.id)));
    }
  };

  const handleCopySelectedGems = () => {
    if (!propertyId || !selectedTypeId || selectedGems.length === 0) return;
    const selectedType = propertyTypes.find((t) => t.id === selectedTypeId);
    const clip: CopiedPropertyGems = {
      gems: selectedGems.map((g) => ({ ...g })),
      sourcePropertyId: propertyId,
      sourceTypeId: selectedTypeId,
      sourcePropertyName: property?.propertyName,
      sourceListingName: selectedType?.propertyTypeName,
      copiedAt: new Date().toISOString(),
    };
    writeCopiedGems(clip);
    setCopiedClip(clip);
    setSelectedGemIds(new Set());
    toast.success(
      `Copied ${clip.gems.length} gem${clip.gems.length === 1 ? '' : 's'}. Choose listings to paste into.`
    );
  };

  const handleClearCopiedGems = () => {
    clearCopiedGems();
    setCopiedClip(null);
    toast.success('Copied gems cleared.');
  };

  const handlePasteComplete = (result: { pasted: number; skipped: number; targets: number }) => {
    if (result.pasted === 0 && result.skipped > 0) {
      toast.warning(
        `No gems pasted — all ${result.skipped} already exist on the selected listing${result.targets === 1 ? '' : 's'}.`
      );
      return;
    }
    const skippedPart =
      result.skipped > 0 ? ` ${result.skipped} skipped (already on listing).` : '';
    toast.success(
      `Pasted ${result.pasted} gem${result.pasted === 1 ? '' : 's'} across ${result.targets} listing${result.targets === 1 ? '' : 's'}.${skippedPart}`
    );
  };

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
    if (!url) {
      toast.warning("Please paste a Google Maps URL first.");
      return;
    }
    if (!propertyAreaContext) {
      toast.warning("Area data missing. Ensure your property has a City/Area set.");
      return;
    }
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

      const getGooglePlaceDetails = httpsCallable(cloudFunctions, 'getGooglePlaceDetails');
      const result = await getGooglePlaceDetails({
        searchQuery,
        area: propertyAreaContext.areaName,
        usageCaller: PLACES_USAGE_CALLER.propertyLocalGems,
      });
      const googleData: any = result.data;
      if (googleData.photoUrl) {
        try {
          googleData.photoUrl = await ensurePersistablePhotoUrl(googleData.photoUrl, {
            country: propertyAreaContext?.country,
            areaId: propertyAreaContext?.areaId,
            googlePlaceId: googleData.googlePlaceId,
          });
        } catch (mirrorErr) {
          console.warn('Magic Fill photo mirror failed:', mirrorErr);
          toast.warning('Place loaded, but the Google photo could not be stored. Upload a custom image.');
          googleData.photoUrl = '';
        }
      }

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
        const categoryNames = categoryPillOptions.map((o) => o.value).join(', ');
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

        if (
          parsed.category &&
          categoryPillOptions.some((o) => o.value === parsed.category)
        ) {
          matchedCategory = parsed.category;
        }
        if (parsed.description && !googleData.description) {
          finalDescription = parsed.description;
        }
      } catch (e) {
        console.log("AI JSON mapping failed, falling back to simple match.", e);
        const gTypeLower = googleData.category?.toLowerCase().replace(/_/g, ' ') || "";
        const possibleMatch = categoryPillOptions.find(
          (o) =>
            gTypeLower.includes(o.value.toLowerCase()) ||
            o.value.toLowerCase().includes(gTypeLower)
        );
        if (possibleMatch) matchedCategory = possibleMatch.value;
      }

      const nextCategories = matchedCategory
        ? normalizeCategorySelectionList(
            formData.categories.includes(matchedCategory)
              ? formData.categories
              : [...formData.categories, matchedCategory],
            categoryCatalogDocs,
            localeSettings.primaryLocale
          )
        : formData.categories;

      const primaryName = googleData.name || placeNameFallback;
      const primaryDescription = finalDescription || formData.description;
      setFormData((prev) => ({
        ...prev,
        name: primaryName,
        categories: nextCategories,
        category: nextCategories[0] || '',
        rating: googleData.rating ? googleData.rating.toString() : prev.rating,
        description: primaryDescription,
        latitude: googleData.latitude?.toString() || prev.latitude,
        longitude: googleData.longitude?.toString() || prev.longitude,
        distanceKm: distanceKm,
        distanceTime: distanceTime,
        googlePlaceId: googleData.googlePlaceId || '',
        photoUrl: googleData.photoUrl || '',
      }));
      localeEditor.applyPrimaryFields({
        name: primaryName,
        description: primaryDescription,
      });

      // 3. Save Google Photo to Memory
      if (googleData.photoUrl) {
        setGooglePhoto(googleData.photoUrl);
        setImagePreview(null);
        setImageFile(null);
      }

    } catch (error) {
      console.error("Magic Fill Error:", error);
      toast.error(
        httpsCallableMessage(
          error,
          'Could not load this place. Deploy Cloud Functions (getGooglePlaceDetails), use a full Google Maps place link, or try again.'
        )
      );
    } finally {
      setIsMagicFilling(false);
    }
  };

  const submitGem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!propertyId || !selectedTypeId) return;
    if (normalizedGemCategories.length === 0) {
      toast.warning('Select at least one category.');
      return;
    }
    setIsSubmitting(true);
    
    try {
      let finalPhotoUrl = formData.photoUrl;

      // Only upload if the actively selected photo is the custom one they uploaded
      if (imageFile && formData.photoUrl === imagePreview) {
        setIsUploadingImage(true);
        const fileRef = ref(storage, `properties/${propertyId}/types/${selectedTypeId}/gems/${Date.now()}_${imageFile.name}`);
        await uploadBytes(fileRef, imageFile);
        finalPhotoUrl = await getDownloadURL(fileRef);
      } else if (finalPhotoUrl) {
        finalPhotoUrl = await ensurePersistablePhotoUrl(finalPhotoUrl, {
          country: propertyAreaContext?.country,
          areaId: propertyAreaContext?.areaId,
          docId: editingGemId || undefined,
          googlePlaceId: formData.googlePlaceId || undefined,
          propertyId,
          propertyTypeId: selectedTypeId,
          propertyGemId: editingGemId || undefined,
        });
      }

      const localized = localeEditor.buildPayload();
      const payload = {
        ...formData,
        ...localized,
        categories: normalizedGemCategories,
        category: normalizedGemCategories[0] || '',
        photoUrl: finalPhotoUrl,
        isLegitPick: Boolean(formData.isLegitPick),
        isDailyTrip: Boolean(formData.isDailyTrip),
      };

      let savedGemId = editingGemId;
      if (editingGemId) {
        await updateDoc(doc(db, 'properties', propertyId, 'propertyTypes', selectedTypeId, 'localGems', editingGemId), {
          ...payload, updatedAt: new Date().toISOString()
        });
      } else {
        const gemRef = await addDoc(collection(db, 'properties', propertyId, 'propertyTypes', selectedTypeId, 'localGems'), {
          ...payload, createdAt: new Date().toISOString()
        });
        savedGemId = gemRef.id;
      }

      const selectedType = propertyTypes.find((t) => t.id === selectedTypeId);
      if (savedGemId && selectedType) {
        try {
          const syncResult = await syncPropertyGemToArea({
            propertyId,
            propertyTypeId: selectedTypeId,
            propertyGemId: savedGemId,
            propertyGem: payload,
            propertyName: property?.propertyName || propertyId,
            listingLabel: selectedType.propertyTypeName || selectedType.urlSlug,
            propertyType: { country: selectedType.country, city: selectedType.city },
          });
          if (syncResult === 'created') {
            toast.success('Synced to area Local Gems with AI alternate titles.');
          } else if (syncResult === 'updated') {
            toast.success('Updated matching area Local Gem.');
          }
        } catch (syncErr) {
          console.warn('Area gem sync failed:', syncErr);
        }
      }

      closeAndResetForm();
    } catch (error) {
      console.error("Error saving gem:", error);
      toast.error("Failed to save local gem.");
    } finally {
      setIsSubmitting(false);
      setIsUploadingImage(false);
    }
  };

  const handleEditClick = (gemData: any) => {
    const normalized = gemCategoryPrimaries(
      gemData,
      categoryCatalogDocs,
      localeSettings.primaryLocale
    );
    setEditingSourceDoc(gemData);
    setFormData({
      ...initialFormState,
      ...gemData,
      categories: normalized,
      category: normalized[0] || '',
      isLegitPick: Boolean(gemData.isLegitPick),
      isDailyTrip: Boolean(gemData.isDailyTrip),
    });
    setGooglePhoto(null);
    setImagePreview(null);
    setImageFile(null);
    setEditingGemId(gemData.id);
    setIsFormOpen(true);
  };

  const handleAutoTranslateLocale = async () => {
    const target = localeEditor.contentLocale;
    const primary = localeSettings.primaryLocale;
    if (target === primary) {
      toast.warning('Switch to a non-primary language tab to auto-translate.');
      return;
    }
    const primaryFields = {
      name: localeEditor.getPrimaryValue('name') || formData.name,
      description: localeEditor.getPrimaryValue('description') || formData.description,
    };
    if (!primaryFields.name?.trim()) {
      toast.warning('Fill in the primary language first.');
      return;
    }
    setIsLocaleTranslating(true);
    try {
      const translated = await translateContentFields(primaryFields, primary, target);
      localeEditor.applyTranslatedFields(target, translated);
      toast.success(`Draft translation added for ${target.toUpperCase()}. Please review before saving.`);
    } catch {
      toast.error('Auto-translate failed. Try again or edit manually.');
    } finally {
      setIsLocaleTranslating(false);
    }
  };

  const handleDeleteClick = async (gemId: string, gemName: string) => {
    if (window.confirm(`Are you sure you want to remove "${gemName}"?`)) {
      try {
        await deleteDoc(doc(db, 'properties', propertyId, 'propertyTypes', selectedTypeId, 'localGems', gemId));
      } catch (error) {
        toast.error("Failed to delete gem.");
      }
    }
  };

  const closeAndResetForm = () => {
    setIsFormOpen(false);
    setEditingGemId(null);
    setEditingSourceDoc(null);
    localeEditor.resetMaps();
    setFormData(initialFormState);
    setImagePreview(null);
    setImageFile(null);
    setGooglePhoto(null);
  };

  const openAddForm = () => {
    setEditingSourceDoc(null);
    localeEditor.resetMaps();
    setFormData(initialFormState);
    setEditingGemId(null);
    setIsFormOpen(true);
  };

  // --- EDGE CASE: No Property Types Exist ---
  if (propertyTypes.length === 0) {
    return (
      <div className="text-center py-16 bg-gray-50 rounded-xl border border-dashed border-gray-200">
        <Building size={32} className="mx-auto text-gray-400 mb-3" />
        <h3 className="text-xl font-bold text-gray-900 mb-2">No Property Listings Configured</h3>
        <p className="text-gray-500 max-w-sm mx-auto mb-6">
          Local gems are assigned to specific units. Please go to the <b>Property Listings</b> tab and create a unit before adding local gems.
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
            <p className="text-xs text-vailo-teal-hover">Gems are assigned specifically to the selected property listing.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select 
              value={selectedTypeId} 
              onChange={(e) => setSelectedTypeId(e.target.value)}
              className="px-4 py-2 bg-white border border-vailo-teal/15 rounded-lg text-sm font-medium text-gray-900 outline-none focus:ring-2 focus:ring-vailo-teal/20 focus:border-vailo-teal shadow-sm min-w-[200px]"
            >
              {propertyTypes.map(type => (
                <option key={type.id} value={type.id}>{type.propertyTypeName}</option>
              ))}
            </select>
            {(() => {
              const selectedType = propertyTypes.find((t) => t.id === selectedTypeId);
              const propSlug = formatGuestSlug(property?.urlSlug);
              const unitSlug = selectedType ? getTypePublicSlug(selectedType) : '';
              if (!propSlug || !unitSlug || !selectedTypeId) return null;
              return (
                <button
                  type="button"
                  onClick={() =>
                    window.open(
                      buildAdminGuestPortalPreviewUrl(
                        window.location.origin,
                        propSlug,
                        unitSlug,
                        selectedTypeId
                      ),
                      '_blank'
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-vailo-teal border border-vailo-teal/20 rounded-lg bg-white hover:bg-vailo-teal/5 transition-colors"
                  title="Open guest portal for this unit"
                >
                  <ExternalLink size={16} />
                  Preview portal
                </button>
              );
            })()}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Local Gems</h3>
            <p className="text-sm text-gray-500">
              Curated recommendations for your guests. 
              {propertyAreaContext && <span className="ml-1 font-medium text-vailo-teal">(Area: {propertyAreaContext.areaName})</span>}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {copiedClip && (
              <button
                type="button"
                onClick={() => setPasteModalOpen(true)}
                className="flex items-center px-4 py-2 bg-white text-vailo-teal border border-vailo-teal/25 rounded-xl hover:bg-vailo-teal/5 transition-colors shadow-sm"
              >
                <ClipboardPaste size={18} className="mr-2" />
                Paste {copiedClip.gems.length} copied
              </button>
            )}
            <button onClick={openAddForm} className="flex items-center px-4 py-2 bg-vailo-teal text-white rounded-xl hover:bg-vailo-teal-hover transition-colors shadow-sm">
              <Plus size={18} className="mr-2" /> Add Custom Gem
            </button>
          </div>
        </div>

        {copiedClip && (
          <div className="flex flex-wrap items-center gap-2 mb-4 px-3 py-2 rounded-lg border border-vailo-teal/20 bg-vailo-teal/5">
            <span className="text-xs font-semibold text-vailo-teal">
              {copiedClip.gems.length} gem{copiedClip.gems.length === 1 ? '' : 's'} ready to paste
              {copiedClip.sourceListingName ? ` from ${copiedClip.sourceListingName}` : ''}
            </span>
            <button
              type="button"
              onClick={() => setPasteModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-vailo-teal rounded-lg hover:bg-vailo-teal-hover"
            >
              <ClipboardPaste size={14} />
              Paste to listings
            </button>
            <button
              type="button"
              onClick={handleClearCopiedGems}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              <X size={14} />
              Clear
            </button>
          </div>
        )}

        {selectedGemIds.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-4 px-3 py-2 rounded-lg border border-vailo-teal/20 bg-vailo-teal/5">
            <span className="text-xs font-semibold text-vailo-teal">
              {selectedGemIds.size} selected
            </span>
            <button
              type="button"
              onClick={handleCopySelectedGems}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-vailo-teal rounded-lg hover:bg-vailo-teal-hover"
            >
              <Copy size={14} />
              Copy selected
            </button>
            <button
              type="button"
              onClick={() => setSelectedGemIds(new Set())}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              Clear selection
            </button>
          </div>
        )}

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
                  <th className="px-4 py-3 text-left w-10">
                    <input
                      type="checkbox"
                      checked={allGemsSelected}
                      onChange={toggleSelectAllGems}
                      aria-label={allGemsSelected ? 'Deselect all gems' : 'Select all gems'}
                      className="h-4 w-4 rounded border-gray-300 text-vailo-teal focus:ring-vailo-teal/20"
                    />
                  </th>
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
                    <td className="px-4 py-4">
                      <input
                        type="checkbox"
                        checked={selectedGemIds.has(gem.id)}
                        onChange={() => toggleGemSelection(gem.id)}
                        aria-label={`Select ${gem.name}`}
                        className="h-4 w-4 rounded border-gray-300 text-vailo-teal focus:ring-vailo-teal/20"
                      />
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        {gem.photoUrl ? (
                          <MirroredPhotoImg
                            src={gem.photoUrl}
                            alt={gem.name}
                            className="h-10 w-10 rounded-lg object-cover mr-3 border border-gray-200"
                            mirrorContext={{
                              country: propertyAreaContext?.country,
                              areaId: propertyAreaContext?.areaId,
                              docId: gem.id,
                              googlePlaceId: gem.googlePlaceId,
                              propertyId,
                              propertyTypeId: selectedTypeId,
                              propertyGemId: gem.id,
                            }}
                          />
                        ) : (
                          <div className="h-10 w-10 rounded-lg bg-gray-100 flex items-center justify-center mr-3 border border-gray-200">
                            <ImageIcon size={16} className="text-gray-400" />
                          </div>
                        )}
                        <div>
                          <div className="font-medium text-gray-900 flex items-center">
                            {resolveLocalizedString(
                              gem,
                              'name',
                              localeSettings.primaryLocale,
                              localeSettings.primaryLocale
                            ) || gem.name}
                          </div>
                          <div className="flex mt-1">
                            {gem.isLegitPick && <span className="mr-1 px-2 py-0.5 bg-yellow-100 text-yellow-800 text-[10px] uppercase font-bold rounded-full">Legit Pick</span>}
                            {gem.isDailyTrip && <span className="px-2 py-0.5 bg-vailo-teal/10 text-vailo-dark text-[10px] uppercase font-bold rounded-full">Daily Trip</span>}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {gemCategoryPrimaries(gem, categoryCatalogDocs, localeSettings.primaryLocale).join(
                        ' · '
                      )}
                    </td>
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

        {pasteModalOpen && copiedClip && (
          <CopyGemsModal
            clip={copiedClip}
            excludeSource={{
              propertyId: copiedClip.sourcePropertyId,
              typeId: copiedClip.sourceTypeId,
            }}
            onClose={() => setPasteModalOpen(false)}
            onPasted={handlePasteComplete}
          />
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
            Paste a Google Maps link below and click AI Magic Fill. We will extract the GPS coordinates and calculate the driving distance and time from this specific property listing!
          </p>
        </div>

        <div className="p-6 space-y-6 bg-white">
          <div className="rounded-xl border border-vailo-teal/15 bg-vailo-teal/5 p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-vailo-dark flex items-center gap-2">
                  <Languages size={16} /> Content language
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Edit each enabled language. Configure languages in Property Overview.
                </p>
              </div>
              {localeEditor.contentLocale !== localeSettings.primaryLocale && (
                <button
                  type="button"
                  onClick={handleAutoTranslateLocale}
                  disabled={isLocaleTranslating}
                  className="flex items-center justify-center h-[38px] px-4 bg-white border border-vailo-teal/30 rounded-lg text-sm font-medium text-vailo-teal hover:bg-white/80 disabled:opacity-50"
                >
                  {isLocaleTranslating ? (
                    <Loader2Icon size={16} className="mr-2 animate-spin" />
                  ) : (
                    <Sparkles size={16} className="mr-2" />
                  )}
                  Auto-translate from {localeSettings.primaryLocale.toUpperCase()}
                </button>
              )}
            </div>
            <ContentLocaleTabs
              enabledLocales={localeSettings.enabledLocales}
              primaryLocale={localeSettings.primaryLocale}
              activeLocale={localeEditor.contentLocale}
              onChange={localeEditor.setContentLocale}
              languageOptions={languageOptions}
            />
          </div>

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
              <input
                type="text"
                required
                value={localeEditor.getValue('name')}
                onChange={(e) => {
                  localeEditor.setValue('name', e.target.value);
                  if (localeEditor.contentLocale === localeSettings.primaryLocale) {
                    setFormData((prev) => ({ ...prev, name: e.target.value }));
                  }
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg admin-input outline-none"
              />
            </div>
            
            <div className="md:col-span-2">
              {localGemsCategoryDocs.length > 0 ? (
                <CategoryPillSelector
                  label="Categories * (select all that apply)"
                  options={categoryPillOptions}
                  isSelected={(value) =>
                    categorySelectionIncludes(
                      normalizedGemCategories,
                      value,
                      categoryCatalogDocs,
                      localeSettings.primaryLocale
                    )
                  }
                  onToggle={handleCategoryPillToggle}
                  colorClass="blue"
                />
              ) : (
                <p className="text-sm text-red-600 font-medium">
                  No area categories found. Add them under Area Functionality → Local Gems Categories.
                </p>
              )}
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
              <textarea
                value={localeEditor.getValue('description')}
                onChange={(e) => {
                  localeEditor.setValue('description', e.target.value);
                  if (localeEditor.contentLocale === localeSettings.primaryLocale) {
                    setFormData((prev) => ({ ...prev, description: e.target.value }));
                  }
                }}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg admin-input outline-none resize-none"
                placeholder="Why do you recommend this place?"
              />
            </div>

            {/* 7. PERFECTED PHOTO GALLERY WITH GOOGLE MEMORY */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">Photo * (Select one or upload)</label>
              
              <div className="flex flex-col sm:flex-row gap-6 items-start p-4 bg-gray-50 border border-gray-200 rounded-xl">
                
                {/* Active Photo Display */}
                <div className="w-40 h-28 rounded-lg bg-white border-2 border-gray-300 overflow-hidden flex items-center justify-center shrink-0">
                  {formData.photoUrl ? (
                    <MirroredPhotoImg
                      src={formData.photoUrl}
                      className="w-full h-full object-cover block"
                      mirrorContext={{
                        country: propertyAreaContext?.country,
                        areaId: propertyAreaContext?.areaId,
                        docId: editingGemId || undefined,
                      }}
                    />
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
            <div className="md:col-span-2 flex flex-col sm:flex-row flex-wrap gap-6 pt-4 border-t border-gray-100">
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