import { useEffect, useState } from 'react';
import { ThumbsUp, ThumbsDown, Loader2 } from 'lucide-react';
import {
  applyPickFeedback,
  getLocalVote,
  type FeedbackVote,
  type PickFeedbackItem,
} from '../../lib/picksFeedback';

type Props = {
  propertyId: string | undefined;
  item: PickFeedbackItem;
  size?: 'sm' | 'md';
};

export default function PickFeedbackButtons({ propertyId, item, size = 'sm' }: Props) {
  const [vote, setVote] = useState<FeedbackVote>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!propertyId) return;
    setVote(getLocalVote(propertyId, item));
  }, [propertyId, item.title, item.googlePlaceId, item.latitude, item.longitude]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!propertyId) return null;

  const handleVote = async (target: FeedbackVote) => {
    if (saving) return;
    const next: FeedbackVote = vote === target ? null : target;
    setVote(next);
    setSaving(true);
    setError(false);
    try {
      await applyPickFeedback(propertyId, item, next);
    } catch (err) {
      console.error('applyPickFeedback:', err);
      setError(true);
      setVote(vote); // revert
    } finally {
      setSaving(false);
    }
  };

  const baseBtn =
    size === 'sm'
      ? 'h-8 w-8 rounded-full border'
      : 'h-9 w-9 rounded-full border';
  const iconSize = size === 'sm' ? 14 : 16;

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => handleVote('up')}
        disabled={saving}
        aria-pressed={vote === 'up'}
        aria-label="I liked this"
        className={`${baseBtn} flex items-center justify-center transition-colors ${
          vote === 'up'
            ? 'bg-[#C5A059] border-[#b8924f] text-[#051F26]'
            : 'bg-white border-[#0B4F5C]/12 text-[#0B4F5C]/55 hover:text-[#0B4F5C] hover:border-[#0B4F5C]/30'
        }`}
      >
        {saving && vote === 'up' ? (
          <Loader2 size={iconSize} className="animate-spin" />
        ) : (
          <ThumbsUp size={iconSize} strokeWidth={2} />
        )}
      </button>
      <button
        type="button"
        onClick={() => handleVote('down')}
        disabled={saving}
        aria-pressed={vote === 'down'}
        aria-label="Not for me"
        className={`${baseBtn} flex items-center justify-center transition-colors ${
          vote === 'down'
            ? 'bg-[#0B4F5C] border-[#083a43] text-white'
            : 'bg-white border-[#0B4F5C]/12 text-[#0B4F5C]/55 hover:text-[#0B4F5C] hover:border-[#0B4F5C]/30'
        }`}
      >
        {saving && vote === 'down' ? (
          <Loader2 size={iconSize} className="animate-spin" />
        ) : (
          <ThumbsDown size={iconSize} strokeWidth={2} />
        )}
      </button>
      {error && (
        <span className="text-xs text-red-500" role="alert">
          Could not save
        </span>
      )}
    </div>
  );
}
