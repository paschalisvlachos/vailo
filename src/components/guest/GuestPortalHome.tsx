import { useMemo, useState, type ReactNode } from 'react';
import {
  BookOpen,
  Car,
  Check,
  CheckCircle2,
  ChefHat,
  ChevronRight,
  Clock,
  Compass,
  Copy,
  Eye,
  EyeOff,
  Flower2,
  Globe,
  Grid2x2,
  MapPin,
  Shield,
  ShoppingBag,
  Sparkles,
  Star,
  Trophy,
  Wifi,
} from 'lucide-react';
import GuestLanguageMenu from './GuestLanguageMenu';
import PropertyEssentials from './PropertyEssentials';
import GuestLocalServices, { type GuestPortalFeature } from './GuestLocalServices';
import MirroredPhotoImg from '../shared/MirroredPhotoImg';
import { openExternalUrl } from '../../lib/geocoding';
import { getGuideTextValue } from '../../lib/houseGuideLocales';
import { useGuestLocale } from '../../context/GuestLocaleContext';
import type { FeaturedKey, FeaturedPreviewsMap } from '../../lib/houseGuidePortal';
import type { GuestLocale, GuestLocaleKey } from '../../lib/guestLocale';

type LocaleOption = { code: string; label: string; nativeLabel: string };

