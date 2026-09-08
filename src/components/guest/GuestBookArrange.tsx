import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { createPortal } from 'react-dom';
import { doc, onSnapshot } from 'firebase/firestore';
import {
  Baby,
  Bell,
  Car,
  ChefHat,
  ChevronLeft,
  ChevronRight,
  Compass,
  Flower2,
  Gift,
  Globe,
  Loader2,
  MapPin,
  PartyPopper,
  ShoppingBag,
  Sparkles,
  Star,
  Users,
  UtensilsCrossed,
  Waves,
} from 'lucide-react';
import { db } from '../../lib/firebase';
import GuestLanguageMenu from './GuestLanguageMenu';
import MirroredPhotoImg from '../shared/MirroredPhotoImg';
import GuestExcursionBookingSheet from './GuestExcursionBookingSheet';
import { ExcursionDetailSheet } from './GuestExcursions';
import ExcursionTourTypeBadge from './ExcursionTourTypeBadge';
import ExcursionImpressionTracker from './ExcursionImpressionTracker';
import { useGuestLocale } from '../../context/GuestLocaleContext';
import { useGuestAnalytics } from '../../context/GuestAnalyticsContext';
import { openExternalUrl } from '../../lib/geocoding';
import {
  ARRANGE_AND_BOOK_CATEGORIES,
  arrangeAndBookCategoryById,
  arrangeAndBookSubcategoryById,
  type ArrangeAndBookCategory,
  type ArrangeAndBookSubcategory,
} from '../../lib/arrangeAndBook';
import {
  ARRANGE_AND_BOOK_FEATURED_DOC,
  featuredListingKey,
  parseArrangeAndBookFeatured,
  type ArrangeAndBookFeaturedRef,
} from '../../lib/arrangeAndBookFeatured';
import { offeringMatchesArrangeAndBook } from '../../lib/excursionCategories';
import {
  excursionDurationLabel,
  excursionLowestAdultPrice,
  formatExcursionPrice,
} from '../../lib/excursion';
import type { GuestExcursionListing } from '../../lib/guestExcursions';
import { buildExcursionImpressionKey } from '../../lib/guestAnalytics';
import { buildWhatsAppUrl, normalizeWhatsAppPhone } from '../../lib/whatsappLink';
import type { GuestLocale } from '../../lib/guestLocale';

const GLASS =
  'relative z-30 flex items-center justify-center h-10 w-10 min-h-[40px] min-w-[40px] rounded-full bg-[#0A2F32]/45 backdrop-blur-md border border-[#D4B57A]/35 ring-1 ring-inset ring-white/10 text-white shadow-[0_4px_14px_rgba(0,0,0,0.18)] hover:bg-[#0A2F32]/60 transition-all';

type LocaleOption = { code: string; label: string; nativeLabel: string };
type CategoryIcon = ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;

type Props = {
  listings: GuestExcursionListing[];
  listingsLoading?: boolean;
  propertyId: string;
  typeId: string;
  googlePlaceId?: string;
  locale: GuestLocale;
  setLocale: (locale: GuestLocale) => void;
  localeOptions: LocaleOption[];
  hasPropertyCoords: boolean;
  onOpenMap: () => void;
  websiteUrl: string | null;
  propertyName?: string;
  propertyTypeName?: string;
  whatsappRaw?: string;
  locationLabel?: string;
  googleRating?: number;
  googleReviewUrl?: string | null;
  initialCategoryId?: string;
  onOverlayOpenChange?: (open: boolean) => void;
};

function categoryIconFor(id: string): CategoryIcon {
  switch (id) {
    case 'experiences':
      return Compass;
    case 'transport':
      return Car;
    case 'food_dining':
      return UtensilsCrossed;
    case 'wellness':
      return Flower2;
    case 'at_the_villa':
      return Sparkles;
    case 'family':
      return Baby;
    case 'celebrations':
      return PartyPopper;
    case 'vip_luxury':
      return Star;
    case 'everyday_needs':
      return ShoppingBag;
    default:
      return Compass;
  }
}

