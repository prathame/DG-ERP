/**
 * Inclusive-MRP helpers for create-time GST checkboxes (non-service).
 * When GST is toggled, inclusive products mutate the unit-price field (strip/restore).
 * Exclusive products keep the base price; GST is only added in billed totals when on.
 */

export function stripInclusiveGst(unitPrice: number, gstRate: number): number {
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) return unitPrice;
  const rate = Number.isFinite(gstRate) ? gstRate : 18;
  return Math.round((unitPrice / (1 + rate / 100)) * 100) / 100;
}

export function restoreInclusiveGst(unitPrice: number, gstRate: number): number {
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) return unitPrice;
  const rate = Number.isFinite(gstRate) ? gstRate : 18;
  return Math.round(unitPrice * (1 + rate / 100) * 100) / 100;
}

/**
 * Adjust displayed unit price when GST checkbox changes.
 * Inclusive MRP: OFF strips tax out; ON puts it back.
 * Exclusive catalog: price field unchanged (tax is additive on billed only).
 */
export function adjustUnitPriceForGstToggle(
  currentPrice: number,
  opts: { prevWithGst: boolean; nextWithGst: boolean; priceIncludesGst: boolean; gstRate: number },
): number {
  if (!opts.priceIncludesGst || opts.prevWithGst === opts.nextWithGst) return currentPrice;
  if (!opts.nextWithGst) return stripInclusiveGst(currentPrice, opts.gstRate);
  return restoreInclusiveGst(currentPrice, opts.gstRate);
}

/** Catalog / resolved list price as it should appear given current GST checkbox. */
export function displayUnitPriceForGst(
  catalogPrice: number,
  opts: { withGst: boolean; priceIncludesGst: boolean; gstRate: number },
): number {
  if (!opts.priceIncludesGst || opts.withGst) return catalogPrice;
  return stripInclusiveGst(catalogPrice, opts.gstRate);
}

/**
 * Per-line net / GST / billed.
 * Assumes unitPrice is already adjusted for inclusive+GST-off (stripped in the field).
 * Matches server unitPricesAfterDiscount when createBatch receives that same unit price
 * with priceIncludesGst only while withGst is true.
 */
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

  // Inclusive field still holds MRP only while GST is on
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
  // GST off: unitPrice is exclusive (stripped if product was inclusive)
  return { gross, discount: disc, net: priceAfterDisc, gst: 0, billed: priceAfterDisc };
}
