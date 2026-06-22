import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { collection, collectionGroup, addDoc, doc, getDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useToast } from '../../context/ToastContext';
import { adminPath } from '../../lib/adminRoutes';
import { normalizeOwnerRole } from '../../lib/adminAccess';
import { canAgentManageOwnerRecord } from '../../lib/agentOwners';
import { provisionOwnerAuth } from '../../lib/provisionOwnerAuth';
import { useAdminSession } from '../../context/AdminSessionContext';
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
  const { profile: sessionProfile, isPlatformAdmin, isAgent } = useAdminSession();
  const agentMode = isAgent && !isPlatformAdmin;

  const [formData, setFormData] = useState<OwnerFormData>(EMPTY_FORM);
  const [managedCount, setManagedCount] = useState(0);
  const [allocatedTypeCount, setAllocatedTypeCount] = useState(0);
  const [loading, setLoading] = useState(isEdit);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [originalEmail, setOriginalEmail] = useState('');

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
        if (agentMode && !canAgentManageOwnerRecord(sessionProfile!.id, data)) {
          toast.error('You can only edit owners you created.');
          navigate(adminPath('/owners'));
          return;
        }
        const email = data.email || '';
        setOriginalEmail(email);
        setFormData({
          fullName: data.fullName || '',
          email,
          phone: data.phone || '',
          company: data.company || '',
          vatNumber: data.vatNumber || '',
          billingAddress: data.billingAddress || '',
          city: data.city || '',
          postalCode: data.postalCode || '',
          country: data.country || '',
          notes: data.notes || '',
          role: normalizeOwnerRole(data.role),
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
      const { password, ...formFields } = formData;
      const normalizedEmail = formFields.email.trim().toLowerCase();
      const trimmedPassword = password.trim();
      const payload: Record<string, unknown> = {
        ...formFields,
        role: agentMode ? 'owner' : normalizeOwnerRole(formFields.role),
        email: normalizedEmail,
        updatedAt: new Date().toISOString(),
      };

      if (agentMode) {
        payload.agentId = sessionProfile!.id;
      }

      let ownerId = id;

      if (isEdit && id) {
        if (trimmedPassword) payload.password = trimmedPassword;
        await updateDoc(doc(db, 'owners', id), payload);
      } else {
        if (!trimmedPassword) {
          toast.warning('Please set an initial login password.');
          setIsSubmitting(false);
          return;
        }
        const createPayload: Record<string, unknown> = {
          ...payload,
          password: trimmedPassword,
          createdAt: new Date().toISOString(),
        };
        if (agentMode) {
          createPayload.agentId = sessionProfile!.id;
        }
        const ref = await addDoc(collection(db, 'owners'), createPayload);
        ownerId = ref.id;
      }

      if (!ownerId) {
        throw new Error('Missing owner id.');
      }

      const authResult = await provisionOwnerAuth({
        ownerId,
        email: normalizedEmail,
        status: formFields.status,
        ...(trimmedPassword ? { password: trimmedPassword } : {}),
        ...(isEdit && originalEmail && originalEmail !== normalizedEmail
          ? { previousEmail: originalEmail.trim().toLowerCase() }
          : {}),
      });

      toast.success(
        authResult.created
          ? 'Owner saved and Vailo Admin login created.'
          : 'Owner saved and Vailo Admin login updated.'
      );
      navigate(adminPath('/owners'));
    } catch (error) {
      console.error('Error saving owner:', error);
      const message =
        error instanceof Error ? error.message : 'Failed to save owner or set up login.';
      toast.error(message);
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
        backLabel={agentMode ? 'Back to my owners' : 'Back to Owners CRM'}
        title={isEdit ? (agentMode ? 'Edit owner' : 'Edit user') : agentMode ? 'Add owner' : 'Add New User'}
        description={
          isEdit
            ? `Update contact details for ${formData.fullName || 'this user'}`
            : agentMode
              ? 'Add a property owner you can allocate to listings on your properties'
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
                {isPlatformAdmin ? (
                  <div>
                    <AdminLabel htmlFor="role">Role *</AdminLabel>
                    <AdminSelect id="role" name="role" value={formData.role} onChange={handleChange}>
                      <option value="admin">Admin</option>
                      <option value="agent">Agent</option>
                      <option value="owner">Owner</option>
                      <option value="excursion_provider">Excursion provider</option>
                    </AdminSelect>
                  </div>
                ) : (
                  <div>
                    <AdminLabel>Role</AdminLabel>
                    <AdminInput value="Owner" disabled className="bg-vailo-surface-elevated" />
                  </div>
                )}
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
                    {isEdit
                      ? 'Only fill in to change the Vailo Admin login password'
                      : 'Creates their Vailo Admin login at vailo.app/admin (not Firebase Console access)'}
                    {formData.role === 'excursion_provider' &&
                      ' — then allocate this user on the business under Excursions → Edit provider → Allocated excursion provider.'}
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
              {isSubmitting ? 'Saving…' : isEdit ? 'Save Changes' : agentMode ? 'Create owner' : 'Create user'}
            </AdminButton>
          </div>
        </AdminCard>
      </form>
    </div>
  );
}
