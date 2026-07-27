import { describe, expect, it, beforeEach } from 'vitest';
import {
  normalizeCompanySlug,
  validateCompanySlug,
  getLastCompanySlug,
  setLastCompanySlug,
  clearLastCompanySlug,
  LAST_COMPANY_SLUG_KEY,
} from '../../src/lib/companySlug';

describe('companySlug', () => {
  beforeEach(() => {
    try {
      localStorage.removeItem(LAST_COMPANY_SLUG_KEY);
    } catch {
      /* ignore */
    }
  });

  it('normalizes whitespace, case, and leading slashes', () => {
    expect(normalizeCompanySlug('  /Acme-Traders/ ')).toBe('acme-traders');
  });

  it('allows test (not reserved)', () => {
    expect(validateCompanySlug('test')).toEqual({ ok: true, slug: 'test' });
  });

  it('rejects reserved static paths with a clear message', () => {
    const r = validateCompanySlug('admin');
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.error).toMatch(/reserved/i);
  });

  it('rejects invalid characters and double hyphens', () => {
    expect(validateCompanySlug('Acme Traders').ok).toBe(false);
    expect(validateCompanySlug('acme--traders').ok).toBe(false);
    expect(validateCompanySlug('-acme').ok).toBe(false);
  });

  it('allows single-segment alphanumerics and hyphenated slugs', () => {
    expect(validateCompanySlug('a')).toEqual({ ok: true, slug: 'a' });
    expect(validateCompanySlug('acme-traders')).toEqual({ ok: true, slug: 'acme-traders' });
  });

  it('remembers and clears last company slug (deleted-tenant escape)', () => {
    expect(getLastCompanySlug()).toBe('');
    setLastCompanySlug('/Test/');
    expect(getLastCompanySlug()).toBe('test');
    expect(localStorage.getItem(LAST_COMPANY_SLUG_KEY)).toBe('test');
    clearLastCompanySlug();
    expect(getLastCompanySlug()).toBe('');
    expect(localStorage.getItem(LAST_COMPANY_SLUG_KEY)).toBeNull();
  });
});
