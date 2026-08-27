/** Calendar YYYY-MM-DD in Asia/Kolkata. Avoids UTC slice shifting IST dates. */
export function calendarDateIST(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  }
  const s = String(value ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  }
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : s;
}

/** True when expiry is set and is before asOf (IST calendar). Sale on the expiry day is still allowed. */
export function isProductExpired(expiry: unknown, asOf: Date | string = new Date()): boolean {
  if (expiry == null || expiry === '') return false;
  const exp = calendarDateIST(expiry);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(exp)) return false;
  const day = calendarDateIST(asOf);
  return exp < day;
}

export function expiredProductSaleError(name: string): string {
  return `${name} has expired and cannot be sold`;
}
