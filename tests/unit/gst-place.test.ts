import { describe, it, expect } from 'vitest';
import { gstinStateCode, isInterstateSupply, splitGstTax } from '../../server/utils/gst-place';

describe('gstinStateCode', () => {
  it('reads first two chars', () => {
    expect(gstinStateCode('27AAAAA0000A1Z5')).toBe('27');
  });
  it('handles null', () => {
    expect(gstinStateCode(null)).toBeNull();
  });
});

describe('isInterstateSupply', () => {
  it('is true when states differ', () => {
    expect(isInterstateSupply('27AAAAA0000A1Z5', '29BBBBB0000B1Z5')).toBe(true);
  });
  it('is false when same state', () => {
    expect(isInterstateSupply('27AAAAA0000A1Z5', '27BBBBB0000B1Z5')).toBe(false);
  });
  it('is false when buyer GSTIN missing', () => {
    expect(isInterstateSupply('27AAAAA0000A1Z5', null)).toBe(false);
  });
});

describe('splitGstTax', () => {
  it('puts all on IGST when interstate', () => {
    expect(splitGstTax(180, true)).toEqual({ taxCgst: 0, taxSgst: 0, taxIgst: 180 });
  });
  it('splits CGST/SGST when intra', () => {
    expect(splitGstTax(180, false)).toEqual({ taxCgst: 90, taxSgst: 90, taxIgst: 0 });
  });
});
