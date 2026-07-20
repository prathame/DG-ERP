import { describe, it, expect } from 'vitest';

/**
 * Regression: `!amount || Number(amount) <= 0` accepts non-numeric strings because
 * `Number("abc") <= 0` is false (NaN comparisons are always false).
 * Money routes must use Number.isFinite.
 */
function isValidPositiveAmount(raw: unknown): boolean {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 && n <= 100_000_000;
}

describe('money amount validation', () => {
  it('rejects NaN-producing strings that pass a naive <= 0 check', () => {
    const amount = 'not-a-number';
    expect(!amount || Number(amount) <= 0).toBe(false);
    expect(isValidPositiveAmount(amount)).toBe(false);
  });

  it('rejects Infinity and zero / negative', () => {
    expect(isValidPositiveAmount('Infinity')).toBe(false);
    expect(isValidPositiveAmount(0)).toBe(false);
    expect(isValidPositiveAmount(-1)).toBe(false);
    expect(isValidPositiveAmount(null)).toBe(false);
    expect(isValidPositiveAmount(undefined)).toBe(false);
  });

  it('accepts normal positive amounts', () => {
    expect(isValidPositiveAmount(1)).toBe(true);
    expect(isValidPositiveAmount('99.5')).toBe(true);
    expect(isValidPositiveAmount(100_000_000)).toBe(true);
    expect(isValidPositiveAmount(100_000_001)).toBe(false);
  });
});
