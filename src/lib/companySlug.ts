/** Static paths that must not be used as tenant company slugs. */
export const RESERVED_COMPANY_SLUGS = ['admin', 'privacy', 'terms', 'download', 'api', 'assets'] as const;

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export function normalizeCompanySlug(raw: string): string {
  return raw.trim().toLowerCase().replace(/^\/+/, '').replace(/\/+$/, '');
}

/**
 * Client-side company URL slug rules (path tenancy: `/{slug}`).
 * `test` is a normal slug — not reserved.
 */
export function validateCompanySlug(raw: string): { ok: true; slug: string } | { ok: false; error: string } {
  const slug = normalizeCompanySlug(raw);
  if (!slug) return { ok: false, error: 'Enter a company slug' };
  if ((RESERVED_COMPANY_SLUGS as readonly string[]).includes(slug)) {
    return { ok: false, error: `"${slug}" is reserved for the app. Try another company slug.` };
  }
  if (slug.includes('--') || !SLUG_RE.test(slug)) {
    return {
      ok: false,
      error: 'Use lowercase letters, numbers, and single hyphens (e.g. acme-traders)',
    };
  }
  if (slug.length > 63) return { ok: false, error: 'Slug must be 63 characters or fewer' };
  return { ok: true, slug };
}
