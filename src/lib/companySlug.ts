/** Static paths that must not be used as tenant company slugs. */
export const RESERVED_COMPANY_SLUGS = ['admin', 'privacy', 'terms', 'download', 'api', 'assets'] as const;

/** Remembered company for Cloud Electron / Online Cap return visits. */
export const LAST_COMPANY_SLUG_KEY = 'dg_last_slug';

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export function normalizeCompanySlug(raw: string): string {
  return raw.trim().toLowerCase().replace(/^\/+/, '').replace(/\/+$/, '');
}

export function getLastCompanySlug(): string {
  try {
    return normalizeCompanySlug(String(localStorage.getItem(LAST_COMPANY_SLUG_KEY) || ''));
  } catch {
    return '';
  }
}

export function setLastCompanySlug(slug: string): void {
  const n = normalizeCompanySlug(slug);
  if (!n) return;
  try {
    localStorage.setItem(LAST_COMPANY_SLUG_KEY, n);
  } catch {
    /* ignore quota / private mode */
  }
}

/** Drop remembered slug so Choose company / home does not bounce to a deleted tenant. */
export function clearLastCompanySlug(): void {
  try {
    localStorage.removeItem(LAST_COMPANY_SLUG_KEY);
  } catch {
    /* ignore */
  }
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
