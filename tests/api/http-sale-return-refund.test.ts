/**
 * A paid cash sale that is returned must reverse the collection.
 * Analytics Collected is SUM(vendor_payments); without a refund that leftover stays.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool, createTestToken, cleanupTestData } from '../helpers';
import { api, authHeaders } from '../http';

const T = 'T-SALE-REFUND';
const U = 'U-SALE-REFUND';
const P = 'P-SALE-REFUND';
const V = 'V-SALE-REFUND';
const BATCH = 'D-SALE-REFUND-01';

const token = createTestToken({
  userId: U,
  tenantId: T,
  email: 'sale-refund@test.com',
  role: 'Admin',
  name: 'Refund Admin',
});
const hdrs = authHeaders(token, T);

beforeAll(async () => {
  await cleanupTestData(T);
  await pool.query(
    `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, business_type)
     VALUES ($1,'Refund Co','sale-refund-co','sale-refund@test.com','Admin','active','dealer')
     ON CONFLICT (id) DO NOTHING`,
    [T],
  );
  const bcrypt = await import('bcrypt');
  const hash = await bcrypt.hash('Test1234!', 10);
  await pool.query(
    `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
     VALUES ($1,$2,'sale-refund@test.com',$3,'Admin','Admin') ON CONFLICT DO NOTHING`,
    [U, T, hash],
  );
  await pool.query(`INSERT INTO vendors (id, tenant_id, name) VALUES ($1, $2, 'Walk-in') ON CONFLICT DO NOTHING`, [
    V,
    T,
  ]);
  await pool.query(
    `INSERT INTO products (id, tenant_id, name, price, cost_price, stock)
     VALUES ($1, $2, 'Wheat 20kg', 1600, 1400, 0)`,
    [P, T],
  );
  await pool.query(
    `INSERT INTO product_inventory (id, tenant_id, product_id, barcode, status, batch_id)
     VALUES ('INV-REFUND-1', $1, $2, 'BAR-REFUND-1', 'Distributed', $3)`,
    [T, P, BATCH],
  );
  await pool.query(
    `INSERT INTO product_distribution
       (id, batch_id, tenant_id, product_id, barcode, vendor_id, distribution_date, status,
        net_price, billed_price, gst_applied)
     VALUES ('PD-REFUND-1', $1, $2, $3, 'BAR-REFUND-1', $4, '2026-08-20', 'Sold', 1600, 1680, true)`,
    [BATCH, T, P, V],
  );
  await pool.query(
    `INSERT INTO vendor_payments
       (id, tenant_id, vendor_id, amount, payment_date, payment_method, notes, batch_id)
     VALUES ('VP-REFUND-PAY', $1, $2, 1680, '2026-08-20', 'Cash', 'Cash against sale', $3)`,
    [T, V, BATCH],
  );
});

afterAll(async () => {
  await cleanupTestData(T);
});

describe('Sales return refunds a paid cash bill', () => {
  it('drops vendor_payments and Analytics collections to zero', async () => {
    const before = await api().get('/api/analytics/overview?from=2026-08-01&to=2026-08-31').set(hdrs);
    expect(before.status).toBe(200);
    expect(Number(before.body.money.collections)).toBe(1680);

    const ret = await api()
      .post(`/api/distribution/batch/${BATCH}/return`)
      .set(hdrs)
      .send({ items: [{ productId: P, quantity: 1 }] });
    expect(ret.status).toBe(201);
    expect(Number(ret.body.billed)).toBe(1680);

    const paid = await pool.query(
      `SELECT COALESCE(SUM(amount),0)::float AS t FROM vendor_payments WHERE tenant_id=$1`,
      [T],
    );
    expect(Number(paid.rows[0].t)).toBe(0);

    const after = await api().get('/api/analytics/overview?from=2026-08-01&to=2026-08-31').set(hdrs);
    expect(after.status).toBe(200);
    expect(Number(after.body.money.collections)).toBe(0);
    expect(Number(after.body.money.outstanding)).toBe(0);

    const inv = await api().get('/api/invoices?includeSales=1&from=2026-08-01&to=2026-08-31').set(hdrs);
    expect(inv.status).toBe(200);
    const sale = (inv.body as { id: string; paidAmount: number; outstanding: number }[]).find(
      r => r.id === `sale:${BATCH}`,
    );
    expect(sale).toBeTruthy();
    expect(Number(sale?.paidAmount)).toBe(0);
    expect(Number(sale?.outstanding)).toBe(0);
  });
});
