import { describe, it, expect } from 'vitest';
import { hasExplicitUnitPrice, unitPricesAfterDiscount } from '../../server/utils/price-resolve';

describe('hasExplicitUnitPrice', () => {
  it('treats 0 as explicit', () => {
    expect(hasExplicitUnitPrice(0)).toBe(true);
    expect(hasExplicitUnitPrice('0')).toBe(true);
  });
  it('treats null/undefined/empty as missing', () => {
    expect(hasExplicitUnitPrice(null)).toBe(false);
    expect(hasExplicitUnitPrice(undefined)).toBe(false);
    expect(hasExplicitUnitPrice('')).toBe(false);
  });
});

describe('unitPricesAfterDiscount', () => {
  it('adds GST on exclusive prices', () => {
    const r = unitPricesAfterDiscount({
      basePrice: 1000,
      discountPercent: 0,
      withGst: true,
      priceIncludesGst: false,
      gstRate: 18,
    });
    expect(r.netPricePerUnit).toBe(1000);
    expect(r.billedPricePerUnit).toBe(1180);
  });

  it('back-calculates net when price includes GST', () => {
    const r = unitPricesAfterDiscount({
      basePrice: 1180,
      discountPercent: 0,
      withGst: true,
      priceIncludesGst: true,
      gstRate: 18,
    });
    expect(r.billedPricePerUnit).toBe(1180);
    expect(r.netPricePerUnit).toBe(1000);
  });

  it('applies discount before GST split', () => {
    const r = unitPricesAfterDiscount({
      basePrice: 1000,
      discountPercent: 10,
      withGst: true,
      priceIncludesGst: false,
      gstRate: 18,
    });
    expect(r.netPricePerUnit).toBe(900);
    expect(r.billedPricePerUnit).toBe(1062);
  });

  it('quote create and convert use same inclusive billed total', () => {
    // Negotiated inclusive MRP 1180 × qty 2 must yield same bill as convert
    const r = unitPricesAfterDiscount({
      basePrice: 1180,
      discountPercent: 0,
      withGst: true,
      priceIncludesGst: true,
      gstRate: 18,
    });
    const qty = 2;
    const lineNet = Math.round(r.netPricePerUnit * qty * 100) / 100;
    const lineTotal = Math.round(r.billedPricePerUnit * qty * 100) / 100;
    expect(lineTotal).toBe(2360);
    expect(lineNet).toBe(2000);
    expect(Math.round((lineTotal - lineNet) * 100) / 100).toBe(360);
  });
});
