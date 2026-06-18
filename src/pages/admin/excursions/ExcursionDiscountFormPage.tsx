import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { useToast } from '../../../context/ToastContext';
import { adminPath } from '../../../lib/adminRoutes';
import { EXCURSION_PROVIDER_COLLECTION, EXCURSION_SUBCOLLECTION } from '../../../lib/excursionProvider';
import {
  adminExcursionDiscountsPath,
  discountFormFromDoc,
  discountFromDoc,
  discountPayloadFromForm,
  discountValidationSummary,
  EMPTY_DISCOUNT_FORM,
  EXCURSION_DISCOUNTS_SUBCOLLECTION,
  formatPromoCode,
  portalExcursionDiscountsPath,
  sanitizeDiscountPayload,
  validateDiscountForm,
  type ExcursionDiscount,
  type ExcursionDiscountFormData,
} from '../../../lib/excursionDiscount';
import {
  AdminAlert,
  AdminBackHeader,
  AdminButton,
  AdminCard,
  AdminInput,
  AdminLabel,
  AdminSelect,
  AdminTextarea,
} from '../../../components/admin/AdminPageHeader';

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-red-600 mt-1">{message}</p>;
}

function fieldErrorClass(hasError: boolean) {
  return hasError ? 'border-red-300 ring-1 ring-red-100 focus:border-red-400' : '';
}

