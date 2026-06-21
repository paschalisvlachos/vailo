import { useState, useEffect, useMemo, useRef } from 'react';
import { useAreaRouteParams } from '../../../hooks/useAreaRouteParams';
import { collection, updateDoc, deleteDoc, doc, onSnapshot, writeBatch } from 'firebase/firestore';
import { ai, db } from '../../../lib/firebase';
import { getGenerativeModel } from 'firebase/ai';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useToast } from '../../../context/ToastContext';
import { adminPath } from '../../../lib/adminRoutes';
import { httpsCallableMessage } from '../../../lib/callableError';
import { PLACES_USAGE_CALLER } from '../../../lib/placesApiUsageCallers';
import {
  bareGooglePlaceId,
  extractPlaceIdFromMapsUrl,
  extractPlaceIdFromPlacesPhotoUrl,
} from '../../../lib/geocoding';
import {
  isVerifiedGoogleMapsShortUrl,
  verifiedGoogleMapsUrlHint,
} from '../../../lib/verifiedGoogleMapsUrl';
import {
  compareDiscoveredPlaces,
  type CompareDiscoveredPlacesResult,
} from '../../../lib/discoveredPlaceCompare';
import {
  buildDiscoveredPlaceMergePlan,
  type DiscoveredPlaceMergePlan,
} from '../../../lib/discoveredPlaceMerge';
import {
  suggestAlternatePlaceTitles,
  mergeAlternateTitleLists,
  filterAlternateTitleVocabularyVariants,
} from '../../../lib/alternateTitles';
import {
  formatGoogleCategoriesList,
  googleCategoriesFromPlace,
  isGooglePlaceCategory,
  mergeGoogleCategoriesText,
  parseGoogleCategoriesText,
} from '../../../lib/googlePlaceCategories';
import {
  categoryPrimaryName,
  categorySelectionIncludes,
  gemCategoryPrimaries,
  normalizeCategorySelectionList,
  resolveCategoryLabel,
} from '../../../lib/categoryLocale';
import { useAreaContentLocaleSettings } from '../../../hooks/useAreaContentLocaleSettings';
import CategoryPillSelector from '../../../components/admin/CategoryPillSelector';
import {
  Radar,
  CheckCircle2,
  Check,
  Gem,
  Pencil,
  Eye,
  EyeOff,
  Loader2,
  ExternalLink,
  Star,
  MapPin,
  X,
  Save,
  Wand2,
  Sparkles,
  Trash2,
  Search,
  GitCompare,
  GitMerge,
} from 'lucide-react';
import {
  AdminBackHeader,
  AdminBadge,
  AdminButton,
  AdminCard,
  AdminEmptyState,
  AdminInput,
  AdminTextarea,
  AdminLabel,
} from '../../../components/admin/AdminPageHeader';

type DiscoveredPlace = {
  id: string;
  name?: string;
  category?: string;
  categories?: string[];
  googleCategories?: string[];
  description?: string;
  latitude?: number | null;
  longitude?: number | null;
  googleMapsUrl?: string;
  verifiedGoogleMapsUrl?: string;
  googlePlaceId?: string | null;
  photoUrl?: string;
  rating?: number | null;
  usageCount?: number;
  source?: string;
  reviewStatus?: string;
  status?: string;
  promotedToLocalGemId?: string | null;
  alternateTitles?: string[];
  lastFailureReason?: string;
  lastMatchedTitle?: string;
};

/** Rating ≤ 4.0 — highlight row for review. */
function isLowGoogleRating(rating: number | null | undefined): boolean {
  return typeof rating === 'number' && rating > 0 && rating <= 4;
}

/** Rating > 4.5 — show a green tick beside the rating. */
function isHighGoogleRating(rating: number | null | undefined): boolean {
  return typeof rating === 'number' && rating > 4.5;
}

function discoveredPlaceRowClass(
  place: DiscoveredPlace,
  index: number
): string {
  if (place.status === 'hidden') return 'bg-gray-100/70';
  if (isLowGoogleRating(place.rating)) return 'bg-red-50/90';
  return index % 2 === 0 ? 'bg-white' : 'bg-gray-50/90';
}

function placeMatchesSearch(place: DiscoveredPlace, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return String(place.name || '').toLowerCase().includes(q);
}

function isAiGuestPlace(place: DiscoveredPlace): boolean {
  return String(place.source || '').toLowerCase() === 'ai_guest';
}

function parseCoord(value: string | number | null | undefined): number | null {
  if (typeof value === 'number' && !Number.isNaN(value)) return value;
  const parsed = parseFloat(String(value ?? '').trim());
  return Number.isNaN(parsed) ? null : parsed;
}

function placeCategoryLabels(
  place: DiscoveredPlace,
  catalogDocs: Record<string, unknown>[],
  primaryLocale: string
): string[] {
  return gemCategoryPrimaries(place as Record<string, unknown>, catalogDocs, primaryLocale);
}

function formatPlaceCategoryDisplay(
  place: DiscoveredPlace,
  catalogDocs: Record<string, unknown>[],
  primaryLocale: string
): string {
  const labels = placeCategoryLabels(place, catalogDocs, primaryLocale).filter(
    (label) => !isGooglePlaceCategory(label, catalogDocs, primaryLocale)
  );
  return labels.length > 0 ? labels.join(', ') : 'Uncategorized';
}

function placeGoogleCategoryLabels(
  place: DiscoveredPlace,
  catalogDocs: Record<string, unknown>[],
  primaryLocale: string
): string[] {
  return googleCategoriesFromPlace(place, catalogDocs, primaryLocale);
}

function PlaceCategoryDisplay({
  place,
  catalogDocs,
  primaryLocale,
  primaryClassName = 'truncate',
  googleClassName = 'text-[10px] text-gray-400 truncate',
}: {
  place: DiscoveredPlace;
  catalogDocs: Record<string, unknown>[];
  primaryLocale: string;
  primaryClassName?: string;
  googleClassName?: string;
}) {
  const primary = formatPlaceCategoryDisplay(place, catalogDocs, primaryLocale);
  const googleLabels = placeGoogleCategoryLabels(place, catalogDocs, primaryLocale);
  const googleText = googleLabels.length > 0 ? googleLabels.join(', ') : '';

  return (
    <span className="inline-flex flex-col min-w-0 max-w-full">
      <span className={primaryClassName}>{primary}</span>
      {googleText ? (
        <span className={googleClassName} title={googleText}>
          ({googleText})
        </span>
      ) : null}
    </span>
  );
}

function getPromoteBlockReason(place: DiscoveredPlace): string | null {
  if (place.promotedToLocalGemId) return 'Already promoted';
  if (place.reviewStatus !== 'reviewed') return 'Not reviewed';
  if (!isVerifiedGoogleMapsShortUrl((place.verifiedGoogleMapsUrl || '').trim())) {
    return 'Missing verified Maps link';
  }
  if (placeCategoryLabels(place, [], 'en').length === 0) return 'Missing category';
  return null;
}

function placeToLocalGemPayload(
  place: DiscoveredPlace,
  catalogDocs: Record<string, unknown>[],
  primaryLocale: string
) {
  const normalizedCategories = placeCategoryLabels(place, catalogDocs, primaryLocale);
  return {
    name: place.name || '',
    category: normalizedCategories[0] || '',
    categories: normalizedCategories,
    rating: place.rating != null ? String(place.rating) : '',
    description: place.description || '',
    latitude: place.latitude != null ? String(place.latitude) : '',
    longitude: place.longitude != null ? String(place.longitude) : '',
    googleMapsUrl: (place.verifiedGoogleMapsUrl || '').trim(),
    photoUrl: place.photoUrl || '',
    isDailyTrip: false,
    alternateTitles: place.alternateTitles || [],
    updatedAt: new Date(),
    sourceDiscoveredPlaceId: place.id,
  };
}

