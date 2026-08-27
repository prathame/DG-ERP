import { describe, expect, it } from 'vitest';
import { isQtyStockUnit, usesQtyStock } from '../../shared/qtyStock';

describe('qtyStock', () => {
  it('treats bags, kg, and packets as qty stock', () => {
    expect(isQtyStockUnit('Bag')).toBe(true);
    expect(isQtyStockUnit('kg')).toBe(true);
    expect(isQtyStockUnit('Packet')).toBe(true);
    expect(isQtyStockUnit('Box')).toBe(true);
    expect(isQtyStockUnit('Bottle')).toBe(true);
    expect(isQtyStockUnit('ml')).toBe(true);
  });

  it('leaves serial units on barcodes', () => {
    expect(isQtyStockUnit('Piece')).toBe(false);
    expect(isQtyStockUnit('Nos')).toBe(false);
  });

  it('uses qty stock when barcodeMode is none', () => {
    expect(usesQtyStock('Piece', 'none')).toBe(true);
    expect(usesQtyStock('Bag', 'prefix')).toBe(true);
    expect(usesQtyStock('Piece', 'prefix')).toBe(false);
  });
});
