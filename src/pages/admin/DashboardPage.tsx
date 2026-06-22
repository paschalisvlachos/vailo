import { Link } from 'react-router-dom';
import { AlertCircle, Building2, Globe, Users, Sparkles, Compass } from 'lucide-react';
import AdminPageHeader, { AdminCard } from '../../components/admin/AdminPageHeader';
import DashboardStats from '../../components/admin/DashboardStats';
import { useNewDiscoveredPlacesCount } from '../../hooks/useNewDiscoveredPlacesCount';
import { adminPath } from '../../lib/adminRoutes';

export default function DashboardPage() {
  const newDiscoveredCount = useNewDiscoveredPlacesCount();

  return (
    <div className="admin-page">
      <AdminPageHeader
        title="Dashboard"
        description="Portfolio, guest portal activity, excursions, and platform health"
      />

      {newDiscoveredCount > 0 && (
        <Link
          to={adminPath('/area')}
          className="flex items-start gap-4 p-4 sm:p-5 mb-6 bg-vailo-gold/10 border border-vailo-gold/25 rounded-2xl hover:bg-vailo-gold/15 transition-colors"
        >
          <AlertCircle className="text-vailo-gold shrink-0 mt-0.5" size={22} />
          <div className="min-w-0">
            <p className="font-bold text-vailo-dark text-sm sm:text-base">
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
          { icon: Compass, label: 'Excursions', to: adminPath('/excursions/providers'), desc: 'Providers & catalog' },
          { icon: Globe, label: 'Area data', to: adminPath('/area'), desc: 'Gems, features, AI rules' },
          { icon: Sparkles, label: 'Billing', to: adminPath('/billing'), desc: 'API usage & costs' },
        ].map((item) => (
            <Link key={item.label} to={item.to}>
              <AdminCard className="p-5 sm:p-6 hover:shadow-[0_8px_30px_-12px_rgba(11,79,92,0.18)] hover:border-vailo-teal/15 transition-all h-full group">
                <div className="admin-icon-box mb-4 group-hover:bg-vailo-gold/15 group-hover:text-vailo-gold transition-colors">
                  <item.icon size={20} />
                </div>
                <p className="font-bold text-vailo-dark font-luxury">{item.label}</p>
                <p className="text-sm text-gray-500 mt-1.5 leading-relaxed">{item.desc}</p>
              </AdminCard>
            </Link>
          )
        )}
      </div>

      <DashboardStats />
    </div>
  );
}
