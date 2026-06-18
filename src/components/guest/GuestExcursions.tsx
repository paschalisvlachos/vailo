import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  Calendar,
  Check,
  Clock,
  Compass,
  Loader2,
  MapPin,
  Sparkles,
  X,
} from 'lucide-react';
import { GUEST_PORTAL_Z } from '../../lib/guestPortalLayers';
import { resolvePropertyTypeAreaContext } from '../../lib/listingAreaContext';
import {
  excursionDurationLabel,
  excursionLowestAdultPrice,
  excursionTravelStyleLabel,
  formatExcursionPrice,
} from '../../lib/excursion';
import {
  loadGuestExcursionsForArea,
  type GuestExcursionListing,
} from '../../lib/guestExcursions';
import GuestExcursionBookingSheet from './GuestExcursionBookingSheet';

type Props = {
  propertyType?: { country?: string; city?: string };
  onClose: () => void;
  onOverlayOpenChange?: (open: boolean) => void;
};

function categoryIcon(name: string) {
  const n = name.toLowerCase();
  if (n.includes('boat') || n.includes('sea') || n.includes('water')) return Compass;
  if (n.includes('food') || n.includes('wine') || n.includes('culinary')) return Sparkles;
  return Compass;
}

type DetailSection = {
  title: string;
  content: string | string[];
  variant?: 'list' | 'prose' | 'check' | 'cross';
};

