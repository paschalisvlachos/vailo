import { useState, useEffect } from 'react';
import { useAreaRouteParams } from '../../../hooks/useAreaRouteParams';
import { collection, addDoc, updateDoc, doc, onSnapshot } from 'firebase/firestore';
import { ai, db } from '../../../lib/firebase';
import { getGenerativeModel } from 'firebase/ai';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useToast } from '../../../context/ToastContext';
import { adminPath } from '../../../lib/adminRoutes';
import { httpsCallableMessage } from '../../../lib/callableError';
import {
  isVerifiedGoogleMapsShortUrl,
  verifiedGoogleMapsUrlHint,
} from '../../../lib/verifiedGoogleMapsUrl';
import {
  Radar,
  CheckCircle2,
  Gem,
  Pencil,
  EyeOff,
  Loader2,
  ExternalLink,
  Star,
  MapPin,
  X,
  Save,
  Wand2,
  Sparkles,
} from 'lucide-react';
import {
  AdminBackHeader,
  AdminBadge,
  AdminButton,
  AdminCard,
  AdminEmptyState,
  AdminInput,
  AdminSelect,
  AdminTextarea,
  AdminLabel,
} from '../../../components/admin/AdminPageHeader';

type DiscoveredPlace = {
  id: string;
  name?: string;
  category?: string;
  description?: string;
  latitude?: number | null;
  longitude?: number | null;
  googleMapsUrl?: string;
  verifiedGoogleMapsUrl?: string;
  photoUrl?: string;
  rating?: number | null;
  usageCount?: number;
  source?: string;
  reviewStatus?: string;
  status?: string;
  promotedToLocalGemId?: string | null;
  alternateTitles?: string[];
};

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

  const [places, setPlaces] = useState<DiscoveredPlace[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isMagicFilling, setIsMagicFilling] = useState(false);
  const [filter, setFilter] = useState<'needsReview' | 'reviewed' | 'hidden'>('needsReview');

  const [formData, setFormData] = useState({
    name: '',
    category: '',
    description: '',
    latitude: '',
    longitude: '',
    verifiedGoogleMapsUrl: '',
    photoUrl: '',
    rating: '',
  });

  useEffect(() => {
    if (!decodedCountry || !areaId) return;
    const catRef = collection(db, 'countries', decodedCountry, 'areas', areaId, 'localGemsCategories');
    return onSnapshot(catRef, (snapshot) => {
      setCategories(snapshot.docs.map((d) => ({ id: d.id, name: d.data().name as string })));
    });
  }, [decodedCountry, areaId]);

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
    (p) => p.status !== 'hidden' && p.reviewStatus === 'new'
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
      : filter === 'reviewed'
        ? reviewedPlaces
        : hiddenPlaces;

  const editingPlace = editingId ? places.find((p) => p.id === editingId) : undefined;

  const openEdit = (place: DiscoveredPlace) => {
    setEditingId(place.id);
    setFormData({
      name: place.name || '',
      category: place.category || '',
      description: place.description || '',
      latitude: place.latitude != null ? String(place.latitude) : '',
      longitude: place.longitude != null ? String(place.longitude) : '',
      verifiedGoogleMapsUrl: place.verifiedGoogleMapsUrl || '',
      photoUrl: place.photoUrl || '',
      rating: place.rating != null ? String(place.rating) : '',
    });
  };

  const buildSavePayload = () => {
    const verifiedUrl = formData.verifiedGoogleMapsUrl.trim();
    return {
      name: formData.name.trim(),
      category: formData.category,
      description: formData.description,
      latitude: formData.latitude ? parseFloat(formData.latitude) : null,
      longitude: formData.longitude ? parseFloat(formData.longitude) : null,
      verifiedGoogleMapsUrl: verifiedUrl || null,
      photoUrl: formData.photoUrl,
      rating: formData.rating ? parseFloat(formData.rating) : null,
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
      await updateDoc(ref, {
        ...buildSavePayload(),
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
      const placeNameFallback = formData.name.trim() || editingPlace?.name || '';

      const functions = getFunctions();
      const getGooglePlaceDetails = httpsCallable(functions, 'getGooglePlaceDetails');
      const result = await getGooglePlaceDetails({
        searchQuery: url,
        area: decodedArea,
        skipPhoto: hasExistingPhoto,
      });
      const googleData = result.data as {
        name?: string;
        rating?: number | null;
        description?: string;
        category?: string;
        latitude?: number | null;
        longitude?: number | null;
        photoUrl?: string | null;
      };

      let matchedCategory = formData.category;
      const gType = googleData.category?.toLowerCase() || '';
      const possibleMatch = categories.find((c) => {
        const lower = c.name.toLowerCase();
        return gType.includes(lower) || lower.includes(gType);
      });
      if (possibleMatch) {
        matchedCategory = possibleMatch.name;
      }

      const primaryName = googleData.name || placeNameFallback;

      let finalDescription = googleData.description?.trim() || '';
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

      setFormData((prev) => ({
        ...prev,
        name: primaryName || prev.name,
        category: matchedCategory || prev.category,
        rating:
          googleData.rating != null && googleData.rating > 0
            ? String(googleData.rating)
            : prev.rating,
        description: finalDescription || prev.description,
        latitude:
          googleData.latitude != null ? String(googleData.latitude) : prev.latitude,
        longitude:
          googleData.longitude != null ? String(googleData.longitude) : prev.longitude,
        photoUrl: hasExistingPhoto ? prev.photoUrl : googleData.photoUrl || prev.photoUrl,
        verifiedGoogleMapsUrl: url,
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

  const promoteToLocalGem = async (place: DiscoveredPlace) => {
    if (place.reviewStatus !== 'reviewed') {
      toast.warning('Mark this place as reviewed before promoting to Local Gems.');
      return;
    }
    const isEditingPlace = editingId === place.id;
    const category = isEditingPlace ? formData.category : place.category;
    const verifiedMapsUrl = (
      isEditingPlace ? formData.verifiedGoogleMapsUrl : place.verifiedGoogleMapsUrl || ''
    ).trim();
    if (!isVerifiedGoogleMapsShortUrl(verifiedMapsUrl)) {
      openEdit(place);
      toast.warning(`Add a verified Maps link (${verifiedGoogleMapsUrlHint()}) before promoting.`);
      return;
    }
    if (!category) {
      openEdit(place);
      toast.warning('Choose a category in the form, then click Promote again.');
      return;
    }
    const name = isEditingPlace ? formData.name.trim() : place.name;
    const description = isEditingPlace ? formData.description : place.description || '';
    const latitude = isEditingPlace
      ? formData.latitude
      : place.latitude != null
        ? String(place.latitude)
        : '';
    const longitude = isEditingPlace
      ? formData.longitude
      : place.longitude != null
        ? String(place.longitude)
        : '';
    const photoUrl = isEditingPlace ? formData.photoUrl : place.photoUrl || '';
    const rating = isEditingPlace
      ? formData.rating
      : place.rating != null
        ? String(place.rating)
        : '';

    try {
      const gemRef = await addDoc(collection(db, 'countries', decodedCountry, 'areas', areaId, 'localGems'), {
        name,
        category,
        rating,
        description,
        latitude,
        longitude,
        googleMapsUrl: verifiedMapsUrl,
        photoUrl,
        isDailyTrip: false,
        updatedAt: new Date(),
        sourceDiscoveredPlaceId: place.id,
      });

      await updateDoc(doc(db, 'countries', decodedCountry, 'areas', areaId, 'discoveredPlaces', place.id), {
        promotedToLocalGemId: gemRef.id,
        reviewStatus: 'reviewed',
        needsReview: false,
        updatedAt: new Date(),
      });

      toast.success(`Added to Local Gems as "${place.name}".`);
      setEditingId(null);
    } catch (e) {
      console.error(e);
      toast.error('Failed to promote to Local Gem.');
    }
  };

  const renderEditPanel = () => (
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
        <div className="col-span-2">
          <AdminLabel>Category</AdminLabel>
          <AdminSelect
            className="py-2 text-xs"
            value={formData.category}
            onChange={(e) => setFormData({ ...formData, category: e.target.value })}
          >
            <option value="">Category…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
          </AdminSelect>
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

  return (
    <div className="admin-page">
      <AdminBackHeader
        backTo={adminPath('/area')}
        backLabel="Back to Area Hub"
        title="Discovered Places"
        description={`${decodedArea}, ${decodedCountry}`}
        badge={
          needsReviewPlaces.length > 0 ? (
            <AdminBadge variant="gold">{needsReviewPlaces.length} new</AdminBadge>
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
        <div className="flex gap-1 p-0.5 bg-white rounded-lg border border-gray-100 shadow-sm w-full sm:w-auto">
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

      {isLoading ? (
        <div className="flex items-center justify-center py-16 gap-2 text-sm text-gray-500">
          <Loader2 className="animate-spin text-vailo-teal" size={20} />
          Loading…
        </div>
      ) : visiblePlaces.length === 0 ? (
        <AdminEmptyState
          icon={<Radar size={28} />}
          title={
            filter === 'needsReview'
              ? 'All caught up'
              : filter === 'reviewed'
                ? 'No reviewed places'
                : 'No hidden places'
          }
          description={
            filter === 'needsReview'
              ? 'No venues awaiting review.'
              : filter === 'reviewed'
                ? 'Mark places as reviewed to see them here before promoting to Local Gems.'
                : 'Hidden places are excluded from guest AI plans.'
          }
        />
      ) : (
        <AdminCard className="overflow-hidden">
          {/* Desktop table header */}
          <div className="hidden lg:grid lg:grid-cols-[2.5rem_1fr_8rem_5rem_4rem_7rem] gap-3 px-4 py-2 bg-vailo-surface-elevated border-b border-gray-100 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
            <span />
            <span>Place</span>
            <span>Category</span>
            <span>Rating</span>
            <span>Uses</span>
            <span className="text-right">Actions</span>
          </div>

          <ul className="divide-y divide-gray-50">
            {visiblePlaces.map((place) => {
              const isEditing = editingId === place.id;
              const isNew = place.reviewStatus === 'new' && place.status !== 'hidden';
              const isHidden = place.status === 'hidden';
              const hasVerifiedMaps = isVerifiedGoogleMapsShortUrl(
                place.verifiedGoogleMapsUrl || ''
              );
              const canMarkReviewed = isNew && hasVerifiedMaps;
              const canPromote =
                place.reviewStatus === 'reviewed' &&
                hasVerifiedMaps &&
                !place.promotedToLocalGemId &&
                !isHidden;

              return (
                <li
                  key={place.id}
                  className={
                    isNew ? 'bg-vailo-gold/[0.04]' : isHidden ? 'bg-gray-50/80' : ''
                  }
                >
                  {/* Row */}
                  <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-2.5 min-h-[52px]">
                    <PlaceThumb photoUrl={place.photoUrl} />

                    <div className="flex-1 min-w-0 lg:grid lg:grid-cols-[1fr_8rem_5rem_4rem] lg:gap-3 lg:items-center">
                      {/* Name + meta */}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="font-semibold text-sm text-vailo-dark truncate">{place.name}</span>
                          {isNew && (
                            <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-vailo-gold/15 text-vailo-gold-muted">
                              New
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
                        <p className="text-[11px] text-gray-400 truncate mt-0.5 lg:hidden">
                          {place.category || 'Uncategorized'} · {place.usageCount || 1}×
                          {place.rating != null && place.rating > 0 && ` · ★ ${place.rating.toFixed(1)}`}
                        </p>
                        {place.description && (
                          <p className="hidden sm:block text-[11px] text-gray-400 truncate mt-0.5 max-w-xl">
                            {place.description}
                          </p>
                        )}
                      </div>

                      {/* Category — desktop */}
                      <span className="hidden lg:block text-xs text-gray-600 truncate">
                        {place.category || '—'}
                      </span>

                      {/* Rating — desktop */}
                      <span className="hidden lg:flex items-center gap-0.5 text-xs text-gray-600">
                        {place.rating != null && place.rating > 0 ? (
                          <>
                            <Star size={11} className="text-vailo-gold fill-vailo-gold" />
                            {place.rating.toFixed(1)}
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
