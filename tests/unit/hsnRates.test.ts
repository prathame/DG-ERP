import { describe, expect, it } from 'vitest';
import { suggestHsnRate } from '../../src/lib/hsnRates';

describe('suggestHsnRate', () => {
  it('recognizes sowing seeds HSN 1209 at 5%', () => {
    expect(suggestHsnRate('1209')).toEqual({ rate: 5, label: 'Seeds (sowing)' });
    expect(suggestHsnRate('12091000')?.rate).toBe(5);
  });
});
