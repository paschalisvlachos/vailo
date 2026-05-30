import { useRef, useState, useEffect, useCallback } from 'react';
import { Eye, Star } from 'lucide-react';
import AllTrailsTrailEmbed from './AllTrailsTrailEmbed';
import MapLinkButtons from './MapLinkButtons';
import PickFeedbackButtons from './PickFeedbackButtons';
import PlanImage from './PlanImage';
import { useGuestLocale } from '../../context/GuestLocaleContext';
import {
  formatTrailDescriptionDisplay,
  formatTrailRating,
  type TrailPickItem,
} from '../../lib/localTrailsGuest';
import { buildDirectionsFromOriginUrl, isValidExternalUrl } from '../../lib/geocoding';
import { guestUiTFormat } from '../../lib/guestLocaleUi';

const CARD_WIDTH = 288;
const CARD_GAP = 16;

type Props = {
  categoryName: string;
  items: TrailPickItem[];
  propertyId?: string;
  propertyCoords?: { lat: number; lng: number } | null;
  viewMapLabel?: string;
  goMapLabel?: string;
};

function trailActionUrls(
  item: TrailPickItem,
  propertyCoords?: { lat: number; lng: number } | null
): { viewUrl: string; goUrl: string } {
  const viewUrl = String(item.allTrailsUrl || '').trim();
  const lat = item.latitude;
  const lng = item.longitude;
  const goUrl =
    propertyCoords &&
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng)
      ? buildDirectionsFromOriginUrl(propertyCoords, { lat, lng })
      : '';
  return { viewUrl, goUrl };
}

function TrailCard({
  item,
  propertyId,
  categoryName,
  propertyCoords,
  viewMapLabel,
  goMapLabel,
}: {
  item: TrailPickItem;
  propertyId?: string;
  categoryName: string;
  propertyCoords?: { lat: number; lng: number } | null;
  viewMapLabel: string;
  goMapLabel: string;
}) {
  const { t } = useGuestLocale();
  const [expanded, setExpanded] = useState(false);

  const ratingLabel = formatTrailRating(item.rating, item.reviewCount);
  const displayDescription = formatTrailDescriptionDisplay(item.description);
  const hasDetailText = Boolean(displayDescription || item.routeType || item.elevationLabel);
  const canExpand = hasDetailText || Boolean(item.allTrailsEmbedSrc);
  const { viewUrl, goUrl } = trailActionUrls(item, propertyCoords);
  const hasMapActions = isValidExternalUrl(viewUrl) || isValidExternalUrl(goUrl);

  return (
    <article className="w-[min(288px,calc(100vw-3rem))] shrink-0 snap-start snap-always bg-white/8 border border-white/10 rounded-2xl overflow-hidden flex flex-col">
      <div className="relative">
        <PlanImage
          src={item.photoUrl}
          alt={item.title}
          className="w-full h-44 object-cover bg-vailo-teal-hover/50"
          fallbackClassName="w-full h-44"
        />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/55 to-transparent pt-10 pb-3 px-3">
          <div className="flex flex-wrap gap-1.5 items-center">
            {item.difficulty && (
              <span className="guest-badge bg-white/95 text-vailo-teal shadow-sm font-semibold">
                {item.difficulty}
              </span>
            )}
            {item.lengthLabel && (
              <span className="guest-badge bg-black/50 text-white border border-white/20 shadow-sm">
                {item.lengthLabel}
              </span>
            )}
            {ratingLabel && (
              <span className="guest-badge bg-black/50 text-white border border-white/20 shadow-sm inline-flex items-center gap-1">
                <Star size={11} className="text-vailo-gold fill-vailo-gold" strokeWidth={0} />
                {ratingLabel}
              </span>
            )}
          </div>
        </div>
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
        <h5 className="font-semibold text-white leading-snug mb-2">{item.title}</h5>

        {!expanded && displayDescription && (
          <p
            className="text-sm text-white/70 leading-relaxed mb-3 flex-1"
            style={{
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {displayDescription}
          </p>
        )}

        {expanded && (
          <div className="mb-3 flex-1 space-y-3">
            {(item.routeType || item.elevationLabel) && (
              <p className="text-sm text-white/90 leading-relaxed">
                {item.routeType ? <strong>{item.routeType}</strong> : null}
                {item.routeType && item.elevationLabel ? ' · ' : null}
                {item.elevationLabel ? <strong>{item.elevationLabel}</strong> : null}
              </p>
            )}
            {displayDescription ? (
              <p className="text-sm text-white/70 leading-relaxed whitespace-pre-wrap">{displayDescription}</p>
            ) : item.routeType ? (
              <p className="text-sm text-white/60 leading-relaxed">
                {t('aiExpertTrailOpenAllTrailsHint')}
              </p>
            ) : null}
            {item.allTrailsEmbedSrc && (
              <AllTrailsTrailEmbed
                name={item.title}
                embedSrc={item.allTrailsEmbedSrc}
                allTrailsUrl={undefined}
                className="mt-1"
              />
            )}
          </div>
        )}

        {canExpand && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mt-1.5 text-sm font-semibold uppercase tracking-[0.08em] text-vailo-gold hover:text-white transition-colors min-h-[44px] text-left"
          >
            {expanded ? t('less') : t('more')}
          </button>
        )}

        <p
          className={`text-sm font-semibold flex items-center mb-3 ${
            item.beyondRadius ? 'text-amber-300' : 'text-white/65'
          }`}
        >
          {item.estimatedDistance}
        </p>

        <div className="flex items-center justify-between gap-2 mt-auto pt-3 border-t border-white/10">
          <PickFeedbackButtons
            propertyId={propertyId}
            item={{
              title: item.title,
              source: item.source,
              latitude: item.latitude,
              longitude: item.longitude,
              description: item.description,
              category: categoryName,
            }}
          />
          {hasMapActions ? (
            <MapLinkButtons
              item={{
                title: item.title,
                latitude: item.latitude,
                longitude: item.longitude,
              }}
              mapAreaHint=""
              viewLabel={viewMapLabel}
              goLabel={goMapLabel}
              viewUrl={viewUrl}
              goUrl={goUrl}
            />
          ) : null}
        </div>
      </div>
    </article>
  );
}

export default function TrailPickCarousel({
  categoryName,
  items,
  propertyId,
  propertyCoords,
  viewMapLabel = 'View',
  goMapLabel = 'Go',
}: Props) {
  const { locale } = useGuestLocale();
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

  if (!items?.length) return null;

  return (
    <div className="mb-2 min-w-0 max-w-full">
      <div className="mb-3">
        <h4 className="font-semibold text-white text-base tracking-tight">{categoryName}</h4>
        <p className="text-sm text-white/55 mt-0.5">
          {guestUiTFormat(locale, 'aiExpertTrailPicksSub', { count: items.length })}
        </p>
      </div>

      <div
        ref={scrollRef}
        onScroll={updateActiveIndex}
        className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-1 max-w-full [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((item, i) => (
          <TrailCard
            key={`${item.allTrailsId || item.title}-${i}`}
            item={item}
            propertyId={propertyId}
            categoryName={categoryName}
            propertyCoords={propertyCoords}
            viewMapLabel={viewMapLabel}
            goMapLabel={goMapLabel}
          />
        ))}
      </div>

      {items.length > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          {items.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`View trail ${i + 1} of ${items.length}`}
              onClick={() => {
                scrollRef.current?.scrollTo({ left: i * stride, behavior: 'smooth' });
                setActiveIndex(i);
              }}
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
