import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { collection, collectionGroup, addDoc, doc, getDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useToast } from '../../context/ToastContext';
import { adminPath } from '../../lib/adminRoutes';
import {
  AdminBackHeader,
  AdminButton,
  AdminCard,
  AdminInput,
  AdminLabel,
  AdminSelect,
  AdminTextarea,
} from '../../components/admin/AdminPageHeader';

const EMPTY_FORM = {
  fullName: '',
  email: '',
  phone: '',
  company: '',
  vatNumber: '',
  billingAddress: '',
  city: '',
  postalCode: '',
  country: '',
  notes: '',
  role: 'owner',
  status: 'active',
  password: '',
};

type OwnerFormData = typeof EMPTY_FORM;

export default function OwnerFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const toast = useToast();

  const [formData, setFormData] = useState<OwnerFormData>(EMPTY_FORM);
  const [managedCount, setManagedCount] = useState(0);
  const [allocatedTypeCount, setAllocatedTypeCount] = useState(0);
  const [loading, setLoading] = useState(isEdit);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!id) return;

    const loadOwner = async () => {
      try {
        const snap = await getDoc(doc(db, 'owners', id));
        if (!snap.exists()) {
          toast.error('Owner not found.');
          navigate(adminPath('/owners'));
          return;
        }
        const data = snap.data();
        setFormData({
          fullName: data.fullName || '',
          email: data.email || '',
          phone: data.phone || '',
          company: data.company || '',
          vatNumber: data.vatNumber || '',
          billingAddress: data.billingAddress || '',
          city: data.city || '',
          postalCode: data.postalCode || '',
          country: data.country || '',
          notes: data.notes || '',
          role: data.role || 'owner',
          status: data.status || 'active',
          password: '',
        });
      } catch (error) {
        console.error('Error loading owner:', error);
        toast.error('Failed to load owner.');
        navigate(adminPath('/owners'));
      } finally {
        setLoading(false);
      }
    };

    loadOwner();
  }, [id, navigate]);

  useEffect(() => {
    if (!id) return;

    const unsubProps = onSnapshot(collection(db, 'properties'), (snapshot) => {
      let count = 0;
      snapshot.docs.forEach((d) => {
        if (d.data().ownerId === id) count += 1;
      });
      setManagedCount(count);
    });

    const unsubTypes = onSnapshot(collectionGroup(db, 'propertyTypes'), (snapshot) => {
      let count = 0;
      snapshot.docs.forEach((d) => {
        if (d.data().ownerId === id) count += 1;
      });
      setAllocatedTypeCount(count);
    });

    return () => {
      unsubProps();
      unsubTypes();
    };
  }, [id]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const { password, ...profile } = formData;
      const payload: Record<string, unknown> = {
        ...profile,
        email: profile.email.trim().toLowerCase(),
        updatedAt: new Date().toISOString(),
      };

      if (isEdit && id) {
        if (password.trim()) payload.password = password.trim();
        await updateDoc(doc(db, 'owners', id), payload);
      } else {
        if (!password.trim()) {
          toast.warning('Please set an initial login password.');
          setIsSubmitting(false);
          return;
        }
        await addDoc(collection(db, 'owners'), {
          ...payload,
          password: password.trim(),
          createdAt: new Date().toISOString(),
        });
      }

      navigate(adminPath('/owners'));
    } catch (error) {
      console.error('Error saving owner:', error);
      toast.error('Failed to save owner.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="admin-page py-16 text-center text-gray-500 text-sm">Loading owner…</div>
    );
  }

  return (
    <div className="admin-page">
      <AdminBackHeader
        backTo={adminPath('/owners')}
        backLabel="Back to Owners CRM"
        title={isEdit ? 'Edit Owner' : 'Add New Owner'}
        description={
          isEdit
            ? `Update contact details for ${formData.fullName || 'this user'}`
            : 'Add a new client or team member to your CRM'
        }
      />

      <form onSubmit={handleSubmit}>
        <AdminCard className="overflow-hidden">
          <div className="p-6 sm:p-8 space-y-8">
            <section>
              <h3 className="admin-section-title border-0 pb-0 mb-4">Contact Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
                <div>
                  <AdminLabel htmlFor="fullName">Full Name *</AdminLabel>
                  <AdminInput id="fullName" required name="fullName" value={formData.fullName} onChange={handleChange} />
                </div>
                <div>
                  <AdminLabel htmlFor="email">Email *</AdminLabel>
                  <AdminInput id="email" type="email" required name="email" value={formData.email} onChange={handleChange} />
                </div>
                <div>
                  <AdminLabel htmlFor="phone">Phone *</AdminLabel>
                  <AdminInput id="phone" type="tel" required name="phone" value={formData.phone} onChange={handleChange} />
                </div>
                <div>
                  <AdminLabel htmlFor="company">Company</AdminLabel>
                  <AdminInput id="company" name="company" value={formData.company} onChange={handleChange} />
                </div>
                <div>
                  <AdminLabel htmlFor="vatNumber">VAT Number</AdminLabel>
                  <AdminInput id="vatNumber" name="vatNumber" value={formData.vatNumber} onChange={handleChange} />
                </div>
                {isEdit && (
                  <>
                    <div>
                      <AdminLabel>Properties managed</AdminLabel>
                      <AdminInput value={String(managedCount)} disabled className="bg-vailo-surface-elevated" />
                      <p className="text-xs text-gray-500 mt-1">Property-level agent/owner assignment</p>
                    </div>
                    <div>
                      <AdminLabel>Listings allocated</AdminLabel>
                      <AdminInput value={String(allocatedTypeCount)} disabled className="bg-vailo-surface-elevated" />
                      <p className="text-xs text-gray-500 mt-1">Property listings where this user is allocated owner</p>
                    </div>
                  </>
                )}
              </div>
            </section>

            <hr className="border-gray-100" />

            <section>
              <h3 className="admin-section-title border-0 pb-0 mb-4">Billing Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
                <div className="md:col-span-2">
                  <AdminLabel htmlFor="billingAddress">Billing Address</AdminLabel>
                  <AdminInput id="billingAddress" name="billingAddress" value={formData.billingAddress} onChange={handleChange} />
                </div>
                <div>
                  <AdminLabel htmlFor="city">City</AdminLabel>
                  <AdminInput id="city" name="city" value={formData.city} onChange={handleChange} />
                </div>
                <div>
                  <AdminLabel htmlFor="postalCode">Postal Code</AdminLabel>
                  <AdminInput id="postalCode" name="postalCode" value={formData.postalCode} onChange={handleChange} />
                </div>
                <div className="md:col-span-2">
                  <AdminLabel htmlFor="country">Country</AdminLabel>
                  <AdminInput id="country" name="country" value={formData.country} onChange={handleChange} />
                </div>
              </div>
            </section>

            <hr className="border-gray-100" />

            <section>
              <h3 className="admin-section-title border-0 pb-0 mb-4">Account Settings</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5 mb-5">
                <div>
                  <AdminLabel htmlFor="role">Role *</AdminLabel>
                  <AdminSelect id="role" name="role" value={formData.role} onChange={handleChange}>
                    <option value="admin">Admin</option>
                    <option value="agent">Agent</option>
                    <option value="owner">Owner</option>
                  </AdminSelect>
                </div>
                <div>
                  <AdminLabel htmlFor="status">Status *</AdminLabel>
                  <AdminSelect id="status" name="status" value={formData.status} onChange={handleChange}>
                    <option value="active">Active</option>
                    <option value="trial">Trial</option>
                    <option value="deactive">Deactive</option>
                  </AdminSelect>
                </div>
                <div>
                  <AdminLabel htmlFor="password">
                    {isEdit ? 'New password' : 'Login Password *'}
                  </AdminLabel>
                  <AdminInput
                    id="password"
                    type="password"
                    name="password"
                    required={!isEdit}
                    value={formData.password}
                    onChange={handleChange}
                    placeholder={isEdit ? 'Leave blank to keep current' : '••••••••'}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {isEdit ? 'Only fill in to change the password' : 'Temporary password for initial login'}
                  </p>
                </div>
              </div>
              <div>
                <AdminLabel htmlFor="notes">Notes</AdminLabel>
                <AdminTextarea
                  id="notes"
                  name="notes"
                  value={formData.notes}
                  onChange={handleChange}
                  rows={3}
                  placeholder="Internal notes about this user…"
                />
              </div>
            </section>
          </div>

          <div className="px-6 sm:px-8 py-4 bg-vailo-surface-elevated border-t border-gray-100 flex items-center justify-end gap-3">
            <AdminButton type="button" variant="secondary" onClick={() => navigate(adminPath('/owners'))}>
              Cancel
            </AdminButton>
            <AdminButton type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Owner'}
            </AdminButton>
          </div>
        </AdminCard>
      </form>
    </div>
  );
}
