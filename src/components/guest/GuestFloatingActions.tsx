import { AlertTriangle, MessageCircle, Sparkles } from 'lucide-react';

type Props = {
  onOpenAssistant: () => void;
  onOpenReport: () => void;
  /** wa.me link — when set, shows a WhatsApp FAB below Report Issue. */
  whatsappHref?: string | null;
  /** When true (desktop phone preview), pin FABs to the right edge of the 400px frame. */
  mobileFramePreview?: boolean;
};

/** Fixed stacked FABs — stay on screen while scrolling. */
export default function GuestFloatingActions({
  onOpenAssistant,
  onOpenReport,
  whatsappHref,
  mobileFramePreview = false,
}: Props) {
  const positionClass = mobileFramePreview
    ? 'fixed z-[60] flex flex-col items-end gap-1.5 pointer-events-none bottom-[max(0.375rem,env(safe-area-inset-bottom))] right-2 max-md:right-2 md:right-[max(0.5rem,calc((100vw-400px)/2+0.5rem))]'
    : 'fixed bottom-[max(0.375rem,env(safe-area-inset-bottom))] right-2 z-[60] flex flex-col items-end gap-1.5 pointer-events-none';

  return (
    <div className={positionClass} aria-label="Quick actions">
      <button
        type="button"
        onClick={onOpenAssistant}
        className="pointer-events-auto flex items-center gap-1.5 pl-1.5 pr-2.5 py-1.5 rounded-full bg-[#C5A059] text-[#051F26] shadow-[0_4px_16px_rgba(197,160,89,0.4)] border border-[#b8924f]/35 hover:bg-[#d4ad6a] transition-all active:scale-[0.98]"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#051F26]/10 shrink-0">
          <Sparkles size={13} className="text-[#051F26]" strokeWidth={2.5} />
        </span>
        <span className="text-[9px] font-bold uppercase tracking-[0.05em] whitespace-nowrap">
          24/7 Assistant
        </span>
      </button>

      <button
        type="button"
        onClick={onOpenReport}
        className="pointer-events-auto flex items-center gap-1.5 pl-1.5 pr-2.5 py-1.5 rounded-full bg-[#0B4F5C] text-white shadow-[0_4px_16px_rgba(11,79,92,0.35)] border border-[#083a43]/40 hover:bg-[#083a43] transition-all active:scale-[0.98]"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/15 shrink-0">
          <AlertTriangle size={13} className="text-white" strokeWidth={2.5} />
        </span>
        <span className="text-[9px] font-bold uppercase tracking-[0.05em] whitespace-nowrap">
          Report Issue
        </span>
      </button>

      {whatsappHref && (
        <a
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          className="pointer-events-auto flex items-center gap-1.5 pl-1.5 pr-2.5 py-1.5 rounded-full bg-[#25D366] text-white shadow-[0_4px_16px_rgba(37,211,102,0.45)] border border-[#1da851]/50 hover:bg-[#20bd5a] transition-all active:scale-[0.98]"
          aria-label="Contact host on WhatsApp"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20 shrink-0">
            <MessageCircle size={13} className="text-white" strokeWidth={2.5} />
          </span>
          <span className="text-[9px] font-bold uppercase tracking-[0.05em] whitespace-nowrap">
            WhatsApp
          </span>
        </a>
      )}
    </div>
  );
}
