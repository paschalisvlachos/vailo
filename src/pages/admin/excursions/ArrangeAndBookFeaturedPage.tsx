import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  collection,
  collectionGroup,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import {
  ArrowDown,
  ArrowUp,
  Compass,
  Plus,
  Save,
  Star,
  Trash2,
} from 'lucide-react';
import { db } from '../../../lib/firebase';
import { useToast } from '../../../context/ToastContext';
import { adminPath } from '../../../lib/adminRoutes';
import {
  ARRANGE_AND_BOOK_CATEGORIES,
  arrangeAndBookCategoryById,
  arrangeAndBookSubcategoryById,
} from '../../../lib/arrangeAndBook';
import {
  ARRANGE_AND_BOOK_FEATURED_DOC,
  featuredListingKey,
  parseArrangeAndBookFeatured,
  serializeArrangeAndBookFeatured,
  type ArrangeAndBookFeaturedRef,
} from '../../../lib/arrangeAndBookFeatured';
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
  AdminButton,
  AdminCard,
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

function sameFeaturedOrder(a: ArrangeAndBookFeaturedRef[], b: ArrangeAndBookFeaturedRef[]): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (item, i) =>
      item.providerId === b[i]?.providerId && item.excursionId === b[i]?.excursionId
  );
}

export default function ArrangeAndBookFeaturedPage() {
  const toast = useToast();
  const [providerNames, setProviderNames] = useState<Record<string, string>>({});
  const [offerings, setOfferings] = useState<Excursion[]>([]);
  const [featured, setFeatured] = useState<ArrangeAndBookFeaturedRef[]>([]);
  const [savedFeatured, setSavedFeatured] = useState<ArrangeAndBookFeaturedRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [subcategoryFilter, setSubcategoryFilter] = useState('');

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
        toast.error('Failed to load listings.');
        setLoading(false);
      }
    );
    return () => unsub();
  }, [toast]);

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, ARRANGE_AND_BOOK_FEATURED_DOC),
      (snapshot) => {
        const items = parseArrangeAndBookFeatured(
          snapshot.exists() ? (snapshot.data() as Record<string, unknown>) : undefined
        );
        setFeatured(items);
        setSavedFeatured(items);
      },
      (error) => {
        console.error(error);
        toast.error('Failed to load featured listings.');
      }
    );
    return () => unsub();
  }, [toast]);

  const offeringByKey = useMemo(() => {
    const map = new Map<string, ServiceRow>();
    for (const row of offerings) {
      if (!row.id) continue;
      map.set(featuredListingKey({ providerId: row.providerId, excursionId: row.id }), {
        ...row,
        providerName: providerNames[row.providerId] || 'Provider',
      });
    }
    return map;
  }, [offerings, providerNames]);

  const featuredRows = useMemo(() => {
    return featured.map((ref) => {
      const key = featuredListingKey(ref);
      return {
        ref,
        key,
        row: offeringByKey.get(key) || null,
      };
    });
  }, [featured, offeringByKey]);

  const featuredKeys = useMemo(
    () => new Set(featured.map((ref) => featuredListingKey(ref))),
    [featured]
  );

  const subcategoryOptions = useMemo(() => {
    if (!categoryFilter) return [];
    return arrangeAndBookCategoryById(categoryFilter)?.subcategories || [];
  }, [categoryFilter]);

  const catalog = useMemo(() => {
    const q = search.trim().toLowerCase();
    return offerings
      .filter((row) => row.id && !featuredKeys.has(featuredListingKey({ providerId: row.providerId, excursionId: row.id! })))
      .filter((row) =>
        offeringMatchesArrangeAndBook(row.categories, categoryFilter, subcategoryFilter)
      )
      .filter((row) => {
        if (!q) return true;
        const providerName = (providerNames[row.providerId] || '').toLowerCase();
        const tags = formatExcursionCategoriesSummary(row.categories).toLowerCase();
        return (
          row.title.toLowerCase().includes(q) ||
          (row.subtitle || '').toLowerCase().includes(q) ||
          providerName.includes(q) ||
          tags.includes(q)
        );
      })
      .map((row) => ({
        ...row,
        providerName: providerNames[row.providerId] || 'Provider',
      }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [
    offerings,
    featuredKeys,
    categoryFilter,
    subcategoryFilter,
    search,
    providerNames,
  ]);

  const dirty = !sameFeaturedOrder(featured, savedFeatured);

  const addListing = (row: ServiceRow) => {
    if (!row.id) return;
    const ref = { providerId: row.providerId, excursionId: row.id };
    const key = featuredListingKey(ref);
    if (featuredKeys.has(key)) return;
    setFeatured((prev) => [...prev, ref]);
  };

  const removeAt = (index: number) => {
    setFeatured((prev) => prev.filter((_, i) => i !== index));
  };

  const move = (index: number, delta: number) => {
    setFeatured((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const items = serializeArrangeAndBookFeatured(featured);
      await setDoc(
        doc(db, ARRANGE_AND_BOOK_FEATURED_DOC),
        { items, updatedAt: serverTimestamp() },
        { merge: true }
      );
      setSavedFeatured(items);
      setFeatured(items);
      toast.success('Featured listings saved.');
    } catch (error) {
      console.error(error);
      toast.error('Failed to save featured listings.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="py-16 text-center text-gray-500 text-sm">Loading featured…</div>;
  }

  return (
    <div className="admin-page space-y-6">
      <AdminPageHeader
        title="Featured"
        description="Pick listings from any Arrange and Book category to highlight in Featured on the guest Book & Arrange experience."
        icon={<Star size={26} />}
        action={
          <AdminButton onClick={handleSave} disabled={!dirty || saving}>
            <Save size={16} />
            {saving ? 'Saving…' : 'Save featured'}
          </AdminButton>
        }
      />

      <AdminCard className="overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-vailo-dark">Current featured</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Order here is the guest display order.
            </p>
          </div>
          <span className="text-xs font-semibold text-gray-500">{featuredRows.length} selected</span>
        </div>

        {featuredRows.length === 0 ? (
          <div className="px-4 sm:px-6 py-10 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-vailo-teal/8 text-vailo-teal">
              <Star size={22} />
            </div>
            <p className="text-sm font-semibold text-vailo-dark">No featured listings yet</p>
            <p className="mt-1 text-xs text-gray-500 max-w-sm mx-auto">
              Add services from the catalog below. They can come from any provider category.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {featuredRows.map(({ ref, key, row }, index) => (
              <li
                key={key}
                className="px-4 sm:px-6 py-3.5 flex items-center gap-3 hover:bg-vailo-surface-elevated/40"
              >
                <span className="w-6 text-xs font-semibold text-gray-400 tabular-nums shrink-0">
                  {index + 1}
                </span>
                {row?.heroPhotoUrl ? (
                  <img
                    src={row.heroPhotoUrl}
                    alt=""
                    className="h-11 w-11 rounded-lg object-cover border border-gray-100 shrink-0"
                  />
                ) : (
                  <div className="h-11 w-11 rounded-lg bg-vailo-teal/10 flex items-center justify-center text-vailo-teal shrink-0">
                    <Compass size={16} />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-vailo-dark truncate">
                    {row?.title || 'Missing listing'}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {row
                      ? `${row.providerName} · ${formatExcursionCategoriesSummary(row.categories) || 'Untagged'}`
                      : `${ref.providerId} / ${ref.excursionId}`}
                  </p>
                </div>
                {row && <StatusBadge status={row.status} />}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30"
                    aria-label="Move up"
                  >
                    <ArrowUp size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(index, 1)}
                    disabled={index === featuredRows.length - 1}
                    className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30"
                    aria-label="Move down"
                  >
                    <ArrowDown size={15} />
                  </button>
                  {row?.id && (
                    <Link
                      to={adminPath(adminExcursionEditPath(row.providerId, row.id))}
                      className="px-2 py-1.5 text-xs font-semibold text-vailo-teal hover:underline"
                    >
                      Edit
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={() => removeAt(index)}
                    className="p-1.5 rounded-lg text-red-600 hover:bg-red-50"
                    aria-label="Remove from featured"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </AdminCard>

      <AdminCard className="overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-gray-100 space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-vailo-dark">Add from all listings</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Browse every listing under Providers (all Arrange and Book categories).
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search title, provider, or tags…"
              className="flex-1 min-w-0 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-vailo-dark placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-vailo-teal/30"
            />
            <select
              value={categoryFilter}
              onChange={(e) => {
                setCategoryFilter(e.target.value);
                setSubcategoryFilter('');
              }}
              className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-vailo-dark focus:outline-none focus:ring-2 focus:ring-vailo-teal/30"
            >
              <option value="">All categories</option>
              {ARRANGE_AND_BOOK_CATEGORIES.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.label}
                </option>
              ))}
            </select>
            <select
              value={subcategoryFilter}
              onChange={(e) => setSubcategoryFilter(e.target.value)}
              disabled={!categoryFilter}
              className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-vailo-dark focus:outline-none focus:ring-2 focus:ring-vailo-teal/30 disabled:opacity-50"
            >
              <option value="">
                {categoryFilter
                  ? `All ${arrangeAndBookCategoryById(categoryFilter)?.label || 'subcategories'}`
                  : 'All subcategories'}
              </option>
              {subcategoryOptions.map((sub) => (
                <option key={sub.id} value={sub.id}>
                  {sub.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {catalog.length === 0 ? (
          <div className="px-4 sm:px-6 py-10 text-center text-sm text-gray-500">
            {offerings.length === 0
              ? 'No listings found under Providers yet.'
              : featuredKeys.size === offerings.length
                ? 'Every listing is already featured.'
                : 'No listings match these filters.'}
            {subcategoryFilter && arrangeAndBookSubcategoryById(subcategoryFilter) ? (
              <span className="block mt-1 text-xs">
                Filtered to {arrangeAndBookSubcategoryById(subcategoryFilter)?.label}.
              </span>
            ) : null}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-vailo-surface-elevated/80 text-left">
                  <th className="px-4 sm:px-6 py-3 font-semibold text-gray-600">Service</th>
                  <th className="px-4 sm:px-6 py-3 font-semibold text-gray-600">Provider</th>
                  <th className="px-4 sm:px-6 py-3 font-semibold text-gray-600">Tags</th>
                  <th className="px-4 sm:px-6 py-3 font-semibold text-gray-600">Status</th>
                  <th className="px-4 sm:px-6 py-3 font-semibold text-gray-600 text-right">
                    Add
                  </th>
                </tr>
              </thead>
              <tbody>
                {catalog.map((service) => (
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
                    <td className="px-4 sm:px-6 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => addListing(service)}
                        className="inline-flex items-center gap-1 rounded-lg bg-vailo-teal/10 px-2.5 py-1.5 text-xs font-semibold text-vailo-teal hover:bg-vailo-teal/15"
                      >
                        <Plus size={14} />
                        Add
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminCard>
    </div>
  );
}
