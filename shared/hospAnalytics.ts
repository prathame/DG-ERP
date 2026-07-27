/** Period bounds + revenue helpers for hotel_restaurant analytics. */

export type HospAnalyticsPeriod = 'today' | 'week';

/** Start of UTC day for `today`, or 6 days before that (7 calendar days) for `week`. */
export function hospAnalyticsPeriodStart(period: HospAnalyticsPeriod, now: Date = new Date()): Date {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  if (period === 'week') d.setUTCDate(d.getUTCDate() - 6);
  return d;
}

export function parseHospAnalyticsPeriod(raw: unknown): HospAnalyticsPeriod {
  return raw === 'week' ? 'week' : 'today';
}

/** Payable after order discount (mirrors orderDetail total). */
export function hospOrderPayable(
  subtotal: number,
  discountPercent: number,
  discountAmount: number,
  computeDiscount: (sub: number, pct: number, flat: number) => number,
): number {
  const discount = computeDiscount(subtotal, discountPercent, discountAmount);
  return Math.round((Math.max(0, subtotal) - discount) * 100) / 100;
}
