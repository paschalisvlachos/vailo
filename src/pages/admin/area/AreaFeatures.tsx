import { useState, useEffect, useMemo } from 'react';
import { useAreaRouteParams } from '../../../hooks/useAreaRouteParams';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getGenerativeModel } from "firebase/ai";
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db, storage, ai } from '../../../lib/firebase';
import { useToast } from '../../../context/ToastContext';
import AreaHubBackLink from '../../../components/admin/AreaHubBackLink';
import { Plus, Image as ImageIcon, Pencil, Trash2, Loader2, MapPin, Wand2, Briefcase, Link as LinkIcon, Phone, Mail, MessageCircle, Languages, Sparkles } from 'lucide-react';
import ContentLocaleTabs from '../../../components/admin/ContentLocaleTabs';
import { usePlatformLanguages } from '../../../hooks/usePlatformLanguages';
import { useAreaContentLocaleSettings } from '../../../hooks/useAreaContentLocaleSettings';
import { useContentLocaleEditor } from '../../../hooks/useContentLocaleEditor';
import { translateContentFields } from '../../../lib/adminContentTranslate';
import { PLACES_USAGE_CALLER } from '../../../lib/placesApiUsageCallers';
import { ensurePersistablePhotoUrl } from '../../../lib/adminPhotoUrl';
import MirroredPhotoImg from '../../../components/shared/MirroredPhotoImg';
import { categoryPrimaryName, resolveCategoryLabel, normalizeCategorySelectionList, categorySelectionIncludes } from '../../../lib/categoryLocale';
import { normalizeLocaleCode } from '../../../lib/propertyContentLocales';

