import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { AlertCircle, CheckCircle2, Info, X, XCircle } from 'lucide-react';

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

type ToastItem = {
  id: string;
  message: string;
  variant: ToastVariant;
  duration: number;
};

type ToastOptions = {
  variant?: ToastVariant;
  duration?: number;
};

type ToastContextValue = {
  toast: (message: string, options?: ToastOptions) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
  info: (message: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const VARIANT_STYLES: Record<
  ToastVariant,
  { border: string; bg: string; icon: typeof CheckCircle2; iconClass: string }
> = {
  success: {
    border: 'border-emerald-200',
    bg: 'bg-emerald-50',
    icon: CheckCircle2,
    iconClass: 'text-emerald-600',
  },
  error: {
    border: 'border-red-200',
    bg: 'bg-red-50',
    icon: XCircle,
    iconClass: 'text-red-600',
  },
  warning: {
    border: 'border-amber-200',
    bg: 'bg-amber-50',
    icon: AlertCircle,
    iconClass: 'text-amber-600',
  },
  info: {
    border: 'border-vailo-teal/20',
    bg: 'bg-vailo-surface-elevated',
    icon: Info,
    iconClass: 'text-vailo-teal',
  },
};

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed top-4 right-4 z-[9999] flex flex-col gap-3 w-[min(100vw-2rem,24rem)] pointer-events-none"
      aria-live="polite"
      aria-relevant="additions"
    >
      {toasts.map((item) => {
        const styles = VARIANT_STYLES[item.variant];
        const Icon = styles.icon;

        return (
          <div
            key={item.id}
            role="alert"
            className={`pointer-events-auto flex items-start gap-3 rounded-2xl border px-4 py-3.5 shadow-[0_12px_40px_-16px_rgba(5,31,38,0.35)] animate-toast-in ${styles.border} ${styles.bg}`}
          >
            <Icon size={18} className={`shrink-0 mt-0.5 ${styles.iconClass}`} />
            <p className="flex-1 text-sm text-vailo-dark leading-relaxed">{item.message}</p>
            <button
              type="button"
              onClick={() => onDismiss(item.id)}
              className="shrink-0 p-1 rounded-lg text-gray-400 hover:text-vailo-dark hover:bg-black/5 transition-colors"
              aria-label="Dismiss notification"
            >
              <X size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (message: string, options?: ToastOptions) => {
      const variant = options?.variant ?? 'info';
      const duration = options?.duration ?? (variant === 'error' ? 7000 : 5000);
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

      setToasts((prev) => [...prev, { id, message, variant, duration }]);

      window.setTimeout(() => dismiss(id), duration);
    },
    [dismiss]
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      toast: show,
      success: (message) => show(message, { variant: 'success' }),
      error: (message) => show(message, { variant: 'error' }),
      warning: (message) => show(message, { variant: 'warning' }),
      info: (message) => show(message, { variant: 'info' }),
    }),
    [show]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return ctx;
}
