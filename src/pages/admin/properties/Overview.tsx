import { useState, useEffect, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  collection,
  doc,
  getDoc,
  updateDoc,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { formatGuestSlug, mergePreviousSlugs } from '../../../lib/guestPortalSlug';
import { useToast } from '../../../context/ToastContext';
import {
  User,
  Calendar,
  Pencil,
  Phone,
  Mail,
  MapPin,
  X,
  Save,
} from 'lucide-react';
import {
  AdminBadge,
  AdminButton,
  AdminCard,
  AdminInput,
  AdminLabel,
  AdminSelect,
} from '../../../components/admin/AdminPageHeader';
import type { PropertyRecord } from './PropertyLayout';
import type { ListingKind } from './PropertyFormPage';
import PropertyLanguagesCard from '../../../components/admin/PropertyLanguagesCard';

interface OwnerOption {
  id: string;
  fullName: string;
  role: string;
  company?: string;
  email?: string;
  phone?: string;
}

type FormData = {
  propertyName: string;
  urlSlug: string;
  internalRefCode: string;
  listingKind: ListingKind;
  country: string;
  area: string;
  ownerId: string;
  email: string;
  phone: string;
  guestPortalAccessRequired: boolean;
};

function buildFormFromProperty(property: PropertyRecord): FormData {
  return {
    propertyName: property.propertyName || '',
    urlSlug: property.urlSlug || '',
    internalRefCode: property.internalRefCode || '',
    listingKind: property.listingKind === 'hotel' ? 'hotel' : 'property',
    country: property.country || '',
    area: property.area || property.city || '',
    ownerId: property.ownerId || '',
    email: '',
    phone: '',
    guestPortalAccessRequired: property.guestPortalAccessRequired !== false,
  };
}

export default function Overview() {
  const { property, propertyId } = useOutletContext<{
    property: PropertyRecord;
    propertyId: string;
  }>();
  const toast = useToast();

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState<FormData>(() => buildFormFromProperty(property));
  const [ownersList, setOwnersList] = useState<OwnerOption[]>([]);
  const [countries, setCountries] = useState<string[]>([]);
  const [dbAreas, setDbAreas] = useState<string[]>([]);
  const [assignedOwner, setAssignedOwner] = useState<OwnerOption | null>(null);
  const [loadingOwner, setLoadingOwner] = useState(true);
  const prevOwnerIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isEditing) setFormData(buildFormFromProperty(property));
  }, [property, isEditing]);

  useEffect(() => {
    fetch('https://restcountries.com/v3.1/all?fields=name')
      .then((res) => res.json())
      .then((data) => {
        const names = data
          .map((c: { name: { common: string } }) => c.name.common)
          .sort((a: string, b: string) => a.localeCompare(b));
        setCountries(names);
      })
      .catch((err) => console.error('Failed to fetch countries:', err));
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'owners'), where('role', 'in', ['agent', 'owner']));
    return onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as OwnerOption[];
      list.sort((a, b) => a.fullName.localeCompare(b.fullName));
      setOwnersList(list);
    });
  }, []);

  useEffect(() => {
    if (!formData.country) {
      setDbAreas([]);
      return;
    }
    return onSnapshot(collection(db, 'countries', formData.country, 'areas'), (snapshot) => {
      const areas = snapshot.docs.map((d) => d.data().name as string);
      areas.sort((a, b) => a.localeCompare(b));
      setDbAreas(areas);
    });
  }, [formData.country]);

  useEffect(() => {
    const ownerId = isEditing ? formData.ownerId : property.ownerId;
    if (!ownerId) {
      setAssignedOwner(null);
      setLoadingOwner(false);
      return;
    }

    setLoadingOwner(true);
    getDoc(doc(db, 'owners', ownerId))
      .then((snap) => {
        setAssignedOwner(snap.exists() ? ({ id: snap.id, ...snap.data() } as OwnerOption) : null);
      })
      .catch(console.error)
      .finally(() => setLoadingOwner(false));
  }, [property.ownerId, formData.ownerId, isEditing]);

  useEffect(() => {
    if (!isEditing) {
      prevOwnerIdRef.current = null;
      return;
    }
    if (formData.ownerId === prevOwnerIdRef.current) return;
    prevOwnerIdRef.current = formData.ownerId;
    const owner = ownersList.find((o) => o.id === formData.ownerId);
    if (owner) {
      setFormData((prev) => ({
        ...prev,
        email: owner.email || '',
        phone: owner.phone || '',
      }));
    } else if (!formData.ownerId) {
      setFormData((prev) => ({ ...prev, email: '', phone: '' }));
    }
  }, [formData.ownerId, isEditing, ownersList]);

  const handleStartEdit = () => {
    const owner =
      ownersList.find((o) => o.id === property.ownerId) || assignedOwner;
    prevOwnerIdRef.current = property.ownerId || null;
    setFormData({
      ...buildFormFromProperty(property),
      email: owner?.email || '',
      phone: owner?.phone || '',
    });
    setIsEditing(true);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      setFormData((prev) => ({
        ...prev,
        [name]: (e.target as HTMLInputElement).checked,
      }));
      return;
    }
    if (name === 'country') {
      setFormData((prev) => ({ ...prev, country: value, area: '' }));
      return;
    }
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleCancel = () => {
    setFormData(buildFormFromProperty(property));
    setIsEditing(false);
  };

  const handleSave = async () => {
    if (!propertyId) return;
    setIsSaving(true);
    try {
      const newPropertySlug = formatGuestSlug(formData.urlSlug);
      await updateDoc(doc(db, 'properties', propertyId), {
        propertyName: formData.propertyName.trim(),
        urlSlug: newPropertySlug,
        previousUrlSlugs: mergePreviousSlugs(
          property.previousUrlSlugs,
          property.urlSlug,
          newPropertySlug
        ),
        internalRefCode: formData.internalRefCode.trim(),
        listingKind: formData.listingKind,
        country: formData.country,
        area: formData.area,
        city: formData.area,
        ownerId: formData.ownerId,
        guestPortalAccessRequired: formData.guestPortalAccessRequired,
        updatedAt: new Date().toISOString(),
      });
      if (formData.ownerId) {
        await updateDoc(doc(db, 'owners', formData.ownerId), {
          email: formData.email.trim(),
          phone: formData.phone.trim(),
          updatedAt: new Date().toISOString(),
        });
        setAssignedOwner((prev) =>
          prev && prev.id === formData.ownerId
            ? { ...prev, email: formData.email.trim(), phone: formData.phone.trim() }
            : prev
        );
      }
      setIsEditing(false);
    } catch (error) {
      console.error('Error saving property:', error);
      toast.error('Failed to save changes.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PropertyLanguagesCard propertyId={propertyId} propertyData={property as Record<string, unknown>} />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-sm text-gray-500">
          {isEditing ? 'Edit property details below, then save.' : 'Property summary and allocation.'}
        </p>
        {!isEditing ? (
          <AdminButton type="button" variant="secondary" onClick={handleStartEdit}>
            <Pencil size={16} /> Edit overview
          </AdminButton>
        ) : (
          <div className="flex gap-2">
            <AdminButton type="button" variant="secondary" onClick={handleCancel} disabled={isSaving}>
              <X size={16} /> Cancel
            </AdminButton>
            <AdminButton type="button" onClick={handleSave} disabled={isSaving}>
              <Save size={16} /> {isSaving ? 'Saving…' : 'Save changes'}
            </AdminButton>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <AdminCard className="p-6">
          <h3 className="text-sm font-bold text-vailo-dark uppercase tracking-wider flex items-center gap-2 mb-5">
            <Calendar size={16} className="text-vailo-teal/60" /> General details
          </h3>

          {isEditing ? (
            <div className="space-y-4">
              <div>
                <AdminLabel htmlFor="propertyName">Property name *</AdminLabel>
                <AdminInput
                  id="propertyName"
                  name="propertyName"
                  required
                  value={formData.propertyName}
                  onChange={handleChange}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <AdminLabel htmlFor="listingKind">Type *</AdminLabel>
                  <AdminSelect
                    id="listingKind"
                    name="listingKind"
                    value={formData.listingKind}
                    onChange={handleChange}
                  >
                    <option value="property">Property</option>
                    <option value="hotel">Hotel</option>
                  </AdminSelect>
                </div>
                <div>
                  <AdminLabel htmlFor="internalRefCode">Reference code *</AdminLabel>
                  <AdminInput
                    id="internalRefCode"
                    name="internalRefCode"
                    value={formData.internalRefCode}
                    onChange={handleChange}
                    className="font-mono text-sm"
                  />
                </div>
              </div>
              <div>
                <AdminLabel htmlFor="urlSlug">URL slug *</AdminLabel>
                <AdminInput
                  id="urlSlug"
                  name="urlSlug"
                  value={formData.urlSlug}
                  onChange={handleChange}
                  className="font-mono text-sm"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <AdminLabel htmlFor="country">Country *</AdminLabel>
                  <AdminSelect id="country" name="country" value={formData.country} onChange={handleChange}>
                    <option value="" disabled>
                      Select country
                    </option>
                    {countries.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </AdminSelect>
                </div>
                <div>
                  <AdminLabel htmlFor="area">Area *</AdminLabel>
                  <AdminSelect
                    id="area"
                    name="area"
                    value={formData.area}
                    onChange={handleChange}
                    disabled={!formData.country}
                  >
                    <option value="" disabled>
                      {dbAreas.length === 0 ? 'No areas configured' : 'Select area'}
                    </option>
                    {dbAreas.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </AdminSelect>
                </div>
              </div>
              <p className="text-xs text-gray-400">
                Registered{' '}
                {property.createdAt ? new Date(property.createdAt).toLocaleDateString() : '—'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <p className="text-xs text-gray-500 mb-1">Registration date</p>
                  <p className="font-medium text-vailo-dark">
                    {property.createdAt ? new Date(property.createdAt).toLocaleDateString() : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Type</p>
                  <AdminBadge variant={property.listingKind === 'hotel' ? 'gold' : 'teal'}>
                    {property.listingKind === 'hotel' ? 'Hotel' : 'Property'}
                  </AdminBadge>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Reference code</p>
                  <p className="font-medium text-vailo-dark font-mono text-sm">
                    {property.internalRefCode || '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">URL slug</p>
                  <p className="font-medium text-vailo-dark font-mono text-sm">/{property.urlSlug || '—'}</p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-xs text-gray-500 mb-1">Location</p>
                  <p className="font-medium text-vailo-dark inline-flex items-center gap-1.5">
                    <MapPin size={14} className="text-vailo-teal/50" />
                    {[property.area || property.city, property.country].filter(Boolean).join(', ') || '—'}
                  </p>
                </div>
              </div>
            </div>
          )}
        </AdminCard>

        <AdminCard className="p-6">
          <h3 className="text-sm font-bold text-vailo-dark uppercase tracking-wider flex items-center gap-2 mb-5">
            <User size={16} className="text-vailo-teal/60" /> Property allocation
          </h3>

          {isEditing ? (
            <div className="space-y-4">
              <div>
                <AdminLabel htmlFor="ownerId">Assigned agent / owner *</AdminLabel>
                <AdminSelect id="ownerId" name="ownerId" value={formData.ownerId} onChange={handleChange}>
                  <option value="">Select a user…</option>
                  {ownersList.map((user) => (
                    <option key={user.id} value={user.id}>
                      [{user.role}] {user.fullName}
                      {user.company ? ` (${user.company})` : ''}
                    </option>
                  ))}
                </AdminSelect>
              </div>
              {formData.ownerId && (
                <>
                  <div>
                    <AdminLabel htmlFor="email">Email</AdminLabel>
                    <AdminInput
                      id="email"
                      name="email"
                      type="email"
                      value={formData.email}
                      onChange={handleChange}
                      placeholder="contact@example.com"
                    />
                  </div>
                  <div>
                    <AdminLabel htmlFor="phone">Telephone</AdminLabel>
                    <AdminInput
                      id="phone"
                      name="phone"
                      type="tel"
                      value={formData.phone}
                      onChange={handleChange}
                      placeholder="+30 …"
                    />
                  </div>
                </>
              )}
            </div>
          ) : loadingOwner ? (
            <p className="text-sm text-gray-500 animate-pulse">Loading contact…</p>
          ) : assignedOwner ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-xl bg-vailo-teal/8 flex items-center justify-center text-vailo-teal font-bold text-lg">
                  {assignedOwner.fullName?.charAt(0) || '?'}
                </div>
                <div>
                  <p className="font-bold text-vailo-dark">{assignedOwner.fullName}</p>
                  {assignedOwner.role && <AdminBadge variant="gold">{assignedOwner.role}</AdminBadge>}
                </div>
              </div>
              <p className="flex items-center gap-2 text-sm text-gray-600">
                <Mail size={15} className="text-vailo-teal/50 shrink-0" />
                {assignedOwner.email || '—'}
              </p>
              <p className="flex items-center gap-2 text-sm text-gray-600">
                <Phone size={15} className="text-vailo-teal/50 shrink-0" />
                {assignedOwner.phone || '—'}
              </p>
            </div>
          ) : (
            <p className="text-sm text-gray-400 italic">No owner assigned to this property.</p>
          )}
        </AdminCard>
      </div>

      <AdminCard className="p-6">
        <h3 className="text-sm font-bold text-vailo-dark uppercase tracking-wider mb-4">
          Guest portal access
        </h3>
        {isEditing ? (
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              name="guestPortalAccessRequired"
              checked={formData.guestPortalAccessRequired}
              onChange={handleChange}
              className="mt-1 rounded border-gray-300 text-vailo-teal focus:ring-vailo-teal/30"
            />
            <span className="text-sm text-gray-700">
              <span className="font-semibold text-gray-900">Require guest access</span>
              <span className="block text-gray-500 mt-1">
                Guests need an invitation (password), an active stay on this unit (NFC/QR during
                booking dates), or a guest visitor access code. Access runs from activation until two days after
                checkout.
              </span>
            </span>
          </label>
        ) : (
          <p className="text-sm text-gray-700">
            {property.guestPortalAccessRequired !== false ? (
              <AdminBadge variant="teal">Access control enabled</AdminBadge>
            ) : (
              <span className="text-gray-500">Open portal (no invite gate)</span>
            )}
          </p>
        )}
      </AdminCard>
    </div>
  );
}
