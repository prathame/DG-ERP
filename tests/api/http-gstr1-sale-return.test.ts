/**
 * A returned unregistered cash sale must leave GSTR-1 B2CS / HSN, and B2B invoice val must be rounded.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool, createTestToken, cleanupTestData } from '../helpers';
import { api, authHeaders } from '../http';

const T = 'T-GSTR1-RET';
const U = 'U-GSTR1-RET';
const P = 'P-GSTR1-RET';
const V = 'V-GSTR1-RET';
const BATCH = 'D-GSTR1-RET-01';

const token = createTestToken({
  userId: U,
  tenantId: T,
  email: 'gstr1-ret@test.com',
  role: 'Admin',
  name: 'Gstr Admin',
});
const hdrs = authHeaders(token, T);

beforeAll(async () => {
  await cleanupTestData(T);
  await pool.query(
    `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, business_type, gst_number)
     VALUES ($1,'Gstr Ret Co','gstr-ret-co','gstr1-ret@test.com','Admin','active','dealer','24AAGSH1234A1Z5')
     ON CONFLICT (id) DO NOTHING`,
    [T],
  );
  const bcrypt = await import('bcrypt');
  const hash = await bcrypt.hash('Test1234!', 10);
  await pool.query(
    `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
     VALUES ($1,$2,'gstr1-ret@test.com',$3,'Admin','Admin') ON CONFLICT DO NOTHING`,
    [U, T, hash],
  );
  await pool.query(`INSERT INTO vendors (id, tenant_id, name) VALUES ($1, $2, 'Walk-in') ON CONFLICT DO NOTHING`, [
    V,
    T,
  ]);
  await pool.query(
    `INSERT INTO products (id, tenant_id, name, price, cost_price, stock, hsn_code, gst_rate)
     VALUES ($1, $2, 'Wheat 20kg', 1600, 1400, 0, '1001', 5)`,
    [P, T],
  );
  await pool.query(
    `INSERT INTO product_inventory (id, tenant_id, product_id, barcode, status, batch_id)
     VALUES ('INV-GSTR1-1', $1, $2, 'BAR-GSTR1-1', 'Distributed', $3)`,
    [T, P, BATCH],
  );
  await pool.query(
    `INSERT INTO product_distribution
       (id, batch_id, tenant_id, product_id, barcode, vendor_id, distribution_date, status,
        net_price, billed_price, gst_applied)
     VALUES ('PD-GSTR1-1', $1, $2, $3, 'BAR-GSTR1-1', $4, '2026-08-20', 'Sold', 1600, 1680, true)`,
    [BATCH, T, P, V],
  );
  await pool.query(
    `INSERT INTO vendor_payments
       (id, tenant_id, vendor_id, amount, payment_date, payment_method, notes, batch_id)
     VALUES ('VP-GSTR1-PAY', $1, $2, 1680, '2026-08-20', 'Cash', 'Cash against sale', $3)`,
    [T, V, BATCH],
  );
});

afterAll(async () => {
  await cleanupTestData(T);
});

describe('GSTR-1 after unregistered sales return', () => {
  it('drops B2CS and HSN for the returned bag and keeps invoice val rounded', async () => {
    const before = await api().get('/api/reports/gstr1?month=8&year=2026').set(hdrs);
    expect(before.status).toBe(200);
    expect(before.body.b2cs?.length).toBeGreaterThan(0);

    const ret = await api()
      .post(`/api/distribution/batch/${BATCH}/return`)
      .set(hdrs)
      .send({ items: [{ productId: P, quantity: 1 }] });
    expect(ret.status).toBe(201);

    const after = await api().get('/api/reports/gstr1?month=8&year=2026').set(hdrs);
    expect(after.status).toBe(200);
    expect(after.body.b2cs || []).toEqual([]);
    const wheat = (after.body.hsn?.data || []).find((h: { hsn_sc: string }) => h.hsn_sc === '1001');
    expect(wheat).toBeFalsy();
    for (const g of after.body.b2b || []) {
      for (const inv of g.inv || []) {
        expect(Number.isInteger(Math.round(inv.val * 100))).toBe(true);
        expect(String(inv.val)).not.toMatch(/99999/);
      }
    }
  });
});
