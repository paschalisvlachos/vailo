/** Guest portal analytics — house guests with a booking session or anonymous public browsing. */

export type GuestAnalyticsEventType =
  | 'portal_session'
  | 'live_like_local_open'
  | 'guide_accordion_open'
  | 'gem_impression'
  | 'gem_description_expand'
  | 'assistant_user_message'
  | 'assistant_reply'
  | 'ai_expert_selection'
  | 'ai_expert_plan'
  | 'ai_expert_user_message'
  | 'ai_expert_reply'
  | 'ai_expert_wizard_message'
  | 'ai_expert_chat_message';

export type GuestAnalyticsPayload = {
  text?: string;
  sectionKey?: string;
  gemId?: string;
  gemName?: string;
  planStopCount?: number;
  planCategories?: string[];
  /** Wizard step when the message was sent (LOCATION, CATEGORIES, …). */
  wizardStep?: string;
  /** user | ai | model */
  messageRole?: string;
  /** selection | text | plan */
  messageType?: string;
  /** Serialized plan JSON for wizard plan results (server-truncated). */
  planData?: string;
  /** Short summary of curated picks in concierge chat. */
  picksSummary?: string;
};

export type GuestAnalyticsEventInput = {
  type: GuestAnalyticsEventType;
  payload?: GuestAnalyticsPayload;
};

export type GuestAnalyticsSubjectKind = 'booking' | 'anonymous';

export type GuestAnalyticsDeviceFields = {
  firstDeviceType?: string;
  firstOsName?: string;
  firstDeviceLabel?: string;
  lastDeviceType?: string;
  lastOsName?: string;
  lastDeviceLabel?: string;
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
  subjectKind?: GuestAnalyticsSubjectKind;
} & GuestAnalyticsDeviceFields;

export type GuestAnonymousAnalyticsSummary = {
  visitorId: string;
  typeId: string;
  propertyId: string;
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
  subjectKind: 'anonymous';
} & GuestAnalyticsDeviceFields;

export type GuestStayAnalyticsEvent = {
  id: string;
  at: string;
  type: GuestAnalyticsEventType;
  payload: GuestAnalyticsPayload;
};

const TEXT_LIMIT_USER = 8000;
const TEXT_LIMIT_REPLY = 16000;
const PLAN_DATA_LIMIT = 48000;

export function truncateAnalyticsText(text: string, max = TEXT_LIMIT_USER): string {
  const normalized = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return '';
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max)}…`;
}

export function serializePlanForAnalytics(plan: unknown): string {
  try {
    const json = JSON.stringify(plan ?? null);
    if (json.length <= PLAN_DATA_LIMIT) return json;
    return `${json.slice(0, PLAN_DATA_LIMIT)}…`;
  } catch {
    return '';
  }
}

export function sanitizeAnalyticsPayload(
  type: GuestAnalyticsEventType,
  payload?: GuestAnalyticsPayload
): GuestAnalyticsPayload {
  if (!payload) return {};
  const out: GuestAnalyticsPayload = { ...payload };
  if (out.text) {
    const limit =
      type === 'assistant_reply' ||
      type === 'ai_expert_reply' ||
      type === 'ai_expert_chat_message' ||
      type === 'ai_expert_wizard_message'
        ? TEXT_LIMIT_REPLY
        : TEXT_LIMIT_USER;
    out.text = truncateAnalyticsText(out.text, limit);
  }
  if (out.planData) {
    out.planData =
      out.planData.length <= PLAN_DATA_LIMIT
        ? out.planData
        : `${out.planData.slice(0, PLAN_DATA_LIMIT)}…`;
  }
  if (out.planCategories && out.planCategories.length > 8) {
    out.planCategories = out.planCategories.slice(0, 8);
  }
  if (out.picksSummary) {
    out.picksSummary = truncateAnalyticsText(out.picksSummary, 2000);
  }
  return out;
}

export const PORTAL_SESSION_DEBOUNCE_MS = 30 * 60 * 1000;
export const ANALYTICS_LAST_SESSION_KEY = 'vailo_analytics_last_portal_session';

export function analyticsPortalSessionStorageKey(
  subjectKind: GuestAnalyticsSubjectKind,
  subjectId: string
): string {
  return `${ANALYTICS_LAST_SESSION_KEY}:${subjectKind}:${subjectId}`;
}
