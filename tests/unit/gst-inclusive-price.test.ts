import { describe, it, expect } from 'vitest';
import { linePricesAfterDiscount, stripInclusiveGst } from '../../src/lib/gstInclusivePrice';

describe('gstInclusivePrice', () => {
  it('strips inclusive GST', () => {
    expect(stripInclusiveGst(1180, 18)).toBe(1000);
  });

  it('matches server: GST off + inclusive → exclusive billed', () => {
    const r = linePricesAfterDiscount({
      unitPrice: 1180,
      quantity: 2,
      discountPercent: 0,
      withGst: false,
      priceIncludesGst: true,
      gstRate: 18,
    });
    expect(r.net).toBe(2000);
    expect(r.gst).toBe(0);
    expect(r.billed).toBe(2000);
  });

  it('inclusive + GST on keeps MRP as billed', () => {
    const r = linePricesAfterDiscount({
      unitPrice: 1180,
      quantity: 1,
      discountPercent: 0,
      withGst: true,
      priceIncludesGst: true,
      gstRate: 18,
    });
    expect(r.billed).toBe(1180);
    expect(r.net).toBe(1000);
    expect(r.gst).toBe(180);
  });
});
