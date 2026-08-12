/**
 * Ops purchase / purchase-return stock dual-write.
 * Shared by Miracle import (miracle:pur: / miracle:pr:) and Books desk (books:pur: / books:pr:).
 */
import type { PoolClient } from 'pg';
import { uid } from '../utils/helpers';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type OpsPurchaseUnit = {
  productId: string;
  costPrice: number;
  billedPrice: number;
  gstApplied: boolean;
};

export type PurchaseStockLine = { productId: string; qty: number; rate: number; amount: number };

/**
 * Expand purchase item lines into per-unit cost/billed for product_purchases.
 * When voucherTax > 0, set gst_applied and make billed − cost = allocated GST.
 */
export function expandPurchaseStockUnits(
  lines: Array<{ productId: string; qty: number; rate: number; amount: number }>,
  voucherTax: number,
  voucherAmount: number,
): OpsPurchaseUnit[] {
  const prepared = lines
    .map(line => {
      const qty = Math.max(1, Math.round(Number(line.qty) || 0));
      const rate = Number(line.rate) || 0;
      const amount = Number(line.amount) || rate * qty;
      return { productId: String(line.productId), qty, rate, amount };
    })
    .filter(l => l.productId && l.qty > 0);

  if (!prepared.length) return [];

  if (!(voucherTax > 0)) {
    return prepared.flatMap(l => {
      const billed = round2(l.amount / l.qty);
      const cost = round2(l.rate || billed);
      return Array.from({ length: l.qty }, () => ({
        productId: l.productId,
        costPrice: cost,
        billedPrice: billed,
        gstApplied: false,
      }));
    });
  }

  const sumLines = prepared.reduce((s, l) => s + l.amount, 0);
  const taxableGuess = round2(Math.max(0, Number(voucherAmount) || 0) - voucherTax);
  const exclusive =
    sumLines <= 0 || Math.abs(sumLines - taxableGuess) <= Math.abs(sumLines - (Number(voucherAmount) || 0));

  const units: OpsPurchaseUnit[] = [];
  let allocatedTax = 0;
  for (let li = 0; li < prepared.length; li++) {
    const l = prepared[li]!;
    const weight = sumLines > 0 ? l.amount / sumLines : 1 / prepared.length;
    const lineTaxRaw = round2(voucherTax * weight);
    const lineTax = li === prepared.length - 1 ? round2(voucherTax - allocatedTax) : lineTaxRaw;
    if (li < prepared.length - 1) allocatedTax = round2(allocatedTax + lineTax);

    let lineTaxLeft = lineTax;
    for (let i = 0; i < l.qty; i++) {
      const isLastUnit = i === l.qty - 1;
      const taxUnit = isLastUnit ? round2(lineTaxLeft) : round2(lineTax / l.qty);
      if (!isLastUnit) lineTaxLeft = round2(lineTaxLeft - taxUnit);

      if (exclusive) {
        const cost = round2(l.amount / l.qty);
        units.push({
          productId: l.productId,
          costPrice: cost,
          billedPrice: round2(cost + taxUnit),
          gstApplied: true,
        });
      } else {
        const billed = round2(l.amount / l.qty);
        units.push({
          productId: l.productId,
          costPrice: round2(Math.max(0, billed - taxUnit)),
          billedPrice: billed,
          gstApplied: true,
        });
      }
    }
  }

  const taxSum = units.reduce((s, u) => s + round2(u.billedPrice - u.costPrice), 0);
  const drift = round2(voucherTax - taxSum);
  if (units.length && Math.abs(drift) >= 0.01) {
    const last = units[units.length - 1]!;
    last.billedPrice = round2(last.billedPrice + drift);
  }
  return units;
}

