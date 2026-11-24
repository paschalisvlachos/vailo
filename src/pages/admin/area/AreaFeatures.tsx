import { useState, useEffect, useMemo } from 'react';
import { useAreaRouteParams } from '../../../hooks/useAreaRouteParams';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, deleteField } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getGenerativeModel } from "firebase/ai";
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db, storage, ai } from '../../../lib/firebase';
import { useToast } from '../../../context/ToastContext';
import AreaHubBackLink from '../../../components/admin/AreaHubBackLink';
import { Plus, Image as ImageIcon, Pencil, Trash2, Loader2, MapPin, Wand2, Briefcase, Link as LinkIcon, Phone, Mail, MessageCircle, Languages, Sparkles, Layers } from 'lucide-react';
import { AdminButton } from '../../../components/admin/AdminPageHeader';
import PartnerWebImportPanel from '../../../components/admin/PartnerWebImportPanel';
import type { PartnerImportDraft } from '../../../lib/partnerImportAi';
import ContentLocaleTabs from '../../../components/admin/ContentLocaleTabs';
import { usePlatformLanguages } from '../../../hooks/usePlatformLanguages';
import { useAreaContentLocaleSettings } from '../../../hooks/useAreaContentLocaleSettings';
import { useContentLocaleEditor } from '../../../hooks/useContentLocaleEditor';
import { translateContentFields } from '../../../lib/adminContentTranslate';
import { PLACES_USAGE_CALLER } from '../../../lib/placesApiUsageCallers';
import { ensurePersistablePhotoUrl } from '../../../lib/adminPhotoUrl';
import { isPlacesApiMediaPhotoUrl } from '../../../lib/placePhotoResolver';
import MirroredPhotoImg from '../../../components/shared/MirroredPhotoImg';
import {
  categoryPrimaryName,
  resolveCategoryLabel,
  normalizeCategorySelectionList,
  categorySelectionIncludes,
  normalizeCategoryMatchKey,
} from '../../../lib/categoryLocale';

