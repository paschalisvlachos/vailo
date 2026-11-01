import { describe, expect, it } from 'vitest';
import {
  calcRoi,
  pickPlan,
  planAnnualTotal,
  planPricePerProperty,
  PLANS,
  ROI,
  scalePricePerProperty,
} from './websiteRoi';

describe('calcRoi', () => {
  it('saves 0.4 hours per guest', () => {
    expect(calcRoi(100).hoursSaved).toBeCloseTo(40);
    expect(calcRoi(10).hoursSaved).toBeCloseTo(4);
  });

  it('pays host 1/3 of Vailo margin — not of the guest ticket price', () => {
    // 100 guests → 10 bookings → €500 ticket total → 10% margin = €50 → host 1/3 = €16.67
    const expected =
      100 * ROI.excursionConversion * ROI.avgBookingEur * ROI.exampleMarginRate * ROI.hostShareOfMargin;
    expect(calcRoi(100).monthlyIncome).toBeCloseTo(expected);
    expect(calcRoi(100).monthlyIncome).toBeCloseTo(50 / 3);
  });

  it('annualises monthly income', () => {
    expect(calcRoi(100).yearlyIncome).toBeCloseTo(calcRoi(100).monthlyIncome * 12);
  });

  it('estimates team capacity freed in FTE-months', () => {
    expect(calcRoi(400).fteFreed).toBeCloseTo(1);
    expect(calcRoi(120).fteFreed).toBeCloseTo(48 / 160);
  });
});

describe('pickPlan', () => {
  it('maps property counts to the covering band', () => {
    expect(pickPlan(1)?.id).toBe('solo');
    expect(pickPlan(2)?.id).toBe('pro');
    expect(pickPlan(10)?.id).toBe('pro');
    expect(pickPlan(11)?.id).toBe('agency');
    expect(pickPlan(50)?.id).toBe('agency');
    expect(pickPlan(51)?.id).toBe('scale');
    expect(pickPlan(100)?.id).toBe('scale');
  });
});

describe('scalePricePerProperty', () => {
  it('starts at €24 and reaches €19 by 200 properties', () => {
    expect(scalePricePerProperty(51)).toBe(24);
    expect(scalePricePerProperty(200)).toBe(19);
    expect(scalePricePerProperty(250)).toBe(19);
  });

  it('decreases as property count grows between 51 and 200', () => {
    expect(scalePricePerProperty(100)).toBeLessThan(24);
    expect(scalePricePerProperty(100)).toBeGreaterThan(19);
    expect(scalePricePerProperty(150)).toBeLessThan(scalePricePerProperty(100));
  });
});

describe('planAnnualTotal', () => {
  it('charges every property at the plan rate', () => {
    expect(planAnnualTotal(1)).toBe(49);
    expect(planAnnualTotal(2)).toBe(39 * 2);
    expect(planAnnualTotal(10)).toBe(39 * 10);
    expect(planAnnualTotal(11)).toBe(29 * 11);
    expect(planAnnualTotal(50)).toBe(29 * 50);
    expect(planAnnualTotal(51)).toBe(24 * 51);
    expect(planAnnualTotal(200)).toBe(19 * 200);
  });

  it('uses the sliding Scale rate for mid-band counts', () => {
    expect(planPricePerProperty(100)).toBeCloseTo(scalePricePerProperty(100));
    expect(planAnnualTotal(100)).toBeCloseTo(scalePricePerProperty(100) * 100);
  });

  it('increases within each fixed-rate band', () => {
    for (const plan of PLANS) {
      if (plan.id === 'scale') continue;
      const last = plan.maxProperties ?? plan.minProperties;
      for (let n = plan.minProperties; n < last; n += 1) {
        expect(planAnnualTotal(n + 1)).toBeGreaterThan(planAnnualTotal(n));
      }
    }
  });

  it('keeps Scale annual totals non-decreasing as count grows', () => {
    for (let n = 51; n < 220; n += 1) {
      expect(planAnnualTotal(n + 1)).toBeGreaterThanOrEqual(planAnnualTotal(n) - 0.01);
    }
  });
});
