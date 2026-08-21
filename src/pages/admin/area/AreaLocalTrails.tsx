import { useEffect, useMemo, useState } from 'react';
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  Plus,
  Wand2,
  Star,
  Image as ImageIcon,
  Pencil,
  Trash2,
  Loader2,
  X,
  Search,
  ExternalLink,
  Footprints,
} from 'lucide-react';
import { db, storage } from '../../../lib/firebase';
import { useToast } from '../../../context/ToastContext';
import { httpsCallableMessage } from '../../../lib/callableError';
import { useAreaRouteParams } from '../../../hooks/useAreaRouteParams';
import { AdminCard, AdminEmptyState, AdminInput } from '../../../components/admin/AdminPageHeader';
import AreaHubBackLink from '../../../components/admin/AreaHubBackLink';
import { allTrailsPhotoUrl, resolveAllTrailsEmbedSrc } from '../../../lib/allTrailsTrail';

type TrailFormState = {
  name: string;
  description: string;
  allTrailsUrl: string;
  difficulty: string;
  lengthKm: string;
  elevationGainM: string;
  rating: string;
  reviewCount: string;
  routeType: string;
  latitude: string;
  longitude: string;
  photoUrl: string;
  allTrailsId: string;
  allTrailsSlug: string;
  allTrailsEmbedSrc: string;
};

const INITIAL_FORM: TrailFormState = {
  name: '',
  description: '',
  allTrailsUrl: '',
  difficulty: '',
  lengthKm: '',
  elevationGainM: '',
  rating: '',
  reviewCount: '',
  routeType: '',
  latitude: '',
  longitude: '',
  photoUrl: '',
  allTrailsId: '',
  allTrailsSlug: '',
  allTrailsEmbedSrc: '',
};

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const n = parseFloat(String(value ?? '').trim());
  return Number.isFinite(n) ? n : null;
}

function fieldString(value: unknown): string {
  if (value == null) return '';
  return String(value);
}

