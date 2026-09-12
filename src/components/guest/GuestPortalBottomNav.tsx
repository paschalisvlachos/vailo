import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Compass, ShoppingBag, Sparkles } from 'lucide-react';

export type GuestPortalNavTab = 'home' | 'book' | 'assistant' | 'explore' | 'stay';

/** Space to leave above the fixed bottom bar (bar + Ask Vailo overhang + safe area). */
export const GUEST_BOTTOM_NAV_CONTENT_PAD =
  'pb-[calc(5rem+env(safe-area-inset-bottom,0px))]';

type Props = {
  activeTab: GuestPortalNavTab;
  isMobileFramePreview?: boolean;
  onHome: () => void;
  onAssistant: () => void;
  onBook?: () => void;
  onExplore?: () => void;
  onStay?: () => void;
};

export default function GuestPortalBottomNav({
  activeTab,
  isMobileFramePreview = false,
  onHome,
  onAssistant,
  onBook,
  onExplore,
  onStay,
}: Props) {
  const nav = (
    <nav
      className={
        isMobileFramePreview
          ? 'absolute inset-x-0 bottom-0 z-[60] bg-[#0A2F32] text-white/70 pt-2.5 pb-[max(0.45rem,env(safe-area-inset-bottom,0px))] md:rounded-b-[32px]'
          : // Avoid transform centering (left-1/2 -translate-x-1/2) — breaks fixed bottom bars on some mobile WebKits.
            'fixed inset-x-0 bottom-0 z-[60] mx-auto w-full max-w-[576px] bg-[#0A2F32] text-white/70 pt-2.5 pb-[max(0.45rem,env(safe-area-inset-bottom,0px))]'
      }
      aria-label="Guest portal navigation"
    >
      <div className="px-3 grid grid-cols-5 items-end">
        <NavItem label="Home" active={activeTab === 'home'} icon={<HomeGlyph />} onClick={onHome} />
        <NavItem label="Book" active={activeTab === 'book'} icon={<ShoppingBag size={19} strokeWidth={1.75} />} onClick={onBook} />
        <button
          type="button"
          onClick={onAssistant}
          className={`flex min-h-[44px] flex-col items-center -mt-7 ${
            activeTab === 'assistant' ? 'text-[#D4B57A]' : 'text-white/80'
          }`}
          aria-label="Open Ask Vailo 24/7 assistant"
        >
          <div
            className={`h-[3.35rem] w-[3.35rem] rounded-full bg-[#0A3330] border-[3px] flex items-center justify-center shadow-[0_10px_22px_rgba(4,28,30,0.4)] ${
              activeTab === 'assistant' ? 'border-[#D4B57A]' : 'border-[#F7F7F5]'
            }`}
          >
            <Sparkles size={18} className="text-[#E8D5A8]" />
          </div>
          <span className="text-[12px] font-medium mt-1">Ask Vailo</span>
        </button>
        <NavItem
          label="Explore"
          active={activeTab === 'explore'}
          icon={<Compass size={19} strokeWidth={1.75} />}
          onClick={onExplore}
        />
        <NavItem
          label="Stay"
          active={activeTab === 'stay'}
          icon={<StayGlyph />}
          onClick={onStay}
        />
      </div>
    </nav>
  );

  // Portal out of overflow/transform ancestors so fixed positioning tracks the viewport.
  if (!isMobileFramePreview && typeof document !== 'undefined') {
    return createPortal(nav, document.body);
  }

  return nav;
}

function NavItem({
  label,
  icon,
  active = false,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  active?: boolean;
  onClick?: () => void;
}) {
  const className = `flex min-h-[44px] flex-col items-center justify-end gap-1 pb-0.5 ${
    active ? 'text-[#D4B57A]' : 'text-white/75'
  }`;

  if (!onClick) {
    return (
      <div className={className}>
        {icon}
        <span className="text-[12px] font-medium">{label}</span>
      </div>
    );
  }

  return (
    <button type="button" onClick={onClick} className={className} aria-label={label}>
      {icon}
      <span className="text-[12px] font-medium">{label}</span>
    </button>
  );
}

function StayGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4.5 8.5h15v10.2A1.8 1.8 0 0 1 17.7 20.5H6.3A1.8 1.8 0 0 1 4.5 18.7V8.5Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M8 8.5V7.2A2.7 2.7 0 0 1 10.7 4.5h2.6A2.7 2.7 0 0 1 16 7.2V8.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M12 11.2v5.2M12 11.2l-2 2M12 11.2l2 2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function HomeGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M4.4 10.7 12 4.2l7.6 6.5c.3.26.4.7.25 1.08A.9.9 0 0 1 19 12.4h-.7V19a1.1 1.1 0 0 1-1.1 1.1h-4.1v-5.2h-2.2v5.2H6.8A1.1 1.1 0 0 1 5.7 19v-6.6H5a.9.9 0 0 1-.85-.62.95.95 0 0 1 .25-1.08Z" />
    </svg>
  );
}
