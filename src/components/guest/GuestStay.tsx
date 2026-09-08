import { useMemo, useState, type ReactNode } from 'react';
import {
  Check,
  ChevronRight,
  Clock,
  Copy,
  Eye,
  EyeOff,
  Globe,
  MapPin,
  MessageCircle,
  Wifi,
} from 'lucide-react';
import GuestLanguageMenu from './GuestLanguageMenu';
import MirroredPhotoImg from '../shared/MirroredPhotoImg';
import GuestFeaturedPreviewSheet from './GuestFeaturedPreviewSheet';
import { useGuestLocale } from '../../context/GuestLocaleContext';
import { openExternalUrl } from '../../lib/geocoding';
import { getGuideTextValue } from '../../lib/houseGuideLocales';
import {
  FEATURED_CONFIGS,
  featuredKeyHasPortalContent,
  getFeaturedConfig,
  resolveFeaturedDigestForPortal,
  type FeaturedKey,
  type FeaturedPreviewsMap,
} from '../../lib/houseGuidePortal';
import { resolveFeaturedPreviewLine } from '../../lib/propertyContentLocales';
import type { GuestLocale } from '../../lib/guestLocale';
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
  WashingMachine,
  ScrollText,
  Trash2,
  ShieldAlert,
  Sparkles,
  Box,
  Wrench,
  MessageCircleQuestion,
  ShoppingBag,
  Car,
  Info,
  Leaf,
} from 'lucide-react';

const GLASS =
  'relative z-30 flex items-center justify-center h-10 w-10 min-h-[40px] min-w-[40px] rounded-full bg-[#0A2F32]/45 backdrop-blur-md border border-[#D4B57A]/35 ring-1 ring-inset ring-white/10 text-white shadow-[0_4px_14px_rgba(0,0,0,0.18)] hover:bg-[#0A2F32]/60 transition-all';

const HERO_TEXT =
  'mt-5 mb-3 text-center [text-shadow:0_2px_18px_rgba(0,0,0,0.7),0_1px_4px_rgba(0,0,0,0.55)]';

type LocaleOption = { code: string; label: string; nativeLabel: string };

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
  Car: <Car size={18} />,
  Info: <Info size={18} />,
  Leaf: <Leaf size={18} />,
};

type Props = {
  heroPhoto: string;
  propertyId: string;
  typeId: string;
  googlePlaceId?: string;
  locale: GuestLocale;
  setLocale: (locale: GuestLocale) => void;
  localeOptions: LocaleOption[];
  hasPropertyCoords: boolean;
  onOpenMap: () => void;
  websiteUrl: string | null;
  googleRating?: number;
  googleReviewUrl?: string | null;
  wifiName?: string;
  wifiPassword?: string;
  copiedWifi: boolean;
  onCopyWifi: () => void;
  guide?: Record<string, unknown> | null;
  checkoutDateLabel?: string | null;
  featuredPreviews: FeaturedPreviewsMap;
  whatsappHref?: string | null;
  onAssistant: () => void;
  onOverlayOpenChange?: (open: boolean) => void;
};

function extractTimeFromText(text: string, allowBareHour = false): string | null {
  const time = String.raw`\d{1,2}(?::\d{2})?\s*(?:[ap]\.?m\.?)?`;
  const range = text.match(new RegExp(`(${time})\\s*(?:[-–—]|to|until)\\s*(${time})`, 'i'));
  if (range) return `${range[1].trim()} – ${range[2].trim()}`;
  const single = text.match(
    /\b(\d{1,2}:\d{2}\s*(?:[ap]\.?m\.?)?|\d{1,2}\s*(?:[ap]\.?m\.?))\b/i
  );
  if (single?.[1]) return single[1].trim();
  if (allowBareHour) {
    const bare = text.match(/\b([01]?\d|2[0-3])\b/);
    if (bare?.[1]) return bare[1];
  }
  return null;
}

function extractCheckoutTime(text: string, allowUnlabelled: boolean): string | null {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return null;
  const checkoutContext = clean.match(
    /(?:check\s*[- ]?\s*out|departure|departing|vacate|leaving|abreise|auschecken|départ|partenza|salida|αναχώρηση)[^.!?]{0,100}/gi
  );
  for (const segment of checkoutContext || []) {
    const value = extractTimeFromText(segment, true);
    if (value) return value;
  }
  return allowUnlabelled ? extractTimeFromText(clean) : null;
}

