import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { BookOpen, Bot, Menu, Sparkles, X, ChevronRight } from 'lucide-react';
import type { GuestLocaleKey } from '../../lib/guestLocale';
import { GUEST_PORTAL_Z } from '../../lib/guestPortalLayers';

const MENU_BACKDROP_Z = GUEST_PORTAL_Z.navBackdrop;
const MENU_DRAWER_Z = GUEST_PORTAL_Z.navDrawer;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  t: (key: GuestLocaleKey) => string;
  onLiveLikeLocal: () => void;
  onHouseGuide: () => void;
  onAssistant: () => void;
  houseGuideMenuSub: string;
};

export default function GuestPortalNavMenu({
  open,
  onOpenChange,
  t,
  onLiveLikeLocal,
  onHouseGuide,
  onAssistant,
  houseGuideMenuSub,
}: Props) {
  const close = () => onOpenChange(false);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const items = [
    {
      id: 'live-like-local',
      label: t('liveLikeLocal'),
      sub: t('liveLikeLocalSub'),
      icon: Sparkles,
      onClick: () => {
        close();
        onLiveLikeLocal();
      },
    },
    {
      id: 'house-guide',
      label: t('houseGuide'),
      sub: houseGuideMenuSub,
      icon: BookOpen,
      onClick: () => {
        close();
        onHouseGuide();
      },
    },
    {
      id: 'assistant',
      label: t('assistantProperty'),
      sub: t('assistantPropertySub'),
      icon: Bot,
      onClick: () => {
        close();
        onAssistant();
      },
    },
  ] as const;

  const menuLayer =
    open && typeof document !== 'undefined'
      ? createPortal(
          <>
            <div
              className={`fixed inset-0 ${MENU_BACKDROP_Z} bg-[#051F26]/55 backdrop-blur-md`}
              role="presentation"
              aria-hidden
              onClick={close}
            />
            <nav
              className={`fixed top-0 left-0 ${MENU_DRAWER_Z} h-full w-[min(100vw,320px)] bg-white shadow-2xl flex flex-col transition-transform duration-300 ease-out translate-x-0`}
              aria-label={t('portalMenu')}
            >
              <div className="flex items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-4 border-b border-gray-100">
                <img
                  src="/vailoLogo.png"
                  alt="Vailo"
                  className="h-6 w-auto"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
                <button
                  type="button"
                  onClick={close}
                  className="p-2 rounded-xl text-gray-400 hover:text-[#0B4F5C] hover:bg-gray-50"
                  aria-label={t('portalMenuClose')}
                >
                  <X size={22} />
                </button>
              </div>

              <ul className="flex-1 overflow-y-auto py-3 px-3 space-y-1">
                {items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={item.onClick}
                        className="w-full flex items-center gap-3 p-3.5 min-h-[56px] rounded-2xl text-left hover:bg-[#0B4F5C]/[0.04] active:bg-[#0B4F5C]/[0.07] transition-colors group"
                      >
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#0B4F5C] to-[#083a43] text-[#C5A059] shadow-sm">
                          <Icon size={20} strokeWidth={2} />
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-base font-semibold text-[#051F26] leading-tight">
                            {item.label}
                          </span>
                          <span className="block text-xs text-gray-500 mt-0.5 leading-snug line-clamp-3">
                            {item.sub}
                          </span>
                        </span>
                        <ChevronRight
                          size={18}
                          className="text-gray-300 shrink-0 group-hover:text-[#C5A059] transition-colors"
                        />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </>,
          document.body
        )
      : null;

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onOpenChange(true);
        }}
        className="relative z-30 flex items-center justify-center h-10 w-10 min-h-[40px] min-w-[40px] rounded-full bg-white/12 backdrop-blur-md border border-white/25 text-white hover:bg-white/20 transition-all"
        aria-label={t('portalMenu')}
        aria-expanded={open}
      >
        <Menu size={18} className="text-[#C5A059]" strokeWidth={2.25} />
      </button>
      {menuLayer}
    </>
  );
}
