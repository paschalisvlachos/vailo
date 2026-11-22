import { Link, Navigate } from 'react-router-dom';
import {
  AlertCircle,
  Building2,
  Globe,
  Users,
  Sparkles,
  Compass,
} from 'lucide-react';
import AdminPageHeader, { AdminCard } from '../../components/admin/AdminPageHeader';
import DashboardStats from '../../components/admin/DashboardStats';
import { useNewDiscoveredPlacesCount } from '../../hooks/useNewDiscoveredPlacesCount';
import { useAdminSession } from '../../context/AdminSessionContext';
import { isAgent, isExcursionProvider, isOwner } from '../../lib/adminAccess';
import { adminPath } from '../../lib/adminRoutes';
import { countListingsTowardCapacity } from '../../lib/ownerListingQuota';

/** Placeholder “what’s new” feed — replace with real product updates later. */
const WHATS_NEW_MOCK = [
  {
    id: '1',
    title: 'Lorem ipsum dolor sit amet',
    body: 'Consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation.',
    dateLabel: '19 Nov 2026',
  },
  {
    id: '2',
    title: 'Ut enim ad minima veniam',
    body: 'Quis nostrum exercitationem ullam corporis suscipit laboriosam, nisi ut aliquid ex ea commodi consequatur. Duis aute irure dolor in reprehenderit.',
    dateLabel: '12 Nov 2026',
  },
  {
    id: '3',
    title: 'Excepteur sint occaecat cupidatat',
    body: 'Non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. Curabitur pretium tincidunt lacus — a placeholder for future release notes.',
    dateLabel: '4 Nov 2026',
  },
] as const;

function AgencyWhatsNewDashboard() {
  const { profile, portfolioProperties, portfolioTypes } = useAdminSession();
  const agencyPropertyCount = countListingsTowardCapacity(
    profile,
    portfolioProperties,
    portfolioTypes
  );
  const agencyName =
    portfolioProperties.find((p) => p.ownerId === profile?.id)?.propertyName ||
    portfolioProperties[0]?.propertyName ||
    'Your agency';

  return (
    <div className="admin-page">
      <AdminPageHeader
        title="Dashboard"
        description="What’s new and your agency portfolio at a glance"
      />
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_240px] gap-5 lg:gap-6 items-start">
        <section aria-label="What's new">
        <AdminCard className="p-5 sm:p-6">
          <h2 className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-4">
            What’s new
          </h2>
          <ol className="divide-y divide-gray-100">
            {WHATS_NEW_MOCK.map((item, index) => (
              <li
                key={item.id}
                className={`flex items-start gap-4 ${index === 0 ? 'pb-5' : 'py-5'} ${
                  index === WHATS_NEW_MOCK.length - 1 ? 'pb-0' : ''
                }`}
              >
                <span
                  className="shrink-0 h-8 w-8 rounded-full bg-vailo-teal/10 text-vailo-teal text-sm font-bold flex items-center justify-center"
                  aria-hidden
                >
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <h3 className="font-semibold text-vailo-dark text-base">{item.title}</h3>
                    <time className="text-xs font-medium text-gray-400 tabular-nums shrink-0">
                      {item.dateLabel}
                    </time>
                  </div>
                  <p className="text-sm text-gray-600 mt-2 leading-relaxed">{item.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </AdminCard>
        </section>

        <aside className="lg:sticky lg:top-24">
          <Link to={adminPath('/properties')}>
            <AdminCard className="p-5 sm:p-6 hover:shadow-[0_8px_24px_-8px_rgba(40,42,57,0.22)] transition-all group">
              <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-4">
                Your agency
              </p>
              <div className="admin-icon-box mb-4 group-hover:bg-vailo-gold/15 group-hover:text-vailo-gold transition-colors">
                <Building2 size={20} />
              </div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Properties
              </p>
              <p className="text-3xl font-bold text-vailo-dark tabular-nums mt-1">
                {agencyPropertyCount}
              </p>
              <p className="text-sm text-gray-500 mt-2 leading-relaxed truncate" title={agencyName}>
                {agencyName}
              </p>
            </AdminCard>
          </Link>
        </aside>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { profile, isPlatformAdmin } = useAdminSession();
  const newDiscoveredCount = useNewDiscoveredPlacesCount();

  if (isExcursionProvider(profile)) {
    return <Navigate to={adminPath('/excursion-portal')} replace />;
  }

  if (!isPlatformAdmin && (isAgent(profile) || isOwner(profile))) {
    return <AgencyWhatsNewDashboard />;
  }

  return (
    <div className="admin-page">
      <AdminPageHeader
        title="Dashboard"
        description="Portfolio, guest portal activity, excursions, and platform health"
      />

      {newDiscoveredCount > 0 && (
        <Link
          to={adminPath('/area')}
          className="flex items-start gap-4 p-4 sm:p-5 mb-6 bg-vailo-gold/10 border border-vailo-gold/30 rounded hover:bg-vailo-gold/15 transition-colors"
        >
          <AlertCircle className="text-vailo-gold shrink-0 mt-0.5" size={22} />
          <div className="min-w-0">
            <p className="font-semibold text-vailo-dark text-sm sm:text-base">
              {newDiscoveredCount} discovered place{newDiscoveredCount === 1 ? '' : 's'} need review
            </p>
            <p className="text-sm text-vailo-gold-muted mt-1">
              Open Area Functionality → Discovered Places to verify and promote to Local Gems.
            </p>
          </div>
        </Link>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4 sm:gap-5 mb-10">
        {[
          { icon: Building2, label: 'Properties', to: adminPath('/properties'), desc: 'Portfolio & guest portals' },
          { icon: Users, label: 'Owners CRM', to: adminPath('/owners'), desc: 'Agents, owners & providers' },
          { icon: Compass, label: 'Arrange and Book', to: adminPath('/excursions/providers'), desc: 'Providers & services' },
          { icon: Globe, label: 'Area data', to: adminPath('/area'), desc: 'Gems, features, AI rules' },
          { icon: Sparkles, label: 'Billing', to: adminPath('/billing'), desc: 'API usage & costs' },
        ].map((item) => (
          <Link key={item.label} to={item.to}>
            <AdminCard className="p-5 sm:p-6 hover:shadow-[0_8px_24px_-8px_rgba(40,42,57,0.22)] transition-all h-full group">
              <div className="admin-icon-box mb-4 group-hover:bg-vailo-gold/15 group-hover:text-vailo-gold transition-colors">
                <item.icon size={20} />
              </div>
              <p className="font-semibold text-vailo-dark">{item.label}</p>
              <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">{item.desc}</p>
            </AdminCard>
          </Link>
        ))}
      </div>

      <DashboardStats />
    </div>
  );
}
