import { pool } from '../pg-db';

export type ResolvedPrice = { price: number; source: 'price_list' | 'default' };

/**
 * Real-world dealer pricing: vendor slab → generic slab → products.price.
 * Used by Distribution, quotation create defaults, and /api/price-lists/resolve.
 * Quotation convert freezes the saved line price — does not re-resolve.
 */
export async function resolvePrice(
  tenantId: string,
  productId: string,
  vendorId: string | null | undefined,
  quantity: number,
): Promise<ResolvedPrice> {
  const qty = quantity > 0 ? quantity : 1;
  const rule = (
    await pool.query(
      `
      SELECT price FROM price_lists
      WHERE tenant_id = $1 AND product_id = $2 AND is_active = true
        AND (vendor_id = $3 OR vendor_id IS NULL)
        AND min_qty <= $4 AND (max_qty IS NULL OR max_qty >= $4)
        AND (valid_from IS NULL OR valid_from <= CURRENT_DATE)
        AND (valid_to IS NULL OR valid_to >= CURRENT_DATE)
      ORDER BY
        CASE WHEN vendor_id = $3 THEN 0 ELSE 1 END,
        min_qty DESC
      LIMIT 1
    `,
      [tenantId, productId, vendorId || null, qty],
    )
  ).rows[0] as { price: number } | undefined;

  if (rule) return { price: Number(rule.price), source: 'price_list' };

  const product = (
    await pool.query('SELECT price FROM products WHERE id = $1 AND tenant_id = $2', [productId, tenantId])
  ).rows[0] as { price: number } | undefined;
  return { price: Number(product?.price) || 0, source: 'default' };
}

/** True when client sent an explicit unit price (including 0). */
export function hasExplicitUnitPrice(value: unknown): boolean {
  return value !== null && value !== undefined && value !== '';
}

/**
 * Product gst_rate when set (including 0), else company default_gst_rate, else 18.
 * Treats null/undefined/NaN as unset — not as a zero rate.
 */
export function resolveGstRate(
  productGstRate: number | null | undefined,
  companyDefault?: number | null | undefined,
): number {
  if (productGstRate != null && Number.isFinite(Number(productGstRate))) {
    return Number(productGstRate);
  }
  if (companyDefault != null && Number.isFinite(Number(companyDefault))) {
    return Number(companyDefault);
  }
  return 18;
}

/** Net / billed per unit after discount — matches distribution createBatch GST rules. */
export function unitPricesAfterDiscount(opts: {
  basePrice: number;
  discountPercent: number;
  withGst: boolean;
  priceIncludesGst: boolean;
  gstRate: number;
}): { netPricePerUnit: number; billedPricePerUnit: number } {
  const disc = Math.min(100, Math.max(0, opts.discountPercent || 0));
  const priceAfterDisc = Math.round(((opts.basePrice * (100 - disc)) / 100) * 100) / 100;
  if (opts.withGst && opts.priceIncludesGst) {
    return {
      billedPricePerUnit: priceAfterDisc,
      netPricePerUnit: Math.round((priceAfterDisc / (1 + opts.gstRate / 100)) * 100) / 100,
    };
  }
  if (opts.withGst) {
    return {
      netPricePerUnit: priceAfterDisc,
      billedPricePerUnit: Math.round((priceAfterDisc * (100 + opts.gstRate)) / 100),
    };
  }
  // GST off: basePrice is exclusive (UI strips inclusive MRP before send; catalog resolve
  // path in createBatch strips when no explicit customPrice — see distribution routes).
  return { netPricePerUnit: priceAfterDisc, billedPricePerUnit: priceAfterDisc };
}
