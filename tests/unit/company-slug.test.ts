import { describe, expect, it } from 'vitest';
import { normalizeCompanySlug, validateCompanySlug } from '../../src/lib/companySlug';

describe('companySlug', () => {
  it('normalizes whitespace, case, and leading slashes', () => {
    expect(normalizeCompanySlug('  /Acme-Traders/ ')).toBe('acme-traders');
  });

  it('allows test (not reserved)', () => {
    expect(validateCompanySlug('test')).toEqual({ ok: true, slug: 'test' });
  });

  it('rejects reserved static paths with a clear message', () => {
    const r = validateCompanySlug('admin');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/reserved/i);
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
});
