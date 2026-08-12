import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool, cleanupTestData } from '../helpers';
import { uid } from '../../server/utils/helpers';
import {
  clearBooksPurchaseStockIn,
  expandPurchaseStockUnits,
  resolveOpsProductId,
  resolveSupplierForBookLedger,
  upsertPurchaseStockIn,
  upsertPurchaseStockReturn,
} from '../../server/services/purchaseStockOps';

const TENANT = 'T-TEST-PUR-STOCK-OPS';

describe('expandPurchaseStockUnits', () => {
  it('expands qty without tax', () => {
    const units = expandPurchaseStockUnits([{ productId: 'P1', qty: 2, rate: 50, amount: 100 }], 0, 100);
    expect(units).toHaveLength(2);
    expect(units[0]).toMatchObject({ productId: 'P1', costPrice: 50, billedPrice: 50, gstApplied: false });
  });

  it('allocates voucher tax across units', () => {
    const units = expandPurchaseStockUnits([{ productId: 'P1', qty: 2, rate: 50, amount: 100 }], 18, 118);
    expect(units).toHaveLength(2);
    expect(units.every(u => u.gstApplied)).toBe(true);
    const tax = units.reduce((s, u) => s + (u.billedPrice - u.costPrice), 0);
    expect(Math.round(tax * 100) / 100).toBe(18);
  });

  it('handles tax-inclusive line amounts', () => {
    const units = expandPurchaseStockUnits([{ productId: 'P1', qty: 1, rate: 118, amount: 118 }], 18, 118);
    expect(units).toHaveLength(1);
    expect(units[0]!.gstApplied).toBe(true);
    expect(Math.round((units[0]!.billedPrice - units[0]!.costPrice) * 100) / 100).toBe(18);
  });
});

describe('purchaseStockOps db', () => {
  beforeAll(async () => {
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, business_type)
       VALUES ($1,'Purchase Stock Ops',$2,'pso@test.com','PSO','active','dealer')
       ON CONFLICT (id) DO NOTHING`,
      [TENANT, `pso-${TENANT.toLowerCase()}`],
    );
    await pool.query('ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS external_ref TEXT');
    await pool.query('ALTER TABLE products ADD COLUMN IF NOT EXISTS external_ref TEXT');
  });

  afterAll(async () => {
    await cleanupTestData(TENANT);
    await pool.query(`DELETE FROM tenants WHERE id = $1`, [TENANT]);
  });

  it('upserts purchase stock, resolves ids, clears, and returns stock', async () => {
    await cleanupTestData(TENANT);
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, business_type)
       VALUES ($1,'Purchase Stock Ops',$2,'pso@test.com','PSO','active','dealer')
       ON CONFLICT (id) DO NOTHING`,
      [TENANT, `pso-${TENANT.toLowerCase()}`],
    );

    const productId = uid('PR');
    const bookProductId = uid('BP');
    const supplierId = uid('SU');
    const groupId = uid('BG');
    const ledgerByRef = uid('BL');
    const ledgerByName = uid('BL');
    const supplierByNameId = uid('SU');

    await pool.query(
      `INSERT INTO products (id, tenant_id, name, price, stock, external_ref)
       VALUES ($1,$2,'Widget A',100,0,'X-PROD-A')`,
      [productId, TENANT],
    );
    await pool.query(
      `INSERT INTO book_products (id, tenant_id, name, unit, external_ref)
       VALUES ($1,$2,'Widget A','Piece','X-PROD-A')`,
      [bookProductId, TENANT],
    );
    await pool.query(
      `INSERT INTO suppliers (id, tenant_id, name, external_ref)
       VALUES ($1,$2,'Acme Supply','X-SUP-1')`,
      [supplierId, TENANT],
    );
    await pool.query(
      `INSERT INTO book_account_groups (id, tenant_id, name, nature, external_ref)
       VALUES ($1,$2,'Sundry Creditors','L','G-SC')`,
      [groupId, TENANT],
    );
    await pool.query(
      `INSERT INTO book_ledgers (id, tenant_id, name, group_id, nature, ledger_type, opening_balance, external_ref)
       VALUES
         ($1,$3,'Acme Supply',$4,'L','PR',0,'X-SUP-1'),
         ($2,$3,'Other Vendor',$4,'L','PR',0,'X-OTHER')`,
      [ledgerByRef, ledgerByName, TENANT, groupId],
    );
    await pool.query(
      `INSERT INTO suppliers (id, tenant_id, name, external_ref)
       VALUES ($1,$2,'Other Vendor',NULL)`,
      [supplierByNameId, TENANT],
    );

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      expect(await resolveOpsProductId(client, TENANT, productId)).toBe(productId);
      expect(await resolveOpsProductId(client, TENANT, bookProductId)).toBe(productId);
      expect(await resolveOpsProductId(client, TENANT, '')).toBeNull();
      expect(await resolveOpsProductId(client, TENANT, 'missing')).toBeNull();

      const byRef = await resolveSupplierForBookLedger(client, TENANT, ledgerByRef);
      expect(byRef?.supplierId).toBe(supplierId);
      const byName = await resolveSupplierForBookLedger(client, TENANT, ledgerByName);
      expect(byName?.supplierName).toBe('Other Vendor');
      expect(await resolveSupplierForBookLedger(client, TENANT, 'missing')).toBeNull();

      const voucherId = uid('BV');
      const { units } = await upsertPurchaseStockIn(
        client,
        TENANT,
        `books:pur:${voucherId}`,
        'PU/1',
        '2026-04-01',
        supplierId,
        [{ productId, qty: 2, rate: 50, amount: 100 }],
        0,
        100,
      );
      expect(units).toBe(2);

      const stock = await client.query(`SELECT stock::int AS s FROM products WHERE tenant_id=$1 AND id=$2`, [
        TENANT,
        productId,
      ]);
      expect(stock.rows[0].s).toBe(2);

      await clearBooksPurchaseStockIn(client, TENANT, voucherId);
      const cleared = await client.query(`SELECT stock::int AS s FROM products WHERE tenant_id=$1 AND id=$2`, [
        TENANT,
        productId,
      ]);
      expect(cleared.rows[0].s).toBe(0);

      // Restock then return
      await upsertPurchaseStockIn(
        client,
        TENANT,
        `books:pur:${voucherId}`,
        'PU/2',
        '2026-04-02',
        supplierId,
        [{ productId, qty: 2, rate: 40, amount: 80 }],
        0,
        80,
      );
      const ret = await upsertPurchaseStockReturn(
        client,
        TENANT,
        `books:pr:${voucherId}`,
        [{ productId, qty: 3 }],
        () => undefined,
      );
      expect(ret.units).toBe(2);
      expect(ret.shortfall).toBe(1);

      const afterReturn = await client.query(`SELECT stock::int AS s FROM products WHERE tenant_id=$1 AND id=$2`, [
        TENANT,
        productId,
      ]);
      expect(afterReturn.rows[0].s).toBe(0);

      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  });
});