type Props = {
  t: (key: GuestLocaleKey) => string;
  locale: GuestLocale;
  setLocale: (locale: GuestLocale) => void;
  localeOptions: LocaleOption[];
  isMobileFramePreview: boolean;
  propertyName?: string;
  propertyTypeName?: string;
  heroPhoto: string;
  heroLocation: string;
  propertyId: string | null;
  typeId: string | null;
  googlePlaceId?: string;
  featuredOnPortal: FeaturedKey[];
  featuredPreviews: FeaturedPreviewsMap;
  onLiveLikeLocal: () => void;
  onAssistant: () => void;
  showExcursions: boolean;
  onExcursions: () => void;
  excursionHeroUrl?: string;
  liveLikeLocalHeroUrl?: string;
  hasPropertyCoords: boolean;
  onOpenMap: () => void;
  websiteUrl: string | null;
  googleRating?: number;
  googleReviewUrl?: string | null;
  whatsappHref?: string | null;
  pwaBanner: ReactNode;
  showCheckInPromo: boolean;
  checkInComplete: boolean;
  checkInContinue: boolean;
  onOpenCheckIn: () => void;
  wifiName?: string;
  wifiPassword?: string;
  copiedWifi: boolean;
  onCopyWifi: () => void;
  guide?: Record<string, unknown> | null;
  checkoutDateLabel?: string | null;
  portalFeatures: GuestPortalFeature[];
  onServiceDetailOpenChange: (open: boolean) => void;
  legalFooter?: ReactNode;
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

const BOOK_ARRANGE_TILES = [
  { label: 'Transfers', icon: Car },
  { label: 'Car rental', icon: Car },
  { label: 'Private chef', icon: ChefHat },
  { label: 'Wellness', icon: Flower2 },
  { label: 'More', icon: Grid2x2 },
] as const;

const GLASS =
  'relative z-30 flex items-center justify-center h-10 w-10 min-h-[40px] min-w-[40px] rounded-full bg-[#0A2F32]/45 backdrop-blur-md border border-[#D4B57A]/35 ring-1 ring-inset ring-white/10 text-white shadow-[0_4px_14px_rgba(0,0,0,0.18)] hover:bg-[#0A2F32]/60 transition-all';

export default function GuestPortalHome(props: Props) {
  const {
    t,
    locale,
    setLocale,
    localeOptions,
    isMobileFramePreview,
    propertyName,
    propertyTypeName,
    heroPhoto,
    heroLocation,
    propertyId,
    typeId,
    googlePlaceId,
    featuredOnPortal,
    featuredPreviews,
    onLiveLikeLocal,
    onAssistant,
    showExcursions,
    onExcursions,
    excursionHeroUrl,
    liveLikeLocalHeroUrl,
    hasPropertyCoords,
    onOpenMap,
    websiteUrl,
    googleRating,
    googleReviewUrl,
    whatsappHref,
    pwaBanner,
    showCheckInPromo,
    checkInComplete,
    onOpenCheckIn,
    wifiName,
    wifiPassword,
    copiedWifi,
    onCopyWifi,
    guide,
    checkoutDateLabel,
    portalFeatures,
    onServiceDetailOpenChange,
    legalFooter,
  } = props;

  const { contentPrimaryLocale } = useGuestLocale();
  const [wifiVisible, setWifiVisible] = useState(false);
  const [thingsOpen, setThingsOpen] = useState(false);
  const column = 'w-full max-w-[576px]';
  const contentPadding = 'px-[clamp(18px,6.6vw,38px)]';

  const checkoutWindow = useMemo(() => {
    if (!guide) return null;
    const checkoutTexts = [
      getGuideTextValue(guide, 'checkoutInfo', locale, contentPrimaryLocale),
      getGuideTextValue(guide, 'checkoutInfo', contentPrimaryLocale, contentPrimaryLocale),
    ];
    const arrivalTexts = [
      getGuideTextValue(guide, 'arrivalInfo', locale, contentPrimaryLocale),
      getGuideTextValue(guide, 'arrivalInfo', contentPrimaryLocale, contentPrimaryLocale),
    ];

    for (const text of checkoutTexts) {
      const value = extractCheckoutTime(text, true);
      if (value) return value;
    }
    for (const text of arrivalTexts) {
      const value = extractCheckoutTime(text, false);
      if (value) return value;
    }
    return null;
  }, [guide, locale, contentPrimaryLocale]);

  const showLanguage = localeOptions.length > 1;

  return (
    <>
      <section className="relative z-10 mx-auto w-full max-w-[576px]">
        <div
          className={`relative bg-[#F7F7F5] ${
            isMobileFramePreview ? 'md:rounded-t-[30px] overflow-hidden' : ''
          }`}
        >
          <div className="absolute inset-x-0 top-0 z-0 h-[212px] overflow-hidden">
            {heroPhoto ? (
              <MirroredPhotoImg
                src={heroPhoto}
                alt={propertyTypeName || propertyName || 'Your stay'}
                className="w-full h-full object-cover object-[center_32%]"
                mirrorContext={
                  propertyId && typeId
                    ? { propertyId, propertyTypeId: typeId, googlePlaceId }
                    : undefined
                }
                fallback={<div className="w-full h-full bg-gradient-to-br from-[#0A3D3A] via-[#08332F] to-[#041C1E]" />}
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-[#0A3D3A] via-[#08332F] to-[#041C1E]" />
            )}
            <div className="absolute inset-0 bg-gradient-to-b from-[#041C1E]/50 via-[#041C1E]/5 to-[#041C1E]/20" />
          </div>

          <div className={`relative z-10 mx-auto px-3 pt-3 flex flex-col ${column}`}>
            <div className="hidden">{pwaBanner}</div>

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

            <div className="mt-5 mb-5 text-center hero-text-shadow">
              <p className="text-[12px] font-semibold uppercase tracking-[0.28em] text-[#D4B57A] mb-1.5">
                {t('welcomeTo')}
              </p>
              <h1 className="font-luxury text-[2.35rem] text-white leading-[0.95] font-medium tracking-[-0.025em]">
                {propertyName}
              </h1>
              {heroLocation && (
                <p className="text-white/90 text-[14px] mt-2 flex items-center justify-center gap-1.5">
                  <MapPin size={14} className="text-[#D4B57A] shrink-0" /> {heroLocation}
                </p>
              )}
            </div>

            {showCheckInPromo && (
              <button
                type="button"
                onClick={onOpenCheckIn}
                className="relative isolate overflow-hidden mx-[clamp(6px,4.5vw,26px)] min-h-[118px] text-left rounded-[1.25rem] border border-[#C5A059]/45 bg-[#004845] px-3.5 py-3.5 mb-3 shadow-[0_14px_28px_-12px_rgba(4,28,30,0.58)]"
              >
                {heroPhoto && (
                  <img
                    src={heroPhoto}
                    alt=""
                    aria-hidden
                    className="pointer-events-none absolute inset-0 -z-20 h-full w-full object-cover object-center opacity-[0.16] mix-blend-luminosity"
                  />
                )}
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(105deg,rgba(0,72,69,0.98)_0%,rgba(0,72,69,0.9)_52%,rgba(0,54,53,0.82)_100%)]"
                />
                <span
                  aria-hidden
                  className="pointer-events-none absolute -right-10 -top-16 -z-10 h-40 w-40 rounded-full border border-[#D4B57A]/10"
                />
                <div className="relative z-10 flex items-center gap-2.5">
                  <div className="h-10 w-10 rounded-full bg-[#C5A059] flex items-center justify-center shrink-0 text-white">
                    {checkInComplete ? <CheckCircle2 size={22} /> : <Trophy size={20} />}
                  </div>
                  <span className="w-px shrink-0 self-stretch bg-[#D4B57A]/35" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#D4B57A] whitespace-nowrap">
                      Before you arrive
                    </p>
                    <span className="mt-1.5 flex w-full items-center justify-center rounded-xl bg-[#E7C46F] px-3 py-2.5 text-[#0A2F32] text-[13px] sm:text-[14px] font-medium leading-none">
                      {checkInComplete ? 'View check-in' : 'Complete online check-in'}
                      <ChevronRight size={14} className="inline ml-0.5 shrink-0" />
                    </span>
                    <p className="text-white/75 text-[12px] sm:text-[12.5px] mt-1.5 leading-snug">
                      {checkInComplete
                        ? t('checkInPromoDoneSub')
                        : 'Complete your check-in to unlock your stay experience.'}
                    </p>
                  </div>
                </div>
                <div className="relative z-10 mt-2.5 border-t border-white/10 pt-2">
                  <span className="inline-flex items-center gap-2 text-[11px] text-white/50 font-medium tracking-wide">
                    <Shield size={12} className="text-[#7FC3BD]" />
                    Secure <span className="text-[#D4B57A]/65">·</span> Private{' '}
                    <span className="text-[#D4B57A]/65">·</span> Takes 2 min
                  </span>
                </div>
              </button>
            )}
          </div>
        </div>
      </section>

      <div className={`mx-auto relative z-20 flex flex-col gap-3 pb-32 ${column} ${contentPadding}`}>
        <div className={`grid gap-3 ${showExcursions ? 'grid-cols-2' : 'grid-cols-1'}`}>
          <DestinationCard
            title={t('liveLikeLocalHero')}
            subtitle="Curated picks, local tips and hidden gems from people who know."
            photoUrl={liveLikeLocalHeroUrl}
            icon={<Sparkles size={11} />}
            onClick={onLiveLikeLocal}
          />
          {showExcursions && (
            <DestinationCard
              title="Excursions"
              subtitle="Unforgettable experiences and day trips, handpicked for you."
              photoUrl={excursionHeroUrl}
              icon={<Compass size={11} />}
              onClick={onExcursions}
            />
          )}
        </div>

        <section className="pt-3">
          <p className="text-[12px] font-semibold uppercase tracking-[0.22em] text-[#C4A574] mb-3">
            Your stay
          </p>
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
                      className={`p-1 rounded-lg ${copiedWifi ? 'text-emerald-600' : 'text-[#0A3330] hover:bg-[#0A3330]/5'}`}
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
                  <p className="text-[14px] font-semibold text-[#0A2F32] leading-tight">Check-out</p>
                  <p className="text-[12px] text-[#0A2F32] truncate mt-1">
                    {checkoutWindow}
                  </p>
                  {checkoutDateLabel && (
                    <p className="text-[11px] text-[#9A968E] mt-0.5">{checkoutDateLabel}</p>
                  )}
                </div>
                <ChevronRight size={14} className="text-[#AAA69F] shrink-0" />
              </div>
            )}
          </div>
          {featuredOnPortal.length > 0 && (
            <div className="mt-3 rounded-[1rem] border border-[#EEEAE3] bg-white shadow-[0_8px_22px_-14px_rgba(10,47,50,0.28)] overflow-hidden">
              <button
                type="button"
                onClick={() => setThingsOpen((open) => !open)}
                className="w-full flex items-center gap-3 px-3 py-3 text-left"
                aria-expanded={thingsOpen}
              >
                <span className="h-10 w-10 rounded-xl bg-[#F7F3EC] text-[#0A3330] flex items-center justify-center shrink-0">
                  <BookOpen size={17} />
                </span>
                <span className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold text-[#0A2F32]">{t('thingsToKnow')}</p>
                  <p className="text-[13px] text-[#7A7266] leading-snug">
                    Check-in, safety & emergency, house rules, daily needs and more.
                  </p>
                </span>
                <ChevronRight
                  size={16}
                  className={`text-[#9A968E] transition-transform ${thingsOpen ? 'rotate-90' : ''}`}
                />
              </button>
              {thingsOpen && (
                <div className="border-t border-[#EEE9E0] px-3 pb-1">
                  <PropertyEssentials
                    hideHeader
                    featuredOnPortal={featuredOnPortal}
                    previews={featuredPreviews}
                    guideData={guide || undefined}
                    onAskAssistant={onAssistant}
                  />
                </div>
              )}
            </div>
          )}
        </section>

        {portalFeatures.length > 0 && (
          <section className="pt-2">
            <div className="flex items-end justify-between mb-3">
              <p className="text-[12px] font-semibold uppercase tracking-[0.22em] text-[#C4A574]">
                Host&apos;s Features
              </p>
              <span className="text-[13px] font-semibold text-[#0A3330]/55">View all</span>
            </div>
            <GuestLocalServices
              layout="carousel"
              features={portalFeatures}
              propertyName={propertyName || 'your stay'}
              propertyTypeName={propertyTypeName}
              onDetailOpenChange={onServiceDetailOpenChange}
            />
          </section>
        )}

        <section className="pt-2">
          <p className="text-[12px] font-semibold uppercase tracking-[0.22em] text-[#C4A574] mb-3">
            Book & Arrange
          </p>
          <div className="grid grid-cols-5 gap-2">
            {BOOK_ARRANGE_TILES.map((tile) => (
              <div
                key={tile.label}
                className="rounded-xl border border-[#EEEAE3] bg-white py-2 px-1 flex flex-col items-center gap-1 shadow-[0_8px_20px_-14px_rgba(10,47,50,0.28)]"
              >
                <tile.icon size={18} className="text-[#0A3330]" strokeWidth={1.6} />
                <span className="text-[11px] font-semibold text-[#0A2F32] text-center leading-tight">
                  {tile.label}
                </span>
              </div>
            ))}
          </div>
        </section>

        {legalFooter}
      </div>

      <nav
        className={`${
          isMobileFramePreview ? 'absolute inset-x-0' : 'fixed left-1/2 -translate-x-1/2 w-full max-w-[576px]'
        } bottom-0 z-30 bg-[#0A2F32] text-white/70 pb-[max(0.45rem,env(safe-area-inset-bottom))] pt-2.5 ${
          isMobileFramePreview ? 'md:rounded-b-[32px]' : ''
        }`}
        aria-label="Guest portal navigation"
      >
        <div className="px-3 grid grid-cols-5 items-end">
          <NavItem label="Home" active icon={<HomeGlyph />} />
          <NavItem label="Book" icon={<ShoppingBag size={19} strokeWidth={1.75} />} />
          <button
            type="button"
            onClick={onAssistant}
            className="flex min-h-[44px] flex-col items-center -mt-7"
            aria-label="Open Ask Vailo 24/7 assistant"
          >
            <div className="h-[3.35rem] w-[3.35rem] rounded-full bg-[#0A3330] border-[3px] border-[#F7F7F5] flex items-center justify-center shadow-[0_10px_22px_rgba(4,28,30,0.4)]">
              <Sparkles size={18} className="text-[#E8D5A8]" />
            </div>
            <span className="text-[12px] font-medium mt-1 text-white/80">Ask Vailo</span>
          </button>
          <NavItem label="Explore" icon={<Compass size={19} strokeWidth={1.75} />} />
          <NavItem
            label="WhatsApp"
            icon={<WhatsAppGlyph />}
            onClick={whatsappHref ? () => openExternalUrl(whatsappHref) : undefined}
          />
        </div>
      </nav>
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
      <GoogleMark />
      <span className="text-[13px] font-semibold tabular-nums">{rating.toFixed(1)}</span>
      <Star size={10} className="fill-[#E7C46F] text-[#E7C46F]" />
    </button>
  );
}

