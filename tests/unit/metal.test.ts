import { describe, expect, it } from 'vitest';
import { computeFineWeight, computeMakingAmount, computeMetalSalePrice } from '../../shared/metal';
import { parseScaleText } from '../../src/lib/scaleBridge';

describe('metal helpers', () => {
  it('computes fine weight from net × purity/1000', () => {
    expect(computeFineWeight(10, 925)).toBe(9.25);
    expect(computeFineWeight(12.345, 999)).toBe(12.333);
  });

  it('computes making and sale price', () => {
    expect(computeMakingAmount(10, 50)).toBe(500);
    expect(computeMetalSalePrice(10, 80, 100)).toBe(900);
  });

  it('guards invalid inputs', () => {
    expect(computeFineWeight(-1, 925)).toBe(0);
    expect(computeMetalSalePrice(NaN, 80, 0)).toBe(0);
  });
});

describe('parseScaleText', () => {
  it('parses grams and kg', () => {
    expect(parseScaleText('12.450 g')?.weight).toBe(12.45);
    expect(parseScaleText('ST,GS,+  0.012 kg')?.weight).toBe(12);
    expect(parseScaleText('W:15.5gm')?.weight).toBe(15.5);
  });

  it('returns null for garbage', () => {
    expect(parseScaleText('no weight here')).toBeNull();
  });

  it('handles plain numeric grams', () => {
    const r = parseScaleText('8.25');
    expect(r?.weight).toBe(8.25);
    expect(r?.source).toBe('wedge');
  });
});
