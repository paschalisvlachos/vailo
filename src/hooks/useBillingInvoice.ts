import { useCallback, useEffect, useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';

export type BillingLineItem = {
  label: string;
  cost: number;
  count?: number;
};

export type BillingInvoice = {
  source: 'bigquery' | 'ledger';
  configured: boolean;
  monthKey: string;
  totalCost: number;
  lineItems: BillingLineItem[];
  currency: string;
  magicFill?: number;
  note?: string;
  bigQueryError?: string;
};

export function useBillingInvoice(monthKey?: string) {
  const [invoice, setInvoice] = useState<BillingInvoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInvoice = useCallback(async (key?: string) => {
    setLoading(true);
    setError(null);
    try {
      const functions = getFunctions();
      const getBillingInvoice = httpsCallable<{ monthKey?: string }, BillingInvoice>(
        functions,
        'getBillingInvoice'
      );
      const result = await getBillingInvoice(key ? { monthKey: key } : {});
      setInvoice(result.data);
    } catch (err) {
      console.error('getBillingInvoice:', err);
      setError('Could not load invoice data. Deploy getBillingInvoice if you have not yet.');
      setInvoice(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInvoice(monthKey);
  }, [monthKey, fetchInvoice]);

  return { invoice, loading, error, refresh: () => fetchInvoice(monthKey) };
}
