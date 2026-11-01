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
  /** Inclusive upper bound, or `null` for an open-ended tier. */
  maxProperties: number | null;
  propertiesLabel: string;
  /** Annual price per property in euros. */
  pricePerPropertyEur: number;
  saving?: string;
  popular?: boolean;
};

/**
 * All-units annual pricing (every property at the plan rate):
 *  - 1      → €49
 *  - 2–10   → €39
 *  - 11–50  → €29
 *  - 51+    → €24 down to €19 as count grows (see {@link scalePricePerProperty})
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
    maxProperties: 10,
    propertiesLabel: '2–10 Properties',
    pricePerPropertyEur: 39,
    saving: 'Save 20%',
  },
  {
    id: 'agency',
    name: 'Agency',
    tagline: 'Built for property managers at scale.',
    minProperties: 11,
    maxProperties: 50,
    propertiesLabel: '11–50 Properties',
    pricePerPropertyEur: 29,
    saving: 'Save 41%',
    popular: true,
  },
  {
    id: 'scale',
    name: 'Scale',
    tagline: 'Best rate for large portfolios.',
    minProperties: 51,
    maxProperties: null,
    propertiesLabel: '51+ Properties',
    /** Starting Scale rate; live rate slides down to {@link SCALE_RATE.endEur}. */
    pricePerPropertyEur: 24,
    saving: 'Save 51%',
  },
];

/** Scale tier: €24/pp at 51 homes, linearly down to €19/pp by 200 homes. */
export const SCALE_RATE = {
  startEur: 24,
  endEur: 19,
  startAt: 51,
  endAt: 200,
} as const;

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

/**
 * Per-property annual rate for a given portfolio size.
 * Scale slides from €24 → €19 between 51 and 200 properties.
 */
export function planPricePerProperty(properties: number): number {
  const count = Math.max(1, Math.floor(properties));
  const plan = pickPlan(count);
  if (plan.id === 'scale') return scalePricePerProperty(count);
  return plan.pricePerPropertyEur;
}

/** Scale rate: €24 at 51 properties, €19 from 200 upward (linear in between). */
export function scalePricePerProperty(properties: number): number {
  const n = Math.max(1, Math.floor(properties));
  if (n <= SCALE_RATE.startAt) return SCALE_RATE.startEur;
  if (n >= SCALE_RATE.endAt) return SCALE_RATE.endEur;
  const t = (n - SCALE_RATE.startAt) / (SCALE_RATE.endAt - SCALE_RATE.startAt);
  return SCALE_RATE.startEur + (SCALE_RATE.endEur - SCALE_RATE.startEur) * t;
}

/** Annual total: effective per-property rate × property count. */
export function planAnnualTotal(properties: number): number {
  const count = Math.max(1, Math.floor(properties));
  return planPricePerProperty(count) * count;
}
