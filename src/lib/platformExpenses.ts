export const PLATFORM_EXPENSES_COLLECTION = 'platformExpenses';

export type PlatformExpenseTermKind = 'lifetime' | 'duration';

export type PlatformExpense = {
  id: string;
  businessName: string;
  url?: string;
  email?: string;
  fullAddress?: string;
  telephoneName?: string;
  telephoneNumber?: string;
  altTelephoneName?: string;
  altTelephoneNumber?: string;
  comments?: string;
  amount: number;
  currency: string;
  startDate: string;
  renewalDate?: string;
  termKind: PlatformExpenseTermKind;
  /** e.g. Monthly, 1 year — required when termKind is duration */
  durationLabel?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type PlatformExpenseFormData = {
  businessName: string;
  url: string;
  email: string;
  fullAddress: string;
  telephoneName: string;
  telephoneNumber: string;
  altTelephoneName: string;
  altTelephoneNumber: string;
  comments: string;
  amount: string;
  currency: string;
  startDate: string;
  renewalDate: string;
  termKind: PlatformExpenseTermKind | '';
  durationLabel: string;
};

export const EMPTY_EXPENSE_FORM: PlatformExpenseFormData = {
  businessName: '',
  url: '',
  email: '',
  fullAddress: '',
  telephoneName: '',
  telephoneNumber: '',
  altTelephoneName: '',
  altTelephoneNumber: '',
  comments: '',
  amount: '',
  currency: 'EUR',
  startDate: '',
  renewalDate: '',
  termKind: '',
  durationLabel: '',
};

export function parsePlatformExpense(id: string, data: Record<string, unknown>): PlatformExpense {
  return {
    id,
    businessName: String(data.businessName || '').trim(),
    url: data.url ? String(data.url).trim() : undefined,
    email: data.email ? String(data.email).trim() : undefined,
    fullAddress: data.fullAddress ? String(data.fullAddress).trim() : undefined,
    telephoneName: data.telephoneName ? String(data.telephoneName).trim() : undefined,
    telephoneNumber: data.telephoneNumber ? String(data.telephoneNumber).trim() : undefined,
    altTelephoneName: data.altTelephoneName ? String(data.altTelephoneName).trim() : undefined,
    altTelephoneNumber: data.altTelephoneNumber ? String(data.altTelephoneNumber).trim() : undefined,
    comments: data.comments ? String(data.comments).trim() : undefined,
    amount: typeof data.amount === 'number' ? data.amount : Number(data.amount) || 0,
    currency: String(data.currency || 'EUR').trim() || 'EUR',
    startDate: String(data.startDate || ''),
    renewalDate: data.renewalDate ? String(data.renewalDate) : undefined,
    termKind: data.termKind === 'lifetime' ? 'lifetime' : 'duration',
    durationLabel: data.durationLabel ? String(data.durationLabel).trim() : undefined,
    createdAt: data.createdAt ? String(data.createdAt) : undefined,
    updatedAt: data.updatedAt ? String(data.updatedAt) : undefined,
  };
}

export function expenseToFormData(expense: PlatformExpense): PlatformExpenseFormData {
  return {
    businessName: expense.businessName,
    url: expense.url || '',
    email: expense.email || '',
    fullAddress: expense.fullAddress || '',
    telephoneName: expense.telephoneName || '',
    telephoneNumber: expense.telephoneNumber || '',
    altTelephoneName: expense.altTelephoneName || '',
    altTelephoneNumber: expense.altTelephoneNumber || '',
    comments: expense.comments || '',
    amount: expense.amount ? String(expense.amount) : '',
    currency: expense.currency || 'EUR',
    startDate: expense.startDate,
    renewalDate: expense.renewalDate || '',
    termKind: expense.termKind,
    durationLabel: expense.durationLabel || '',
  };
}

export function validateExpenseForm(form: PlatformExpenseFormData): string | null {
  if (!form.businessName.trim()) return 'Business name is required.';
  const amount = Number(form.amount);
  if (!form.amount.trim() || Number.isNaN(amount) || amount < 0) {
    return 'Enter a valid amount.';
  }
  if (!form.startDate) return 'Start date is required.';
  if (!form.termKind) return 'Select lifetime or duration.';
  if (form.termKind === 'duration') {
    if (!form.durationLabel.trim()) return 'Duration is required (e.g. Monthly, 1 year).';
    if (!form.renewalDate) return 'Renewal date is required for duration-based expenses.';
  }
  return null;
}

export function expenseFormToPayload(form: PlatformExpenseFormData): Omit<
  PlatformExpense,
  'id'
> {
  const amount = Number(form.amount);
  const termKind = form.termKind as PlatformExpenseTermKind;
  return {
    businessName: form.businessName.trim(),
    url: form.url.trim() || undefined,
    email: form.email.trim() || undefined,
    fullAddress: form.fullAddress.trim() || undefined,
    telephoneName: form.telephoneName.trim() || undefined,
    telephoneNumber: form.telephoneNumber.trim() || undefined,
    altTelephoneName: form.altTelephoneName.trim() || undefined,
    altTelephoneNumber: form.altTelephoneNumber.trim() || undefined,
    comments: form.comments.trim() || undefined,
    amount,
    currency: form.currency.trim() || 'EUR',
    startDate: form.startDate,
    renewalDate: termKind === 'duration' ? form.renewalDate : undefined,
    termKind,
    durationLabel: termKind === 'duration' ? form.durationLabel.trim() : undefined,
  };
}

/** Firestore rejects documents containing explicit `undefined` field values. */
export function sanitizeFirestorePayload<T extends Record<string, unknown>>(data: T): T {
  const out = { ...data };
  for (const key of Object.keys(out)) {
    if (out[key] === undefined) delete out[key];
  }
  return out;
}

export function formatExpenseSaveError(error: unknown): string {
  if (error instanceof Error) {
    const msg = error.message || '';
    if (/undefined/i.test(msg) && /invalid data/i.test(msg)) {
      return 'Save failed: optional fields were sent as empty. Please try again.';
    }
    if (/permission/i.test(msg) || /insufficient/i.test(msg)) {
      return 'Save failed: you do not have permission to save expenses.';
    }
    if (msg.trim()) return `Save failed: ${msg}`;
  }
  return 'Failed to save expense.';
}

export function formatExpenseDate(iso?: string): string {
  if (!iso) return '—';
  const parts = iso.split('-').map(Number);
  if (parts.length < 3) return iso;
  const [y, m, d] = parts;
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
}

export function formatExpenseAmount(amount: number, currency = 'EUR'): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

export function formatExpenseTerm(expense: PlatformExpense): string {
  if (expense.termKind === 'lifetime') return 'Lifetime';
  return expense.durationLabel?.trim() || 'Duration';
}

function formatPhoneLine(name?: string, number?: string): string | null {
  const n = number?.trim();
  if (!n) return null;
  const label = name?.trim();
  return label ? `${label}: ${n}` : n;
}

/** Telephone lines for list (primary + alt). */
export function formatExpenseTelephoneLines(expense: PlatformExpense): string[] {
  const lines: string[] = [];
  const phone = formatPhoneLine(expense.telephoneName, expense.telephoneNumber);
  if (phone) lines.push(phone);
  const altPhone = formatPhoneLine(expense.altTelephoneName, expense.altTelephoneNumber);
  if (altPhone) lines.push(altPhone);
  return lines;
}

export function renewalDaysUntil(iso?: string): number | null {
  if (!iso) return null;
  const parts = iso.split('-').map(Number);
  if (parts.length < 3) return null;
  const [y, m, d] = parts;
  const renewal = new Date(y, m - 1, d);
  renewal.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((renewal.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}
