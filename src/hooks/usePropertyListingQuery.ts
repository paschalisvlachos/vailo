import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

const LISTING_PARAM = 'listing';

type Options = {
  /** When true, empty / missing param means "all listings". */
  allowAll?: boolean;
  /** Listing-only users: ignore URL and use this id. */
  lockedListingId?: string | null;
  /** Known listing ids for the current property (validates URL value). */
  validTypeIds?: string[];
};

export function usePropertyListingQuery(options: Options = {}) {
  const { allowAll = false, lockedListingId = null, validTypeIds = [] } = options;
  const [searchParams, setSearchParams] = useSearchParams();
  const rawListing = searchParams.get(LISTING_PARAM)?.trim() || '';

  const listingId = useMemo(() => {
    if (lockedListingId) return lockedListingId;

    const isValidType = (id: string) =>
      validTypeIds.length === 0 || validTypeIds.includes(id);

    if (allowAll) {
      if (!rawListing || rawListing === 'all') return 'all';
      if (isValidType(rawListing)) return rawListing;
      return 'all';
    }

    if (rawListing && isValidType(rawListing)) return rawListing;
    if (validTypeIds.length > 0) return validTypeIds[0];
    return '';
  }, [allowAll, lockedListingId, rawListing, validTypeIds]);

  const setListingId = useCallback(
    (next: string) => {
      if (lockedListingId) return;

      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          const value = next.trim();
          if (!value || (allowAll && value === 'all')) {
            params.delete(LISTING_PARAM);
          } else {
            params.set(LISTING_PARAM, value);
          }
          return params;
        },
        { replace: true }
      );
    },
    [allowAll, lockedListingId, setSearchParams]
  );

  return { listingId, setListingId };
}

export function propertyListingQuerySuffix(listingParam: string | null): string {
  const trimmed = listingParam?.trim();
  if (!trimmed || trimmed === 'all') return '';
  return `?listing=${encodeURIComponent(trimmed)}`;
}
