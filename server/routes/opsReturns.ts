import { Router } from 'express';
import { blockVendors, AuthRequest } from '../middleware/auth';
import { pool, setTenantContext } from '../pg-db';
import { uid } from '../utils/helpers';
import { handleApiError } from '../utils/http-error';
import { withBooks } from '../utils/booksStrict';
import { postPurchaseReturnToBooks, postSaleReturnToBooks } from '../services/opsToBooks';
import { parseStockQty } from '../../shared/qtyStock';
import { round2 } from '../../shared/gstRound';
import { calendarDateIST } from '../../shared/dateOnly';
import type { PoolClient } from 'pg';

const router = Router();

type ReturnItem = { productId: string; quantity: number };

function parseItems(raw: unknown): ReturnItem[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const items: ReturnItem[] = [];
  for (const row of raw) {
    const productId = String((row as ReturnItem)?.productId || '');
    const quantity = parseStockQty((row as ReturnItem)?.quantity);
    if (!productId || quantity == null) return null;
    items.push({ productId, quantity });
  }
  return items;
}

async function alreadyReturnedQty(
  client: PoolClient,
  tenantId: string,
  referenceType: string,
  referenceId: string,
  productId: string,
): Promise<number> {
  const rows = (
    await client.query(
      `SELECT items FROM credit_debit_notes
       WHERE tenant_id = $1 AND reference_type = $2 AND reference_id = $3
         AND COALESCE(status, 'Active') <> 'Cancelled'`,
      [tenantId, referenceType, referenceId],
    )
  ).rows as Array<{ items: unknown }>;
  let n = 0;
  for (const r of rows) {
    const items = typeof r.items === 'string' ? JSON.parse(r.items) : r.items;
    if (!Array.isArray(items)) continue;
    for (const it of items) {
      if (String(it.productId || '') !== productId) continue;
      n += Number(it.quantity) || 0;
    }
  }
  return n;
}

async function restoreSaleStock(
  client: PoolClient,
  tenantId: string,
  batchId: string,
  productId: string,
  qty: number,
): Promise<void> {
  const inv = (
    await client.query(
      `SELECT id FROM product_inventory
       WHERE tenant_id = $1 AND batch_id = $2 AND product_id = $3 AND status = 'Distributed'
       ORDER BY id DESC
       LIMIT $4
       FOR UPDATE`,
      [tenantId, batchId, productId, qty],
    )
  ).rows as Array<{ id: string }>;
  if (inv.length > 0) {
    const ids = inv.map(s => s.id);
    await client.query(
      `UPDATE product_inventory SET status = 'InStock' WHERE tenant_id = $1 AND id = ANY($2::text[])`,
      [tenantId, ids],
    );
  }
  await client.query(`UPDATE products SET stock = stock + $1 WHERE id = $2 AND tenant_id = $3`, [
    qty,
    productId,
    tenantId,
  ]);
}

async function takePurchaseStock(
  client: PoolClient,
  tenantId: string,
  batchId: string,
  productId: string,
  qty: number,
): Promise<void> {
  const instock = (
    await client.query(
      `SELECT id FROM product_inventory
       WHERE tenant_id = $1 AND batch_id = $2 AND product_id = $3 AND status = 'InStock'
       ORDER BY id DESC
       LIMIT $4
       FOR UPDATE`,
      [tenantId, batchId, productId, qty],
    )
  ).rows as Array<{ id: string }>;
  if (instock.length > 0) {
    const ids = instock.map(s => s.id);
    await client.query(`DELETE FROM product_inventory WHERE tenant_id = $1 AND id = ANY($2::text[])`, [tenantId, ids]);
  }
  await client.query(`UPDATE products SET stock = GREATEST(0, stock - $1) WHERE id = $2 AND tenant_id = $3`, [
    qty,
    productId,
    tenantId,
  ]);
}

