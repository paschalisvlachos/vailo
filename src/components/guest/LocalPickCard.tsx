import { Car, Eye } from 'lucide-react';
import MapLinkButtons from './MapLinkButtons';
import ExpandableDescription from './ExpandableDescription';
import PickFeedbackButtons from './PickFeedbackButtons';
import PickSaveButton from './PickSaveButton';
import PlanImage from './PlanImage';
import { buildDirectionsFromOriginUrl, isValidExternalUrl } from '../../lib/geocoding';
import type { SavedLocalGemInput } from '../../lib/savedLocalGems';

export type LocalPickCardItem = Omit<SavedLocalGemInput, 'category'> & {
  category?: string;
  previouslyShown?: boolean;
};

type Props = {
  item: LocalPickCardItem;
  categoryName: string;
  mapAreaHint: string;
  propertyId?: string;
  typeId?: string;
  viewMapLabel: string;
  goMapLabel: string;
  /** results = Save on distance row; saved = Remove on distance row */
  mode?: 'results' | 'saved';
  propertyCoords?: { lat: number; lng: number } | null;
  className?: string;
};

export default function LocalPickCard({
  item,
  categoryName,
  mapAreaHint,
  propertyId,
  typeId,
  viewMapLabel,
  goMapLabel,
  mode = 'results',
  propertyCoords,
  className = 'w-[min(288px,calc(100vw-3rem))] shrink-0 snap-start snap-always',
}: Props) {
  const saveItem: SavedLocalGemInput = {
    title: item.title,
    description: item.description,
    category: categoryName,
    source: item.source,
    photoUrl: item.photoUrl,
    googleMapsUrl: item.googleMapsUrl,
    googlePlaceId: item.googlePlaceId,
    latitude: item.latitude,
    longitude: item.longitude,
    estimatedDistance: item.estimatedDistance,
    beyondRadius: item.beyondRadius,
    itemType: item.itemType,
    allTrailsUrl: item.allTrailsUrl,
    allTrailsId: item.allTrailsId,
  };

  const feedbackItem = {
    title: item.title,
    source: item.source,
    googlePlaceId: item.googlePlaceId,
    googleMapsUrl: item.googleMapsUrl,
    latitude: item.latitude,
    longitude: item.longitude,
    description: item.description,
    category: categoryName,
  };

  const trailViewUrl = String(item.allTrailsUrl || '').trim();
  const trailGoUrl =
    propertyCoords &&
    typeof item.latitude === 'number' &&
    typeof item.longitude === 'number'
      ? buildDirectionsFromOriginUrl(propertyCoords, {
          lat: item.latitude,
          lng: item.longitude,
        })
      : '';

  const isTrail =
    item.itemType === 'trail' &&
    (isValidExternalUrl(trailViewUrl) || isValidExternalUrl(trailGoUrl));

  return (
    <article
      className={`${className} bg-white/8 border border-white/10 rounded-2xl overflow-hidden flex flex-col`}
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
          <h5 className="font-semibold text-white flex-1 min-w-0 leading-snug">{item.title}</h5>
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

        {item.estimatedDistance ? (
          <div
            className={`text-sm font-semibold flex items-center justify-between gap-2 mb-3 ${
              item.beyondRadius ? 'text-amber-300' : 'text-white/65'
            }`}
          >
            <span className="flex items-center min-w-0">
              <Car size={12} className="mr-1.5 shrink-0" strokeWidth={2} />
              {item.estimatedDistance}
            </span>
            <PickSaveButton
              variant={mode === 'saved' ? 'saved-list' : 'results'}
              propertyId={propertyId}
              typeId={typeId}
              item={saveItem}
            />
          </div>
        ) : mode === 'saved' ? (
          <div className="flex justify-end mb-3">
            <PickSaveButton
              variant="saved-list"
              propertyId={propertyId}
              typeId={typeId}
              item={saveItem}
            />
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-2 mt-auto pt-3 border-t border-white/10">
          <PickFeedbackButtons propertyId={propertyId} item={feedbackItem} />
          {isTrail ? (
            <MapLinkButtons
              item={{ title: item.title, latitude: item.latitude, longitude: item.longitude }}
              mapAreaHint=""
              viewLabel={viewMapLabel}
              goLabel={goMapLabel}
              viewUrl={trailViewUrl}
              goUrl={trailGoUrl}
            />
          ) : (
            <MapLinkButtons
              item={item}
              mapAreaHint={mapAreaHint}
              viewLabel={viewMapLabel}
              goLabel={goMapLabel}
            />
          )}
        </div>
      </div>
    </article>
  );
}
