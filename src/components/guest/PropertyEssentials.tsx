import { useState, type ReactNode } from 'react';
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
  ChevronDown,
  Bot,
} from 'lucide-react';
import {
  PORTAL_FEATURED_CAP,
  getFeaturedConfig,
  type FeaturedKey,
  type FeaturedPreviewsMap,
} from '../../lib/houseGuidePortal';
import { useGuestAnalytics } from '../../context/GuestAnalyticsContext';
import { useGuestLocale } from '../../context/GuestLocaleContext';
import { resolveFeaturedDigest } from '../../lib/propertyContentLocales';
import GuestLinkifiedText from './GuestLinkifiedText';

type Props = {
  featuredOnPortal: FeaturedKey[];
  previews: FeaturedPreviewsMap;
  onAskAssistant: () => void;
};

const ICONS: Record<string, ReactNode> = {
  Key: <Key size={18} />,
  Zap: <Zap size={18} />,
  Lightbulb: <Lightbulb size={18} />,
  Thermometer: <Thermometer size={18} />,
  Droplets: <Droplets size={18} />,
  BedDouble: <BedDouble size={18} />,
  ChefHat: <ChefHat size={18} />,
  Flame: <Flame size={18} />,
  Waves: <Waves size={18} />,
  Wifi: <Wifi size={18} />,
  WashingMachine: <WashingMachine size={18} />,
  ScrollText: <ScrollText size={18} />,
  Trash2: <Trash2 size={18} />,
  ShieldAlert: <ShieldAlert size={18} />,
  Sparkles: <Sparkles size={18} />,
  Box: <Box size={18} />,
  Wrench: <Wrench size={18} />,
  MessageCircleQuestion: <MessageCircleQuestion size={18} />,
  ShoppingBag: <ShoppingBag size={18} />,
};

export default function PropertyEssentials({
  featuredOnPortal,
  previews,
  onAskAssistant,
}: Props) {
  const [openKey, setOpenKey] = useState<FeaturedKey | null>(null);
  const { track } = useGuestAnalytics();
  const { t, locale, contentPrimaryLocale, contentReviewedLocales } = useGuestLocale();

  const featured: FeaturedKey[] = (featuredOnPortal || [])
    .filter((id) => getFeaturedConfig(id))
    .slice(0, PORTAL_FEATURED_CAP);

  if (featured.length === 0) return null;

  return (
    <section className="!mb-0">
      <div className="mb-4">
        <p className="guest-eyebrow mb-1">
          {t('essentials')}
        </p>
        <h2 className="guest-heading-section">
          {t('thingsToKnow')}
        </h2>
      </div>

      <div className="bg-white rounded-2xl shadow-[0_4px_24px_-8px_rgba(11,79,92,0.12)] border border-gray-100/80 overflow-hidden divide-y divide-gray-50">
        {featured.map((key) => {
          const cfg = getFeaturedConfig(key);
          if (!cfg) return null;
          const preview = previews?.[key] || {};
          const digest = resolveFeaturedDigest(
            preview,
            locale,
            contentPrimaryLocale,
            contentReviewedLocales
          );
          const icon = ICONS[cfg.iconName] || <Sparkles size={18} />;
          const isOpen = openKey === key;

          return (
            <div key={key}>
              <button
                type="button"
                onClick={() => {
                  setOpenKey((prev) => {
                    const next = prev === key ? null : key;
                    if (next === key) {
                      track('guide_accordion_open', { sectionKey: key });
                    }
                    return next;
                  });
                }}
                className="w-full flex items-center p-4 min-h-[52px] text-left hover:bg-[#0B4F5C]/[0.02] transition-colors group"
                aria-expanded={isOpen}
              >
                <div className="h-10 w-10 rounded-xl bg-[#F8FAFA] border border-gray-100 flex items-center justify-center mr-4 shrink-0 text-[#0B4F5C] group-hover:border-[#0B4F5C]/20 transition-all">
                  {icon}
                </div>
                <span
                  className={`flex-1 font-luxury text-base transition-colors ${
                    isOpen ? 'text-[#0B4F5C] font-medium' : 'text-gray-800'
                  }`}
                >
                  {cfg.title}
                </span>
                <div
                  className={`p-1.5 rounded-full transition-all ${
                    isOpen
                      ? 'bg-[#0B4F5C] text-white rotate-180'
                      : 'text-gray-300 group-hover:text-gray-400'
                  }`}
                >
                  <ChevronDown size={16} />
                </div>
              </button>

              <div
                className={`transition-all duration-300 ease-in-out overflow-hidden ${
                  isOpen ? 'max-h-[800px] opacity-100' : 'max-h-0 opacity-0'
                }`}
              >
                <div className="px-5 pb-5">
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
                    onClick={(e) => {
                      e.stopPropagation();
                      onAskAssistant();
                    }}
                    className="guest-btn-action mt-4 w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gradient-to-r from-[#0B4F5C] to-[#083a43] text-[#C5A059] hover:from-[#083a43] hover:to-[#072d34] transition-colors"
                  >
                    <Bot size={13} className="shrink-0" />
                    Ask the 24/7 Assistant for full details
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
