/**
 * Miracle-style product / item ledger from book_voucher_items.
 * Qty sign is inferred from voucher_type (stored qty is usually absolute).
 */
import type { Pool } from 'pg';
import { BOOK_NON_POSTING_TYPES_SQL } from './bookVouchers';

function round4(n: number): number {
  return Math.round((Number(n) || 0) * 10000) / 10000;
}

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** +1 stock in, -1 stock out, 0 ignore for stock. */
export function stockQtySign(voucherType: string): number {
  const t = (voucherType || '').toLowerCase();
  if (t === 'purchase' || t === 'credit_note') return 1;
  if (t === 'sales' || t === 'purchase_return' || t === 'debit_note') return -1;
  return 0;
}

export interface ProductLedgerLine {
  voucherId: string;
  date: string;
  voucherNumber: string | null;
  voucherType: string;
  partyName: string | null;
  narration: string | null;
  qtyIn: number;
  qtyOut: number;
  rate: number;
  amount: number;
  balanceQty: number;
}

export interface ProductLedgerResult {
  product: {
    id: string;
    name: string;
    code: string | null;
    unit: string | null;
    hsnCode: string | null;
    saleRate: number;
    purchaseRate: number;
  };
  from: string | null;
  to: string | null;
  openingQty: number;
  lines: ProductLedgerLine[];
  totals: { qtyIn: number; qtyOut: number; amount: number };
  closingQty: number;
  count: number;
}

export async function getProductLedger(
  pool: Pool,
  tenantId: string,
  productId: string,
  from: string | null,
  to: string | null,
): Promise<ProductLedgerResult | null> {
  const product = (
    await pool.query(
      `SELECT id, name, code, unit, hsn_code, sale_rate, purchase_rate
       FROM book_products WHERE tenant_id = $1 AND id = $2`,
      [tenantId, productId],
    )
  ).rows[0] as
    | {
        id: string;
        name: string;
        code: string | null;
        unit: string | null;
        hsn_code: string | null;
        sale_rate: number;
        purchase_rate: number;
      }
    | undefined;
  if (!product) return null;

  let openingQty = 0;
  if (from) {
    const prior = await pool.query(
      `SELECT v.voucher_type, i.qty::float AS qty
       FROM book_voucher_items i
       JOIN book_vouchers v ON v.id = i.voucher_id AND v.tenant_id = i.tenant_id
       WHERE i.tenant_id = $1 AND i.product_id = $2 AND v.voucher_date < $3
         AND v.voucher_type NOT IN ${BOOK_NON_POSTING_TYPES_SQL}`,
      [tenantId, productId, from],
    );
    for (const r of prior.rows as { voucher_type: string; qty: number }[]) {
      const sign = stockQtySign(r.voucher_type);
      if (!sign) continue;
      openingQty = round4(openingQty + sign * Math.abs(Number(r.qty) || 0));
    }
  }

  const params: unknown[] = [tenantId, productId];
  let sql = `
    SELECT i.voucher_id, v.voucher_date, v.voucher_number, v.voucher_type, v.narration,
           i.qty::float AS qty, i.rate::float AS rate, i.amount::float AS amount,
           pl.name AS party_name
    FROM book_voucher_items i
    JOIN book_vouchers v ON v.id = i.voucher_id AND v.tenant_id = i.tenant_id
    LEFT JOIN book_ledgers pl ON pl.id = v.party_ledger_id AND pl.tenant_id = v.tenant_id
    WHERE i.tenant_id = $1 AND i.product_id = $2
      AND v.voucher_type NOT IN ${BOOK_NON_POSTING_TYPES_SQL}`;
  if (from) {
    params.push(from);
    sql += ` AND v.voucher_date >= $${params.length}`;
  }
  if (to) {
    params.push(to);
    sql += ` AND v.voucher_date <= $${params.length}`;
  }
  sql += ` ORDER BY v.voucher_date, v.voucher_number NULLS LAST, i.line_no LIMIT 10000`;

  const { rows } = await pool.query(sql, params);
  let bal = openingQty;
  let qtyIn = 0;
  let qtyOut = 0;
  let amount = 0;
  const lines: ProductLedgerLine[] = [];

  for (const r of rows as {
    voucher_id: string;
    voucher_date: string | Date;
    voucher_number: string | null;
    voucher_type: string;
    narration: string | null;
    qty: number;
    rate: number;
    amount: number;
    party_name: string | null;
  }[]) {
    const sign = stockQtySign(r.voucher_type);
    const absQty = round4(Math.abs(Number(r.qty) || 0));
    const inQty = sign > 0 ? absQty : 0;
    const outQty = sign < 0 ? absQty : 0;
    if (!sign) continue;
    bal = round4(bal + inQty - outQty);
    qtyIn = round4(qtyIn + inQty);
    qtyOut = round4(qtyOut + outQty);
    amount = round2(amount + Math.abs(Number(r.amount) || 0));
    const date =
      typeof r.voucher_date === 'string'
        ? r.voucher_date.slice(0, 10)
        : r.voucher_date instanceof Date
          ? r.voucher_date.toISOString().slice(0, 10)
          : String(r.voucher_date).slice(0, 10);
    lines.push({
      voucherId: r.voucher_id,
      date,
      voucherNumber: r.voucher_number,
      voucherType: r.voucher_type,
      partyName: r.party_name,
      narration: r.narration,
      qtyIn: inQty,
      qtyOut: outQty,
      rate: round2(Number(r.rate) || 0),
      amount: round2(Math.abs(Number(r.amount) || 0)),
      balanceQty: bal,
    });
  }

  return {
    product: {
      id: product.id,
      name: product.name,
      code: product.code,
      unit: product.unit,
      hsnCode: product.hsn_code,
      saleRate: round2(Number(product.sale_rate) || 0),
      purchaseRate: round2(Number(product.purchase_rate) || 0),
    },
    from,
    to,
    openingQty,
    lines,
    totals: { qtyIn, qtyOut, amount },
    closingQty: bal,
    count: lines.length,
  };
}

