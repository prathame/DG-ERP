/**
 * Ops sales / credit-note / debit-note stock dual-write.
 * Shared by Miracle import (miracle:sal: / miracle:cn:) and Books desk (books:sal: / books:cn: / books:dn:).
 */
import type { PoolClient } from 'pg';

export type SaleStockOutOptions = {
  /**
   * Miracle import: create missing InStock units before selling.
   * Many dumps have sales without purchase/opening stock — avoids noisy shortfalls for every tenant.
   * Books desk live sales keep default warn-only behavior.
   */
  seedMissing?: boolean;
};

function seedBatchId(saleBatchId: string): string {
  return `${saleBatchId}:seed`;
}

async function clearSeedUnits(client: PoolClient, tenantId: string, saleBatchId: string): Promise<void> {
  const seedId = seedBatchId(saleBatchId);
  const existing = (
    await client.query(
      `SELECT product_id, COUNT(*)::int AS n
       FROM product_inventory
       WHERE tenant_id = $1 AND batch_id = $2 AND status = 'InStock'
       GROUP BY product_id`,
      [tenantId, seedId],
    )
  ).rows as Array<{ product_id: string; n: number }>;
  await client.query(`DELETE FROM product_inventory WHERE tenant_id = $1 AND batch_id = $2 AND status = 'InStock'`, [
    tenantId,
    seedId,
  ]);
  for (const row of existing) {
    await client.query(`UPDATE products SET stock = GREATEST(0, stock - $1) WHERE id = $2 AND tenant_id = $3`, [
      row.n,
      row.product_id,
      tenantId,
    ]);
  }
}

async function seedInStockUnits(
  client: PoolClient,
  tenantId: string,
  saleBatchId: string,
  productId: string,
  qty: number,
  seqStart: number,
): Promise<number> {
  if (!(qty > 0)) return seqStart;
  const seedId = seedBatchId(saleBatchId);
  let seq = seqStart;
  for (let i = 0; i < qty; i++) {
    seq++;
    const id = `PI-${seedId}-${seq}`;
    const barcode = `${seedId}-${String(seq).padStart(4, '0')}`;
    await client.query(
      `INSERT INTO product_inventory (id, tenant_id, product_id, barcode, status, batch_id, unit_type)
       VALUES ($1,$2,$3,$4,'InStock',$5,'piece')`,
      [id, tenantId, productId, barcode, seedId],
    );
  }
  await client.query(`UPDATE products SET stock = stock + $1 WHERE id = $2 AND tenant_id = $3`, [
    qty,
    productId,
    tenantId,
  ]);
  return seq;
}

/** Idempotent sale stock-out. FIFO InStock → Sold for this batch_id. */
export async function upsertSaleStockOut(
  client: PoolClient,
  tenantId: string,
  batchId: string,
  lines: Array<{ productId: string; qty: number }>,
  warn?: (message: string) => void,
  options?: SaleStockOutOptions,
): Promise<{ units: number; shortfall: number; seeded: number }> {
  await client.query(`DELETE FROM product_inventory WHERE tenant_id = $1 AND batch_id = $2 AND status = 'Sold'`, [
    tenantId,
    batchId,
  ]);
  if (options?.seedMissing) {
    await clearSeedUnits(client, tenantId, batchId);
  }

  let units = 0;
  let shortfall = 0;
  let seeded = 0;
  let seq = 0;
  let seedSeq = 0;
  for (const line of lines) {
    const want = Math.max(1, Math.round(Number(line.qty) || 0));
    if (!line.productId || !(want > 0)) continue;
    let available = (
      await client.query(
        `SELECT id FROM product_inventory
         WHERE tenant_id = $1 AND product_id = $2 AND status = 'InStock'
         ORDER BY id
         LIMIT $3`,
        [tenantId, line.productId, want],
      )
    ).rows as Array<{ id: string }>;
    let taken = available.length;
    if (taken < want && options?.seedMissing) {
      const need = want - taken;
      seedSeq = await seedInStockUnits(client, tenantId, batchId, line.productId, need, seedSeq);
      seeded += need;
      available = (
        await client.query(
          `SELECT id FROM product_inventory
           WHERE tenant_id = $1 AND product_id = $2 AND status = 'InStock'
           ORDER BY id
           LIMIT $3`,
          [tenantId, line.productId, want],
        )
      ).rows as Array<{ id: string }>;
      taken = available.length;
    }
    if (taken < want) {
      shortfall += want - taken;
      warn?.(`Sale short ${want - taken} unit(s) for product (wanted ${want}, had ${taken} InStock)`);
    }
    if (!taken) continue;
    for (const row of available) {
      seq++;
      const newId = `PI-${batchId}-${seq}`;
      const barcode = `${batchId}-${String(seq).padStart(4, '0')}`;
      await client.query(
        `UPDATE product_inventory
         SET id = $1, barcode = $2, status = 'Sold', batch_id = $3
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
  return { units, shortfall, seeded };
}

/**
 * Idempotent credit-note / sales-return stock-in.
 * Replaces InStock units for this batch_id only (inventory + products.stock).
 */
export async function upsertCreditNoteStockIn(
  client: PoolClient,
  tenantId: string,
  batchId: string,
  lines: Array<{ productId: string; qty: number }>,
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

  let units = 0;
  let seq = 0;
  const stockByProduct = new Map<string, number>();
  for (const line of lines) {
    const qty = Math.max(1, Math.round(Number(line.qty) || 0));
    if (!line.productId || !(qty > 0)) continue;
    for (let i = 0; i < qty; i++) {
      seq++;
      units++;
      const barcode = `${batchId}-${String(seq).padStart(4, '0')}`;
      const invId = `PI-${batchId}-${seq}`;
      await client.query(
        `INSERT INTO product_inventory (id, product_id, barcode, batch_id, status, tenant_id, unit_type)
         VALUES ($1,$2,$3,$4,'InStock',$5,'piece')`,
        [invId, line.productId, barcode, batchId, tenantId],
      );
      stockByProduct.set(line.productId, (stockByProduct.get(line.productId) || 0) + 1);
    }
  }
  for (const [productId, qty] of stockByProduct) {
    await client.query(`UPDATE products SET stock = stock + $1 WHERE id = $2 AND tenant_id = $3`, [
      qty,
      productId,
      tenantId,
    ]);
  }
  return { units };
}

/** Clear Books desk sale Sold marks for a voucher (does not restore InStock). */
export async function clearBooksSaleStockOut(client: PoolClient, tenantId: string, voucherId: string): Promise<void> {
  const batchId = `books:sal:${voucherId}`;
  await client.query(`DELETE FROM product_inventory WHERE tenant_id = $1 AND batch_id = $2 AND status = 'Sold'`, [
    tenantId,
    batchId,
  ]);
  await clearSeedUnits(client, tenantId, batchId);
}

/** Clear Books desk debit-note Sold marks for a voucher (does not restore InStock). */
export async function clearBooksDebitNoteStockOut(
  client: PoolClient,
  tenantId: string,
  voucherId: string,
): Promise<void> {
  const batchId = `books:dn:${voucherId}`;
  await client.query(`DELETE FROM product_inventory WHERE tenant_id = $1 AND batch_id = $2 AND status = 'Sold'`, [
    tenantId,
    batchId,
  ]);
}

/** Clear Books desk credit-note InStock batch. */
export async function clearBooksCreditNoteStockIn(
  client: PoolClient,
  tenantId: string,
  voucherId: string,
): Promise<void> {
  const batchId = `books:cn:${voucherId}`;
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
}
