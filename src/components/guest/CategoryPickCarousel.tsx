import { useRef, useState, useEffect, useCallback } from 'react';
import { Map as MapIcon, Navigation, Car, Image as ImageIcon } from 'lucide-react';
import { getItemMapLinks } from '../../lib/geocoding';

const CARD_WIDTH = 288;
const CARD_GAP = 16;

type PickItem = {
  title: string;
  description?: string;
  estimatedDistance?: string;
  beyondRadius?: boolean;
  source?: string;
  photoUrl?: string;
  googleMapsUrl?: string;
  latitude?: number;
  longitude?: number;
  navigateUrl?: string;
};

type CategoryPickCarouselProps = {
  categoryName: string;
  items: PickItem[];
  mapAreaHint: string;
};

export default function CategoryPickCarousel({
  categoryName,
  items,
  mapAreaHint,
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
            <div className="relative h-40 bg-[#eef3f2]">
              {item.photoUrl ? (
                <img
                  src={item.photoUrl}
                  alt={item.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[#0B4F5C]/25">
                  <ImageIcon size={36} strokeWidth={1.5} />
                </div>
              )}
              {item.beyondRadius && (
                <span className="absolute top-3 left-3 bg-amber-500/95 text-white text-[9px] font-semibold px-2.5 py-1 rounded-full uppercase tracking-wider shadow-sm">
                  Extended range
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

              <p className="text-sm text-gray-600 leading-relaxed mb-3 flex-1 line-clamp-4">
                {item.description}
              </p>

              <p
                className={`text-[11px] font-semibold flex items-center mb-3 ${
                  item.beyondRadius ? 'text-amber-700' : 'text-[#0B4F5C]/70'
                }`}
              >
                <Car size={12} className="mr-1.5 shrink-0" strokeWidth={2} />
                {item.estimatedDistance}
              </p>

              <div className="flex gap-2 mt-auto pt-3 border-t border-gray-100">
                {(() => {
                  const links = getItemMapLinks(item, mapAreaHint);
                  return (
                    <>
                      <a
                        href={links.googleMapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 py-2.5 bg-[#f8faf9] border border-[#0B4F5C]/10 hover:border-[#0B4F5C]/30 text-[#0B4F5C] rounded-xl text-[10px] font-semibold uppercase tracking-wider flex items-center justify-center transition-colors"
                      >
                        <MapIcon size={14} className="mr-1" /> View
                      </a>
                      <a
                        href={links.navigateUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 py-2.5 bg-[#0B4F5C] hover:bg-[#0a4550] text-white rounded-xl text-[10px] font-semibold uppercase tracking-wider flex items-center justify-center transition-colors shadow-sm"
                      >
                        <Navigation size={14} className="mr-1" /> Directions
                      </a>
                    </>
                  );
                })()}
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
