import { pickKeyForItem } from './picksFairness';
import type { PickFeedbackItem } from './picksFeedback';
import type { GuestAnalyticsPayload } from './guestAnalytics';
import { savedPickKey, type SavedLocalGemInput } from './savedLocalGems';

type PickLike = PickFeedbackItem | SavedLocalGemInput;

export function buildPickAnalyticsPayload(item: PickLike): GuestAnalyticsPayload {
  const pickId = savedPickKey(item as SavedLocalGemInput) || pickKeyForItem(item);
  return {
    gemId: pickId || undefined,
    gemName: item.title,
    sectionKey: item.category || undefined,
    text: item.source || '',
  };
}
