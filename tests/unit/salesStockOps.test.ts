import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool, cleanupTestData } from '../helpers';
import { uid } from '../../server/utils/helpers';
import {
  clearBooksCreditNoteStockIn,
  clearBooksSaleStockOut,
  upsertCreditNoteStockIn,
  upsertSaleStockOut,
} from '../../server/services/salesStockOps';
import { upsertPurchaseStockIn } from '../../server/services/purchaseStockOps';

const TENANT = 'T-TEST-SALES-STOCK-OPS';

describe('salesStockOps db', () => {
  beforeAll(async () => {
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, business_type)
       VALUES ($1,'Sales Stock Ops',$2,'sso@test.com','SSO','active','dealer')
       ON CONFLICT (id) DO NOTHING`,
      [TENANT, `sso-${TENANT.toLowerCase()}`],
    );
    await pool.query('ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS external_ref TEXT');
    await pool.query('ALTER TABLE products ADD COLUMN IF NOT EXISTS external_ref TEXT');
  });

  afterAll(async () => {
    await cleanupTestData(TENANT);
    await pool.query(`DELETE FROM tenants WHERE id = $1`, [TENANT]);
  });

  it('sells FIFO, shortfalls, clears, and credit-note restocks', async () => {
    await cleanupTestData(TENANT);
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, business_type)
       VALUES ($1,'Sales Stock Ops',$2,'sso@test.com','SSO','active','dealer')
       ON CONFLICT (id) DO NOTHING`,
      [TENANT, `sso-${TENANT.toLowerCase()}`],
    );

    const productId = uid('PR');
    const supplierId = uid('SU');
    await pool.query(
      `INSERT INTO products (id, tenant_id, name, price, stock, external_ref)
       VALUES ($1,$2,'Gadget',100,0,'X-GADGET')`,
      [productId, TENANT],
    );
    await pool.query(`INSERT INTO suppliers (id, tenant_id, name, external_ref) VALUES ($1,$2,'Supp','X-S')`, [
      supplierId,
      TENANT,
    ]);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await upsertPurchaseStockIn(
        client,
        TENANT,
        'books:pur:seed',
        'PU/1',
        '2026-04-01',
        supplierId,
        [{ productId, qty: 2, rate: 40, amount: 80 }],
        0,
        80,
      );

      const saleId = uid('BV');
      const sold = await upsertSaleStockOut(
        client,
        TENANT,
        `books:sal:${saleId}`,
        [{ productId, qty: 3 }],
        () => undefined,
      );
      expect(sold.units).toBe(2);
      expect(sold.shortfall).toBe(1);
      expect(sold.seeded).toBe(0);

      const stock = await client.query(`SELECT stock::int AS s FROM products WHERE tenant_id=$1 AND id=$2`, [
        TENANT,
        productId,
      ]);
      expect(stock.rows[0].s).toBe(0);

      await clearBooksSaleStockOut(client, TENANT, saleId);
      const soldLeft = await client.query(
        `SELECT COUNT(*)::int AS n FROM product_inventory WHERE tenant_id=$1 AND batch_id=$2 AND status='Sold'`,
        [TENANT, `books:sal:${saleId}`],
      );
      expect(soldLeft.rows[0].n).toBe(0);

      const cnId = uid('BV');
      const cn = await upsertCreditNoteStockIn(client, TENANT, `books:cn:${cnId}`, [{ productId, qty: 2 }]);
      expect(cn.units).toBe(2);
      const afterCn = await client.query(`SELECT stock::int AS s FROM products WHERE tenant_id=$1 AND id=$2`, [
        TENANT,
        productId,
      ]);
      expect(afterCn.rows[0].s).toBe(2);

      await clearBooksCreditNoteStockIn(client, TENANT, cnId);
      const afterClear = await client.query(`SELECT stock::int AS s FROM products WHERE tenant_id=$1 AND id=$2`, [
        TENANT,
        productId,
      ]);
      expect(afterClear.rows[0].s).toBe(0);

      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  });

  it('Miracle-style seedMissing fills shortfall then sells full qty', async () => {
    await cleanupTestData(TENANT);
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, business_type)
       VALUES ($1,'Sales Stock Ops',$2,'sso@test.com','SSO','active','dealer')
       ON CONFLICT (id) DO NOTHING`,
      [TENANT, `sso-${TENANT.toLowerCase()}`],
    );
    const productId = uid('PR');
    await pool.query(
      `INSERT INTO products (id, tenant_id, name, price, stock, external_ref)
       VALUES ($1,$2,'Die',100,0,'X-DIE')`,
      [productId, TENANT],
    );
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const warnings: string[] = [];
      const sold = await upsertSaleStockOut(
        client,
        TENANT,
        'miracle:sal:ABC',
        [{ productId, qty: 3 }],
        msg => warnings.push(msg),
        { seedMissing: true },
      );
      expect(sold.units).toBe(3);
      expect(sold.shortfall).toBe(0);
      expect(sold.seeded).toBe(3);
      expect(warnings).toHaveLength(0);
      const stock = await client.query(`SELECT stock::int AS s FROM products WHERE tenant_id=$1 AND id=$2`, [
        TENANT,
        productId,
      ]);
      expect(stock.rows[0].s).toBe(0);
      const soldRows = await client.query(
        `SELECT COUNT(*)::int AS n FROM product_inventory WHERE tenant_id=$1 AND batch_id=$2 AND status='Sold'`,
        [TENANT, 'miracle:sal:ABC'],
      );
      expect(soldRows.rows[0].n).toBe(3);
      // Re-run is idempotent (no double stock)
      const again = await upsertSaleStockOut(
        client,
        TENANT,
        'miracle:sal:ABC',
        [{ productId, qty: 3 }],
        msg => warnings.push(msg),
        { seedMissing: true },
      );
      expect(again.units).toBe(3);
      expect(again.seeded).toBe(3);
      expect(warnings).toHaveLength(0);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  });
});