export default function GuestStay({
  heroPhoto,
  propertyId,
  typeId,
  googlePlaceId,
  locale,
  setLocale,
  localeOptions,
  hasPropertyCoords,
  onOpenMap,
  websiteUrl,
  googleRating,
  googleReviewUrl,
  wifiName,
  wifiPassword,
  copiedWifi,
  onCopyWifi,
  guide,
  checkoutDateLabel,
  featuredPreviews,
  whatsappHref,
  onAssistant,
  onOverlayOpenChange,
}: Props) {
  const { t, contentPrimaryLocale, contentReviewedLocales } = useGuestLocale();
  const showLanguage = localeOptions.length > 1;
  const [wifiVisible, setWifiVisible] = useState(false);
  const [selectedKey, setSelectedKey] = useState<FeaturedKey | null>(null);

  const checkoutWindow = useMemo(() => {
    if (!guide) return null;
    const checkoutTexts = [
      getGuideTextValue(guide, 'checkoutInfo', locale, contentPrimaryLocale),
      getGuideTextValue(guide, 'checkoutInfo', contentPrimaryLocale, contentPrimaryLocale),
      getGuideTextValue(guide, 'arrivalInfo', locale, contentPrimaryLocale),
    ].filter(Boolean) as string[];
    for (const text of checkoutTexts) {
      const labelled = extractCheckoutTime(text, false);
      if (labelled) return labelled;
    }
    for (const text of checkoutTexts) {
      const any = extractCheckoutTime(text, true);
      if (any) return any;
    }
    return null;
  }, [guide, locale, contentPrimaryLocale]);

  const categoryKeys = useMemo(() => {
    if (!guide) return [] as FeaturedKey[];
    return FEATURED_CONFIGS.map((c) => c.id).filter((key) => {
      if (!featuredKeyHasPortalContent(key, guide, contentPrimaryLocale)) return false;
      const preview = featuredPreviews?.[key] || {};
      const previewLine = resolveFeaturedPreviewLine(
        preview,
        locale,
        contentPrimaryLocale,
        contentReviewedLocales
      );
      const digest = resolveFeaturedDigestForPortal(
        key,
        preview,
        guide,
        locale,
        contentPrimaryLocale,
        contentReviewedLocales
      );
      return Boolean(digest.trim() || previewLine.trim());
    });
  }, [guide, featuredPreviews, locale, contentPrimaryLocale, contentReviewedLocales]);

  const openSheet = (key: FeaturedKey) => {
    setSelectedKey(key);
    onOverlayOpenChange?.(true);
  };

  const closeSheet = () => {
    setSelectedKey(null);
    onOverlayOpenChange?.(false);
  };

  return (
    <>
      <div className="guest-mobile fixed inset-0 z-50 flex flex-col bg-[#F7F7F5] pb-[calc(4.75rem+env(safe-area-inset-bottom,0px))] md:relative md:h-[800px] md:rounded-3xl md:overflow-hidden md:shadow-2xl md:border md:border-[#0A2F32]/10">
        <div className="flex-1 min-h-0 overflow-y-auto">
          <section className="relative min-h-[14.5rem] overflow-hidden sm:min-h-[15.5rem]">
            {heroPhoto ? (
              <MirroredPhotoImg
                src={heroPhoto}
                alt=""
                className="absolute inset-0 h-full w-full scale-[1.02] object-cover object-center"
                mirrorContext={{ propertyId, propertyTypeId: typeId, googlePlaceId }}
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-[#0A3D3A] via-[#08332F] to-[#041C1E]" />
            )}
            <div aria-hidden className="absolute inset-0 bg-[#041C1E]/42" />

            <div className="relative z-10 mx-auto flex min-h-[14.5rem] max-w-[576px] flex-col px-3 pt-3 pb-10 sm:min-h-[15.5rem]">
              <div className="grid grid-cols-[1fr_auto_1fr] items-center">
                <div className="justify-self-start">
                  {googleReviewUrl && googleRating != null && googleRating > 0 && (
                    <GoogleRatingButton rating={googleRating} reviewUrl={googleReviewUrl} />
                  )}
                </div>
                <img
                  src="/vailoLogo.png"
                  alt="Vailo"
                  className="h-9 w-[5.5rem] object-contain drop-shadow-[0_2px_8px_rgba(0,0,0,0.35)]"
                />
                <div className="justify-self-end flex items-center gap-1.5">
                  {showLanguage && (
                    <GuestLanguageMenu
                      locale={locale}
                      onChange={setLocale}
                      options={localeOptions}
                      compact
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => hasPropertyCoords && onOpenMap()}
                    disabled={!hasPropertyCoords}
                    className={`${GLASS} disabled:opacity-40 disabled:pointer-events-none`}
                    aria-label={t('map')}
                  >
                    <MapPin size={15} className="text-[#E8D5A8]" />
                  </button>
                  {websiteUrl && (
                    <button
                      type="button"
                      onClick={() => openExternalUrl(websiteUrl)}
                      className={GLASS}
                      aria-label="Website"
                    >
                      <Globe size={15} className="text-[#E8D5A8]" />
                    </button>
                  )}
                </div>
              </div>

              <div className={HERO_TEXT}>
                <h1 className="font-luxury text-[2.35rem] text-white leading-[0.95] font-medium tracking-[-0.025em]">
                  Your Stay
                </h1>
                <p className="mt-2 text-[15px] font-semibold text-white">
                  Everything you need
                </p>
                <p className="mt-1.5 text-[12px] text-white/90">
                  for a smooth and comfortable stay.
                </p>
              </div>
            </div>
          </section>

          <div className="relative z-10 -mt-6 rounded-t-[2rem] bg-[#F7F7F5] px-[clamp(18px,6.6vw,38px)] pb-6 pt-5 space-y-5 shadow-[0_-8px_24px_-18px_rgba(4,28,30,0.25)]">
            <div
              className={`grid gap-3 ${
                wifiName && checkoutWindow ? 'grid-cols-2' : 'grid-cols-1'
              }`}
            >
              {wifiName && (
                <div className="min-h-[80px] rounded-[0.9rem] border border-[#EEEAE3] bg-white px-2.5 py-2.5 flex items-center gap-2.5 shadow-[0_8px_22px_-15px_rgba(10,47,50,0.28)]">
                  <span className="h-10 w-10 rounded-full bg-[#F1EDE5] text-[#0A3330] flex items-center justify-center shrink-0">
                    <Wifi size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-semibold text-[#0A2F32] leading-tight">Wi-Fi</p>
                    <p className="text-[12px] text-[#5F5B54] truncate mt-0.5">{wifiName}</p>
                    {wifiPassword && (
                      <p className="text-[12px] tracking-[0.18em] text-[#0A2F32] truncate mt-0.5">
                        {wifiVisible ? wifiPassword : '••••••••'}
                      </p>
                    )}
                  </div>
                  {wifiPassword && (
                    <div className="flex items-center gap-0">
                      <button
                        type="button"
                        onClick={() => setWifiVisible((v) => !v)}
                        className="p-1 rounded-lg text-[#0A3330] hover:bg-[#0A3330]/5"
                        aria-label={wifiVisible ? 'Hide password' : 'Show password'}
                      >
                        {wifiVisible ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                      <button
                        type="button"
                        onClick={onCopyWifi}
                        className={`p-1 rounded-lg ${
                          copiedWifi
                            ? 'text-emerald-600'
                            : 'text-[#0A3330] hover:bg-[#0A3330]/5'
                        }`}
                        aria-label="Copy Wi-Fi password"
                      >
                        {copiedWifi ? <Check size={14} /> : <Copy size={14} />}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {checkoutWindow && (
                <div className="min-h-[80px] rounded-[0.9rem] border border-[#EEEAE3] bg-white px-2.5 py-2.5 flex items-center gap-2.5 shadow-[0_8px_22px_-15px_rgba(10,47,50,0.28)]">
                  <span className="h-10 w-10 rounded-full bg-[#F1EDE5] text-[#0A3330] flex items-center justify-center shrink-0">
                    <Clock size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-semibold text-[#0A2F32] leading-tight">
                      Check-out
                    </p>
                    <p className="text-[12px] text-[#0A2F32] truncate mt-1">{checkoutWindow}</p>
                    {checkoutDateLabel && (
                      <p className="text-[11px] text-[#9A968E] mt-0.5">{checkoutDateLabel}</p>
                    )}
                  </div>
                  <ChevronRight size={14} className="text-[#AAA69F] shrink-0" />
                </div>
              )}
            </div>

            {categoryKeys.length > 0 && (
              <section className="rounded-[1rem] border border-[#EEEAE3] bg-white shadow-[0_8px_22px_-14px_rgba(10,47,50,0.28)] overflow-hidden">
                <div className="px-3.5 pt-3.5 pb-2">
                  <h2 className="text-[15px] font-semibold text-[#0A2F32]">Things to know</h2>
                </div>
                <div className="divide-y divide-[#F0EBE3]">
                  {categoryKeys.map((key) => {
                    const cfg = getFeaturedConfig(key);
                    if (!cfg) return null;
                    const preview = featuredPreviews?.[key] || {};
                    const previewLine = resolveFeaturedPreviewLine(
                      preview,
                      locale,
                      contentPrimaryLocale,
                      contentReviewedLocales
                    );
                    const icon = ICONS[cfg.iconName] || <Sparkles size={18} />;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => openSheet(key)}
                        className="w-full flex items-center gap-3 px-3.5 py-3 text-left hover:bg-[#FCFAF6] transition-colors"
                      >
                        <span className="h-10 w-10 rounded-xl bg-[#F7F3EC] border border-[#E8DFD0] text-[#0A3330] flex items-center justify-center shrink-0">
                          {icon}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[15px] font-semibold text-[#0A2F32]">
                            {cfg.title}
                          </span>
                          {previewLine.trim() && (
                            <span className="block mt-0.5 text-[13px] text-[#7A7266] leading-snug line-clamp-1">
                              {previewLine.trim()}
                            </span>
                          )}
                        </span>
                        <ChevronRight size={16} className="text-[#9A968E] shrink-0" />
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            <button
              type="button"
              onClick={() => {
                if (whatsappHref) openExternalUrl(whatsappHref);
                else onAssistant();
              }}
              className="w-full rounded-[1rem] border border-[#EEEAE3] bg-white px-3.5 py-3.5 flex items-center gap-3 text-left shadow-[0_8px_22px_-14px_rgba(10,47,50,0.28)]"
            >
              <span className="h-11 w-11 rounded-full bg-[#0A4544] text-white flex items-center justify-center shrink-0">
                <MessageCircle size={18} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold text-[#0A2F32]">Contact host</span>
                <span className="block text-[13px] text-[#7A7266] mt-0.5 leading-snug">
                  {whatsappHref
                    ? 'Message your host on WhatsApp.'
                    : 'Ask Vailo — your 24/7 stay assistant.'}
                </span>
              </span>
              <span className="shrink-0 inline-flex items-center gap-1 rounded-full border border-[#C5A059]/55 px-3 py-1.5 text-[12px] font-semibold text-[#8B6914]">
                {whatsappHref ? 'WhatsApp' : 'Start chat'}
                <ChevronRight size={14} />
              </span>
            </button>
          </div>
        </div>
      </div>

      {selectedKey && (
        <GuestFeaturedPreviewSheet
          featuredKey={selectedKey}
          previews={featuredPreviews}
          guideData={guide || undefined}
          onClose={closeSheet}
          onAskAssistant={() => {
            closeSheet();
            onAssistant();
          }}
        />
      )}
    </>
  );
}

function GoogleRatingButton({
  rating,
  reviewUrl,
}: {
  rating: number;
  reviewUrl: string;
}) {
  return (
    <button
      type="button"
      onClick={() => openExternalUrl(reviewUrl)}
      className="relative z-30 flex h-10 min-h-[40px] items-center gap-1.5 rounded-full border border-[#D4B57A]/35 bg-[#0A2F32]/55 px-2.5 text-white shadow-[0_4px_14px_rgba(0,0,0,0.18)] ring-1 ring-inset ring-white/10 backdrop-blur-md transition-all hover:bg-[#0A2F32]/70"
      aria-label={`Google rating ${rating.toFixed(1)}. Open Google reviews`}
    >
      <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" aria-hidden>
        <path fill="#4285F4" d="M22.6 12.3c0-.8-.1-1.5-.2-2.3H12v4.3h5.9a5 5 0 0 1-2.2 3.3v2.8h3.6c2.1-2 3.3-4.8 3.3-8.1Z" />
        <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.6l-3.6-2.8c-1 .7-2.2 1.1-3.7 1.1a6.5 6.5 0 0 1-6.2-4.5H2.2V17A11 11 0 0 0 12 23Z" />
        <path fill="#FBBC05" d="M5.8 14.2a6.5 6.5 0 0 1 0-4.2V7.1H2.2A11 11 0 0 0 1 12c0 1.8.4 3.5 1.2 5l3.6-2.8Z" />
        <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.5 4.2 1.6l3.2-3.1A10.7 10.7 0 0 0 2.2 7.1L5.8 10A6.5 6.5 0 0 1 12 5.4Z" />
      </svg>
      <span className="text-[13px] font-semibold tabular-nums">{rating.toFixed(1)}</span>
      <span className="text-[#E7C46F]">★</span>
    </button>
  );
}
