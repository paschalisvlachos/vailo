import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAreaRouteParams } from '../../../hooks/useAreaRouteParams';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, ai } from '../../../lib/firebase';
import { useToast } from '../../../context/ToastContext';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { httpsCallableMessage } from '../../../lib/callableError';
import { PLACES_USAGE_CALLER } from '../../../lib/placesApiUsageCallers';
import { getGenerativeModel } from "firebase/ai";
import {
  Plus,
  MapPin,
  Wand2,
  Star,
  Image as ImageIcon,
  Pencil,
  Trash2,
  Map,
  Loader2,
  Tag,
  Languages,
  Sparkles,
  X,
  RefreshCw,
  ExternalLink,
  Search,
} from 'lucide-react';
import { AdminCard, AdminEmptyState, AdminInput } from '../../../components/admin/AdminPageHeader';
import { adminPath } from '../../../lib/adminRoutes';
import AreaHubBackLink from '../../../components/admin/AreaHubBackLink';
import ContentLocaleTabs from '../../../components/admin/ContentLocaleTabs';
import { usePlatformLanguages } from '../../../hooks/usePlatformLanguages';
import { useAreaContentLocaleSettings } from '../../../hooks/useAreaContentLocaleSettings';
import { useContentLocaleEditor } from '../../../hooks/useContentLocaleEditor';
import { translateContentFields } from '../../../lib/adminContentTranslate';
import {
  categoryPrimaryName,
  categorySelectionIncludes,
  gemCategoryPrimaries,
  normalizeCategorySelectionList,
  resolveCategoryLabel,
} from '../../../lib/categoryLocale';
import CategoryPillSelector from '../../../components/admin/CategoryPillSelector';
import { syncAllPropertyGemsToArea } from '../../../lib/propertyGemAreaSync';
import { dedupeAlternateTitles } from '../../../lib/alternateTitles';

function areaGemRowClass(index: number): string {
  return index % 2 === 0 ? 'bg-white' : 'bg-gray-50/90';
}

function gemMatchesSearch(gem: { name?: string }, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return String(gem.name || '').toLowerCase().includes(q);
}

