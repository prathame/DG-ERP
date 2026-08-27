/** Nearest paisa — GST must not round to whole rupees (₹115.02 must not become ₹116). */
export function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** PG numeric and JSON often arrive as strings; Number.isFinite('5') is false. */
export function normalizeGstRate(gstRate: unknown, fallback = 18): number {
  if (gstRate == null || gstRate === '') return fallback;
  const n = Number(gstRate);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** Purchase line: entered cost is inclusive MRP or exclusive rate. */
export function purchaseUnitPrices(opts: {
  enteredCost: number;
  gstRate: unknown;
  withGst: boolean;
  priceIncludesGst: boolean;
  isRcm?: boolean;
}): { cost: number; billed: number; gst: number } {
  const entered = Number(opts.enteredCost) || 0;
  if (entered <= 0) return { cost: 0, billed: 0, gst: 0 };
  const apply = opts.isRcm || opts.withGst;
  if (!apply) return { cost: entered, billed: entered, gst: 0 };
  const rate = normalizeGstRate(opts.gstRate);
  if (opts.priceIncludesGst) {
    const cost = round2(entered / (1 + rate / 100));
    const billed = opts.isRcm ? cost : entered;
    return { cost, billed, gst: round2(billed - cost) };
  }
  const cost = entered;
  const billed = opts.isRcm ? cost : round2(cost * (1 + rate / 100));
  return { cost, billed, gst: round2(billed - cost) };
}