function PlaceThumb({ photoUrl }: { photoUrl?: string }) {
  return (
    <div className="h-10 w-10 sm:h-11 sm:w-11 rounded-lg bg-vailo-surface-elevated overflow-hidden shrink-0 border border-gray-100">
      {photoUrl ? (
        <img src={photoUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <div className="h-full w-full flex items-center justify-center text-gray-300">
          <MapPin size={16} />
        </div>
      )}
    </div>
  );
}

function IconBtn({
  title,
  onClick,
  href,
  children,
  className = '',
}: {
  title: string;
  onClick?: () => void;
  href?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const cls = `p-1.5 rounded-lg text-gray-400 hover:text-vailo-teal hover:bg-vailo-teal/5 transition-colors ${className}`;
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" title={title} className={cls}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" title={title} onClick={onClick} className={cls}>
      {children}
    </button>
  );
}

export default function AreaDiscoveredPlaces() {
  const toast = useToast();
  const { country: decodedCountry, areaId, areaName: decodedArea } = useAreaRouteParams();
  const localeSettings = useAreaContentLocaleSettings(decodedCountry, areaId);

  const [places, setPlaces] = useState<DiscoveredPlace[]>([]);
  const [categories, setCategories] = useState<{ id: string; data: Record<string, unknown> }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isMagicFilling, setIsMagicFilling] = useState(false);
  const [filter, setFilter] = useState<'needsReview' | 'aiGuest' | 'reviewed' | 'hidden'>('needsReview');
  const [searchText, setSearchText] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareResult, setCompareResult] = useState<CompareDiscoveredPlacesResult | null>(null);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergePlan, setMergePlan] = useState<DiscoveredPlaceMergePlan | null>(null);
  const [isMerging, setIsMerging] = useState(false);
  const [isBulkPromoting, setIsBulkPromoting] = useState(false);
  const [enrichingId, setEnrichingId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    category: '',
    categories: [] as string[],
    description: '',
    latitude: '',
    longitude: '',
    verifiedGoogleMapsUrl: '',
    photoUrl: '',
    rating: '',
    alternateTitlesText: '',
    googleCategoriesText: '',
  });

  useEffect(() => {
    if (!decodedCountry || !areaId) return;
    const catRef = collection(db, 'countries', decodedCountry, 'areas', areaId, 'localGemsCategories');
    return onSnapshot(catRef, (snapshot) => {
      const fetched = snapshot.docs.map((d) => ({
        id: d.id,
        data: d.data() as Record<string, unknown>,
      }));
      fetched.sort((a, b) =>
        categoryPrimaryName(a.data, localeSettings.primaryLocale).localeCompare(
          categoryPrimaryName(b.data, localeSettings.primaryLocale)
        )
      );
      setCategories(fetched);
    });
  }, [decodedCountry, areaId, localeSettings.primaryLocale]);

  const categoryCatalogDocs = useMemo(
    () => categories.map((c) => c.data),
    [categories]
  );

  const normalizedFormCategories = useMemo(
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
      const toCapture: string[] = [];
      for (const c of [...current, prev.category]) {
        if (isGooglePlaceCategory(c, categoryCatalogDocs, localeSettings.primaryLocale)) {
          toCapture.push(c);
        }
      }
      const googleCategoriesText =
        toCapture.length > 0
          ? mergeGoogleCategoriesText(prev.googleCategoriesText, ...toCapture)
          : prev.googleCategoriesText;
      return {
        ...prev,
        categories: normalized,
        category: normalized[0] || '',
        googleCategoriesText,
      };
    });
  };

  useEffect(() => {
    if (!decodedCountry || !areaId) return;
    const ref = collection(db, 'countries', decodedCountry, 'areas', areaId, 'discoveredPlaces');
    return onSnapshot(ref, (snapshot) => {
      const rows = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as DiscoveredPlace[];
      rows.sort((a, b) => {
        if (a.reviewStatus === 'new' && b.reviewStatus !== 'new') return -1;
        if (b.reviewStatus === 'new' && a.reviewStatus !== 'new') return 1;
        return (b.usageCount || 0) - (a.usageCount || 0);
      });
      setPlaces(rows);
      setIsLoading(false);
    });
  }, [decodedCountry, areaId]);

  const needsReviewPlaces = places.filter(
    (p) =>
      p.status !== 'hidden' &&
      p.reviewStatus === 'new' &&
      !isAiGuestPlace(p)
  );
  const aiGuestPlaces = places.filter(
    (p) =>
      p.status !== 'hidden' &&
      isAiGuestPlace(p) &&
      p.reviewStatus === 'new'
  );
  const reviewedPlaces = places.filter(
    (p) =>
      p.status !== 'hidden' &&
      p.reviewStatus === 'reviewed' &&
      !p.promotedToLocalGemId
  );
  const hiddenPlaces = places.filter((p) => p.status === 'hidden');
  const promotedCount = places.filter((p) => p.promotedToLocalGemId).length;

  const visiblePlaces =
    filter === 'needsReview'
      ? needsReviewPlaces
      : filter === 'aiGuest'
        ? aiGuestPlaces
        : filter === 'reviewed'
          ? reviewedPlaces
          : hiddenPlaces;

  const filteredPlaces = useMemo(
    () => visiblePlaces.filter((place) => placeMatchesSearch(place, searchText)),
    [visiblePlaces, searchText]
  );

  const selectableFilteredPlaces = useMemo(
    () => filteredPlaces.filter((p) => !p.promotedToLocalGemId),
    [filteredPlaces]
  );

  const hasSearch = searchText.trim().length > 0;
  const isHiddenTab = filter === 'hidden';
  const isReviewedTab = filter === 'reviewed';
  const showSelectionColumn = !isHiddenTab;
  const selectedCount = selectedIds.size;
  const canBulkAction = showSelectionColumn && selectedCount >= 2;
  const allFilteredSelected =
    selectableFilteredPlaces.length > 0 &&
    selectableFilteredPlaces.every((p) => selectedIds.has(p.id));
  const selectAllCheckboxRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = selectAllCheckboxRef.current;
    if (!el) return;
    el.indeterminate =
      selectedCount > 0 &&
      !allFilteredSelected &&
      selectableFilteredPlaces.some((p) => selectedIds.has(p.id));
  }, [selectedCount, allFilteredSelected, selectableFilteredPlaces, selectedIds]);

  const getSelectedPlaces = (): DiscoveredPlace[] =>
    places.filter((p) => selectedIds.has(p.id) && !p.promotedToLocalGemId);

  useEffect(() => {
    setSelectedIds(new Set());
    setCompareOpen(false);
    setCompareResult(null);
    setMergeOpen(false);
    setMergePlan(null);
  }, [filter]);

  const toggleSelected = (placeId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(placeId)) next.delete(placeId);
      else next.add(placeId);
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    setCompareOpen(false);
    setCompareResult(null);
    setMergeOpen(false);
    setMergePlan(null);
  };

  const selectAllFiltered = () => {
    setSelectedIds(new Set(selectableFilteredPlaces.map((p) => p.id)));
  };

  const toggleSelectAllFiltered = () => {
    if (allFilteredSelected) clearSelection();
    else selectAllFiltered();
  };

  const runCompare = () => {
    const selected = getSelectedPlaces();
    if (selected.length < 2) return;
    setCompareResult(compareDiscoveredPlaces(selected));
    setCompareOpen(true);
  };

  const runMerge = () => {
    const selected = getSelectedPlaces();
    if (selected.length < 2) return;
    try {
      setMergePlan(buildDiscoveredPlaceMergePlan(selected));
      setMergeOpen(true);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : 'Could not build merge plan.');
    }
  };

  const confirmMerge = async () => {
    if (!mergePlan || isMerging) return;
    setIsMerging(true);
    try {
      const batch = writeBatch(db);
      const winnerRef = doc(
        db,
        'countries',
        decodedCountry,
        'areas',
        areaId,
        'discoveredPlaces',
        mergePlan.winner.id
      );
      batch.update(winnerRef, {
        alternateTitles: mergePlan.alternateTitles,
        usageCount: mergePlan.usageCount,
        updatedAt: new Date(),
      });
      for (const loserId of mergePlan.loserIds) {
        batch.delete(
          doc(db, 'countries', decodedCountry, 'areas', areaId, 'discoveredPlaces', loserId)
        );
      }
      await batch.commit();
      toast.success(
        `Merged ${mergePlan.loserIds.length + 1} records into "${mergePlan.winner.name || 'Untitled'}".`
      );
      if (editingId && mergePlan.loserIds.includes(editingId)) setEditingId(null);
      clearSelection();
    } catch (err) {
      console.error(err);
      toast.error('Failed to merge places.');
    } finally {
      setIsMerging(false);
    }
  };

  const editingPlace = editingId ? places.find((p) => p.id === editingId) : undefined;

  const openEdit = (place: DiscoveredPlace) => {
    const normalized = placeCategoryLabels(
      place,
      categoryCatalogDocs,
      localeSettings.primaryLocale
    ).filter(
      (label) =>
        !isGooglePlaceCategory(label, categoryCatalogDocs, localeSettings.primaryLocale)
    );
    setEditingId(place.id);
    setFormData({
      name: place.name || '',
      category: normalized[0] || place.category || '',
      categories: normalized,
      description: place.description || '',
      latitude: place.latitude != null ? String(place.latitude) : '',
      longitude: place.longitude != null ? String(place.longitude) : '',
      verifiedGoogleMapsUrl: place.verifiedGoogleMapsUrl || '',
      photoUrl: place.photoUrl || '',
      rating: place.rating != null ? String(place.rating) : '',
      alternateTitlesText: filterAlternateTitleVocabularyVariants(
        place.name || '',
        Array.isArray(place.alternateTitles) ? place.alternateTitles : []
      ).join('\n'),
      googleCategoriesText: formatGoogleCategoriesList(
        googleCategoriesFromPlace(place, categoryCatalogDocs, localeSettings.primaryLocale)
      ),
    });
  };

  const buildSavePayload = async (placeName: string) => {
    const verifiedUrl = formData.verifiedGoogleMapsUrl.trim();
    const isVerified = isVerifiedGoogleMapsShortUrl(verifiedUrl);

    let alternateTitles: string[];
    if (isVerified) {
      const manualTitles = formData.alternateTitlesText
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      alternateTitles = await suggestAlternatePlaceTitles(placeName, {
        areaName: decodedArea,
        category: normalizedFormCategories[0] || formData.category,
        existing: mergeAlternateTitleLists(
          placeName,
          manualTitles,
          filterAlternateTitleVocabularyVariants(placeName, editingPlace?.alternateTitles || [])
        ),
      });
    } else {
      alternateTitles = filterAlternateTitleVocabularyVariants(
        placeName,
        editingPlace?.alternateTitles || []
      );
    }

    return {
      name: formData.name.trim(),
      category: normalizedFormCategories[0] || '',
      categories: normalizedFormCategories,
      description: formData.description,
      latitude: formData.latitude ? parseFloat(formData.latitude) : null,
      longitude: formData.longitude ? parseFloat(formData.longitude) : null,
      verifiedGoogleMapsUrl: verifiedUrl || null,
      photoUrl: formData.photoUrl,
      rating: formData.rating ? parseFloat(formData.rating) : null,
      alternateTitles,
      googleCategories: parseGoogleCategoriesText(formData.googleCategoriesText),
      updatedAt: new Date(),
    };
  };

  const requireVerifiedMapsUrl = (url: string): boolean => {
    if (!isVerifiedGoogleMapsShortUrl(url)) {
      toast.warning(`Paste a verified Maps link (${verifiedGoogleMapsUrlHint()}).`);
      return false;
    }
    return true;
  };

  const handleSave = async (markVerified = false) => {
    if (!editingId) return;
    const verifiedUrl = formData.verifiedGoogleMapsUrl.trim();
    if (verifiedUrl && !isVerifiedGoogleMapsShortUrl(verifiedUrl)) {
      requireVerifiedMapsUrl(verifiedUrl);
      return;
    }
    if (markVerified && !requireVerifiedMapsUrl(verifiedUrl)) return;

    setIsSaving(true);
    try {
      const ref = doc(db, 'countries', decodedCountry, 'areas', areaId, 'discoveredPlaces', editingId);
      const savePayload = await buildSavePayload(formData.name.trim());
      await updateDoc(ref, {
        ...savePayload,
        ...(markVerified
          ? { reviewStatus: 'reviewed', needsReview: false }
          : {}),
      });
      if (markVerified) {
        toast.success('Saved and marked as reviewed.');
      }
      setEditingId(null);
    } catch (e) {
      console.error(e);
      toast.error('Failed to save changes.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleMagicFill = async () => {
    const url = formData.verifiedGoogleMapsUrl.trim();
    if (!requireVerifiedMapsUrl(url)) return;

    const hasExistingPhoto = Boolean(
      formData.photoUrl?.trim() || editingPlace?.photoUrl?.trim()
    );

    setIsMagicFilling(true);
    try {
      const filled = await resolveMagicFillFromUrl(url, {
        placeNameFallback: formData.name.trim() || editingPlace?.name || '',
        existingCategories: formData.categories,
        hasExistingPhoto,
        existingDescription: formData.description,
        biasLat: parseCoord(formData.latitude) ?? editingPlace?.latitude ?? null,
        biasLng: parseCoord(formData.longitude) ?? editingPlace?.longitude ?? null,
        googlePlaceId: editingPlace?.googlePlaceId ?? null,
        photoUrl: formData.photoUrl?.trim() || editingPlace?.photoUrl || null,
      });

      setFormData((prev) => ({
        ...prev,
        name: filled.primaryName || prev.name,
        categories: filled.categories,
        category: filled.categories[0] || prev.category,
        rating: filled.rating != null ? String(filled.rating) : prev.rating,
        description: filled.description || prev.description,
        latitude: filled.latitude != null ? String(filled.latitude) : prev.latitude,
        longitude: filled.longitude != null ? String(filled.longitude) : prev.longitude,
        photoUrl: hasExistingPhoto ? prev.photoUrl : filled.photoUrl || prev.photoUrl,
        verifiedGoogleMapsUrl: url,
        googleCategoriesText: mergeGoogleCategoriesText(
          prev.googleCategoriesText,
          filled.googleCategory
        ),
      }));

      if (hasExistingPhoto) {
        toast.success('Updated from Maps link (kept existing photo).');
      } else {
        toast.success('Place details filled from Google Maps.');
      }
    } catch (error) {
      console.error('Magic Fill Error:', error);
      toast.error(
        httpsCallableMessage(
          error,
          'Could not load this place. Check the maps.app.goo.gl link and try again.'
        )
      );
    } finally {
      setIsMagicFilling(false);
    }
  };

  const quickEnrichAndReview = async (place: DiscoveredPlace) => {
    const url = String(place.googleMapsUrl || '').trim();
    if (!url.startsWith('http')) {
      toast.warning('Add a Google Maps link on this record before enriching.');
      return;
    }
    if (enrichingId) return;

    setEnrichingId(place.id);
    try {
      const existingCategories = placeCategoryLabels(
        place,
        categoryCatalogDocs,
        localeSettings.primaryLocale
      );
      const hasExistingPhoto = Boolean(place.photoUrl?.trim());
      const filled = await resolveMagicFillFromUrl(url, {
        placeNameFallback: place.name || '',
        existingCategories,
        hasExistingPhoto,
        existingDescription: place.description,
        biasLat: parseCoord(place.latitude),
        biasLng: parseCoord(place.longitude),
        googlePlaceId: place.googlePlaceId ?? null,
        photoUrl: place.photoUrl ?? null,
      });

      const alternateTitles = await suggestAlternatePlaceTitles(filled.primaryName, {
        areaName: decodedArea,
        category: filled.categories[0] || place.category,
        existing: mergeAlternateTitleLists(
          filled.primaryName,
          place.lastMatchedTitle && place.lastMatchedTitle !== filled.primaryName
            ? [place.lastMatchedTitle]
            : [],
          place.name && place.name !== filled.primaryName ? [place.name] : [],
          filterAlternateTitleVocabularyVariants(
            filled.primaryName,
            place.alternateTitles || []
          )
        ),
      });

      const ref = doc(
        db,
        'countries',
        decodedCountry,
        'areas',
        areaId,
        'discoveredPlaces',
        place.id
      );
      await updateDoc(ref, {
        name: filled.primaryName,
        category: filled.categories[0] || place.category || '',
        categories: filled.categories.length > 0 ? filled.categories : existingCategories,
        description: filled.description || place.description || '',
        latitude: filled.latitude ?? place.latitude ?? null,
        longitude: filled.longitude ?? place.longitude ?? null,
        googleMapsUrl: filled.googleMapsUrl || url,
        ...(filled.googlePlaceId ? { googlePlaceId: filled.googlePlaceId } : {}),
        photoUrl: hasExistingPhoto ? place.photoUrl : filled.photoUrl || place.photoUrl || null,
        rating: filled.rating ?? place.rating ?? null,
        googleCategories: parseGoogleCategoriesText(
          mergeGoogleCategoriesText(
            formatGoogleCategoriesList(
              googleCategoriesFromPlace(place, categoryCatalogDocs, localeSettings.primaryLocale)
            ),
            filled.googleCategory
          )
        ),
        alternateTitles,
        reviewStatus: 'reviewed',
        needsReview: false,
        updatedAt: new Date(),
      });

      if (editingId === place.id) setEditingId(null);
      toast.success('Enriched from Maps link and marked as reviewed.');
    } catch (error) {
      console.error('Quick enrich error:', error);
      toast.error(
        httpsCallableMessage(
          error,
          'Could not enrich this place from its Maps link. Check the link and try again.'
        )
      );
    } finally {
      setEnrichingId(null);
    }
  };

  async function resolveMagicFillFromUrl(
    url: string,
    opts: {
      placeNameFallback: string;
      existingCategories: string[];
      hasExistingPhoto: boolean;
      existingDescription?: string;
      biasLat?: number | null;
      biasLng?: number | null;
      googlePlaceId?: string | null;
      photoUrl?: string | null;
    }
  ) {
    const functions = getFunctions();
    const getGooglePlaceDetails = httpsCallable(functions, 'getGooglePlaceDetails');
    const resolvedPlaceId =
      bareGooglePlaceId(opts.googlePlaceId) ||
      extractPlaceIdFromPlacesPhotoUrl(opts.photoUrl) ||
      extractPlaceIdFromMapsUrl(url);
    const result = await getGooglePlaceDetails({
      searchQuery: url.trim(),
      area: decodedArea,
      skipPhoto: opts.hasExistingPhoto,
      fallbackName: opts.placeNameFallback || undefined,
      biasLat: parseCoord(opts.biasLat) ?? undefined,
      biasLng: parseCoord(opts.biasLng) ?? undefined,
      googlePlaceId: resolvedPlaceId ?? undefined,
      photoUrl: opts.photoUrl ?? undefined,
      usageCaller: PLACES_USAGE_CALLER.areaDiscoveredPlaces,
    });
    const googleData = result.data as {
      name?: string;
      rating?: number | null;
      description?: string;
      category?: string;
      latitude?: number | null;
      longitude?: number | null;
      photoUrl?: string | null;
      googleMapsUrl?: string | null;
      googlePlaceId?: string | null;
    };

    let matchedCategory = '';
    const gType = googleData.category?.toLowerCase() || '';
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
          opts.existingCategories.includes(matchedCategory)
            ? opts.existingCategories
            : [...opts.existingCategories, matchedCategory],
          categoryCatalogDocs,
          localeSettings.primaryLocale
        )
      : normalizeCategorySelectionList(
          opts.existingCategories,
          categoryCatalogDocs,
          localeSettings.primaryLocale
        );

    const primaryName = googleData.name || opts.placeNameFallback;

    let finalDescription = googleData.description?.trim() || opts.existingDescription?.trim() || '';
    if (!finalDescription && primaryName) {
      try {
        const prompt = `Act as a luxury travel concierge for ${decodedArea}, ${decodedCountry}. Write a short, engaging 2-sentence description for a local spot called "${primaryName}". Tell guests why they should visit. Return ONLY the description text, no quotes.`;
        const model = getGenerativeModel(ai, { model: 'gemini-2.5-flash' });
        const aiResult = await model.generateContent(prompt);
        finalDescription = aiResult.response.text().trim();
      } catch (e) {
        console.log('Gemini description fallback failed.', e);
      }
    }

    return {
      primaryName,
      categories: nextCategories,
      googleCategory: googleData.category?.trim() || null,
      description: finalDescription,
      latitude: googleData.latitude ?? null,
      longitude: googleData.longitude ?? null,
      rating:
        googleData.rating != null && googleData.rating > 0 ? googleData.rating : null,
      photoUrl: googleData.photoUrl || null,
      googleMapsUrl: googleData.googleMapsUrl || url.trim(),
      googlePlaceId: googleData.googlePlaceId || null,
    };
  }

  const markReviewed = async (placeId: string) => {
    const place = places.find((p) => p.id === placeId);
    if (!place) return;
    if (!isVerifiedGoogleMapsShortUrl(place.verifiedGoogleMapsUrl || '')) {
      openEdit(place);
      toast.warning(`Add a verified Maps link (${verifiedGoogleMapsUrlHint()}) before marking reviewed.`);
      return;
    }
    const ref = doc(db, 'countries', decodedCountry, 'areas', areaId, 'discoveredPlaces', placeId);
    await updateDoc(ref, { reviewStatus: 'reviewed', needsReview: false, updatedAt: new Date() });
  };

  const hidePlace = async (placeId: string) => {
    if (!confirm('Hide this place from guest AI plans?')) return;
    const ref = doc(db, 'countries', decodedCountry, 'areas', areaId, 'discoveredPlaces', placeId);
    await updateDoc(ref, { status: 'hidden', updatedAt: new Date() });
    if (editingId === placeId) setEditingId(null);
  };

  const unhidePlace = async (placeId: string) => {
    const ref = doc(db, 'countries', decodedCountry, 'areas', areaId, 'discoveredPlaces', placeId);
    await updateDoc(ref, { status: 'active', updatedAt: new Date() });
    toast.success('Place restored — it can appear in guest plans again.');
  };

  const deletePlace = async (place: DiscoveredPlace) => {
    const label = place.name?.trim() || 'this place';
    if (
      !window.confirm(
        `Permanently delete "${label}" from Discovered Places? This cannot be undone.`
      )
    ) {
      return;
    }
    try {
      const ref = doc(db, 'countries', decodedCountry, 'areas', areaId, 'discoveredPlaces', place.id);
      await deleteDoc(ref);
      if (editingId === place.id) setEditingId(null);
      toast.success(`Deleted "${label}".`);
    } catch (e) {
      console.error(e);
      toast.error('Failed to delete place.');
    }
  };

  const promoteToLocalGem = async (place: DiscoveredPlace) => {
    const isEditingPlace = editingId === place.id;
    const effectivePlace: DiscoveredPlace = isEditingPlace
      ? {
          ...place,
          name: formData.name.trim(),
          category: normalizedFormCategories[0] || '',
          categories: normalizedFormCategories,
          description: formData.description,
          latitude: formData.latitude ? parseFloat(formData.latitude) : place.latitude,
          longitude: formData.longitude ? parseFloat(formData.longitude) : place.longitude,
          verifiedGoogleMapsUrl: formData.verifiedGoogleMapsUrl.trim(),
          photoUrl: formData.photoUrl,
          rating: formData.rating ? parseFloat(formData.rating) : place.rating,
        }
      : place;

    const blockReason = getPromoteBlockReason(effectivePlace);
    if (blockReason === 'Not reviewed') {
      toast.warning('Mark this place as reviewed before promoting to Local Gems.');
      return;
    }
    if (blockReason === 'Missing verified Maps link') {
      openEdit(place);
      toast.warning(`Add a verified Maps link (${verifiedGoogleMapsUrlHint()}) before promoting.`);
      return;
    }
    if (blockReason === 'Missing category') {
      openEdit(place);
      toast.warning('Choose a category in the form, then click Promote again.');
      return;
    }
    if (blockReason) {
      toast.warning(`Cannot promote "${place.name || 'this place'}": ${blockReason}.`);
      return;
    }

    try {
      const gemsColl = collection(db, 'countries', decodedCountry, 'areas', areaId, 'localGems');
      const gemRef = doc(gemsColl);
      const batch = writeBatch(db);
      batch.set(gemRef, placeToLocalGemPayload(effectivePlace, categoryCatalogDocs, localeSettings.primaryLocale));
      batch.update(
        doc(db, 'countries', decodedCountry, 'areas', areaId, 'discoveredPlaces', place.id),
        {
          promotedToLocalGemId: gemRef.id,
          reviewStatus: 'reviewed',
          needsReview: false,
          updatedAt: new Date(),
        }
      );
      await batch.commit();

      toast.success(`Added to Local Gems as "${effectivePlace.name}".`);
      setEditingId(null);
    } catch (e) {
      console.error(e);
      toast.error('Failed to promote to Local Gem.');
    }
  };

  const bulkPromoteToLocalGems = async () => {
    const selected = getSelectedPlaces();
    const promotable = selected.filter((p) => !getPromoteBlockReason(p));
    const skipped = selected.filter((p) => getPromoteBlockReason(p));

    if (promotable.length === 0) {
      toast.warning(
        'No selected places are ready. Each needs reviewed status, a category, and a verified Maps link.'
      );
      return;
    }

    const skipNote =
      skipped.length > 0
        ? `\n\n${skipped.length} selected place(s) will be skipped (missing category, Maps link, or already promoted).`
        : '';
    if (
      !window.confirm(
        `Send ${promotable.length} place(s) to Local Gems?${skipNote}`
      )
    ) {
      return;
    }

    setIsBulkPromoting(true);
    try {
      const chunkSize = 100;
      for (let i = 0; i < promotable.length; i += chunkSize) {
        const chunk = promotable.slice(i, i + chunkSize);
        const batch = writeBatch(db);
        for (const place of chunk) {
          const gemsColl = collection(db, 'countries', decodedCountry, 'areas', areaId, 'localGems');
          const gemRef = doc(gemsColl);
          batch.set(gemRef, placeToLocalGemPayload(place, categoryCatalogDocs, localeSettings.primaryLocale));
          batch.update(
            doc(db, 'countries', decodedCountry, 'areas', areaId, 'discoveredPlaces', place.id),
            {
              promotedToLocalGemId: gemRef.id,
              reviewStatus: 'reviewed',
              needsReview: false,
              updatedAt: new Date(),
            }
          );
        }
        await batch.commit();
      }

      clearSelection();
      toast.success(`Sent ${promotable.length} place(s) to Local Gems.`);
      if (skipped.length > 0) {
        toast.warning(`Skipped ${skipped.length} place(s) that were not ready.`);
      }
    } catch (e) {
      console.error(e);
      toast.error('Bulk promote failed. Some places may not have been added.');
    } finally {
      setIsBulkPromoting(false);
    }
  };

  const renderEditPanel = () => {
    const canEditAlternates = isVerifiedGoogleMapsShortUrl(
      formData.verifiedGoogleMapsUrl.trim()
    );

    return (
    <div className="px-3 sm:px-4 py-3 bg-vailo-surface-elevated/80 border-t border-gray-100">
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 sm:gap-3">
        <div className="col-span-2">
          <AdminLabel>Name</AdminLabel>
          <AdminInput
            className="py-2 text-xs"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          />
        </div>
        <div className="col-span-2 sm:col-span-4 lg:col-span-6">
          <CategoryPillSelector
            label="Categories (select all that apply)"
            options={categoryPillOptions}
            isSelected={(value) =>
              categorySelectionIncludes(
                normalizedFormCategories,
                value,
                categoryCatalogDocs,
                localeSettings.primaryLocale
              )
            }
            onToggle={handleCategoryPillToggle}
            colorClass="blue"
          />
        </div>
        <div>
          <AdminLabel>Lat</AdminLabel>
          <AdminInput
            className="py-2 text-xs"
            value={formData.latitude}
            onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
          />
        </div>
        <div>
          <AdminLabel>Lng</AdminLabel>
          <AdminInput
            className="py-2 text-xs"
            value={formData.longitude}
            onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
          />
        </div>
        <div className="col-span-2 sm:col-span-4 lg:col-span-3">
          <AdminLabel>Photo URL</AdminLabel>
          <AdminInput
            className="py-2 text-xs"
            value={formData.photoUrl}
            onChange={(e) => setFormData({ ...formData, photoUrl: e.target.value })}
          />
        </div>
        {editingPlace?.googleMapsUrl ? (
          <div className="col-span-2 sm:col-span-4 lg:col-span-6">
            <AdminLabel>Discovered Maps link</AdminLabel>
            <AdminInput
              className="py-2 text-xs bg-gray-50 text-gray-500"
              value={editingPlace.googleMapsUrl}
              readOnly
            />
          </div>
        ) : null}
        <div className="col-span-2 sm:col-span-4 lg:col-span-6">
          <AdminLabel>Verified Maps link (required)</AdminLabel>
          <div className="flex flex-col sm:flex-row gap-2">
            <AdminInput
              className="py-2 text-xs flex-1"
              value={formData.verifiedGoogleMapsUrl}
              onChange={(e) =>
                setFormData({ ...formData, verifiedGoogleMapsUrl: e.target.value })
              }
              placeholder={verifiedGoogleMapsUrlHint()}
            />
            <AdminButton
              type="button"
              onClick={handleMagicFill}
              disabled={isMagicFilling || !formData.verifiedGoogleMapsUrl.trim()}
              className="text-xs py-2 px-3 shrink-0"
            >
              {isMagicFilling ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Wand2 size={13} />
              )}
              {isMagicFilling ? 'Filling…' : 'AI Magic Fill'}
            </AdminButton>
          </div>
          <p className="text-[10px] text-gray-400 mt-1">
            Paste a maps.app.goo.gl short link. Required to verify and promote.
            {formData.photoUrl || editingPlace?.photoUrl
              ? ' Magic Fill keeps your existing photo and skips Google photo lookup.'
              : ''}
          </p>
        </div>
        <div className="col-span-2 sm:col-span-4 lg:col-span-6">
          <AdminLabel>Description</AdminLabel>
          <AdminTextarea
            rows={2}
            className="py-2 text-xs min-h-[60px]"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          />
        </div>
        <div className="col-span-2 sm:col-span-4 lg:col-span-6">
          <AdminLabel>Alternative categories (Google types)</AdminLabel>
          <AdminTextarea
            rows={2}
            className="py-2 text-xs min-h-[56px] font-mono"
            value={formData.googleCategoriesText}
            onChange={(e) =>
              setFormData({ ...formData, googleCategoriesText: e.target.value })
            }
            placeholder="One per line — e.g. jewelry_store, cafe. Filled when you assign a Local Gems category or run Magic Fill."
          />
          <p className="text-[10px] text-gray-400 mt-1">
            Raw Google primaryType values preserved for filtering and reference. Editable.
          </p>
        </div>
        <div className="col-span-2 sm:col-span-4 lg:col-span-6">
          <AdminLabel>Alternative titles (spelling variants)</AdminLabel>
          <AdminTextarea
            rows={3}
            className={`py-2 text-xs min-h-[72px] ${canEditAlternates ? '' : 'bg-gray-50 text-gray-500 cursor-not-allowed'}`}
            value={formData.alternateTitlesText}
            onChange={(e) =>
              setFormData({ ...formData, alternateTitlesText: e.target.value })
            }
            readOnly={!canEditAlternates}
            placeholder={
              canEditAlternates
                ? 'One per line — spelling variants only (e.g. Georgioupolis, Kalivaki). Regenerated on save.'
                : 'Add a verified Maps link first — then edit spelling variants for AI matching.'
            }
          />
          {!canEditAlternates && formData.alternateTitlesText.trim() && (
            <p className="text-[10px] text-amber-700 mt-1">
              Showing saved variants. Verify this place to edit or refresh them.
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-2 mt-3">
        <AdminButton
          onClick={() => handleSave(false)}
          disabled={isSaving || isMagicFilling}
          className="text-xs py-1.5 px-3"
        >
          <Save size={13} /> {isSaving ? 'Saving…' : 'Save'}
        </AdminButton>
        {editingPlace?.reviewStatus !== 'reviewed' && (
          <AdminButton
            onClick={() => handleSave(true)}
            disabled={isSaving || isMagicFilling}
            className="text-xs py-1.5 px-3"
          >
            <Sparkles size={13} /> {isSaving ? 'Saving…' : 'Save and review'}
          </AdminButton>
        )}
        {editingPlace?.status === 'hidden' && (
          <AdminButton
            type="button"
            onClick={() => unhidePlace(editingPlace.id)}
            disabled={isSaving || isMagicFilling}
            className="text-xs py-1.5 px-3 text-emerald-700 border-emerald-200 hover:bg-emerald-50"
          >
            <Eye size={13} /> Unhide
          </AdminButton>
        )}
        <AdminButton
          variant="secondary"
          onClick={() => setEditingId(null)}
          disabled={isSaving || isMagicFilling}
          className="text-xs py-1.5 px-3"
        >
          <X size={13} /> Cancel
        </AdminButton>
      </div>
    </div>
    );
  };

  return (
    <div className="admin-page">
      <AdminBackHeader
        backTo={adminPath('/area')}
        backLabel="Back to Area Hub"
        title="Discovered Places"
        description={`${decodedArea}, ${decodedCountry}`}
        badge={
          needsReviewPlaces.length + aiGuestPlaces.length > 0 ? (
            <AdminBadge variant="gold">
              {needsReviewPlaces.length + aiGuestPlaces.length} new
            </AdminBadge>
          ) : undefined
        }
      />

      {/* Compact toolbar: stats + filters */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
          <span>
            <strong className="text-vailo-gold">{needsReviewPlaces.length}</strong> to review
          </span>
          <span className="text-gray-300">|</span>
          <span>
            <strong className="text-violet-600">{aiGuestPlaces.length}</strong> unverified AI
          </span>
          <span className="text-gray-300">|</span>
          <span>
            <strong className="text-vailo-teal">{reviewedPlaces.length}</strong> reviewed
          </span>
          <span className="text-gray-300">|</span>
          <span>
            <strong className="text-gray-600">{hiddenPlaces.length}</strong> hidden
          </span>
          {promotedCount > 0 && (
            <>
              <span className="text-gray-300">|</span>
              <span>
                <strong className="text-emerald-600">{promotedCount}</strong> in local gems
              </span>
            </>
          )}
        </div>
        <div className="flex flex-wrap gap-1 p-0.5 bg-white rounded-lg border border-gray-100 shadow-sm w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setFilter('needsReview')}
            className={`flex-1 sm:flex-none px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
              filter === 'needsReview'
                ? 'bg-vailo-teal text-white'
                : 'text-gray-500 hover:text-vailo-teal'
            }`}
          >
            Needs review ({needsReviewPlaces.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('aiGuest')}
            className={`flex-1 sm:flex-none px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
              filter === 'aiGuest'
                ? 'bg-violet-600 text-white'
                : 'text-gray-500 hover:text-violet-600'
            }`}
          >
            Unverified AI ({aiGuestPlaces.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('reviewed')}
            className={`flex-1 sm:flex-none px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
              filter === 'reviewed'
                ? 'bg-vailo-teal text-white'
                : 'text-gray-500 hover:text-vailo-teal'
            }`}
          >
            Reviewed ({reviewedPlaces.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('hidden')}
            className={`flex-1 sm:flex-none px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
              filter === 'hidden'
                ? 'bg-vailo-teal text-white'
                : 'text-gray-500 hover:text-vailo-teal'
            }`}
          >
            Hidden ({hiddenPlaces.length})
          </button>
        </div>
      </div>

      {isHiddenTab && hiddenPlaces.length > 0 && (
        <p className="mb-4 text-xs text-gray-500">
          Hidden places are excluded from guest AI plans. Restore a place to send it back to the
          appropriate review tab.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[12rem]">
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
            aria-label="Search discovered places"
          />
        </div>
        {showSelectionColumn && selectableFilteredPlaces.length > 0 && (
          <AdminButton
            type="button"
            variant="secondary"
            onClick={toggleSelectAllFiltered}
            className="text-xs py-2 px-3 shrink-0"
          >
            {allFilteredSelected ? 'Deselect all' : 'Select all'}
          </AdminButton>
        )}
      </div>

      {showSelectionColumn && selectedCount > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-4 px-3 py-2 rounded-lg border border-vailo-teal/20 bg-vailo-teal/5">
          <span className="text-xs font-semibold text-vailo-teal">
            {selectedCount} selected
          </span>
          <AdminButton
            type="button"
            onClick={runMerge}
            disabled={!canBulkAction || isMerging}
            className="text-xs py-1.5 px-3"
          >
            <GitMerge size={14} /> Merge
          </AdminButton>
          <AdminButton
            type="button"
            onClick={runCompare}
            disabled={!canBulkAction}
            className="text-xs py-1.5 px-3"
          >
            <GitCompare size={14} /> Compare
          </AdminButton>
          {isReviewedTab && (
            <AdminButton
              type="button"
              onClick={bulkPromoteToLocalGems}
              disabled={selectedCount === 0 || isBulkPromoting}
              className="text-xs py-1.5 px-3"
            >
              {isBulkPromoting ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Gem size={14} />
              )}{' '}
              Send to gems
            </AdminButton>
          )}
          <AdminButton
            type="button"
            variant="secondary"
            onClick={clearSelection}
            className="text-xs py-1.5 px-3"
          >
            Clear selection
          </AdminButton>
          {selectedCount === 1 && !isReviewedTab && (
            <span className="text-[11px] text-gray-500">Select one more to merge or compare.</span>
          )}
          {isReviewedTab && selectedCount > 0 && (
            <span className="text-[11px] text-gray-500">
              Ready rows need a category and verified Maps link.
            </span>
          )}
        </div>
      )}

      {mergeOpen && mergePlan && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          onClick={() => !isMerging && setMergeOpen(false)}
          role="presentation"
        >
          <div
            className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[85vh] overflow-auto p-5"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="merge-discovered-title"
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h2 id="merge-discovered-title" className="text-lg font-semibold text-vailo-dark">
                  Merge {mergePlan.loserIds.length + 1} places
                </h2>
                <p className="text-sm text-gray-600 mt-1">
                  The record with the highest rating is kept. Other names become alternative titles.
                </p>
              </div>
              <button
                type="button"
                onClick={() => !isMerging && setMergeOpen(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                aria-label="Close merge"
              >
                <X size={18} />
              </button>
            </div>

            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 mb-4">
              <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-800 mb-1">
                Keeping
              </p>
              <p className="font-semibold text-emerald-900">{mergePlan.winner.name || 'Untitled'}</p>
              <p className="text-sm text-emerald-800 mt-0.5">
                Rating:{' '}
                {typeof mergePlan.winner.rating === 'number' && mergePlan.winner.rating > 0
                  ? mergePlan.winner.rating.toFixed(1)
                  : '—'}
              </p>
            </div>

            <div className="mb-4">
              <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500 mb-2">
                Alternative titles (from merged records)
              </p>
              {mergePlan.alternateTitles.length > 0 ? (
                <ul className="text-sm text-gray-700 space-y-1 max-h-40 overflow-auto rounded-lg border border-gray-200 px-3 py-2">
                  {mergePlan.alternateTitles.map((title) => (
                    <li key={title} className="truncate">
                      {title}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-500">No additional titles to add.</p>
              )}
            </div>

            <div className="mb-5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500 mb-2">
                Will be removed
              </p>
              <ul className="text-sm text-gray-600 space-y-1">
                {getSelectedPlaces()
                  .filter((p) => p.id !== mergePlan.winner.id)
                  .map((p) => (
                    <li key={p.id} className="truncate">
                      {p.name || 'Untitled'}
                      {typeof p.rating === 'number' && p.rating > 0
                        ? ` · ★ ${p.rating.toFixed(1)}`
                        : ''}
                    </li>
                  ))}
              </ul>
            </div>

            <div className="flex flex-wrap gap-2 justify-end">
              <AdminButton
                type="button"
                variant="secondary"
                onClick={() => setMergeOpen(false)}
                disabled={isMerging}
                className="text-xs py-1.5 px-3"
              >
                Cancel
              </AdminButton>
              <AdminButton
                type="button"
                onClick={confirmMerge}
                disabled={isMerging}
                className="text-xs py-1.5 px-3"
              >
                {isMerging ? (
                  <>
                    <Loader2 size={14} className="animate-spin" /> Merging…
                  </>
                ) : (
                  <>
                    <GitMerge size={14} /> Confirm merge
                  </>
                )}
              </AdminButton>
            </div>
          </div>
        </div>
      )}

      {compareOpen && compareResult && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          onClick={() => setCompareOpen(false)}
          role="presentation"
        >
          <div
            className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[85vh] overflow-auto p-5"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="compare-discovered-title"
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h2 id="compare-discovered-title" className="text-lg font-semibold text-vailo-dark">
                  Compare {compareResult.placeCount} places
                </h2>
                {compareResult.isExactMatch ? (
                  <p className="text-sm text-emerald-700 mt-1 font-medium">
                    100% match — these records are identical on all compared fields.
                  </p>
                ) : (
                  <p className="text-sm text-amber-700 mt-1 font-medium">
                    Not a 100% match — {compareResult.differences.length}{' '}
                    {compareResult.differences.length === 1 ? 'field differs' : 'fields differ'}.
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setCompareOpen(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                aria-label="Close compare"
              >
                <X size={18} />
              </button>
            </div>

            {compareResult.isExactMatch ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                Name, category, description, coordinates, map links, photo, rating, alternate
                titles, and source all match across the selected records.
              </div>
            ) : (
              <div className="space-y-4">
                {compareResult.differences.map((diff) => (
                  <div
                    key={diff.field}
                    className="rounded-lg border border-gray-200 overflow-hidden"
                  >
                    <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 text-xs font-bold uppercase tracking-wide text-gray-600">
                      {diff.label}
                    </div>
                    <ul className="divide-y divide-gray-100">
                      {diff.entries.map((entry) => (
                        <li key={entry.id} className="px-3 py-2 text-sm">
                          <span className="font-semibold text-vailo-dark">{entry.name}</span>
                          <p className="text-gray-600 mt-0.5 break-all whitespace-pre-wrap">
                            {entry.displayValue}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-16 gap-2 text-sm text-gray-500">
          <Loader2 className="animate-spin text-vailo-teal" size={20} />
          Loading…
        </div>
      ) : filteredPlaces.length === 0 ? (
        <AdminEmptyState
          icon={<Radar size={28} />}
          title={
            hasSearch
              ? 'No matching places'
              : filter === 'needsReview'
                ? 'All caught up'
                : filter === 'aiGuest'
                  ? 'No unverified AI picks'
                  : filter === 'reviewed'
                    ? 'No reviewed places'
                    : 'No hidden places'
          }
          description={
            hasSearch
              ? `Nothing in this tab matches "${searchText.trim()}".`
              : filter === 'needsReview'
                ? 'No Google-resolved venues awaiting review.'
                : filter === 'aiGuest'
                  ? 'When guests see AI suggestions that fail verification, they appear here for you to fix or hide.'
                  : filter === 'reviewed'
                    ? 'Mark places as reviewed to see them here before promoting to Local Gems.'
                    : 'Hidden places are excluded from guest AI plans.'
          }
        />
      ) : (
        <AdminCard className="overflow-hidden">
          {/* Desktop table header */}
          <div
            className={`hidden lg:grid gap-3 px-4 py-2 bg-gray-50 border-b border-gray-200/80 text-[10px] font-bold text-gray-500 uppercase tracking-wider ${
              showSelectionColumn
                ? 'lg:grid-cols-[2rem_2.5rem_1fr_8rem_5rem_4rem_7rem]'
                : 'lg:grid-cols-[2.5rem_1fr_8rem_5rem_4rem_7rem]'
            }`}
          >
            {showSelectionColumn ? (
              <span className="flex items-center">
                <input
                  ref={selectAllCheckboxRef}
                  type="checkbox"
                  checked={allFilteredSelected}
                  onChange={toggleSelectAllFiltered}
                  disabled={selectableFilteredPlaces.length === 0}
                  className="h-4 w-4 rounded border-gray-300 text-vailo-teal focus:ring-vailo-teal/40"
                  aria-label={allFilteredSelected ? 'Deselect all places' : 'Select all places'}
                />
              </span>
            ) : null}
            <span />
            <span>Place</span>
            <span>Category</span>
            <span>Rating</span>
            <span>Uses</span>
            <span className="text-right">Actions</span>
          </div>

          <ul className="divide-y divide-gray-200/80">
            {filteredPlaces.map((place, index) => {
              const isEditing = editingId === place.id;
              const isNew = place.reviewStatus === 'new' && place.status !== 'hidden';
              const isAiGuest = isAiGuestPlace(place);
              const isHidden = place.status === 'hidden';
              const lowRating = isLowGoogleRating(place.rating);
              const highRating = isHighGoogleRating(place.rating);
              const hasVerifiedMaps = isVerifiedGoogleMapsShortUrl(
                place.verifiedGoogleMapsUrl || ''
              );
              const hasMapsLink = String(place.googleMapsUrl || '').trim().startsWith('http');
              const canQuickEnrich = isNew && hasMapsLink;
              const isEnriching = enrichingId === place.id;
              const canMarkReviewed = isNew && hasVerifiedMaps;
              const canPromote =
                place.reviewStatus === 'reviewed' &&
                hasVerifiedMaps &&
                !place.promotedToLocalGemId &&
                !isHidden;
              const canDelete =
                (place.reviewStatus === 'reviewed' &&
                  !place.promotedToLocalGemId &&
                  !isHidden) ||
                (isHidden && !place.promotedToLocalGemId);
              const canSelect = showSelectionColumn && !place.promotedToLocalGemId;
              const isSelected = selectedIds.has(place.id);

              return (
                <li
                  key={place.id}
                  className={`${discoveredPlaceRowClass(place, index)}${
                    isSelected ? ' ring-1 ring-inset ring-vailo-teal/30' : ''
                  }`}
                >
                  {/* Row */}
                  <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-2.5 min-h-[52px]">
                    {canSelect && (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelected(place.id)}
                        className="h-4 w-4 shrink-0 rounded border-gray-300 text-vailo-teal focus:ring-vailo-teal/40"
                        aria-label={`Select ${place.name || 'place'}`}
                      />
                    )}
                    <PlaceThumb photoUrl={place.photoUrl} />

                    <div className="flex-1 min-w-0 lg:grid lg:grid-cols-[1fr_8rem_5rem_4rem] lg:gap-3 lg:items-center">
                      {/* Name + meta */}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="font-semibold text-sm text-vailo-dark truncate">{place.name}</span>
                          {isNew && !isAiGuest && (
                            <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-vailo-gold/15 text-vailo-gold-muted">
                              New
                            </span>
                          )}
                          {isAiGuest && (
                            <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-violet-100 text-violet-700">
                              AI pick
                            </span>
                          )}
                          {hasVerifiedMaps && !isHidden && (
                            <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
                              Verified
                            </span>
                          )}
                          {isHidden && (
                            <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-gray-200 text-gray-600">
                              Hidden
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-gray-400 mt-0.5 lg:hidden flex flex-wrap items-baseline gap-x-1 min-w-0">
                          <PlaceCategoryDisplay
                            place={place}
                            catalogDocs={categoryCatalogDocs}
                            primaryLocale={localeSettings.primaryLocale}
                            primaryClassName="truncate text-gray-500"
                          />
                          <span className="shrink-0">· {place.usageCount || 1}×</span>
                          {place.rating != null && place.rating > 0 && (
                            <span
                              className={`inline-flex items-center gap-0.5${
                                lowRating ? ' text-red-600 font-medium' : ''
                              }`}
                            >
                              {' '}
                              · ★ {place.rating.toFixed(1)}
                              {highRating && (
                                <Check
                                  size={12}
                                  strokeWidth={3}
                                  className="text-emerald-600 shrink-0"
                                  aria-label="Strong Google rating"
                                />
                              )}
                            </span>
                          )}
                        </div>
                        {place.description && (
                          <p className="hidden sm:block text-[11px] text-gray-400 truncate mt-0.5 max-w-xl">
                            {place.description}
                          </p>
                        )}
                        {place.lastFailureReason && (
                          <p className="text-[11px] text-violet-600/90 truncate mt-0.5 max-w-xl">
                            Failed: {place.lastFailureReason}
                          </p>
                        )}
                      </div>

                      {/* Category — desktop */}
                      <div className="hidden lg:block min-w-0">
                        <PlaceCategoryDisplay
                          place={place}
                          catalogDocs={categoryCatalogDocs}
                          primaryLocale={localeSettings.primaryLocale}
                          primaryClassName="text-xs text-gray-600 truncate"
                          googleClassName="text-[10px] text-gray-400 truncate font-mono"
                        />
                      </div>

                      {/* Rating — desktop */}
                      <span
                        className={`hidden lg:flex items-center gap-0.5 text-xs ${
                          lowRating ? 'text-red-600 font-medium' : 'text-gray-600'
                        }`}
                      >
                        {place.rating != null && place.rating > 0 ? (
                          <>
                            <Star
                              size={11}
                              className={
                                lowRating
                                  ? 'text-red-400 fill-red-400'
                                  : 'text-vailo-gold fill-vailo-gold'
                              }
                            />
                            {place.rating.toFixed(1)}
                            {highRating && (
                              <Check
                                size={13}
                                strokeWidth={3}
                                className="text-emerald-600 shrink-0 ml-0.5"
                                aria-label="Strong Google rating"
                              />
                            )}
                          </>
                        ) : (
                          '—'
                        )}
                      </span>

                      {/* Usage — desktop */}
                      <span className="hidden lg:block text-xs text-gray-500 tabular-nums">
                        {place.usageCount || 1}×
                      </span>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-0.5 shrink-0">
                      <IconBtn title="Edit" onClick={() => (isEditing ? setEditingId(null) : openEdit(place))}>
                        <Pencil size={15} />
                      </IconBtn>
                      {canQuickEnrich && (
                        <IconBtn
                          title="Enrich from Maps link, add alternate titles, mark reviewed"
                          onClick={() => void quickEnrichAndReview(place)}
                          className={`${
                            isEnriching
                              ? 'opacity-60 cursor-wait'
                              : 'hover:text-violet-700 hover:bg-violet-50'
                          }`}
                        >
                          {isEnriching ? (
                            <Loader2 size={15} className="animate-spin" />
                          ) : (
                            <Wand2 size={15} />
                          )}
                        </IconBtn>
                      )}
                      {isNew && (
                        <IconBtn
                          title={
                            hasVerifiedMaps
                              ? 'Mark reviewed'
                              : 'Add verified Maps link first'
                          }
                          onClick={() => markReviewed(place.id)}
                          className={`${
                            canMarkReviewed
                              ? 'hover:text-emerald-600 hover:bg-emerald-50'
                              : 'opacity-40 cursor-not-allowed'
                          }`}
                        >
                          <CheckCircle2 size={15} />
                        </IconBtn>
                      )}
                      {canPromote && (
                        <IconBtn
                          title="Promote to Local Gems"
                          onClick={() => promoteToLocalGem(place)}
                          className="hover:text-vailo-gold hover:bg-vailo-gold/10"
                        >
                          <Gem size={15} />
                        </IconBtn>
                      )}
                      {(place.verifiedGoogleMapsUrl || place.googleMapsUrl) && (
                        <IconBtn
                          title="Open in Maps"
                          href={place.verifiedGoogleMapsUrl || place.googleMapsUrl}
                        >
                          <ExternalLink size={15} />
                        </IconBtn>
                      )}
                      {!isHidden && (
                        <IconBtn
                          title="Hide"
                          onClick={() => hidePlace(place.id)}
                          className="hover:text-red-600 hover:bg-red-50"
                        >
                          <EyeOff size={15} />
                        </IconBtn>
                      )}
                      {isHidden && (
                        <button
                          type="button"
                          title="Unhide — restore to guest plans"
                          onClick={() => unhidePlace(place.id)}
                          className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 transition-colors shrink-0"
                        >
                          <Eye size={14} />
                          Unhide
                        </button>
                      )}
                      {canDelete && (
                        <IconBtn
                          title="Delete permanently"
                          onClick={() => deletePlace(place)}
                          className="hover:text-red-600 hover:bg-red-50"
                        >
                          <Trash2 size={15} />
                        </IconBtn>
                      )}
                    </div>
                  </div>

                  {isEditing && renderEditPanel()}
                </li>
              );
            })}
          </ul>
        </AdminCard>
      )}
    </div>
  );
}
