import { describe, expect, it } from 'vitest';
import { EWB_MAX_DOC_AGE_DAYS, validateEwbCompliance } from '../../shared/gstEwbValidation';

describe('validateEwbCompliance', () => {
  it('errors when document older than 180 days', () => {
    const old = new Date();
    old.setDate(old.getDate() - (EWB_MAX_DOC_AGE_DAYS + 1));
    const r = validateEwbCompliance({
      docDate: old.toISOString(),
      totInvValue: 100_000,
      distance: 100,
      vehicleNo: 'GJ01AB1234',
      transportMode: '1',
    });
    expect(r.valid).toBe(false);
    expect(r.errors[0]).toMatch(/180 days/i);
  });

  it('allows distance 0 with warning', () => {
    const r = validateEwbCompliance({
      docDate: new Date().toISOString(),
      totInvValue: 100_000,
      distance: 0,
      vehicleNo: 'GJ01AB1234',
      transportMode: '1',
    });
    expect(r.valid).toBe(true);
    expect(r.warnings.some(w => /pin-to-pin/i.test(w))).toBe(true);
  });

  it('warns below 50000 threshold', () => {
    const r = validateEwbCompliance({
      docDate: new Date().toISOString(),
      totInvValue: 10_000,
      distance: 50,
      vehicleNo: 'GJ01AB1234',
      transportMode: '1',
    });
    expect(r.warnings.some(w => /50,000|50000/i.test(w))).toBe(true);
  });
});