export interface StockSummaryRow {
  productId: string;
  name: string;
  code: string | null;
  unit: string | null;
  hsnCode: string | null;
  qty: number;
  saleRate: number;
  amount: number;
}

export async function getBooksStockSummary(
  pool: Pool,
  tenantId: string,
  asOf: string | null,
): Promise<{ asOf: string | null; rows: StockSummaryRow[]; totals: { qty: number; amount: number } }> {
  const params: unknown[] = [tenantId];
  let datePred = '';
  if (asOf) {
    params.push(asOf);
    datePred = ` AND v.voucher_date <= $${params.length}`;
  }

  const { rows } = await pool.query(
    `SELECT p.id, p.name, p.code, p.unit, p.hsn_code, p.sale_rate::float AS sale_rate,
            COALESCE(SUM(
              CASE
                WHEN v.voucher_type IN ('purchase','credit_note') THEN ABS(i.qty)
                WHEN v.voucher_type IN ('sales','purchase_return','debit_note') THEN -ABS(i.qty)
                ELSE 0
              END
            ), 0)::float AS qty
     FROM book_products p
     LEFT JOIN book_voucher_items i ON i.product_id = p.id AND i.tenant_id = p.tenant_id
     LEFT JOIN book_vouchers v ON v.id = i.voucher_id AND v.tenant_id = i.tenant_id
       AND v.voucher_type NOT IN ${BOOK_NON_POSTING_TYPES_SQL}${datePred}
     WHERE p.tenant_id = $1
     GROUP BY p.id, p.name, p.code, p.unit, p.hsn_code, p.sale_rate
     ORDER BY p.name
     LIMIT 5000`,
    params,
  );

  const list: StockSummaryRow[] = (rows as Array<Record<string, unknown>>).map(r => {
    const qty = round4(Number(r.qty) || 0);
    const saleRate = round2(Number(r.sale_rate) || 0);
    return {
      productId: String(r.id),
      name: String(r.name),
      code: (r.code as string) || null,
      unit: (r.unit as string) || null,
      hsnCode: (r.hsn_code as string) || null,
      qty,
      saleRate,
      amount: round2(qty * saleRate),
    };
  });

  return {
    asOf,
    rows: list,
    totals: {
      qty: round4(list.reduce((s, r) => s + r.qty, 0)),
      amount: round2(list.reduce((s, r) => s + r.amount, 0)),
    },
  };
}
