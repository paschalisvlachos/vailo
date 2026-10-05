import { describe, expect, it } from 'vitest';
import { calcRoi, pickPlan, planAnnualTotal, ROI } from './websiteRoi';

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
    expect(pickPlan(20)?.id).toBe('pro');
    expect(pickPlan(21)?.id).toBe('agency');
    expect(pickPlan(50)?.id).toBe('agency');
    expect(pickPlan(51)?.id).toBe('scale');
    expect(pickPlan(100)?.id).toBe('scale');
  });
});

describe('planAnnualTotal', () => {
  it('charges per property at the band rate', () => {
    expect(planAnnualTotal(1)).toBe(49);
    expect(planAnnualTotal(2)).toBe(39 * 2);
    expect(planAnnualTotal(10)).toBe(39 * 10);
    expect(planAnnualTotal(20)).toBe(39 * 20);
    expect(planAnnualTotal(21)).toBe(29 * 21);
    expect(planAnnualTotal(50)).toBe(29 * 50);
    expect(planAnnualTotal(51)).toBe(19 * 51);
    expect(planAnnualTotal(100)).toBe(19 * 100);
  });
});
