import { describe, expect, it } from 'vitest';
import { expandPurchaseStockUnits } from '../../server/services/purchaseStockOps';

describe('expandPurchaseStockUnits', () => {
  it('expands qty without tax', () => {
    const units = expandPurchaseStockUnits([{ productId: 'P1', qty: 2, rate: 50, amount: 100 }], 0, 100);
    expect(units).toHaveLength(2);
    expect(units[0]).toMatchObject({ productId: 'P1', costPrice: 50, billedPrice: 50, gstApplied: false });
  });

  it('allocates voucher tax across units', () => {
    const units = expandPurchaseStockUnits([{ productId: 'P1', qty: 2, rate: 50, amount: 100 }], 18, 118);
    expect(units).toHaveLength(2);
    expect(units.every(u => u.gstApplied)).toBe(true);
    const tax = units.reduce((s, u) => s + (u.billedPrice - u.costPrice), 0);
    expect(Math.round(tax * 100) / 100).toBe(18);
  });
});
