import { useRef, useState, useEffect, useCallback } from 'react';
import { Map as MapIcon, Navigation, Car, Eye } from 'lucide-react';
import { getItemMapLinks } from '../../lib/geocoding';
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
};

export default function CategoryPickCarousel({
  categoryName,
  items,
  mapAreaHint,
  propertyId,
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

  if (!items?.length) return null;

  return (
    <div className="mb-2">
      <div className="mb-3">
        <h4 className="font-semibold text-[#0B4F5C] text-base tracking-tight">
          {categoryName}
        </h4>
        <p className="text-xs text-[#0B4F5C]/55 mt-0.5">
          {items.length} local {items.length === 1 ? 'pick' : 'picks'} · nearest first
        </p>
      </div>

      <div
        ref={scrollRef}
        onScroll={updateActiveIndex}
        className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-1 -mx-1 px-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((item, i) => (
          <article
            key={`${item.title}-${i}`}
            className="w-[288px] shrink-0 snap-start snap-always bg-white border border-[#0B4F5C]/8 rounded-2xl overflow-hidden flex flex-col shadow-[0_8px_30px_rgba(11,79,92,0.08)]"
          >
            <div className="relative">
              <PlanImage
                src={item.photoUrl}
                alt={item.title}
                className="w-full h-40 object-cover bg-[#eef3f2]"
                fallbackClassName="w-full h-40"
              />
              {item.beyondRadius && (
                <span className="absolute top-3 left-3 bg-amber-500/95 text-white text-[9px] font-semibold px-2.5 py-1 rounded-full uppercase tracking-wider shadow-sm">
                  Extended range
                </span>
              )}
              {item.previouslyShown && (
                <span className="absolute top-3 right-3 bg-white/90 text-[#0B4F5C] text-[9px] font-semibold px-2.5 py-1 rounded-full uppercase tracking-wider shadow-sm border border-[#0B4F5C]/15 flex items-center gap-1">
                  <Eye size={10} strokeWidth={2.2} /> Seen before
                </span>
              )}
            </div>

            <div className="p-4 flex flex-col flex-1">
              <div className="flex flex-wrap gap-1.5 items-start mb-2">
                <h5 className="font-semibold text-gray-900 flex-1 min-w-0 leading-snug">
                  {item.title}
                </h5>
                {item.source === 'database' && (
                  <span className="bg-[#C5A059]/12 text-[#8a6d2e] text-[9px] px-2 py-0.5 rounded-full uppercase tracking-wider font-semibold shrink-0">
                    Vailo pick
                  </span>
                )}
              </div>

              <ExpandableDescription
                text={item.description}
                lines={3}
                className="mb-3 flex-1"
              />

              <p
                className={`text-[11px] font-semibold flex items-center mb-3 ${
                  item.beyondRadius ? 'text-amber-700' : 'text-[#0B4F5C]/70'
                }`}
              >
                <Car size={12} className="mr-1.5 shrink-0" strokeWidth={2} />
                {item.estimatedDistance}
              </p>

              <div className="flex items-center justify-between gap-2 mt-auto pt-3 border-t border-gray-100">
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
                <div className="flex gap-2 flex-1">
                  {(() => {
                    const links = getItemMapLinks(item, mapAreaHint);
                    return (
                      <>
                        <a
                          href={links.googleMapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 py-2 bg-[#f8faf9] border border-[#0B4F5C]/10 hover:border-[#0B4F5C]/30 text-[#0B4F5C] rounded-lg text-[10px] font-semibold uppercase tracking-wider flex items-center justify-center transition-colors"
                        >
                          <MapIcon size={13} className="mr-1" /> View
                        </a>
                        <a
                          href={links.navigateUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 py-2 bg-[#0B4F5C] hover:bg-[#0a4550] text-white rounded-lg text-[10px] font-semibold uppercase tracking-wider flex items-center justify-center transition-colors shadow-sm"
                        >
                          <Navigation size={13} className="mr-1" /> Go
                        </a>
                      </>
                    );
                  })()}
                </div>
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
                  ? 'w-2 h-2 bg-[#C5A059] scale-110'
                  : 'w-1.5 h-1.5 bg-[#0B4F5C]/20 hover:bg-[#0B4F5C]/35'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
