import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { collection, deleteDoc, doc, getDoc, onSnapshot } from 'firebase/firestore';
import { Percent, Plus, Pencil, Trash2 } from 'lucide-react';
import { db } from '../../../lib/firebase';
import { useToast } from '../../../context/ToastContext';
import { adminPath } from '../../../lib/adminRoutes';
import { EXCURSION_PROVIDER_COLLECTION, EXCURSION_SUBCOLLECTION } from '../../../lib/excursionProvider';
import {
  adminExcursionEditPath,
  adminExcursionsListPath,
  portalExcursionEditPath,
  portalExcursionsListPath,
} from '../../../lib/excursion';
import {
  EXCURSION_DISCOUNTS_SUBCOLLECTION,
  adminExcursionDiscountAddPath,
  adminExcursionDiscountEditPath,
  discountFromDoc,
  discountOfferSummary,
  discountStatusLabel,
  discountTypeLabel,
  discountValiditySummary,
  portalExcursionDiscountAddPath,
  portalExcursionDiscountEditPath,
  type ExcursionDiscount,
  type ExcursionDiscountStatus,
} from '../../../lib/excursionDiscount';
import {
  AdminBackHeader,
  AdminButtonLink,
  AdminCard,
  AdminEmptyState,
} from '../../../components/admin/AdminPageHeader';

function StatusBadge({ status }: { status: ExcursionDiscountStatus }) {
  const styles: Record<ExcursionDiscountStatus, string> = {
    active: 'bg-emerald-50 text-emerald-800 border-emerald-100',
    inactive: 'bg-gray-50 text-gray-700 border-gray-200',
  };
  return (
    <span className={`px-2.5 py-1 text-xs font-semibold rounded-full border ${styles[status]}`}>
      {discountStatusLabel(status)}
    </span>
  );
}

