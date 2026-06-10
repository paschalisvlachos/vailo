import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  BookOpen,
  Bot,
  Menu,
  Sparkles,
  Star,
  X,
  ChevronRight,
  Key,
  Zap,
  Lightbulb,
  Thermometer,
  Droplets,
  BedDouble,
  ChefHat,
  Flame,
  Waves,
  Wifi,
  WashingMachine,
  ScrollText,
  Trash2,
  ShieldAlert,
  Box,
  Wrench,
  MessageCircleQuestion,
  ShoppingBag,
} from 'lucide-react';
import type { GuestLocaleKey } from '../../lib/guestLocale';
import { GUEST_PORTAL_Z } from '../../lib/guestPortalLayers';
import {
  PORTAL_FEATURED_CAP,
  featuredKeyCategoryDescription,
  getFeaturedConfig,
  type FeaturedKey,
} from '../../lib/houseGuidePortal';

const MENU_BACKDROP_Z = GUEST_PORTAL_Z.navBackdrop;
const MENU_DRAWER_Z = GUEST_PORTAL_Z.navDrawer;

const FEATURED_ICONS: Record<string, ReactNode> = {
  Key: <Key size={20} />,
  Zap: <Zap size={20} />,
  Lightbulb: <Lightbulb size={20} />,
  Thermometer: <Thermometer size={20} />,
  Droplets: <Droplets size={20} />,
  BedDouble: <BedDouble size={20} />,
  ChefHat: <ChefHat size={20} />,
  Flame: <Flame size={20} />,
  Waves: <Waves size={20} />,
  Wifi: <Wifi size={20} />,
  WashingMachine: <WashingMachine size={20} />,
  ScrollText: <ScrollText size={20} />,
  Trash2: <Trash2 size={20} />,
  ShieldAlert: <ShieldAlert size={20} />,
  Sparkles: <Sparkles size={20} />,
  Box: <Box size={20} />,
  Wrench: <Wrench size={20} />,
  MessageCircleQuestion: <MessageCircleQuestion size={20} />,
  ShoppingBag: <ShoppingBag size={20} />,
};

type IconVariant = 'gold' | 'bot' | 'featured';

const ICON_STYLES: Record<IconVariant, string> = {
  gold: 'bg-gradient-to-br from-[#C5A059] to-[#8a6d2e] text-white shadow-[0_2px_12px_rgba(197,160,89,0.35)]',
  bot: 'bg-gradient-to-br from-[#5b6eae] to-[#3d4f8c] text-white shadow-[0_2px_12px_rgba(91,110,174,0.35)]',
  featured: 'bg-[#F8FAFA] border border-gray-100 text-[#0B4F5C]',
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  t: (key: GuestLocaleKey) => string;
  onLiveLikeLocal: () => void;
  onAssistant: () => void;
  onFeaturedPreview: (key: FeaturedKey) => void;
  featuredOnPortal: FeaturedKey[];
};

export default function GuestPortalNavMenu({
  open,
  onOpenChange,
  t,
  onLiveLikeLocal,
  onAssistant,
  onFeaturedPreview,
  featuredOnPortal,
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

  const featured = (featuredOnPortal || [])
    .filter((id) => getFeaturedConfig(id))
    .slice(0, PORTAL_FEATURED_CAP);

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
                  className="h-7 w-auto object-contain"
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
                <li>
                  <MenuRow
                    label={t('liveLikeLocal')}
                    sub={t('liveLikeLocalHeroSub')}
                    icon={<Sparkles size={20} strokeWidth={2} />}
                    iconVariant="gold"
                    onClick={() => {
                      close();
                      onLiveLikeLocal();
                    }}
                  />
                </li>

                <li>
                  <MenuRow
                    label={t('assistantProperty')}
                    sub={t('assistantPropertySub')}
                    icon={<Bot size={20} strokeWidth={2} />}
                    iconVariant="bot"
                    onClick={() => {
                      close();
                      onAssistant();
                    }}
                  />
                </li>

                {featured.length > 0 &&
                  featured.map((key, index) => {
                    const cfg = getFeaturedConfig(key);
                    if (!cfg) return null;
                    const icon = FEATURED_ICONS[cfg.iconName] || <BookOpen size={20} />;
                    return (
                      <li key={key} className={index === 0 ? 'pt-2' : undefined}>
                        <MenuRow
                          label={cfg.title}
                          sub={featuredKeyCategoryDescription(key)}
                          icon={icon}
                          iconVariant="featured"
                          showStar
                          onClick={() => {
                            close();
                            onFeaturedPreview(key);
                          }}
                        />
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

function MenuRow({
  label,
  sub,
  icon,
  iconVariant,
  showStar = false,
  onClick,
}: {
  label: string;
  sub: string;
  icon: ReactNode;
  iconVariant: IconVariant;
  showStar?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 p-3.5 min-h-[56px] rounded-2xl text-left hover:bg-[#0B4F5C]/[0.04] active:bg-[#0B4F5C]/[0.07] transition-colors group"
    >
      <span
        className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${ICON_STYLES[iconVariant]}`}
      >
        {icon}
        {showStar && (
          <Star
            size={11}
            className="absolute -top-1 -right-1 text-[#C5A059] fill-[#C5A059]"
            strokeWidth={2}
          />
        )}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-base font-semibold text-[#051F26] leading-tight">{label}</span>
        <span className="block text-xs text-gray-500 mt-0.5 leading-snug line-clamp-3">{sub}</span>
      </span>
      <ChevronRight
        size={18}
        className="text-gray-300 shrink-0 group-hover:text-[#C5A059] transition-colors"
      />
    </button>
  );
}
