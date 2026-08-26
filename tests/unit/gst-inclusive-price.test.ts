import { describe, it, expect } from 'vitest';
import {
  adjustUnitPriceForGstToggle,
  displayUnitPriceForGst,
  linePricesAfterDiscount,
  stripInclusiveGst,
} from '../../src/lib/gstInclusivePrice';

describe('gstInclusivePrice', () => {
  it('strips inclusive GST', () => {
    expect(stripInclusiveGst(1180, 18)).toBe(1000);
  });

  it('inclusive product: GST off strips displayed unit price; GST on restores', () => {
    const off = adjustUnitPriceForGstToggle(1180, {
      prevWithGst: true,
      nextWithGst: false,
      priceIncludesGst: true,
      gstRate: 18,
    });
    expect(off).toBe(1000);
    const on = adjustUnitPriceForGstToggle(off, {
      prevWithGst: false,
      nextWithGst: true,
      priceIncludesGst: true,
      gstRate: 18,
    });
    expect(on).toBe(1180);
  });

  it('exclusive product: GST toggle does not change unit price', () => {
    const off = adjustUnitPriceForGstToggle(1000, {
      prevWithGst: true,
      nextWithGst: false,
      priceIncludesGst: false,
      gstRate: 18,
    });
    expect(off).toBe(1000);
    const on = adjustUnitPriceForGstToggle(1000, {
      prevWithGst: false,
      nextWithGst: true,
      priceIncludesGst: false,
      gstRate: 18,
    });
    expect(on).toBe(1000);
  });

  it('displayUnitPriceForGst strips catalog when GST off + inclusive', () => {
    expect(displayUnitPriceForGst(1180, { withGst: false, priceIncludesGst: true, gstRate: 18 })).toBe(1000);
    expect(displayUnitPriceForGst(1180, { withGst: true, priceIncludesGst: true, gstRate: 18 })).toBe(1180);
    expect(displayUnitPriceForGst(1000, { withGst: false, priceIncludesGst: false, gstRate: 18 })).toBe(1000);
  });

  it('preview: inclusive + GST on keeps MRP billed; after strip GST off bills exclusive', () => {
    const inclOn = linePricesAfterDiscount({
      unitPrice: 1180,
      quantity: 1,
      discountPercent: 0,
      withGst: true,
      priceIncludesGst: true,
      gstRate: 18,
    });
    expect(inclOn.billed).toBe(1180);
    expect(inclOn.net).toBe(1000);

    // Field already stripped by toggle
    const inclOff = linePricesAfterDiscount({
      unitPrice: 1000,
      quantity: 1,
      discountPercent: 0,
      withGst: false,
      priceIncludesGst: false,
      gstRate: 18,
    });
    expect(inclOff.billed).toBe(1000);
    expect(inclOff.gst).toBe(0);
  });

  it('preview: exclusive + GST on adds tax; GST off uses base', () => {
    const on = linePricesAfterDiscount({
      unitPrice: 1000,
      quantity: 1,
      discountPercent: 0,
      withGst: true,
      priceIncludesGst: false,
      gstRate: 18,
    });
    expect(on.billed).toBe(1180);
    const off = linePricesAfterDiscount({
      unitPrice: 1000,
      quantity: 1,
      discountPercent: 0,
      withGst: false,
      priceIncludesGst: false,
      gstRate: 18,
    });
    expect(off.billed).toBe(1000);
  });

  it('preview: exclusive 2×₹120 + ₹399 @ 18% bills ₹754.02 not ₹755', () => {
    const usb = linePricesAfterDiscount({
      unitPrice: 120,
      quantity: 2,
      discountPercent: 0,
      withGst: true,
      priceIncludesGst: false,
      gstRate: 18,
    });
    const earphones = linePricesAfterDiscount({
      unitPrice: 399,
      quantity: 1,
      discountPercent: 0,
      withGst: true,
      priceIncludesGst: false,
      gstRate: 18,
    });
    expect(usb.billed).toBe(283.2);
    expect(earphones.billed).toBe(470.82);
    expect(Math.round((usb.billed + earphones.billed) * 100) / 100).toBe(754.02);
    expect(Math.round((usb.gst + earphones.gst) * 100) / 100).toBe(115.02);
  });
});
