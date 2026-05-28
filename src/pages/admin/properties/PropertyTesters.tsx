import { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  updateDoc,
} from 'firebase/firestore';
import { FlaskConical, Plus, Trash2, Copy, Check, Pencil, X } from 'lucide-react';
import { db } from '../../../lib/firebase';
import { useToast } from '../../../context/ToastContext';
import {
  formatVisitorDurationStatus,
  generateTesterAccessCode,
  TESTER_DURATION_OPTIONS,
  visitorAccessWindowFromPreset,
  type PropertyTester,
  type TesterDurationPreset,
} from '../../../lib/guestPortalTesters';
import { getGuestPortalPublicOrigin } from '../../../lib/guestAccess';
import { buildGuestPortalUrl } from '../../../lib/guestPortalSlug';
import { AdminButton, AdminInput, AdminLabel, AdminSelect } from '../../../components/admin/AdminPageHeader';
import type { PropertyRecord } from './PropertyLayout';

const EMPTY_FORM = {
  typeId: '',
  name: '',
  email: '',
  duration: '1_week' as TesterDurationPreset,
};

export default function PropertyTesters() {
  const { property, propertyId } = useOutletContext<{
    property: PropertyRecord;
    propertyId: string;
  }>();
  const toast = useToast();

  const [propertyTypes, setPropertyTypes] = useState<
    { id: string; propertyTypeName?: string; urlSlug?: string; typeSlug?: string }[]
  >([]);
  const [testers, setTesters] = useState<PropertyTester[]>([]);
  const [filterTypeId, setFilterTypeId] = useState<string>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedUrlTypeId, setCopiedUrlTypeId] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PropertyTester | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!propertyId) return undefined;
    const unsub = onSnapshot(collection(db, 'properties', propertyId, 'propertyTypes'), (snap) => {
      setPropertyTypes(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [propertyId]);

  useEffect(() => {
    if (!propertyId) return undefined;
    if (propertyTypes.length === 0) {
      setTesters([]);
      return undefined;
    }
    const unsubs: (() => void)[] = [];
    const all: PropertyTester[] = [];

    for (const type of propertyTypes) {
      const unsub = onSnapshot(
        collection(db, 'properties', propertyId, 'propertyTypes', type.id, 'testers'),
        (snap) => {
          const rows = snap.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              propertyId,
              typeId: type.id,
              name: data.name || '',
              email: data.email || '',
              duration: (data.duration || '1_week') as TesterDurationPreset,
              accessCode: data.accessCode || '',
              validFrom: data.validFrom || '',
              validUntil: data.validUntil ?? null,
              createdAt: data.createdAt || '',
            } satisfies PropertyTester;
          });
          const others = all.filter((t) => t.typeId !== type.id);
          all.length = 0;
          all.push(...others, ...rows);
          setTesters([...all].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
        }
      );
      unsubs.push(unsub);
    }

    return () => unsubs.forEach((u) => u());
  }, [propertyId, propertyTypes]);

  const displayed = useMemo(
    () =>
      filterTypeId === 'all' ? testers : testers.filter((t) => t.typeId === filterTypeId),
    [testers, filterTypeId]
  );

  const unitName = (typeId: string) =>
    propertyTypes.find((t) => t.id === typeId)?.propertyTypeName || typeId;

  const testerRef = (tester: PropertyTester) =>
    doc(db, 'properties', propertyId, 'propertyTypes', tester.typeId, 'testers', tester.id);

  const openEdit = (tester: PropertyTester) => {
    setEditing(tester);
    setFormOpen(false);
    setForm({
      typeId: tester.typeId,
      name: tester.name,
      email: tester.email,
      duration: tester.duration,
    });
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
    setForm(EMPTY_FORM);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.typeId || !form.name.trim() || !form.email.trim()) {
      toast.warning('Unit, name, and email are required.');
      return;
    }
    setSaving(true);
    const windowFields = visitorAccessWindowFromPreset(form.duration);
    const accessCode = generateTesterAccessCode();

    try {
      await addDoc(
        collection(db, 'properties', propertyId, 'propertyTypes', form.typeId, 'testers'),
        {
          name: form.name.trim(),
          email: form.email.trim(),
          accessCode,
          createdAt: windowFields.validFrom,
          ...windowFields,
        }
      );
      toast.success(
        `Visitor added. Access code: ${accessCode}. Email delivery will be wired with invite sending.`
      );
      closeForm();
    } catch (err) {
      console.error(err);
      toast.error('Failed to add visitor.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    if (!form.typeId || !form.name.trim() || !form.email.trim()) {
      toast.warning('Unit, name, and email are required.');
      return;
    }
    setSaving(true);
    try {
      await updateDoc(testerRef(editing), {
        name: form.name.trim(),
        email: form.email.trim(),
      });
      toast.success('Visitor updated.');
      closeForm();
    } catch (err) {
      console.error(err);
      toast.error('Failed to update visitor.');
    } finally {
      setSaving(false);
    }
  };

  const handleExtend = async (tester: PropertyTester, preset: TesterDurationPreset) => {
    const windowFields = visitorAccessWindowFromPreset(preset);
    try {
      await updateDoc(testerRef(tester), {
        ...windowFields,
        updatedAt: new Date().toISOString(),
      });
      toast.success(`Access extended for ${tester.name}.`);
    } catch (err) {
      console.error(err);
      toast.error('Failed to extend access.');
    }
  };

  const handleDelete = async (tester: PropertyTester) => {
    const ok = window.confirm(
      `Are you sure you want to remove ${tester.name}?\n\nTheir access code (${tester.accessCode}) will stop working immediately.`
    );
    if (!ok) return;
    try {
      await deleteDoc(testerRef(tester));
      toast.success('Visitor removed.');
      if (editing?.id === tester.id) closeForm();
    } catch (err) {
      console.error(err);
      toast.error('Failed to remove visitor.');
    }
  };

  const copyCode = (tester: PropertyTester) => {
    navigator.clipboard.writeText(tester.accessCode);
    setCopiedId(tester.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const copyUnitPortalUrl = (typeId: string) => {
    const type = propertyTypes.find((t) => t.id === typeId);
    if (!type) return;
    const link = buildGuestPortalUrl(getGuestPortalPublicOrigin(), property, {
      id: type.id,
      urlSlug: type.urlSlug,
      typeSlug: type.typeSlug,
      propertyTypeName: type.propertyTypeName,
    });
    if (!link) {
      toast.warning('Set property and unit URL slugs before copying the guest portal link.');
      return;
    }
    navigator.clipboard.writeText(link);
    setCopiedUrlTypeId(typeId);
    setTimeout(() => setCopiedUrlTypeId(null), 2000);
    toast.success('Guest portal URL copied.');
  };

  const showForm = formOpen || editing;

  if (!property.guestPortalAccessRequired) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
        <p className="font-semibold mb-1">Guest access control is off</p>
        <p>
          Enable <strong>Require guest portal access</strong> on the property Overview to use
          visitor access codes and invitation gates.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <FlaskConical size={22} className="text-vailo-teal" />
            Guest visitor access
          </h2>
          <p className="text-sm text-gray-500 mt-1 max-w-xl">
            Issue access codes for visitors (preview stays, partners, etc.). They open the same unit
            URL as guests and choose &quot;I have a guest visitor access code&quot; at the gate.
          </p>
        </div>
        <AdminButton
          type="button"
          onClick={() => {
            setEditing(null);
            setForm(EMPTY_FORM);
            setFormOpen(true);
          }}
        >
          <Plus size={16} /> Add visitor
        </AdminButton>
      </div>

      <div className="mb-4">
        <select
          value={filterTypeId}
          onChange={(e) => setFilterTypeId(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium"
        >
          <option value="all">All units</option>
          {propertyTypes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.propertyTypeName}
            </option>
          ))}
        </select>
      </div>

      {showForm && (
        <form
          onSubmit={editing ? handleSaveEdit : handleAdd}
          className="mb-6 bg-white border border-gray-200 rounded-xl p-5 space-y-4 shadow-sm"
        >
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-gray-900">
              {editing ? 'Edit guest visitor' : 'New guest visitor'}
            </h3>
            <button
              type="button"
              onClick={closeForm}
              className="p-2 text-gray-400 hover:bg-gray-100 rounded-lg"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
          <div>
            <AdminLabel>Unit *</AdminLabel>
            <AdminSelect
              value={form.typeId}
              onChange={(e) => setForm((f) => ({ ...f, typeId: e.target.value }))}
              required
              disabled={Boolean(editing)}
            >
              <option value="">Select unit</option>
              {propertyTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.propertyTypeName}
                </option>
              ))}
            </AdminSelect>
            {editing && (
              <p className="text-xs text-gray-500 mt-1">Unit cannot be changed after creation.</p>
            )}
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <AdminLabel>Name *</AdminLabel>
              <AdminInput
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </div>
            <div>
              <AdminLabel>Email *</AdminLabel>
              <AdminInput
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                required
              />
            </div>
          </div>
          {!editing && (
            <div>
              <AdminLabel>Access duration *</AdminLabel>
              <AdminSelect
                value={form.duration}
                onChange={(e) =>
                  setForm((f) => ({ ...f, duration: e.target.value as TesterDurationPreset }))
                }
              >
                {TESTER_DURATION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </AdminSelect>
            </div>
          )}
          {editing && (
            <p className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
              Access code:{' '}
              <span className="font-mono font-bold text-vailo-teal">{editing.accessCode}</span>
              <span className="block text-xs text-gray-500 mt-1">
                Use &quot;Extend for&quot; in the table to reset how long access lasts.
              </span>
            </p>
          )}
          <div className="flex gap-2 justify-end">
            <AdminButton type="button" variant="secondary" onClick={closeForm}>
              Cancel
            </AdminButton>
            <AdminButton type="submit" disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Create visitor'}
            </AdminButton>
          </div>
        </form>
      )}

      {displayed.length === 0 ? (
        <div className="text-center py-12 rounded-xl border border-dashed border-gray-200 bg-gray-50">
          <p className="text-gray-600 font-medium">No guest visitors yet</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Name</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Email</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Unit</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Duration</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Extend for</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">Code</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {displayed.map((t) => {
                const durationText = formatVisitorDurationStatus(
                  t.duration,
                  t.validFrom,
                  t.validUntil,
                  nowTick
                );
                const isExpired =
                  t.validUntil != null && nowTick > new Date(t.validUntil).getTime();

                return (
                  <tr key={`${t.typeId}-${t.id}`} className="hover:bg-gray-50/80">
                    <td className="px-4 py-3 font-semibold text-gray-900">{t.name}</td>
                    <td className="px-4 py-3 text-gray-700">{t.email}</td>
                    <td className="px-4 py-3 text-gray-700">
                      <div className="flex items-center gap-1 min-w-0">
                        <span className="truncate">{unitName(t.typeId)}</span>
                        <button
                          type="button"
                          onClick={() => copyUnitPortalUrl(t.typeId)}
                          className="p-1.5 text-gray-400 hover:text-vailo-teal shrink-0"
                          title="Copy guest portal URL"
                          aria-label={`Copy portal URL for ${unitName(t.typeId)}`}
                        >
                          {copiedUrlTypeId === t.typeId ? (
                            <Check size={16} className="text-emerald-600" />
                          ) : (
                            <Copy size={16} />
                          )}
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                      <span className={isExpired ? 'text-red-600 font-medium' : ''}>
                        {durationText}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <select
                        defaultValue=""
                        onChange={(e) => {
                          const preset = e.target.value as TesterDurationPreset;
                          if (!preset) return;
                          void handleExtend(t, preset);
                          e.target.value = '';
                        }}
                        className="px-2 py-1.5 border border-gray-200 rounded-lg text-xs font-medium bg-white outline-none focus:ring-2 focus:ring-vailo-teal/20"
                        aria-label={`Extend access for ${t.name}`}
                      >
                        <option value="">Extend for…</option>
                        {TESTER_DURATION_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 font-mono font-bold tracking-wider text-vailo-teal">
                      {t.accessCode}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(t)}
                          className="p-1.5 text-gray-400 hover:text-vailo-teal"
                          title="Edit visitor"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => copyCode(t)}
                          className="p-1.5 text-gray-400 hover:text-vailo-teal"
                          title="Copy code"
                        >
                          {copiedId === t.id ? <Check size={16} /> : <Copy size={16} />}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(t)}
                          className="p-1.5 text-gray-400 hover:text-red-600"
                          title="Delete visitor"
                        >
                          <Trash2 size={16} />
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