export default function AreaLocalGems() {
  const navigate = useNavigate();
  const toast = useToast();
  const { country: decodedCountry, areaId, areaName: decodedArea } = useAreaRouteParams();

  const [gems, setGems] = useState<any[]>([]);
  const [categories, setCategories] = useState<{ id: string; data: Record<string, unknown> }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchText, setSearchText] = useState('');
  const [editingGemId, setEditingGemId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMagicFilling, setIsMagicFilling] = useState(false);
  const [isSyncingPropertyGems, setIsSyncingPropertyGems] = useState(false);
  
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const initialFormState = {
    name: '',
    category: '',
    categories: [] as string[],
    rating: '',
    description: '',
    latitude: '',
    longitude: '',
    googleMapsUrl: '',
    photoUrl: '',
    isDailyTrip: false,
    alternateTitlesText: '',
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

  const categoryCatalogDocs = useMemo(
    () => categories.map((c) => c.data),
    [categories]
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

  const categoryFilterOptions = useMemo(
    () =>
      categories.map((cat) => {
        const primaryName = categoryPrimaryName(cat.data, localeSettings.primaryLocale);
        const label = resolveCategoryLabel(
          cat.data,
          localeSettings.primaryLocale,
          localeSettings.primaryLocale
        );
        return { value: primaryName, label: label || primaryName };
      }),
    [categories, localeSettings.primaryLocale]
  );

  const sortedGems = useMemo(
    () => [...gems].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))),
    [gems]
  );

  const filteredGems = useMemo(() => {
    let list = sortedGems;
    if (categoryFilter !== 'all') {
      list = list.filter((gem) =>
        gemCategoryPrimaries(gem, categoryCatalogDocs, localeSettings.primaryLocale).some(
          (cat) => cat.toLowerCase() === categoryFilter.toLowerCase()
        )
      );
    }
    return list.filter((gem) => gemMatchesSearch(gem, searchText));
  }, [sortedGems, categoryFilter, searchText, categoryCatalogDocs, localeSettings.primaryLocale]);

  const hasSearch = searchText.trim().length > 0;

  const gemCountForCategory = (value: string) => {
    if (value === 'all') return sortedGems.length;
    return sortedGems.filter((gem) =>
      gemCategoryPrimaries(gem, categoryCatalogDocs, localeSettings.primaryLocale).some(
        (cat) => cat.toLowerCase() === value.toLowerCase()
      )
    ).length;
  };

  const categoryPillOptions = useMemo(
    () =>
      categories.map((cat) => {
        const primaryName = categoryPrimaryName(cat.data, localeSettings.primaryLocale);
        const label = resolveCategoryLabel(
          cat.data,
          localeEditor.contentLocale,
          localeSettings.primaryLocale
        );
        return { value: primaryName, label: label || primaryName };
      }),
    [categories, localeEditor.contentLocale, localeSettings.primaryLocale]
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

  // 1. Fetch Dynamic Categories
  useEffect(() => {
    if (!decodedCountry || !areaId) return;
    const catRef = collection(db, 'countries', decodedCountry, 'areas', areaId, 'localGemsCategories');
    const unsubscribe = onSnapshot(catRef, (snapshot) => {
      const fetchedCats = snapshot.docs.map((d) => ({
        id: d.id,
        data: d.data() as Record<string, unknown>,
      }));
      fetchedCats.sort((a, b) =>
        categoryPrimaryName(a.data, localeSettings.primaryLocale).localeCompare(
          categoryPrimaryName(b.data, localeSettings.primaryLocale)
        )
      );
      setCategories(fetchedCats);
      // 🔥 Fixed: Removed the code that auto-selected the first category
    });
    return () => unsubscribe();
  }, [decodedCountry, areaId, localeSettings.primaryLocale]);

  // 2. Fetch Area Gems
  useEffect(() => {
    if (!decodedCountry || !areaId) return;
    const gemsRef = collection(db, 'countries', decodedCountry, 'areas', areaId, 'localGems');
    const unsubscribe = onSnapshot(gemsRef, (snapshot) => {
      const fetchedGems = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setGems(fetchedGems);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, [decodedCountry, areaId]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      setFormData({ ...formData, [name]: (e.target as HTMLInputElement).checked });
    } else {
      setFormData({ ...formData, [name]: value });
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  // --- AI MAGIC FILL (Upgraded for Short Links) ---
  const handleMagicFill = async () => {
    const url = formData.googleMapsUrl;
    if (!url) {
      toast.warning("Please paste a Google Maps URL first.");
      return;
    }
    setIsMagicFilling(true);

    try {
      const placeNameMatch = url.match(/\/place\/([^/?@]+)/);
      const placeNameFallback = placeNameMatch?.[1]
        ? decodeURIComponent(placeNameMatch[1].replace(/\+/g, ' '))
        : '';

      const functions = getFunctions();
      const getGooglePlaceDetails = httpsCallable(functions, 'getGooglePlaceDetails');
      const result = await getGooglePlaceDetails({
        searchQuery: url.trim(),
        area: decodedArea,
        usageCaller: PLACES_USAGE_CALLER.areaLocalGems,
      });
      const googleData: any = result.data;

      // Try to intelligently map Google's category to one of our dynamic categories
      let matchedCategory = ""; // Default to unselected
      const gType = googleData.category?.toLowerCase() || "";
      const possibleMatch = categories.find((c) => {
        const name = categoryPrimaryName(c.data, localeSettings.primaryLocale);
        const lower = name.toLowerCase();
        return gType.includes(lower) || lower.includes(gType);
      });
      if (possibleMatch) {
        matchedCategory = categoryPrimaryName(possibleMatch.data, localeSettings.primaryLocale);
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

      // AI Description Fallback
      let finalDescription = googleData.description;
      if (!finalDescription) {
        try {
          const prompt = `Act as a luxury travel concierge for ${decodedArea}, ${decodedCountry}. Write a short, engaging 2-sentence description for a local spot called "${googleData.name || placeNameFallback}". Tell guests why they should visit. Return ONLY the description text, no quotes.`;
          const model = getGenerativeModel(ai, { model: "gemini-2.5-flash" });
          const aiResult = await model.generateContent(prompt);
          finalDescription = aiResult.response.text().trim();
        } catch (e) {
          console.log("Gemini fallback failed.", e);
        }
      }

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
        photoUrl: googleData.photoUrl || '',
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
      toast.error(
        httpsCallableMessage(
          error,
          "Could not load this place. Use a full Google Maps place link, or try again in a moment."
        )
      );
    } finally {
      setIsMagicFilling(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (normalizedGemCategories.length === 0) {
      toast.warning('Select at least one category.');
      return;
    }
    setIsSubmitting(true);

    try {
      let finalPhotoUrl = formData.photoUrl;

      if (imageFile) {
        setIsUploadingImage(true);
        const storageRef = ref(storage, `areas/${decodedCountry}/${areaId}/gems/${Date.now()}_${imageFile.name}`);
        await uploadBytes(storageRef, imageFile);
        finalPhotoUrl = await getDownloadURL(storageRef);
        setIsUploadingImage(false);
      }

      const { alternateTitlesText, ...formRest } = formData;
      const alternateTitles = dedupeAlternateTitles(
        formData.name,
        alternateTitlesText
          .split(/[\n,]+/)
          .map((s) => s.trim())
          .filter(Boolean)
      );

      const gemData = {
        ...formRest,
        categories: normalizedGemCategories,
        category: normalizedGemCategories[0] || '',
        ...localeEditor.buildPayload(),
        photoUrl: finalPhotoUrl,
        alternateTitles,
        updatedAt: new Date().toISOString(),
      };

      if (editingGemId) {
        await updateDoc(doc(db, 'countries', decodedCountry, 'areas', areaId, 'localGems', editingGemId), gemData);
      } else {
        await addDoc(collection(db, 'countries', decodedCountry, 'areas', areaId, 'localGems'), gemData);
      }

      closeForm();
    } catch (error) {
      console.error("Error saving Gem:", error);
      toast.error("Failed to save Local Gem.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingGemId(null);
    setEditingSourceDoc(null);
    localeEditor.resetMaps();
    setFormData(initialFormState);
    setImageFile(null);
    setImagePreview(null);
  };

  const openAddForm = () => {
    setEditingSourceDoc(null);
    localeEditor.resetMaps();
    setFormData(initialFormState);
    setImagePreview(null);
    setImageFile(null);
    setEditingGemId(null);
    setIsFormOpen(true);
  };

  useEffect(() => {
    if (!isFormOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isFormOpen]);

  const handleEdit = (gem: any) => {
    const normalized = gemCategoryPrimaries(
      gem,
      categoryCatalogDocs,
      localeSettings.primaryLocale
    );
    setEditingSourceDoc(gem);
    setFormData({
      ...gem,
      categories: normalized,
      category: normalized[0] || '',
      alternateTitlesText: Array.isArray(gem.alternateTitles)
        ? gem.alternateTitles.join('\n')
        : '',
    });
    setImagePreview(gem.photoUrl);
    setEditingGemId(gem.id);
    setIsFormOpen(true);
  };

  const handleSyncPropertyGems = async () => {
    setIsSyncingPropertyGems(true);
    try {
      const stats = await syncAllPropertyGemsToArea({
        country: decodedCountry,
        areaId,
        masterArea: decodedArea,
      });
      toast.success(
        `Property gem sync done — ${stats.created} added, ${stats.updated} updated, ${stats.skipped} skipped (duplicate name+location).`
      );
    } catch (err) {
      console.error(err);
      toast.error('Failed to sync property local gems.');
    } finally {
      setIsSyncingPropertyGems(false);
    }
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
      toast.error('Auto-translate failed.');
    } finally {
      setIsLocaleTranslating(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (window.confirm(`Are you sure you want to delete ${name}?`)) {
      await deleteDoc(doc(db, 'countries', decodedCountry, 'areas', areaId, 'localGems', id));
    }
  };

  const renderGemForm = () => (
    <form id="local-gem-form" onSubmit={handleSubmit} className="space-y-5">
      <div className="flex flex-col sm:flex-row gap-3 bg-vailo-teal/5 p-3 sm:p-4 rounded-xl border border-vailo-teal/10 items-stretch sm:items-center">
        <div className="flex-1 w-full min-w-0">
          <label className="block text-xs font-bold text-vailo-dark uppercase tracking-wider mb-1">
            Google Maps Link
          </label>
          <div className="relative">
            <MapPin className="absolute left-3 top-2.5 text-vailo-teal/50" size={16} />
            <input
              type="url"
              name="googleMapsUrl"
              value={formData.googleMapsUrl}
              onChange={handleChange}
              placeholder="Paste FULL or Short Google Maps URL here..."
              className="w-full pl-9 pr-3 py-2 bg-white border border-vailo-teal/15 rounded-lg admin-input outline-none text-sm"
            />
          </div>
        </div>
        <button
          type="button"
          onClick={handleMagicFill}
          disabled={isMagicFilling || !formData.googleMapsUrl}
          className="w-full sm:w-auto shrink-0 px-5 py-2.5 bg-vailo-teal hover:bg-vailo-teal-hover text-white text-sm font-bold rounded-lg disabled:opacity-50 transition-colors shadow-sm flex items-center justify-center whitespace-nowrap"
        >
          {isMagicFilling ? (
            <Loader2 size={16} className="animate-spin mr-2" />
          ) : (
            <Wand2 size={16} className="mr-2" />
          )}
          AI Magic Fill
        </button>
      </div>

      <div className="rounded-xl border border-orange-200 bg-orange-50/50 p-3 sm:p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-sm font-bold text-orange-900 flex items-center gap-2">
            <Languages size={16} /> Content language
          </p>
          {localeEditor.contentLocale !== localeSettings.primaryLocale && (
            <button
              type="button"
              onClick={handleAutoTranslateLocale}
              disabled={isLocaleTranslating}
              className="flex items-center px-3 py-2 bg-white border border-orange-300 rounded-lg text-xs sm:text-sm font-medium text-orange-800 disabled:opacity-50"
            >
              {isLocaleTranslating ? (
                <Loader2 size={16} className="animate-spin mr-2" />
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className="block text-sm font-bold text-gray-700 mb-1">Name *</label>
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
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none text-sm"
          />
        </div>
        <div className="sm:col-span-2">
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
            colorClass="orange"
          />
        </div>
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-1">Google Rating (1-5)</label>
          <input
            type="number"
            step="0.1"
            max="5"
            name="rating"
            value={formData.rating}
            onChange={handleChange}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-1">Daily Trip?</label>
          <div className="flex items-center h-[42px]">
            <input
              type="checkbox"
              name="isDailyTrip"
              checked={formData.isDailyTrip}
              onChange={handleChange}
              className="h-5 w-5 text-orange-600 rounded cursor-pointer"
            />
            <span className="ml-2 text-sm text-gray-600">Tag as a full-day excursion</span>
          </div>
        </div>
      </div>

      <div>
        <label className="block text-sm font-bold text-gray-700 mb-1">AI Description *</label>
        <textarea
          required
          rows={4}
          value={localeEditor.getValue('description')}
          onChange={(e) => {
            localeEditor.setValue('description', e.target.value);
            if (localeEditor.contentLocale === localeSettings.primaryLocale) {
              setFormData((prev) => ({ ...prev, description: e.target.value }));
            }
          }}
          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none resize-y text-sm min-h-[100px]"
        />
      </div>

      <div>
        <label className="block text-sm font-bold text-gray-700 mb-1">
          Alternative titles (AI matching)
        </label>
        <textarea
          rows={3}
          name="alternateTitlesText"
          value={formData.alternateTitlesText}
          onChange={handleChange}
          placeholder={'One per line — spelling variants guests or AI might use\ne.g. Kalivaki beach'}
          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none resize-y text-sm min-h-[72px]"
        />
        <p className="text-xs text-gray-500 mt-1">
          Used by AI Expert to match picks — not shown on property local gems.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-1">Latitude</label>
          <input
            type="text"
            name="latitude"
            value={formData.latitude}
            onChange={handleChange}
            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-300 rounded-lg outline-none text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-1">Longitude</label>
          <input
            type="text"
            name="longitude"
            value={formData.longitude}
            onChange={handleChange}
            className="w-full px-3 py-2.5 bg-gray-50 border border-gray-300 rounded-lg outline-none text-sm"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-bold text-gray-700 mb-2">Cover Photo</label>
        <div className="flex flex-col sm:flex-row items-start gap-4">
          <div className="w-full sm:w-40 h-28 rounded-xl border-2 border-dashed border-gray-300 overflow-hidden bg-gray-50 flex items-center justify-center shrink-0">
            {imagePreview ? (
              <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
            ) : (
              <div className="text-gray-400 flex flex-col items-center">
                <ImageIcon size={22} className="mb-1" />
                <span className="text-xs font-medium">No Image</span>
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <input
              type="file"
              accept="image/*"
              onChange={handleImageChange}
              className="block w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100 cursor-pointer"
            />
            <p className="text-xs text-gray-500 mt-2">
              Uploading manually will override the Google Maps photo.
            </p>
          </div>
        </div>
      </div>
    </form>
  );

  if (categories.length === 0 && !isLoading) {
    return (
      <div className="admin-page">
        <div className="bg-white border border-dashed border-gray-300 rounded-xl p-12 text-center">
          <Tag size={40} className="mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-bold text-gray-900 mb-2">No Categories Found</h3>
          <p className="text-gray-500 mb-6">You must create at least one Local Gems Category before adding gems.</p>
          <button onClick={() => navigate(adminPath(`/area/${encodeURIComponent(decodedCountry)}/${encodeURIComponent(areaId)}/local-gems-categories`))} className="px-6 py-3 bg-vailo-teal text-white font-medium rounded-xl hover:bg-vailo-teal-hover transition-colors">
            Go to Categories
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <AreaHubBackLink />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center">
            <Map className="mr-2.5 text-orange-600 shrink-0" size={26} />
            Master Local Gems
          </h2>
          <p className="text-sm text-gray-500 mt-1.5">
            Global gems for{' '}
            <span className="font-bold text-orange-700">
              {decodedArea}, {decodedCountry}
            </span>
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <button
            type="button"
            onClick={handleSyncPropertyGems}
            disabled={isSyncingPropertyGems}
            className="flex items-center justify-center px-4 py-2.5 bg-white border border-orange-200 text-orange-800 text-sm font-bold rounded-lg hover:bg-orange-50 transition-colors shadow-sm w-full sm:w-auto disabled:opacity-60"
          >
            {isSyncingPropertyGems ? (
              <Loader2 size={18} className="mr-2 animate-spin" />
            ) : (
              <RefreshCw size={18} className="mr-2" />
            )}
            {isSyncingPropertyGems ? 'Syncing…' : 'Sync property gems'}
          </button>
          <button
            type="button"
            onClick={openAddForm}
            className="flex items-center justify-center px-4 py-2.5 bg-orange-600 text-white text-sm font-bold rounded-lg hover:bg-orange-700 transition-colors shadow-sm w-full sm:w-auto"
          >
            <Plus size={18} className="mr-2" /> Add Gem
          </button>
        </div>
      </div>

      {/* Category filters */}
      {!isLoading && sortedGems.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setCategoryFilter('all')}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${
              categoryFilter === 'all'
                ? 'bg-orange-600 text-white border-orange-600 shadow-sm'
                : 'bg-white text-gray-600 border-gray-200 hover:border-orange-300 hover:text-orange-700'
            }`}
          >
            All ({gemCountForCategory('all')})
          </button>
          {categoryFilterOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setCategoryFilter(opt.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all border whitespace-nowrap ${
                categoryFilter === opt.value
                  ? 'bg-orange-600 text-white border-orange-600 shadow-sm'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-orange-300 hover:text-orange-700'
              }`}
            >
              {opt.label} ({gemCountForCategory(opt.value)})
            </button>
          ))}
        </div>
      )}

      {!isLoading && sortedGems.length > 0 && (
        <div className="relative mb-4">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
          />
          <AdminInput
            type="search"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search by place name…"
            className="pl-9 py-2 text-sm"
            aria-label="Search local gems"
          />
        </div>
      )}

      {isLoading ? (
        <div className="py-16 text-center text-gray-400">
          <Loader2 size={32} className="animate-spin mx-auto mb-3" />
          <p className="text-sm">Loading gems…</p>
        </div>
      ) : sortedGems.length === 0 ? (
        <AdminEmptyState
          icon={<Map size={28} />}
          title="No Local Gems Added"
          description={`Add the first local gem for ${decodedArea}.`}
        />
      ) : filteredGems.length === 0 ? (
        <AdminEmptyState
          icon={<Tag size={28} />}
          title={hasSearch ? 'No matching gems' : 'No gems in this category'}
          description={
            hasSearch
              ? `Nothing matches "${searchText.trim()}".`
              : 'Try another filter or add a gem with this category.'
          }
        />
      ) : (
        <AdminCard className="overflow-hidden">
          <div className="hidden lg:grid lg:grid-cols-[2.5rem_1fr_10rem_5rem_5rem] gap-3 px-4 py-2 bg-gray-50 border-b border-gray-200/80 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
            <span />
            <span>Place</span>
            <span>Categories</span>
            <span>Rating</span>
            <span className="text-right">Actions</span>
          </div>
          <ul className="divide-y divide-gray-200/80">
            {filteredGems.map((gem, index) => {
              const gemCats = gemCategoryPrimaries(
                gem,
                categoryCatalogDocs,
                localeSettings.primaryLocale
              );
              return (
                <li key={gem.id} className={areaGemRowClass(index)}>
                  <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-2.5 min-h-[52px]">
                    <div className="h-10 w-10 sm:h-11 sm:w-11 rounded-lg bg-gray-100 overflow-hidden shrink-0 border border-gray-100">
                      {gem.photoUrl ? (
                        <img
                          src={gem.photoUrl}
                          alt=""
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center text-gray-300">
                          <ImageIcon size={16} />
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0 lg:grid lg:grid-cols-[1fr_10rem_5rem] lg:gap-3 lg:items-center">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="font-semibold text-sm text-gray-900 truncate">
                            {gem.name}
                          </span>
                          {gem.isDailyTrip && (
                            <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-vailo-teal/10 text-vailo-teal">
                              Day trip
                            </span>
                          )}
                          {gem.insertedByLabel && (
                            <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-sky-100 text-sky-800">
                              {gem.insertedByLabel}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-gray-400 truncate mt-0.5 lg:hidden">
                          {gemCats.join(', ') || 'Uncategorized'}
                          {gem.rating ? ` · ★ ${gem.rating}` : ''}
                        </p>
                        {gem.description && (
                          <p className="hidden sm:block text-[11px] text-gray-400 truncate mt-0.5 max-w-xl">
                            {gem.description}
                          </p>
                        )}
                      </div>

                      <div className="hidden lg:flex flex-wrap gap-1">
                        {gemCats.length > 0 ? (
                          gemCats.map((cat: string) => (
                            <span
                              key={cat}
                              className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-orange-50 text-orange-800 border border-orange-100 whitespace-nowrap"
                            >
                              {cat}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </div>

                      <span className="hidden lg:flex items-center gap-0.5 text-xs text-gray-600">
                        {gem.rating ? (
                          <>
                            <Star size={11} className="text-yellow-500 fill-yellow-500" />
                            {gem.rating}
                          </>
                        ) : (
                          '—'
                        )}
                      </span>
                    </div>

                    <div className="flex items-center gap-0.5 shrink-0">
                      {gem.googleMapsUrl && (
                        <a
                          href={gem.googleMapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Open in Maps"
                          className="p-1.5 rounded-lg text-gray-400 hover:text-vailo-teal hover:bg-vailo-teal/5 transition-colors"
                        >
                          <ExternalLink size={15} />
                        </a>
                      )}
                      <button
                        type="button"
                        title="Edit"
                        onClick={() => handleEdit(gem)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-vailo-teal hover:bg-vailo-teal/5 transition-colors"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        title="Delete"
                        onClick={() => handleDelete(gem.id, gem.name)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </AdminCard>
      )}

      {/* Add / Edit modal */}
      {isFormOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-gray-900/45 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="local-gem-modal-title"
          onClick={closeForm}
        >
          <div
            className="bg-white w-full sm:max-w-2xl lg:max-w-3xl max-h-[92dvh] sm:max-h-[min(90vh,880px)] flex flex-col rounded-t-2xl sm:rounded-2xl shadow-2xl animate-in fade-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 px-4 sm:px-6 py-4 border-b border-orange-100 bg-orange-50 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3
                  id="local-gem-modal-title"
                  className="text-lg font-bold text-orange-900 truncate"
                >
                  {editingGemId ? 'Edit Local Gem' : 'Add New Local Gem'}
                </h3>
                <p className="text-xs text-orange-700/80 mt-0.5">
                  {decodedArea}, {decodedCountry}
                </p>
              </div>
              <button
                type="button"
                onClick={closeForm}
                className="p-2 rounded-lg text-orange-600 hover:bg-orange-100 transition-colors shrink-0"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain px-4 sm:px-6 py-4 sm:py-5">
              {renderGemForm()}
            </div>

            <div className="shrink-0 px-4 sm:px-6 py-4 border-t border-gray-100 bg-gray-50/80 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <button
                type="button"
                onClick={closeForm}
                disabled={isSubmitting || isUploadingImage}
                className="w-full sm:w-auto px-5 py-2.5 text-sm font-semibold text-gray-600 hover:text-gray-900 rounded-xl border border-gray-200 bg-white disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="local-gem-form"
                disabled={isSubmitting || isUploadingImage}
                className="w-full sm:w-auto flex items-center justify-center px-6 py-2.5 bg-gray-900 text-white text-sm font-bold rounded-xl hover:bg-black disabled:opacity-50 transition-colors shadow-md"
              >
                {isSubmitting || isUploadingImage ? (
                  <Loader2 size={18} className="animate-spin mr-2" />
                ) : null}
                Save Local Gem
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}