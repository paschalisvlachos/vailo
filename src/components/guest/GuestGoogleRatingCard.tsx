import { ChevronRight, Star } from 'lucide-react';
import type { GuestLocaleKey } from '../../lib/guestLocale';
import { openExternalUrl } from '../../lib/geocoding';

type Props = {
  rating: number;
  reviewUrl: string;
  listingName?: string;
  t: (key: GuestLocaleKey) => string;
};

function GoogleLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" role="img" aria-label="Google">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

export default function GuestGoogleRatingCard({ rating, reviewUrl, listingName, t }: Props) {
  const displayRating = Math.min(5, Math.max(0, rating));
  const fullStars = Math.floor(displayRating);
  const hasHalf = displayRating - fullStars >= 0.25 && displayRating - fullStars < 0.85;

  return (
    <button
      type="button"
      onClick={() => openExternalUrl(reviewUrl)}
      className="group block w-full rounded-2xl p-[1px] bg-gradient-to-r from-[#C5A059]/40 via-white/30 to-[#C5A059]/40 shadow-[0_4px_20px_rgba(11,79,92,0.1)] hover:shadow-[0_8px_28px_rgba(11,79,92,0.14)] transition-all duration-200 hover:-translate-y-px text-left"
    >
      <div className="rounded-[0.9rem] bg-white/95 backdrop-blur-xl px-4 py-4 flex items-center gap-3">
        <div className="h-11 w-11 rounded-xl bg-white border border-gray-100 shadow-inner flex items-center justify-center shrink-0 p-2">
          <GoogleLogo className="w-7 h-7" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-luxury text-lg text-[#051F26] font-medium leading-none tabular-nums">
              {displayRating.toFixed(1)}
            </span>
            <span className="flex items-center gap-px" aria-hidden>
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  size={10}
                  className={
                    i < fullStars
                      ? 'text-amber-400 fill-amber-400'
                      : i === fullStars && hasHalf
                        ? 'text-amber-400 fill-amber-200'
                        : 'text-gray-200 fill-gray-100'
                  }
                />
              ))}
            </span>
          </div>
          {listingName && (
            <p className="text-sm text-gray-500 mt-0.5 truncate leading-tight">{listingName}</p>
          )}
        </div>

        <div className="shrink-0 flex items-center gap-0.5 pl-1 border-l border-gray-100">
          <span className="text-xs font-bold uppercase tracking-[0.1em] text-[#0B4F5C] group-hover:text-[#C5A059] transition-colors whitespace-nowrap">
            {t('rateOnGoogle')}
          </span>
          <ChevronRight
            size={14}
            className="text-[#0B4F5C] group-hover:text-[#C5A059] group-hover:translate-x-0.5 transition-all shrink-0"
          />
        </div>
      </div>
    </button>
  );
}
