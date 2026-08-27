import { describe, expect, it } from 'vitest';
import { saleChallanNumber } from '../../shared/saleChallanNumber';

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
});