function ExcursionDetailSheet({
  listing,
  onClose,
  onBook,
}: {
  listing: GuestExcursionListing;
  onClose: () => void;
  onBook: () => void;
}) {
  const { excursion, providerName } = listing;
  const lowestPrice = excursionLowestAdultPrice(excursion);
  const priceLabel =
    lowestPrice != null
      ? formatExcursionPrice(lowestPrice, excursion.currency, {
          from: excursion.showPriceFrom !== false,
        })
      : null;

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const infoSections: DetailSection[] = [];
  if (excursion.description?.trim()) {
    infoSections.push({ title: 'Overview', content: excursion.description.trim(), variant: 'prose' });
  }
  if (excursion.programBreakdown?.trim()) {
    infoSections.push({ title: 'Program', content: excursion.programBreakdown.trim(), variant: 'prose' });
  }
  if (excursion.programDetails?.trim()) {
    infoSections.push({ title: 'Details', content: excursion.programDetails.trim(), variant: 'prose' });
  }
  if (excursion.participationRequirements?.trim()) {
    infoSections.push({
      title: 'Requirements',
      content: excursion.participationRequirements.trim(),
      variant: 'prose',
    });
  }
  if (excursion.included?.length) {
    infoSections.push({ title: 'Included', content: excursion.included, variant: 'check' });
  }
  if (excursion.notIncluded?.length) {
    infoSections.push({ title: 'Not included', content: excursion.notIncluded, variant: 'cross' });
  }
  if (excursion.whatToBring?.length) {
    infoSections.push({ title: 'What to bring', content: excursion.whatToBring, variant: 'list' });
  }
  if (excursion.notes?.trim()) {
    infoSections.push({ title: 'Good to know', content: excursion.notes.trim(), variant: 'prose' });
  }
  if (excursion.additionalInfo?.trim()) {
    infoSections.push({
      title: 'Additional info',
      content: excursion.additionalInfo.trim(),
      variant: 'prose',
    });
  }

  return (
    <div
      className={`fixed inset-0 ${GUEST_PORTAL_Z.detailSheet} flex items-end sm:items-center justify-center bg-[#051F26]/60 backdrop-blur-md p-0 sm:p-5`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="excursion-detail-title"
      onClick={onClose}
    >
      <div
        className="bg-[#F8FAFA] w-full sm:max-w-lg max-h-[94vh] rounded-t-[28px] sm:rounded-[28px] shadow-[0_24px_80px_rgba(5,31,38,0.35)] flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-1 sm:hidden shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-300/80" aria-hidden />
        </div>

        <div className="overflow-y-auto flex-1 overscroll-contain">
          <div className="relative">
            <div className="relative aspect-[4/3] sm:aspect-[16/10] bg-[#083A43] overflow-hidden">
              {excursion.heroPhotoUrl ? (
                <img
                  src={excursion.heroPhotoUrl}
                  alt=""
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[#C5A059]/80">
                  <Compass size={48} strokeWidth={1.25} />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-[#051F26]/90 via-[#051F26]/25 to-[#051F26]/10" />
              <button
                type="button"
                onClick={onClose}
                className="absolute top-4 right-4 p-2.5 rounded-full bg-white/15 backdrop-blur-md border border-white/20 text-white hover:bg-white/25 transition-colors"
                aria-label="Close"
              >
                <X size={18} />
              </button>
              {excursion.categories?.[0] && (
                <span className="absolute top-4 left-4 guest-badge bg-white/15 backdrop-blur-md border border-white/20 text-white">
                  {excursion.categories[0]}
                </span>
              )}
              <div className="absolute bottom-0 inset-x-0 px-6 pb-6 pt-16">
                {excursion.subtitle && (
                  <p className="guest-eyebrow text-[#C5A059]/95 mb-2">{excursion.subtitle}</p>
                )}
                <h2
                  id="excursion-detail-title"
                  className="font-luxury text-[1.625rem] sm:text-[1.75rem] text-white font-medium leading-[1.15] tracking-tight"
                >
                  {excursion.title}
                </h2>
                <p className="text-sm text-white/75 mt-2">Hosted by {providerName}</p>
              </div>
            </div>

            <div className="relative -mt-5 mx-5 mb-6">
              <div className="rounded-2xl bg-white border border-gray-100 shadow-[0_8px_30px_rgba(11,79,92,0.08)] px-4 py-4 flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-2 text-sm text-[#051F26]">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#0B4F5C]/8 text-[#0B4F5C]">
                    <Clock size={16} />
                  </span>
                  {excursionDurationLabel(excursion)}
                </span>
                <span className="inline-flex items-center gap-2 text-sm text-[#051F26]">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#0B4F5C]/8 text-[#0B4F5C]">
                    <Calendar size={16} />
                  </span>
                  {excursionTravelStyleLabel(excursion)}
                </span>
                {priceLabel && (
                  <span className="ml-auto font-luxury text-lg text-[#0B4F5C] font-medium">
                    {priceLabel}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="px-6 pb-32 space-y-6">
            {excursion.meetingPoint && (
              <div className="rounded-2xl bg-white border border-gray-100 px-5 py-4 shadow-sm">
                <p className="guest-eyebrow mb-2">Meeting point</p>
                <div className="flex items-start gap-3">
                  <MapPin size={18} className="text-[#C5A059] shrink-0 mt-0.5" />
                  <p className="text-[15px] text-gray-700 leading-relaxed">{excursion.meetingPoint}</p>
                </div>
              </div>
            )}

            {infoSections.map((section) => (
              <div
                key={section.title}
                className="rounded-2xl bg-white border border-gray-100 px-5 py-5 shadow-sm"
              >
                <h3 className="font-luxury text-lg text-[#051F26] font-medium mb-3">
                  {section.title}
                </h3>
                {section.variant === 'check' || section.variant === 'cross' ? (
                  <ul className="space-y-2.5">
                    {(section.content as string[]).map((item) => (
                      <li key={item} className="flex items-start gap-3 text-[15px] text-gray-700 leading-relaxed">
                        <span
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full mt-0.5 ${
                            section.variant === 'check'
                              ? 'bg-[#0B4F5C]/10 text-[#0B4F5C]'
                              : 'bg-gray-100 text-gray-400'
                          }`}
                        >
                          {section.variant === 'check' ? (
                            <Check size={12} strokeWidth={2.5} />
                          ) : (
                            <X size={12} strokeWidth={2.5} />
                          )}
                        </span>
                        {item}
                      </li>
                    ))}
                  </ul>
                ) : Array.isArray(section.content) ? (
                  <ul className="space-y-2 text-[15px] text-gray-700 leading-relaxed list-disc pl-5 marker:text-[#C5A059]">
                    {section.content.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[15px] text-gray-700 leading-[1.7] whitespace-pre-wrap">
                    {section.content}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="shrink-0 border-t border-gray-200/80 bg-white/95 backdrop-blur-md px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-8px_32px_rgba(5,31,38,0.06)]">
          <div className="flex items-center gap-4">
            {priceLabel && (
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">From</p>
                <p className="font-luxury text-xl text-[#051F26] font-medium truncate">{priceLabel}</p>
              </div>
            )}
            <button
              type="button"
              onClick={onBook}
              className="guest-btn-action flex-1 bg-[#0B4F5C] text-white hover:bg-[#083A43] shadow-[0_4px_20px_rgba(11,79,92,0.25)]"
            >
              {excursion.bookingMode === 'instant' ? 'Book now' : 'Request to book'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function GuestExcursions({
  propertyType,
  onClose,
  onOverlayOpenChange,
}: Props) {
  const [listings, setListings] = useState<GuestExcursionListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [selected, setSelected] = useState<GuestExcursionListing | null>(null);
  const [bookingListing, setBookingListing] = useState<GuestExcursionListing | null>(null);

  const overlayOpen = selected != null || bookingListing != null;

  useEffect(() => {
    onOverlayOpenChange?.(overlayOpen);
  }, [overlayOpen, onOverlayOpenChange]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const { ctx } = await resolvePropertyTypeAreaContext(propertyType);
        if (!ctx) {
          if (!cancelled) setListings([]);
          return;
        }

        const items = await loadGuestExcursionsForArea(ctx);
        if (!cancelled) setListings(items);
      } catch (error) {
        console.error(error);
        if (!cancelled) setListings([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [propertyType?.country, propertyType?.city]);

  const categories = useMemo(
    () => [
      'All',
      ...Array.from(
        new Set(listings.flatMap((l) => l.excursion.categories || []).filter(Boolean))
      ),
    ],
    [listings]
  );

  const filtered = useMemo(
    () =>
      categoryFilter === 'All'
        ? listings
        : listings.filter((l) => l.excursion.categories?.includes(categoryFilter)),
    [listings, categoryFilter]
  );

  return (
    <>
      <div className="guest-mobile fixed inset-0 z-50 flex flex-col bg-[#F3F4F6] md:relative md:h-[800px] md:rounded-3xl md:overflow-hidden md:shadow-2xl md:border md:border-[#0B4F5C]/5">
        <header className="relative shrink-0 overflow-hidden border-b border-[#0B4F5C]/8">
          <div className="absolute inset-0 bg-gradient-to-br from-[#EAF2F2] via-white to-[#FDF9F3]" />
          <div className="absolute -top-12 -right-8 w-44 h-44 bg-[#C5A059]/14 blur-3xl rounded-full pointer-events-none" />
          <div className="absolute -bottom-10 -left-10 w-36 h-36 bg-[#0B4F5C]/10 blur-3xl rounded-full pointer-events-none" />

          <div className="relative px-4 py-3 flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="h-11 w-11 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full bg-white/90 border border-[#0B4F5C]/10 text-[#0B4F5C] shadow-[0_2px_12px_rgba(11,79,92,0.08)] hover:border-[#C5A059]/35 transition-all"
              aria-label="Back to portal"
            >
              <ArrowLeft size={20} />
            </button>

            <div className="flex-1 min-w-0">
              <p className="guest-eyebrow">Explore the area</p>
              <h2 className="font-luxury text-lg sm:text-xl leading-tight text-[#051F26] font-medium mt-0.5 truncate">
                Excursions
              </h2>
            </div>

            <div className="h-9 w-9 rounded-full bg-gradient-to-br from-[#0B4F5C] to-[#083A43] flex items-center justify-center shadow-lg shrink-0">
              <Compass size={18} className="text-[#C5A059]" />
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-6 pb-28">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-[#0B4F5C]/70">
              <Loader2 size={28} className="animate-spin mb-3" />
              <p className="text-sm text-gray-500">Loading experiences…</p>
            </div>
          ) : listings.length === 0 ? (
            <div className="text-center py-16 px-4">
              <div className="mx-auto mb-4 h-14 w-14 rounded-2xl bg-[#0B4F5C]/8 flex items-center justify-center text-[#0B4F5C]">
                <Compass size={26} />
              </div>
              <p className="font-luxury text-lg text-[#051F26] mb-2">No excursions yet</p>
              <p className="text-sm text-gray-500 leading-relaxed">
                There are no published experiences in your area right now. Check back later or ask
                your host for recommendations.
              </p>
            </div>
          ) : (
            <>
              <p className="guest-body-sm mb-4">
                {filtered.length} experience{filtered.length !== 1 ? 's' : ''} · book with local
                providers
              </p>

              {categories.length > 1 && (
                <div className="flex flex-wrap gap-1.5 pb-4">
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setCategoryFilter(cat ?? 'All')}
                      className={`guest-pill whitespace-nowrap rounded-full text-sm uppercase tracking-wider font-semibold transition-all ${
                        categoryFilter === cat
                          ? 'bg-[#0B4F5C] text-white shadow-md'
                          : 'bg-white text-gray-500 border border-gray-200/80 hover:border-[#0B4F5C]/30'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              )}

              <div className="space-y-2">
                {filtered.map((listing) => {
            const { excursion, providerName } = listing;
            const category = excursion.categories?.[0] || 'Excursion';
            const CatIcon = categoryIcon(category);
            const lowestPrice = excursionLowestAdultPrice(excursion);
            const priceLabel =
              lowestPrice != null
                ? formatExcursionPrice(lowestPrice, excursion.currency, {
                    from: excursion.showPriceFrom !== false,
                  })
                : null;

            return (
              <div key={`${listing.providerId}-${excursion.id}`}>
                <span className="guest-badge inline-flex items-center gap-1.5 rounded-md bg-[#0B4F5C]/8 text-[#0B4F5C] mb-1">
                  <CatIcon size={12} />
                  {category}
                </span>
                <button
                  type="button"
                  onClick={() => setSelected(listing)}
                  className="w-full text-left bg-white rounded-xl border border-gray-200/90 shadow-[0_2px_12px_rgba(11,79,92,0.06)] p-3 flex gap-3 hover:border-[#0B4F5C]/25 hover:shadow-md transition-all active:scale-[0.99]"
                >
                  <div className="h-[72px] w-[72px] rounded-lg overflow-hidden bg-gray-100 shrink-0">
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
                  <div className="flex-1 min-w-0 flex flex-col justify-center">
                    <h3 className="guest-card-title mb-1 truncate">{excursion.title}</h3>
                    {excursion.subtitle && (
                      <p className="text-sm text-gray-500 line-clamp-1 leading-snug mb-1">
                        {excursion.subtitle}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
                      <span>{excursionDurationLabel(excursion)}</span>
                      <span aria-hidden>·</span>
                      <span>{providerName}</span>
                    </div>
                    {priceLabel && (
                      <p className="text-sm font-semibold text-[#0B4F5C] mt-1.5">{priceLabel}</p>
                    )}
                  </div>
                </button>
              </div>
            );
                })}
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
              setBookingListing(selected);
              setSelected(null);
            }}
          />,
          document.body
        )}

      {bookingListing && (
        <GuestExcursionBookingSheet
          listing={bookingListing}
          onClose={() => setBookingListing(null)}
        />
      )}
    </>
  );
}
