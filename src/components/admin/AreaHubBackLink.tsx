import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { adminPath } from '../../lib/adminRoutes';

type Props = {
  className?: string;
  label?: string;
};

export default function AreaHubBackLink({ className = '', label = 'Back to Area Functionality' }: Props) {
  return (
    <Link
      to={adminPath('/area')}
      className={`admin-back-link inline-flex items-center gap-1.5 mb-6 relative z-50 ${className}`}
    >
      <ArrowLeft size={16} />
      {label}
    </Link>
  );
}