function subcategoryIconFor(id: string): CategoryIcon {
  const sub = arrangeAndBookSubcategoryById(id);
  if (sub) return categoryIconFor(sub.categoryId);
  if (/chef|bbq|breakfast|wine|picnic|grocery|restaurant/i.test(id)) return ChefHat;
  if (/massage|yoga|pilates|beauty|hair|wellness/i.test(id)) return Flower2;
  if (/transfer|taxi|car|driver|limo|scooter|bike|chauffeur/i.test(id)) return Car;
  if (/sail|boat|yacht|snorkel|dive|water/i.test(id)) return Waves;
  if (/gift|flower|cake|decor|proposal|birthday|anniversary/i.test(id)) return Gift;
  if (/baby|family|kids|babysit/i.test(id)) return Users;
  return Compass;
}

function listingMatchesCategory(listing: GuestExcursionListing, categoryId: string): boolean {
  if (!categoryId) return true;
  return offeringMatchesArrangeAndBook(listing.excursion.categories, categoryId);
}

function listingMatchesSubcategory(
  listing: GuestExcursionListing,
  categoryId: string,
  subcategoryId: string
): boolean {
  return offeringMatchesArrangeAndBook(listing.excursion.categories, categoryId, subcategoryId);
}

function servicesSectionTitle(categoryId: string): string {
  if (!categoryId) return 'All categories';
  const cat = arrangeAndBookCategoryById(categoryId);
  if (!cat) return 'Services';
  return `${cat.label} services`;
}

