import { describe, expect, it } from 'vitest';
import { computeOrderDiscount } from '../../shared/hospPricing';
import { hospAnalyticsPeriodStart, hospOrderPayable, parseHospAnalyticsPeriod } from '../../shared/hospAnalytics';

describe('hospAnalytics helpers', () => {
  it('parses period query (default today)', () => {
    expect(parseHospAnalyticsPeriod('week')).toBe('week');
    expect(parseHospAnalyticsPeriod('today')).toBe('today');
    expect(parseHospAnalyticsPeriod('nope')).toBe('today');
    expect(parseHospAnalyticsPeriod(undefined)).toBe('today');
  });

  it('period start is UTC midnight; week is 6 days earlier', () => {
    const now = new Date('2026-07-27T15:30:00.000Z');
    const today = hospAnalyticsPeriodStart('today', now);
    expect(today.toISOString()).toBe('2026-07-27T00:00:00.000Z');
    const week = hospAnalyticsPeriodStart('week', now);
    expect(week.toISOString()).toBe('2026-07-21T00:00:00.000Z');
  });

  it('payable applies order discount like orderDetail', () => {
    expect(hospOrderPayable(1000, 10, 50, computeOrderDiscount)).toBe(850);
    expect(hospOrderPayable(100, 0, 200, computeOrderDiscount)).toBe(0);
  });
});
