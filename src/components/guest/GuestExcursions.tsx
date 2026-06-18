import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, Clock, Compass, MapPin, Sparkles, X } from 'lucide-react';
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
  onOverlayOpenChange?: (open: boolean) => void;
  onListingCountChange?: (count: number) => void;
  sectionRef?: RefObject<HTMLElement | null>;
};

function categoryIcon(name: string) {
  const n = name.toLowerCase();
  if (n.includes('boat') || n.includes('sea') || n.includes('water')) return Compass;
  if (n.includes('food') || n.includes('wine') || n.includes('culinary')) return Sparkles;
  return Compass;
}

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

  const infoSections: { title: string; content: string | string[] }[] = [];
  if (excursion.programBreakdown?.trim()) {
    infoSections.push({ title: 'Program', content: excursion.programBreakdown.trim() });
  }
  if (excursion.programDetails?.trim()) {
    infoSections.push({ title: 'Details', content: excursion.programDetails.trim() });
  }
  if (excursion.participationRequirements?.trim()) {
    infoSections.push({
      title: 'Requirements',
      content: excursion.participationRequirements.trim(),
    });
  }
  if (excursion.included?.length) {
    infoSections.push({ title: 'Included', content: excursion.included });
  }
  if (excursion.notIncluded?.length) {
    infoSections.push({ title: 'Not included', content: excursion.notIncluded });
  }
  if (excursion.whatToBring?.length) {
    infoSections.push({ title: 'What to bring', content: excursion.whatToBring });
  }
  if (excursion.notes?.trim()) {
    infoSections.push({ title: 'Notes', content: excursion.notes.trim() });
  }
  if (excursion.additionalInfo?.trim()) {
    infoSections.push({ title: 'Additional info', content: excursion.additionalInfo.trim() });
  }

  return (
    <div
      className={`fixed inset-0 ${GUEST_PORTAL_Z.detailSheet} flex items-end sm:items-center justify-center bg-[#051F26]/55 backdrop-blur-sm p-0 sm:p-4`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="excursion-detail-title"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-md max-h-[92vh] rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-2.5 pb-1 sm:hidden shrink-0 bg-white">
          <div className="w-10 h-1 rounded-full bg-gray-200" aria-hidden />
        </div>

        <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-100 bg-white">
          <h2
            id="excursion-detail-title"
            className="font-luxury text-lg text-[#051F26] font-medium truncate flex-1 min-w-0"
          >
            {excursion.title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-gray-400 hover:text-[#0B4F5C] hover:bg-gray-50 shrink-0"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
          <div className="relative rounded-2xl overflow-hidden bg-gray-100 mb-4 aspect-[16/10]">
            {excursion.heroPhotoUrl ? (
              <img src={excursion.heroPhotoUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[#C5A059] min-h-[140px]">
                <Compass size={36} />
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-[#051F26]/25 via-transparent to-transparent pointer-events-none" />
            {priceLabel && (
              <span className="absolute bottom-3 left-3 z-10 inline-flex items-center px-2.5 py-1 rounded-lg bg-white/95 backdrop-blur-sm text-[#0B4F5C] text-sm font-semibold shadow-sm border border-white/60">
                {priceLabel}
              </span>
            )}
          </div>

          {excursion.subtitle && (
            <p className="text-sm font-medium text-[#0B4F5C] text-center mb-2">
              {excursion.subtitle}
            </p>
          )}

          <div className="flex flex-wrap justify-center gap-2 mb-4">
            <span className="guest-badge inline-flex items-center gap-1.5">
              <Clock size={12} />
              {excursionDurationLabel(excursion)}
            </span>
            <span className="guest-badge inline-flex items-center gap-1.5">
              <Calendar size={12} />
              {excursionTravelStyleLabel(excursion)}
            </span>
          </div>

          <p className="text-xs text-gray-500 text-center mb-4">by {providerName}</p>

          {excursion.description && (
            <p className="text-sm text-gray-600 text-center leading-relaxed mb-5 px-1">
              {excursion.description}
            </p>
          )}

          {excursion.meetingPoint && (
            <div className="flex items-start gap-2 text-sm text-gray-600 mb-4 px-1">
              <MapPin size={16} className="text-[#C5A059] shrink-0 mt-0.5" />
              <span>{excursion.meetingPoint}</span>
            </div>
          )}

          {infoSections.map((section) => (
            <div key={section.title} className="mb-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
                {section.title}
              </h3>
              {Array.isArray(section.content) ? (
                <ul className="text-sm text-gray-600 space-y-1 list-disc pl-4">
                  {section.content.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">
                  {section.content}
                </p>
              )}
            </div>
          ))}

          <button type="button" onClick={onBook} className="guest-btn-action w-full mt-2">
            {excursion.bookingMode === 'instant' ? 'Book now' : 'Request to book'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function GuestExcursions({
  propertyType,
  onOverlayOpenChange,
  onListingCountChange,
  sectionRef,
}: Props) {
  const [listings, setListings] = useState<GuestExcursionListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [selected, setSelected] = useState<GuestExcursionListing | null>(null);
  const [bookingListing, setBookingListing] = useState<GuestExcursionListing | null>(null);
  const onListingCountChangeRef = useRef(onListingCountChange);
  onListingCountChangeRef.current = onListingCountChange;

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
          if (!cancelled) {
            setListings([]);
            onListingCountChangeRef.current?.(0);
          }
          return;
        }

        const items = await loadGuestExcursionsForArea(ctx);
        if (!cancelled) {
          setListings(items);
          onListingCountChangeRef.current?.(items.length);
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setListings([]);
          onListingCountChangeRef.current?.(0);
        }
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
        new Set(
          listings.flatMap((l) => l.excursion.categories || []).filter(Boolean)
        )
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

  if (loading) return null;
  if (listings.length === 0) return null;

  return (
    <>
      <section ref={sectionRef} id="guest-excursions" className="!mt-6 !mb-0 scroll-mt-6">
        <div className="mb-4">
          <p className="guest-eyebrow mb-1">Explore the area</p>
          <h2 className="guest-heading-section">Excursions</h2>
          <p className="guest-body-sm mt-1.5">
            {filtered.length} experience{filtered.length !== 1 ? 's' : ''} · book with local
            providers
          </p>
        </div>

        {categories.length > 1 && (
          <div className="flex flex-wrap gap-1.5 pb-3">
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
      </section>

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
