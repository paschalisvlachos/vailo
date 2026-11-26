import { useState, useEffect, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, cloudFunctions } from '../../../lib/firebase';
import { useToast } from '../../../context/ToastContext';
import { ArrowLeft, Plus, MapPin, Wand2, Star, Image as ImageIcon, Pencil, Trash2, Map as MapIcon, Loader2, Building, Sparkles, Copy, ClipboardPaste, X } from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { httpsCallableMessage } from '../../../lib/callableError';
import { PLACES_USAGE_CALLER } from '../../../lib/placesApiUsageCallers';
import AdminPageHeader, {
  AdminButton,
  AdminCard,
  AdminEmptyState,
  AdminLabel,
  AdminSelect,
} from '../../../components/admin/AdminPageHeader';
import ContentLocaleTabs from '../../../components/admin/ContentLocaleTabs';
import { usePlatformLanguages } from '../../../hooks/usePlatformLanguages';
import { useContentLocaleEditor } from '../../../hooks/useContentLocaleEditor';
import { translateContentFields } from '../../../lib/adminContentTranslate';
import { resolveLocalizedString } from '../../../lib/propertyContentLocales';
import { usePropertyContentLocaleSettings } from '../../../hooks/usePropertyContentLocaleSettings';
import { usePropertyListingQuery } from '../../../hooks/usePropertyListingQuery';
import { Languages, Loader2 as Loader2Icon } from 'lucide-react';
import {
  categoryPrimaryName,
  gemCategoryPrimaries,
  normalizeCategorySelectionList,
} from '../../../lib/categoryLocale';
import HierarchicalCategoryPillSelector from '../../../components/admin/HierarchicalCategoryPillSelector';
import ListingLocationPinMap from '../../../components/admin/ListingLocationPinMap';
import { isHikingTrailsCategory } from '../../../lib/localTrailsGuest';
import { buildAdminCategoryHierarchy } from '../../../lib/categoryHierarchy';
import { resolvePropertyTypeAreaContext } from '../../../lib/listingAreaContext';
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

