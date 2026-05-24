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
} from 'lucide-react';
import AdminPageHeader, { AdminAlert, AdminCard } from '../../components/admin/AdminPageHeader';
import { MAGIC_FILL_UNIT_COST, usePlatformUsage } from '../../hooks/usePlatformUsage';

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
          <AdminAlert variant="gold" icon={<AlertCircle size={18} />} title="BigQuery billing export not connected">
            Official invoice data requires a Google Cloud BigQuery billing export. Until that is configured, use
            the Live Tracker tab for real-time Magic Fill counts from Firestore.
          </AdminAlert>

          <AdminCard className="p-12 border-dashed flex flex-col items-center justify-center text-center min-h-[220px]">
            <Database size={36} className="mb-3 text-gray-300" />
            <p className="text-base font-semibold text-vailo-dark font-luxury">Awaiting BigQuery setup</p>
            <p className="text-sm text-gray-400 mt-2 max-w-lg leading-relaxed">
              Enable billing export in Google Cloud Console, then wire a Cloud Function or scheduled job to query
              costs into this dashboard.
            </p>
          </AdminCard>
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
