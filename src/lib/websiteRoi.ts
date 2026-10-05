/** Pricing + ROI-calculator logic for the public marketing website. */

/** ROI calculator assumptions (kept in one place so marketing can tweak them). */
export const ROI = {
  hoursSavedPerGuest: 0.4,
  /** Share of guests who book a Vailo-supplied excursion through the portal. */
  excursionConversion: 0.1,
  avgBookingEur: 50,
  /**
   * Example platform margin on Vailo-supplied excursions/services (varies by product:
   * e.g. 8%, 10%, 20%). Host share is taken from this margin — not the guest price.
   */
  exampleMarginRate: 0.1,
  /** Host’s cut of that margin on Vailo-supplied bookings (1/3). Vailo keeps 2/3. */
  hostShareOfMargin: 1 / 3,
  /** Typical full-time ops hours per month — used for “team capacity freed”. */
  hoursPerFteMonth: 160,
} as const;

export type Plan = {
  id: 'solo' | 'pro' | 'agency' | 'scale';
  name: string;
  tagline: string;
  /** Inclusive lower bound of the property band. */
  minProperties: number;
  /** Inclusive upper bound, or `null` for an open-ended 51+ tier. */
  maxProperties: number | null;
  propertiesLabel: string;
  /** Annual price per property in euros. */
  pricePerPropertyEur: number;
  saving?: string;
  popular?: boolean;
};

/**
 * Per-property annual pricing (fair volume discounts):
 *  - 1      → €49 each
 *  - 2–20   → €39 each
 *  - 21–50  → €29 each
 *  - 51+    → €19 each
 */
export const PLANS: Plan[] = [
  {
    id: 'solo',
    name: 'Solo Host',
    tagline: 'Everything you need for a single property.',
    minProperties: 1,
    maxProperties: 1,
    propertiesLabel: '1 Property',
    pricePerPropertyEur: 49,
  },
  {
    id: 'pro',
    name: 'Pro Host',
    tagline: 'For hosts and small portfolios.',
    minProperties: 2,
    maxProperties: 20,
    propertiesLabel: '2–20 Properties',
    pricePerPropertyEur: 39,
    saving: 'Save 20%',
    popular: true,
  },
  {
    id: 'agency',
    name: 'Agency',
    tagline: 'Built for property managers at scale.',
    minProperties: 21,
    maxProperties: 50,
    propertiesLabel: '21–50 Properties',
    pricePerPropertyEur: 29,
    saving: 'Save 41%',
  },
  {
    id: 'scale',
    name: 'Scale',
    tagline: 'Best rate for large portfolios.',
    minProperties: 51,
    maxProperties: null,
    propertiesLabel: '51+ Properties',
    pricePerPropertyEur: 19,
    saving: 'Save 61%',
  },
];

/**
 * Time & revenue estimate for a given number of guests per month.
 *  - hours saved  = guests × 0.4
 *  - host income  = guests × conversion × booking × example margin × 1/3
 *    (1/3 of Vailo’s margin on Vailo-supplied excursions — not of the ticket price)
 *  - fteFreed     = hours saved ÷ 160 (one ops FTE-month)
 */
export function calcRoi(guestsPerMonth: number) {
  const hoursSaved = guestsPerMonth * ROI.hoursSavedPerGuest;
  const monthlyIncome =
    guestsPerMonth *
    ROI.excursionConversion *
    ROI.avgBookingEur *
    ROI.exampleMarginRate *
    ROI.hostShareOfMargin;
  const fteFreed = hoursSaved / ROI.hoursPerFteMonth;
  return { hoursSaved, monthlyIncome, yearlyIncome: monthlyIncome * 12, fteFreed };
}

/** Plan that covers the property count (Scale for 51+). */
export function pickPlan(properties: number): Plan {
  return (
    PLANS.find((p) => {
      if (properties < p.minProperties) return false;
      if (p.maxProperties === null) return true;
      return properties <= p.maxProperties;
    }) ?? PLANS[PLANS.length - 1]
  );
}

/** Annual total for a portfolio: rate of the covering band × property count. */
export function planAnnualTotal(properties: number): number {
  const count = Math.max(1, Math.floor(properties));
  return pickPlan(count).pricePerPropertyEur * count;
}
