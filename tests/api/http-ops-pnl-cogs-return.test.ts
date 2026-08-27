/**
 * Ops P&L Purchase Cost must drop the cost of units already on a sales-return credit note.
 * Distribution rows stay in product_distribution after a return.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool, createTestToken, cleanupTestData } from '../helpers';
import { api, authHeaders } from '../http';

const T = 'T-OPS-COGS-RET';
const U = 'U-OPS-COGS-RET';
const P = 'P-OPS-COGS-RET';
const V = 'V-OPS-COGS-RET';
const BATCH = 'D1787836048000-cogs01';

const token = createTestToken({
  userId: U,
  tenantId: T,
  email: 'ops-cogs@test.com',
  role: 'Admin',
  name: 'Ops Cogs',
});
const hdrs = authHeaders(token, T);

beforeAll(async () => {
  await cleanupTestData(T);
  await pool.query(
    `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, plan_id)
     VALUES ($1,'Ops Cogs Co','ops-cogs-co','ops-cogs@test.com','Ops','active','TRIAL')
     ON CONFLICT (id) DO NOTHING`,
    [T],
  );
  const bcrypt = await import('bcrypt');
  const hash = await bcrypt.hash('Test1234!', 10);
  await pool.query(
    `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
     VALUES ($1,$2,'ops-cogs@test.com',$3,'Ops','Admin') ON CONFLICT DO NOTHING`,
    [U, T, hash],
  );
  await pool.query(`INSERT INTO vendors (id, tenant_id, name) VALUES ($1, $2, 'Walk-in') ON CONFLICT DO NOTHING`, [
    V,
    T,
  ]);
  await pool.query(
    `INSERT INTO products (id, tenant_id, name, price, cost_price)
     VALUES ($1, $2, 'Wheat', 1600, 1400)`,
    [P, T],
  );
  await pool.query(
    `INSERT INTO product_distribution
       (id, batch_id, tenant_id, product_id, barcode, vendor_id, distribution_date, status, net_price, billed_price)
     VALUES
       ('PD-OPS-1', $1, $2, $3, 'BAR-1', $4, '2026-08-20', 'Sold', 1600, 1680),
       ('PD-OPS-2', $1, $2, $3, 'BAR-2', $4, '2026-08-20', 'Sold', 1600, 1680)`,
    [BATCH, T, P, V],
  );
  await pool.query(
    `INSERT INTO credit_debit_notes (
       id, tenant_id, note_number, note_type, vendor_id, vendor_name, customer_name,
       note_date, reason, items, subtotal, gst_rate, gst_amount, total,
       reference_invoice, reference_type, reference_id, status
     ) VALUES (
       'CN-OPS-1', $1, 'CN-OPS-1', 'credit', $2, 'Walk-in', 'Walk-in',
       '2026-08-21', 'Sales return',
       $3::jsonb, 1600, 5, 80, 1680,
       $4, 'distribution', $4, 'Active'
     )`,
    [T, V, JSON.stringify([{ productId: P, description: 'Wheat', quantity: 1, price: 1600, withGst: true }]), BATCH],
  );
});

afterAll(async () => {
  await cleanupTestData(T);
});

describe('Ops P&L COGS after sales return', () => {
  it('purchaseCost is sold units minus returned units at cost', async () => {
    const r = await api().get('/api/accounts/profit-loss?from=2026-08-01&to=2026-08-31').set(hdrs);
    expect(r.status).toBe(200);
    expect(Number(r.body.expenses.purchaseCost)).toBe(1400);
    expect(Number(r.body.expenses.cogs)).toBe(1400);
  });
});
