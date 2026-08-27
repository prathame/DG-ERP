import { describe, expect, it } from 'vitest';
import { saleChallanNumber, saleChallanBase } from '../../shared/saleChallanNumber';

describe('saleChallanNumber', () => {
  it('keeps two batches in the same second unique', () => {
    const a = saleChallanNumber('D1787836048123-aaa111', 1, 0);
    const b = saleChallanNumber('D1787836048123-bbb222', 1, 0);
    expect(a).toBe('CH-1787836048123-aaa111-GST');
    expect(b).toBe('CH-1787836048123-bbb222-GST');
    expect(a).not.toBe(b);
  });

  it('does not collapse uid timestamps to 10 digits', () => {
    const sliced = `CH-${'D1787836048123-aaa111'.replace(/^D/, '').slice(0, 10)}-GST`;
    expect(saleChallanNumber('D1787836048123-aaa111', 1, 0)).not.toBe(sliced);
  });

  it('uses BOS when the batch has no GST units', () => {
    expect(saleChallanNumber('D1-abc', 0, 2)).toBe('CH-1-abc-BOS');
    expect(saleChallanNumber('D1-abc', 0, 0)).toBe('CH-1-abc');
  });

  it('saleChallanBase keeps same-second batches unique for Sales docs', () => {
    const a = saleChallanBase('D1787844066760-36fc92');
    const b = saleChallanBase('D1787844066071-b8db66');
    expect(a).toBe('CH-1787844066760-36fc92');
    expect(b).toBe('CH-1787844066071-b8db66');
    expect(a).not.toBe(b);
    const sliced = `CH-${'D1787844066760-36fc92'.replace(/^D/, '').slice(0, 10)}`;
    expect(a).not.toBe(sliced);
  });
});
