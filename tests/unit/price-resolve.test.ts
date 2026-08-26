import { describe, it, expect } from 'vitest';
import {
  hasExplicitUnitPrice,
  inferBaseUnitPrice,
  resolveGstRate,
  unitPricesAfterDiscount,
} from '../../server/utils/price-resolve';

describe('resolveGstRate', () => {
  it('uses product rate including 0', () => {
    expect(resolveGstRate(5, 18)).toBe(5);
    expect(resolveGstRate(0, 18)).toBe(0);
  });
  it('falls back to company default then 18', () => {
    expect(resolveGstRate(null, 12)).toBe(12);
    expect(resolveGstRate(undefined, undefined)).toBe(18);
    expect(resolveGstRate(NaN, 12)).toBe(12);
  });
});

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

  it('keeps exclusive GST on paisa (USB ₹120 + earphones ₹399 @ 18%)', () => {
    const usb = unitPricesAfterDiscount({
      basePrice: 120,
      discountPercent: 0,
      withGst: true,
      priceIncludesGst: false,
      gstRate: 18,
    });
    const earphones = unitPricesAfterDiscount({
      basePrice: 399,
      discountPercent: 0,
      withGst: true,
      priceIncludesGst: false,
      gstRate: 18,
    });
    expect(usb.billedPricePerUnit).toBe(141.6);
    expect(earphones.billedPricePerUnit).toBe(470.82);
    const net = 120 * 2 + 399;
    const billed = Math.round((usb.billedPricePerUnit * 2 + earphones.billedPricePerUnit) * 100) / 100;
    const tax = Math.round((billed - net) * 100) / 100;
    expect(net).toBe(639);
    expect(tax).toBe(115.02);
    expect(billed).toBe(754.02);
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

  it('GST off treats base as exclusive (UI/createBatch already stripped inclusive MRP)', () => {
    const r = unitPricesAfterDiscount({
      basePrice: 1000,
      discountPercent: 0,
      withGst: false,
      priceIncludesGst: false,
      gstRate: 18,
    });
    expect(r.netPricePerUnit).toBe(1000);
    expect(r.billedPricePerUnit).toBe(1000);
  });

  it('inferBaseUnitPrice reverses exclusive GST + discount', () => {
    const priced = unitPricesAfterDiscount({
      basePrice: 1000,
      discountPercent: 10,
      withGst: true,
      priceIncludesGst: false,
      gstRate: 18,
    });
    expect(
      inferBaseUnitPrice({
        billedPrice: priced.billedPricePerUnit,
        netPrice: priced.netPricePerUnit,
        discountPercent: 10,
        withGst: true,
        priceIncludesGst: false,
      }),
    ).toBe(1000);
  });
});