/** Idempotent purchase stock-in. Replaces InStock units for this batch_id only. */
export async function upsertPurchaseStockIn(
  client: PoolClient,
  tenantId: string,
  batchId: string,
  invoiceNumber: string | null,
  purchaseDate: string,
  supplierId: string,
  lines: PurchaseStockLine[],
  voucherTax: number,
  voucherAmount: number,
): Promise<{ units: number }> {
  const existing = (
    await client.query(
      `SELECT product_id, COUNT(*)::int AS n
       FROM product_inventory
       WHERE tenant_id = $1 AND batch_id = $2 AND status = 'InStock'
       GROUP BY product_id`,
      [tenantId, batchId],
    )
  ).rows as Array<{ product_id: string; n: number }>;
  for (const row of existing) {
    await client.query(`UPDATE products SET stock = GREATEST(0, stock - $1) WHERE id = $2 AND tenant_id = $3`, [
      row.n,
      row.product_id,
      tenantId,
    ]);
  }
  await client.query(`DELETE FROM product_inventory WHERE tenant_id = $1 AND batch_id = $2 AND status = 'InStock'`, [
    tenantId,
    batchId,
  ]);
  await client.query(`DELETE FROM product_purchases WHERE tenant_id = $1 AND batch_id = $2`, [tenantId, batchId]);

  const units = expandPurchaseStockUnits(lines, voucherTax, voucherAmount);
  let seq = 0;
  const stockByProduct = new Map<string, number>();
  for (const u of units) {
    seq++;
    const purchaseId = uid('PP');
    const barcode = `${batchId}-${String(seq).padStart(4, '0')}-${purchaseId.slice(-6)}`;
    const invId = uid('PI');
    await client.query(
      `INSERT INTO product_purchases
         (id, tenant_id, batch_id, product_id, supplier_id, purchase_date, cost_price, gst_applied, billed_price, discount_percent, invoice_number, barcode)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,0,$10,$11)`,
      [
        purchaseId,
        tenantId,
        batchId,
        u.productId,
        supplierId,
        purchaseDate,
        u.costPrice,
        u.gstApplied,
        u.billedPrice,
        invoiceNumber,
        barcode,
      ],
    );
    await client.query(
      `INSERT INTO product_inventory (id, product_id, barcode, batch_id, status, tenant_id, unit_type)
       VALUES ($1,$2,$3,$4,'InStock',$5,'piece')`,
      [invId, u.productId, barcode, batchId, tenantId],
    );
    stockByProduct.set(u.productId, (stockByProduct.get(u.productId) || 0) + 1);
  }
  for (const [productId, qty] of stockByProduct) {
    await client.query(`UPDATE products SET stock = stock + $1 WHERE id = $2 AND tenant_id = $3`, [
      qty,
      productId,
      tenantId,
    ]);
  }
  return { units: units.length };
}

/**
 * Idempotent purchase return stock-out.
 * Deletes prior PurchaseReturned marks for batch, then FIFO InStock → PurchaseReturned.
 */
export async function upsertPurchaseStockReturn(
  client: PoolClient,
  tenantId: string,
  batchId: string,
  lines: Array<{ productId: string; qty: number }>,
  warn?: (message: string) => void,
): Promise<{ units: number; shortfall: number }> {
  await client.query(
    `DELETE FROM product_inventory
     WHERE tenant_id = $1 AND batch_id = $2 AND status = 'PurchaseReturned'`,
    [tenantId, batchId],
  );

  let units = 0;
  let shortfall = 0;
  let seq = 0;
  for (const line of lines) {
    const want = Math.max(1, Math.round(Number(line.qty) || 0));
    if (!line.productId || !(want > 0)) continue;
    const available = (
      await client.query(
        `SELECT id FROM product_inventory
         WHERE tenant_id = $1 AND product_id = $2 AND status = 'InStock'
         ORDER BY id
         LIMIT $3`,
        [tenantId, line.productId, want],
      )
    ).rows as Array<{ id: string }>;
    const taken = available.length;
    if (taken < want) {
      shortfall += want - taken;
      warn?.(`Purchase return short ${want - taken} unit(s) for product (wanted ${want}, had ${taken} InStock)`);
    }
    if (!taken) continue;
    for (const row of available) {
      seq++;
      const newId = `PI-${batchId}-${seq}`;
      const barcode = `${batchId}-${String(seq).padStart(4, '0')}`;
      await client.query(
        `UPDATE product_inventory
         SET id = $1, barcode = $2, status = 'PurchaseReturned', batch_id = $3
         WHERE tenant_id = $4 AND id = $5`,
        [newId, barcode, batchId, tenantId, row.id],
      );
    }
    await client.query(`UPDATE products SET stock = GREATEST(0, stock - $1) WHERE id = $2 AND tenant_id = $3`, [
      taken,
      line.productId,
      tenantId,
    ]);
    units += taken;
  }
  return { units, shortfall };
}

