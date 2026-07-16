/** Persisted company slug for mobile first-launch / return visits. */

const KEY = 'dg_mobile_company_slug';

export function getSavedCompanySlug(): string | null {
  try {
    const s = localStorage.getItem(KEY)?.trim().toLowerCase();
    return s || null;
  } catch {
    return null;
  }
}

export function saveCompanySlug(slug: string): void {
  const clean = slug.trim().toLowerCase().replace(/^\/+|\/+$/g, '');
  localStorage.setItem(KEY, clean);
  localStorage.setItem('dg_last_slug', clean);
}

export function clearSavedCompanySlug(): void {
  localStorage.removeItem(KEY);
}
