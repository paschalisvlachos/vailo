import { useEffect, useState } from 'react';
import { Bookmark, Loader2 } from 'lucide-react';
import { useGuestAnalytics } from '../../context/GuestAnalyticsContext';
import { useGuestLocale } from '../../context/GuestLocaleContext';
import { buildPickAnalyticsPayload } from '../../lib/pickAnalytics';
import { type SavedLocalGemInput } from '../../lib/savedLocalGems';
import { useSavedLocalGems } from '../../hooks/useSavedLocalGems';

/** Matches inactive like/dislike pick feedback buttons. */
const PICK_PILL_BASE =
  'inline-flex items-center justify-center gap-1.5 shrink-0 h-8 px-3 rounded-full border text-sm font-semibold transition-colors bg-white border-[#0B4F5C]/12 text-[#0B4F5C] hover:text-[#0B4F5C] hover:border-[#0B4F5C]/30 disabled:opacity-50';

type Props = {
  propertyId: string | undefined;
  typeId: string | undefined;
  item: SavedLocalGemInput;
  /** results = Save on pick cards; saved-list = Remove on saved list cards */
  variant?: 'results' | 'saved-list';
  size?: 'sm' | 'md';
};

export default function PickSaveButton({
  propertyId,
  typeId,
  item,
  variant = 'results',
  size = 'sm',
}: Props) {
  const { t } = useGuestLocale();
  const { track } = useGuestAnalytics();
  const { isSaved, save, remove } = useSavedLocalGems(propertyId, typeId);
  const [saved, setSaved] = useState(variant === 'saved-list');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (variant === 'saved-list') {
      setSaved(true);
      return;
    }
    setSaved(isSaved(item));
  }, [variant, isSaved, item.title, item.googlePlaceId, item.latitude, item.longitude, item.allTrailsId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  if (!propertyId || !typeId) return null;

  const iconSize = size === 'sm' ? 14 : 16;

  const handleClick = () => {
    if (busy) return;
    setBusy(true);
    try {
      const analyticsPayload = buildPickAnalyticsPayload(item);

      if (variant === 'saved-list' || saved) {
        remove(item);
        setSaved(false);
        if (variant === 'saved-list') {
          setToast(t('savedLocalGemRemoved'));
        }
        if (analyticsPayload.gemId) {
          track('live_like_local_pick_unsave', analyticsPayload);
        }
      } else {
        const result = save(item);
        if (!result) return;
        setSaved(true);
        setToast(t('savedLocalGemSavedToast'));
        if (analyticsPayload.gemId) {
          track('live_like_local_pick_save', analyticsPayload);
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const label =
    variant === 'saved-list'
      ? t('savedLocalGemRemoveLabel')
      : saved
        ? t('savedLocalGemSavedLabel')
        : t('savedLocalGemSaveLabel');

  const ariaLabel =
    variant === 'saved-list' || saved ? t('savedLocalGemUnsaveAria') : t('savedLocalGemSaveAria');

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        aria-pressed={saved}
        aria-label={ariaLabel}
        className={PICK_PILL_BASE}
      >
        {busy ? (
          <Loader2 size={iconSize} className="animate-spin" />
        ) : (
          <Bookmark size={iconSize} strokeWidth={2} className={saved ? 'fill-current' : ''} />
        )}
        {label}
      </button>

      {toast && (
        <div
          role="status"
          className="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-[120] max-w-[min(22rem,calc(100vw-2rem))] rounded-2xl bg-[#051F26]/95 text-white text-sm leading-snug px-4 py-3 shadow-xl border border-white/10 pointer-events-none animate-in fade-in slide-in-from-bottom-2 duration-300"
        >
          {toast}
        </div>
      )}
    </>
  );
}
