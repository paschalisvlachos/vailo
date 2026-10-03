/** Pricing + ROI-calculator logic for the public marketing website. */

/** ROI calculator assumptions (kept in one place so marketing can tweak them). */
export const ROI = {
  hoursSavedPerGuest: 0.4,
  excursionConversion: 0.15,
  avgBookingEur: 50,
  hostShare: 0.33,
} as const;

export type Plan = {
  id: 'solo' | 'pro' | 'agency';
  name: string;
  tagline: string;
  /** Maximum number of properties covered by the plan. */
  properties: number;
  propertiesLabel: string;
  priceEur: number;
  saving?: string;
  popular?: boolean;
};

export const PLANS: Plan[] = [
  {
    id: 'solo',
    name: 'Solo Host',
    tagline: 'Everything you need for a single property.',
    properties: 1,
    propertiesLabel: '1 Property',
    priceEur: 49,
  },
  {
    id: 'pro',
    name: 'Pro Host',
    tagline: 'For hosts growing a small portfolio.',
    properties: 5,
    propertiesLabel: 'Up to 5 Properties',
    priceEur: 189,
    saving: 'Save 22%',
    popular: true,
  },
  {
    id: 'agency',
    name: 'Agency',
    tagline: 'Built for property managers at scale.',
    properties: 20,
    propertiesLabel: 'Up to 20 Properties',
    priceEur: 599,
    saving: 'Save 38%',
  },
];

/**
 * Time & revenue estimate for a given number of guests per month.
 *  - hours saved  = guests × 0.4
 *  - income       = guests × 15% conversion × €50 average booking × 33% host share
 */
export function calcRoi(guestsPerMonth: number) {
  const hoursSaved = guestsPerMonth * ROI.hoursSavedPerGuest;
  const monthlyIncome =
    guestsPerMonth * ROI.excursionConversion * ROI.avgBookingEur * ROI.hostShare;
  return { hoursSaved, monthlyIncome, yearlyIncome: monthlyIncome * 12 };
}

/** Smallest plan that covers the property count, or `null` when above the largest tier. */
export function pickPlan(properties: number): Plan | null {
  return PLANS.find((p) => properties <= p.properties) ?? null;
}
