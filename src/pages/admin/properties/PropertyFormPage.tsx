import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { collection, addDoc, doc, getDoc, updateDoc, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { formatGuestSlug, mergePreviousSlugs } from '../../../lib/guestPortalSlug';
import { GUEST_PORTAL_ACCESS_REQUIRED_DEFAULT } from '../../../lib/guestAccess';
import { adminPath } from '../../../lib/adminRoutes';
import { useToast } from '../../../context/ToastContext';
import {
  AdminBackHeader,
  AdminButton,
  AdminCard,
  AdminInput,
  AdminLabel,
  AdminSelect,
} from '../../../components/admin/AdminPageHeader'; 

export type ListingKind = 'hotel' | 'property';

const EMPTY_FORM = {
  propertyName: '',
  urlSlug: '',
  internalRefCode: '',
  ownerId: '',
  listingKind: 'property' as ListingKind,
  country: '',
  area: '',
};

type PropertyFormData = typeof EMPTY_FORM;

interface Owner {
  id: string;
  fullName: string;
  role: string;
  company?: string;
}

export default function PropertyFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const toast = useToast();

  const [formData, setFormData] = useState<PropertyFormData>(EMPTY_FORM);
  const [ownersList, setOwnersList] = useState<Owner[]>([]);
  const [countries, setCountries] = useState<string[]>([]);
  const [dbAreas, setDbAreas] = useState<string[]>([]);
  const [isSlugManuallyEdited, setIsSlugManuallyEdited] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      const fetched = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as Owner[];
      fetched.sort((a, b) => {
        if (a.role === 'agent' && b.role !== 'agent') return -1;
        if (a.role !== 'agent' && b.role === 'agent') return 1;
        return a.fullName.localeCompare(b.fullName);
      });
      setOwnersList(fetched);
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
    if (isEdit) return;
    setFormData((prev) => ({
      ...prev,
      internalRefCode: `VLO-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
    }));
  }, [isEdit]);

  useEffect(() => {
    if (!id) return;

    const loadProperty = async () => {
      try {
        const snap = await getDoc(doc(db, 'properties', id));
        if (!snap.exists()) {
          toast.error('Property not found.');
          navigate(adminPath('/properties'));
          return;
        }
        const data = snap.data();
        setIsSlugManuallyEdited(true);
        setFormData({
          propertyName: data.propertyName || '',
          urlSlug: data.urlSlug || '',
          internalRefCode: data.internalRefCode || '',
          ownerId: data.ownerId || '',
          listingKind: data.listingKind === 'hotel' ? 'hotel' : 'property',
          country: data.country || '',
          area: data.area || data.city || '',
        });
      } catch (error) {
        console.error('Error loading property:', error);
        toast.error('Failed to load property.');
        navigate(adminPath('/properties'));
      } finally {
        setLoading(false);
      }
    };

    loadProperty();
  }, [id, navigate]);

  const formatSlugPart = (text: string) =>
    text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');

  useEffect(() => {
    if (isSlugManuallyEdited) return;
    const nameSlug = formatSlugPart(formData.propertyName);
    setFormData((prev) => ({ ...prev, urlSlug: nameSlug }));
  }, [formData.propertyName, isSlugManuallyEdited]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    if (name === 'urlSlug') setIsSlugManuallyEdited(true);
    if (name === 'country') {
      setFormData((prev) => ({ ...prev, country: value, area: '' }));
      return;
    }
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    const newPropertySlug = formatGuestSlug(formData.urlSlug);

    try {
      if (isEdit && id) {
        const existingSnap = await getDoc(doc(db, 'properties', id));
        const existing = existingSnap.data();
        await updateDoc(doc(db, 'properties', id), {
          propertyName: formData.propertyName,
          urlSlug: newPropertySlug,
          previousUrlSlugs: mergePreviousSlugs(
            existing?.previousUrlSlugs,
            existing?.urlSlug,
            newPropertySlug
          ),
          internalRefCode: formData.internalRefCode,
          ownerId: formData.ownerId,
          listingKind: formData.listingKind,
          country: formData.country,
          area: formData.area,
          city: formData.area,
          updatedAt: new Date().toISOString(),
        });
        navigate(adminPath(`/properties/${id}`));
      } else {
        const ref = await addDoc(collection(db, 'properties'), {
          propertyName: formData.propertyName,
          urlSlug: newPropertySlug,
          previousUrlSlugs: [],
          internalRefCode: formData.internalRefCode,
          ownerId: formData.ownerId,
          listingKind: formData.listingKind,
          country: formData.country,
          area: formData.area,
          city: formData.area,
          guestPortalAccessRequired: GUEST_PORTAL_ACCESS_REQUIRED_DEFAULT,
          createdAt: new Date().toISOString(),
        });
        navigate(adminPath(`/properties/${ref.id}`));
      }
    } catch (error) {
      console.error('Error saving property:', error);
      toast.error('Failed to save property.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return <div className="admin-page py-16 text-center text-gray-500 text-sm">Loading property…</div>;
  }

  return (
    <div className="admin-page">
      <AdminBackHeader
        backTo={adminPath('/properties')}
        backLabel="Back to Properties"
        title={isEdit ? 'Edit Property' : 'Add New Property'}
        description={
          isEdit
            ? `Update details for ${formData.propertyName || 'this property'}`
            : 'Create a new property for your concierge app'
        }
      />

      <form onSubmit={handleSubmit}>
        <AdminCard className="overflow-hidden">
          <div className="p-6 sm:p-8 space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
              <div>
                <AdminLabel htmlFor="propertyName">Property name *</AdminLabel>
                <AdminInput
                  id="propertyName"
                  required
                  name="propertyName"
                  value={formData.propertyName}
                  onChange={handleChange}
                />
              </div>
              <div>
                <AdminLabel htmlFor="urlSlug">URL slug *</AdminLabel>
                <AdminInput
                  id="urlSlug"
                  required
                  name="urlSlug"
                  value={formData.urlSlug}
                  onChange={handleChange}
                  placeholder="e.g. villa-paschalis"
                  className="bg-vailo-surface-elevated"
                />
              </div>
              <div>
                <AdminLabel htmlFor="listingKind">Type *</AdminLabel>
                <AdminSelect
                  id="listingKind"
                  required
                  name="listingKind"
                  value={formData.listingKind}
                  onChange={handleChange}
                >
                  <option value="property">Property</option>
                  <option value="hotel">Hotel</option>
                </AdminSelect>
              </div>
              <div>
                <AdminLabel htmlFor="internalRefCode">Internal reference code *</AdminLabel>
                <AdminInput
                  id="internalRefCode"
                  required
                  name="internalRefCode"
                  value={formData.internalRefCode}
                  onChange={handleChange}
                  className="bg-vailo-surface-elevated font-mono text-sm"
                />
              </div>
            </div>

            <hr className="border-gray-100" />

            <div>
              <h3 className="admin-section-title border-0 pb-0 mb-4">Location</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
                <div>
                  <AdminLabel htmlFor="country">Country *</AdminLabel>
                  <AdminSelect
                    id="country"
                    required
                    name="country"
                    value={formData.country}
                    onChange={handleChange}
                  >
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
                  <AdminLabel htmlFor="area">Area / municipality *</AdminLabel>
                  <AdminSelect
                    id="area"
                    required
                    name="area"
                    value={formData.area}
                    onChange={handleChange}
                    disabled={!formData.country}
                  >
                    <option value="" disabled>
                      {dbAreas.length === 0 ? 'No areas — add in Area Functionality' : 'Select area'}
                    </option>
                    {dbAreas.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </AdminSelect>
                </div>
              </div>
            </div>

            <hr className="border-gray-100" />

            <div>
              <h3 className="admin-section-title border-0 pb-0 mb-4">Property allocation</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
                <div className="md:col-span-2">
                  <AdminLabel htmlFor="ownerId">Assigned agent / owner *</AdminLabel>
                  <AdminSelect
                    id="ownerId"
                    required
                    name="ownerId"
                    value={formData.ownerId}
                    onChange={handleChange}
                  >
                    <option value="">Select a user…</option>
                    {ownersList.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.role === 'agent' ? '[Agent]' : '[Owner]'} {user.fullName}
                        {user.company ? ` (${user.company})` : ''}
                      </option>
                    ))}
                  </AdminSelect>
                </div>
              </div>
            </div>
          </div>

          <div className="px-6 sm:px-8 py-4 bg-vailo-surface-elevated border-t border-gray-100 flex justify-end gap-3">
            <AdminButton type="button" variant="secondary" onClick={() => navigate(adminPath('/properties'))}>
              Cancel
            </AdminButton>
            <AdminButton type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Property'}
            </AdminButton>
          </div>
        </AdminCard>
      </form>
    </div>
  );
}
