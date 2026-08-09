import { useMemo } from 'react';
import { ChevronRight, Compass } from 'lucide-react';
import type { GuestExcursionListing } from '../../lib/guestExcursions';
import {
  excursionLowestAdultPrice,
  formatExcursionPrice,
} from '../../lib/excursion';
import { formatGuestUiString } from '../../lib/platformGuestUiStrings';
import type { GuestLocaleKey } from '../../lib/guestLocale';

type Props = {
  locale: string;
  listings: GuestExcursionListing[];
  loading: boolean;
  onOpen: () => void;
  t: (key: GuestLocaleKey) => string;
};

export default function GuestExcursionsPromoCard({
  locale,
  listings,
  loading,
  onOpen,
  t,
}: Props) {
  const featured = useMemo(() => {
    const withPhoto = listings.find((l) => l.excursion.heroPhotoUrl?.trim());
    return withPhoto ?? listings[0] ?? null;
  }, [listings]);

  const priceLabel = useMemo(() => {
    if (!featured) return null;
    const lowest = excursionLowestAdultPrice(featured.excursion);
    if (lowest == null) return null;
    return formatExcursionPrice(lowest, featured.excursion.currency, {
      from: false,
    });
  }, [featured]);

  const subtitle = loading
    ? t('excursionsPromoLoading')
    : listings.length === 0
      ? t('excursionsPromoSubEmpty')
      : featured && listings.length === 1
        ? featured.excursion.subtitle?.trim() || featured.excursion.title
        : formatGuestUiString(locale, 'excursionsPromoSub', { count: listings.length });

  const heroPhoto = featured?.excursion.heroPhotoUrl?.trim();

  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={loading}
      className="group w-full rounded-2xl p-[1px] bg-gradient-to-r from-[#0B4F5C]/45 via-[#C5A059]/40 to-[#0B4F5C]/45 shadow-[0_8px_32px_rgba(11,79,92,0.14)] hover:shadow-[0_12px_40px_rgba(11,79,92,0.2)] transition-all duration-300 hover:-translate-y-0.5 text-left disabled:pointer-events-none disabled:opacity-80"
    >
      <div className="rounded-[0.9rem] bg-white/95 backdrop-blur-xl px-4 py-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="h-11 w-11 rounded-xl overflow-hidden shrink-0 shadow-inner ring-1 ring-[#0B4F5C]/10">
            {heroPhoto ? (
              <img
                src={heroPhoto}
                alt=""
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
            ) : (
              <div className="h-full w-full bg-gradient-to-br from-[#0B4F5C]/12 to-[#C5A059]/20 flex items-center justify-center">
                <Compass className="text-[#0B4F5C] w-5 h-5" />
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="font-luxury text-xl sm:text-2xl text-[#0B4F5C] leading-none font-medium truncate">
              {t('excursionsPromoTitle')}
            </p>
            <p className="text-sm text-gray-500 font-medium mt-1 truncate">{subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 pl-3 border-l border-gray-100 shrink-0">
          <div className="text-right hidden sm:block min-w-[4.5rem]">
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">
              {priceLabel ? t('excursionsPromoFrom') : t('excursionsPromoCta')}
            </p>
            <p className="text-sm font-luxury text-[#0B4F5C] font-medium leading-tight">
              {loading ? '…' : priceLabel ?? t('excursionsPromoCta')}
            </p>
          </div>
          <div className="h-9 w-9 rounded-xl bg-[#0B4F5C]/8 border border-[#0B4F5C]/12 flex items-center justify-center text-[#0B4F5C]/75 group-hover:bg-[#0B4F5C]/12 transition-colors">
            <ChevronRight size={18} className="group-hover:translate-x-0.5 transition-transform" />
          </div>
        </div>
      </div>
    </button>
  );
}
