import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { collection, deleteDoc, doc, getDoc, onSnapshot } from 'firebase/firestore';
import { Compass, MapPin, Plus, Pencil, Trash2, CalendarDays, Percent, ClipboardList } from 'lucide-react';
import { db } from '../../../lib/firebase';
import { useToast } from '../../../context/ToastContext';
import { adminPath } from '../../../lib/adminRoutes';
import { EXCURSION_PROVIDER_COLLECTION, EXCURSION_SUBCOLLECTION } from '../../../lib/excursionProvider';
import {
  adminExcursionAddPath,
  adminExcursionEditPath,
  excursionDurationLabel,
  excursionFromDoc,
  excursionLowestAdultPrice,
  excursionSeasonsSummary,
  excursionStatusLabel,
  excursionTravelStyleLabel,
  formatExcursionPrice,
  portalExcursionAddPath,
  portalExcursionEditPath,
  type Excursion,
  type ExcursionStatus,
} from '../../../lib/excursion';
import {
  adminExcursionAvailabilityPath,
  portalExcursionAvailabilityPath,
} from '../../../lib/excursionAvailability';
import {
  adminExcursionDiscountsPath,
  portalExcursionDiscountsPath,
} from '../../../lib/excursionDiscount';
import {
  adminExcursionBookingsPath,
  portalExcursionBookingsPath,
} from '../../../lib/excursionBooking';
import {
  AdminBackHeader,
  AdminButtonLink,
  AdminCard,
  AdminEmptyState,
} from '../../../components/admin/AdminPageHeader';

function StatusBadge({ status }: { status: ExcursionStatus }) {
  const styles: Record<ExcursionStatus, string> = {
    published: 'bg-emerald-50 text-emerald-800 border-emerald-100',
    draft: 'bg-gray-50 text-gray-700 border-gray-200',
    archived: 'bg-amber-50 text-amber-900 border-amber-100',
  };
  return (
    <span className={`px-2.5 py-1 text-xs font-semibold rounded-full border ${styles[status]}`}>
      {excursionStatusLabel(status)}
    </span>
  );
}

