import { describe, expect, it } from 'vitest';
import { calcRoi, pickPlan, planAnnualTotal } from './websiteRoi';

describe('calcRoi', () => {
  it('saves 0.4 hours per guest', () => {
    expect(calcRoi(100).hoursSaved).toBeCloseTo(40);
    expect(calcRoi(10).hoursSaved).toBeCloseTo(4);
  });

  it('earns guests × 10% × €50 × 33% in monthly passive income', () => {
    // 100 guests -> 10 bookings -> €500 -> 33% = €165
    expect(calcRoi(100).monthlyIncome).toBeCloseTo(165);
    expect(calcRoi(1000).monthlyIncome).toBeCloseTo(1650);
  });

  it('annualises monthly income', () => {
    expect(calcRoi(100).yearlyIncome).toBeCloseTo(165 * 12);
  });

  it('estimates team capacity freed in FTE-months', () => {
    // 160 hours saved → 1.0 FTE
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