export default function ExcursionDiscountsListPage() {
  const { providerId, excursionId } = useParams<{ providerId: string; excursionId: string }>();
  const location = useLocation();
  const portalMode = location.pathname.includes('/excursion-portal/');
  const navigate = useNavigate();
  const toast = useToast();

  const [providerName, setProviderName] = useState('');
  const [excursionTitle, setExcursionTitle] = useState('');
  const [excursionCurrency, setExcursionCurrency] = useState('EUR');
  const [discounts, setDiscounts] = useState<ExcursionDiscount[]>([]);
  const [loading, setLoading] = useState(true);

  const listPath = providerId
    ? adminPath(
        portalMode ? portalExcursionsListPath(providerId) : adminExcursionsListPath(providerId)
      )
    : adminPath('/excursions/providers');

  const addPath = providerId && excursionId
    ? adminPath(
        portalMode
          ? portalExcursionDiscountAddPath(providerId, excursionId)
          : adminExcursionDiscountAddPath(providerId, excursionId)
      )
    : '#';

  const editPath = (discountId: string) =>
    providerId && excursionId
      ? adminPath(
          portalMode
            ? portalExcursionDiscountEditPath(providerId, excursionId, discountId)
            : adminExcursionDiscountEditPath(providerId, excursionId, discountId)
        )
      : '#';

  const excursionEditPath =
    providerId && excursionId
      ? adminPath(
          portalMode
            ? portalExcursionEditPath(providerId, excursionId)
            : adminExcursionEditPath(providerId, excursionId)
        )
      : listPath;

  useEffect(() => {
    if (!providerId || !excursionId) return;

    getDoc(doc(db, EXCURSION_PROVIDER_COLLECTION, providerId)).then((snap) => {
      if (snap.exists()) {
        setProviderName(String(snap.data().businessName || ''));
      }
    });

    getDoc(
      doc(db, EXCURSION_PROVIDER_COLLECTION, providerId, EXCURSION_SUBCOLLECTION, excursionId)
    ).then((snap) => {
      if (!snap.exists()) {
        toast.error('Excursion not found.');
        navigate(listPath);
        return;
      }
      setExcursionTitle(String(snap.data().title || 'Excursion'));
      setExcursionCurrency(String(snap.data().currency || 'EUR'));
    });

    const unsub = onSnapshot(
      collection(
        db,
        EXCURSION_PROVIDER_COLLECTION,
        providerId,
        EXCURSION_SUBCOLLECTION,
        excursionId,
        EXCURSION_DISCOUNTS_SUBCOLLECTION
      ),
      (snapshot) => {
        setDiscounts(
          snapshot.docs
            .map((d) => discountFromDoc(d.id, d.data()))
            .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
        );
        setLoading(false);
      },
      () => {
        toast.error('Failed to load discounts.');
        setLoading(false);
      }
    );

    return () => unsub();
  }, [providerId, excursionId, listPath, navigate, toast]);

  const sorted = useMemo(
    () =>
      [...discounts].sort((a, b) => {
        const order = { active: 0, inactive: 1 };
        const sa = order[a.status] ?? 1;
        const sb = order[b.status] ?? 1;
        if (sa !== sb) return sa - sb;
        return (a.name || '').localeCompare(b.name || '');
      }),
    [discounts]
  );

  const handleDelete = async (discount: ExcursionDiscount) => {
    if (!providerId || !excursionId || !discount.id) return;
    const used = discount.usedCount || 0;
    if (used > 0) {
      toast.error('Cannot delete a discount that has already been used.');
      return;
    }
    if (!window.confirm(`Delete discount "${discount.name}"?`)) return;

    try {
      await deleteDoc(
        doc(
          db,
          EXCURSION_PROVIDER_COLLECTION,
          providerId,
          EXCURSION_SUBCOLLECTION,
          excursionId,
          EXCURSION_DISCOUNTS_SUBCOLLECTION,
          discount.id
        )
      );
      toast.success('Discount deleted.');
    } catch (error) {
      console.error(error);
      toast.error('Failed to delete discount.');
    }
  };

  if (!providerId || !excursionId) {
    navigate(listPath);
    return null;
  }

  if (loading) {
    return <div className="py-16 text-center text-gray-500 text-sm">Loading discounts…</div>;
  }

  return (
    <div className="admin-page">
      <AdminBackHeader
        backTo={listPath}
        backLabel="Back to excursions"
        title="Discounts"
        description={
          providerName
            ? `${excursionTitle} · ${providerName}`
            : excursionTitle
        }
        action={
          <div className="flex flex-wrap gap-2">
            <AdminButtonLink to={excursionEditPath} variant="secondary">
              Edit excursion
            </AdminButtonLink>
            <AdminButtonLink to={addPath}>
              <Plus size={18} /> Add discount
            </AdminButtonLink>
          </div>
        }
      />

      {sorted.length === 0 ? (
        <AdminEmptyState
          icon={<Percent size={32} />}
          title="No discounts yet"
          description="Create group-size discounts or promo codes for this excursion."
          action={
            <AdminButtonLink to={addPath}>
              <Plus size={18} /> Add discount
            </AdminButtonLink>
          }
        />
      ) : (
        <AdminCard className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-vailo-surface-elevated/80 text-left">
                  <th className="px-4 sm:px-6 py-3 font-semibold text-gray-600">Name</th>
                  <th className="px-4 sm:px-6 py-3 font-semibold text-gray-600">Type</th>
                  <th className="px-4 sm:px-6 py-3 font-semibold text-gray-600">Offer</th>
                  <th className="px-4 sm:px-6 py-3 font-semibold text-gray-600">Validity</th>
                  <th className="px-4 sm:px-6 py-3 font-semibold text-gray-600">Status</th>
                  <th className="px-4 sm:px-6 py-3 font-semibold text-gray-600 text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((discount) => (
                  <tr
                    key={discount.id}
                    className="border-b border-gray-50 hover:bg-vailo-surface-elevated/50 transition-colors"
                  >
                    <td className="px-4 sm:px-6 py-4 font-semibold text-vailo-dark">
                      {discount.name}
                    </td>
                    <td className="px-4 sm:px-6 py-4 text-gray-600">
                      {discountTypeLabel(discount.type)}
                    </td>
                    <td className="px-4 sm:px-6 py-4 text-gray-700">
                      {discountOfferSummary(discount, excursionCurrency)}
                    </td>
                    <td className="px-4 sm:px-6 py-4 text-gray-600 text-xs">
                      {discountValiditySummary(discount)}
                      {discount.type === 'promo_code' && discount.maxUses != null && (
                        <p className="text-gray-400 mt-0.5">
                          {discount.usedCount || 0} / {discount.maxUses} uses
                        </p>
                      )}
                    </td>
                    <td className="px-4 sm:px-6 py-4">
                      <StatusBadge status={discount.status} />
                    </td>
                    <td className="px-4 sm:px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          to={editPath(discount.id!)}
                          className="p-2 rounded-lg text-vailo-teal hover:bg-vailo-teal/5 transition-colors"
                          title="Edit"
                        >
                          <Pencil size={16} />
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleDelete(discount)}
                          className="p-2 rounded-lg text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
                          title={
                            (discount.usedCount || 0) > 0
                              ? 'Cannot delete — already used'
                              : 'Delete'
                          }
                          disabled={(discount.usedCount || 0) > 0}
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