export default function ExcursionsListPage() {
  const { providerId } = useParams<{ providerId: string }>();
  const location = useLocation();
  const portalMode = location.pathname.includes('/excursion-portal/');
  const navigate = useNavigate();
  const toast = useToast();

  const [providerName, setProviderName] = useState('');
  const [excursions, setExcursions] = useState<Excursion[]>([]);
  const [loading, setLoading] = useState(true);

  const listBackPath = portalMode
    ? adminPath(`/excursion-portal/${providerId}`)
    : adminPath('/excursions/providers');

  const addPath = providerId
    ? adminPath(portalMode ? portalExcursionAddPath(providerId) : adminExcursionAddPath(providerId))
    : '#';

  useEffect(() => {
    if (!providerId) return;

    getDoc(doc(db, EXCURSION_PROVIDER_COLLECTION, providerId)).then((snap) => {
      if (snap.exists()) {
        setProviderName(String(snap.data().businessName || 'Provider'));
      }
    });

    const unsub = onSnapshot(
      collection(db, EXCURSION_PROVIDER_COLLECTION, providerId, EXCURSION_SUBCOLLECTION),
      (snapshot) => {
        setExcursions(
          snapshot.docs
            .map((d) => excursionFromDoc(d.id, d.data()))
            .sort((a, b) => (a.title || '').localeCompare(b.title || ''))
        );
        setLoading(false);
      },
      () => {
        toast.error('Failed to load excursions.');
        setLoading(false);
      }
    );

    return () => unsub();
  }, [providerId, toast]);

  const editPath = (excursionId: string) =>
    providerId
      ? adminPath(
          portalMode
            ? portalExcursionEditPath(providerId, excursionId)
            : adminExcursionEditPath(providerId, excursionId)
        )
      : '#';

  const availabilityPath = (excursionId: string) =>
    providerId
      ? adminPath(
          portalMode
            ? portalExcursionAvailabilityPath(providerId, excursionId)
            : adminExcursionAvailabilityPath(providerId, excursionId)
        )
      : '#';

  const discountsPath = (excursionId: string) =>
    providerId
      ? adminPath(
          portalMode
            ? portalExcursionDiscountsPath(providerId, excursionId)
            : adminExcursionDiscountsPath(providerId, excursionId)
        )
      : '#';

  const bookingsPath = (excursionId: string) =>
    providerId
      ? adminPath(
          portalMode
            ? portalExcursionBookingsPath(providerId, excursionId)
            : adminExcursionBookingsPath(providerId, excursionId)
        )
      : '#';

  const handleDelete = async (excursion: Excursion) => {
    if (!providerId || !excursion.id) return;
    if (!window.confirm(`Delete "${excursion.title}"? This cannot be undone.`)) return;

    try {
      await deleteDoc(
        doc(db, EXCURSION_PROVIDER_COLLECTION, providerId, EXCURSION_SUBCOLLECTION, excursion.id)
      );
      toast.success('Excursion deleted.');
    } catch (error) {
      console.error(error);
      toast.error('Failed to delete excursion.');
    }
  };

  const sorted = useMemo(
    () =>
      [...excursions].sort((a, b) => {
        const order = { published: 0, draft: 1, archived: 2 };
        const sa = order[a.status] ?? 1;
        const sb = order[b.status] ?? 1;
        if (sa !== sb) return sa - sb;
        return (a.title || '').localeCompare(b.title || '');
      }),
    [excursions]
  );

  if (!providerId) {
    navigate(adminPath('/excursions/providers'));
    return null;
  }

  if (loading) {
    return <div className="py-16 text-center text-gray-500 text-sm">Loading excursions…</div>;
  }

  return (
    <div className="admin-page">
      <AdminBackHeader
        backTo={listBackPath}
        backLabel={portalMode ? 'Back to business profile' : 'Back to providers'}
        title="Excursions"
        description={
          providerName
            ? `Products offered by ${providerName}`
            : 'Manage bookable excursion products'
        }
        action={
          <AdminButtonLink to={addPath}>
            <Plus size={18} /> Add excursion
          </AdminButtonLink>
        }
      />

      {sorted.length === 0 ? (
        <AdminEmptyState
          icon={<MapPin size={32} />}
          title="No excursions yet"
          description="Create your first excursion with pricing, duration, and publish status."
          action={
            <AdminButtonLink to={addPath}>
              <Plus size={18} /> Add excursion
            </AdminButtonLink>
          }
        />
      ) : (
        <AdminCard className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-vailo-surface-elevated/80 text-left">
                  <th className="px-4 sm:px-6 py-3 font-semibold text-gray-600">Excursion</th>
                  <th className="px-4 sm:px-6 py-3 font-semibold text-gray-600">Seasons</th>
                  <th className="px-4 sm:px-6 py-3 font-semibold text-gray-600">Travel style</th>
                  <th className="px-4 sm:px-6 py-3 font-semibold text-gray-600">Duration</th>
                  <th className="px-4 sm:px-6 py-3 font-semibold text-gray-600">From price</th>
                  <th className="px-4 sm:px-6 py-3 font-semibold text-gray-600">Status</th>
                  <th className="px-4 sm:px-6 py-3 font-semibold text-gray-600 text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((excursion) => (
                  <tr
                    key={excursion.id}
                    className="border-b border-gray-50 hover:bg-vailo-surface-elevated/50 transition-colors"
                  >
                    <td className="px-4 sm:px-6 py-4">
                      <div className="flex items-center gap-3 min-w-[12rem]">
                        {excursion.heroPhotoUrl ? (
                          <img
                            src={excursion.heroPhotoUrl}
                            alt=""
                            className="h-10 w-10 rounded-lg object-cover border border-gray-100"
                          />
                        ) : (
                          <div className="h-10 w-10 rounded-lg bg-vailo-teal/10 flex items-center justify-center text-vailo-teal">
                            <Compass size={16} />
                          </div>
                        )}
                        <div>
                          <p className="font-semibold text-vailo-dark">{excursion.title}</p>
                          {excursion.subtitle && (
                            <p className="text-xs text-gray-500">{excursion.subtitle}</p>
                          )}
                          {!excursion.subtitle && excursion.categories?.[0] && (
                            <p className="text-xs text-gray-500">{excursion.categories[0]}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 sm:px-6 py-4 text-gray-600 text-xs max-w-[10rem]">
                      {excursionSeasonsSummary(excursion)}
                    </td>
                    <td className="px-4 sm:px-6 py-4 text-gray-600">
                      {excursionTravelStyleLabel(excursion)}
                    </td>
                    <td className="px-4 sm:px-6 py-4 text-gray-600">
                      {excursionDurationLabel(excursion)}
                    </td>
                    <td className="px-4 sm:px-6 py-4 font-medium tabular-nums text-vailo-dark">
                      {formatExcursionPrice(
                        excursionLowestAdultPrice(excursion),
                        excursion.currency,
                        { from: excursion.showPriceFrom !== false }
                      )}
                    </td>
                    <td className="px-4 sm:px-6 py-4">
                      <StatusBadge status={excursion.status} />
                    </td>
                    <td className="px-4 sm:px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          to={bookingsPath(excursion.id!)}
                          className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
                          title="Bookings"
                        >
                          <ClipboardList size={16} />
                        </Link>
                        <Link
                          to={discountsPath(excursion.id!)}
                          className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
                          title="Discounts"
                        >
                          <Percent size={16} />
                        </Link>
                        <Link
                          to={availabilityPath(excursion.id!)}
                          className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
                          title="Availability calendar"
                        >
                          <CalendarDays size={16} />
                        </Link>
                        <Link
                          to={editPath(excursion.id!)}
                          className="p-2 rounded-lg text-vailo-teal hover:bg-vailo-teal/5 transition-colors"
                          title="Edit"
                        >
                          <Pencil size={16} />
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleDelete(excursion)}
                          className="p-2 rounded-lg text-red-600 hover:bg-red-50 transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </AdminCard>
      )}
    </div>
  );
}
