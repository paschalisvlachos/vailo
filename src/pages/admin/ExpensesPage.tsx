import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, deleteDoc, doc, onSnapshot } from 'firebase/firestore';
import { Receipt, Plus, Pencil, Trash2 } from 'lucide-react';
import { db } from '../../lib/firebase';
import { useToast } from '../../context/ToastContext';
import { adminPath } from '../../lib/adminRoutes';
import {
  PLATFORM_EXPENSES_COLLECTION,
  formatExpenseAmount,
  formatExpenseTelephoneLines,
  formatExpenseDate,
  formatExpenseTerm,
  parsePlatformExpense,
  renewalDaysUntil,
  type PlatformExpense,
} from '../../lib/platformExpenses';
import AdminPageHeader, {
  AdminButtonLink,
  AdminCard,
  AdminEmptyState,
} from '../../components/admin/AdminPageHeader';

function RenewalBadge({ expense }: { expense: PlatformExpense }) {
  if (expense.termKind === 'lifetime') {
    return <span className="text-xs text-gray-500">Lifetime</span>;
  }
  const days = renewalDaysUntil(expense.renewalDate);
  if (days === null) return null;
  if (days < 0) {
    return (
      <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-red-50 text-red-700 border border-red-100">
        Overdue
      </span>
    );
  }
  if (days <= 30) {
    return (
      <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-50 text-amber-800 border border-amber-100">
        {days === 0 ? 'Due today' : `${days}d left`}
      </span>
    );
  }
  return null;
}

