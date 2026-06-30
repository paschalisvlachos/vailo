import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { addDoc, collection, doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useToast } from '../../context/ToastContext';
import { adminPath } from '../../lib/adminRoutes';
import {
  EMPTY_EXPENSE_FORM,
  PLATFORM_EXPENSES_COLLECTION,
  expenseFormToPayload,
  expenseToFormData,
  formatExpenseSaveError,
  parsePlatformExpense,
  sanitizeFirestorePayload,
  validateExpenseForm,
  type PlatformExpenseFormData,
} from '../../lib/platformExpenses';
import {
  AdminBackHeader,
  AdminButton,
  AdminCard,
  AdminInput,
  AdminLabel,
  AdminSelect,
  AdminTextarea,
} from '../../components/admin/AdminPageHeader';

const CURRENCY_OPTIONS = ['EUR', 'USD', 'GBP'];

export default function ExpenseFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const toast = useToast();

  const [formData, setFormData] = useState<PlatformExpenseFormData>(EMPTY_EXPENSE_FORM);
  const [loading, setLoading] = useState(isEdit);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!id) return;

    const loadExpense = async () => {
      try {
        const snap = await getDoc(doc(db, PLATFORM_EXPENSES_COLLECTION, id));
        if (!snap.exists()) {
          toast.error('Expense not found.');
          navigate(adminPath('/expenses'));
          return;
        }
        const expense = parsePlatformExpense(snap.id, snap.data() as Record<string, unknown>);
        setFormData(expenseToFormData(expense));
      } catch (error) {
        console.error('Error loading expense:', error);
        toast.error('Failed to load expense.');
        navigate(adminPath('/expenses'));
      } finally {
        setLoading(false);
      }
    };

    void loadExpense();
  }, [id, navigate, toast]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => {
      const next = { ...prev, [name]: value };
      if (name === 'termKind' && value === 'lifetime') {
        next.renewalDate = '';
        next.durationLabel = '';
      }
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validateExpenseForm(formData);
    if (validationError) {
      toast.warning(validationError);
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = sanitizeFirestorePayload({
        ...expenseFormToPayload(formData),
        updatedAt: new Date().toISOString(),
      });

      if (isEdit && id) {
        await updateDoc(doc(db, PLATFORM_EXPENSES_COLLECTION, id), payload);
        toast.success('Expense updated.');
      } else {
        await addDoc(
          collection(db, PLATFORM_EXPENSES_COLLECTION),
          sanitizeFirestorePayload({
            ...payload,
            createdAt: new Date().toISOString(),
          })
        );
        toast.success('Expense added.');
      }
      navigate(adminPath('/expenses'));
    } catch (error) {
      console.error('Error saving expense:', error);
      toast.error(formatExpenseSaveError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const showDurationFields = formData.termKind === 'duration';

  if (loading) {
    return (
      <div className="admin-page py-16 text-center text-gray-500 text-sm">Loading expense…</div>
    );
  }

  return (
    <div className="admin-page">
      <AdminBackHeader
        backTo={adminPath('/expenses')}
        backLabel="Back to Expenses"
        title={isEdit ? 'Edit expense' : 'Add expense'}
        description="Track vendor subscriptions and recurring platform costs"
      />

      <form onSubmit={handleSubmit}>
        <AdminCard className="overflow-hidden">
          <div className="p-6 sm:p-8 space-y-8">
            <section>
              <h3 className="admin-section-title border-0 pb-0 mb-4">Business</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
                <div className="md:col-span-2">
                  <AdminLabel htmlFor="businessName">
                    Business name <span className="text-red-500">*</span>
                  </AdminLabel>
                  <AdminInput
                    id="businessName"
                    name="businessName"
                    value={formData.businessName}
                    onChange={handleChange}
                    required
                    placeholder="e.g. Firebase, Resend, Figma"
                  />
                </div>
                <div>
                  <AdminLabel htmlFor="url">Website URL</AdminLabel>
                  <AdminInput
                    id="url"
                    name="url"
                    type="text"
                    value={formData.url}
                    onChange={handleChange}
                    placeholder="https://example.com"
                  />
                </div>
                <div>
                  <AdminLabel htmlFor="email">Email</AdminLabel>
                  <AdminInput
                    id="email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="billing@example.com"
                  />
                </div>
                <div className="md:col-span-2">
                  <AdminLabel htmlFor="fullAddress">Full address</AdminLabel>
                  <AdminTextarea
                    id="fullAddress"
                    name="fullAddress"
                    value={formData.fullAddress}
                    onChange={handleChange}
                    rows={2}
                    placeholder="Street, city, postal code, country"
                  />
                </div>
              </div>
            </section>

            <section>
              <h3 className="admin-section-title border-0 pb-0 mb-4">Telephone</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
                <div>
                  <AdminLabel htmlFor="telephoneName">Telephone name</AdminLabel>
                  <AdminInput
                    id="telephoneName"
                    name="telephoneName"
                    value={formData.telephoneName}
                    onChange={handleChange}
                    placeholder="e.g. Billing, Support"
                  />
                </div>
                <div>
                  <AdminLabel htmlFor="telephoneNumber">Telephone number</AdminLabel>
                  <AdminInput
                    id="telephoneNumber"
                    name="telephoneNumber"
                    type="tel"
                    value={formData.telephoneNumber}
                    onChange={handleChange}
                    placeholder="+30 210 000 0000"
                  />
                </div>
                <div>
                  <AdminLabel htmlFor="altTelephoneName">Alt telephone name</AdminLabel>
                  <AdminInput
                    id="altTelephoneName"
                    name="altTelephoneName"
                    value={formData.altTelephoneName}
                    onChange={handleChange}
                    placeholder="e.g. Sales, Emergency"
                  />
                </div>
                <div>
                  <AdminLabel htmlFor="altTelephoneNumber">Alt telephone number</AdminLabel>
                  <AdminInput
                    id="altTelephoneNumber"
                    name="altTelephoneNumber"
                    type="tel"
                    value={formData.altTelephoneNumber}
                    onChange={handleChange}
                    placeholder="+30 210 000 0000"
                  />
                </div>
                <div className="md:col-span-2">
                  <AdminLabel htmlFor="comments">Comments</AdminLabel>
                  <AdminTextarea
                    id="comments"
                    name="comments"
                    value={formData.comments}
                    onChange={handleChange}
                    rows={3}
                    placeholder="Plan tier, login notes, invoice reference…"
                  />
                </div>
              </div>
            </section>

            <section>
              <h3 className="admin-section-title border-0 pb-0 mb-4">Cost & dates</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
                <div>
                  <AdminLabel htmlFor="amount">
                    Amount <span className="text-red-500">*</span>
                  </AdminLabel>
                  <AdminInput
                    id="amount"
                    name="amount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.amount}
                    onChange={handleChange}
                    required
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <AdminLabel htmlFor="currency">Currency</AdminLabel>
                  <AdminSelect
                    id="currency"
                    name="currency"
                    value={formData.currency}
                    onChange={handleChange}
                  >
                    {CURRENCY_OPTIONS.map((code) => (
                      <option key={code} value={code}>
                        {code}
                      </option>
                    ))}
                  </AdminSelect>
                </div>
                <div>
                  <AdminLabel htmlFor="startDate">
                    Start date <span className="text-red-500">*</span>
                  </AdminLabel>
                  <AdminInput
                    id="startDate"
                    name="startDate"
                    type="date"
                    value={formData.startDate}
                    onChange={handleChange}
                    required
                  />
                </div>
                <div>
                  <AdminLabel htmlFor="termKind">
                    Lifetime or duration <span className="text-red-500">*</span>
                  </AdminLabel>
                  <AdminSelect
                    id="termKind"
                    name="termKind"
                    value={formData.termKind}
                    onChange={handleChange}
                    required
                  >
                    <option value="">Select…</option>
                    <option value="lifetime">Lifetime</option>
                    <option value="duration">Duration (recurring)</option>
                  </AdminSelect>
                </div>
                {showDurationFields && (
                  <>
                    <div>
                      <AdminLabel htmlFor="durationLabel">
                        Duration <span className="text-red-500">*</span>
                      </AdminLabel>
                      <AdminInput
                        id="durationLabel"
                        name="durationLabel"
                        value={formData.durationLabel}
                        onChange={handleChange}
                        required={showDurationFields}
                        placeholder="e.g. Monthly, Annual, 2 years"
                      />
                    </div>
                    <div>
                      <AdminLabel htmlFor="renewalDate">
                        Renewal date <span className="text-red-500">*</span>
                      </AdminLabel>
                      <AdminInput
                        id="renewalDate"
                        name="renewalDate"
                        type="date"
                        value={formData.renewalDate}
                        onChange={handleChange}
                        required={showDurationFields}
                      />
                    </div>
                  </>
                )}
              </div>
            </section>
          </div>

          <div className="px-6 sm:px-8 py-4 bg-vailo-surface-elevated/40 border-t border-gray-100 flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
            <AdminButton
              type="button"
              variant="secondary"
              onClick={() => navigate(adminPath('/expenses'))}
              disabled={isSubmitting}
            >
              Cancel
            </AdminButton>
            <AdminButton type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : isEdit ? 'Save changes' : 'Add expense'}
            </AdminButton>
          </div>
        </AdminCard>
      </form>
    </div>
  );
}