router.post('/api/distribution/batch/:batchId/return', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const batchId = String(req.params.batchId || '');
    const items = parseItems(req.body?.items);
    if (!batchId || !items) return res.status(400).json({ error: 'Return at least one product with quantity ≥ 1' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await setTenantContext(client, tenantId);
      const header = (
        await client.query(
          `SELECT vendor_id, MIN(distribution_date) AS distribution_date
           FROM product_distribution WHERE tenant_id = $1 AND batch_id = $2
           GROUP BY vendor_id`,
          [tenantId, batchId],
        )
      ).rows[0] as { vendor_id: string; distribution_date: string } | undefined;
      if (!header) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Sale not found' });
      }
      const vendor = (
        await client.query(`SELECT id, name FROM vendors WHERE id = $1 AND tenant_id = $2`, [
          header.vendor_id,
          tenantId,
        ])
      ).rows[0] as { id: string; name: string } | undefined;
      if (!vendor) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Customer not found' });
      }

      const noteItems: Array<{
        productId: string;
        description: string;
        quantity: number;
        price: number;
        withGst: boolean;
      }> = [];
      let taxable = 0;
      let billed = 0;
      let cogs = 0;

      for (const item of items) {
        const sold = (
          await client.query(
            `SELECT COUNT(*)::int AS qty,
                    COALESCE(AVG(net_price), 0)::float AS net,
                    COALESCE(AVG(billed_price), 0)::float AS billed,
                    BOOL_OR(COALESCE(gst_applied, false)) AS gst
             FROM product_distribution
             WHERE tenant_id = $1 AND batch_id = $2 AND product_id = $3`,
            [tenantId, batchId, item.productId],
          )
        ).rows[0] as { qty: number; net: number; billed: number; gst: boolean };
        const soldQty = Number(sold?.qty) || 0;
        const prior = await alreadyReturnedQty(client, tenantId, 'distribution', batchId, item.productId);
        if (item.quantity > soldQty - prior) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            error: `Cannot return ${item.quantity}. Sold ${soldQty}, already returned ${prior}.`,
          });
        }
        const prod = (
          await client.query(`SELECT name, cost_price FROM products WHERE id = $1 AND tenant_id = $2`, [
            item.productId,
            tenantId,
          ])
        ).rows[0] as { name: string; cost_price: number | null } | undefined;
        await restoreSaleStock(client, tenantId, batchId, item.productId, item.quantity);
        const unitNet = Number(sold.net) || 0;
        const unitBilled = Number(sold.billed) || unitNet;
        taxable = round2(taxable + unitNet * item.quantity);
        billed = round2(billed + unitBilled * item.quantity);
        const unitCost = Number(prod?.cost_price) || 0;
        cogs = round2(cogs + unitCost * item.quantity);
        noteItems.push({
          productId: item.productId,
          description: prod?.name || item.productId,
          quantity: item.quantity,
          price: unitNet,
          withGst: !!sold.gst,
        });
      }

      const tax = round2(Math.max(0, billed - taxable));
      const noteId = uid('CN');
      const noteDate = calendarDateIST(new Date());
      await client.query(
        `INSERT INTO credit_debit_notes (
           id, tenant_id, note_number, note_type, vendor_id, vendor_name, customer_name,
           note_date, reason, items, subtotal, gst_rate, gst_amount, total,
           reference_invoice, reference_type, reference_id, status
         ) VALUES ($1,$2,$3,'credit',$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14,'distribution',$15,'Active')`,
        [
          noteId,
          tenantId,
          noteId,
          vendor.id,
          vendor.name,
          vendor.name,
          noteDate,
          'Sales return',
          JSON.stringify(noteItems),
          taxable,
          tax > 0 && taxable > 0 ? round2((tax / taxable) * 100) : 0,
          tax,
          billed,
          batchId,
          batchId,
        ],
      );

      await withBooks(
        () =>
          postSaleReturnToBooks(client, tenantId, {
            noteId,
            vendorId: vendor.id,
            vendorName: vendor.name,
            billed,
            taxable,
            tax,
            cogs,
            noteDate,
          }),
        'sale-return',
      );
      await client.query('COMMIT');
      res.status(201).json({ id: noteId, billed, taxable, tax });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.post('/api/purchases/batch/:batchId/return', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const batchId = String(req.params.batchId || '');
    const items = parseItems(req.body?.items);
    if (!batchId || !items) return res.status(400).json({ error: 'Return at least one product with quantity ≥ 1' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await setTenantContext(client, tenantId);
      const header = (
        await client.query(
          `SELECT supplier_id, MIN(purchase_date) AS purchase_date
           FROM product_purchases WHERE tenant_id = $1 AND batch_id = $2
           GROUP BY supplier_id`,
          [tenantId, batchId],
        )
      ).rows[0] as { supplier_id: string; purchase_date: string } | undefined;
      if (!header) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Purchase not found' });
      }
      const supplier = (
        await client.query(`SELECT id, name FROM suppliers WHERE id = $1 AND tenant_id = $2`, [
          header.supplier_id,
          tenantId,
        ])
      ).rows[0] as { id: string; name: string } | undefined;
      if (!supplier) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Supplier not found' });
      }

      const noteItems: Array<{
        productId: string;
        description: string;
        quantity: number;
        price: number;
        withGst: boolean;
      }> = [];
      let taxable = 0;
      let billed = 0;

      for (const item of items) {
        const bought = (
          await client.query(
            `SELECT COUNT(*)::int AS qty,
                    COALESCE(AVG(cost_price), 0)::float AS cost,
                    COALESCE(AVG(COALESCE(billed_price, cost_price)), 0)::float AS billed,
                    BOOL_OR(COALESCE(gst_applied, false)) AS gst
             FROM product_purchases
             WHERE tenant_id = $1 AND batch_id = $2 AND product_id = $3`,
            [tenantId, batchId, item.productId],
          )
        ).rows[0] as { qty: number; cost: number; billed: number; gst: boolean };
        const boughtQty = Number(bought?.qty) || 0;
        const prior = await alreadyReturnedQty(client, tenantId, 'purchase', batchId, item.productId);
        if (item.quantity > boughtQty - prior) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            error: `Cannot return ${item.quantity}. Purchased ${boughtQty}, already returned ${prior}.`,
          });
        }
        const stock = (
          await client.query(`SELECT name, stock FROM products WHERE id = $1 AND tenant_id = $2 FOR UPDATE`, [
            item.productId,
            tenantId,
          ])
        ).rows[0] as { name: string; stock: number } | undefined;
        if ((Number(stock?.stock) || 0) < item.quantity) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            error: `Not enough stock to return ${stock?.name || item.productId}. Available: ${Number(stock?.stock) || 0}.`,
          });
        }
        await takePurchaseStock(client, tenantId, batchId, item.productId, item.quantity);
        const unitCost = Number(bought.cost) || 0;
        const unitBilled = Number(bought.billed) || unitCost;
        taxable = round2(taxable + unitCost * item.quantity);
        billed = round2(billed + unitBilled * item.quantity);
        noteItems.push({
          productId: item.productId,
          description: stock?.name || item.productId,
          quantity: item.quantity,
          price: unitCost,
          withGst: !!bought.gst,
        });
      }

      const tax = round2(Math.max(0, billed - taxable));
      const noteId = uid('DN');
      const noteDate = calendarDateIST(new Date());
      await client.query(
        `INSERT INTO credit_debit_notes (
           id, tenant_id, note_number, note_type, vendor_id, vendor_name, customer_name,
           note_date, reason, items, subtotal, gst_rate, gst_amount, total,
           reference_invoice, reference_type, reference_id, status
         ) VALUES ($1,$2,$3,'debit',$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14,'purchase',$15,'Active')`,
        [
          noteId,
          tenantId,
          noteId,
          supplier.id,
          supplier.name,
          supplier.name,
          noteDate,
          'Purchase return',
          JSON.stringify(noteItems),
          taxable,
          tax > 0 && taxable > 0 ? round2((tax / taxable) * 100) : 0,
          tax,
          billed,
          batchId,
          batchId,
        ],
      );

      await withBooks(
        () =>
          postPurchaseReturnToBooks(client, tenantId, {
            noteId,
            supplierId: supplier.id,
            supplierName: supplier.name,
            billed,
            taxable,
            tax,
            noteDate,
          }),
        'purchase-return',
      );
      await client.query('COMMIT');
      res.status(201).json({ id: noteId, billed, taxable, tax });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

export default router;
