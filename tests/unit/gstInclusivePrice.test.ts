import { describe, expect, it } from 'vitest';
import { linePricesAfterDiscount, normalizeGstRate, purchaseUnitPrices } from '../../src/lib/gstInclusivePrice';

describe('normalizeGstRate', () => {
  it('accepts numeric strings from PG/JSON', () => {
    expect(normalizeGstRate('5')).toBe(5);
    expect(normalizeGstRate('18')).toBe(18);
  });

  it('falls back when missing', () => {
    expect(normalizeGstRate(undefined)).toBe(18);
    expect(normalizeGstRate(null)).toBe(18);
  });
});

describe('linePricesAfterDiscount mixed GST', () => {
  it('uses 5% not 18% when rate arrives as a string', () => {
    const m = linePricesAfterDiscount({
      unitPrice: 520,
      quantity: 2,
      discountPercent: 0,
      withGst: true,
      priceIncludesGst: true,
      gstRate: '5' as unknown as number,
    });
    expect(m.billed).toBe(1040);
    expect(m.gst).toBeCloseTo(49.52, 2);
    expect(m.net).toBeCloseTo(990.48, 2);
  });
});

describe('purchaseUnitPrices', () => {
  it('strips GST when the entered cost already includes tax', () => {
    const u = purchaseUnitPrices({
      enteredCost: 450,
      gstRate: 5,
      withGst: true,
      priceIncludesGst: true,
    });
    expect(u.billed).toBe(450);
    expect(u.cost).toBeCloseTo(428.57, 2);
    expect(u.gst).toBeCloseTo(21.43, 2);
  });

  it('adds GST on exclusive cost', () => {
    const add = purchaseUnitPrices({
      enteredCost: 450,
      gstRate: 5,
      withGst: true,
      priceIncludesGst: false,
    });
    expect(add.cost).toBe(450);
    expect(add.billed).toBeCloseTo(472.5, 2);
    expect(add.gst).toBeCloseTo(22.5, 2);
  });
});
