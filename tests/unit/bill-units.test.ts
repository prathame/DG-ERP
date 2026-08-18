import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BILL_UNITS,
  billUnitToGstUqc,
  formatBillQty,
  normalizeBillUnits,
  normalizeLineUnit,
  parseBillQty,
} from '../../shared/billUnits';

describe('billUnits', () => {
  it('normalizes defaults when empty', () => {
    expect(normalizeBillUnits(undefined)).toEqual([...DEFAULT_BILL_UNITS]);
    expect(normalizeBillUnits([])).toEqual([...DEFAULT_BILL_UNITS]);
  });

  it('dedupes and trims custom units', () => {
    expect(normalizeBillUnits([' Kg ', 'kg', 'Dozen', ''])).toEqual(['Kg', 'Dozen']);
  });

  it('parses fractional qty', () => {
    expect(parseBillQty('2.5')).toBe(2.5);
    expect(parseBillQty('', 0)).toBe(0);
    expect(parseBillQty('x', 1)).toBe(1);
  });

  it('formats qty without trailing noise', () => {
    expect(formatBillQty(2)).toBe('2');
    expect(formatBillQty(2.5)).toBe('2.5');
  });

  it('maps common units to GST UQC', () => {
    expect(billUnitToGstUqc('Piece')).toBe('NOS');
    expect(billUnitToGstUqc('Kg')).toBe('KGS');
    expect(billUnitToGstUqc('Meter')).toBe('MTR');
    expect(billUnitToGstUqc('Inch')).toBe('INC');
    expect(normalizeLineUnit('', 'Piece')).toBe('Piece');
  });
});
