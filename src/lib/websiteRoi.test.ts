import { describe, expect, it } from 'vitest';
import { calcRoi, pickPlan } from './websiteRoi';

describe('calcRoi', () => {
  it('saves 0.4 hours per guest', () => {
    expect(calcRoi(100).hoursSaved).toBeCloseTo(40);
    expect(calcRoi(10).hoursSaved).toBeCloseTo(4);
  });

  it('earns guests × 15% × €50 × 33% in monthly passive income', () => {
    // 100 guests -> 15 bookings -> €750 -> 33% = €247.50
    expect(calcRoi(100).monthlyIncome).toBeCloseTo(247.5);
    expect(calcRoi(1000).monthlyIncome).toBeCloseTo(2475);
  });

  it('annualises monthly income', () => {
    expect(calcRoi(100).yearlyIncome).toBeCloseTo(247.5 * 12);
  });
});

describe('pickPlan', () => {
  it('maps property counts to the smallest covering plan', () => {
    expect(pickPlan(1)?.id).toBe('solo');
    expect(pickPlan(2)?.id).toBe('pro');
    expect(pickPlan(5)?.id).toBe('pro');
    expect(pickPlan(6)?.id).toBe('agency');
    expect(pickPlan(20)?.id).toBe('agency');
  });

  it('returns null above the largest tier', () => {
    expect(pickPlan(21)).toBeNull();
  });
});
