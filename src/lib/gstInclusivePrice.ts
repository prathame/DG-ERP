/**
 * Inclusive-MRP helpers for create-time GST checkboxes (non-service).
 * Server `unitPricesAfterDiscount` is the source of truth on save; UI mirrors it.
 */

export function stripInclusiveGst(unitPrice: number, gstRate: number): number {
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) return unitPrice;
  const rate = Number.isFinite(gstRate) ? gstRate : 18;
  return Math.round((unitPrice / (1 + rate / 100)) * 100) / 100;
}

/** Per-line net / GST / billed — matches server unitPricesAfterDiscount. */
export function linePricesAfterDiscount(opts: {
  unitPrice: number;
  quantity: number;
  discountPercent: number;
  withGst: boolean;
  priceIncludesGst: boolean;
  gstRate: number;
}): { net: number; gst: number; billed: number; gross: number; discount: number } {
  const qty = opts.quantity || 0;
  const gross = opts.unitPrice * qty;
  const disc = Math.round((gross * Math.min(100, Math.max(0, opts.discountPercent || 0))) / 100);
  const priceAfterDisc = gross - disc;
  const rate = Number.isFinite(opts.gstRate) ? opts.gstRate : 18;

  if (opts.withGst && opts.priceIncludesGst) {
    const billed = priceAfterDisc;
    const net = Math.round(priceAfterDisc / (1 + rate / 100));
    return { gross, discount: disc, net, gst: billed - net, billed };
  }
  if (opts.withGst) {
    const net = priceAfterDisc;
    const gst = Math.round((net * rate) / 100);
    return { gross, discount: disc, net, gst, billed: net + gst };
  }
  // GST off + inclusive MRP → bill exclusive (same as server helper)
  if (opts.priceIncludesGst) {
    const net = Math.round(priceAfterDisc / (1 + rate / 100));
    return { gross, discount: disc, net, gst: 0, billed: net };
  }
  return { gross, discount: disc, net: priceAfterDisc, gst: 0, billed: priceAfterDisc };
}
