import type { ReactNode, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

type AdminPageHeaderProps = {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
};

export default function AdminPageHeader({ title, description, icon, action }: AdminPageHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6 sm:mb-8">
      <div className="min-w-0">
        <h2 className="text-xl sm:text-2xl lg:text-[1.65rem] font-bold text-vailo-dark font-luxury flex items-center gap-2.5">
          {icon && <span className="text-vailo-teal shrink-0">{icon}</span>}
          <span className="truncate">{title}</span>
        </h2>
        {description && (
          <p className="text-gray-500 mt-1.5 text-sm sm:text-base max-w-3xl leading-relaxed">{description}</p>
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
  return (
    <div className="mb-6 sm:mb-8">
      <Link to={backTo} className="admin-back-link">
        <ArrowLeft size={16} />
        {backLabel}
      </Link>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-xl sm:text-2xl font-bold text-vailo-dark font-luxury">{title}</h2>
          {description && <p className="text-gray-500 mt-1 text-sm sm:text-base">{description}</p>}
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
  variant?: 'primary' | 'secondary' | 'gold' | 'danger' | 'ghost';
}) {
  const variants = {
    primary: 'bg-vailo-teal hover:bg-vailo-teal-hover text-white shadow-sm shadow-vailo-teal/20',
    secondary: 'bg-white hover:bg-vailo-surface-elevated text-vailo-teal border border-gray-200',
    gold: 'bg-vailo-gold hover:bg-vailo-gold-hover text-vailo-dark shadow-sm shadow-vailo-gold/25',
    danger: 'bg-red-50 hover:bg-red-100 text-red-700 border border-red-200',
    ghost: 'bg-transparent hover:bg-vailo-teal/5 text-vailo-teal',
  };

  return (
    <button
      className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 ${variants[variant]} ${className}`}
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
  variant?: 'primary' | 'gold' | 'secondary';
}) {
  const variants = {
    primary:
      'bg-vailo-teal hover:bg-vailo-teal-hover text-white shadow-sm shadow-vailo-teal/20',
    gold: 'bg-vailo-gold hover:bg-vailo-gold-hover text-vailo-dark shadow-sm shadow-vailo-gold/25',
    secondary: 'bg-white hover:bg-vailo-surface-elevated text-vailo-teal border border-gray-200',
  };

  return (
    <Link
      to={to}
      className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors ${variants[variant]} ${className}`}
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
      className={`bg-white rounded-2xl border border-gray-100 shadow-[0_2px_16px_-6px_rgba(11,79,92,0.1)] ${padding ? 'p-4 sm:p-6' : ''} ${className}`}
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
      <div className="h-14 w-14 sm:h-16 sm:w-16 bg-vailo-teal/8 rounded-2xl flex items-center justify-center text-vailo-teal mb-4">
        {icon}
      </div>
      <h3 className="text-lg sm:text-xl font-bold text-vailo-dark font-luxury mb-2">{title}</h3>
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
    info: 'bg-vailo-teal/5 border-vailo-teal/15 text-vailo-dark',
    warning: 'bg-amber-50 border-amber-200/80 text-amber-900',
    success: 'bg-emerald-50 border-emerald-200/80 text-emerald-900',
    gold: 'bg-vailo-gold/10 border-vailo-gold/25 text-vailo-dark',
  };
  const iconColors = {
    info: 'text-vailo-teal',
    warning: 'text-amber-600',
    success: 'text-emerald-600',
    gold: 'text-vailo-gold',
  };

  return (
    <div className={`rounded-2xl border p-4 sm:p-5 flex items-start gap-3 ${styles[variant]} ${className}`}>
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
    teal: 'bg-vailo-teal/8 text-vailo-teal border-vailo-teal/15',
    gold: 'bg-vailo-gold/15 text-vailo-gold-muted border-vailo-gold/25',
    neutral: 'bg-gray-100 text-gray-600 border-gray-200',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold border tracking-wide ${styles[variant]}`}>
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
