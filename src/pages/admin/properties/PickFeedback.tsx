import { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import {
  ExternalLink,
  Loader2,
  ThumbsDown,
  ThumbsUp,
  TrendingUp,
} from 'lucide-react';
import { db } from '../../../lib/firebase';
import AdminPageHeader, {
  AdminBadge,
  AdminCard,
  AdminEmptyState,
} from '../../../components/admin/AdminPageHeader';

type FeedbackDoc = {
  id: string;
  key?: string;
  title?: string;
  source?: string;
  category?: string;
  googlePlaceId?: string;
  googleMapsUrl?: string;
  latitude?: number | null;
  longitude?: number | null;
  thumbsUp?: number;
  thumbsDown?: number;
  lastVoteAt?: Date | null;
};

function parseDoc(id: string, data: Record<string, unknown>): FeedbackDoc {
  const lastVoteAt = data.lastVoteAt;
  return {
    id,
    key: typeof data.key === 'string' ? data.key : '',
    title: typeof data.title === 'string' ? data.title : '',
    source: typeof data.source === 'string' ? data.source : 'ai',
    category: typeof data.category === 'string' ? data.category : '',
    googlePlaceId: typeof data.googlePlaceId === 'string' ? data.googlePlaceId : '',
    googleMapsUrl: typeof data.googleMapsUrl === 'string' ? data.googleMapsUrl : '',
    latitude: typeof data.latitude === 'number' ? data.latitude : null,
    longitude: typeof data.longitude === 'number' ? data.longitude : null,
    thumbsUp: typeof data.thumbsUp === 'number' ? data.thumbsUp : 0,
    thumbsDown: typeof data.thumbsDown === 'number' ? data.thumbsDown : 0,
    lastVoteAt:
      lastVoteAt && typeof lastVoteAt === 'object' && 'toDate' in lastVoteAt
        ? (lastVoteAt as { toDate: () => Date }).toDate()
        : null,
  };
}

type SortMode = 'liked' | 'disliked' | 'recent';

export default function PickFeedback() {
  const { property, propertyId } = useOutletContext<{
    property: { propertyName?: string };
    propertyId: string;
  }>();
  const [items, setItems] = useState<FeedbackDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortMode, setSortMode] = useState<SortMode>('liked');

  useEffect(() => {
    if (!propertyId) return;
    const q = query(
      collection(db, 'properties', propertyId, 'picksFeedback'),
      orderBy('lastVoteAt', 'desc')
    );
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setItems(snapshot.docs.map((d) => parseDoc(d.id, d.data())));
        setLoading(false);
      },
      (err) => {
        console.error('picksFeedback listener:', err);
        setItems([]);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, [propertyId]);

  const sorted = useMemo(() => {
    const copy = [...items];
    if (sortMode === 'liked') {
      copy.sort((a, b) => (b.thumbsUp || 0) - (a.thumbsUp || 0));
    } else if (sortMode === 'disliked') {
      copy.sort((a, b) => (b.thumbsDown || 0) - (a.thumbsDown || 0));
    } else {
      copy.sort(
        (a, b) =>
          (b.lastVoteAt?.getTime() || 0) - (a.lastVoteAt?.getTime() || 0)
      );
    }
    return copy;
  }, [items, sortMode]);

  const totalUp = items.reduce((s, i) => s + (i.thumbsUp || 0), 0);
  const totalDown = items.reduce((s, i) => s + (i.thumbsDown || 0), 0);

  return (
    <div>
      <AdminPageHeader
        title="Pick Feedback"
        description={`Guest reactions to AI / Vailo recommendations for ${property?.propertyName || 'this property'}`}
        icon={<TrendingUp size={24} />}
      />

      {!loading && items.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          <AdminCard className="p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
              Recommendations rated
            </p>
            <p className="text-2xl font-bold text-vailo-dark font-luxury">{items.length}</p>
          </AdminCard>
          <AdminCard className="p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 flex items-center gap-1">
              <ThumbsUp size={12} className="text-emerald-600" /> Total liked
            </p>
            <p className="text-2xl font-bold text-emerald-700 font-luxury">{totalUp}</p>
          </AdminCard>
          <AdminCard className="p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 flex items-center gap-1">
              <ThumbsDown size={12} className="text-red-600" /> Total disliked
            </p>
            <p className="text-2xl font-bold text-red-700 font-luxury">{totalDown}</p>
          </AdminCard>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-1 bg-white p-1 rounded-xl mb-5 border border-gray-100 w-full sm:w-fit shadow-sm">
        {(
          [
            { id: 'liked', label: 'Most liked' },
            { id: 'disliked', label: 'Most disliked' },
            { id: 'recent', label: 'Recent votes' },
          ] as { id: SortMode; label: string }[]
        ).map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => setSortMode(opt.id)}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all ${
              sortMode === opt.id
                ? 'bg-vailo-teal text-white shadow-sm'
                : 'text-gray-500 hover:text-vailo-teal hover:bg-vailo-surface-elevated'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-500 gap-2">
          <Loader2 size={20} className="animate-spin text-vailo-teal" />
          Loading feedback…
        </div>
      ) : items.length === 0 ? (
        <AdminEmptyState
          icon={<TrendingUp size={28} />}
          title="No guest feedback yet"
          description="When guests thumbs-up or thumbs-down an AI recommendation, their votes will aggregate here so you can refine your gem catalogue."
        />
      ) : (
        <AdminCard className="overflow-hidden">
          <div className="admin-table-wrap border-0">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Place</th>
                  <th>Category</th>
                  <th>Source</th>
                  <th className="text-right">Liked</th>
                  <th className="text-right">Disliked</th>
                  <th className="text-right">Last vote</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sorted.map((item) => {
                  const mapHref =
                    item.googleMapsUrl ||
                    (item.googlePlaceId
                      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.title || '')}&query_place_id=${encodeURIComponent(item.googlePlaceId)}`
                      : item.latitude != null && item.longitude != null
                        ? `https://www.google.com/maps/search/?api=1&query=${item.latitude},${item.longitude}`
                        : '');
                  return (
                    <tr key={item.id}>
                      <td className="font-medium text-vailo-dark">
                        {item.title || '(unnamed)'}
                      </td>
                      <td className="text-gray-500">{item.category || '—'}</td>
                      <td>
                        <AdminBadge variant={item.source === 'database' ? 'gold' : 'teal'}>
                          {item.source === 'database' ? 'Vailo' : 'AI'}
                        </AdminBadge>
                      </td>
                      <td className="text-right font-semibold text-emerald-700 tabular-nums">
                        {item.thumbsUp || 0}
                      </td>
                      <td className="text-right font-semibold text-red-700 tabular-nums">
                        {item.thumbsDown || 0}
                      </td>
                      <td className="text-right text-xs text-gray-500 tabular-nums">
                        {item.lastVoteAt ? item.lastVoteAt.toLocaleString() : '—'}
                      </td>
                      <td className="text-right">
                        {mapHref && (
                          <a
                            href={mapHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-vailo-teal hover:text-vailo-gold transition-colors"
                          >
                            <ExternalLink size={12} /> Map
                          </a>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </AdminCard>
      )}
    </div>
  );
}
