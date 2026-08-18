import { useState, useEffect, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getGenerativeModel } from "firebase/ai";
import { getFunctions, httpsCallable } from 'firebase/functions';
import { ai, db, storage } from '../../../lib/firebase';
import { useToast } from '../../../context/ToastContext';
import { Plus, Image as ImageIcon, Pencil, Trash2, Briefcase, Loader2, MapPin, Wand2, Link as LinkIcon, Phone, Mail, MessageCircle, Languages, Sparkles, Ticket, Building, Copy, ClipboardPaste, X } from 'lucide-react';
import CopyFeaturesModal from '../../../components/admin/CopyFeaturesModal';
import {
  clearCopiedFeatures,
  readCopiedFeatures,
  writeCopiedFeatures,
  type CopiedPropertyFeatures,
} from '../../../lib/propertyFeatureCopy';
import { migratePropertyFeaturesToFirstListing } from '../../../lib/propertyFeatureMigration';
import ContentLocaleTabs from '../../../components/admin/ContentLocaleTabs';
import { usePlatformLanguages } from '../../../hooks/usePlatformLanguages';
import { useContentLocaleEditor } from '../../../hooks/useContentLocaleEditor';
import { translateContentFields } from '../../../lib/adminContentTranslate';
import { PLACES_USAGE_CALLER } from '../../../lib/placesApiUsageCallers';
import { usePropertyContentLocaleSettings } from '../../../hooks/usePropertyContentLocaleSettings';
import { usePropertyListingQuery } from '../../../hooks/usePropertyListingQuery';
import {
  categoryPrimaryName,
  resolveCategoryLabel,
  normalizeCategorySelectionList,
  categorySelectionIncludes,
} from '../../../lib/categoryLocale';
import { normalizeLocaleCode } from '../../../lib/propertyContentLocales';
import { ensurePersistablePhotoUrl } from '../../../lib/adminPhotoUrl';
import MirroredPhotoImg from '../../../components/shared/MirroredPhotoImg';