export default function AreaFeatures() {
  const toast = useToast();
  const { country: decodedCountry, areaId, areaName: decodedArea } = useAreaRouteParams();

  // Databases
  const [features, setFeatures] = useState<any[]>([]);
  const [featuresCategories, setFeaturesCategories] = useState<any[]>([]);
  const [localGemsCategories, setLocalGemsCategories] = useState<
    { id: string; data: Record<string, unknown> }[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);

  // Form State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingFeatureId, setEditingFeatureId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMagicFilling, setIsMagicFilling] = useState(false);
  const [isGeneratingDesc, setIsGeneratingDesc] = useState(false);

  // Photo Logic
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const initialFormState = {
    name: '',
    categories: [] as string[],
    agreement: '0', // Default to 0
    description: '',
    googleMapsUrl: '',
    latitude: '',
    longitude: '',
    phoneNumber: '',
    whatsapp: '',
    email: '',
    website: '',
    photoUrl: '',
    isMainPage: false,
    isLocal: false,
    experienceTypes: [] as string[]
  };

  const [formData, setFormData] = useState(initialFormState);
  const [editingSourceDoc, setEditingSourceDoc] = useState<Record<string, unknown> | null>(null);
  const [isLocaleTranslating, setIsLocaleTranslating] = useState(false);

  const localeSettings = useAreaContentLocaleSettings(decodedCountry, areaId);
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

  // Keep pill selections keyed to primary names once category catalogs load.
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
    setImagePreview(typeof feat.photoUrl === 'string' ? feat.photoUrl : null);
    setIsFormOpen(true);
  };

  // 1. Fetch Features Categories
  useEffect(() => {
    if (!decodedCountry || !areaId) return;
    const catRef = collection(db, 'countries', decodedCountry, 'areas', areaId, 'featuresCategories');
    const unsubscribe = onSnapshot(catRef, (snapshot) => {
      const fetchedCats = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      fetchedCats.sort((a: any, b: any) =>
        featureCategoryPrimaryName(a).localeCompare(featureCategoryPrimaryName(b))
      );
      setFeaturesCategories(fetchedCats);
    });
    return () => unsubscribe();
  }, [decodedCountry, areaId, localeSettings.primaryLocale]);

  // 2. Fetch Local Gems Categories
  useEffect(() => {
    if (!decodedCountry || !areaId) return;
    const gemsCatRef = collection(db, 'countries', decodedCountry, 'areas', areaId, 'localGemsCategories');
    const unsubscribe = onSnapshot(gemsCatRef, (snapshot) => {
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
    return () => unsubscribe();
  }, [decodedCountry, areaId, localeSettings.primaryLocale]);

  // 3. Fetch Master Features
  useEffect(() => {
    if (!decodedCountry || !areaId) return;
    const featsRef = collection(db, 'countries', decodedCountry, 'areas', areaId, 'areaFeatures');
    const unsubscribe = onSnapshot(featsRef, (snapshot) => {
      const fetchedFeatures = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setFeatures(fetchedFeatures);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, [decodedCountry, areaId]);

  // Derived Master Photos based on selected categories
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
  // --- AI MAGIC FILL ---
  const handleMagicFill = async () => {
    const url = formData.googleMapsUrl;
    if (!url) {
      toast.warning("Please paste a Google Maps URL first.");
      return;
    }
    setIsMagicFilling(true);

    try {
      let searchQuery = "";
      let placeNameFallback = ""; 
      
      const nameMatch = url.match(/\/place\/([^\/]+)\//);
      if (nameMatch && nameMatch[1]) {
        placeNameFallback = decodeURIComponent(nameMatch[1].replace(/\+/g, ' '));
        searchQuery = `${placeNameFallback} ${decodedArea}`; 
      } else {
        searchQuery = url;
      }

      const functions = getFunctions();
      const getGooglePlaceDetails = httpsCallable(functions, 'getGooglePlaceDetails');
      const result = await getGooglePlaceDetails({
        searchQuery,
        area: decodedArea,
        usageCaller: PLACES_USAGE_CALLER.areaFeatures,
      });
      const googleData: any = result.data;
      if (googleData.photoUrl) {
        try {
          googleData.photoUrl = await ensurePersistablePhotoUrl(googleData.photoUrl, {
            country: decodedCountry,
            areaId,
            googlePlaceId: googleData.googlePlaceId,
          });
        } catch (mirrorErr) {
          console.warn('Magic Fill photo mirror failed:', mirrorErr);
          toast.warning('Place loaded, but the Google photo could not be stored. Upload a custom image.');
          googleData.photoUrl = '';
        }
      }

      // 🔥 THE FIX: AI-POWERED CATEGORY MAPPING 🔥
      let matchedCategory = "";
      let finalDescription = googleData.description;

      try {
        const categoryNames = featuresCategories.map((c) => featureCategoryPrimaryName(c)).join(', ');
        const gType = googleData.category?.replace(/_/g, ' ') || "local business";

        // We ask Gemini to return BOTH the description and the category match in a strict JSON format
        const prompt = `Act as a luxury travel concierge for ${decodedArea}. We are adding "${googleData.name || placeNameFallback}" (Google classifies it as: ${gType}).
        1. Pick the single most accurate category from our exact database list: [${categoryNames}]. If none fit well, return an empty string "".
        2. Write a short, engaging 2-sentence description explaining why guests should use or visit this.
        Return ONLY a valid JSON object in this exact format with no markdown wrappers:
        {"category": "Exact Category Name", "description": "Your 2 sentence description"}`;

        const model = getGenerativeModel(ai, { model: "gemini-2.5-flash" });
        const aiResult = await model.generateContent(prompt);
        
        // Strip out markdown code blocks if Gemini adds them
        const rawText = aiResult.response.text().replace(/```json/gi, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(rawText);

        // Ensure the AI didn't hallucinate a category that doesn't exist
        if (parsed.category && featuresCategories.some((c) => featureCategoryPrimaryName(c) === parsed.category)) {
          matchedCategory = parsed.category;
        }
        
        if (parsed.description && !googleData.description) {
          finalDescription = parsed.description;
        }
      } catch (e) {
        console.log("AI JSON mapping failed, falling back to basic matching.", e);
        // Absolute fallback if the AI fails
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
        setImagePreview(googleData.photoUrl);
        setImageFile(null);
      }
    } catch (error) {
      console.error("Magic Fill Error:", error);
      toast.error("Could not process this link. Ensure it is a valid Google Maps place.");
    } finally {
      setIsMagicFilling(false);
    }
  };

  // --- AI DESCRIPTION GENERATOR ---
  const handleGenerateDescription = async () => {
    if (!formData.name) {
      toast.warning("Please enter a name first.");
      return;
    }
    setIsGeneratingDesc(true);
    try {
      const cats = formData.categories.join(' and ');
      const prompt = `Write a short, luxurious 2-sentence description for a ${cats || 'feature'} called "${formData.name}" located in ${decodedArea}. Make it sound exclusive and appealing to high-end travelers. No quotes.`;
      const model = getGenerativeModel(ai, { model: "gemini-2.5-flash" });
      const result = await model.generateContent(prompt);
      const desc = result.response.text().trim();
      setFormData(prev => ({ ...prev, description: desc }));
      localeEditor.applyPrimaryFields({
        name: localeEditor.getPrimaryValue('name') || formData.name,
        description: desc,
      });
    } catch (e) {
      console.error(e);
      toast.error("Failed to generate description.");
    } finally { setIsGeneratingDesc(false); }
  };

  const closeAndResetForm = () => {
    setIsFormOpen(false);
    setEditingFeatureId(null);
    setEditingSourceDoc(null);
    localeEditor.resetMaps();
    setFormData(initialFormState);
    setImageFile(null);
    setImagePreview(null);
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

  // --- SUBMIT ---
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
      if (imageFile) {
        setIsUploadingImage(true);
        const storageRef = ref(storage, `areas/${decodedCountry}/${areaId}/features/${Date.now()}_${imageFile.name}`);
        await uploadBytes(storageRef, imageFile);
        finalPhotoUrl = await getDownloadURL(storageRef);
      } else if (finalPhotoUrl) {
        finalPhotoUrl = await ensurePersistablePhotoUrl(finalPhotoUrl, {
          country: decodedCountry,
          areaId,
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

      if (editingFeatureId) {
        await updateDoc(doc(db, 'countries', decodedCountry, 'areas', areaId, 'areaFeatures', editingFeatureId), featureData);
      } else {
        await addDoc(collection(db, 'countries', decodedCountry, 'areas', areaId, 'areaFeatures'), featureData);
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
    if (window.confirm(`Delete ${name}?`)) {
      await deleteDoc(doc(db, 'countries', decodedCountry, 'areas', areaId, 'areaFeatures', id));
    }
  };

  const isPrimaryLocaleTab =
    normalizeLocaleCode(localeEditor.contentLocale) === normalizeLocaleCode(localeSettings.primaryLocale);

  const agreementDisplay =
    (formData.agreement ?? '').trim() === '' ? '0%' : `${formData.agreement}%`;

  return (
    <div className="admin-page">
      
      <AreaHubBackLink />

      <div className="flex items-center justify-between mb-8">
        <div>
            <h2 className="text-2xl font-bold text-gray-900 flex items-center">
              <Briefcase className="mr-3 text-vailo-teal shrink-0" size={28} />
              Master Features
            </h2>
            <p className="text-sm text-gray-500 mt-2">
              Global features & services for <span className="font-bold text-vailo-teal-hover">{decodedArea}, {decodedCountry}</span>
            </p>
        </div>
        {!isFormOpen && (
          <button onClick={() => { setEditingSourceDoc(null); localeEditor.resetMaps(); setFormData(initialFormState); setImagePreview(null); setImageFile(null); setEditingFeatureId(null); setIsFormOpen(true); }} className="flex items-center px-4 py-2 bg-vailo-teal text-white text-sm font-bold rounded-xl hover:bg-vailo-teal-hover transition-colors shadow-sm">
            <Plus size={18} className="mr-2" /> Add Feature
          </button>
        )}
      </div>

      {/* FORM */}
      {isFormOpen && (
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden mb-8 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="px-6 py-4 bg-vailo-teal/5 border-b border-indigo-100 flex items-center justify-between">
            <h3 className="text-lg font-bold text-vailo-dark">
              {editingFeatureId ? 'Edit Master Feature' : 'Add New Master Feature'}
            </h3>
            <button type="button" onClick={closeAndResetForm} className="text-vailo-teal hover:text-vailo-teal-hover font-medium text-sm">Cancel</button>
          </div>

          <div className="p-6">
            <div className="rounded-xl border border-vailo-teal/15 bg-vailo-teal/5 p-4 space-y-3 mb-8">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <p className="text-sm font-bold text-vailo-dark flex items-center gap-2">
                  <Languages size={16} /> Content language
                </p>
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

            {/* 1. MAGIC FILL */}
            <div className="flex flex-col md:flex-row gap-4 mb-8 bg-vailo-teal/5/50 p-4 rounded-xl border border-vailo-teal/10 items-center">
              <div className="flex-1 w-full">
                <label className="block text-xs font-bold text-vailo-dark uppercase tracking-wider mb-1">Google Maps Link</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-3 text-vailo-teal/50" size={18} />
                  <input type="url" name="googleMapsUrl" value={formData.googleMapsUrl} onChange={handleChange} placeholder="Paste FULL or Short Google Maps URL here..." className="w-full pl-10 pr-4 py-2.5 bg-white border border-vailo-teal/15 rounded-lg admin-input outline-none text-sm" />
                </div>
              </div>
              <button type="button" onClick={handleMagicFill} disabled={isMagicFilling || !formData.googleMapsUrl} className="w-full md:w-auto mt-4 md:mt-0 px-6 py-2.5 bg-vailo-teal hover:bg-vailo-teal-hover text-white text-sm font-bold rounded-lg disabled:opacity-50 transition-colors shadow-sm flex items-center justify-center whitespace-nowrap">
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
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-vailo-teal/20 focus:border-vailo-teal outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Agreement *</label>
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
                          className="w-full pl-4 pr-10 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-vailo-teal/20 focus:border-vailo-teal outline-none"
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
                    colorClass="indigo"
                  />
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
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-vailo-teal/20 focus:border-vailo-teal outline-none resize-y"
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
                      <input type="tel" name="phoneNumber" value={formData.phoneNumber} onChange={handleChange} className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-vailo-teal/20 focus:border-vailo-teal outline-none" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">WhatsApp</label>
                    <div className="relative">
                      <MessageCircle className="absolute left-3 top-3 text-gray-400" size={18} />
                      <input type="tel" name="whatsapp" value={formData.whatsapp} onChange={handleChange} className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-vailo-teal/20 focus:border-vailo-teal outline-none" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Email</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 text-gray-400" size={18} />
                      <input type="email" name="email" value={formData.email} onChange={handleChange} className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-vailo-teal/20 focus:border-vailo-teal outline-none" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Website</label>
                    <div className="relative">
                      <LinkIcon className="absolute left-3 top-3 text-gray-400" size={18} />
                      <input type="url" name="website" value={formData.website} onChange={handleChange} className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-vailo-teal/20 focus:border-vailo-teal outline-none" />
                    </div>
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

              {/* 6. COVER PHOTO (Master + Upload) */}
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">Cover Photo</label>
                <div className="flex flex-col md:flex-row items-start gap-6 bg-vailo-teal/5/50 p-6 rounded-xl border border-indigo-100">
                  <div className="w-48 h-32 rounded-xl border-2 border-dashed border-gray-300 overflow-hidden bg-white flex items-center justify-center shrink-0">
                    {imagePreview || formData.photoUrl ? (
                      <img src={imagePreview || formData.photoUrl} className="w-full h-full object-cover" />
                    ) : (
                      <div className="text-gray-400 flex flex-col items-center">
                        <ImageIcon size={24} className="mb-1" />
                        <span className="text-xs font-medium">No Image</span>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 w-full">
                    <p className="text-sm font-bold text-gray-700 mb-2">Upload Custom Image</p>
                    <input type="file" accept="image/*" onChange={(e) => { if (e.target.files?.[0]) { setImageFile(e.target.files[0]); setImagePreview(URL.createObjectURL(e.target.files[0])); setFormData({...formData, photoUrl: ''}); } }} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-bold file:bg-vailo-teal/5 file:text-vailo-teal-hover hover:file:bg-vailo-teal/10 cursor-pointer mb-4" />
                    
                    {availableMasterPhotos.length > 0 && (
                      <div className="border-t border-vailo-teal/15 pt-4">
                        <p className="text-xs font-bold text-vailo-dark mb-2 uppercase tracking-wider">Or select a Global Category Photo</p>
                        <div className="flex gap-2 overflow-x-auto pb-2">
                          {availableMasterPhotos.map((url, idx) => (
                            <img key={idx} src={url} onClick={() => { setFormData({...formData, photoUrl: url}); setImagePreview(null); setImageFile(null); }} className={`w-16 h-16 object-cover rounded-lg cursor-pointer border-2 hover:opacity-80 transition-all ${formData.photoUrl === url ? 'border-indigo-600 shadow-md' : 'border-transparent'}`} />
                          ))}
                        </div>
                      </div>
                    )}
                    {availableMasterPhotos.length === 0 && formData.categories.length > 0 && (
                      <p className="text-xs text-gray-500 mt-2 italic">No master photos found for selected categories.</p>
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

                {/* EXPERIENCE TARGETING (Local Gems categories) */}
                {formData.isLocal && (
                  <div className="bg-vailo-teal/5 p-5 rounded-xl border border-purple-100 animate-in fade-in slide-in-from-top-2">
                    <h3 className="text-sm font-bold text-vailo-dark uppercase tracking-wider mb-2 flex items-center">
                      <Wand2 size={16} className="mr-2" /> Experience Targeting
                    </h3>
                    <p className="text-sm text-vailo-teal-hover mb-4">Tag which local gem categories this experience fits. Multiple selections allowed.</p>
                    
                    {localGemsCategories.length === 0 ? (
                      <p className="text-sm text-vailo-teal italic">No Local Gems categories found. Add them under Area Functionality → Local Gems Categories.</p>
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
                  {isUploadingImage ? 'Uploading Photo...' : isSubmitting ? 'Saving...' : 'Save Master Feature'}
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
          <p className="text-gray-500">Create the first master feature for {decodedArea}.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feat) => (
            <div key={feat.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col">
              <div className="h-48 bg-gray-200 relative">
                {feat.photoUrl ? (
                  <MirroredPhotoImg
                    src={feat.photoUrl}
                    className="w-full h-full object-cover"
                    alt=""
                    mirrorContext={{
                      country: decodedCountry,
                      areaId,
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
                <div className="absolute top-3 left-3 flex flex-wrap gap-1 max-w-[70%]">
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
                </div>

                <div className="mt-auto flex justify-end gap-2 pt-4 border-t border-gray-100">
                  <button onClick={() => openFeatureEdit(feat)} className="p-2 text-vailo-teal hover:bg-vailo-teal/5 rounded-lg transition-colors"><Pencil size={18} /></button>
                  <button onClick={() => handleDelete(feat.id, feat.name)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={18} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Reusable Multiple-Select Pill Component
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
  colorClass: 'indigo' | 'purple';
}) {
  const colorMap = {
    indigo: { bg: 'bg-vailo-teal/10', text: 'text-vailo-teal-hover', border: 'border-vailo-teal/20' },
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