export default function GuestBookArrange({
  listings,
  listingsLoading = false,
  propertyId,
  typeId,
  googlePlaceId,
  locale,
  setLocale,
  localeOptions,
  hasPropertyCoords,
  onOpenMap,
  websiteUrl,
  propertyName,
  propertyTypeName,
  whatsappRaw,
  locationLabel,
  googleRating,
  googleReviewUrl,
  initialCategoryId = '',
  onOverlayOpenChange,
}: Props) {
  const { t } = useGuestLocale();
  const { track } = useGuestAnalytics();
  const showLanguage = localeOptions.length > 1;

  const [featuredRefs, setFeaturedRefs] = useState<ArrangeAndBookFeaturedRef[]>([]);
  const [featuredLoading, setFeaturedLoading] = useState(true);
  const [selectedCategoryId, setSelectedCategoryId] = useState(initialCategoryId);
  const [activeSubcategory, setActiveSubcategory] = useState<{
    categoryId: string;
    subcategory: ArrangeAndBookSubcategory;
  } | null>(null);
  const [selected, setSelected] = useState<GuestExcursionListing | null>(null);
  const [bookingListing, setBookingListing] = useState<GuestExcursionListing | null>(null);
  const heroPhotoRef = useRef<string | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, ARRANGE_AND_BOOK_FEATURED_DOC),
      (snapshot) => {
        setFeaturedRefs(
          parseArrangeAndBookFeatured(
            snapshot.exists() ? (snapshot.data() as Record<string, unknown>) : undefined
          )
        );
        setFeaturedLoading(false);
      },
      (error) => {
        console.error(error);
        setFeaturedLoading(false);
      }
    );
    return () => unsub();
  }, []);

  const listingByKey = useMemo(() => {
    const map = new Map<string, GuestExcursionListing>();
    for (const listing of listings) {
      if (!listing.excursion.id) continue;
      map.set(
        featuredListingKey({
          providerId: listing.providerId,
          excursionId: listing.excursion.id,
        }),
        listing
      );
    }
    return map;
  }, [listings]);

  const featuredListings = useMemo(() => {
    return featuredRefs
      .map((ref) => listingByKey.get(featuredListingKey(ref)))
      .filter((row): row is GuestExcursionListing => Boolean(row))
      .filter((row) => listingMatchesCategory(row, selectedCategoryId));
  }, [featuredRefs, listingByKey, selectedCategoryId]);

  const heroPhoto = useMemo(() => {
    const pool = featuredRefs
      .map((ref) => listingByKey.get(featuredListingKey(ref)))
      .filter((row): row is GuestExcursionListing => Boolean(row))
      .map((row) => row.excursion.heroPhotoUrl?.trim())
      .filter((url): url is string => Boolean(url));
    if (pool.length === 0) {
      const fallback = listings
        .map((row) => row.excursion.heroPhotoUrl?.trim())
        .filter((url): url is string => Boolean(url));
      if (fallback.length === 0) return null;
      if (!heroPhotoRef.current || !fallback.includes(heroPhotoRef.current)) {
        heroPhotoRef.current = fallback[Math.floor(Math.random() * fallback.length)]!;
      }
      return heroPhotoRef.current;
    }
    if (!heroPhotoRef.current || !pool.includes(heroPhotoRef.current)) {
      heroPhotoRef.current = pool[Math.floor(Math.random() * pool.length)]!;
    }
    return heroPhotoRef.current;
  }, [featuredRefs, listingByKey, listings]);

  const subcategoryTiles = useMemo(() => {
    const cats: ArrangeAndBookCategory[] = selectedCategoryId
      ? ARRANGE_AND_BOOK_CATEGORIES.filter((c) => c.id === selectedCategoryId)
      : ARRANGE_AND_BOOK_CATEGORIES;

    const tiles: Array<{
      categoryId: string;
      subcategory: ArrangeAndBookSubcategory;
      count: number;
    }> = [];

    for (const cat of cats) {
      for (const sub of cat.subcategories) {
        const count = listings.filter((listing) =>
          listingMatchesSubcategory(listing, cat.id, sub.id)
        ).length;
        if (count === 0) continue;
        tiles.push({ categoryId: cat.id, subcategory: sub, count });
      }
    }
    return tiles;
  }, [listings, selectedCategoryId]);

  const subcategoryListings = useMemo(() => {
    if (!activeSubcategory) return [];
    return listings
      .filter((listing) =>
        listingMatchesSubcategory(
          listing,
          activeSubcategory.categoryId,
          activeSubcategory.subcategory.id
        )
      )
      .sort((a, b) => a.excursion.title.localeCompare(b.excursion.title));
  }, [listings, activeSubcategory]);

  const overlayOpen = selected != null || bookingListing != null;
  useEffect(() => {
    onOverlayOpenChange?.(overlayOpen);
    return () => onOverlayOpenChange?.(false);
  }, [overlayOpen, onOverlayOpenChange]);

  const conciergeHref = useMemo(() => {
    const digits = normalizeWhatsAppPhone(whatsappRaw || '');
    if (!digits) return null;
    const stayLabel = [propertyName, propertyTypeName].filter(Boolean).join(' — ');
    const message = stayLabel
      ? `Hello! I'm a guest staying at ${stayLabel}. I need something special arranged for my stay — could you help?`
      : `Hello! I'm a guest at your property. I need something special arranged for my stay — could you help?`;
    return buildWhatsAppUrl(digits, message);
  }, [whatsappRaw, propertyName, propertyTypeName]);

  const trackBookingStart = (listing: GuestExcursionListing) => {
    track('excursion_booking_start', {
      excursionId: listing.excursion.id,
      excursionTitle: listing.excursion.title,
      providerId: listing.providerId,
      providerName: listing.providerName,
    });
  };

  const placeHint = locationLabel?.trim() || '';

  return (
    <>
      <div className="guest-mobile fixed inset-0 z-50 flex flex-col bg-[#F7F7F5] pb-[calc(4.75rem+env(safe-area-inset-bottom,0px))] md:relative md:h-[800px] md:rounded-3xl md:overflow-hidden md:shadow-2xl md:border md:border-[#0A2F32]/10">
        <div className="flex-1 min-h-0 overflow-y-auto">
          {activeSubcategory ? (
            <SubcategoryListView
              title={activeSubcategory.subcategory.label}
              categoryLabel={
                arrangeAndBookCategoryById(activeSubcategory.categoryId)?.label || 'Services'
              }
              listings={subcategoryListings}
              loading={listingsLoading}
              propertyId={propertyId}
              typeId={typeId}
              googlePlaceId={googlePlaceId}
              locale={locale}
              setLocale={setLocale}
              localeOptions={localeOptions}
              showLanguage={showLanguage}
              hasPropertyCoords={hasPropertyCoords}
              onOpenMap={onOpenMap}
              websiteUrl={websiteUrl}
              propertyName={propertyName}
              googleRating={googleRating}
              googleReviewUrl={googleReviewUrl}
              onBack={() => setActiveSubcategory(null)}
              onSelect={setSelected}
              t={t}
            />
          ) : (
            <>
              <section className="relative min-h-[14.5rem] overflow-hidden sm:min-h-[15.5rem]">
                <BookHeroMedia
                  photoUrl={heroPhoto}
                  propertyId={propertyId}
                  typeId={typeId}
                  googlePlaceId={googlePlaceId}
                />

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

                  <div className={`mt-5 ${HERO_TEXT}`}>
                    <h1 className="font-luxury text-[2.35rem] text-white leading-[0.95] font-medium tracking-[-0.025em]">
                      Book & Arrange
                    </h1>
                    <p className="mt-2 text-[15px] font-semibold text-white">
                      Turn good holidays into unforgettable ones.
                    </p>
                  </div>
                </div>
              </section>

              <div className="relative z-10 -mt-6 rounded-t-[2rem] bg-[#F7F7F5] px-[clamp(18px,6.6vw,38px)] pb-6 pt-5 space-y-7 shadow-[0_-8px_24px_-18px_rgba(4,28,30,0.25)]">
                <div className="-mx-[clamp(18px,6.6vw,38px)] px-[clamp(18px,6.6vw,38px)] overflow-x-auto scrollbar-none">
                  <div className="flex items-center gap-2 min-w-max pb-0.5">
                    <CategoryPill
                      label="All"
                      active={!selectedCategoryId}
                      onClick={() => setSelectedCategoryId('')}
                    />
                    {ARRANGE_AND_BOOK_CATEGORIES.map((cat) => (
                      <CategoryPill
                        key={cat.id}
                        label={cat.label}
                        active={selectedCategoryId === cat.id}
                        onClick={() => setSelectedCategoryId(cat.id)}
                      />
                    ))}
                  </div>
                </div>

                <section>
                  <div className="mb-3 flex items-end justify-between gap-3">
                    <h2 className="text-[15px] font-semibold text-[#0A2F32]">Featured</h2>
                    {(featuredLoading || listingsLoading) && (
                      <Loader2 size={14} className="animate-spin text-[#0A2F32]/40" />
                    )}
                  </div>
                  {featuredListings.length === 0 ? (
                    <p className="text-[13px] text-[#7A7266] leading-snug">
                      {featuredLoading || listingsLoading
                        ? 'Loading featured listings…'
                        : selectedCategoryId
                          ? 'No featured listings in this category yet.'
                          : 'No featured listings yet.'}
                    </p>
                  ) : (
                    <div className="-mx-[clamp(18px,6.6vw,38px)] px-[clamp(18px,6.6vw,38px)] overflow-x-auto scrollbar-none">
                      <div className="flex gap-3 pb-1">
                        {featuredListings.map((listing, index) => (
                          <FeaturedListingCard
                            key={`${listing.providerId}-${listing.excursion.id}`}
                            listing={listing}
                            highlight={index === 0}
                            placeHint={placeHint}
                            onOpen={() => setSelected(listing)}
                            t={t}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </section>

                <section>
                  <h2 className="text-[15px] font-semibold text-[#0A2F32] mb-3">
                    {servicesSectionTitle(selectedCategoryId)}
                  </h2>
                  {subcategoryTiles.length === 0 ? (
                    <p className="text-[13px] text-[#7A7266] leading-snug">
                      {listingsLoading
                        ? 'Loading services…'
                        : 'No bookable services in this category for your area yet.'}
                    </p>
                  ) : (
                    <div className="grid grid-cols-4 gap-2.5">
                      {subcategoryTiles.map(({ categoryId, subcategory, count }) => {
                        const Icon = subcategoryIconFor(subcategory.id);
                        return (
                          <button
                            key={`${categoryId}-${subcategory.id}`}
                            type="button"
                            onClick={() =>
                              setActiveSubcategory({ categoryId, subcategory })
                            }
                            className="flex flex-col items-center gap-2 rounded-[0.95rem] border border-[#EEEAE3] bg-white px-1.5 py-3 text-center shadow-[0_6px_18px_-14px_rgba(10,47,50,0.28)] hover:border-[#C5A059]/45 hover:bg-[#FCFAF6] transition-colors"
                          >
                            <span className="flex h-11 w-11 items-center justify-center rounded-[0.85rem] bg-[#F1EDE5] text-[#0A3330]">
                              <Icon size={18} strokeWidth={1.7} />
                            </span>
                            <span className="text-[11px] font-semibold text-[#0A2F32] leading-tight line-clamp-2 min-h-[2.2em]">
                              {subcategory.label}
                            </span>
                            <span className="sr-only">{count} listings</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </section>

                <ConciergeBanner href={conciergeHref} />
              </div>
            </>
          )}
        </div>
      </div>

      {selected &&
        typeof document !== 'undefined' &&
        createPortal(
          <ExcursionDetailSheet
            listing={selected}
            onClose={() => setSelected(null)}
            onBook={() => {
              trackBookingStart(selected);
              setBookingListing(selected);
              setSelected(null);
            }}
          />,
          document.body
        )}

      {bookingListing && (
        <GuestExcursionBookingSheet
          listing={bookingListing}
          propertyId={propertyId}
          typeId={typeId}
          onClose={() => setBookingListing(null)}
        />
      )}
    </>
  );
}

function CategoryPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full px-3.5 py-2 text-[12px] font-semibold transition-colors ${
        active
          ? 'bg-[#0A4544] text-white shadow-[0_6px_16px_-10px_rgba(10,47,50,0.55)]'
          : 'bg-white text-[#0A2F32] border border-[#E8DFD0] hover:border-[#C5A059]/50'
      }`}
    >
      {label}
    </button>
  );
}

const HERO_TEXT =
  'mb-3 text-center [text-shadow:0_2px_18px_rgba(0,0,0,0.7),0_1px_4px_rgba(0,0,0,0.55)]';

function BookHeroMedia({
  photoUrl,
  propertyId,
  typeId,
  googlePlaceId,
}: {
  photoUrl: string | null;
  propertyId: string;
  typeId: string;
  googlePlaceId?: string;
}) {
  return (
    <>
      {photoUrl ? (
        <MirroredPhotoImg
          src={photoUrl}
          alt=""
          className="absolute inset-0 h-full w-full scale-[1.02] object-cover object-center"
          mirrorContext={{ propertyId, propertyTypeId: typeId, googlePlaceId }}
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-[#0A3D3A] via-[#08332F] to-[#041C1E]" />
      )}
      {/* Flat dark mask — no white fade gradient */}
      <div aria-hidden className="absolute inset-0 bg-[#041C1E]/42" />
    </>
  );
}

function ConciergeBanner({ href }: { href: string | null }) {
  return (
    <button
      type="button"
      onClick={() => href && openExternalUrl(href)}
      disabled={!href}
      className="relative isolate overflow-hidden w-full min-h-[118px] text-left rounded-[1.25rem] border border-[#D4B57A]/45 px-3.5 py-3.5 disabled:opacity-50 shadow-[0_14px_28px_-12px_rgba(92,61,30,0.45)]"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(105deg,#5C3D1E_0%,#8B6914_52%,#C5A059_100%)]"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-16 -z-10 h-40 w-40 rounded-full border border-white/15"
      />
      <div className="relative z-10 flex items-center gap-2.5">
        <div className="h-10 w-10 rounded-full bg-white/15 border border-white/25 flex items-center justify-center shrink-0 text-white">
          <Bell size={20} strokeWidth={1.7} />
        </div>
        <span className="w-px shrink-0 self-stretch bg-white/25" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#F3E6C4] whitespace-nowrap">
            Need something special?
          </p>
          <span className="mt-1.5 flex w-full items-center justify-center rounded-xl bg-white px-3 py-2.5 text-[#8B6914] text-[13px] sm:text-[14px] font-medium leading-none">
            Contact host
            <ChevronRight size={14} className="inline ml-0.5 shrink-0" />
          </span>
          <p className="text-white/80 text-[12px] sm:text-[12.5px] mt-1.5 leading-snug">
            Tell us what you need and we&apos;ll arrange it for you.
          </p>
        </div>
      </div>
      <div className="relative z-10 mt-2.5 border-t border-white/15 pt-2">
        <span className="inline-flex items-center gap-2 text-[11px] text-white/55 font-medium tracking-wide">
          Host WhatsApp <span className="text-[#F3E6C4]/70">·</span> Fast replies{' '}
          <span className="text-[#F3E6C4]/70">·</span> Tailored for your stay
        </span>
      </div>
    </button>
  );
}

function FeaturedListingCard({
  listing,
  highlight,
  placeHint,
  onOpen,
  t,
}: {
  listing: GuestExcursionListing;
  highlight?: boolean;
  placeHint?: string;
  onOpen: () => void;
  t: (key: string) => string;
}) {
  const { excursion, providerName } = listing;
  const lowestPrice = excursionLowestAdultPrice(excursion);
  const priceLabel =
    lowestPrice != null
      ? formatExcursionPrice(lowestPrice, excursion.currency, {
          from: excursion.showPriceFrom !== false,
        })
      : null;
  const duration = excursionDurationLabel(excursion);
  const meta = [excursion.subtitle?.trim(), duration, providerName].filter(Boolean).join(' · ');

  return (
    <article className="w-[min(17.5rem,78vw)] shrink-0 overflow-hidden rounded-[1.05rem] border border-[#EEEAE3] bg-white shadow-[0_10px_24px_-16px_rgba(10,47,50,0.4)]">
      <div className="relative aspect-[5/2.55] bg-[#E8E4DC]">
        {excursion.heroPhotoUrl ? (
          <img
            src={excursion.heroPhotoUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-[#C5A059]">
            <Compass size={28} />
          </div>
        )}
        {highlight && (
          <span className="absolute top-2.5 left-2.5 inline-flex items-center gap-1 rounded-full bg-[#C5A059] px-2 py-1 text-[10px] font-semibold text-white shadow-sm">
            <Star size={10} fill="currentColor" />
            Most popular
          </span>
        )}
        <div className="absolute top-2.5 right-2.5">
          <ExcursionTourTypeBadge excursion={excursion} t={t} />
        </div>
      </div>
      <div className="p-3 flex flex-col gap-2">
        <div>
          <h3 className="text-[14px] font-semibold text-[#0A2F32] leading-snug truncate">
            {excursion.title}
          </h3>
          {meta && (
            <p className="mt-1 text-[11px] text-[#7A7266] leading-snug line-clamp-1">{meta}</p>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 text-[11px] text-[#5C564C]">
          {priceLabel ? (
            <span className="font-semibold text-[#0A2F32] truncate">{priceLabel}</span>
          ) : (
            <span />
          )}
          {placeHint && (
            <span className="inline-flex items-center gap-0.5 shrink-0 text-[#7A7266]">
              <MapPin size={11} />
              {placeHint}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onOpen}
          className="mt-0.5 w-full rounded-full bg-[#C5A059] px-3 py-2.5 text-[12px] font-semibold text-white inline-flex items-center justify-center gap-1 hover:bg-[#B8924A] transition-colors"
        >
          View details
          <ChevronRight size={14} />
        </button>
      </div>
    </article>
  );
}

function SubcategoryListView({
  title,
  categoryLabel,
  listings,
  loading,
  propertyId,
  typeId,
  googlePlaceId,
  locale,
  setLocale,
  localeOptions,
  showLanguage,
  hasPropertyCoords,
  onOpenMap,
  websiteUrl,
  propertyName,
  googleRating,
  googleReviewUrl,
  onBack,
  onSelect,
  t,
}: {
  title: string;
  categoryLabel: string;
  listings: GuestExcursionListing[];
  loading: boolean;
  propertyId: string;
  typeId: string;
  googlePlaceId?: string;
  locale: GuestLocale;
  setLocale: (locale: GuestLocale) => void;
  localeOptions: LocaleOption[];
  showLanguage: boolean;
  hasPropertyCoords: boolean;
  onOpenMap: () => void;
  websiteUrl: string | null;
  propertyName?: string;
  googleRating?: number;
  googleReviewUrl?: string | null;
  onBack: () => void;
  onSelect: (listing: GuestExcursionListing) => void;
  t: (key: string) => string;
}) {
  const impressionExcursions = useMemo(
    () =>
      listings
        .filter((l) => l.excursion.id)
        .map((l) => ({
          id: buildExcursionImpressionKey(l.providerId, l.excursion.id!),
          excursionId: l.excursion.id!,
          excursionTitle: l.excursion.title,
          providerId: l.providerId,
          providerName: l.providerName,
        })),
    [listings]
  );

  const heroPhoto =
    listings.find((l) => l.excursion.heroPhotoUrl?.trim())?.excursion.heroPhotoUrl || null;

  return (
    <>
      <section className="relative min-h-[14.5rem] overflow-hidden sm:min-h-[15.5rem]">
        <BookHeroMedia
          photoUrl={heroPhoto}
          propertyId={propertyId}
          typeId={typeId}
          googlePlaceId={googlePlaceId}
        />

        <div className="relative z-10 mx-auto flex min-h-[14.5rem] max-w-[576px] flex-col px-3 pt-3 pb-10 sm:min-h-[15.5rem]">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center">
            <div className="justify-self-start flex items-center gap-1.5">
              <button
                type="button"
                onClick={onBack}
                className={GLASS}
                aria-label="Back"
              >
                <ChevronLeft size={16} className="text-[#E8D5A8]" />
              </button>
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

          <div className={`mt-5 ${HERO_TEXT}`}>
            <h1 className="font-luxury text-[2.35rem] text-white leading-[0.95] font-medium tracking-[-0.025em]">
              {title}
            </h1>
            <p className="mt-2 text-[15px] font-semibold text-white">
              {categoryLabel} services
            </p>
          </div>
        </div>
      </section>

      <div className="relative z-10 -mt-6 rounded-t-[2rem] bg-[#F7F7F5] px-[clamp(18px,6.6vw,38px)] pb-6 pt-5 shadow-[0_-8px_24px_-18px_rgba(4,28,30,0.25)]">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 text-[#0A2F32]/70">
            <Loader2 size={28} className="animate-spin mb-3" />
            <p className="text-sm text-[#7A7266]">Loading listings…</p>
          </div>
        ) : listings.length === 0 ? (
          <p className="text-[13px] text-[#7A7266] leading-snug">
            No listings in this service yet.
          </p>
        ) : (
          <ExcursionImpressionTracker excursions={impressionExcursions}>
            <div className="space-y-3">
              {listings.map((listing) => {
                const { excursion, providerName, providerId } = listing;
                const impressionId = excursion.id
                  ? buildExcursionImpressionKey(providerId, excursion.id)
                  : '';
                const lowestPrice = excursionLowestAdultPrice(excursion);
                const priceLabel =
                  lowestPrice != null
                    ? formatExcursionPrice(lowestPrice, excursion.currency, {
                        from: excursion.showPriceFrom !== false,
                      })
                    : null;
                const meta = [excursionDurationLabel(excursion), providerName]
                  .filter(Boolean)
                  .join(' · ');

                return (
                  <button
                    key={`${providerId}-${excursion.id}`}
                    type="button"
                    onClick={() => onSelect(listing)}
                    data-excursion-impression-id={impressionId || undefined}
                    className="w-full text-left flex flex-col gap-2 rounded-[0.9rem] border border-[#EEEAE3] bg-white p-2 shadow-[0_8px_20px_-14px_rgba(10,47,50,0.28)] hover:border-[#C5A059]/40 transition-all active:scale-[0.99]"
                  >
                    <div className="flex gap-3">
                      <div className="relative h-[5.5rem] w-[5.5rem] shrink-0 overflow-hidden rounded-[0.85rem] bg-[#ECEAE4]">
                        {excursion.heroPhotoUrl ? (
                          <img
                            src={excursion.heroPhotoUrl}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center text-[#C5A059]">
                            <Compass size={22} />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1 py-0.5 pr-1">
                        <div className="mb-1">
                          <ExcursionTourTypeBadge excursion={excursion} t={t} />
                        </div>
                        <h3 className="text-[13px] font-semibold text-[#0A2F32] leading-snug truncate">
                          {excursion.title}
                        </h3>
                        {excursion.subtitle && (
                          <p className="mt-0.5 text-[11px] text-[#7A7266] leading-snug line-clamp-1">
                            {excursion.subtitle}
                          </p>
                        )}
                        <p className="mt-1 text-[11px] text-[#7A7266] truncate">{meta}</p>
                        {priceLabel && (
                          <p className="mt-1.5 text-[13px] font-semibold text-[#0A4544]">
                            {priceLabel}
                          </p>
                        )}
                      </div>
                    </div>
                    <span className="inline-flex w-full items-center justify-center gap-1 rounded-full bg-[#C5A059] px-3 py-2.5 text-[12px] font-semibold text-white">
                      View details
                      <ChevronRight size={14} />
                    </span>
                  </button>
                );
              })}
            </div>
          </ExcursionImpressionTracker>
        )}
      </div>
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
