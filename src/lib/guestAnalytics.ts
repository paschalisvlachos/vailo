/** Guest portal analytics — house guests with a booking session only. */

export type GuestAnalyticsEventType =
  | 'portal_session'
  | 'live_like_local_open'
  | 'guide_accordion_open'
  | 'gem_impression'
  | 'gem_description_expand'
  | 'assistant_user_message'
  | 'assistant_reply'
  | 'ai_expert_user_message'
  | 'ai_expert_reply'
  | 'ai_expert_selection'
  | 'ai_expert_plan';

export type GuestAnalyticsPayload = {
  text?: string;
  sectionKey?: string;
  gemId?: string;
  gemName?: string;
  planStopCount?: number;
  planCategories?: string[];
};

export type GuestAnalyticsEventInput = {
  type: GuestAnalyticsEventType;
  payload?: GuestAnalyticsPayload;
};

export type GuestStayAnalyticsSummary = {
  bookingId: string;
  typeId: string;
  propertyId: string;
  guestName: string;
  guestEmail: string;
  stayStart: string;
  stayEnd: string;
  portalSessions: number;
  liveLikeLocalOpens: number;
  assistantTurns: number;
  aiExpertTurns: number;
  uniqueGemsSeen: number;
  accordionOpens: Record<string, number>;
  gemImpressions: Record<string, number>;
  firstSeenAt: string;
  lastSeenAt: string;
  updatedAt: string;
};

export type GuestStayAnalyticsEvent = {
  id: string;
  at: string;
  type: GuestAnalyticsEventType;
  payload: GuestAnalyticsPayload;
};

const TEXT_LIMIT_USER = 500;
const TEXT_LIMIT_REPLY = 1000;

export function truncateAnalyticsText(text: string, max = TEXT_LIMIT_USER): string {
  const normalized = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return '';
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max)}…`;
}

export function sanitizeAnalyticsPayload(
  type: GuestAnalyticsEventType,
  payload?: GuestAnalyticsPayload
): GuestAnalyticsPayload {
  if (!payload) return {};
  const out: GuestAnalyticsPayload = { ...payload };
  if (out.text) {
    const limit =
      type === 'assistant_reply' || type === 'ai_expert_reply'
        ? TEXT_LIMIT_REPLY
        : TEXT_LIMIT_USER;
    out.text = truncateAnalyticsText(out.text, limit);
  }
  if (out.planCategories && out.planCategories.length > 8) {
    out.planCategories = out.planCategories.slice(0, 8);
  }
  return out;
}

export const PORTAL_SESSION_DEBOUNCE_MS = 30 * 60 * 1000;
export const ANALYTICS_LAST_SESSION_KEY = 'vailo_analytics_last_portal_session';
