import { useNavigate } from 'react-router-dom';
import { ArrowRight, BookOpen, Globe, Users } from 'lucide-react';
import AdminPageHeader from '../../../components/admin/AdminPageHeader';
import { adminPath } from '../../../lib/adminRoutes';

const MODULES = [
  {
    id: 'web',
    title: 'Web Knowledge',
    icon: Globe,
    desc: 'Store information about the Vailo website and platform. Ask questions and get AI answers grounded in your articles.',
    path: adminPath('/knowledge/web'),
  },
  {
    id: 'client',
    title: 'Client Knowledge',
    icon: Users,
    desc: 'Capture questions owners and partners may ask. Use AI to draft strong answers your team can approve for staff training.',
    path: adminPath('/knowledge/client'),
  },
] as const;

export default function KnowledgeHub() {
  const navigate = useNavigate();

  return (
    <div className="admin-page">
      <AdminPageHeader
        title="Knowledge"
        description="Central knowledge for the platform and for training staff on client conversations."
        icon={<BookOpen size={26} />}
      />

      <h3 className="text-lg font-bold text-vailo-dark font-luxury mb-5">Categories</h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5 max-w-4xl">
        {MODULES.map((mod) => (
          <button
            key={mod.id}
            type="button"
            onClick={() => navigate(mod.path)}
            className="admin-module-card group text-left"
          >
            <div className="admin-icon-box mb-4 group-hover:bg-vailo-gold/15 group-hover:text-vailo-gold transition-colors">
              <mod.icon size={20} />
            </div>
            <h4 className="text-base font-bold text-vailo-dark font-luxury mb-1.5">{mod.title}</h4>
            <p className="text-sm text-gray-500 mb-5 flex-1 leading-relaxed">{mod.desc}</p>
            <span className="inline-flex items-center text-sm font-semibold text-vailo-teal group-hover:text-vailo-gold transition-colors">
              Open <ArrowRight size={15} className="ml-1.5" />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
