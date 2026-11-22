import type { ReactNode, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { isAdminPathname } from '../../lib/adminRoutes';

type AdminPageHeaderProps = {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
};

export default function AdminPageHeader({ title, description, icon, action }: AdminPageHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6 sm:mb-7">
      <div className="min-w-0">
        <h2 className="text-xl sm:text-[1.25rem] font-bold text-vailo-dark leading-6 flex items-center gap-2.5">
          {icon && <span className="text-[#2ec4b6] shrink-0">{icon}</span>}
          <span className="truncate">{title}</span>
        </h2>
        {description && (
          <p className="text-gray-500 mt-1.5 text-sm max-w-3xl leading-relaxed">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0 w-full sm:w-auto">{action}</div>}
    </div>
  );
}

export function AdminBackHeader({
  backTo,
  backLabel = 'Back',
  title,
  description,
  badge,
  action,
}: {
  backTo: string;
  backLabel?: string;
  title: string;
  description?: string;
  badge?: ReactNode;
  action?: ReactNode;
}) {
  const handleBack = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    if (isAdminPathname(backTo)) {
      window.location.assign(backTo);
      return;
    }
    window.location.href = backTo;
  };

  return (
    <div className="mb-6 sm:mb-7">
      <a href={backTo} onClick={handleBack} className="admin-back-link">
        <ArrowLeft size={16} />
        {backLabel}
      </a>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-xl sm:text-[1.25rem] font-bold text-vailo-dark leading-6">{title}</h2>
          {description && <p className="text-gray-500 mt-1 text-sm">{description}</p>}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {badge}
          {action}
        </div>
      </div>
    </div>
  );
}

export function AdminButton({
  children,
  className = '',
  variant = 'primary',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'accent' | 'secondary' | 'gold' | 'danger' | 'ghost';
}) {
  const variants = {
    primary:
      'bg-[#08141e] hover:bg-vailo-dark text-slate-50 border border-[#08141e]',
    /** Pale blue — page header CTAs (Add, Run Setup Wizard, etc.). */
    accent:
      'bg-[#2ec4b6] hover:bg-[#26a99d] text-white border border-[#2ec4b6]',
    secondary:
      'bg-[#e8e8e9] hover:bg-[#dedee0] text-vailo-dark border border-transparent',
    gold: 'bg-vailo-gold hover:bg-vailo-gold-hover text-vailo-dark border border-vailo-gold',
    danger: 'bg-red-50 hover:bg-red-100 text-red-700 border border-red-200',
    ghost: 'bg-transparent hover:bg-black/[0.03] text-vailo-dark border border-transparent',
  };

  return (
    <button
      className={`inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-bold transition-colors disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function AdminButtonLink({
  to,
  children,
  className = '',
  variant = 'primary',
}: {
  to: string;
  children: ReactNode;
  className?: string;
  variant?: 'primary' | 'accent' | 'gold' | 'secondary';
}) {
  const variants = {
    primary:
      'bg-[#08141e] hover:bg-vailo-dark text-slate-50 border border-[#08141e]',
    accent:
      'bg-[#2ec4b6] hover:bg-[#26a99d] text-white border border-[#2ec4b6]',
    gold: 'bg-vailo-gold hover:bg-vailo-gold-hover text-vailo-dark border border-vailo-gold',
    secondary:
      'bg-[#e8e8e9] hover:bg-[#dedee0] text-vailo-dark border border-transparent',
  };

  return (
    <Link
      to={to}
      className={`inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-bold transition-colors ${variants[variant]} ${className}`}
    >
      {children}
    </Link>
  );
}

export function AdminCard({
  children,
  className = '',
  padding = false,
}: {
  children: ReactNode;
  className?: string;
  padding?: boolean;
}) {
  return (
    <div
      className={`bg-white rounded-lg border border-[#e1e1e1] shadow-[0_10px_10px_0_rgba(0,0,0,0.08)] ${padding ? 'p-4 sm:p-6' : ''} ${className}`}
    >
      {children}
    </div>
  );
}

export function AdminEmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <AdminCard className="p-8 sm:p-12 text-center flex flex-col items-center justify-center min-h-[320px]">
      <div className="h-14 w-14 sm:h-16 sm:w-16 bg-[#2ec4b6]/20 rounded-lg flex items-center justify-center text-vailo-teal mb-4">
        {icon}
      </div>
      <h3 className="text-lg sm:text-xl font-bold text-vailo-dark mb-2">{title}</h3>
      <p className="text-gray-500 max-w-md mb-6 text-sm sm:text-base leading-relaxed">{description}</p>
      {action}
    </AdminCard>
  );
}

export function AdminAlert({
  variant = 'info',
  icon,
  title,
  children,
  className = '',
}: {
  variant?: 'info' | 'warning' | 'success' | 'gold';
  icon?: ReactNode;
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  const styles = {
    info: 'bg-vailo-teal/5 border-vailo-teal/20 text-vailo-dark',
    warning: 'bg-amber-50 border-amber-200/80 text-amber-900',
    success: 'bg-emerald-50 border-emerald-200/80 text-emerald-900',
    gold: 'bg-vailo-gold/10 border-vailo-gold/30 text-vailo-dark',
  };
  const iconColors = {
    info: 'text-vailo-teal',
    warning: 'text-amber-600',
    success: 'text-emerald-600',
    gold: 'text-vailo-gold',
  };

  return (
    <div className={`rounded-lg border p-4 sm:p-5 flex items-start gap-3 ${styles[variant]} ${className}`}>
      {icon && <span className={`shrink-0 mt-0.5 ${iconColors[variant]}`}>{icon}</span>}
      <div className="min-w-0 text-sm leading-relaxed">
        {title && <p className="font-bold mb-1">{title}</p>}
        {children}
      </div>
    </div>
  );
}

export function AdminBadge({
  children,
  variant = 'teal',
}: {
  children: ReactNode;
  variant?: 'teal' | 'gold' | 'neutral';
}) {
  const styles = {
    teal: 'bg-vailo-teal/10 text-vailo-teal border-vailo-teal/20',
    gold: 'bg-vailo-gold/15 text-vailo-gold-muted border-vailo-gold/30',
    neutral: 'bg-gray-100 text-gray-600 border-gray-200',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold border ${styles[variant]}`}>
      {children}
    </span>
  );
}

export function AdminLabel({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="admin-label">
      {children}
    </label>
  );
}

export function AdminInput({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`admin-input ${className}`} {...props} />;
}

export function AdminSelect({ className = '', children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`admin-select ${className}`} {...props}>
      {children}
    </select>
  );
}

export function AdminTextarea({ className = '', ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`admin-textarea ${className}`} {...props} />;
}

export function AdminSection({
  title,
  icon,
  children,
  className = '',
}: {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <AdminCard className={`p-4 sm:p-6 ${className}`}>
      <h3 className="admin-section-title">
        {icon}
        {title}
      </h3>
      {children}
    </AdminCard>
  );
}
