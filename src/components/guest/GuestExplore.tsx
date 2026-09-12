import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import {
  Binoculars,
  ChevronRight,
  Globe,
  Heart,
  Landmark,
  LayoutGrid,
  List,
  Map as MapIcon,
  MapPin,
  Navigation,
  Star,
  Umbrella,
  UtensilsCrossed,
  Wine,
} from 'lucide-react';
import GuestLanguageMenu from './GuestLanguageMenu';
import PickSaveButton from './PickSaveButton';
import MirroredPhotoImg from '../shared/MirroredPhotoImg';
import { useGuestLocale } from '../../context/GuestLocaleContext';
import { gemCategoryPrimaries } from '../../lib/categoryLocale';
import type { CategoryOption } from '../../lib/categoryHierarchy';
import { resolveLocalizedString } from '../../lib/propertyContentLocales';
import type { SavedLocalGemInput } from '../../lib/savedLocalGems';
import { openExternalUrl, getItemMapLinks, isValidExternalUrl } from '../../lib/geocoding';
import type { GuestLocale } from '../../lib/guestLocale';

export type ExploreGem = {
  id: string;
  name?: string;
  description?: string;
  nameByLocale?: Record<string, string>;
  descriptionByLocale?: Record<string, string>;
  categoryByLocale?: Record<string, string>;
  photoUrl?: string;
  category?: string;
  categories?: string[];
  rating?: number;
  distanceKm?: number;
  latitude?: number;
  longitude?: number;
  googleMapsUrl?: string;
  googlePlaceId?: string;
  isLegitPick?: boolean;
  isDailyTrip?: boolean;
  [key: string]: unknown;
};

type CategoryIcon = ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;

const CATEGORY_ICON_RULES: Array<{ match: RegExp; icon: CategoryIcon }> = [
  { match: /restaurant|food|dining|taverna|cafe|café|eat/i, icon: UtensilsCrossed },
  { match: /beach|swim|sea|coast|lagoon/i, icon: Umbrella },
  { match: /bar|nightlife|club|wine|drink|cocktail/i, icon: Wine },
  { match: /culture|museum|history|church|temple|archaeolog|monument/i, icon: Landmark },
  { match: /thing|activit|tour|hike|trail|do\b|sight|experience|adventure/i, icon: Binoculars },
];

const GLASS =
  'relative z-30 flex items-center justify-center h-10 w-10 min-h-[40px] min-w-[40px] rounded-full bg-[#0A2F32]/45 backdrop-blur-md border border-[#D4B57A]/35 ring-1 ring-inset ring-white/10 text-white shadow-[0_4px_14px_rgba(0,0,0,0.18)] hover:bg-[#0A2F32]/60 transition-all';

type LocaleOption = { code: string; label: string; nativeLabel: string };

type Props = {
  gems: ExploreGem[];
  /** Local gems category catalog (area), in display order. */
  categoryOptions: CategoryOption[];
  categoryCatalogDocs: Record<string, unknown>[];
  locationLabel: string;
  mapAreaHint: string;
  propertyName?: string;
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
  onOpenSaved: () => void;
};

function categoryIconFor(label: string): CategoryIcon {
  for (const rule of CATEGORY_ICON_RULES) {
    if (rule.match.test(label)) return rule.icon;
  }
  return MapPin;
}

function gemMatchesCategory(gemPrimaries: string[], categoryPrimary: string): boolean {
  const needle = categoryPrimary.trim().toLowerCase();
  if (!needle) return false;
  return gemPrimaries.some((p) => p.trim().toLowerCase() === needle);
}

function gemToSaveInput(
  gem: ExploreGem,
  title: string,
  category: string
): SavedLocalGemInput {
  return {
    title,
    description: typeof gem.description === 'string' ? gem.description : undefined,
    category: category || 'Local gem',
    source: 'database',
    photoUrl: gem.photoUrl,
    googleMapsUrl: gem.googleMapsUrl,
    googlePlaceId: gem.googlePlaceId,
    latitude: gem.latitude,
    longitude: gem.longitude,
    estimatedDistance:
      gem.distanceKm != null && Number.isFinite(Number(gem.distanceKm))
        ? `${Number(gem.distanceKm).toFixed(1)} km`
        : undefined,
  };
}

