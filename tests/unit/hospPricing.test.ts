import { describe, expect, it } from 'vitest';
import {
  computeOrderDiscount,
  isMemberCurrentlyActive,
  resolveMemberUnitPrice,
} from '../../shared/hospPricing';

describe('resolveMemberUnitPrice', () => {
  it('uses member_price when plan flag is on and member is active', () => {
    expect(
      resolveMemberUnitPrice({
        listPrice: 200,
        memberPrice: 150,
        memberActive: true,
        useMemberPrices: true,
        discountPercent: 10,
      }),
    ).toBe(150);
  });

  it('applies percent off when not using member prices', () => {
    expect(
      resolveMemberUnitPrice({
        listPrice: 200,
        memberPrice: 150,
        memberActive: true,
        useMemberPrices: false,
        discountPercent: 10,
      }),
    ).toBe(180);
  });

  it('falls back to list price when expired/inactive', () => {
    expect(
      resolveMemberUnitPrice({
        listPrice: 200,
        memberPrice: 150,
        memberActive: false,
        useMemberPrices: true,
        discountPercent: 50,
      }),
    ).toBe(200);
  });

  it('falls back to list when member_price missing and no percent', () => {
    expect(
      resolveMemberUnitPrice({
        listPrice: 200,
        memberPrice: null,
        memberActive: true,
        useMemberPrices: true,
        discountPercent: 0,
      }),
    ).toBe(200);
  });
});

describe('computeOrderDiscount', () => {
  it('adds percent and flat, capped at subtotal', () => {
    expect(computeOrderDiscount(1000, 10, 50)).toBe(150);
    expect(computeOrderDiscount(100, 50, 80)).toBe(100);
  });
});

describe('isMemberCurrentlyActive', () => {
  it('requires active status and valid_until not past', () => {
    const now = new Date('2026-07-27T12:00:00');
    expect(isMemberCurrentlyActive('active', '2026-07-27', now)).toBe(true);
    expect(isMemberCurrentlyActive('active', '2026-07-26', now)).toBe(false);
    expect(isMemberCurrentlyActive('expired', '2026-12-31', now)).toBe(false);
  });
});
