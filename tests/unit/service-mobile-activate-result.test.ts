import { describe, expect, it } from 'vitest';
import { normalizeActivateResult } from '../../src/platforms/service-mobile/activateResult';

describe('normalizeActivateResult', () => {
  it('accepts canonical camelCase success', () => {
    const r = normalizeActivateResult(
      200,
      {
        valid: true,
        licenseKey: 'DG-SM-ABC',
        companyName: 'Acme Electric',
        adminEmail: 'a@b.com',
        validUntil: null,
        settings: {},
        tabConfig: {},
        hasBackup: false,
        businessType: 'service',
        maxUsers: 1,
      },
      'DG-SM-ABC',
    );
    expect(r.valid).toBe(true);
    expect(r.companyName).toBe('Acme Electric');
  });

  it('accepts 200 with companyName even if valid flag missing (bug-report case)', () => {
    const r = normalizeActivateResult(200, { companyName: 'Acme Electric', licenseKey: 'DG-SM-B7XX' }, 'DG-SM-B7XX');
    expect(r.valid).toBe(true);
    expect(r.companyName).toBe('Acme Electric');
    expect(r.error).toBeUndefined();
  });

  it('accepts snake_case company_name', () => {
    const r = normalizeActivateResult(200, { company_name: 'Wire Works', license_key: 'DG-SM-ZZ' }, 'DG-SM-ZZ');
    expect(r.valid).toBe(true);
    expect(r.companyName).toBe('Wire Works');
  });

  it('rejects empty 200 body with a clear error (not bare Activation failed)', () => {
    const r = normalizeActivateResult(200, {}, 'DG-SM-B7XX');
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/incomplete response/i);
  });

  it('maps HTTP errors', () => {
    const r = normalizeActivateResult(403, { error: 'License already activated on another device' }, 'DG-SM-X');
    expect(r.valid).toBe(false);
    expect(r.error).toContain('another device');
  });
});
