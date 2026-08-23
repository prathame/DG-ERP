import { describe, it, expect } from 'vitest';
import { checkEinvoiceEligibility, lookupTransportDistance } from '../../server/services/gstCompliance';

describe('checkEinvoiceEligibility', () => {
  it('treats valid GSTIN as enabled in mock mode', async () => {
    const r = await checkEinvoiceEligibility('27AAAAA0000A1Z5', 'Acme', 'mock');
    expect(r.enabled).toBe(true);
    expect(r.status).toBe('enabled');
  });

  it('rejects invalid GSTIN format', async () => {
    const r = await checkEinvoiceEligibility('BAD', 'Acme', 'mock');
    expect(r.enabled).toBe(false);
    expect(r.status).toBe('disabled');
  });

  it('returns unknown when GSTIN is empty', async () => {
    const r = await checkEinvoiceEligibility('', 'Acme', 'mock');
    expect(r.enabled).toBe(false);
    expect(r.status).toBe('unknown');
    expect(r.message).toMatch(/enter a gstin/i);
  });

  it('guides user when live eligibility is not configured', async () => {
    const r = await checkEinvoiceEligibility('27AAAAA0000A1Z5', 'Acme', 'sandbox');
    expect(r.enabled).toBe(false);
    expect(r.status).toBe('unknown');
    expect(r.message).toMatch(/not configured/i);
  });
});

describe('lookupTransportDistance', () => {
  it('estimates distance from pins', () => {
    const r = lookupTransportDistance({ fromPin: '380001', toPin: '395001', mode: 'mock' });
    expect(r.source).toBe('pin_estimate');
    expect(r.distanceKm).toBeGreaterThan(0);
  });

  it('extracts pins from addresses', () => {
    const r = lookupTransportDistance({
      fromAddress: 'Ahmedabad 380001',
      toAddress: 'Surat 395001',
      mode: 'mock',
    });
    expect(r.fromPin).toBe('380001');
    expect(r.toPin).toBe('395001');
    expect(r.distanceKm).toBeGreaterThan(0);
  });

  it('returns invalid_pin when pins missing', () => {
    const r = lookupTransportDistance({ fromPin: '12', toPin: '395001', mode: 'mock' });
    expect(r.source).toBe('invalid_pin');
    expect(r.distanceKm).toBe(0);
  });
});
