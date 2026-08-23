import { describe, it, expect } from 'vitest';
import { pinFromAddress, estimatePinDistanceKm } from '../../server/utils/pincode';

describe('pinFromAddress', () => {
  it('extracts first 6-digit pincode', () => {
    expect(pinFromAddress('Shop 2, MG Road, Ahmedabad 380001 Gujarat')).toBe('380001');
  });

  it('returns empty when missing', () => {
    expect(pinFromAddress('')).toBe('');
    expect(pinFromAddress(null)).toBe('');
  });
});

describe('estimatePinDistanceKm', () => {
  it('returns 1 for same pin', () => {
    expect(estimatePinDistanceKm('380001', '380001')).toBe(1);
  });

  it('returns positive distance for different pincodes', () => {
    const km = estimatePinDistanceKm('380001', '395001');
    expect(km).toBeGreaterThan(0);
    expect(km).toBeLessThanOrEqual(2000);
  });

  it('returns 0 for invalid pins', () => {
    expect(estimatePinDistanceKm('38', '395001')).toBe(0);
    expect(estimatePinDistanceKm('380001', 'abc')).toBe(0);
  });
});