export default function ExcursionDiscountFormPage() {
  const { providerId, excursionId, discountId } = useParams<{
    providerId: string;
    excursionId: string;
    discountId?: string;
  }>();
  const location = useLocation();
  const portalMode = location.pathname.includes('/excursion-portal/');
  const isEdit = Boolean(discountId);
  const navigate = useNavigate();
  const toast = useToast();

  const [formData, setFormData] = useState<ExcursionDiscountFormData>(EMPTY_DISCOUNT_FORM);
  const [existingDiscounts, setExistingDiscounts] = useState<ExcursionDiscount[]>([]);
  const [excursionTitle, setExcursionTitle] = useState('');
  const [excursionCurrency, setExcursionCurrency] = useState('EUR');
  const [loading, setLoading] = useState(isEdit);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const listPath =
    providerId && excursionId
      ? adminPath(
          portalMode
            ? portalExcursionDiscountsPath(providerId, excursionId)
            : adminExcursionDiscountsPath(providerId, excursionId)
        )
      : adminPath('/excursions/providers');

  useEffect(() => {
    if (!providerId || !excursionId) return;

    getDoc(
      doc(db, EXCURSION_PROVIDER_COLLECTION, providerId, EXCURSION_SUBCOLLECTION, excursionId)
    ).then((snap) => {
      if (!snap.exists()) {
        toast.error('Excursion not found.');
        navigate(listPath);
        return;
      }
      setExcursionTitle(String(snap.data().title || ''));
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
        setExistingDiscounts(snapshot.docs.map((d) => discountFromDoc(d.id, d.data())));
      }
    );

    return () => unsub();
  }, [providerId, excursionId, listPath, navigate, toast]);

  useEffect(() => {
    if (!isEdit || !providerId || !excursionId || !discountId) return;

    getDoc(
      doc(
        db,
        EXCURSION_PROVIDER_COLLECTION,
        providerId,
        EXCURSION_SUBCOLLECTION,
        excursionId,
        EXCURSION_DISCOUNTS_SUBCOLLECTION,
        discountId
      )
    )
      .then((snap) => {
        if (!snap.exists()) {
          toast.error('Discount not found.');
          navigate(listPath);
          return;
        }
        setFormData(discountFormFromDoc(snap.data()));
      })
      .catch(() => {
        toast.error('Failed to load discount.');
        navigate(listPath);
      })
      .finally(() => setLoading(false));
  }, [isEdit, providerId, excursionId, discountId, listPath, navigate, toast]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = e.target;
    const checked = type === 'checkbox' ? (e.target as HTMLInputElement).checked : undefined;
    if (fieldErrors[name]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
    if (name === 'code') {
      setFormData((prev) => ({ ...prev, code: formatPromoCode(value) }));
      return;
    }
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!providerId || !excursionId) return;

    const existing = isEdit
      ? existingDiscounts.find((d) => d.id === discountId) || null
      : null;

    const errors = validateDiscountForm(formData, existingDiscounts, discountId);
    if (errors.length > 0) {
      const map: Record<string, string> = {};
      errors.forEach((err) => {
        map[err.field] = err.message;
      });
      setFieldErrors(map);
      toast.error(discountValidationSummary(errors));
      return;
    }

    setFieldErrors({});
    setIsSubmitting(true);
    try {
      const payload = sanitizeDiscountPayload({
        ...discountPayloadFromForm(formData, providerId, excursionId, existing),
        updatedAt: new Date().toISOString(),
      });

      if (isEdit && discountId) {
        await updateDoc(
          doc(
            db,
            EXCURSION_PROVIDER_COLLECTION,
            providerId,
            EXCURSION_SUBCOLLECTION,
            excursionId,
            EXCURSION_DISCOUNTS_SUBCOLLECTION,
            discountId
          ),
          payload
        );
        toast.success('Discount updated.');
      } else {
        await addDoc(
          collection(
            db,
            EXCURSION_PROVIDER_COLLECTION,
            providerId,
            EXCURSION_SUBCOLLECTION,
            excursionId,
            EXCURSION_DISCOUNTS_SUBCOLLECTION
          ),
          { ...payload, createdAt: new Date().toISOString() }
        );
        toast.success('Discount created.');
      }

      navigate(listPath);
    } catch (error) {
      console.error(error);
      toast.error('Failed to save discount.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!providerId || !excursionId) {
    navigate(adminPath('/excursions/providers'));
    return null;
  }

  if (loading) {
    return <div className="py-16 text-center text-gray-500 text-sm">Loading discount…</div>;
  }

  return (
    <div className="admin-page">
      <AdminBackHeader
        backTo={listPath}
        backLabel="Back to discounts"
        title={isEdit ? 'Edit discount' : 'Add discount'}
        description={excursionTitle ? `${excursionTitle}` : undefined}
      />

      {Object.keys(fieldErrors).length > 0 && (
        <AdminAlert variant="warning" title="Please fix the following" className="mb-6">
          <ul className="list-disc list-inside space-y-1">
            {[...new Set(Object.values(fieldErrors))].map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </AdminAlert>
      )}

      <form onSubmit={handleSubmit}>
        <AdminCard className="overflow-hidden mb-6">
          <div className="p-6 sm:p-8 space-y-8">
            <section>
              <h3 className="admin-section-title border-0 pb-0 mb-4">Discount details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
                <div className="md:col-span-2">
                  <AdminLabel htmlFor="name">Name *</AdminLabel>
                  <AdminInput
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    className={fieldErrorClass(Boolean(fieldErrors.name))}
                    placeholder="Large group discount"
                  />
                  <FieldError message={fieldErrors.name} />
                </div>
                <div>
                  <AdminLabel htmlFor="type">Type *</AdminLabel>
                  <AdminSelect
                    id="type"
                    name="type"
                    value={formData.type}
                    onChange={handleChange}
                    disabled={isEdit}
                  >
                    <option value="group_size">Group size</option>
                    <option value="promo_code">Promo code</option>
                  </AdminSelect>
                  {isEdit && (
                    <p className="text-xs text-gray-500 mt-1">Type cannot be changed after creation.</p>
                  )}
                </div>
                <div>
                  <AdminLabel htmlFor="status">Status</AdminLabel>
                  <AdminSelect
                    id="status"
                    name="status"
                    value={formData.status}
                    onChange={handleChange}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </AdminSelect>
                </div>
              </div>
            </section>

            <hr className="border-gray-100" />

            <section>
              <h3 className="admin-section-title border-0 pb-0 mb-4">Discount value</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
                <div>
                  <AdminLabel htmlFor="valueType">Value type</AdminLabel>
                  <AdminSelect
                    id="valueType"
                    name="valueType"
                    value={formData.valueType}
                    onChange={handleChange}
                  >
                    <option value="percent">Percent off</option>
                    <option value="fixed">Fixed amount off ({excursionCurrency})</option>
                  </AdminSelect>
                </div>
                <div>
                  <AdminLabel htmlFor="value">
                    {formData.valueType === 'percent' ? 'Percent off *' : `Amount off (${excursionCurrency}) *`}
                  </AdminLabel>
                  <AdminInput
                    id="value"
                    name="value"
                    type="number"
                    min={0}
                    max={formData.valueType === 'percent' ? 100 : undefined}
                    step={formData.valueType === 'percent' ? 1 : 0.01}
                    value={formData.value}
                    onChange={handleChange}
                    className={fieldErrorClass(Boolean(fieldErrors.value))}
                  />
                  <FieldError message={fieldErrors.value} />
                </div>
              </div>
            </section>

            <hr className="border-gray-100" />

            {formData.type === 'group_size' ? (
              <section>
                <h3 className="admin-section-title border-0 pb-0 mb-4">Group size rules</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
                  <div>
                    <AdminLabel htmlFor="minParticipants">Minimum guests *</AdminLabel>
                    <AdminInput
                      id="minParticipants"
                      name="minParticipants"
                      type="number"
                      min={2}
                      value={formData.minParticipants}
                      onChange={handleChange}
                      className={fieldErrorClass(Boolean(fieldErrors.minParticipants))}
                      placeholder="10"
                    />
                    <FieldError message={fieldErrors.minParticipants} />
                    <p className="text-xs text-gray-500 mt-1">
                      Discount applies when total guests reach this number.
                    </p>
                  </div>
                  <div>
                    <AdminLabel htmlFor="maxParticipants">Maximum guests</AdminLabel>
                    <AdminInput
                      id="maxParticipants"
                      name="maxParticipants"
                      type="number"
                      min={2}
                      value={formData.maxParticipants}
                      onChange={handleChange}
                      className={fieldErrorClass(Boolean(fieldErrors.maxParticipants))}
                      placeholder="Optional upper limit"
                    />
                    <FieldError message={fieldErrors.maxParticipants} />
                  </div>
                </div>
              </section>
            ) : (
              <section>
                <h3 className="admin-section-title border-0 pb-0 mb-4">Promo code rules</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
                  <div>
                    <AdminLabel htmlFor="code">Promo code *</AdminLabel>
                    <AdminInput
                      id="code"
                      name="code"
                      value={formData.code}
                      onChange={handleChange}
                      className={fieldErrorClass(Boolean(fieldErrors.code))}
                      placeholder="SUMMER10"
                    />
                    <FieldError message={fieldErrors.code} />
                  </div>
                  <div>
                    <AdminLabel htmlFor="maxUses">Max uses</AdminLabel>
                    <AdminInput
                      id="maxUses"
                      name="maxUses"
                      type="number"
                      min={1}
                      value={formData.maxUses}
                      onChange={handleChange}
                      className={fieldErrorClass(Boolean(fieldErrors.maxUses))}
                      placeholder="Unlimited if empty"
                    />
                    <FieldError message={fieldErrors.maxUses} />
                  </div>
                </div>
              </section>
            )}

            <hr className="border-gray-100" />

            <section>
              <h3 className="admin-section-title border-0 pb-0 mb-4">Validity &amp; scope</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
                <div>
                  <AdminLabel htmlFor="validFrom">Valid from</AdminLabel>
                  <AdminInput
                    id="validFrom"
                    name="validFrom"
                    type="date"
                    value={formData.validFrom}
                    onChange={handleChange}
                  />
                </div>
                <div>
                  <AdminLabel htmlFor="validTo">Valid to</AdminLabel>
                  <AdminInput
                    id="validTo"
                    name="validTo"
                    type="date"
                    value={formData.validTo}
                    onChange={handleChange}
                    className={fieldErrorClass(Boolean(fieldErrors.validTo))}
                  />
                  <FieldError message={fieldErrors.validTo} />
                </div>
                <div className="md:col-span-2">
                  <AdminLabel>Applies to participant types</AdminLabel>
                  <div className="flex flex-wrap gap-4 mt-2">
                    {(
                      [
                        ['appliesToAdult', 'Adult'],
                        ['appliesToChild', 'Child'],
                        ['appliesToInfant', 'Infant'],
                        ['appliesToSenior', 'Senior'],
                      ] as const
                    ).map(([name, label]) => (
                      <label
                        key={name}
                        className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          name={name}
                          checked={formData[name]}
                          onChange={handleChange}
                          className="rounded border-gray-300 text-vailo-teal focus:ring-vailo-teal"
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                  <FieldError message={fieldErrors.appliesToAdult} />
                </div>
                <div className="md:col-span-2">
                  <AdminLabel htmlFor="notes">Internal notes</AdminLabel>
                  <AdminTextarea
                    id="notes"
                    name="notes"
                    rows={2}
                    value={formData.notes}
                    onChange={handleChange}
                    placeholder="Optional notes for your team"
                  />
                </div>
              </div>
            </section>
          </div>

          <div className="px-6 sm:px-8 py-4 bg-vailo-surface-elevated border-t border-gray-100 flex items-center justify-end gap-3">
            <AdminButton type="button" variant="secondary" onClick={() => navigate(listPath)}>
              Cancel
            </AdminButton>
            <AdminButton type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : isEdit ? 'Save changes' : 'Create discount'}
            </AdminButton>
          </div>
        </AdminCard>
      </form>
    </div>
  );
}
