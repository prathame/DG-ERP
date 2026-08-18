import { describe, expect, it } from 'vitest';
import {
  addCalendarDaysIso,
  creditTermsFromRow,
  parseCreditLimit,
  parseCreditPeriodDays,
} from '../../server/utils/partyCreditTerms';

describe('partyCreditTerms', () => {
  it('parses credit period days', () => {
    expect(parseCreditPeriodDays(30)).toBe(30);
    expect(parseCreditPeriodDays('')).toBeNull();
    expect(parseCreditPeriodDays(null)).toBeNull();
    expect(() => parseCreditPeriodDays(-1)).toThrow(/Credit period/);
    expect(() => parseCreditPeriodDays(1.5)).toThrow(/Credit period/);
  });

  it('parses credit limit', () => {
    expect(parseCreditLimit(100000)).toBe(100000);
    expect(parseCreditLimit('2500.55')).toBe(2500.55);
    expect(parseCreditLimit('')).toBeNull();
    expect(() => parseCreditLimit(-5)).toThrow(/Credit limit/);
  });

  it('maps DB row', () => {
    expect(creditTermsFromRow({ credit_limit: '50000', credit_period_days: 30 })).toEqual({
      creditLimit: 50000,
      creditPeriodDays: 30,
    });
    expect(creditTermsFromRow({})).toEqual({ creditLimit: null, creditPeriodDays: null });
  });

  it('adds calendar days to ISO date', () => {
    expect(addCalendarDaysIso('2026-08-18', 30)).toBe('2026-09-17');
    expect(addCalendarDaysIso('2026-01-31', 1)).toBe('2026-02-01');
  });
});