function normalizeCategoryNeedle(raw: string): string {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Only accept strong matches — exact primary/label (case-insensitive). No fuzzy guesses. */
function resolveExactCategoryMatches(
  raws: string[],
  options: { value: string; label: string }[]
): string[] {
  if (raws.length === 0 || options.length === 0) return [];

  const byKey = new Map<string, string>();
  for (const o of options) {
    const valueKey = normalizeCategoryNeedle(o.value);
    const labelKey = normalizeCategoryNeedle(o.label);
    if (valueKey) byKey.set(valueKey, o.value);
    if (labelKey) byKey.set(labelKey, o.value);
  }

  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of raws) {
    const key = normalizeCategoryNeedle(raw);
    if (!key) continue;
    const value = byKey.get(key);
    if (!value || seen.has(value.toLowerCase())) continue;
    seen.add(value.toLowerCase());
    out.push(value);
  }
  return out;
}

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
  const propertyTypeIds = useMemo(() => propertyTypes.map((type) => type.id as string), [propertyTypes]);
  const { listingId: selectedTypeId, setListingId: setSelectedTypeId } = usePropertyListingQuery({
    validTypeIds: propertyTypeIds,
  });
  
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

  const gemAssignableCategoryDocs = useMemo(
    () =>
      localGemsCategoryDocs.filter(
        (c) => !isHikingTrailsCategory(categoryPrimaryName(c.data, localeSettings.primaryLocale))
      ),
    [localGemsCategoryDocs, localeSettings.primaryLocale]
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
      buildAdminCategoryHierarchy(
        gemAssignableCategoryDocs,
        localeEditor.contentLocale,
        localeSettings.primaryLocale
      ).selectableOptions.map((opt) => ({ value: opt.primary, label: opt.label })),
    [gemAssignableCategoryDocs, localeEditor.contentLocale, localeSettings.primaryLocale]
  );

  const handleGemCategoriesChange = (next: string[]) => {
    const normalized = normalizeCategorySelectionList(
      next,
      categoryCatalogDocs,
      localeSettings.primaryLocale
    );
    setFormData((prev) => ({
      ...prev,
      categories: normalized,
      category: normalized[0] || '',
    }));
  };

  // 1. Fetch Area Context from the selected listing (real Area Functionality id)
  useEffect(() => {
    if (!propertyId) return;
    let cancelled = false;

    const fetchAreaContext = async () => {
      const selectedType = propertyTypes.find((t) => t.id === selectedTypeId);
      const country =
        String(selectedType?.country || property?.country || 'Greece').trim() || 'Greece';
      const areaName = String(
        selectedType?.city || selectedType?.area || property?.city || property?.area || ''
      ).trim();

      if (!areaName) {
        if (!cancelled) setPropertyAreaContext(null);
        return;
      }

      const { ctx } = await resolvePropertyTypeAreaContext({ country, city: areaName });
      if (cancelled) return;

      if (ctx) {
        setPropertyAreaContext({
          country: ctx.country,
          areaName: ctx.masterArea,
          areaId: ctx.areaId,
        });
        return;
      }

      // Fallback slug if area docs are still warming up
      setPropertyAreaContext({
        country,
        areaName,
        areaId: areaName.toLowerCase().replace(/\s+/g, '-'),
      });
    };

    void fetchAreaContext();
    return () => {
      cancelled = true;
    };
  }, [property, propertyId, propertyTypes, selectedTypeId]);

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
    });
    return () => unsubTypes();
  }, [propertyId]);

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

  const resolveDrivingDistance = async (lat: string, lng: string) => {
    const selectedTypeData = propertyTypes.find((pt) => pt.id === selectedTypeId);
    const refLat = selectedTypeData?.latitude || property?.latitude;
    const refLng = selectedTypeData?.longitude || property?.longitude;
    if (!refLat || !refLng || !lat || !lng) return { distanceKm: '', distanceTime: '' };
    const routeData = await fetchGlobalDrivingRoute(
      String(refLat),
      String(refLng),
      String(lat),
      String(lng)
    );
    return routeData
      ? { distanceKm: routeData.distanceKm, distanceTime: routeData.distanceTime }
      : { distanceKm: '', distanceTime: '' };
  };

  // --- AI MAGIC FILL (short links + AI category + AI description) ---
  const handleMagicFill = async () => {
    const url = formData.googleMapsUrl.trim();
    if (!url) {
      toast.warning('Please paste a Google Maps URL first.');
      return;
    }
    if (!propertyAreaContext) {
      toast.warning('Area data missing. Ensure your property listing has a city / area set.');
      return;
    }
    if (categoryPillOptions.length === 0) {
      toast.warning(
        'No area categories found. Add them under Area Functionality → Local Gems Categories first.'
      );
      return;
    }
    setIsMagicFilling(true);

    try {
      const placeNameMatch = url.match(/\/place\/([^/?@]+)/);
      const placeNameFallback = placeNameMatch?.[1]
        ? decodeURIComponent(placeNameMatch[1].replace(/\+/g, ' '))
        : '';

      // Pass the raw URL (incl. maps.app.goo.gl) — Cloud Function expands short links.
      const getGooglePlaceDetails = httpsCallable(cloudFunctions, 'getGooglePlaceDetails', {
        timeout: 120000,
      });
      const result = await getGooglePlaceDetails({
        searchQuery: url,
        fallbackName: placeNameFallback,
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

      const latStr = googleData.latitude != null ? String(googleData.latitude) : '';
      const lngStr = googleData.longitude != null ? String(googleData.longitude) : '';
      const route = latStr && lngStr ? await resolveDrivingDistance(latStr, lngStr) : null;

      const placeLabel = String(googleData.name || placeNameFallback || 'this place').trim();
      const gType = String(googleData.category || '')
        .replace(/_/g, ' ')
        .trim();
      const googleDescription = String(googleData.description || '').trim();
      const categoryNames = categoryPillOptions.map((o) => o.value).filter(Boolean);

      let matchedCategories: string[] = [];
      let finalDescription = googleDescription;
      let aiError = '';

      // Server-side Gemini (bypasses client Firebase AI App Check / Vertex 401)
      try {
        const fillLocalGemMagicAi = httpsCallable(cloudFunctions, 'fillLocalGemMagicAi', {
          timeout: 120000,
        });
        const aiResult = await fillLocalGemMagicAi({
          placeName: placeLabel,
          googleType: gType,
          areaName: propertyAreaContext.areaName,
          country: propertyAreaContext.country,
          categories: categoryNames,
          needDescription: !googleDescription,
        });
        const aiData = (aiResult.data || {}) as {
          categories?: string[];
          description?: string;
        };
        const rawCats = Array.isArray(aiData.categories)
          ? aiData.categories.filter((c): c is string => typeof c === 'string' && Boolean(c.trim()))
          : [];
        matchedCategories = resolveExactCategoryMatches(rawCats, categoryPillOptions);
        if (!googleDescription && String(aiData.description || '').trim()) {
          finalDescription = String(aiData.description).trim();
        }
      } catch (e) {
        console.error('Magic Fill AI callable failed:', e);
        aiError = httpsCallableMessage(e, 'AI fill failed. Try again in a moment.');
      }

      // Prefer 0 categories over a weak/non-exact match
      const nextCategories =
        matchedCategories.length > 0
          ? normalizeCategorySelectionList(
              matchedCategories,
              categoryCatalogDocs,
              localeSettings.primaryLocale
            )
          : [];

      const primaryName = placeLabel === 'this place' ? '' : placeLabel;
      const primaryDescription = finalDescription.trim();
      const resolvedMapsUrl = String(googleData.googleMapsUrl || url).trim();
      const resolvedName = primaryName || formData.name;
      const resolvedDescription = primaryDescription || formData.description;

      // Set coordinates first so ListingLocationPinMap does not Nominatim-geocode
      // the place name and briefly flash a wrong pin.
      setFormData((prev) => ({
        ...prev,
        name: resolvedName || prev.name,
        categories: nextCategories,
        category: nextCategories[0] || '',
        rating: googleData.rating != null ? String(googleData.rating) : prev.rating,
        description: resolvedDescription || prev.description,
        latitude: latStr || prev.latitude,
        longitude: lngStr || prev.longitude,
        distanceKm: route?.distanceKm || prev.distanceKm,
        distanceTime: route?.distanceTime || prev.distanceTime,
        googlePlaceId: googleData.googlePlaceId || prev.googlePlaceId,
        googleMapsUrl: resolvedMapsUrl || prev.googleMapsUrl,
        photoUrl: googleData.photoUrl || prev.photoUrl,
      }));

      localeEditor.setContentLocale(localeSettings.primaryLocale);
      localeEditor.applyPrimaryFields({
        name: resolvedName,
        description: resolvedDescription,
      });

      if (googleData.photoUrl) {
        setGooglePhoto(googleData.photoUrl);
        setImagePreview(null);
        setImageFile(null);
      }

      if (aiError && nextCategories.length === 0 && !primaryDescription) {
        toast.error(aiError);
      } else if (nextCategories.length === 0 && !primaryDescription) {
        toast.warning(
          aiError
            ? `Place loaded, but AI did not fill category/description (${aiError}).`
            : 'Place loaded — pick categories and add a description manually.'
        );
      } else if (nextCategories.length === 0) {
        toast.warning(
          aiError
            ? `Description filled. Categories skipped (${aiError}).`
            : 'Description filled — no confident category match. Pick categories manually.'
        );
      } else if (!primaryDescription) {
        toast.warning(
          aiError
            ? `Categories filled. Description failed (${aiError}).`
            : 'Categories filled — add a description manually.'
        );
      } else {
        toast.success(
          `Place details filled (${nextCategories.length} categor${nextCategories.length === 1 ? 'y' : 'ies'}).`
        );
      }
    } catch (error) {
      console.error('Magic Fill Error:', error);
      toast.error(
        httpsCallableMessage(
          error,
          'Could not load this place. Try again, or paste a full Google Maps place link.'
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
      <div>
        <AdminPageHeader
          title="Local Gems"
          description="Curated places guests can explore near this property."
          icon={<MapIcon size={24} />}
        />
        <AdminEmptyState
          icon={<Building size={28} />}
          title="No property listings yet"
          description="Local gems are assigned to a listing. Create a property listing first, then come back to add gems."
        />
      </div>
    );
  }

  const selectedType = propertyTypes.find((t) => t.id === selectedTypeId);

  // --- UI RENDERING ---
  if (!isFormOpen) {
    return (
      <div>
        <AdminPageHeader
          title="Local Gems"
          description={
            propertyAreaContext
              ? `Recommendations for guests near ${propertyAreaContext.areaName}.`
              : 'Curated restaurants, beaches, and sights for your guests.'
          }
          icon={<MapIcon size={24} />}
          action={
            <div className="flex flex-wrap items-center gap-2">
              {copiedClip ? (
                <AdminButton type="button" variant="secondary" onClick={() => setPasteModalOpen(true)}>
                  <ClipboardPaste size={16} />
                  Paste {copiedClip.gems.length} copied
                </AdminButton>
              ) : null}
              <AdminButton type="button" variant="accent" onClick={openAddForm}>
                <Plus size={16} />
                Add gem
              </AdminButton>
            </div>
          }
        />

        <AdminCard className="p-4 mb-5">
          <div className="min-w-0">
            <AdminLabel htmlFor="local-gems-listing">Listing</AdminLabel>
            <AdminSelect
              id="local-gems-listing"
              value={selectedTypeId}
              onChange={(e) => setSelectedTypeId(e.target.value)}
            >
              {propertyTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.propertyTypeName}
                </option>
              ))}
            </AdminSelect>
            <p className="text-xs text-gray-500 mt-1.5">
              Gems are saved per listing — switch units to manage each one.
            </p>
          </div>
        </AdminCard>

        {copiedClip ? (
          <AdminCard className="p-4 mb-4 border-vailo-teal/25 bg-vailo-teal/5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-vailo-dark">
                {copiedClip.gems.length} gem{copiedClip.gems.length === 1 ? '' : 's'} ready to paste
                {copiedClip.sourceListingName ? ` from ${copiedClip.sourceListingName}` : ''}
              </span>
              <AdminButton type="button" onClick={() => setPasteModalOpen(true)}>
                <ClipboardPaste size={14} />
                Paste to listings
              </AdminButton>
              <AdminButton type="button" variant="secondary" onClick={handleClearCopiedGems}>
                <X size={14} />
                Clear
              </AdminButton>
            </div>
          </AdminCard>
        ) : null}

        {selectedGemIds.size > 0 ? (
          <AdminCard className="p-4 mb-4 border-vailo-teal/25 bg-vailo-teal/5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-vailo-dark">
                {selectedGemIds.size} selected
              </span>
              <AdminButton type="button" onClick={handleCopySelectedGems}>
                <Copy size={14} />
                Copy selected
              </AdminButton>
              <AdminButton
                type="button"
                variant="secondary"
                onClick={() => setSelectedGemIds(new Set())}
              >
                Clear selection
              </AdminButton>
            </div>
          </AdminCard>
        ) : null}

        {gems.length === 0 ? (
          <AdminEmptyState
            icon={<MapIcon size={28} />}
            title="No local gems yet"
            description="Add restaurants, beaches, and sights so guests get a curated guide for this listing."
            action={
              <AdminButton type="button" variant="accent" onClick={openAddForm}>
                <Plus size={16} />
                Add gem
              </AdminButton>
            }
          />
        ) : (
          <AdminCard className="overflow-hidden">
            <div className="admin-table-wrap border-0">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th className="w-10">
                      <input
                        type="checkbox"
                        checked={allGemsSelected}
                        onChange={toggleSelectAllGems}
                        aria-label={allGemsSelected ? 'Deselect all gems' : 'Select all gems'}
                        className="h-4 w-4 rounded border-gray-300 text-vailo-teal focus:ring-vailo-teal/20"
                      />
                    </th>
                    <th>Gem</th>
                    <th>Category</th>
                    <th className="text-center">Rating</th>
                    <th>Distance</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {gems.map((gem) => (
                    <tr key={gem.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedGemIds.has(gem.id)}
                          onChange={() => toggleGemSelection(gem.id)}
                          aria-label={`Select ${gem.name}`}
                          className="h-4 w-4 rounded border-gray-300 text-vailo-teal focus:ring-vailo-teal/20"
                        />
                      </td>
                      <td>
                        <div className="flex items-center min-w-0">
                          {gem.photoUrl ? (
                            <MirroredPhotoImg
                              src={gem.photoUrl}
                              alt={gem.name}
                              className="h-10 w-10 rounded-lg object-cover mr-3 border border-[#e1e1e1] shrink-0"
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
                            <div className="h-10 w-10 rounded-lg bg-gray-50 flex items-center justify-center mr-3 border border-[#e1e1e1] shrink-0">
                              <ImageIcon size={16} className="text-gray-400" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="font-medium text-vailo-dark truncate">
                              {resolveLocalizedString(
                                gem,
                                'name',
                                localeSettings.primaryLocale,
                                localeSettings.primaryLocale
                              ) || gem.name}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="text-gray-600">
                        {gemCategoryPrimaries(
                          gem,
                          categoryCatalogDocs,
                          localeSettings.primaryLocale
                        ).join(' · ') || '—'}
                      </td>
                      <td className="text-center">
                        {gem.rating ? (
                          <span className="inline-flex items-center justify-center font-medium text-vailo-dark">
                            <Star size={14} className="text-vailo-gold fill-current mr-1" />
                            {gem.rating}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="text-gray-600 whitespace-nowrap">
                        {gem.distanceKm
                          ? `${gem.distanceKm} km${gem.distanceTime ? ` · ${gem.distanceTime}` : ''}`
                          : '—'}
                      </td>
                      <td className="text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-1">
                          <AdminButton
                            type="button"
                            variant="ghost"
                            onClick={() => handleEditClick(gem)}
                            aria-label={`Edit ${gem.name}`}
                          >
                            <Pencil size={16} />
                          </AdminButton>
                          <AdminButton
                            type="button"
                            variant="danger"
                            onClick={() => void handleDeleteClick(gem.id, gem.name)}
                            aria-label={`Delete ${gem.name}`}
                          >
                            <Trash2 size={16} />
                          </AdminButton>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </AdminCard>
        )}

        {pasteModalOpen && copiedClip ? (
          <CopyGemsModal
            clip={copiedClip}
            excludeSource={{
              propertyId: copiedClip.sourcePropertyId,
              typeId: copiedClip.sourceTypeId,
            }}
            onClose={() => setPasteModalOpen(false)}
            onPasted={handlePasteComplete}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="flex items-center mb-6">
        <button
          type="button"
          onClick={closeAndResetForm}
          className="p-2 mr-3 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
          aria-label="Back to local gems"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="min-w-0">
          <h3 className="text-xl font-bold text-vailo-dark">
            {editingGemId ? 'Edit local gem' : 'Add local gem'}
          </h3>
          <p className="text-gray-500 text-sm mt-1">
            For{' '}
            <span className="font-semibold text-vailo-teal">
              {selectedType?.propertyTypeName || 'this listing'}
            </span>
          </p>
        </div>
      </div>

      <form onSubmit={submitGem} className="space-y-5">
        <AdminCard className="p-5 sm:p-6 space-y-2">
          <h4 className="text-sm font-bold text-vailo-dark flex items-center gap-2">
            <Wand2 size={16} className="text-vailo-teal" />
            Smart import
          </h4>
          <p className="text-sm text-gray-500 max-w-2xl leading-relaxed">
            Paste a Google Maps link and use AI Magic Fill to pull name, coordinates, distance, and a
            short guest-facing description for this listing.
          </p>
        </AdminCard>

        <AdminCard className="p-5 sm:p-6 space-y-6">
          {localeSettings.enabledLocales.length > 1 ? (
            <div className="rounded-xl border border-[#e1e1e1] bg-vailo-surface-elevated/60 p-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-vailo-dark flex items-center gap-2">
                    <Languages size={16} /> Content language
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Edit each enabled language. Configure languages in Settings.
                  </p>
                </div>
                {localeEditor.contentLocale !== localeSettings.primaryLocale && (
                  <AdminButton
                    type="button"
                    variant="secondary"
                    onClick={handleAutoTranslateLocale}
                    disabled={isLocaleTranslating}
                  >
                    {isLocaleTranslating ? (
                      <Loader2Icon size={16} className="animate-spin" />
                    ) : (
                      <Sparkles size={16} />
                    )}
                    Auto-translate from {localeSettings.primaryLocale.toUpperCase()}
                  </AdminButton>
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
          ) : null}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* 1. Maps Link & Smart Calc */}
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-gray-700 mb-1">Google Maps Location Link *</label>
              <div className="flex gap-3 items-end">
                <div className="relative flex-1">
                  <MapPin className="absolute left-3 top-2.5 text-gray-400" size={18} />
                  <input type="url" required name="googleMapsUrl" value={formData.googleMapsUrl} onChange={handleChange} placeholder="https://www.google.com/maps/place/..." className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg admin-input outline-none bg-white" />
                </div>
                <AdminButton
                  type="button"
                  onClick={handleMagicFill}
                  disabled={isMagicFilling || !propertyAreaContext}
                  className="h-[42px] shrink-0"
                >
                  {isMagicFilling ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Sparkles size={16} />
                  )}
                  {isMagicFilling ? 'Filling…' : 'AI Magic Fill'}
                </AdminButton>
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
                <HierarchicalCategoryPillSelector
                  label="Categories * (select all that apply)"
                  categoryDocs={gemAssignableCategoryDocs}
                  selectedPrimaries={normalizedGemCategories}
                  onSelectedChange={handleGemCategoriesChange}
                  locale={localeEditor.contentLocale}
                  primaryLocale={localeSettings.primaryLocale}
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

            {/* 6. Map pin (coordinates are pin-only, not typed) */}
            <div className="md:col-span-2">
              <ListingLocationPinMap
                latitude={formData.latitude}
                longitude={formData.longitude}
                addressLine={formData.name}
                city={propertyAreaContext?.areaName || ''}
                country={propertyAreaContext?.country || ''}
                onChange={({ latitude, longitude }) => {
                  setFormData((prev) => ({ ...prev, latitude, longitude }));
                  void resolveDrivingDistance(latitude, longitude).then((route) => {
                    if (!route.distanceKm && !route.distanceTime) return;
                    setFormData((prev) => ({
                      ...prev,
                      distanceKm: route.distanceKm || prev.distanceKm,
                      distanceTime: route.distanceTime || prev.distanceTime,
                    }));
                  });
                }}
              />
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

          </div>
        </AdminCard>

        <div className="flex flex-wrap justify-end gap-3">
          <AdminButton type="button" variant="secondary" onClick={closeAndResetForm}>
            Cancel
          </AdminButton>
          <AdminButton type="submit" disabled={isSubmitting || isUploadingImage}>
            {(isSubmitting || isUploadingImage) && <Loader2 size={16} className="animate-spin" />}
            {isUploadingImage
              ? 'Uploading image…'
              : isSubmitting
                ? 'Saving…'
                : editingGemId
                  ? 'Update gem'
                  : 'Add gem'}
          </AdminButton>
        </div>
      </form>
    </div>
  );
}