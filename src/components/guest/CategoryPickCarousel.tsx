import { useRef, useState, useEffect, useCallback } from 'react';
import LocalPickCard from './LocalPickCard';

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

type UnverifiedMention = {
  title: string;
  description?: string;
  failureReason?: string;
};

type CategoryPickCarouselProps = {
  categoryName: string;
  items: PickItem[];
  unverifiedMentions?: UnverifiedMention[];
  mapAreaHint: string;
  propertyId?: string;
  typeId?: string;
  viewMapLabel?: string;
  goMapLabel?: string;
  emptyMessage?: string;
  rangeSuffix?: string;
};

export default function CategoryPickCarousel({
  categoryName,
  items,
  unverifiedMentions = [],
  mapAreaHint,
  propertyId,
  typeId,
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
    if (!emptyMessage && unverifiedMentions.length === 0) return null;
    return (
      <div className="mb-2 min-w-0 max-w-full">
        <div className="mb-3">
          <h4 className="font-semibold text-white text-base tracking-tight">
            {categoryName}
          </h4>
        </div>
        {emptyMessage && (
          <p className="text-sm text-white/55 leading-relaxed rounded-2xl border border-white/10 bg-white/5 px-4 py-3 mb-3">
            {emptyMessage}
          </p>
        )}
        {unverifiedMentions.length > 0 && (
          <UnverifiedMentionsBlock mentions={unverifiedMentions} />
        )}
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
          <LocalPickCard
            key={`${item.title}-${i}`}
            item={{ ...item, itemType: 'pick' }}
            categoryName={categoryName}
            mapAreaHint={mapAreaHint}
            propertyId={propertyId}
            typeId={typeId}
            viewMapLabel={viewMapLabel}
            goMapLabel={goMapLabel}
            mode="results"
          />
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

      {unverifiedMentions.length > 0 && (
        <UnverifiedMentionsBlock mentions={unverifiedMentions} />
      )}
    </div>
  );
}

function UnverifiedMentionsBlock({ mentions }: { mentions: UnverifiedMention[] }) {
  return (
    <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-white/45 mb-2">
        Also suggested
      </p>
      <ul className="space-y-2">
        {mentions.map((m, i) => (
          <li key={`${m.title}-${i}`} className="text-sm text-white/65 leading-relaxed">
            <span className="font-medium text-white/80">{m.title}</span>
            {m.description ? ` — ${m.description}` : ''}
          </li>
        ))}
      </ul>
    </div>
  );
}