export default function AreaLocalTrails() {
  const toast = useToast();
  const { country: decodedCountry, areaId, areaName: decodedArea } = useAreaRouteParams();

  const [trails, setTrails] = useState<Record<string, unknown>[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMagicFilling, setIsMagicFilling] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [formData, setFormData] = useState<TrailFormState>(INITIAL_FORM);

  useEffect(() => {
    if (!decodedCountry || !areaId) return;
    const trailsRef = collection(db, 'countries', decodedCountry, 'areas', areaId, 'localTrails');
    return onSnapshot(trailsRef, (snapshot) => {
      setTrails(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
      setIsLoading(false);
    });
  }, [decodedCountry, areaId]);

  useEffect(() => {
    if (!isFormOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isFormOpen]);

  const sortedTrails = useMemo(
    () => [...trails].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))),
    [trails]
  );

  const filteredTrails = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return sortedTrails;
    return sortedTrails.filter((trail) => String(trail.name || '').toLowerCase().includes(q));
  }, [sortedTrails, searchText]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingId(null);
    setFormData(INITIAL_FORM);
    setImageFile(null);
    setImagePreview(null);
  };

  const openAddForm = () => {
    setEditingId(null);
    setFormData(INITIAL_FORM);
    setImageFile(null);
    setImagePreview(null);
    setIsFormOpen(true);
  };

  const handleEdit = (trail: Record<string, unknown>) => {
    setFormData({
      name: fieldString(trail.name),
      description: fieldString(trail.description),
      allTrailsUrl: fieldString(trail.allTrailsUrl),
      difficulty: fieldString(trail.difficulty),
      lengthKm: fieldString(trail.lengthKm),
      elevationGainM: fieldString(trail.elevationGainM),
      rating: fieldString(trail.rating),
      reviewCount: fieldString(trail.reviewCount),
      routeType: fieldString(trail.routeType),
      latitude: fieldString(trail.latitude),
      longitude: fieldString(trail.longitude),
      photoUrl: fieldString(trail.photoUrl),
      allTrailsId: fieldString(trail.allTrailsId),
      allTrailsSlug: fieldString(trail.allTrailsSlug),
      allTrailsEmbedSrc: fieldString(trail.allTrailsEmbedSrc || trail.allTrailsWidgetUrl),
    });
    setImagePreview(fieldString(trail.photoUrl) || allTrailsPhotoUrl(fieldString(trail.allTrailsId), null) || null);
    setImageFile(null);
    setEditingId(String(trail.id));
    setIsFormOpen(true);
  };

  const handleMagicFill = async () => {
    const url = formData.allTrailsUrl.trim();
    if (!url) {
      toast.warning('Paste an AllTrails trail URL first.');
      return;
    }
    setIsMagicFilling(true);
    try {
      const getAllTrailsTrailDetails = httpsCallable(getFunctions(), 'getAllTrailsTrailDetails');
      const result = await getAllTrailsTrailDetails({ allTrailsUrl: url });
      const data = (result.data || {}) as Record<string, unknown>;
      const photoUrl = fieldString(data.photoUrl) || allTrailsPhotoUrl(fieldString(data.allTrailsId), null);
      setFormData((prev) => ({
        ...prev,
        name: fieldString(data.name) || prev.name,
        description: fieldString(data.description) || prev.description,
        allTrailsUrl: fieldString(data.allTrailsUrl) || prev.allTrailsUrl,
        difficulty: fieldString(data.difficulty),
        lengthKm: fieldString(data.lengthKm),
        elevationGainM: fieldString(data.elevationGainM),
        rating: fieldString(data.rating),
        reviewCount: fieldString(data.reviewCount),
        routeType: fieldString(data.routeType),
        latitude: fieldString(data.latitude),
        longitude: fieldString(data.longitude),
        photoUrl,
        allTrailsId: fieldString(data.allTrailsId),
        allTrailsSlug: fieldString(data.allTrailsSlug),
        allTrailsEmbedSrc: fieldString(data.allTrailsEmbedSrc),
      }));
      if (photoUrl) {
        setImagePreview(photoUrl);
        setImageFile(null);
      }
    } catch (error) {
      toast.error(
        httpsCallableMessage(
          error,
          'Could not load this AllTrails trail. Check the URL, or enter the details manually.'
        )
      );
    } finally {
      setIsMagicFilling(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = formData.name.trim();
    if (!name) {
      toast.warning('Name is required.');
      return;
    }
    setIsSubmitting(true);
    try {
      let photoUrl = formData.photoUrl.trim();
      if (imageFile) {
        const storageRef = ref(
          storage,
          `areas/${decodedCountry}/${areaId}/trails/${Date.now()}_${imageFile.name}`
        );
        await uploadBytes(storageRef, imageFile);
        photoUrl = await getDownloadURL(storageRef);
      }

      const allTrailsUrl = formData.allTrailsUrl.trim();
      const payload: Record<string, unknown> = {
        name,
        description: formData.description.trim(),
        allTrailsUrl,
        difficulty: formData.difficulty.trim() || null,
        lengthKm: asNumber(formData.lengthKm),
        elevationGainM: asNumber(formData.elevationGainM),
        rating: asNumber(formData.rating),
        reviewCount: asNumber(formData.reviewCount),
        routeType: formData.routeType.trim() || null,
        latitude: asNumber(formData.latitude),
        longitude: asNumber(formData.longitude),
        photoUrl,
        allTrailsId: formData.allTrailsId.trim() || null,
        allTrailsSlug: formData.allTrailsSlug.trim() || null,
        allTrailsEmbedSrc: resolveAllTrailsEmbedSrc({
          embedSrc: formData.allTrailsEmbedSrc.trim(),
          slug: formData.allTrailsSlug.trim(),
          allTrailsUrl,
        }),
        source: allTrailsUrl.includes('alltrails.com') ? 'alltrails' : 'manual',
        updatedAt: new Date().toISOString(),
      };

      if (editingId) {
        await updateDoc(
          doc(db, 'countries', decodedCountry, 'areas', areaId, 'localTrails', editingId),
          payload
        );
      } else {
        await addDoc(collection(db, 'countries', decodedCountry, 'areas', areaId, 'localTrails'), {
          ...payload,
          createdAt: new Date().toISOString(),
        });
      }
      closeForm();
    } catch (error) {
      console.error(error);
      toast.error('Failed to save local trail.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Delete ${name}?`)) return;
    await deleteDoc(doc(db, 'countries', decodedCountry, 'areas', areaId, 'localTrails', id));
  };

  return (
    <div className="admin-page">
      <AreaHubBackLink />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center">
            <Footprints className="mr-2.5 text-vailo-gold shrink-0" size={26} />
            Local Trails
          </h2>
          <p className="text-sm text-gray-500 mt-1.5">
            Hiking trails for{' '}
            <span className="font-bold text-vailo-gold-muted">
              {decodedArea}, {decodedCountry}
            </span>
            . Live like a local uses this list for the Hiking & Trails category.
          </p>
        </div>
        <button
          type="button"
          onClick={openAddForm}
          className="flex items-center justify-center px-4 py-2.5 bg-vailo-gold text-vailo-dark text-sm font-bold rounded-lg hover:bg-vailo-gold-hover transition-colors shadow-sm w-full sm:w-auto"
        >
          <Plus size={18} className="mr-2" /> Add Trail
        </button>
      </div>

      {!isLoading && sortedTrails.length > 0 && (
        <div className="relative mb-4">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
          />
          <AdminInput
            type="search"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search by trail name…"
            className="pl-9 py-2 text-sm"
            aria-label="Search local trails"
          />
        </div>
      )}

      {isLoading ? (
        <div className="py-16 text-center text-gray-400">
          <Loader2 size={32} className="animate-spin mx-auto mb-3" />
          <p className="text-sm">Loading trails…</p>
        </div>
      ) : sortedTrails.length === 0 ? (
        <AdminEmptyState
          icon={<Footprints size={28} />}
          title="No Local Trails Added"
          description={`Paste an AllTrails URL and use AI Magic Fill, or add a trail manually for ${decodedArea}.`}
        />
      ) : filteredTrails.length === 0 ? (
        <AdminEmptyState
          icon={<Search size={28} />}
          title="No matching trails"
          description={`Nothing matches "${searchText.trim()}".`}
        />
      ) : (
        <AdminCard className="overflow-hidden">
          <div className="hidden lg:grid lg:grid-cols-[2.5rem_1fr_8rem_5rem_5rem] gap-3 px-4 py-2 bg-gray-50 border-b border-gray-200/80 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
            <span />
            <span>Trail</span>
            <span>Stats</span>
            <span>Rating</span>
            <span className="text-right">Actions</span>
          </div>
          <ul className="divide-y divide-gray-200/80">
            {filteredTrails.map((trail, index) => {
              const thumb = allTrailsPhotoUrl(fieldString(trail.allTrailsId), fieldString(trail.photoUrl));
              return (
                <li key={String(trail.id)} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50/90'}>
                  <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-2.5 min-h-[52px]">
                    <div className="h-10 w-10 sm:h-11 sm:w-11 rounded-lg bg-gray-100 overflow-hidden shrink-0 border border-gray-100">
                      {thumb ? (
                        <img src={thumb} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center text-gray-300">
                          <ImageIcon size={16} />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0 lg:grid lg:grid-cols-[1fr_8rem_5rem] lg:gap-3 lg:items-center">
                      <div className="min-w-0">
                        <span className="font-semibold text-sm text-gray-900 truncate block">
                          {fieldString(trail.name) || 'Untitled trail'}
                        </span>
                        {fieldString(trail.description) && (
                          <p className="hidden sm:block text-[11px] text-gray-400 truncate mt-0.5 max-w-xl">
                            {fieldString(trail.description)}
                          </p>
                        )}
                      </div>
                      <span className="hidden lg:block text-xs text-gray-600 truncate">
                        {[trail.difficulty, trail.lengthKm ? `${trail.lengthKm} km` : '', trail.routeType]
                          .filter(Boolean)
                          .join(' · ') || '—'}
                      </span>
                      <span className="hidden lg:flex items-center gap-0.5 text-xs text-gray-600">
                        {trail.rating ? (
                          <>
                            <Star size={11} className="text-yellow-500 fill-yellow-500" />
                            {String(trail.rating)}
                          </>
                        ) : (
                          '—'
                        )}
                      </span>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      {fieldString(trail.allTrailsUrl) && (
                        <a
                          href={fieldString(trail.allTrailsUrl)}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Open on AllTrails"
                          className="p-1.5 rounded-lg text-gray-400 hover:text-vailo-teal hover:bg-vailo-teal/5 transition-colors"
                        >
                          <ExternalLink size={15} />
                        </a>
                      )}
                      <button
                        type="button"
                        title="Edit"
                        onClick={() => handleEdit(trail)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-vailo-teal hover:bg-vailo-teal/5 transition-colors"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        title="Delete"
                        onClick={() => handleDelete(String(trail.id), fieldString(trail.name) || 'this trail')}
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

      {isFormOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-gray-900/45 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="local-trail-modal-title"
          onClick={closeForm}
        >
          <div
            className="bg-white w-full sm:max-w-2xl lg:max-w-3xl max-h-[92dvh] sm:max-h-[min(90vh,880px)] flex flex-col rounded-t-2xl sm:rounded-2xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 px-4 sm:px-6 py-4 border-b border-vailo-gold/20 bg-vailo-gold/[0.08] flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 id="local-trail-modal-title" className="text-lg font-bold text-vailo-dark truncate">
                  {editingId ? 'Edit Local Trail' : 'Add Local Trail'}
                </h3>
                <p className="text-xs text-vailo-gold-muted mt-0.5">
                  {decodedArea}, {decodedCountry}
                </p>
              </div>
              <button
                type="button"
                onClick={closeForm}
                className="p-2 rounded-lg text-vailo-dark/70 hover:bg-vailo-gold/15 transition-colors shrink-0"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            <form id="local-trail-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto overscroll-contain px-4 sm:px-6 py-4 sm:py-5 space-y-5">
              <div className="flex flex-col sm:flex-row gap-3 bg-vailo-teal/5 p-3 sm:p-4 rounded-xl border border-vailo-teal/10 items-stretch sm:items-center">
                <div className="flex-1 w-full min-w-0">
                  <label className="block text-xs font-bold text-vailo-dark uppercase tracking-wider mb-1">
                    AllTrails Link
                  </label>
                  <input
                    type="url"
                    name="allTrailsUrl"
                    value={formData.allTrailsUrl}
                    onChange={handleChange}
                    placeholder="https://www.alltrails.com/trail/greece/crete/chania-city-stroll?sh=true"
                    className="w-full px-3 py-2 bg-white border border-vailo-teal/15 rounded-lg admin-input outline-none text-sm"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleMagicFill}
                  disabled={isMagicFilling || !formData.allTrailsUrl.trim()}
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
              <p className="text-xs text-gray-500 -mt-3">
                Magic Fill reads the AllTrails trail page. Leave the URL empty and fill the fields below for trails that are not on AllTrails.
              </p>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Name *</label>
                <input
                  type="text"
                  name="name"
                  required
                  value={formData.name}
                  onChange={handleChange}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg outline-none text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Description</label>
                <textarea
                  name="description"
                  rows={4}
                  value={formData.description}
                  onChange={handleChange}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg outline-none resize-y text-sm min-h-[100px]"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Difficulty</label>
                  <input
                    type="text"
                    name="difficulty"
                    value={formData.difficulty}
                    onChange={handleChange}
                    placeholder="Easy, Moderate, Hard…"
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Route type</label>
                  <input
                    type="text"
                    name="routeType"
                    value={formData.routeType}
                    onChange={handleChange}
                    placeholder="Loop, Out & Back…"
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Length (km)</label>
                  <input
                    type="number"
                    step="0.1"
                    name="lengthKm"
                    value={formData.lengthKm}
                    onChange={handleChange}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Elevation gain (m)</label>
                  <input
                    type="number"
                    name="elevationGainM"
                    value={formData.elevationGainM}
                    onChange={handleChange}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Rating (1–5)</label>
                  <input
                    type="number"
                    step="0.1"
                    max="5"
                    name="rating"
                    value={formData.rating}
                    onChange={handleChange}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Review count</label>
                  <input
                    type="number"
                    name="reviewCount"
                    value={formData.reviewCount}
                    onChange={handleChange}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg outline-none text-sm"
                  />
                </div>
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
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setImageFile(file);
                      setImagePreview(URL.createObjectURL(file));
                    }}
                    className="block w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-amber-50 file:text-amber-800 hover:file:bg-amber-100 cursor-pointer"
                  />
                </div>
              </div>
            </form>

            <div className="shrink-0 px-4 sm:px-6 py-4 border-t border-gray-100 bg-gray-50/80 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <button
                type="button"
                onClick={closeForm}
                disabled={isSubmitting}
                className="w-full sm:w-auto px-5 py-2.5 text-sm font-semibold text-gray-600 hover:text-gray-900 rounded-xl border border-gray-200 bg-white disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="local-trail-form"
                disabled={isSubmitting}
                className="w-full sm:w-auto flex items-center justify-center px-6 py-2.5 bg-gray-900 text-white text-sm font-bold rounded-xl hover:bg-black disabled:opacity-50 transition-colors shadow-md"
              >
                {isSubmitting ? <Loader2 size={18} className="animate-spin mr-2" /> : null}
                Save Local Trail
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
