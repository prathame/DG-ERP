/** Party credit terms (RealBooks-style credit period / limit). */

export type CreditTerms = {
  creditLimit: number | null;
  creditPeriodDays: number | null;
};

/** Parse optional credit period (days). Empty/null → null. Throws on invalid. */
export function parseCreditPeriodDays(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 3650 || !Number.isInteger(n)) {
    throw new Error('Credit period must be a whole number of days between 0 and 3650');
  }
  return n;
}

/** Parse optional credit limit (INR). Empty/null → null. Throws on invalid. */
export function parseCreditLimit(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 1e12) {
    throw new Error('Credit limit must be a non-negative amount');
  }
  return Math.round(n * 100) / 100;
}

/** Map DB columns onto API fields. */
export function creditTermsFromRow(r: Record<string, unknown>): CreditTerms {
  const lim = r.credit_limit;
  const days = r.credit_period_days;
  return {
    creditLimit: lim == null || lim === '' ? null : Number(lim),
    creditPeriodDays: days == null || days === '' ? null : Number(days),
  };
}

/** Add calendar days to YYYY-MM-DD (local date math). */
export function addCalendarDaysIso(isoDate: string, days: number): string {
  const raw = String(isoDate || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || !Number.isFinite(days)) return raw;
  const [y, m, d] = raw.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}
