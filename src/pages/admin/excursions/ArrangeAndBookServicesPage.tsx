import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { collection, collectionGroup, onSnapshot } from 'firebase/firestore';
import { Compass, Pencil } from 'lucide-react';
import { db } from '../../../lib/firebase';
import { useToast } from '../../../context/ToastContext';
import { adminPath } from '../../../lib/adminRoutes';
import {
  arrangeAndBookCategoryById,
  arrangeAndBookSubcategoryById,
  withArrangeAndBookReturnTo,
} from '../../../lib/arrangeAndBook';
import {
  EXCURSION_PROVIDER_COLLECTION,
  EXCURSION_SUBCOLLECTION,
} from '../../../lib/excursionProvider';
import {
  adminExcursionEditPath,
  adminExcursionsListPath,
  excursionFromDoc,
  excursionStatusLabel,
  type Excursion,
  type ExcursionStatus,
} from '../../../lib/excursion';
import {
  formatExcursionCategoriesSummary,
  offeringMatchesArrangeAndBook,
} from '../../../lib/excursionCategories';
import AdminPageHeader, {
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

type ServiceRow = Excursion & { providerName: string };

export default function ArrangeAndBookServicesPage() {
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const categoryId = searchParams.get('category') || '';
  const subcategoryId = searchParams.get('subcategory') || '';
  const category = arrangeAndBookCategoryById(categoryId);
  const subcategory = arrangeAndBookSubcategoryById(subcategoryId);

  const [providerNames, setProviderNames] = useState<Record<string, string>>({});
  const [offerings, setOfferings] = useState<Excursion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, EXCURSION_PROVIDER_COLLECTION),
      (snapshot) => {
        const names: Record<string, string> = {};
        snapshot.docs.forEach((d) => {
          names[d.id] = String(d.data().businessName || 'Provider');
        });
        setProviderNames(names);
      },
      (error) => {
        console.error(error);
        toast.error('Failed to load providers.');
      }
    );
    return () => unsub();
  }, [toast]);

  useEffect(() => {
    const unsub = onSnapshot(
      collectionGroup(db, EXCURSION_SUBCOLLECTION),
      (snapshot) => {
        setOfferings(
          snapshot.docs.map((d) => {
            const providerId = d.ref.parent.parent?.id || '';
            return excursionFromDoc(d.id, { ...d.data(), providerId });
          })
        );
        setLoading(false);
      },
      (error) => {
        console.error(error);
        toast.error('Failed to load services.');
        setLoading(false);
      }
    );
    return () => unsub();
  }, [toast]);

  const services = useMemo<ServiceRow[]>(() => {
    return offerings
      .filter((row) => offeringMatchesArrangeAndBook(row.categories, categoryId, subcategoryId))
      .map((row) => ({
        ...row,
        providerName: providerNames[row.providerId] || 'Provider',
      }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [offerings, providerNames, categoryId, subcategoryId]);

  const title = subcategory?.label || category?.label || 'Services';
  const description = useMemo(() => {
    if (subcategory?.id === 'excursions' && category) {
      return 'Offerings tagged as Excursions, and older trips that have no more specific service type yet.';
    }
    if (subcategory && category) {
      return `Bookable ${subcategory.label.toLowerCase()} services under ${category.label}.`;
    }
    if (category?.id === 'experiences') {
      return 'All experience offerings, including sailing, diving, and untagged older trips.';
    }
    if (category) {
      return `All bookable services tagged in ${category.label}.`;
    }
    return 'Choose a category or service from the left menu.';
  }, [category, subcategory]);

  if (loading) {
    return <div className="py-16 text-center text-gray-500 text-sm">Loading services…</div>;
  }

  return (
    <div className="admin-page">
      <AdminPageHeader
        title={title}
        description={description}
        icon={<Compass size={26} />}
      />

      {services.length === 0 ? (
        <AdminEmptyState
          icon={<Compass size={32} />}
          title={`No ${title.toLowerCase()} services yet`}
          description="Add a service from a provider. Existing excursions appear under Experiences → Excursions automatically."
        />
      ) : (
        <AdminCard className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-vailo-surface-elevated/80 text-left">
                  <th className="px-4 sm:px-6 py-3 font-semibold text-gray-600">Service</th>
                  <th className="px-4 sm:px-6 py-3 font-semibold text-gray-600">Provider</th>
                  <th className="px-4 sm:px-6 py-3 font-semibold text-gray-600">Tags</th>
                  <th className="px-4 sm:px-6 py-3 font-semibold text-gray-600">Status</th>
                  <th className="px-4 sm:px-6 py-3 font-semibold text-gray-600 text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {services.map((service) => (
                  <tr
                    key={`${service.providerId}-${service.id}`}
                    className="border-b border-gray-50 hover:bg-vailo-surface-elevated/50 transition-colors"
                  >
                    <td className="px-4 sm:px-6 py-4">
                      <div className="flex items-center gap-3 min-w-[12rem]">
                        {service.heroPhotoUrl ? (
                          <img
                            src={service.heroPhotoUrl}
                            alt=""
                            className="h-10 w-10 rounded-lg object-cover border border-gray-100"
                          />
                        ) : (
                          <div className="h-10 w-10 rounded-lg bg-vailo-teal/10 flex items-center justify-center text-vailo-teal">
                            <Compass size={16} />
                          </div>
                        )}
                        <div>
                          <p className="font-semibold text-vailo-dark">{service.title}</p>
                          {service.subtitle && (
                            <p className="text-xs text-gray-500">{service.subtitle}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 sm:px-6 py-4">
                      <Link
                        to={adminPath(adminExcursionsListPath(service.providerId))}
                        className="font-medium text-vailo-teal hover:underline"
                      >
                        {service.providerName}
                      </Link>
                    </td>
                    <td className="px-4 sm:px-6 py-4 text-gray-600 text-xs">
                      {formatExcursionCategoriesSummary(service.categories)}
                    </td>
                    <td className="px-4 sm:px-6 py-4">
                      <StatusBadge status={service.status} />
                    </td>
                    <td className="px-4 sm:px-6 py-4">
                      <div className="flex justify-end">
                        <Link
                          to={adminPath(
                            withArrangeAndBookReturnTo(
                              adminExcursionEditPath(service.providerId, service.id!),
                              categoryId,
                              subcategoryId || undefined
                            )
                          )}
                          className="p-2 rounded-lg text-vailo-teal hover:bg-vailo-teal/5 transition-colors"
                          title="Edit service"
                        >
                          <Pencil size={16} />
                        </Link>
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
