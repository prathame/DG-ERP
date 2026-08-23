import { describe, expect, it } from 'vitest';
import { isEinvoiceApiMode, isEinvoicePortalMode, normalizeEinvoiceMode } from '../../shared/gstEinvoiceMode';

describe('gstEinvoiceMode', () => {
  it('normalizes portal and api', () => {
    expect(normalizeEinvoiceMode('portal')).toBe('portal');
    expect(normalizeEinvoiceMode('api')).toBe('api');
  });

  it('maps legacy manual and auto to api', () => {
    expect(normalizeEinvoiceMode('manual')).toBe('api');
    expect(normalizeEinvoiceMode('auto')).toBe('api');
  });

  it('defaults unknown to portal', () => {
    expect(normalizeEinvoiceMode(null)).toBe('portal');
    expect(normalizeEinvoiceMode('')).toBe('portal');
  });

  it('mode helpers', () => {
    expect(isEinvoicePortalMode('portal')).toBe(true);
    expect(isEinvoiceApiMode('api')).toBe(true);
    expect(isEinvoiceApiMode('manual')).toBe(true);
    expect(isEinvoicePortalMode('manual')).toBe(false);
  });
});
