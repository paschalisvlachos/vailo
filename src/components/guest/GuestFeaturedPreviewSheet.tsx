import { useMemo, type ReactNode } from 'react';
import {
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
  Sparkles,
  Box,
  Wrench,
  MessageCircleQuestion,
  ShoppingBag,
  Bot,
  X,
} from 'lucide-react';
import {
  getFeaturedConfig,
  type FeaturedKey,
  type FeaturedPreviewsMap,
} from '../../lib/houseGuidePortal';
import { useGuestLocale } from '../../context/GuestLocaleContext';
import { resolveFeaturedDigest } from '../../lib/propertyContentLocales';
import GuestLinkifiedText from './GuestLinkifiedText';

const ICONS: Record<string, ReactNode> = {
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

type Props = {
  featuredKey: FeaturedKey | null;
  previews: FeaturedPreviewsMap;
  onClose: () => void;
  onAskAssistant: () => void;
};

export default function GuestFeaturedPreviewSheet({
  featuredKey,
  previews,
  onClose,
  onAskAssistant,
}: Props) {
  const { locale, contentPrimaryLocale, contentReviewedLocales } = useGuestLocale();

  const cfg = featuredKey ? getFeaturedConfig(featuredKey) : null;

  const digest = useMemo(() => {
    if (!featuredKey || !cfg) return '';
    const preview = previews?.[featuredKey] || {};
    return resolveFeaturedDigest(
      preview,
      locale,
      contentPrimaryLocale,
      contentReviewedLocales
    );
  }, [featuredKey, cfg, previews, locale, contentPrimaryLocale, contentReviewedLocales]);

  if (!featuredKey || !cfg) return null;

  const icon = ICONS[cfg.iconName] || <Sparkles size={20} />;

  return (
    <div
      className="fixed inset-0 z-[96] flex items-end sm:items-center justify-center bg-[#051F26]/60 backdrop-blur-sm p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="featured-preview-title"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-lg max-h-[min(85vh,640px)] rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-1 sm:hidden shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-200" aria-hidden />
        </div>

        <div className="px-5 pt-2 pb-4 border-b border-gray-100 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className="h-11 w-11 rounded-xl bg-[#F8FAFA] border border-gray-100 flex items-center justify-center shrink-0 text-[#0B4F5C]">
                {icon}
              </div>
              <div className="min-w-0">
                <h2
                  id="featured-preview-title"
                  className="font-luxury text-xl text-[#051F26] font-medium leading-tight"
                >
                  {cfg.title}
                </h2>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-gray-400 hover:text-[#0B4F5C] hover:bg-gray-50 shrink-0"
              aria-label="Close"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-5">
          {digest ? (
            <GuestLinkifiedText
              text={digest}
              className="text-base text-gray-600 whitespace-pre-wrap leading-relaxed"
            />
          ) : (
            <p className="text-base text-gray-500 italic">
              Your host has not added details for this section yet.
            </p>
          )}

          <button
            type="button"
            onClick={() => {
              onClose();
              onAskAssistant();
            }}
            className="guest-btn-action mt-6 w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gradient-to-r from-[#0B4F5C] to-[#083a43] text-[#C5A059] hover:from-[#083a43] hover:to-[#072d34] transition-colors"
          >
            <Bot size={13} className="shrink-0" />
            Ask the 24/7 Assistant for full details
          </button>
        </div>
      </div>
    </div>
  );
}
