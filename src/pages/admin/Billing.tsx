import { useState } from 'react';
import { 
  Wallet, Calculator, Database, TrendingUp, AlertCircle, 
  RefreshCw, CheckCircle2, DollarSign, Activity
} from 'lucide-react';

export default function Billing() {
  const [activeTab, setActiveTab] = useState<'accurate' | 'estimate'>('accurate');

  return (
    <div className="max-w-5xl mx-auto pb-8">
      
      {/* Header */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 flex items-center">
          <Wallet className="mr-3 text-blue-600" size={28} />
          Platform Billing & Usage
        </h2>
        <p className="text-gray-500 mt-1">Track your API costs, Firebase usage, and AI generation.</p>
      </div>

      {/* Tab Navigation */}
      <div className="flex space-x-1 bg-gray-100/50 p-1 rounded-xl mb-6 border border-gray-200/50 w-fit">
        <button
          onClick={() => setActiveTab('accurate')}
          className={`flex items-center px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${
            activeTab === 'accurate'
              ? 'bg-white text-gray-900 shadow-sm border border-gray-200'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
          }`}
        >
          <Database size={16} className={`mr-2 ${activeTab === 'accurate' ? 'text-blue-600' : ''}`} />
          Official Invoice (Accurate)
        </button>
        <button
          onClick={() => setActiveTab('estimate')}
          className={`flex items-center px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${
            activeTab === 'estimate'
              ? 'bg-white text-gray-900 shadow-sm border border-gray-200'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
          }`}
        >
          <Calculator size={16} className={`mr-2 ${activeTab === 'estimate' ? 'text-emerald-600' : ''}`} />
          Live Tracker (Estimate)
        </button>
      </div>

      {/* ------------------------------------------------ */}
      {/* TAB 1: ACCURATE (BIGQUERY)                       */}
      {/* ------------------------------------------------ */}
      {activeTab === 'accurate' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
          
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-start">
            <CheckCircle2 className="text-blue-600 mt-0.5 mr-3 shrink-0" size={18} />
            <div>
              <h4 className="text-sm font-bold text-blue-900">100% Financial Accuracy</h4>
              <p className="text-sm text-blue-800 mt-1">
                This data is pulled directly from Google Cloud's BigQuery billing exports. It includes your $200 monthly free tier credits and exact API routing costs. Data here may be delayed by 24-48 hours per Google's billing cycle.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Placeholder Cards for Accurate Data */}
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
              <div className="flex justify-between items-start mb-4">
                <div className="p-2 bg-gray-50 rounded-lg text-gray-500"><DollarSign size={20} /></div>
                <span className="px-2.5 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-full border border-green-200">This Month</span>
              </div>
              <h3 className="text-3xl font-bold text-gray-900">$0.00</h3>
              <p className="text-sm text-gray-500 mt-1">Total Google Cloud Spend</p>
            </div>
            
            {/* We will fill these with real BigQuery data later */}
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm border-dashed flex flex-col items-center justify-center text-gray-400 min-h-[160px]">
              <Database size={24} className="mb-2" />
              <p className="text-sm font-medium">Awaiting BigQuery Setup</p>
            </div>
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm border-dashed flex flex-col items-center justify-center text-gray-400 min-h-[160px]">
              <Database size={24} className="mb-2" />
              <p className="text-sm font-medium">Awaiting BigQuery Setup</p>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------ */}
      {/* TAB 2: ESTIMATE (FIRESTORE)                      */}
      {/* ------------------------------------------------ */}
      {activeTab === 'estimate' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
          
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 flex items-start">
            <AlertCircle className="text-emerald-600 mt-0.5 mr-3 shrink-0" size={18} />
            <div>
              <h4 className="text-sm font-bold text-emerald-900">Real-Time Approximations</h4>
              <p className="text-sm text-emerald-800 mt-1">
                This tracker counts actions as they happen in your app. It assumes every "Magic Fill" costs a flat $0.027. It does NOT account for caching or Google's $200 free tier. Use this strictly to monitor raw platform activity.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Placeholder Cards for Live Tracker */}
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center text-gray-700 font-bold">
                  <Activity size={18} className="mr-2 text-emerald-500" /> Total Magic Fills
                </div>
                <button className="text-gray-400 hover:text-gray-600"><RefreshCw size={16} /></button>
              </div>
              <div className="flex items-end gap-3">
                <h3 className="text-4xl font-black text-gray-900">0</h3>
                <p className="text-sm text-gray-500 pb-1">clicks across all users</p>
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center text-gray-700 font-bold">
                  <TrendingUp size={18} className="mr-2 text-emerald-500" /> Estimated Raw Cost
                </div>
                <div className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-1 rounded">Rate: $0.027/fill</div>
              </div>
              <div className="flex items-end gap-3">
                <h3 className="text-4xl font-black text-gray-900">$0.00</h3>
                <p className="text-sm text-gray-500 pb-1">estimated value</p>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}