export default function ExpensesPage() {
  const toast = useToast();
  const [expenses, setExpenses] = useState<PlatformExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, PLATFORM_EXPENSES_COLLECTION),
      (snapshot) => {
        setExpenses(
          snapshot.docs.map((d) => parsePlatformExpense(d.id, d.data() as Record<string, unknown>))
        );
        setLoading(false);
      },
      () => {
        toast.error('Failed to load expenses.');
        setLoading(false);
      }
    );
    return () => unsub();
  }, [toast]);

  const sortedExpenses = useMemo(() => {
    return [...expenses].sort((a, b) => {
      const aRenew = a.termKind === 'duration' && a.renewalDate ? a.renewalDate : '9999-12-31';
      const bRenew = b.termKind === 'duration' && b.renewalDate ? b.renewalDate : '9999-12-31';
      if (aRenew !== bRenew) return aRenew.localeCompare(bRenew);
      return a.businessName.localeCompare(b.businessName);
    });
  }, [expenses]);

  const monthlyTotal = useMemo(
    () => sortedExpenses.reduce((sum, e) => sum + (e.amount || 0), 0),
    [sortedExpenses]
  );

  const handleDelete = async (expense: PlatformExpense) => {
    if (
      !window.confirm(`Delete expense for "${expense.businessName}"? This cannot be undone.`)
    ) {
      return;
    }
    setDeletingId(expense.id);
    try {
      await deleteDoc(doc(db, PLATFORM_EXPENSES_COLLECTION, expense.id));
      toast.success('Expense deleted.');
    } catch (error) {
      console.error('Error deleting expense:', error);
      toast.error('Failed to delete expense.');
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return <div className="py-16 text-center text-gray-500 text-sm">Loading expenses…</div>;
  }

  return (
    <div className="admin-page">
      <AdminPageHeader
        title="Expenses"
        description="Track subscriptions, vendors, and recurring platform costs"
        icon={<Receipt size={26} />}
        action={
          <AdminButtonLink to={adminPath('/expenses/add')} className="w-full sm:w-auto">
            <Plus size={18} /> Add expense
          </AdminButtonLink>
        }
      />

      {sortedExpenses.length > 0 && (
        <AdminCard className="p-4 sm:p-5 mb-6">
          <p className="text-sm text-gray-500">Recorded per-entry amounts (not normalized to monthly)</p>
          <p className="text-2xl font-bold text-vailo-dark tabular-nums mt-1">
            {formatExpenseAmount(monthlyTotal)}
            <span className="text-sm font-normal text-gray-500 ml-2">total across {sortedExpenses.length} entries</span>
          </p>
        </AdminCard>
      )}

      {sortedExpenses.length === 0 ? (
        <AdminEmptyState
          icon={<Receipt size={32} />}
          title="No expenses yet"
          description="Add SaaS subscriptions, hosting, and other recurring costs to track renewals."
          action={
            <AdminButtonLink to={adminPath('/expenses/add')}>
              <Plus size={18} /> Add expense
            </AdminButtonLink>
          }
        />
      ) : (
        <>
          <div className="grid gap-3 lg:hidden">
            {sortedExpenses.map((expense) => (
              <AdminCard key={expense.id} className="p-4">
                <div className="flex justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-vailo-dark truncate">{expense.businessName}</p>
                    <p className="text-sm font-semibold text-vailo-teal tabular-nums mt-1">
                      {formatExpenseAmount(expense.amount, expense.currency)}
                    </p>
                    <div className="mt-2 text-xs text-gray-600 space-y-1">
                      <p>
                        Start {formatExpenseDate(expense.startDate)}
                        {expense.termKind === 'duration' && expense.renewalDate && (
                          <> · Renews {formatExpenseDate(expense.renewalDate)}</>
                        )}
                      </p>
                      <p>{formatExpenseTerm(expense)}</p>
                      {formatExpenseTelephoneLines(expense).map((line) => (
                        <p key={line} className="truncate">
                          {line}
                        </p>
                      ))}
                    </div>
                    <div className="mt-2">
                      <RenewalBadge expense={expense} />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <Link
                      to={adminPath(`/expenses/${expense.id}/edit`)}
                      className="p-2 text-gray-400 hover:text-vailo-teal rounded-lg"
                      title="Edit expense"
                    >
                      <Pencil size={17} />
                    </Link>
                    <button
                      type="button"
                      onClick={() => void handleDelete(expense)}
                      disabled={deletingId === expense.id}
                      className="p-2 text-gray-400 hover:text-red-600 rounded-lg disabled:opacity-50"
                      title="Delete expense"
                    >
                      <Trash2 size={17} />
                    </button>
                  </div>
                </div>
              </AdminCard>
            ))}
          </div>

          <AdminCard className="hidden lg:block overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100">
                <thead className="bg-vailo-surface-elevated/60">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wide">
                      Business
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wide">
                      Amount
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wide">
                      Start
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wide">
                      Renewal
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wide">
                      Term
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wide">
                      Contact
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wide">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {sortedExpenses.map((expense) => (
                    <tr key={expense.id} className="hover:bg-vailo-surface-elevated/30">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-vailo-dark">{expense.businessName}</div>
                        {expense.comments && (
                          <p className="text-xs text-gray-500 mt-1 max-w-xs truncate" title={expense.comments}>
                            {expense.comments}
                          </p>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm font-semibold text-vailo-teal tabular-nums whitespace-nowrap">
                        {formatExpenseAmount(expense.amount, expense.currency)}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700 whitespace-nowrap">
                        {formatExpenseDate(expense.startDate)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-700">
                          {expense.termKind === 'lifetime'
                            ? '—'
                            : formatExpenseDate(expense.renewalDate)}
                        </div>
                        <RenewalBadge expense={expense} />
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700 whitespace-nowrap">
                        {formatExpenseTerm(expense)}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        <div className="space-y-1 max-w-[220px]">
                          {formatExpenseTelephoneLines(expense).map((line) => (
                            <div key={line} className="truncate" title={line}>
                              {line}
                            </div>
                          ))}
                          {formatExpenseTelephoneLines(expense).length === 0 && (
                            <span className="text-gray-300">—</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <Link
                            to={adminPath(`/expenses/${expense.id}/edit`)}
                            className="p-2 text-gray-400 hover:text-vailo-teal rounded-lg"
                            title="Edit expense"
                          >
                            <Pencil size={17} />
                          </Link>
                          <button
                            type="button"
                            onClick={() => void handleDelete(expense)}
                            disabled={deletingId === expense.id}
                            className="p-2 text-gray-400 hover:text-red-600 rounded-lg disabled:opacity-50"
                            title="Delete expense"
                          >
                            <Trash2 size={17} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </AdminCard>
        </>
      )}
    </div>
  );
}
