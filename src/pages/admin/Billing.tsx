import { useState } from 'react';
import {
  Wallet,
  Calculator,
  Database,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Activity,
  Radio,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import AdminPageHeader, { AdminAlert, AdminBadge, AdminButton, AdminCard } from '../../components/admin/AdminPageHeader';
import { MAGIC_FILL_UNIT_COST, usePlatformUsage } from '../../hooks/usePlatformUsage';
import { useBillingInvoice } from '../../hooks/useBillingInvoice';

function formatUsd(amount: number) {
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });
}

function formatMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export default function Billing() {
  const [activeTab, setActiveTab] = useState<'accurate' | 'estimate'>('estimate');
  const { stats, loading, error, monthKey, estimatedCost } = usePlatformUsage();
  const {
    invoice,
    loading: invoiceLoading,
    error: invoiceError,
    refresh: refreshInvoice,
  } = useBillingInvoice(activeTab === 'accurate' ? monthKey : undefined);

  return (
    <div className="admin-page">
      <AdminPageHeader
        title="Billing & Usage"
        description="Track API costs, Firebase usage, and AI generation"
        icon={<Wallet size={26} />}
      />

      <div className="flex flex-col sm:flex-row gap-1 bg-white p-1 rounded-xl mb-6 border border-gray-100 w-full sm:w-fit shadow-sm">
        <button
          type="button"
          onClick={() => setActiveTab('accurate')}
          className={`flex items-center justify-center sm:justify-start px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
            activeTab === 'accurate'
              ? 'bg-vailo-teal text-white shadow-sm'
              : 'text-gray-500 hover:text-vailo-teal hover:bg-vailo-surface-elevated'
          }`}
        >
          <Database size={16} className="mr-2 shrink-0" />
          Official Invoice
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('estimate')}
          className={`flex items-center justify-center sm:justify-start px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
            activeTab === 'estimate'
              ? 'bg-vailo-teal text-white shadow-sm'
              : 'text-gray-500 hover:text-vailo-teal hover:bg-vailo-surface-elevated'
          }`}
        >
          <Calculator size={16} className="mr-2 shrink-0" />
          Live Tracker
        </button>
      </div>

      {activeTab === 'accurate' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            {invoice?.source === 'bigquery' ? (
              <AdminAlert variant="success" icon={<CheckCircle2 size={18} />} title="GCP billing (BigQuery)">
                Costs pulled from your Google Cloud billing export for {formatMonthLabel(monthKey)}.
              </AdminAlert>
            ) : (
              <AdminAlert variant="info" icon={<AlertCircle size={18} />} title="Usage ledger">
                Showing tracked Places API usage at {formatUsd(MAGIC_FILL_UNIT_COST)}/call. Optional: set{' '}
                <code className="text-xs bg-white/60 px-1 py-0.5 rounded">BILLING_BQ_TABLE</code> on Cloud
                Functions for full GCP invoice breakdown (no extra Vailo cost).
              </AdminAlert>
            )}
            <AdminButton
              variant="secondary"
              onClick={() => refreshInvoice()}
              disabled={invoiceLoading}
              className="shrink-0 self-start sm:self-center"
            >
              {invoiceLoading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              Refresh
            </AdminButton>
          </div>

          {invoiceError && (
            <AdminAlert variant="warning" title="Could not load invoice">
              {invoiceError}
            </AdminAlert>
          )}

          {invoice?.bigQueryError && (
            <AdminAlert variant="warning" title="BigQuery unavailable">
              {invoice.bigQueryError}. Showing usage ledger instead.
            </AdminAlert>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <AdminCard className="p-6 md:col-span-1">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total this month</p>
              <p className="text-4xl font-black text-vailo-dark font-luxury mt-2">
                {invoiceLoading ? '—' : formatUsd(invoice?.totalCost ?? 0)}
              </p>
              <p className="text-sm text-gray-500 mt-1">{formatMonthLabel(monthKey)}</p>
              {invoice && (
                <div className="mt-3">
                  <AdminBadge variant={invoice.source === 'bigquery' ? 'teal' : 'gold'}>
                    {invoice.source === 'bigquery' ? 'GCP Billing' : 'Usage ledger'}
                  </AdminBadge>
                </div>
              )}
            </AdminCard>

            <AdminCard className="p-6 md:col-span-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Line items</p>
              {invoiceLoading ? (
                <div className="flex items-center gap-2 text-sm text-gray-500 py-4">
                  <Loader2 size={18} className="animate-spin text-vailo-teal" />
                  Loading…
                </div>
              ) : invoice && invoice.lineItems.length > 0 ? (
                <div className="admin-table-wrap border-0">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Service / item</th>
                        <th className="text-right">Qty</th>
                        <th className="text-right">Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoice.lineItems.map((item) => (
                        <tr key={item.label}>
                          <td className="font-medium text-vailo-dark">{item.label}</td>
                          <td className="text-right text-gray-500 tabular-nums">
                            {item.count != null ? item.count.toLocaleString() : '—'}
                          </td>
                          <td className="text-right font-semibold tabular-nums">{formatUsd(item.cost)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-gray-500 py-4">
                  No billable usage recorded for {formatMonthLabel(monthKey)} yet.
                </p>
              )}
            </AdminCard>
          </div>

          {invoice?.note && invoice.source === 'ledger' && !invoice.configured && (
            <AdminCard className="p-5 text-sm text-gray-600 leading-relaxed">
              <p className="font-semibold text-vailo-dark mb-2">Optional: full GCP invoice via BigQuery</p>
              <ol className="list-decimal list-inside space-y-1 text-gray-500">
                <li>In Google Cloud Console → Billing → Billing export, enable BigQuery export.</li>
                <li>
                  Set <code className="text-xs bg-vailo-surface-elevated px-1 rounded">BILLING_BQ_TABLE</code>{' '}
                  on Cloud Functions to your export table (e.g.{' '}
                  <code className="text-xs">LockIt.billing_export.gcp_billing_export_resource_v1_XXXXX</code>).
                </li>
                <li>Redeploy functions. Query costs stay within BigQuery&apos;s free tier for typical admin use.</li>
              </ol>
            </AdminCard>
          )}
        </div>
      )}

      {activeTab === 'estimate' && (
        <div className="space-y-6">
          <AdminAlert variant="info" icon={<AlertCircle size={18} />} title="Real-time approximations">
            Counts every Google Places lookup triggered by Magic Fill (admin) and guest place-photo resolution.
            Assumes a flat {formatUsd(MAGIC_FILL_UNIT_COST)} per call. Does not account for caching or
            Google&apos;s $200 free tier.
          </AdminAlert>

          {error && (
            <AdminAlert variant="warning" title="Error">
              {error}
            </AdminAlert>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            <AdminCard className="p-6">
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center text-vailo-dark font-bold">
                  <Activity size={18} className="mr-2 text-vailo-teal" /> Total Magic Fills
                </div>
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-vailo-teal bg-vailo-teal/8 px-2.5 py-1 rounded-full border border-vailo-teal/15">
                  <Radio size={12} className="animate-pulse" /> Live
                </span>
              </div>
              <div className="flex items-end gap-3">
                <h3 className="text-4xl font-black text-vailo-dark font-luxury">
                  {loading ? '—' : stats.magicFill.toLocaleString()}
                </h3>
                <p className="text-sm text-gray-500 pb-1">{formatMonthLabel(monthKey)}</p>
              </div>
              {stats.updatedAt && !loading && (
                <p className="text-xs text-gray-400 mt-3">Last activity {stats.updatedAt.toLocaleString()}</p>
              )}
            </AdminCard>

            <AdminCard className="p-6">
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center text-vailo-dark font-bold">
                  <TrendingUp size={18} className="mr-2 text-vailo-gold" /> Estimated Raw Cost
                </div>
                <span className="text-xs font-bold text-gray-400 bg-vailo-surface-elevated px-2 py-1 rounded-lg">
                  {formatUsd(MAGIC_FILL_UNIT_COST)}/fill
                </span>
              </div>
              <div className="flex items-end gap-3">
                <h3 className="text-4xl font-black text-vailo-dark font-luxury">
                  {loading ? '—' : formatUsd(estimatedCost)}
                </h3>
                <p className="text-sm text-gray-500 pb-1">estimated</p>
              </div>
            </AdminCard>
          </div>

          {!loading && stats.magicFill === 0 && (
            <AdminAlert variant="info" icon={<CheckCircle2 size={18} />}>
              No Magic Fill API calls recorded yet this month. Counts appear automatically when admins use Magic
              Fill or guests trigger place photo lookups.
            </AdminAlert>
          )}
        </div>
      )}
    </div>
  );
}