export default function AreaFeatures() {
  const toast = useToast();
  const { country: decodedCountry, areaId, areaName: decodedArea } = useAreaRouteParams();

  // Databases
  const [features, setFeatures] = useState<any[]>([]);
  const [featuresCategories, setFeaturesCategories] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Form State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [addEntryMethod, setAddEntryMethod] = useState<'choose' | 'bulk' | 'page' | 'maps' | null>(null);
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
    description: '',
    googleMapsUrl: '',
    phoneNumber: '',
    whatsapp: '',
    email: '',
    website: '',
    photoUrl: '',
    isMainPage: true,
    isLocal: false,
    experienceTypes: [] as string[],
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

  const featureCategoryPillOptions = useMemo(
    () =>
      featuresCategories.map((cat) => ({
        value: featureCategoryPrimaryName(cat),
        label: featureCategoryLabel(cat),
      })),
    [featuresCategories, localeEditor.contentLocale, localeSettings.primaryLocale]
  );

  const featureCategoryDocs = useMemo(
    () => featuresCategories as Record<string, unknown>[],
    [featuresCategories]
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

  // Keep pill selections keyed to primary names once category catalogs load.
  useEffect(() => {
    if (!isFormOpen) return;
    const sameSelection = (a: string[], b: string[]) => {
      if (a.length !== b.length) return false;
      const setA = new Set(a.map((s) => s.toLowerCase()));
      return b.every((s) => setA.has(s.toLowerCase()));
    };
    if (sameSelection(normalizedFeatureCategories, formData.categories)) return;
    setFormData((prev) => ({
      ...prev,
      categories: normalizedFeatureCategories,
    }));
  }, [isFormOpen, normalizedFeatureCategories, formData.categories]);

  const openFeatureEdit = (feat: Record<string, unknown> & { id: string }) => {
    setEditingSourceDoc(feat);
    const { latitude: _lat, longitude: _lng, ...featRest } = feat;
    setFormData({
      ...initialFormState,
      ...featRest,
      categories: normalizeCategorySelectionList(
        feat.categories as string[] | undefined,
        featureCategoryDocs,
        localeSettings.primaryLocale
      ),
      isMainPage: true,
      isLocal: false,
      experienceTypes: [],
    } as typeof initialFormState);
    setEditingFeatureId(feat.id);
    setAddEntryMethod(null);
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

  // 2. Fetch Master Partners
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

  const handlePillToggle = (value: string, catalogDocs: Record<string, unknown>[]) => {
    setFormData((prev) => {
      const current = normalizeCategorySelectionList(
        prev.categories,
        catalogDocs,
        localeSettings.primaryLocale
      );
      const lower = value.toLowerCase();
      const has = current.some((c) => c.toLowerCase() === lower);
      const next = has
        ? current.filter((c) => c.toLowerCase() !== lower)
        : [...current, value];
      return { ...prev, categories: next };
    });
  };

  const matchPartnerCategories = (names: string[] | undefined) => {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const raw of names || []) {
      const key = normalizeCategoryMatchKey(raw);
      if (!key) continue;
      const hit = featuresCategories.find((c) => {
        const primary = featureCategoryPrimaryName(c);
        const primaryKey = normalizeCategoryMatchKey(primary);
        return primaryKey === key || primaryKey.includes(key) || key.includes(primaryKey);
      });
      if (!hit) continue;
      const primary = featureCategoryPrimaryName(hit);
      if (!primary || seen.has(primary.toLowerCase())) continue;
      seen.add(primary.toLowerCase());
      out.push(primary);
    }
    return out;
  };

  const applyPartnerDraft = (draft: PartnerImportDraft) => {
    const matchedCategories = matchPartnerCategories(draft.categories);
    const nextPhoto = draft.photoUrl || '';
    setFormData((prev) => ({
      ...prev,
      name: draft.name || prev.name,
      description: draft.description || prev.description,
      phoneNumber: draft.phoneNumber || prev.phoneNumber,
      whatsapp: draft.whatsapp || prev.whatsapp,
      email: draft.email || prev.email,
      website: draft.website || draft.sourceUrl || prev.website,
      photoUrl: nextPhoto || prev.photoUrl,
      categories: matchedCategories,
    }));
    localeEditor.applyPrimaryFields({
      name: draft.name || localeEditor.getPrimaryValue('name') || formData.name,
      description: draft.description || localeEditor.getPrimaryValue('description') || formData.description,
    });
    if (nextPhoto) {
      setImagePreview(nextPhoto);
      setImageFile(null);
    }
  };

  const savePartnerDraftsBulk = async (drafts: PartnerImportDraft[]) => {
    for (const draft of drafts) {
      const originalPhotoUrl = draft.photoUrl || '';
      let photoUrl = originalPhotoUrl;
      if (photoUrl && isPlacesApiMediaPhotoUrl(photoUrl)) {
        try {
          // eslint-disable-next-line no-await-in-loop
          photoUrl = await ensurePersistablePhotoUrl(photoUrl, {
            country: decodedCountry,
            areaId,
          });
        } catch {
          photoUrl = originalPhotoUrl;
        }
      }
      const matchedCategories = matchPartnerCategories(draft.categories);
      const featureData = {
        ...initialFormState,
        name: draft.name,
        description: draft.description,
        phoneNumber: draft.phoneNumber || '',
        whatsapp: draft.whatsapp || '',
        email: draft.email || '',
        website: draft.website || draft.sourceUrl || '',
        categories: matchedCategories,
        photoUrl,
        isMainPage: true,
        isLocal: false,
        experienceTypes: [] as string[],
        updatedAt: new Date().toISOString(),
      };
      // eslint-disable-next-line no-await-in-loop
      await addDoc(collection(db, 'countries', decodedCountry, 'areas', areaId, 'areaFeatures'), featureData);
    }
    closeAndResetForm();
  };

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

      let matchedCategories: string[] = [];
      let finalDescription = googleData.description;

      try {
        const categoryNames = featuresCategories.map((c) => featureCategoryPrimaryName(c)).join(', ');
        const gType = googleData.category?.replace(/_/g, ' ') || "local business";

        const prompt = `Act as a luxury travel concierge for ${decodedArea}. We are adding "${googleData.name || placeNameFallback}" (Google classifies it as: ${gType}).
Read the place name and Google type carefully.
1. From our exact allowed list [${categoryNames}], select EVERY category that clearly fits. Multiple are OK. If ambiguous or none fit, return [].
2. Write a short, engaging 2-sentence description explaining why guests should use or visit this.
Return ONLY valid JSON with no markdown:
{"categories":["Exact Category Name"],"description":"Your 2 sentence description"}`;

        const model = getGenerativeModel(ai, { model: "gemini-2.5-flash" });
        const aiResult = await model.generateContent(prompt);
        
        const rawText = aiResult.response.text().replace(/```json/gi, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(rawText);

        const rawCats = Array.isArray(parsed.categories)
          ? parsed.categories
          : parsed.category
            ? [parsed.category]
            : [];
        matchedCategories = rawCats
          .map((c: unknown) => String(c || '').trim())
          .filter((name: string) =>
            featuresCategories.some((c) => featureCategoryPrimaryName(c) === name)
          );
        
        if (parsed.description && !googleData.description) {
          finalDescription = parsed.description;
        }
      } catch (e) {
        console.log("AI JSON mapping failed, falling back to basic matching.", e);
        const gTypeLower = googleData.category?.toLowerCase().replace(/_/g, ' ') || "";
        const possibleMatch = featuresCategories.find((c) => {
          const n = featureCategoryPrimaryName(c).toLowerCase();
          return gTypeLower.includes(n) || n.includes(gTypeLower);
        });
        if (possibleMatch) matchedCategories = [featureCategoryPrimaryName(possibleMatch)];
      }

      const primaryName = googleData.name || placeNameFallback;
      const primaryDescription = finalDescription || formData.description;
      setFormData(prev => ({
        ...prev,
        name: primaryName,
        categories: matchedCategories,
        description: primaryDescription,
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
    setAddEntryMethod(null);
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
    if (featuresCategories.length > 0 && normalizedFeatureCategories.length === 0) {
      toast.warning('Select at least one partner category.');
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
      } else if (finalPhotoUrl && isPlacesApiMediaPhotoUrl(finalPhotoUrl)) {
        try {
          finalPhotoUrl = await ensurePersistablePhotoUrl(finalPhotoUrl, {
            country: decodedCountry,
            areaId,
            docId: editingFeatureId || undefined,
          });
        } catch {
          // Keep original URL.
        }
      }

      const featureData = {
        ...formData,
        categories: normalizedFeatureCategories,
        isMainPage: true,
        isLocal: false,
        experienceTypes: [],
        ...localeEditor.buildPayload(),
        photoUrl: finalPhotoUrl,
        updatedAt: new Date().toISOString(),
      };

      if (editingFeatureId) {
        await updateDoc(doc(db, 'countries', decodedCountry, 'areas', areaId, 'areaFeatures', editingFeatureId), {
          ...featureData,
          latitude: deleteField(),
          longitude: deleteField(),
        });
      } else {
        await addDoc(collection(db, 'countries', decodedCountry, 'areas', areaId, 'areaFeatures'), featureData);
      }

      toast.success(editingFeatureId ? 'Partner updated.' : 'Partner saved.');
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

  return (
    <div className="admin-page">
      
      <AreaHubBackLink />

      <div className="flex items-center justify-between mb-8">
        <div>
            <h2 className="text-2xl font-bold text-gray-900 flex items-center">
              <Briefcase className="mr-3 text-vailo-teal shrink-0" size={28} />
              Master Partners
            </h2>
            <p className="text-sm text-gray-500 mt-2 max-w-3xl">
              Add the business cooperations and promotions you have as an agency — partners guests can book through you, where you may earn a commission on each sale. Example: you cooperate with a boat rental and receive 15% commission on every booking.
            </p>
        </div>
        {!isFormOpen && (
          <AdminButton
            type="button"
            variant="accent"
            onClick={() => {
              setEditingSourceDoc(null);
              localeEditor.resetMaps();
              setFormData(initialFormState);
              setImagePreview(null);
              setImageFile(null);
              setEditingFeatureId(null);
              setAddEntryMethod('choose');
              setIsFormOpen(true);
            }}
          >
            <Plus size={16} />
            Add Partner
          </AdminButton>
        )}
      </div>

      {/* FORM */}
      {isFormOpen && (
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden mb-8 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="px-6 py-4 bg-vailo-teal/5 border-b border-indigo-100 flex items-center justify-between">
            <h3 className="text-lg font-bold text-vailo-dark">
              {editingFeatureId ? 'Edit Master Partner' : 'Add Master Partner'}
            </h3>
            <button type="button" onClick={closeAndResetForm} className="text-vailo-teal hover:text-vailo-teal-hover font-medium text-sm">Cancel</button>
          </div>

          <div className="p-6">
            {!editingFeatureId && addEntryMethod === 'choose' && (
              <div className="mb-2">
                <p className="text-sm font-bold text-gray-900 mb-1">How do you want to add partners?</p>
                <p className="text-sm text-gray-500 mb-5">
                  Bulk-import from a services listing page, import one service page, or use Google Maps.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <button
                    type="button"
                    onClick={() => setAddEntryMethod('bulk')}
                    className="text-left p-5 rounded-xl border border-vailo-teal/20 bg-white hover:border-vailo-teal hover:bg-vailo-teal/5 transition-colors"
                  >
                    <Layers className="text-vailo-teal mb-3" size={22} />
                    <p className="font-bold text-gray-900">Bulk from services page</p>
                    <p className="text-xs text-gray-500 mt-1">
                      Paste a listing page like /our-services/ — we find each service and import them.
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddEntryMethod('page')}
                    className="text-left p-5 rounded-xl border border-vailo-teal/20 bg-white hover:border-vailo-teal hover:bg-vailo-teal/5 transition-colors"
                  >
                    <LinkIcon className="text-vailo-teal mb-3" size={22} />
                    <p className="font-bold text-gray-900">Single service page</p>
                    <p className="text-xs text-gray-500 mt-1">
                      Paste one detail page URL and fill this partner from it.
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddEntryMethod('maps')}
                    className="text-left p-5 rounded-xl border border-vailo-teal/20 bg-white hover:border-vailo-teal hover:bg-vailo-teal/5 transition-colors"
                  >
                    <MapPin className="text-vailo-teal mb-3" size={22} />
                    <p className="font-bold text-gray-900">Google Maps (AI fill)</p>
                    <p className="text-xs text-gray-500 mt-1">Paste a Maps place link and let AI fill the details.</p>
                  </button>
                </div>
              </div>
            )}

            {!editingFeatureId && addEntryMethod === 'bulk' && (
              <PartnerWebImportPanel
                variant="bulk"
                areaName={decodedArea}
                country={decodedCountry}
                categories={featuresCategories.map((c) => featureCategoryPrimaryName(c))}
                onChangeMethod={() => setAddEntryMethod('choose')}
                onBulkDrafts={savePartnerDraftsBulk}
              />
            )}

            {(editingFeatureId || (addEntryMethod && addEntryMethod !== 'choose' && addEntryMethod !== 'bulk')) && (
              <>
            {localeSettings.enabledLocales.length > 1 ? (
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
            ) : null}

            {!editingFeatureId && addEntryMethod === 'page' && (
              <PartnerWebImportPanel
                variant="page"
                areaName={decodedArea}
                country={decodedCountry}
                categories={featuresCategories.map((c) => featureCategoryPrimaryName(c))}
                onChangeMethod={() => setAddEntryMethod('choose')}
                onSingleDraft={applyPartnerDraft}
              />
            )}

            {!editingFeatureId && addEntryMethod === 'maps' && (
              <div className="flex flex-col md:flex-row gap-4 mb-8 bg-vailo-teal/5 p-4 rounded-xl border border-vailo-teal/15 items-end">
                <div className="flex-1 w-full">
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-vailo-dark uppercase tracking-wider">Google Maps Link</label>
                    <button type="button" onClick={() => setAddEntryMethod('choose')} className="text-xs font-medium text-vailo-teal hover:underline">Change method</button>
                  </div>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-3 text-vailo-teal/50" size={18} />
                    <input type="url" name="googleMapsUrl" value={formData.googleMapsUrl} onChange={handleChange} placeholder="Paste FULL or Short Google Maps URL here..." className="w-full pl-10 pr-4 py-2.5 bg-white border border-vailo-teal/15 rounded-lg admin-input outline-none text-sm" />
                  </div>
                </div>
                <button type="button" onClick={handleMagicFill} disabled={isMagicFilling || !formData.googleMapsUrl} className="w-full md:w-auto h-[46px] px-6 bg-vailo-teal hover:bg-vailo-teal-hover text-white text-sm font-bold rounded-lg disabled:opacity-50 transition-colors shadow-sm flex items-center justify-center whitespace-nowrap">
                  {isMagicFilling ? <Loader2 size={18} className="animate-spin mr-2" /> : <Wand2 size={18} className="mr-2" />}
                  AI Magic Fill
                </button>
              </div>
            )}

            {editingFeatureId && (
              <div className="flex flex-col md:flex-row gap-4 mb-8 bg-vailo-teal/5 p-4 rounded-xl border border-vailo-teal/15 items-end">
                <div className="flex-1 w-full">
                  <label className="block text-xs font-bold text-vailo-dark uppercase tracking-wider mb-1">Google Maps Link</label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-3 text-vailo-teal/50" size={18} />
                    <input type="url" name="googleMapsUrl" value={formData.googleMapsUrl} onChange={handleChange} placeholder="Paste FULL or Short Google Maps URL here..." className="w-full pl-10 pr-4 py-2.5 bg-white border border-vailo-teal/15 rounded-lg admin-input outline-none text-sm" />
                  </div>
                </div>
                <button type="button" onClick={handleMagicFill} disabled={isMagicFilling || !formData.googleMapsUrl} className="w-full md:w-auto h-[46px] px-6 bg-vailo-teal hover:bg-vailo-teal-hover text-white text-sm font-bold rounded-lg disabled:opacity-50 transition-colors shadow-sm flex items-center justify-center whitespace-nowrap">
                  {isMagicFilling ? <Loader2 size={18} className="animate-spin mr-2" /> : <Wand2 size={18} className="mr-2" />}
                  AI Magic Fill
                </button>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-8">
              
              {/* 2. CORE INFO */}
              <div>
                <div className="mb-6">
                  <label className="block text-sm font-bold text-gray-700 mb-1">Partner name *</label>
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

                <div className="mb-6">
                  <PillSelector
                    label="Categories *"
                    options={featureCategoryPillOptions}
                    isSelected={(value) =>
                      categorySelectionIncludes(
                        normalizedFeatureCategories,
                        value,
                        featureCategoryDocs,
                        localeSettings.primaryLocale
                      )
                    }
                    onToggle={(v) => handlePillToggle(v, featureCategoryDocs)}
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

              {/* 5. COVER PHOTO (Master + Upload) */}
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

              {/* SUBMIT BUTTON */}
              <div className="flex justify-end pt-4 border-t border-gray-100">
                <button type="button" onClick={closeAndResetForm} className="px-6 py-3 mr-4 text-sm font-bold text-gray-700 hover:bg-gray-200 rounded-xl transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={isSubmitting || isUploadingImage} className="flex items-center px-8 py-3 text-sm font-bold text-white bg-vailo-teal hover:bg-vailo-teal-hover rounded-xl disabled:opacity-50 transition-colors shadow-md hover:shadow-lg">
                  {(isSubmitting || isUploadingImage) && <Loader2 size={18} className="mr-2 animate-spin" />}
                  {isUploadingImage ? 'Uploading Photo...' : isSubmitting ? 'Saving...' : 'Save Partner'}
                </button>
              </div>

            </form>
              </>
            )}
          </div>
        </div>
      )}

      {/* LIST VIEW */}
      {isLoading ? (
        <div className="py-20 text-center text-gray-400"><Loader2 size={40} className="animate-spin mx-auto mb-4" /></div>
      ) : features.length === 0 && !isFormOpen ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-xl p-12 text-center">
          <Briefcase size={40} className="mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-bold text-gray-900 mb-2">No Partners Yet</h3>
          <p className="text-gray-500">Create the first master partner for {decodedArea}.</p>
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
              </div>
              <div className="p-5 flex-1 flex flex-col">
                <h3 className="font-bold text-lg text-gray-900 mb-1">{feat.name}</h3>
                <p className="text-sm text-gray-500 mb-4 line-clamp-2 flex-1">{feat.description}</p>
                
                <div className="flex flex-wrap gap-2 mb-4">
                  {feat.website && <span className="text-[10px] font-bold bg-vailo-teal/10 text-vailo-dark px-2 py-1 rounded-md">Website</span>}
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