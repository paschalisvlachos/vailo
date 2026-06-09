import { useRef, useState, useEffect, useCallback } from 'react';
import { Car, Eye } from 'lucide-react';
import MapLinkButtons from './MapLinkButtons';
import ExpandableDescription from './ExpandableDescription';
import PickFeedbackButtons from './PickFeedbackButtons';
import PlanImage from './PlanImage';

const CARD_WIDTH = 288;
const CARD_GAP = 16;

type PickItem = {
  title: string;
  description?: string;
  estimatedDistance?: string;
  beyondRadius?: boolean;
  previouslyShown?: boolean;
  source?: string;
  photoUrl?: string;
  googleMapsUrl?: string;
  googlePlaceId?: string;
  latitude?: number;
  longitude?: number;
  navigateUrl?: string;
};

type CategoryPickCarouselProps = {
  categoryName: string;
  items: PickItem[];
  mapAreaHint: string;
  propertyId?: string;
  viewMapLabel?: string;
  goMapLabel?: string;
  emptyMessage?: string;
  rangeSuffix?: string;
};

export default function CategoryPickCarousel({
  categoryName,
  items,
  mapAreaHint,
  propertyId,
  viewMapLabel = 'View',
  goMapLabel = 'Go',
  emptyMessage,
  rangeSuffix = 'nearest first',
}: CategoryPickCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const stride = CARD_WIDTH + CARD_GAP;

  const updateActiveIndex = useCallback(() => {
    const el = scrollRef.current;
    if (!el || items.length === 0) return;
    const index = Math.round(el.scrollLeft / stride);
    setActiveIndex(Math.min(Math.max(index, 0), items.length - 1));
  }, [items.length, stride]);

  useEffect(() => {
    setActiveIndex(0);
    scrollRef.current?.scrollTo({ left: 0 });
  }, [categoryName, items.length]);

  const scrollToIndex = (index: number) => {
    scrollRef.current?.scrollTo({ left: index * stride, behavior: 'smooth' });
    setActiveIndex(index);
  };

  if (!items?.length) {
    if (!emptyMessage) return null;
    return (
      <div className="mb-2 min-w-0 max-w-full">
        <div className="mb-3">
          <h4 className="font-semibold text-white text-base tracking-tight">
            {categoryName}
          </h4>
        </div>
        <p className="text-sm text-white/55 leading-relaxed rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
          {emptyMessage}
        </p>
      </div>
    );
  }

  return (
    <div className="mb-2 min-w-0 max-w-full">
      <div className="mb-3">
        <h4 className="font-semibold text-white text-base tracking-tight">
          {categoryName}
        </h4>
        <p className="text-sm text-white/55 mt-0.5">
          {items.length} local {items.length === 1 ? 'pick' : 'picks'} · {rangeSuffix}
        </p>
      </div>

      <div
        ref={scrollRef}
        onScroll={updateActiveIndex}
        className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-1 max-w-full [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((item, i) => (
          <article
            key={`${item.title}-${i}`}
            className="w-[min(288px,calc(100vw-3rem))] shrink-0 snap-start snap-always bg-white/8 border border-white/10 rounded-2xl overflow-hidden flex flex-col"
          >
            <div className="relative">
              <PlanImage
                src={item.photoUrl}
                alt={item.title}
                className="w-full h-40 object-cover bg-vailo-teal-hover/50"
                fallbackClassName="w-full h-40"
              />
              {item.beyondRadius && (
                <span className="guest-badge absolute top-3 left-3 bg-amber-500/95 text-white shadow-sm">
                  Extended range
                </span>
              )}
              {item.previouslyShown && (
                <span className="guest-badge absolute top-3 right-3 bg-vailo-teal/90 text-white shadow-sm border border-white/15 flex items-center gap-1">
                  <Eye size={11} strokeWidth={2.2} /> Seen before
                </span>
              )}
            </div>

            <div className="p-4 flex flex-col flex-1">
              <div className="flex flex-wrap gap-1.5 items-start mb-2">
                <h5 className="font-semibold text-white flex-1 min-w-0 leading-snug">
                  {item.title}
                </h5>
                {item.source === 'database' && (
                  <span className="guest-badge bg-vailo-gold/20 text-vailo-gold border border-vailo-gold/25 shrink-0">
                    Vailo pick
                  </span>
                )}
              </div>

              <ExpandableDescription
                text={item.description}
                lines={3}
                className="mb-3 flex-1"
                bodyClassName="text-sm text-white/70 leading-relaxed"
                toggleClassName="mt-1.5 text-sm font-semibold normal-case tracking-wide text-vailo-gold hover:text-white transition-colors min-h-[44px]"
              />

              <p
                className={`text-sm font-semibold flex items-center mb-3 ${
                  item.beyondRadius ? 'text-amber-300' : 'text-white/65'
                }`}
              >
                <Car size={12} className="mr-1.5 shrink-0" strokeWidth={2} />
                {item.estimatedDistance}
              </p>

              <div className="flex items-center justify-between gap-2 mt-auto pt-3 border-t border-white/10">
                <PickFeedbackButtons
                  propertyId={propertyId}
                  item={{
                    title: item.title,
                    source: item.source,
                    googlePlaceId: item.googlePlaceId,
                    googleMapsUrl: item.googleMapsUrl,
                    latitude: item.latitude,
                    longitude: item.longitude,
                    description: item.description,
                    category: categoryName,
                  }}
                />
                <MapLinkButtons
                  item={item}
                  mapAreaHint={mapAreaHint}
                  viewLabel={viewMapLabel}
                  goLabel={goMapLabel}
                />
              </div>
            </div>
          </article>
        ))}
      </div>

      {items.length > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          {items.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`View pick ${i + 1} of ${items.length}`}
              onClick={() => scrollToIndex(i)}
              className={`rounded-full transition-all duration-300 ${
                i === activeIndex
                  ? 'w-2 h-2 bg-vailo-gold scale-110'
                  : 'w-1.5 h-1.5 bg-white/25 hover:bg-white/40'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
