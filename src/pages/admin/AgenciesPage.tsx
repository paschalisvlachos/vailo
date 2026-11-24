import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import {
  Briefcase,
  Building2,
  Check,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { db } from '../../lib/firebase';
import { useToast } from '../../context/ToastContext';
import { useAdminSession } from '../../context/AdminSessionContext';
import { adminPath } from '../../lib/adminRoutes';
import { createAgencyShell } from '../../lib/createAgencyShell';
import { PROPERTY_ASSIGNMENT_ROLES, formatOwnerRoleLabel } from '../../lib/adminAccess';
import { loadCountryNames } from '../../lib/countryNames';
import {
  formatMaxListingsLabel,
  parseMaxListings,
} from '../../lib/ownerListingQuota';
import AdminPageHeader, {
  AdminButton,
  AdminCard,
  AdminEmptyState,
  AdminInput,
  AdminLabel,
  AdminSelect,
} from '../../components/admin/AdminPageHeader';

type AgencyRow = {
  id: string;
  propertyName: string;
  urlSlug: string;
  internalRefCode: string;
  country: string;
  city: string;
  ownerId: string;
  createdAt: string;
  listingCount: number;
  maxListings?: number;
};

type AssigneeOption = {
  id: string;
  fullName: string;
  company: string;
  role: string;
  email: string;
  maxListings?: number;
};

export default function AgenciesPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const { selectedAgencyId, selectAgency } = useAdminSession();
  const [agencies, setAgencies] = useState<AgencyRow[]>([]);
  const [assignees, setAssignees] = useState<AssigneeOption[]>([]);
  const [listingCounts, setListingCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [countries, setCountries] = useState<string[]>([]);
  const [form, setForm] = useState({
    agencyName: '',
    urlSlug: '',
    internalRefCode: '',
    ownerId: '',
    country: 'Greece',
    areaName: '',
    maxListingsMode: '' as '' | 'unlimited' | 'limited',
    maxListings: '1',
    guestPortalAccessRequired: false,
    preArrivalCheckInEnabled: true,
    calendarSyncEnabled: false,
    reservationSplitEnabled: false,
  });

  useEffect(() => {
    loadCountryNames()
      .then(setCountries)
      .catch((err) => console.error('Failed to load countries:', err));
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'properties'), (snapshot) => {
      const rows = snapshot.docs.map((d) => {
        const data = d.data() as Record<string, unknown>;
        const maxListings = parseMaxListings(data.maxListings);
        return {
          id: d.id,
          propertyName: String(data.propertyName || '').trim() || 'Untitled agency',
          urlSlug: String(data.urlSlug || '').trim(),
          internalRefCode: String(data.internalRefCode || '').trim(),
          country: String(data.country || '').trim(),
          city: String(data.city || data.area || '').trim(),
          ownerId: String(data.ownerId || '').trim(),
          createdAt: String(data.createdAt || ''),
          listingCount: 0,
          ...(maxListings != null ? { maxListings } : {}),
        } satisfies AgencyRow;
      });
      rows.sort((a, b) => a.propertyName.localeCompare(b.propertyName));
      setAgencies(rows);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const q = query(
      collection(db, 'owners'),
      where('role', 'in', [...PROPERTY_ASSIGNMENT_ROLES])
    );
    const unsub = onSnapshot(q, (snapshot) => {
      const rows = snapshot.docs.map((d) => {
        const data = d.data() as Record<string, unknown>;
        const maxListings = parseMaxListings(data.maxListings);
        return {
          id: d.id,
          fullName: String(data.fullName || '').trim() || 'Unnamed',
          company: String(data.company || '').trim(),
          role: String(data.role || '').trim(),
          email: String(data.email || '').trim(),
          ...(maxListings != null ? { maxListings } : {}),
        } satisfies AssigneeOption;
      });
      rows.sort((a, b) => a.fullName.localeCompare(b.fullName));
      setAssignees(rows);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadCounts = async () => {
      const entries = await Promise.all(
        agencies.map(async (agency) => {
          const snap = await getDocs(
            collection(db, 'properties', agency.id, 'propertyTypes')
          );
          return [agency.id, snap.size] as const;
        })
      );
      if (cancelled) return;
      const next: Record<string, number> = {};
      for (const [id, count] of entries) next[id] = count;
      setListingCounts(next);
    };
    if (agencies.length > 0) void loadCounts();
    else setListingCounts({});
    return () => {
      cancelled = true;
    };
  }, [agencies]);

  const assigneeById = useMemo(() => {
    const map = new Map<string, AssigneeOption>();
    for (const row of assignees) map.set(row.id, row);
    return map;
  }, [assignees]);

  const rows = useMemo(
    () =>
      agencies.map((agency) => ({
        ...agency,
        listingCount: listingCounts[agency.id] ?? agency.listingCount,
      })),
    [agencies, listingCounts]
  );

  const openCreate = () => {
    setForm({
      agencyName: '',
      urlSlug: '',
      internalRefCode: '',
      ownerId: '',
      country: 'Greece',
      areaName: '',
      maxListingsMode: '',
      maxListings: '1',
      guestPortalAccessRequired: false,
      preArrivalCheckInEnabled: true,
      calendarSyncEnabled: false,
      reservationSplitEnabled: false,
    });
    setFormOpen(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.agencyName.trim()) {
      toast.warning('Enter an agency name.');
      return;
    }
    if (!form.maxListingsMode) {
      toast.warning('Select listing capacity (limited or unlimited).');
      return;
    }
    if (
      form.maxListingsMode === 'limited' &&
      (!form.maxListings.trim() || Number(form.maxListings) < 1)
    ) {
      toast.warning('Enter a max listings number of at least 1.');
      return;
    }
    setSaving(true);
    try {
      const created = await createAgencyShell({
        agencyName: form.agencyName,
        urlSlug: form.urlSlug,
        internalRefCode: form.internalRefCode,
        ownerId: form.ownerId || null,
        country: form.country,
        areaName: form.areaName,
        maxListings:
          form.maxListingsMode === 'unlimited' ? 'unlimited' : form.maxListings,
        guestPortalAccessRequired: form.guestPortalAccessRequired,
        preArrivalCheckInEnabled: form.preArrivalCheckInEnabled,
        calendarSyncEnabled: form.calendarSyncEnabled,
        reservationSplitEnabled: form.reservationSplitEnabled,
      });
      toast.success(`Agency “${created.propertyName}” created.`);
      setFormOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create agency.');
    } finally {
      setSaving(false);
    }
  };

  const handleSelect = (agency: AgencyRow) => {
    selectAgency(agency.id);
    toast.success(`Selected “${agency.propertyName}”. Your portfolio is now available.`);
    navigate(
      adminPath(`/account/settings?agency=${encodeURIComponent(agency.id)}`)
    );
  };

  const handleDelete = async (agency: AgencyRow) => {
    const listings = listingCounts[agency.id] ?? 0;
    const confirmMessage =
      listings > 0
        ? `Delete agency “${agency.propertyName}”? This removes the portfolio shell. Its ${listings} listing${listings === 1 ? '' : 's'} will become unreachable from admin until restored from backup.`
        : `Delete agency “${agency.propertyName}”?`;
    if (!window.confirm(confirmMessage)) return;

    setDeletingId(agency.id);
    try {
      await deleteDoc(doc(db, 'properties', agency.id));
      if (selectedAgencyId === agency.id) selectAgency(null);
      toast.success('Agency deleted.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete agency.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="admin-page">
      <AdminPageHeader
        title="Agencies"
        description="Create and manage agency portfolios. Select an agency to open its Your portfolio menu."
        icon={<Briefcase size={26} />}
        action={
          <AdminButton type="button" variant="accent" onClick={openCreate}>
            <Plus size={16} />
            Add agency
          </AdminButton>
        }
      />

      {selectedAgencyId ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-vailo-teal/20 bg-vailo-teal/5 px-4 py-3">
          <p className="text-sm text-vailo-dark">
            <span className="font-semibold">Selected agency:</span>{' '}
            {rows.find((r) => r.id === selectedAgencyId)?.propertyName || selectedAgencyId}
          </p>
          <AdminButton
            type="button"
            variant="secondary"
            onClick={() => {
              selectAgency(null);
              toast.info('Agency selection cleared.');
            }}
          >
            Clear selection
          </AdminButton>
        </div>
      ) : (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Select an agency to unlock its <span className="font-semibold">Your portfolio</span> menu
          in the sidebar.
        </div>
      )}

      {formOpen && (
        <AdminCard className="mb-6 p-5">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <h3 className="text-lg font-bold text-vailo-dark">New agency</h3>
              <p className="text-sm text-gray-500 mt-1">
                Creates a portfolio shell. Add listings afterward from Property Listings.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="p-2 rounded-lg text-gray-400 hover:text-vailo-dark hover:bg-gray-50"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>

          <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <AdminLabel htmlFor="agencyName">Agency name *</AdminLabel>
              <AdminInput
                id="agencyName"
                value={form.agencyName}
                onChange={(e) => setForm((prev) => ({ ...prev, agencyName: e.target.value }))}
                placeholder="e.g. Pas Property Management"
                required
              />
            </div>

            <div>
              <AdminLabel htmlFor="agencySlug">URL slug (optional)</AdminLabel>
              <AdminInput
                id="agencySlug"
                value={form.urlSlug}
                onChange={(e) => setForm((prev) => ({ ...prev, urlSlug: e.target.value }))}
                placeholder="Auto from name if empty"
                className="font-mono text-sm"
              />
            </div>

            <div>
              <AdminLabel htmlFor="agencyRef">Reference code (optional)</AdminLabel>
              <AdminInput
                id="agencyRef"
                value={form.internalRefCode}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, internalRefCode: e.target.value }))
                }
                placeholder="Auto-generated if empty"
                className="font-mono text-sm"
              />
            </div>

            <div>
              <AdminLabel htmlFor="agencyCountry">Country</AdminLabel>
              <AdminSelect
                id="agencyCountry"
                value={form.country}
                onChange={(e) => setForm((prev) => ({ ...prev, country: e.target.value }))}
              >
                {(countries.length ? countries : ['Greece']).map((country) => (
                  <option key={country} value={country}>
                    {country}
                  </option>
                ))}
              </AdminSelect>
            </div>

            <div>
              <AdminLabel htmlFor="agencyArea">Primary area (optional)</AdminLabel>
              <AdminInput
                id="agencyArea"
                value={form.areaName}
                onChange={(e) => setForm((prev) => ({ ...prev, areaName: e.target.value }))}
                placeholder="e.g. Chania"
              />
            </div>

            <div className="md:col-span-2">
              <AdminLabel htmlFor="agencyOwner">Assigned agent / owner (optional)</AdminLabel>
              <AdminSelect
                id="agencyOwner"
                value={form.ownerId}
                onChange={(e) => setForm((prev) => ({ ...prev, ownerId: e.target.value }))}
              >
                <option value="">Unassigned</option>
                {assignees.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.fullName}
                    {person.company ? ` · ${person.company}` : ''}
                    {` (${formatOwnerRoleLabel(person.role)})`}
                  </option>
                ))}
              </AdminSelect>
            </div>

            <div>
              <AdminLabel htmlFor="listingCapacityMode">Listing capacity *</AdminLabel>
              <AdminSelect
                id="listingCapacityMode"
                value={form.maxListingsMode}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    maxListingsMode: e.target.value as '' | 'unlimited' | 'limited',
                    maxListings:
                      e.target.value === 'limited' && !prev.maxListings ? '1' : prev.maxListings,
                  }))
                }
                required
              >
                <option value="" disabled>
                  Select capacity…
                </option>
                <option value="unlimited">Unlimited</option>
                <option value="limited">Limited</option>
              </AdminSelect>
            </div>

            {form.maxListingsMode === 'limited' ? (
              <div>
                <AdminLabel htmlFor="maxListings">Max property listings *</AdminLabel>
                <AdminInput
                  id="maxListings"
                  type="number"
                  min={1}
                  step={1}
                  required
                  value={form.maxListings}
                  onChange={(e) => setForm((prev) => ({ ...prev, maxListings: e.target.value }))}
                  placeholder="e.g. 3"
                />
              </div>
            ) : (
              <div className="hidden md:block" />
            )}

            <div className="md:col-span-2 rounded-xl border border-gray-200 bg-vailo-surface-elevated/60 p-4 space-y-3">
              <p className="text-sm font-semibold text-vailo-dark">Guest experience defaults</p>
              {(
                [
                  ['guestPortalAccessRequired', 'Require guest portal access code'],
                  ['preArrivalCheckInEnabled', 'Enable pre-arrival check-in'],
                  ['calendarSyncEnabled', 'Enable calendar sync'],
                  ['reservationSplitEnabled', 'Enable reservation split'],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={form[key]}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, [key]: e.target.checked }))
                    }
                    className="rounded border-gray-300 text-vailo-teal focus:ring-vailo-teal"
                  />
                  {label}
                </label>
              ))}
            </div>

            <div className="md:col-span-2 flex flex-wrap gap-2 justify-end pt-2">
              <AdminButton type="button" variant="secondary" onClick={() => setFormOpen(false)}>
                Cancel
              </AdminButton>
              <AdminButton type="submit" variant="primary" disabled={saving}>
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                Create agency
              </AdminButton>
            </div>
          </form>
        </AdminCard>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <Loader2 className="animate-spin mr-2" size={22} />
          Loading agencies…
        </div>
      ) : rows.length === 0 ? (
        <AdminEmptyState
          icon={<Building2 size={28} />}
          title="No agencies yet"
          description="Create an agency portfolio, then add property listings under it."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-vailo-surface-elevated text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Agency</th>
                <th className="px-4 py-3 font-semibold">Assigned to</th>
                <th className="px-4 py-3 font-semibold">Location</th>
                <th className="px-4 py-3 font-semibold">Listings (used / allowed)</th>
                <th className="px-4 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((agency) => {
                const assignee = agency.ownerId ? assigneeById.get(agency.ownerId) : null;
                const isSelected = selectedAgencyId === agency.id;
                const capacityLabel =
                  formatMaxListingsLabel(agency.maxListings) ||
                  formatMaxListingsLabel(assignee?.maxListings) ||
                  '—';
                return (
                  <tr
                    key={agency.id}
                    className={
                      isSelected
                        ? 'bg-vailo-teal/5 ring-1 ring-inset ring-vailo-teal/20'
                        : 'hover:bg-vailo-teal/[0.02]'
                    }
                  >
                    <td className="px-4 py-3.5 align-top">
                      <div className="font-semibold text-vailo-dark flex items-center gap-2">
                        {agency.propertyName}
                        {isSelected ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-vailo-teal/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-vailo-teal">
                            <Check size={11} /> Selected
                          </span>
                        ) : null}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {agency.urlSlug ? `/${agency.urlSlug}` : 'No slug'}
                        {agency.internalRefCode ? ` · ${agency.internalRefCode}` : ''}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 align-top">
                      {assignee ? (
                        <div>
                          <div className="font-medium text-gray-800">{assignee.fullName}</div>
                          <div className="text-xs text-gray-500">
                            {formatOwnerRoleLabel(assignee.role)}
                            {assignee.company ? ` · ${assignee.company}` : ''}
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-400">Unassigned</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 align-top text-gray-600">
                      {[agency.city, agency.country].filter(Boolean).join(', ') || '—'}
                    </td>
                    <td className="px-4 py-3.5 align-top">
                      <span className="inline-flex items-center gap-1 rounded-full bg-vailo-surface-elevated px-2.5 py-1 text-sm font-semibold tabular-nums text-vailo-dark">
                        <span>{agency.listingCount}</span>
                        <span className="text-gray-400 font-medium">/</span>
                        <span>{capacityLabel}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3.5 align-top">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {isSelected ? (
                          <button
                            type="button"
                            onClick={() => {
                              selectAgency(null);
                              toast.info('Agency selection cleared.');
                            }}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-vailo-teal/30 bg-white px-3 py-1.5 text-xs font-semibold text-vailo-teal hover:bg-vailo-teal/5"
                          >
                            Clear
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleSelect(agency)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-transparent bg-vailo-teal px-3 py-1.5 text-xs font-semibold text-white hover:bg-vailo-teal-hover"
                          >
                            <Check size={13} />
                            Select
                          </button>
                        )}
                        <Link
                          to={adminPath(`/account/settings?agency=${encodeURIComponent(agency.id)}&edit=1`)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-vailo-dark hover:border-vailo-teal/40 hover:bg-vailo-teal/5"
                        >
                          <Pencil size={13} />
                          Edit
                        </Link>
                        <button
                          type="button"
                          onClick={() => void handleDelete(agency)}
                          disabled={deletingId === agency.id}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-red-100 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                        >
                          {deletingId === agency.id ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : (
                            <Trash2 size={13} />
                          )}
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
