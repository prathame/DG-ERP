import { describe, expect, it } from 'vitest';
import { isQtyStockUnit, packUnitWord, parseStockQty, usesQtyStock } from '../../shared/qtyStock';

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

  it('packUnitWord does not turn Bottle into Bottlees', () => {
    expect(packUnitWord('Bottle', false)).toBe('Bottle');
    expect(packUnitWord('Bottle', true)).toBe('Bottles');
    expect(packUnitWord('Box', true)).toBe('Boxes');
    expect(packUnitWord('Bag', true)).toBe('Bags');
    expect(packUnitWord('Packet', true)).toBe('Packets');
    expect(packUnitWord('Bottles', true)).toBe('Bottles');
    expect(packUnitWord('kg', true)).toBe('kg');
  });

  it('parseStockQty rejects 0, negative, and non-numeric instead of coercing to 1', () => {
    expect(parseStockQty(0)).toBeNull();
    expect(parseStockQty(-1)).toBeNull();
    expect(parseStockQty('abc')).toBeNull();
    expect(parseStockQty(1)).toBe(1);
    expect(parseStockQty(2.9)).toBe(2);
  });
});