function GoogleMark() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22.6 12.3c0-.8-.1-1.5-.2-2.3H12v4.3h5.9a5 5 0 0 1-2.2 3.3v2.8h3.6c2.1-2 3.3-4.8 3.3-8.1Z" />
      <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.6l-3.6-2.8c-1 .7-2.2 1.1-3.7 1.1a6.5 6.5 0 0 1-6.2-4.5H2.2V17A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.8 14.2a6.5 6.5 0 0 1 0-4.2V7.1H2.2A11 11 0 0 0 1 12c0 1.8.4 3.5 1.2 5l3.6-2.8Z" />
      <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.5 4.2 1.6l3.2-3.1A10.7 10.7 0 0 0 2.2 7.1L5.8 10A6.5 6.5 0 0 1 12 5.4Z" />
    </svg>
  );
}

function DestinationCard({
  title,
  subtitle,
  photoUrl,
  icon,
  onClick,
}: {
  title: string;
  subtitle: string;
  photoUrl?: string;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative aspect-[1.31/1] rounded-[0.7rem] overflow-hidden border border-white/60 text-left shadow-[0_10px_24px_-14px_rgba(4,28,30,0.5)]"
    >
      {photoUrl ? (
        <img src={photoUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-[#0A3D3A] to-[#041C1E]" />
      )}
      {/* Full-card depth + stronger bottom veil so title/subtitle stay readable */}
      <div
        aria-hidden
        className="absolute inset-0 bg-[linear-gradient(180deg,rgba(4,20,22,0.18)_0%,rgba(4,20,22,0.08)_38%,rgba(0,0,0,0.42)_62%,rgba(0,0,0,0.78)_100%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[62%] bg-[radial-gradient(120%_90%_at_50%_100%,rgba(0,0,0,0.72)_0%,rgba(0,0,0,0.35)_48%,transparent_78%)]"
      />
      <span className="absolute top-3 left-3 h-[25px] w-[25px] rounded-[0.6rem] bg-[#C5A059] text-white flex items-center justify-center shadow-[0_4px_12px_rgba(197,160,89,0.35)]">
        {icon}
      </span>
      <span className="absolute bottom-3 left-3 right-11 drop-shadow-[0_2px_10px_rgba(0,0,0,0.55)]">
        <span className="block font-luxury text-white text-[clamp(15px,3.4vw,17px)] leading-tight [text-shadow:0_1px_2px_rgba(0,0,0,0.55)]">
          {title}
        </span>
        <span className="block text-white/92 text-[clamp(11px,2.2vw,12.5px)] mt-0.5 leading-snug [text-shadow:0_1px_2px_rgba(0,0,0,0.5)]">
          {subtitle}
        </span>
      </span>
      <span className="absolute bottom-3 right-3 h-8 w-8 rounded-full border border-[#D9B459] bg-[#073D3B]/45 text-[#E5BD62] flex items-center justify-center backdrop-blur-sm">
        <ChevronRight size={16} />
      </span>
    </button>
  );
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

  return onClick ? (
    <button type="button" onClick={onClick} className={className} aria-label="Contact host on WhatsApp">
      {icon}
      <span className="text-[12px] font-medium">{label}</span>
    </button>
  ) : (
    <div className={className}>
      {icon}
      <span className="text-[12px] font-medium">{label}</span>
    </div>
  );
}

function WhatsAppGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M20.3 11.7a8.3 8.3 0 0 1-12.25 7.3L4 20l1.08-3.92A8.3 8.3 0 1 1 20.3 11.7Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M9.1 7.8c.2-.45.43-.46.73-.47h.43c.14 0 .36.05.54.45.18.4.62 1.51.67 1.62.06.11.1.24.02.38-.08.15-.12.24-.24.37-.12.13-.25.29-.36.39-.12.11-.24.23-.1.46.14.24.62 1.03 1.34 1.67.91.81 1.68 1.06 1.92 1.18.24.12.38.1.52-.06.14-.17.6-.7.76-.94.16-.24.32-.2.54-.12.22.08 1.39.66 1.63.78.24.12.4.18.46.28.06.1.06.58-.14 1.14-.2.56-1.17 1.07-1.61 1.14-.42.07-.96.1-1.55-.1-.36-.11-.82-.27-1.41-.53-.25-.11-2.48-.92-4.21-3.23-.49-.65-.82-1.38-.92-1.61-.1-.24-1.03-2.49.98-4.3Z"
        fill="currentColor"
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
