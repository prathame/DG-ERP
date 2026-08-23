/** E-Invoice generation mode: portal (JSON upload) vs api (NIC credentials). */
export type EinvoiceMode = 'portal' | 'api';

/**
 * Normalize DB / session value.
 * Legacy: `manual` and `auto` both meant API generation (button or auto-on-sent).
 */
export function normalizeEinvoiceMode(v: unknown): EinvoiceMode {
  const s = String(v || '').toLowerCase();
  if (s === 'portal') return 'portal';
  if (s === 'api' || s === 'auto' || s === 'manual') return 'api';
  return 'portal';
}

export function isEinvoiceApiMode(v: unknown): boolean {
  return normalizeEinvoiceMode(v) === 'api';
}

export function isEinvoicePortalMode(v: unknown): boolean {
  return normalizeEinvoiceMode(v) === 'portal';
}
