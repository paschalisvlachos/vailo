import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { collection, addDoc, updateDoc, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import {
  ArrowLeft,
  MapPin,
  CheckCircle,
  Gem,
  Pencil,
  Trash2,
  Loader2,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';

export default function AreaDiscoveredPlaces() {
  const { country, area } = useParams<{ country: string; area: string }>();
  const navigate = useNavigate();

  const decodedCountry = decodeURIComponent(country || '');
  const decodedArea = decodeURIComponent(area || '');
  const areaId = decodedArea.toLowerCase().replace(/\s+/g, '-');

  const [places, setPlaces] = useState<any[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [filter, setFilter] = useState<'new' | 'all'>('new');

  const [formData, setFormData] = useState({
    name: '',
    category: '',
    description: '',
    latitude: '',
    longitude: '',
    googleMapsUrl: '',
    photoUrl: '',
    rating: '',
  });

  useEffect(() => {
    if (!decodedCountry || !areaId) return;
    const catRef = collection(
      db,
      'countries',
      decodedCountry,
      'areas',
      areaId,
      'localGemsCategories'
    );
    return onSnapshot(catRef, (snapshot) => {
      setCategories(snapshot.docs.map((d) => ({ id: d.id, name: d.data().name })));
    });
  }, [decodedCountry, areaId]);

  useEffect(() => {
    if (!decodedCountry || !areaId) return;
    const ref = collection(
      db,
      'countries',
      decodedCountry,
      'areas',
      areaId,
      'discoveredPlaces'
    );
    return onSnapshot(ref, (snapshot) => {
      const rows = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      rows.sort((a: any, b: any) => {
        if (a.reviewStatus === 'new' && b.reviewStatus !== 'new') return -1;
        if (b.reviewStatus === 'new' && a.reviewStatus !== 'new') return 1;
        return (b.usageCount || 0) - (a.usageCount || 0);
      });
      setPlaces(rows);
      setIsLoading(false);
    });
  }, [decodedCountry, areaId]);

  const openEdit = (place: any) => {
    setEditingId(place.id);
    setFormData({
      name: place.name || '',
      category: place.category || '',
      description: place.description || '',
      latitude: place.latitude != null ? String(place.latitude) : '',
      longitude: place.longitude != null ? String(place.longitude) : '',
      googleMapsUrl: place.googleMapsUrl || '',
      photoUrl: place.photoUrl || '',
      rating: place.rating != null ? String(place.rating) : '',
    });
  };

  const handleSave = async () => {
    if (!editingId) return;
    setIsSaving(true);
    try {
      const ref = doc(
        db,
        'countries',
        decodedCountry,
        'areas',
        areaId,
        'discoveredPlaces',
        editingId
      );
      await updateDoc(ref, {
        name: formData.name.trim(),
        category: formData.category,
        description: formData.description,
        latitude: formData.latitude ? parseFloat(formData.latitude) : null,
        longitude: formData.longitude ? parseFloat(formData.longitude) : null,
        googleMapsUrl: formData.googleMapsUrl,
        photoUrl: formData.photoUrl,
        rating: formData.rating ? parseFloat(formData.rating) : null,
        updatedAt: new Date(),
      });
      setEditingId(null);
    } catch (e) {
      console.error(e);
      alert('Failed to save changes.');
    } finally {
      setIsSaving(false);
    }
  };

  const markReviewed = async (placeId: string) => {
    const ref = doc(
      db,
      'countries',
      decodedCountry,
      'areas',
      areaId,
      'discoveredPlaces',
      placeId
    );
    await updateDoc(ref, {
      reviewStatus: 'reviewed',
      needsReview: false,
      updatedAt: new Date(),
    });
  };

  const hidePlace = async (placeId: string) => {
    if (!confirm('Hide this place from guest AI plans?')) return;
    const ref = doc(
      db,
      'countries',
      decodedCountry,
      'areas',
      areaId,
      'discoveredPlaces',
      placeId
    );
    await updateDoc(ref, { status: 'hidden', updatedAt: new Date() });
  };

  const promoteToLocalGem = async (place: any) => {
    const category =
      editingId === place.id ? formData.category : place.category;
    if (!category) {
      openEdit(place);
      alert('Choose a category in the form, then click "Add to Local Gems" again.');
      return;
    }
    try {
      const gemRef = await addDoc(
        collection(db, 'countries', decodedCountry, 'areas', areaId, 'localGems'),
        {
          name: place.name,
          category,
          rating: place.rating != null ? String(place.rating) : '',
          description: place.description || '',
          latitude: place.latitude != null ? String(place.latitude) : '',
          longitude: place.longitude != null ? String(place.longitude) : '',
          googleMapsUrl: place.googleMapsUrl || '',
          photoUrl: place.photoUrl || '',
          isDailyTrip: false,
          updatedAt: new Date(),
          sourceDiscoveredPlaceId: place.id,
        }
      );

      await updateDoc(
        doc(db, 'countries', decodedCountry, 'areas', areaId, 'discoveredPlaces', place.id),
        {
          promotedToLocalGemId: gemRef.id,
          reviewStatus: 'reviewed',
          needsReview: false,
          updatedAt: new Date(),
        }
      );

      alert(`Added to Local Gems as "${place.name}".`);
      setEditingId(null);
    } catch (e) {
      console.error(e);
      alert('Failed to promote to Local Gem.');
    }
  };

  const visiblePlaces =
    filter === 'new' ? places.filter((p) => p.reviewStatus === 'new' && p.status !== 'hidden') : places.filter((p) => p.status !== 'hidden');

  const newCount = places.filter((p) => p.reviewStatus === 'new' && p.status !== 'hidden').length;

  return (
    <div className="max-w-5xl mx-auto pb-12">
      <button
        onClick={() => navigate('/area')}
        className="flex items-center text-sm text-gray-500 hover:text-gray-800 mb-6"
      >
        <ArrowLeft size={16} className="mr-1" /> Back to Area Hub
      </button>

      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <MapPin className="text-amber-600" />
            Discovered Places
          </h2>
          <p className="text-gray-500 mt-1">
            {decodedArea}, {decodedCountry} — imported from guest AI plans (Google)
          </p>
        </div>
        {newCount > 0 && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-900 px-4 py-2 rounded-xl text-sm font-bold">
            <AlertCircle size={18} />
            {newCount} need review
          </div>
        )}
      </div>

      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setFilter('new')}
          className={`px-4 py-2 rounded-lg text-sm font-bold ${filter === 'new' ? 'bg-amber-600 text-white' : 'bg-gray-100 text-gray-600'}`}
        >
          Needs review ({newCount})
        </button>
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-2 rounded-lg text-sm font-bold ${filter === 'all' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600'}`}
        >
          All active ({places.filter((p) => p.status !== 'hidden').length})
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin text-gray-400" size={32} />
        </div>
      ) : visiblePlaces.length === 0 ? (
        <div className="text-center py-16 bg-gray-50 rounded-xl border border-dashed border-gray-200 text-gray-500">
          No discovered places {filter === 'new' ? 'awaiting review' : 'yet'}. They appear when guests use the AI concierge.
        </div>
      ) : (
        <div className="space-y-4">
          {visiblePlaces.map((place) => (
            <div
              key={place.id}
              className={`bg-white border rounded-xl overflow-hidden shadow-sm ${place.reviewStatus === 'new' ? 'border-amber-300' : 'border-gray-200'}`}
            >
              <div className="flex flex-col sm:flex-row">
                <div className="w-full sm:w-40 h-32 sm:h-auto shrink-0 bg-gray-100">
                  {place.photoUrl ? (
                    <img src={place.photoUrl} alt={place.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">No photo</div>
                  )}
                </div>
                <div className="flex-1 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                    <div>
                      <h3 className="font-bold text-gray-900">{place.name}</h3>
                      <p className="text-xs text-gray-500">
                        {place.category || 'Uncategorized'} · Used {place.usageCount || 1}× ·{' '}
                        {place.source === 'google' ? 'Google import' : place.source}
                      </p>
                      {Array.isArray(place.alternateTitles) && place.alternateTitles.length > 1 && (
                        <p className="text-[10px] text-gray-400 mt-1">
                          Also matched as: {[...new Set(place.alternateTitles as string[])].filter((t) => t !== place.name).join(', ')}
                        </p>
                      )}
                    </div>
                    {place.reviewStatus === 'new' && (
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 px-2 py-1 rounded-full">
                        New
                      </span>
                    )}
                    {place.promotedToLocalGemId && (
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 px-2 py-1 rounded-full">
                        In Local Gems
                      </span>
                    )}
                  </div>

                  {editingId === place.id ? (
                    <div className="space-y-3 mt-3 border-t border-gray-100 pt-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <input
                          className="border rounded-lg px-3 py-2 text-sm"
                          placeholder="Name"
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        />
                        <select
                          className="border rounded-lg px-3 py-2 text-sm"
                          value={formData.category}
                          onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                        >
                          <option value="">Category</option>
                          {categories.map((c) => (
                            <option key={c.id} value={c.name}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                        <input
                          className="border rounded-lg px-3 py-2 text-sm"
                          placeholder="Latitude"
                          value={formData.latitude}
                          onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
                        />
                        <input
                          className="border rounded-lg px-3 py-2 text-sm"
                          placeholder="Longitude"
                          value={formData.longitude}
                          onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
                        />
                        <input
                          className="border rounded-lg px-3 py-2 text-sm md:col-span-2"
                          placeholder="Photo URL"
                          value={formData.photoUrl}
                          onChange={(e) => setFormData({ ...formData, photoUrl: e.target.value })}
                        />
                        <input
                          className="border rounded-lg px-3 py-2 text-sm md:col-span-2"
                          placeholder="Google Maps URL"
                          value={formData.googleMapsUrl}
                          onChange={(e) => setFormData({ ...formData, googleMapsUrl: e.target.value })}
                        />
                        <textarea
                          className="border rounded-lg px-3 py-2 text-sm md:col-span-2"
                          rows={2}
                          placeholder="Description"
                          value={formData.description}
                          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={handleSave}
                          disabled={isSaving}
                          className="px-4 py-2 bg-blue-600 text-white text-sm font-bold rounded-lg disabled:opacity-50"
                        >
                          {isSaving ? 'Saving...' : 'Save'}
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-bold rounded-lg"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {place.description && (
                        <p className="text-sm text-gray-600 line-clamp-2 mb-2">{place.description}</p>
                      )}
                      <p className="text-xs text-gray-400 font-mono mb-3">
                        {place.latitude != null && place.longitude != null
                          ? `${place.latitude}, ${place.longitude}`
                          : 'Missing coordinates'}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => openEdit(place)}
                          className="inline-flex items-center px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-bold rounded-lg"
                        >
                          <Pencil size={14} className="mr-1" /> Edit
                        </button>
                        {place.reviewStatus === 'new' && (
                          <button
                            onClick={() => markReviewed(place.id)}
                            className="inline-flex items-center px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold rounded-lg"
                          >
                            <CheckCircle size={14} className="mr-1" /> Mark reviewed
                          </button>
                        )}
                        {!place.promotedToLocalGemId && (
                          <button
                            onClick={() => promoteToLocalGem(place)}
                            className="inline-flex items-center px-3 py-1.5 bg-orange-50 hover:bg-orange-100 text-orange-800 text-xs font-bold rounded-lg"
                          >
                            <Gem size={14} className="mr-1" /> Add to Local Gems
                          </button>
                        )}
                        {place.googleMapsUrl && (
                          <a
                            href={place.googleMapsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center px-3 py-1.5 text-blue-600 text-xs font-bold"
                          >
                            <ExternalLink size={14} className="mr-1" /> Maps
                          </a>
                        )}
                        <button
                          onClick={() => hidePlace(place.id)}
                          className="inline-flex items-center px-3 py-1.5 text-red-600 text-xs font-bold"
                        >
                          <Trash2 size={14} className="mr-1" /> Hide
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
