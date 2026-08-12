import { describe, it, expect } from 'vitest';
import { resolveShipToGstin } from '../../server/utils/helpers';

describe('resolveShipToGstin', () => {
  it('uses override when provided', () => {
    expect(resolveShipToGstin('24AAAAA0000A1Z5', '27BBBBB0000B1Z5')).toBe('24AAAAA0000A1Z5');
  });

  it('trims and uppercases override', () => {
    expect(resolveShipToGstin(' 24aaaaa0000a1z5 ', '27BBBBB0000B1Z5')).toBe('24AAAAA0000A1Z5');
  });

  it('falls back to buyer GSTIN', () => {
    expect(resolveShipToGstin('', '27BBBBB0000B1Z5')).toBe('27BBBBB0000B1Z5');
    expect(resolveShipToGstin(null, '27BBBBB0000B1Z5')).toBe('27BBBBB0000B1Z5');
    expect(resolveShipToGstin(undefined, '27BBBBB0000B1Z5')).toBe('27BBBBB0000B1Z5');
  });

  it('falls back to URP when neither set', () => {
    expect(resolveShipToGstin('', '')).toBe('URP');
    expect(resolveShipToGstin(null, null)).toBe('URP');
    expect(resolveShipToGstin(undefined, undefined)).toBe('URP');
  });
});