/** Clear Books desk purchase stock-in batch (InStock + product_purchases). */
export async function clearBooksPurchaseStockIn(
  client: PoolClient,
  tenantId: string,
  voucherId: string,
): Promise<void> {
  const batchId = `books:pur:${voucherId}`;
  const existing = (
    await client.query(
      `SELECT product_id, COUNT(*)::int AS n
       FROM product_inventory
       WHERE tenant_id = $1 AND batch_id = $2 AND status = 'InStock'
       GROUP BY product_id`,
      [tenantId, batchId],
    )
  ).rows as Array<{ product_id: string; n: number }>;
  for (const row of existing) {
    await client.query(`UPDATE products SET stock = GREATEST(0, stock - $1) WHERE id = $2 AND tenant_id = $3`, [
      row.n,
      row.product_id,
      tenantId,
    ]);
  }
  await client.query(`DELETE FROM product_inventory WHERE tenant_id = $1 AND batch_id = $2 AND status = 'InStock'`, [
    tenantId,
    batchId,
  ]);
  await client.query(`DELETE FROM product_purchases WHERE tenant_id = $1 AND batch_id = $2`, [tenantId, batchId]);
}

/** Resolve ops supplier from a Books party ledger (external_ref, then exact name). */
export async function resolveSupplierForBookLedger(
  client: PoolClient,
  tenantId: string,
  ledgerId: string,
): Promise<{ supplierId: string; supplierName: string; ledgerName: string } | null> {
  const ledger = (
    await client.query(`SELECT id, name, external_ref FROM book_ledgers WHERE tenant_id = $1 AND id = $2`, [
      tenantId,
      ledgerId,
    ])
  ).rows[0] as { id: string; name: string; external_ref: string | null } | undefined;
  if (!ledger) return null;

  if (ledger.external_ref) {
    const byRef = (
      await client.query(`SELECT id, name FROM suppliers WHERE tenant_id = $1 AND external_ref = $2 LIMIT 1`, [
        tenantId,
        ledger.external_ref,
      ])
    ).rows[0] as { id: string; name: string } | undefined;
    if (byRef) {
      return { supplierId: byRef.id, supplierName: byRef.name, ledgerName: ledger.name };
    }
  }

  const byName = (
    await client.query(`SELECT id, name FROM suppliers WHERE tenant_id = $1 AND LOWER(name) = LOWER($2) LIMIT 1`, [
      tenantId,
      ledger.name,
    ])
  ).rows[0] as { id: string; name: string } | undefined;
  if (byName) {
    return { supplierId: byName.id, supplierName: byName.name, ledgerName: ledger.name };
  }
  return null;
}

/**
 * Resolve ops `products.id` from a desk product id (ops id, or book_products via external_ref / name).
 */
export async function resolveOpsProductId(
  client: PoolClient,
  tenantId: string,
  productId: string,
): Promise<string | null> {
  const id = String(productId || '').trim();
  if (!id) return null;

  const asOps = (await client.query(`SELECT id FROM products WHERE tenant_id = $1 AND id = $2`, [tenantId, id]))
    .rows[0] as { id: string } | undefined;
  if (asOps) return asOps.id;

  const book = (
    await client.query(`SELECT name, external_ref FROM book_products WHERE tenant_id = $1 AND id = $2`, [tenantId, id])
  ).rows[0] as { name: string; external_ref: string | null } | undefined;
  if (!book) return null;

  if (book.external_ref) {
    const byRef = (
      await client.query(`SELECT id FROM products WHERE tenant_id = $1 AND external_ref = $2 LIMIT 1`, [
        tenantId,
        book.external_ref,
      ])
    ).rows[0] as { id: string } | undefined;
    if (byRef) return byRef.id;
  }

  const byName = (
    await client.query(`SELECT id FROM products WHERE tenant_id = $1 AND LOWER(name) = LOWER($2) LIMIT 1`, [
      tenantId,
      book.name,
    ])
  ).rows[0] as { id: string } | undefined;
  return byName?.id || null;
}
