import { describe, expect, it } from 'vitest';
import {
  matchByName,
  parsePrefillQty,
  pickPrefill,
  prefillCustomerName,
  prefillProductName,
} from '../../src/lib/aiFormPrefill';

describe('pickPrefill', () => {
  it('drops empty values', () => {
    expect(pickPrefill({ customerName: 'Ramesh', productName: '  ' })).toEqual({ customerName: 'Ramesh' });
    expect(pickPrefill({})).toBeNull();
  });
});

describe('prefill aliases', () => {
  it('reads customer and item aliases', () => {
    expect(prefillCustomerName({ customer: 'Ramesh' })).toBe('Ramesh');
    expect(prefillProductName({ item: 'Falcon battery' })).toBe('Falcon battery');
  });
});

describe('parsePrefillQty', () => {
  it('defaults to 1', () => {
    expect(parsePrefillQty(undefined)).toBe(1);
    expect(parsePrefillQty('2')).toBe(2);
  });
});

describe('matchByName', () => {
  const items = [{ name: 'Falcon Battery (16L sprayer)' }, { name: 'Urea 50kg' }];

  it('matches tokens in a longer catalog name', () => {
    expect(matchByName(items, 'falcon battery 16')?.name).toContain('Falcon');
  });

  it('returns undefined when nothing fits', () => {
    expect(matchByName(items, 'unknown sku')).toBeUndefined();
  });
});