export default function Features() {
  const { property, propertyId } = useOutletContext<{ property: any, propertyId: string }>();
  const toast = useToast();
  
  const [propertyAreaContext, setPropertyAreaContext] = useState<{country: string, areaId: string, areaName: string} | null>(null);
  const [propertyTypes, setPropertyTypes] = useState<any[]>([]);
  const propertyTypeIds = useMemo(() => propertyTypes.map((type) => type.id as string), [propertyTypes]);
  const { listingId: selectedTypeId, setListingId: setSelectedTypeId } = usePropertyListingQuery({
    validTypeIds: propertyTypeIds,
  });
  
  const [features, setFeatures] = useState<any[]>([]);
  const [featuresCategories, setFeaturesCategories] = useState<any[]>([]);
  const [localGemsCategories, setLocalGemsCategories] = useState<
    { id: string; data: Record<string, unknown> }[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingFeatureId, setEditingFeatureId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMagicFilling, setIsMagicFilling] = useState(false);
  const [isGeneratingDesc, setIsGeneratingDesc] = useState(false);

  // 🔥 UPGRADED PHOTO MEMORY STATE 🔥
  const [customFile, setCustomFile] = useState<File | null>(null);
  const [customPreview, setCustomPreview] = useState<string | null>(null);
  const [googlePhoto, setGooglePhoto] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const initialFormState = {
    name: '',
    categories: [] as string[],
    agreement: '0', 
    description: '',
    googleMapsUrl: '',
    latitude: '',
    longitude: '',
    phoneNumber: '',
    whatsapp: '',
    email: '',
    website: '',
    voucherCode: '',
    photoUrl: '', // This stores the currently active/selected photo
    isMainPage: false,
    isLocal: false,
    experienceTypes: [] as string[]
  };

  const [formData, setFormData] = useState(initialFormState);
  const [editingSourceDoc, setEditingSourceDoc] = useState<Record<string, unknown> | null>(null);
  const [isLocaleTranslating, setIsLocaleTranslating] = useState(false);
  const [selectedFeatureIds, setSelectedFeatureIds] = useState<Set<string>>(new Set());
  const [copiedClip, setCopiedClip] = useState<CopiedPropertyFeatures | null>(() => readCopiedFeatures());
  const [pasteModalOpen, setPasteModalOpen] = useState(false);
  const [migrationDone, setMigrationDone] = useState(false);

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

  const featureCategoryPrimaryName = (cat: { id: string; [key: string]: unknown }) =>
    categoryPrimaryName(cat as Record<string, unknown>, localeSettings.primaryLocale) || String(cat.name || '');

  const featureCategoryLabel = (cat: { id: string; [key: string]: unknown }) =>
    resolveCategoryLabel(cat as Record<string, unknown>, localeEditor.contentLocale, localeSettings.primaryLocale) ||
    featureCategoryPrimaryName(cat);

  const localGemCategoryPrimaryName = (cat: { id: string; data: Record<string, unknown> }) =>
    categoryPrimaryName(cat.data, localeSettings.primaryLocale);

  const localGemCategoryLabel = (cat: { id: string; data: Record<string, unknown> }) =>
    resolveCategoryLabel(cat.data, localeEditor.contentLocale, localeSettings.primaryLocale) ||
    localGemCategoryPrimaryName(cat);

  const featureCategoryPillOptions = useMemo(
    () =>
      featuresCategories.map((cat) => ({
        value: featureCategoryPrimaryName(cat),
        label: featureCategoryLabel(cat),
      })),
    [featuresCategories, localeEditor.contentLocale, localeSettings.primaryLocale]
  );

  const localGemCategoryPillOptions = useMemo(
    () =>
      localGemsCategories.map((cat) => ({
        value: localGemCategoryPrimaryName(cat),
        label: localGemCategoryLabel(cat),
      })),
    [localGemsCategories, localeEditor.contentLocale, localeSettings.primaryLocale]
  );

  const featureCategoryDocs = useMemo(
    () => featuresCategories as Record<string, unknown>[],
    [featuresCategories]
  );

  const localGemCategoryDocs = useMemo(
    () => localGemsCategories.map((c) => c.data),
    [localGemsCategories]
  );

  const normalizedFeatureCategories = useMemo(
    () =>
      normalizeCategorySelectionList(
        formData.categories,
        featureCategoryDocs,
        localeSettings.primaryLocale
      ),
    [formData.categories, featureCategoryDocs, localeSettings.primaryLocale]
  );

  const normalizedExperienceTypes = useMemo(
    () =>
      normalizeCategorySelectionList(
        formData.experienceTypes,
        localGemCategoryDocs,
        localeSettings.primaryLocale
      ),
    [formData.experienceTypes, localGemCategoryDocs, localeSettings.primaryLocale]
  );

  useEffect(() => {
    if (!isFormOpen) return;
    const sameSelection = (a: string[], b: string[]) => {
      if (a.length !== b.length) return false;
      const setA = new Set(a.map((s) => s.toLowerCase()));
      return b.every((s) => setA.has(s.toLowerCase()));
    };
    const categoriesChanged = !sameSelection(normalizedFeatureCategories, formData.categories);
    const gemsChanged = !sameSelection(normalizedExperienceTypes, formData.experienceTypes);
    if (!categoriesChanged && !gemsChanged) return;
    setFormData((prev) => ({
      ...prev,
      categories: normalizedFeatureCategories,
      experienceTypes: normalizedExperienceTypes,
    }));
  }, [
    isFormOpen,
    normalizedFeatureCategories,
    normalizedExperienceTypes,
    formData.categories,
    formData.experienceTypes,
  ]);

  const isPrimaryLocaleTab =
    normalizeLocaleCode(localeEditor.contentLocale) === normalizeLocaleCode(localeSettings.primaryLocale);

  const agreementDisplay =
    (formData.agreement ?? '').trim() === '' ? '0%' : `${formData.agreement}%`;

  // --- DATA FETCHING ---
  
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

  useEffect(() => {
    if (!propertyAreaContext) return;
    const { country, areaId } = propertyAreaContext;

    const catUnsub = onSnapshot(collection(db, 'countries', country, 'areas', areaId, 'featuresCategories'), (snapshot) => {
      const fetchedCats = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      fetchedCats.sort((a: { id: string; [key: string]: unknown }, b: { id: string; [key: string]: unknown }) =>
        featureCategoryPrimaryName(a).localeCompare(featureCategoryPrimaryName(b))
      );
      setFeaturesCategories(fetchedCats);
    });

    const gemsCatUnsub = onSnapshot(collection(db, 'countries', country, 'areas', areaId, 'localGemsCategories'), (snapshot) => {
      const fetched = snapshot.docs.map((d) => ({
        id: d.id,
        data: d.data() as Record<string, unknown>,
      }));
      fetched.sort((a, b) =>
        categoryPrimaryName(a.data, localeSettings.primaryLocale).localeCompare(
          categoryPrimaryName(b.data, localeSettings.primaryLocale)
        )
      );
      setLocalGemsCategories(fetched);
    });

    return () => { catUnsub(); gemsCatUnsub(); };
  }, [propertyAreaContext, localeSettings.primaryLocale]);

  useEffect(() => {
    if (!propertyId) return;
    const unsubTypes = onSnapshot(collection(db, 'properties', propertyId, 'propertyTypes'), (snapshot) => {
      const typesData = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setPropertyTypes(typesData);
    });
    return () => unsubTypes();
  }, [propertyId]);

  useEffect(() => {
    if (!propertyId || migrationDone || propertyTypes.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const result = await migratePropertyFeaturesToFirstListing(propertyId);
        if (cancelled) return;
        if (result.deduped > 0) {
          toast.success(
            `Removed ${result.deduped} duplicate feature${result.deduped === 1 ? '' : 's'}.`
          );
        }
        if (result.migrated > 0) {
          toast.success(
            `Moved ${result.migrated} existing feature${result.migrated === 1 ? '' : 's'} to ${propertyTypes[0]?.propertyTypeName || 'the first listing'}.`
          );
          if (result.firstTypeId) setSelectedTypeId(result.firstTypeId);
        }
      } catch (err) {
        console.error('Feature migration failed:', err);
      } finally {
        if (!cancelled) setMigrationDone(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [propertyId, migrationDone, propertyTypes, toast]);

  useEffect(() => {
    setSelectedFeatureIds(new Set());
  }, [selectedTypeId]);

  useEffect(() => {
    if (!propertyId || !selectedTypeId) {
      setFeatures([]);
      setIsLoading(false);
      return;
    }
    const featsRef = collection(
      db,
      'properties',
      propertyId,
      'propertyTypes',
      selectedTypeId,
      'features'
    );
    const unsubscribe = onSnapshot(featsRef, (snapshot) => {
      const fetchedFeatures = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setFeatures(fetchedFeatures);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, [propertyId, selectedTypeId]);

  const selectedFeatures = useMemo(
    () => features.filter((f) => selectedFeatureIds.has(f.id)),
    [features, selectedFeatureIds]
  );
  const allFeaturesSelected = features.length > 0 && selectedFeatureIds.size === features.length;

  const toggleFeatureSelection = (featureId: string) => {
    setSelectedFeatureIds((prev) => {
      const next = new Set(prev);
      if (next.has(featureId)) next.delete(featureId);
      else next.add(featureId);
      return next;
    });
  };

  const toggleSelectAllFeatures = () => {
    if (allFeaturesSelected) {
      setSelectedFeatureIds(new Set());
    } else {
      setSelectedFeatureIds(new Set(features.map((f) => f.id)));
    }
  };

  const handleCopySelectedFeatures = () => {
    if (!propertyId || !selectedTypeId || selectedFeatures.length === 0) return;
    const selectedType = propertyTypes.find((t) => t.id === selectedTypeId);
    const clip: CopiedPropertyFeatures = {
      features: selectedFeatures.map((f) => ({ ...f })),
      sourcePropertyId: propertyId,
      sourceTypeId: selectedTypeId,
      sourcePropertyName: property?.propertyName,
      sourceListingName: selectedType?.propertyTypeName,
      copiedAt: new Date().toISOString(),
    };
    writeCopiedFeatures(clip);
    setCopiedClip(clip);
    setSelectedFeatureIds(new Set());
    toast.success(
      `Copied ${clip.features.length} feature${clip.features.length === 1 ? '' : 's'}. Choose listings to paste into.`
    );
  };

  const handleClearCopiedFeatures = () => {
    clearCopiedFeatures();
    setCopiedClip(null);
    toast.success('Copied features cleared.');
  };

  const handlePasteComplete = (result: { pasted: number; skipped: number; targets: number }) => {
    if (result.pasted === 0 && result.skipped > 0) {
      toast.warning(
        `No features pasted — all ${result.skipped} already exist on the selected listing${result.targets === 1 ? '' : 's'}.`
      );
      return;
    }
    const skippedPart =
      result.skipped > 0 ? ` ${result.skipped} skipped (already on listing).` : '';
    toast.success(
      `Pasted ${result.pasted} feature${result.pasted === 1 ? '' : 's'} across ${result.targets} listing${result.targets === 1 ? '' : 's'}.${skippedPart}`
    );
  };

  const featuresCollectionPath = (typeId: string) =>
    collection(db, 'properties', propertyId, 'propertyTypes', typeId, 'features');

  const availableMasterPhotos = featuresCategories
    .filter((cat) =>
      categorySelectionIncludes(
        normalizedFeatureCategories,
        featureCategoryPrimaryName(cat),
        featureCategoryDocs,
        localeSettings.primaryLocale
      )
    )
    .flatMap((cat) => cat.photos || []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      setFormData({ ...formData, [name]: (e.target as HTMLInputElement).checked });
    } else {
      setFormData({ ...formData, [name]: value });
    }
  };

  const handlePillToggle = (
    arrayName: 'categories' | 'experienceTypes',
    value: string,
    catalogDocs: Record<string, unknown>[]
  ) => {
    setFormData((prev) => {
      const current = normalizeCategorySelectionList(
        prev[arrayName],
        catalogDocs,
        localeSettings.primaryLocale
      );
      const lower = value.toLowerCase();
      const has = current.some((c) => c.toLowerCase() === lower);
      const next = has
        ? current.filter((c) => c.toLowerCase() !== lower)
        : [...current, value];
      return { ...prev, [arrayName]: next };
    });
  };

  // --- AI MAGIC FILL ---
  const handleMagicFill = async () => {
    const url = formData.googleMapsUrl;
    if (!url) {
      toast.warning("Please paste a Google Maps URL first.");
      return;
    }
    if (!propertyAreaContext) {
      toast.warning("Property area data missing.");
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

      const functions = getFunctions();
      const getGooglePlaceDetails = httpsCallable(functions, 'getGooglePlaceDetails');
      const result = await getGooglePlaceDetails({
        searchQuery,
        area: propertyAreaContext.areaName,
        usageCaller: PLACES_USAGE_CALLER.propertyFeatures,
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

      let matchedCategory = "";
      let finalDescription = googleData.description;

      try {
        const categoryNames = featuresCategories.map((c) => featureCategoryPrimaryName(c)).join(', ');
        const gType = googleData.category?.replace(/_/g, ' ') || "local business";

        const prompt = `Act as a luxury travel concierge for ${propertyAreaContext.areaName}. We are adding "${googleData.name || placeNameFallback}" (Google classification: ${gType}).
        1. Pick the single most accurate category from our exact database list: [${categoryNames}]. If none fit well, return an empty string "".
        2. Write a short, engaging 2-sentence description explaining why guests should use or visit this.
        Return ONLY a valid JSON object in this exact format with no markdown wrappers:
        {"category": "Exact Category Name", "description": "Your 2 sentence description"}`;

        const model = getGenerativeModel(ai, { model: "gemini-2.5-flash" });
        const aiResult = await model.generateContent(prompt);
        const rawText = aiResult.response.text().replace(/```json/gi, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(rawText);

        if (parsed.category && featuresCategories.some((c) => featureCategoryPrimaryName(c) === parsed.category)) {
          matchedCategory = parsed.category;
        }
        if (parsed.description && !googleData.description) {
          finalDescription = parsed.description;
        }
      } catch (e) {
        console.log("AI JSON mapping failed, falling back to simple match.", e);
        const gTypeLower = googleData.category?.toLowerCase().replace(/_/g, ' ') || "";
        const possibleMatch = featuresCategories.find((c) => {
          const n = featureCategoryPrimaryName(c).toLowerCase();
          return gTypeLower.includes(n) || n.includes(gTypeLower);
        });
        if (possibleMatch) matchedCategory = featureCategoryPrimaryName(possibleMatch);
      }

      const primaryName = googleData.name || placeNameFallback;
      const primaryDescription = finalDescription || formData.description;
      setFormData(prev => ({
        ...prev,
        name: primaryName,
        categories: matchedCategory && !prev.categories.includes(matchedCategory) 
                      ? [...prev.categories, matchedCategory] 
                      : prev.categories,
        description: primaryDescription,
        latitude: googleData.latitude?.toString() || prev.latitude,
        longitude: googleData.longitude?.toString() || prev.longitude,
        phoneNumber: googleData.phoneNumber || prev.phoneNumber,
        website: googleData.websiteUri || prev.website,
        photoUrl: googleData.photoUrl || ''
      }));
      localeEditor.applyPrimaryFields({
        name: primaryName,
        description: primaryDescription,
      });

      if (googleData.photoUrl) {
        setGooglePhoto(googleData.photoUrl);
      }
    } catch (error) {
      console.error("Magic Fill Error:", error);
      toast.error("Could not process this link. Ensure it is a valid Google Maps place.");
    } finally {
      setIsMagicFilling(false);
    }
  };

  const handleGenerateDescription = async () => {
    if (!formData.name) {
      toast.warning("Please enter a name first.");
      return;
    }
    setIsGeneratingDesc(true);
    try {
      const cats = formData.categories.join(' and ');
      const area = propertyAreaContext?.areaName || "the local area";
      const prompt = `Write a short, luxurious 2-sentence description for a ${cats || 'feature'} called "${formData.name}" located in ${area}. Make it sound exclusive and appealing to high-end travelers. No quotes.`;
      const model = getGenerativeModel(ai, { model: "gemini-2.5-flash" });
      const result = await model.generateContent(prompt);
      const desc = result.response.text().trim();
      setFormData(prev => ({ ...prev, description: desc }));
      if (localeEditor.contentLocale === localeSettings.primaryLocale) {
        localeEditor.setValue('description', desc);
      }
      localeEditor.applyPrimaryFields({
        name: localeEditor.getPrimaryValue('name') || formData.name,
        description: desc,
      });
    } catch (e) {
      console.error(e);
      toast.error("Failed to generate description.");
    } finally { setIsGeneratingDesc(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (normalizedFeatureCategories.length === 0) {
      toast.warning("Please select at least one Category.");
      return;
    }
    if (formData.isLocal && normalizedExperienceTypes.length === 0) {
      toast.warning("Please select at least one Local Gems category for the Local tag.");
      return;
    }

    setIsSubmitting(true);
    try {
      let finalPhotoUrl = formData.photoUrl;
      
      // Only upload if the actively selected photo is the custom one they uploaded
      if (customFile && formData.photoUrl === customPreview) {
        setIsUploadingImage(true);
        const storageRef = ref(
          storage,
          `properties/${propertyId}/propertyTypes/${selectedTypeId}/features/${Date.now()}_${customFile.name}`
        );
        await uploadBytes(storageRef, customFile);
        finalPhotoUrl = await getDownloadURL(storageRef);
      } else if (finalPhotoUrl) {
        finalPhotoUrl = await ensurePersistablePhotoUrl(finalPhotoUrl, {
          country: propertyAreaContext?.country,
          areaId: propertyAreaContext?.areaId,
          docId: editingFeatureId || undefined,
        });
      }

      const featureData = {
        ...formData,
        categories: normalizedFeatureCategories,
        experienceTypes: normalizedExperienceTypes,
        ...localeEditor.buildPayload(),
        photoUrl: finalPhotoUrl,
        updatedAt: new Date().toISOString(),
      };

      if (!selectedTypeId) {
        toast.warning('Select a property listing first.');
        return;
      }

      if (editingFeatureId) {
        await updateDoc(
          doc(db, 'properties', propertyId, 'propertyTypes', selectedTypeId, 'features', editingFeatureId),
          featureData
        );
      } else {
        await addDoc(featuresCollectionPath(selectedTypeId), featureData);
      }

      closeAndResetForm();
    } catch (error) { 
      toast.error("Failed to save feature."); 
    } finally { 
      setIsSubmitting(false); 
      setIsUploadingImage(false); 
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!selectedTypeId) return;
    if (window.confirm(`Delete ${name}?`)) {
      await deleteDoc(
        doc(db, 'properties', propertyId, 'propertyTypes', selectedTypeId, 'features', id)
      );
    }
  };

  const closeAndResetForm = () => {
    setIsFormOpen(false); 
    setEditingFeatureId(null);
    setEditingSourceDoc(null);
    localeEditor.resetMaps();
    setFormData(initialFormState); 
    setCustomFile(null); 
    setCustomPreview(null);
    setGooglePhoto(null);
  };

  const openAddForm = () => {
    setEditingSourceDoc(null);
    localeEditor.resetMaps();
    setFormData(initialFormState);
    setCustomPreview(null);
    setCustomFile(null);
    setGooglePhoto(null);
    setEditingFeatureId(null);
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

  const openFeatureEdit = (feat: Record<string, unknown> & { id: string }) => {
    setEditingSourceDoc(feat);
    setFormData({
      ...initialFormState,
      ...feat,
      categories: normalizeCategorySelectionList(
        feat.categories as string[] | undefined,
        featureCategoryDocs,
        localeSettings.primaryLocale
      ),
      experienceTypes: normalizeCategorySelectionList(
        feat.experienceTypes as string[] | undefined,
        localGemCategoryDocs,
        localeSettings.primaryLocale
      ),
    } as typeof initialFormState);
    setEditingFeatureId(feat.id);
    setGooglePhoto(null);
    setCustomPreview(null);
    setIsFormOpen(true);
  };

  if (propertyTypes.length === 0) {
    return (
      <div className="text-center py-16 bg-gray-50 rounded-xl border border-dashed border-gray-200">
        <Building size={32} className="mx-auto text-gray-400 mb-3" />
        <h3 className="text-xl font-bold text-gray-900 mb-2">No Property Listings Configured</h3>
        <p className="text-gray-500 max-w-sm mx-auto mb-6">
          Features are assigned to specific units. Please go to the <b>Property Listings</b> tab and create a unit before adding features.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="bg-vailo-teal/5 border border-vailo-teal/10 rounded-xl p-4 mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h4 className="text-sm font-bold text-vailo-dark">Select Unit Level</h4>
          <p className="text-xs text-vailo-teal-hover">Features are assigned specifically to the selected property listing.</p>
        </div>
        <select
          value={selectedTypeId}
          onChange={(e) => setSelectedTypeId(e.target.value)}
          className="px-4 py-2 bg-white border border-vailo-teal/15 rounded-lg text-sm font-medium text-gray-900 outline-none focus:ring-2 focus:ring-vailo-teal/20 focus:border-vailo-teal shadow-sm min-w-[200px]"
        >
          {propertyTypes.map((type) => (
            <option key={type.id} value={type.id}>{type.propertyTypeName}</option>
          ))}
        </select>
      </div>

      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center">
            <Briefcase className="mr-3 text-vailo-teal" size={28} />
            Property Features
          </h2>
          <p className="text-gray-500 mt-1">
            Manage services and local experiences for this listing.
            {propertyAreaContext && <span className="ml-1 font-medium text-vailo-teal">(Connected to {propertyAreaContext.areaName})</span>}
          </p>
        </div>
        {!isFormOpen && (
          <div className="flex flex-wrap items-center gap-2">
            {copiedClip && (
              <button
                type="button"
                onClick={() => setPasteModalOpen(true)}
                className="flex items-center px-4 py-2 bg-white text-vailo-teal border border-vailo-teal/25 rounded-xl hover:bg-vailo-teal/5 transition-colors shadow-sm"
              >
                <ClipboardPaste size={18} className="mr-2" />
                Paste {copiedClip.features.length} copied
              </button>
            )}
            <button onClick={openAddForm} className="flex items-center px-4 py-2 bg-vailo-teal text-white text-sm font-bold rounded-xl hover:bg-vailo-teal-hover transition-colors shadow-sm">
              <Plus size={18} className="mr-2" /> Add Feature
            </button>
          </div>
        )}
      </div>

      {copiedClip && !isFormOpen && (
        <div className="flex flex-wrap items-center gap-2 mb-4 px-3 py-2 rounded-lg border border-vailo-teal/20 bg-vailo-teal/5">
          <span className="text-xs font-semibold text-vailo-teal">
            {copiedClip.features.length} feature{copiedClip.features.length === 1 ? '' : 's'} ready to paste
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
            onClick={handleClearCopiedFeatures}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            <X size={14} />
            Clear
          </button>
        </div>
      )}

      {selectedFeatureIds.size > 0 && !isFormOpen && (
        <div className="flex flex-wrap items-center gap-2 mb-4 px-3 py-2 rounded-lg border border-vailo-teal/20 bg-vailo-teal/5">
          <span className="text-xs font-semibold text-vailo-teal">
            {selectedFeatureIds.size} selected
          </span>
          <button
            type="button"
            onClick={handleCopySelectedFeatures}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-vailo-teal rounded-lg hover:bg-vailo-teal-hover"
          >
            <Copy size={14} />
            Copy selected
          </button>
          <button
            type="button"
            onClick={() => setSelectedFeatureIds(new Set())}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            Clear selection
          </button>
        </div>
      )}

      {pasteModalOpen && copiedClip && (
        <CopyFeaturesModal
          clip={copiedClip}
          excludeSource={{ propertyId, typeId: selectedTypeId }}
          onClose={() => setPasteModalOpen(false)}
          onPasted={handlePasteComplete}
        />
      )}

      {!propertyAreaContext && !isLoading && (
        <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-xl mb-6 text-sm text-yellow-800">
          <strong>Setup Required:</strong> We couldn't find an Area or City assigned to this property. Please go to the <strong>Property Listings</strong> tab and ensure you have entered a City/Area. This is required to load your global categories and enable AI Magic Fill.
        </div>
      )}

      {isFormOpen && (
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden mb-8 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="px-6 py-4 bg-vailo-teal/5 border-b border-vailo-teal/10 flex items-center justify-between">
            <h3 className="text-lg font-bold text-vailo-dark">
              {editingFeatureId ? 'Edit Feature' : 'Add New Feature'}
            </h3>
            <button type="button" onClick={closeAndResetForm} className="text-vailo-teal hover:text-vailo-teal-hover font-medium text-sm">Cancel</button>
          </div>

          <div className="p-6">
            <div className="rounded-xl border border-vailo-teal/15 bg-vailo-teal/5 p-4 space-y-3 mb-8">
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
                      <Loader2 size={16} className="mr-2 animate-spin" />
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

            {/* 1. MAGIC FILL - Fixed Alignment (items-end) */}
            <div className="flex flex-col md:flex-row gap-4 mb-8 bg-vailo-teal/5/50 p-4 rounded-xl border border-indigo-100 items-end">
              <div className="flex-1 w-full">
                <label className="block text-xs font-bold text-vailo-dark uppercase tracking-wider mb-1">Google Maps Link</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-3 text-vailo-teal/50" size={18} />
                  <input type="url" name="googleMapsUrl" value={formData.googleMapsUrl} onChange={handleChange} placeholder="Paste FULL or Short Google Maps URL here..." className="w-full pl-10 pr-4 py-2.5 bg-white border border-vailo-teal/15 rounded-lg focus:ring-2 focus:ring-vailo-teal/20 focus:border-vailo-teal outline-none text-sm" />
                </div>
              </div>
              <button type="button" onClick={handleMagicFill} disabled={isMagicFilling || !formData.googleMapsUrl || !propertyAreaContext} className="w-full md:w-auto h-[46px] px-6 bg-vailo-teal hover:bg-vailo-teal-hover text-white text-sm font-bold rounded-lg disabled:opacity-50 transition-colors shadow-sm flex items-center justify-center whitespace-nowrap">
                {isMagicFilling ? <Loader2 size={18} className="animate-spin mr-2" /> : <Wand2 size={18} className="mr-2" />}
                AI Magic Fill
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-8">
              
              {/* 2. CORE INFO */}
              <div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Feature Name *</label>
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
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg admin-input outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Agreement (Percentage) *</label>
                    {isPrimaryLocaleTab ? (
                      <div className="relative">
                        <input
                          type="number"
                          step="0.1"
                          name="agreement"
                          required
                          value={formData.agreement}
                          onChange={handleChange}
                          placeholder="0"
                          className="w-full pl-4 pr-10 py-2.5 border border-gray-300 rounded-lg admin-input outline-none"
                        />
                        <div className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none text-gray-500 font-bold">
                          %
                        </div>
                      </div>
                    ) : (
                      <div className="w-full px-4 py-2.5 bg-gray-50 border border-gray-300 rounded-lg text-gray-700 font-medium">
                        {agreementDisplay}
                      </div>
                    )}
                  </div>
                </div>

                <div className="mb-6">
                  {featuresCategories.length > 0 ? (
                    <PillSelector
                      label="Feature Categories *"
                      options={featureCategoryPillOptions}
                      isSelected={(value) =>
                        categorySelectionIncludes(
                          normalizedFeatureCategories,
                          value,
                          featureCategoryDocs,
                          localeSettings.primaryLocale
                        )
                      }
                      onToggle={(v) => handlePillToggle('categories', v, featureCategoryDocs)}
                      colorClass="blue"
                    />
                  ) : (
                     <p className="text-sm text-red-600 font-medium">No Categories found for {propertyAreaContext?.areaName || 'this area'}. Please add them in the global Area Functionality tab.</p>
                  )}
                </div>
              </div>

              {/* 3. AI DESCRIPTION */}
              <div>
                <div className="flex justify-between items-end mb-2">
                  <label className="block text-sm font-bold text-gray-700">Description *</label>
                  <button type="button" onClick={handleGenerateDescription} disabled={isGeneratingDesc || !formData.name} className="text-xs font-bold text-vailo-teal flex items-center bg-vailo-teal/5 px-3 py-1.5 rounded-lg hover:bg-vailo-gold/15 transition-colors">
                    {isGeneratingDesc ? <Loader2 size={14} className="animate-spin mr-1" /> : <Wand2 size={14} className="mr-1" />} AI Write
                  </button>
                </div>
                <textarea
                  required
                  rows={3}
                  value={localeEditor.getValue('description')}
                  onChange={(e) => {
                    localeEditor.setValue('description', e.target.value);
                    if (localeEditor.contentLocale === localeSettings.primaryLocale) {
                      setFormData((prev) => ({ ...prev, description: e.target.value }));
                    }
                  }}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg admin-input outline-none resize-y"
                />
              </div>

              {/* 4. CONTACT INFORMATION */}
              <div>
                <h3 className="text-lg font-bold border-b pb-2 mb-4 mt-8">Contact Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Phone Number</label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-3 text-gray-400" size={18} />
                      <input type="tel" name="phoneNumber" value={formData.phoneNumber} onChange={handleChange} className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg admin-input outline-none" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">WhatsApp</label>
                    <div className="relative">
                      <MessageCircle className="absolute left-3 top-3 text-gray-400" size={18} />
                      <input type="tel" name="whatsapp" value={formData.whatsapp} onChange={handleChange} className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg admin-input outline-none" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Email</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 text-gray-400" size={18} />
                      <input type="email" name="email" value={formData.email} onChange={handleChange} className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg admin-input outline-none" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Website</label>
                    <div className="relative">
                      <LinkIcon className="absolute left-3 top-3 text-gray-400" size={18} />
                      <input type="url" name="website" value={formData.website} onChange={handleChange} className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg admin-input outline-none" />
                    </div>
                  </div>
                </div>
              </div>

              {/* 4b. VOUCHER */}
              <div>
                <h3 className="text-lg font-bold border-b pb-2 mb-4 mt-8">Voucher</h3>
                <p className="text-sm text-gray-500 mb-4">
                  Optional code shown to guests before WhatsApp. Add the partner website above so guests know where to apply it.
                </p>
                <div className="max-w-md">
                  <label className="block text-sm font-bold text-gray-700 mb-1">Voucher code</label>
                  <div className="relative">
                    <Ticket className="absolute left-3 top-3 text-gray-400" size={18} />
                    <input
                      type="text"
                      name="voucherCode"
                      value={formData.voucherCode}
                      onChange={handleChange}
                      placeholder="e.g. STAY2026"
                      className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg admin-input outline-none font-mono tracking-wide"
                    />
                  </div>
                </div>
              </div>

              {/* 5. LOCATION */}
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

              {/* 6. COVER PHOTO (Memory Upgraded) */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Cover Photo</label>
                <div className="flex flex-col md:flex-row items-start gap-6 bg-vailo-teal/5/50 p-6 rounded-xl border border-vailo-teal/10">
                  
                  {/* Fixed Margin/Padding Issue */}
                  <div className="w-48 h-32 rounded-xl border-2 border-dashed border-gray-300 overflow-hidden bg-gray-100 flex items-center justify-center shrink-0">
                    {formData.photoUrl ? (
                      <img src={formData.photoUrl} className="w-full h-full object-cover block" />
                    ) : (
                      <div className="text-gray-400 flex flex-col items-center">
                        <ImageIcon size={24} className="mb-1" />
                        <span className="text-xs font-medium">No Image</span>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex-1 w-full">
                    <p className="text-sm font-bold text-gray-700 mb-2">Upload Custom Image</p>
                    <input type="file" accept="image/*" onChange={(e) => { 
                      if (e.target.files?.[0]) { 
                        const file = e.target.files[0];
                        const url = URL.createObjectURL(file);
                        setCustomFile(file); 
                        setCustomPreview(url); 
                        setFormData({...formData, photoUrl: url}); 
                      } 
                    }} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-bold file:bg-vailo-teal/5 file:text-vailo-teal-hover hover:file:bg-vailo-teal/10 cursor-pointer mb-4" />
                    
                    {/* Selectable Thumbnail Gallery */}
                    {(availableMasterPhotos.length > 0 || googlePhoto || customPreview) && (
                      <div className="border-t border-vailo-teal/15 pt-4">
                        <p className="text-xs font-bold text-vailo-dark mb-2 uppercase tracking-wider">Select Photo Source</p>
                        <div className="flex gap-3 overflow-x-auto pb-2 items-center">
                          
                          {/* Uploaded Thumbnail */}
                          {customPreview && (
                            <div className="relative shrink-0 mt-1">
                              <img src={customPreview} onClick={() => setFormData({...formData, photoUrl: customPreview})} className={`w-16 h-16 object-cover rounded-lg cursor-pointer border-[3px] hover:opacity-80 transition-all ${formData.photoUrl === customPreview ? 'border-blue-600 shadow-md scale-105' : 'border-transparent'}`} />
                              <div className="absolute top-1 left-1 bg-white/90 backdrop-blur-sm text-gray-800 text-[9px] font-bold px-1.5 py-0.5 rounded shadow-sm leading-none">Upload</div>
                            </div>
                          )}

                          {/* Google Memory Thumbnail */}
                          {googlePhoto && (
                            <div className="relative shrink-0 mt-1">
                              <img src={googlePhoto} onClick={() => setFormData({...formData, photoUrl: googlePhoto})} className={`w-16 h-16 object-cover rounded-lg cursor-pointer border-[3px] hover:opacity-80 transition-all ${formData.photoUrl === googlePhoto ? 'border-blue-600 shadow-md scale-105' : 'border-transparent'}`} />
                              {/* Fixed Badge Position */}
                              <div className="absolute top-1 left-1 bg-white/90 backdrop-blur-sm text-vailo-teal text-[9px] font-bold px-1.5 py-0.5 rounded shadow-sm leading-none">Google</div>
                            </div>
                          )}

                          {/* Global Area Thumbnails */}
                          {availableMasterPhotos.map((url, idx) => (
                            <div key={idx} className="relative shrink-0 mt-1">
                              <img src={url} onClick={() => setFormData({...formData, photoUrl: url})} className={`w-16 h-16 object-cover rounded-lg cursor-pointer border-[3px] hover:opacity-80 transition-all ${formData.photoUrl === url ? 'border-blue-600 shadow-md scale-105' : 'border-transparent'}`} />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                  </div>
                </div>
              </div>

              {/* 7. DISPLAY & TARGETING */}
              <div className="bg-gray-50 p-6 rounded-xl border border-gray-200">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Display & Targeting</h3>
                
                <div className="space-y-4 mb-6">
                  <label className="flex items-start bg-white p-4 rounded-xl border border-gray-200 cursor-pointer hover:border-blue-300 transition-colors">
                    <div className="flex items-center h-5">
                      <input type="checkbox" name="isMainPage" checked={formData.isMainPage} onChange={handleChange} className="h-5 w-5 text-vailo-teal focus:ring-vailo-teal/20 focus:border-vailo-teal border-gray-300 rounded cursor-pointer" />
                    </div>
                    <div className="ml-3">
                      <span className="block text-sm font-bold text-gray-900">Show on Main Page</span>
                      <span className="block text-xs text-gray-500 mt-0.5">Highlight this feature prominently on the guest portal.</span>
                    </div>
                  </label>

                  <label className="flex items-start bg-white p-4 rounded-xl border border-gray-200 cursor-pointer hover:border-vailo-gold/30 transition-colors">
                    <div className="flex items-center h-5">
                      <input type="checkbox" name="isLocal" checked={formData.isLocal} onChange={handleChange} className="h-5 w-5 text-vailo-teal focus:ring-vailo-teal/20 focus:border-vailo-teal border-gray-300 rounded cursor-pointer" />
                    </div>
                    <div className="ml-3">
                      <span className="block text-sm font-bold text-gray-900">Live Like a Local</span>
                      <span className="block text-xs text-gray-500 mt-0.5">Tag this as a highly curated local experience to unlock advanced targeting options.</span>
                    </div>
                  </label>
                </div>

                {formData.isLocal && (
                  <div className="bg-vailo-teal/5 p-5 rounded-xl border border-purple-100 animate-in fade-in slide-in-from-top-2">
                    <h3 className="text-sm font-bold text-vailo-dark uppercase tracking-wider mb-2 flex items-center">
                      <Wand2 size={16} className="mr-2" /> Experience Targeting
                    </h3>
                    <p className="text-sm text-vailo-teal-hover mb-4">Tag which local gem categories this experience fits. Multiple selections allowed.</p>
                    
                    {localGemsCategories.length === 0 ? (
                      <p className="text-sm text-vailo-teal italic">No Local Gems categories found for this area. Add them under Area Functionality → Local Gems Categories.</p>
                    ) : (
                      <PillSelector
                        label="Local Gems Category *"
                        options={localGemCategoryPillOptions}
                        isSelected={(value) =>
                          categorySelectionIncludes(
                            normalizedExperienceTypes,
                            value,
                            localGemCategoryDocs,
                            localeSettings.primaryLocale
                          )
                        }
                        onToggle={(v) => handlePillToggle('experienceTypes', v, localGemCategoryDocs)}
                        colorClass="purple"
                      />
                    )}
                  </div>
                )}
              </div>

              {/* SUBMIT BUTTON */}
              <div className="flex justify-end pt-4 border-t border-gray-100">
                <button type="button" onClick={closeAndResetForm} className="px-6 py-3 mr-4 text-sm font-bold text-gray-700 hover:bg-gray-200 rounded-xl transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={isSubmitting || isUploadingImage} className="flex items-center px-8 py-3 text-sm font-bold text-white bg-vailo-teal hover:bg-vailo-teal-hover rounded-xl disabled:opacity-50 transition-colors shadow-md hover:shadow-lg">
                  {(isSubmitting || isUploadingImage) && <Loader2 size={18} className="mr-2 animate-spin" />}
                  {isUploadingImage ? 'Uploading...' : isSubmitting ? 'Saving...' : 'Save Feature'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* LIST VIEW */}
      {isLoading ? (
        <div className="py-20 text-center text-gray-400"><Loader2 size={40} className="animate-spin mx-auto mb-4" /></div>
      ) : features.length === 0 && !isFormOpen ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-xl p-12 text-center">
          <Briefcase size={40} className="mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-bold text-gray-900 mb-2">No Features Added</h3>
          <p className="text-gray-500">Create the first feature for this listing, or paste from another unit.</p>
        </div>
      ) : (
        <div>
          {features.length > 0 && !isFormOpen && (
            <div className="flex items-center gap-2 mb-4">
              <input
                type="checkbox"
                checked={allFeaturesSelected}
                onChange={toggleSelectAllFeatures}
                className="h-4 w-4 rounded border-gray-300 text-vailo-teal focus:ring-vailo-teal/20"
                aria-label="Select all features"
              />
              <span className="text-sm text-gray-600">Select all</span>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feat) => (
            <div key={feat.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col">
              <div className="h-48 bg-gray-200 relative">
                {!isFormOpen && (
                  <div className="absolute top-3 left-3 z-10">
                    <input
                      type="checkbox"
                      checked={selectedFeatureIds.has(feat.id)}
                      onChange={() => toggleFeatureSelection(feat.id)}
                      className="h-4 w-4 rounded border-gray-300 text-vailo-teal focus:ring-vailo-teal/20 bg-white/90"
                      aria-label={`Select ${feat.name}`}
                    />
                  </div>
                )}
                {feat.photoUrl ? (
                  <MirroredPhotoImg
                    src={feat.photoUrl}
                    className="w-full h-full object-cover block"
                    alt=""
                    mirrorContext={{
                      country: propertyAreaContext?.country,
                      areaId: propertyAreaContext?.areaId,
                      docId: feat.id,
                    }}
                    fallback={
                      <div className="w-full h-full flex items-center justify-center text-gray-400">
                        <ImageIcon size={32} />
                      </div>
                    }
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400"><ImageIcon size={32} /></div>
                )}
                <div className="absolute bottom-3 left-3 flex flex-wrap gap-1 max-w-[70%]">
                  {feat.categories?.map((cat: string) => (
                    <span key={cat} className="bg-white/90 backdrop-blur-sm px-2 py-0.5 rounded-md text-[10px] font-bold text-gray-900 shadow-sm whitespace-nowrap">
                      {cat}
                    </span>
                  ))}
                </div>
                {feat.agreement && feat.agreement !== "0" && (
                  <div className="absolute top-3 right-3 bg-vailo-teal text-white px-2.5 py-1 rounded-full text-xs font-bold shadow-sm">
                    {feat.agreement}%
                  </div>
                )}
              </div>
              <div className="p-5 flex-1 flex flex-col">
                <h3 className="font-bold text-lg text-gray-900 mb-1">{feat.name}</h3>
                <p className="text-sm text-gray-500 mb-4 line-clamp-2 flex-1">{feat.description}</p>
                
                <div className="flex flex-wrap gap-2 mb-4">
                  {feat.isMainPage && <span className="text-[10px] font-bold bg-vailo-teal/10 text-vailo-dark px-2 py-1 rounded-md">Main Page</span>}
                  {feat.isLocal && <span className="text-[10px] font-bold bg-vailo-gold/15 text-vailo-teal-hover px-2 py-1 rounded-md">Local Experience</span>}
                  {feat.voucherCode && (
                    <span className="text-[10px] font-bold bg-amber-50 text-amber-800 px-2 py-1 rounded-md">Voucher</span>
                  )}
                </div>

                <div className="mt-auto flex justify-end gap-2 pt-4 border-t border-gray-100">
                  <button onClick={() => openFeatureEdit(feat)} className="p-2 text-vailo-teal hover:bg-vailo-teal/5 rounded-lg transition-colors"><Pencil size={18} /></button>
                  <button onClick={() => handleDelete(feat.id, feat.name)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={18} /></button>
                </div>
              </div>
            </div>
          ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PillSelector({
  label,
  options,
  isSelected,
  onToggle,
  colorClass,
}: {
  label: string;
  options: { value: string; label: string }[];
  isSelected: (value: string) => boolean;
  onToggle: (val: string) => void;
  colorClass: 'blue' | 'purple';
}) {
  const colorMap = {
    blue: { bg: 'bg-vailo-teal/10', text: 'text-vailo-dark', border: 'border-blue-300' },
    purple: { bg: 'bg-vailo-gold/15', text: 'text-vailo-teal-hover', border: 'border-vailo-gold/30' },
  };
  const activeStyle = colorMap[colorClass];

  return (
    <div>
      <p className="text-sm font-bold text-gray-700 mb-2">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const selected = isSelected(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onToggle(opt.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                selected
                  ? `${activeStyle.bg} ${activeStyle.text} ${activeStyle.border} shadow-sm`
                  : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}