export default function GuestExplore({
  gems,
  categoryOptions,
  categoryCatalogDocs,
  locationLabel,
  mapAreaHint,
  propertyName,
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
  onOpenSaved,
}: Props) {
  const { contentPrimaryLocale, contentReviewedLocales, t } = useGuestLocale();
  /** Empty = All selected (default). Otherwise multi-select of category primaries. */
  const [selectedPrimaries, setSelectedPrimaries] = useState<string[]>([]);
  const allSelected = selectedPrimaries.length === 0;
  const showLanguage = localeOptions.length > 1;

  const enriched = useMemo(() => {
    return gems.map((gem) => {
      const title =
        resolveLocalizedString(gem, 'name', locale, contentPrimaryLocale, contentReviewedLocales) ||
        gem.name ||
        'Local place';
      const categories = gemCategoryPrimaries(
        gem,
        categoryCatalogDocs,
        contentPrimaryLocale,
        locale
      );
      return { gem, title, categories };
    });
  }, [gems, locale, contentPrimaryLocale, contentReviewedLocales, categoryCatalogDocs]);

  const categoriesWithListings = useMemo(() => {
    const fromCatalog = categoryOptions.filter((cat) =>
      enriched.some((item) => gemMatchesCategory(item.categories, cat.primary))
    );
    if (fromCatalog.length > 0) return fromCatalog;

    // Fallback when area category catalog is missing: use categories present on listings.
    const seen = new Map<string, CategoryOption>();
    for (const item of enriched) {
      for (const primary of item.categories) {
        const key = primary.trim().toLowerCase();
        if (!key || seen.has(key)) continue;
        seen.set(key, { primary, label: primary });
      }
    }
    return Array.from(seen.values());
  }, [categoryOptions, enriched]);

  const toggleCategory = (primary: string) => {
    setSelectedPrimaries((prev) => {
      const key = primary.toLowerCase();
      const exists = prev.some((p) => p.toLowerCase() === key);
      if (exists) {
        return prev.filter((p) => p.toLowerCase() !== key);
      }
      return [...prev, primary];
    });
  };

  const sections = useMemo(() => {
    const source = allSelected
      ? categoriesWithListings
      : categoriesWithListings.filter((cat) =>
          selectedPrimaries.some((p) => p.toLowerCase() === cat.primary.toLowerCase())
        );

    return source.map((cat) => ({
      category: cat,
      items: enriched
        .filter((item) => gemMatchesCategory(item.categories, cat.primary))
        .sort((a, b) => {
          const da = Number(a.gem.distanceKm);
          const db = Number(b.gem.distanceKm);
          const aValid = Number.isFinite(da);
          const bValid = Number.isFinite(db);
          if (aValid && bValid) return da - db;
          if (aValid) return -1;
          if (bValid) return 1;
          return a.title.localeCompare(b.title);
        }),
    }));
  }, [allSelected, selectedPrimaries, categoriesWithListings, enriched]);

  const heroPhoto = useMemo(() => {
    const withPhoto = gems.filter((g) => typeof g.photoUrl === 'string' && g.photoUrl.trim());
    if (withPhoto.length === 0) return null;
    return withPhoto[Math.floor(Math.random() * withPhoto.length)].photoUrl as string;
  }, [gems]);

  const savedBannerPhoto = gems.find((g) => g.photoUrl)?.photoUrl || heroPhoto || undefined;
  const placeLabel = locationLabel.trim() || mapAreaHint.split(',')[0]?.trim() || 'here';
  const topSections = sections.slice(0, 2);
  const bottomSections = sections.slice(2);

  return (
    <div className="guest-mobile fixed inset-0 z-50 flex flex-col bg-[#F7F7F5] pb-[calc(4.75rem+env(safe-area-inset-bottom,0px))] md:relative md:h-[800px] md:rounded-3xl md:overflow-hidden md:shadow-2xl md:border md:border-[#0A2F32]/10">
      <div className="flex-1 min-h-0 overflow-y-auto">
        <section className="relative overflow-hidden">
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

          <div className="relative z-10 mx-auto flex max-w-[576px] flex-col px-3 pt-3 pb-10">
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

            <div className="mt-5 mb-3 text-center [text-shadow:0_2px_18px_rgba(0,0,0,0.7),0_1px_4px_rgba(0,0,0,0.55)]">
              <h1 className="font-luxury text-[2.35rem] text-white leading-[0.95] font-medium tracking-[-0.025em]">
                Explore
              </h1>
              <p className="mt-2 text-[15px] font-semibold text-white">
                Local gems in {placeLabel}
              </p>
              {propertyName?.trim() && (
                <p className="mt-1.5 text-[12px] text-white/90">
                  Proposed by {propertyName.trim()}
                </p>
              )}
            </div>
          </div>
        </section>

        <div className="relative z-10 -mt-6 rounded-t-[2rem] bg-[#F7F7F5] px-[clamp(18px,6.6vw,38px)] pb-6 pt-5 space-y-7 shadow-[0_-8px_24px_-18px_rgba(4,28,30,0.25)]">
          {categoriesWithListings.length > 0 && (
            <div className="grid grid-cols-5 gap-x-1.5 gap-y-3 px-0.5">
              <button
                type="button"
                onClick={() => setSelectedPrimaries([])}
                className="flex min-w-0 flex-col items-center gap-1.5"
              >
                <span
                  className={`flex h-12 w-12 items-center justify-center rounded-full shadow-[0_4px_14px_rgba(0,0,0,0.12)] transition-colors ${
                    allSelected
                      ? 'bg-[#0A4544] text-[#E8D5A8]'
                      : 'bg-white text-[#0A2F32] border border-[#EEEAE3]'
                  }`}
                >
                  <LayoutGrid size={18} strokeWidth={1.7} />
                </span>
                <span
                  className={`w-full text-[11px] font-semibold text-center leading-tight truncate ${
                    allSelected ? 'text-[#8B6914]' : 'text-[#0A2F32]'
                  }`}
                >
                  All
                </span>
              </button>
              {categoriesWithListings.map((cat) => {
                const Icon = categoryIconFor(cat.label || cat.primary);
                const active =
                  !allSelected &&
                  selectedPrimaries.some((p) => p.toLowerCase() === cat.primary.toLowerCase());
                return (
                  <button
                    key={cat.primary}
                    type="button"
                    onClick={() => toggleCategory(cat.primary)}
                    className="flex min-w-0 flex-col items-center gap-1.5"
                  >
                    <span
                      className={`flex h-12 w-12 items-center justify-center rounded-full shadow-[0_4px_14px_rgba(0,0,0,0.12)] transition-colors ${
                        active
                          ? 'bg-[#0A4544] text-[#E8D5A8]'
                          : 'bg-white text-[#0A2F32] border border-[#EEEAE3]'
                      }`}
                    >
                      <Icon size={18} strokeWidth={1.7} />
                    </span>
                    <span
                      className={`w-full text-[11px] font-semibold text-center leading-tight truncate ${
                        active ? 'text-[#8B6914]' : 'text-[#0A2F32]'
                      }`}
                    >
                      {cat.label || cat.primary}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {sections.length === 0 ? (
            <p className="text-[13px] text-[#7A7266] leading-snug">
              No local gems categories with listings for this stay yet.
            </p>
          ) : (
            <>
              {topSections.map(({ category, items }) => (
                <ExploreCarousel
                  key={category.primary}
                  categoryKey={category.primary}
                  title={category.label || category.primary}
                  items={items}
                  propertyId={propertyId}
                  typeId={typeId}
                  mapAreaHint={mapAreaHint}
                  emptyLabel="No listings in this category yet."
                />
              ))}
              {sections.length >= 2 && (
                <SavedPlacesBanner photoUrl={savedBannerPhoto} onOpen={onOpenSaved} />
              )}
              {bottomSections.map(({ category, items }) => (
                <ExploreCarousel
                  key={category.primary}
                  categoryKey={category.primary}
                  title={category.label || category.primary}
                  items={items}
                  propertyId={propertyId}
                  typeId={typeId}
                  mapAreaHint={mapAreaHint}
                  emptyLabel="No listings in this category yet."
                />
              ))}
            </>
          )}

          <SavedPlacesBanner photoUrl={savedBannerPhoto} onOpen={onOpenSaved} />
        </div>
      </div>
    </div>
  );
}

type CarouselItem = {
  gem: ExploreGem;
  title: string;
  categories: string[];
};

function SavedPlacesBanner({
  photoUrl,
  onOpen,
}: {
  photoUrl?: string;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="relative w-full overflow-hidden rounded-[1.1rem] min-h-[88px] text-left shadow-[0_10px_28px_-14px_rgba(10,47,50,0.45)]"
    >
      {photoUrl ? (
        <img src={photoUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-[#0A3D3A] to-[#041C1E]" />
      )}
      <div className="absolute inset-0 bg-[#0A2F32]/62" />
      <div className="relative z-10 flex items-center gap-3 px-3.5 py-3.5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/25 bg-white/15 text-white">
          <Heart size={18} strokeWidth={1.8} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-luxury text-[1.15rem] text-white leading-tight font-medium">
            Saved places
          </span>
          <span className="block text-[12px] text-white/80 mt-0.5 leading-snug">
            Your favourite spots in one place
          </span>
        </span>
        <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-[#0A4544] px-3 py-2 text-[12px] font-semibold text-white">
          View saved
          <ChevronRight size={14} />
        </span>
      </div>
    </button>
  );
}

function ExploreCarousel({
  categoryKey,
  title,
  items,
  propertyId,
  typeId,
  mapAreaHint,
  emptyLabel,
}: {
  categoryKey: string;
  title: string;
  items: CarouselItem[];
  propertyId: string;
  typeId: string;
  mapAreaHint: string;
  emptyLabel: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const canToggle = items.length > 2;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const updateActiveIndex = useCallback(() => {
    const el = scrollRef.current;
    if (!el || items.length === 0) return;
    const first = el.children[0] as HTMLElement | undefined;
    if (!first) return;
    const gap = parseFloat(getComputedStyle(el).columnGap || getComputedStyle(el).gap || '0') || 0;
    const stride = first.offsetWidth + gap;
    if (stride <= 0) return;
    const index = Math.round(el.scrollLeft / stride);
    setActiveIndex(Math.min(Math.max(index, 0), items.length - 1));
  }, [items.length]);

  useEffect(() => {
    setActiveIndex(0);
    scrollRef.current?.scrollTo({ left: 0 });
  }, [categoryKey, items.length, expanded]);

  const scrollToIndex = (index: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const first = el.children[0] as HTMLElement | undefined;
    if (!first) return;
    const gap = parseFloat(getComputedStyle(el).columnGap || getComputedStyle(el).gap || '0') || 0;
    const stride = first.offsetWidth + gap;
    el.scrollTo({ left: index * stride, behavior: 'smooth' });
    setActiveIndex(index);
  };

  return (
    <section>
      <div className="mb-3 flex items-end justify-between gap-3">
        <h2 className="min-w-0 flex-1 text-[15px] font-semibold text-[#0A2F32] truncate">{title}</h2>
        {canToggle && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#EEEAE3] bg-white text-[#0A3330] shadow-[0_4px_12px_-8px_rgba(10,47,50,0.28)] hover:border-[#C5A059]/40 hover:text-[#0A2F32] transition-colors"
            aria-expanded={expanded}
            aria-label={expanded ? 'Show cards' : 'Show list'}
            title={expanded ? 'Show cards' : 'Show list'}
          >
            {expanded ? (
              <LayoutGrid size={18} strokeWidth={1.9} />
            ) : (
              <List size={18} strokeWidth={1.9} />
            )}
          </button>
        )}
      </div>
      {items.length === 0 ? (
        <p className="text-[13px] text-[#7A7266] leading-snug">{emptyLabel}</p>
      ) : expanded && canToggle ? (
        <div className="flex flex-col gap-3">
          {items.map(({ gem, title: gemTitle, categories }) => (
            <ExploreGemCard
              key={`${categoryKey}-v-${gem.id}`}
              gem={gem}
              title={gemTitle}
              categoryLine={categories.join(' · ') || title}
              propertyId={propertyId}
              typeId={typeId}
              mapAreaHint={mapAreaHint}
              layout="vertical"
            />
          ))}
        </div>
      ) : (
        <>
          <div
            ref={scrollRef}
            onScroll={updateActiveIndex}
            className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none snap-x snap-mandatory"
          >
            {items.map(({ gem, title: gemTitle, categories }) => (
              <ExploreGemCard
                key={`${categoryKey}-h-${gem.id}`}
                gem={gem}
                title={gemTitle}
                categoryLine={categories.join(' · ') || title}
                propertyId={propertyId}
                typeId={typeId}
                mapAreaHint={mapAreaHint}
                layout="horizontal"
              />
            ))}
          </div>
          {items.length > 1 && (
            <div className="flex items-center justify-center gap-1.5 mt-3">
              {items.map(({ gem }, i) => (
                <button
                  key={`${categoryKey}-dot-${gem.id}`}
                  type="button"
                  aria-label={`View place ${i + 1} of ${items.length}`}
                  aria-current={i === activeIndex ? 'true' : undefined}
                  onClick={() => scrollToIndex(i)}
                  className={`rounded-full transition-all duration-300 ${
                    i === activeIndex
                      ? 'h-2 w-2 bg-[#C5A059] scale-110'
                      : 'h-1.5 w-1.5 bg-[#0A2F32]/20 hover:bg-[#0A2F32]/35'
                  }`}
                />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function ExploreGemCard({
  gem,
  title,
  categoryLine,
  propertyId,
  typeId,
  mapAreaHint,
  layout = 'horizontal',
}: {
  gem: ExploreGem;
  title: string;
  categoryLine: string;
  propertyId: string;
  typeId: string;
  mapAreaHint: string;
  layout?: 'horizontal' | 'vertical';
}) {
  const saveItem = gemToSaveInput(gem, title, categoryLine.split(' · ')[0] || 'Local gem');
  const vertical = layout === 'vertical';
  const mapLinks = getItemMapLinks(
    {
      title,
      googleMapsUrl: gem.googleMapsUrl,
      googlePlaceId: gem.googlePlaceId,
      latitude: gem.latitude,
      longitude: gem.longitude,
    },
    mapAreaHint
  );
  const canView = isValidExternalUrl(mapLinks.googleMapsUrl);
  const canGo = isValidExternalUrl(mapLinks.navigateUrl);

  return (
    <article
      className={
        vertical
          ? 'w-full flex flex-col gap-2 rounded-[0.9rem] border border-[#EEEAE3] bg-white p-2 shadow-[0_8px_20px_-14px_rgba(10,47,50,0.28)]'
          : 'w-[min(11.5rem,42vw)] shrink-0 snap-start'
      }
    >
      <div className={vertical ? 'flex gap-3' : ''}>
        <div
          className={`relative overflow-hidden rounded-[0.85rem] bg-[#ECEAE4] ${
            vertical ? 'h-[5.5rem] w-[5.5rem] shrink-0 aspect-square' : 'aspect-[4/3]'
          }`}
        >
          {gem.photoUrl ? (
            <MirroredPhotoImg
              src={gem.photoUrl}
              alt={title}
              className="h-full w-full object-cover"
              mirrorContext={{ propertyId, propertyTypeId: typeId }}
            />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-[#0A3D3A] to-[#041C1E]" />
          )}
          <div className="absolute top-2 right-2">
            <PickSaveButton
              propertyId={propertyId}
              typeId={typeId}
              item={saveItem}
              variant="icon-overlay"
              size="sm"
            />
          </div>
          {gem.rating != null && Number(gem.rating) > 0 && (
            <span className="absolute bottom-2 left-2 inline-flex items-center gap-0.5 rounded-full bg-white/95 px-1.5 py-0.5 text-[11px] font-semibold text-[#0A2F32] shadow-sm">
              <Star size={10} className="fill-[#E7C46F] text-[#E7C46F]" />
              {Number(gem.rating).toFixed(1)}
            </span>
          )}
        </div>
        <div className={`min-w-0 ${vertical ? 'flex-1 py-0.5 pr-1' : 'mt-2 px-0.5'}`}>
          <h3 className="text-[13px] font-semibold text-[#0A2F32] leading-snug truncate">
            {title}
          </h3>
          <p className="mt-0.5 text-[11px] text-[#7A7266] leading-snug line-clamp-1">
            {categoryLine}
          </p>
          {gem.distanceKm != null && Number.isFinite(Number(gem.distanceKm)) && (
            <p className="mt-1 flex items-center gap-1 text-[11px] text-[#7A7266]">
              <MapPin size={11} className="shrink-0" />
              {Number(gem.distanceKm).toFixed(1)} km
            </p>
          )}
        </div>
      </div>

      {(canView || canGo) && (
        <div className={`flex gap-1.5 ${vertical ? 'pt-0.5' : 'mt-2'}`}>
          {canView && (
            <button
              type="button"
              onClick={() => openExternalUrl(mapLinks.googleMapsUrl)}
              className="flex-1 min-h-[34px] rounded-lg border border-[#E8DFD0] bg-[#FCFAF6] text-[#0A2F32] text-[11px] font-semibold inline-flex items-center justify-center gap-1 hover:bg-[#F3EEE4] transition-colors"
            >
              <MapIcon size={12} className="shrink-0 text-[#C5A059]" />
              View map
            </button>
          )}
          {canGo && (
            <button
              type="button"
              onClick={() => openExternalUrl(mapLinks.navigateUrl)}
              className="flex-1 min-h-[34px] rounded-lg bg-[#0A4544] text-white text-[11px] font-semibold inline-flex items-center justify-center gap-1 hover:bg-[#083937] transition-colors"
            >
              <Navigation size={12} className="shrink-0" />
              Navigate
            </button>
          )}
        </div>
      )}
    </article>
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
