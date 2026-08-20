import { describe, it, expect } from 'vitest';
import { mmToPx } from '../../src/lib/barcodeLabelRender';

describe('barcode label render helpers', () => {
  it('converts millimeters to pixels with optional scale', () => {
    const base = mmToPx(10);
    expect(base).toBeGreaterThan(37);
    expect(base).toBeLessThan(38);
    expect(mmToPx(10, 2)).toBeCloseTo(base * 2, 5);
    expect(mmToPx(38)).toBeGreaterThan(mmToPx(25));
  });
});
