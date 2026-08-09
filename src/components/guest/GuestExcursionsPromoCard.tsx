import { useMemo } from 'react';
import { ChevronRight, Compass } from 'lucide-react';
import type { GuestExcursionListing } from '../../lib/guestExcursions';
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
          <div className="min-w-0 text-left">
            <p className="font-luxury text-base font-semibold text-[#0B4F5C] leading-tight tracking-wide">
              {t('excursionsPromoTitle')}
            </p>
            <p className="text-sm text-gray-500 font-medium mt-0.5 leading-snug">{subtitle}</p>
          </div>
        </div>
        <div className="h-9 w-9 shrink-0 rounded-xl bg-[#0B4F5C]/8 border border-[#0B4F5C]/12 flex items-center justify-center text-[#0B4F5C]/75 group-hover:bg-[#0B4F5C]/12 transition-colors">
          <ChevronRight size={18} className="group-hover:translate-x-0.5 transition-transform" />
        </div>
      </div>
    </button>
  );
}
