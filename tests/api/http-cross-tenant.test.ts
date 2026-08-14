/**
 * P0-1: HTTP-level cross-tenant isolation tests.
 *
 * Every test uses Tenant A's JWT to attempt access to Tenant B's data.
 * Expected result for every attempt: 404 (record not found in A's scope)
 * or empty list — NEVER Tenant B's data.
 *
 * These tests catch application-layer bugs where a WHERE tenant_id clause
 * is missing, since DB-level RLS is currently enabled but not forced.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool, createTestToken, cleanupTestData } from '../helpers';
import { api, authHeaders } from '../http';

const TENANT_A = 'T-XTENANT-A';
const TENANT_B = 'T-XTENANT-B';
const USER_A = 'U-XTENANT-A1';
const USER_B = 'U-XTENANT-B1';

// IDs for Tenant B records that Tenant A will attempt to access
let productBId: string;
let customerBId: string;
let vendorBId: string;
let invoiceBId: string;
let expenseBId: string;
let quotationBId: string;
let orderBId: string;

const tokenA = createTestToken({ userId: USER_A, tenantId: TENANT_A, email: 'a@cross.test', role: 'Admin', name: 'A' });
const tokenB = createTestToken({ userId: USER_B, tenantId: TENANT_B, email: 'b@cross.test', role: 'Admin', name: 'B' });
const headersA = authHeaders(tokenA, TENANT_A);

beforeAll(async () => {
  await cleanupTestData(TENANT_A);
  await cleanupTestData(TENANT_B);

  // Provision two tenants
  for (const [id, slug, email] of [
    [TENANT_A, 'xtenant-a', 'a@cross.test'],
    [TENANT_B, 'xtenant-b', 'b@cross.test'],
  ]) {
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, plan_id)
       VALUES ($1, $2, $3, $4, 'Test', 'active', 'TRIAL')
       ON CONFLICT (id) DO NOTHING`,
      [id, `Company ${slug}`, slug, email],
    );
  }

  // Create users for each tenant
  const bcrypt = await import('bcrypt');
  const hash = await bcrypt.hash('Test1234!', 10);
  for (const [uid, tid, email] of [
    [USER_A, TENANT_A, 'a@cross.test'],
    [USER_B, TENANT_B, 'b@cross.test'],
  ]) {
    await pool.query(
      `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
       VALUES ($1,$2,$3,$4,'Test','Admin')
       ON CONFLICT DO NOTHING`,
      [uid, tid, email, hash],
    );
  }

  // Seed Tenant B data that Tenant A will try to access
  const { rows: p } = await pool.query(
    `INSERT INTO products (id, tenant_id, name, price, stock)
     VALUES ('PROD-B-1', $1, 'Tenant B Product', 100, 10) ON CONFLICT DO NOTHING RETURNING id`,
    [TENANT_B],
  );
  productBId = p[0]?.id ?? 'PROD-B-1';

  const { rows: c } = await pool.query(
    `INSERT INTO customers (id, tenant_id, name, phone)
     VALUES ('CUST-B-1', $1, 'Tenant B Customer', '9000000001') ON CONFLICT DO NOTHING RETURNING id`,
    [TENANT_B],
  );
  customerBId = c[0]?.id ?? 'CUST-B-1';

  const { rows: v } = await pool.query(
    `INSERT INTO vendors (id, tenant_id, name)
     VALUES ('VEND-B-1', $1, 'Tenant B Vendor') ON CONFLICT DO NOTHING RETURNING id`,
    [TENANT_B],
  );
  vendorBId = v[0]?.id ?? 'VEND-B-1';

  const { rows: inv } = await pool.query(
    `INSERT INTO standalone_invoices (id, tenant_id, invoice_number, customer_name, items, subtotal, tax_total, grand_total, status, invoice_date)
     VALUES ('INV-B-1', $1, 'INV-001', 'B Customer', '[]', 1000, 0, 1000, 'sent', CURRENT_DATE)
     ON CONFLICT DO NOTHING RETURNING id`,
    [TENANT_B],
  );
  invoiceBId = inv[0]?.id ?? 'INV-B-1';

  const { rows: ex } = await pool.query(
    `INSERT INTO expenses (id, tenant_id, category, amount, expense_date)
     VALUES ('EXP-B-1', $1, 'Test', 500, CURRENT_DATE) ON CONFLICT DO NOTHING RETURNING id`,
    [TENANT_B],
  );
  expenseBId = ex[0]?.id ?? 'EXP-B-1';

  await pool.query(
    `INSERT INTO quotations (id, tenant_id, quotation_date, items, subtotal, total, status)
     VALUES ('QUOT-B-1', $1, CURRENT_DATE, '[]', 500, 500, 'Draft') ON CONFLICT DO NOTHING`,
    [TENANT_B],
  );
  quotationBId = 'QUOT-B-1';

  await pool.query(
    `INSERT INTO orders (id, tenant_id, order_date, items, subtotal, total, status)
     VALUES ('ORD-B-1', $1, CURRENT_DATE, '[]', 500, 500, 'Pending') ON CONFLICT DO NOTHING`,
    [TENANT_B],
  );
  orderBId = 'ORD-B-1';
});

afterAll(async () => {
  await cleanupTestData(TENANT_A);
  await cleanupTestData(TENANT_B);
});

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------
describe('Products — cross-tenant', () => {
  it('GET /api/products list does not return Tenant B products', async () => {
    const res = await api().get('/api/products').set(headersA);
    expect(res.status).toBe(200);
    const ids = (res.body as { id?: string }[]).map(p => p.id);
    expect(ids).not.toContain(productBId);
  });

  it('GET /api/products/verify/:barcode — Tenant B barcode returns 404', async () => {
    // First put a barcode on Tenant B product
    await pool.query(
      `INSERT INTO product_inventory (id, tenant_id, product_id, barcode, status)
       VALUES ('INV-B-BC1', $1, $2, 'BC-TENANT-B-001', 'InStock') ON CONFLICT DO NOTHING`,
      [TENANT_B, productBId],
    );
    const res = await api().get('/api/products/verify/BC-TENANT-B-001').set(headersA);
    // Should 404 — barcode belongs to Tenant B
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------
describe('Customers — cross-tenant', () => {
  it('GET /api/customers list does not include Tenant B customers', async () => {
    const res = await api().get('/api/customers').set(headersA);
    expect(res.status).toBe(200);
    const ids = (res.body as { id?: string }[]).map(c => c.id);
    expect(ids).not.toContain(customerBId);
  });

  it('GET /api/customers/:id/purchases with Tenant B customer ID returns 404 or empty', async () => {
    const res = await api().get(`/api/customers/${customerBId}/purchases`).set(headersA);
    // Either 404 or empty purchases — must not return B's data
    if (res.status === 200) {
      expect((res.body as { id?: string }[]).length).toBe(0);
    } else {
      expect(res.status).toBe(404);
    }
  });
});

// ---------------------------------------------------------------------------
// Vendors
// ---------------------------------------------------------------------------
describe('Vendors — cross-tenant', () => {
  it('GET /api/vendors list does not include Tenant B vendors', async () => {
    const res = await api().get('/api/vendors').set(headersA);
    expect(res.status).toBe(200);
    const ids = (res.body as { id?: string }[]).map(v => v.id);
    expect(ids).not.toContain(vendorBId);
  });
});

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------
describe('Invoices — cross-tenant', () => {
  it('GET /api/invoices list does not include Tenant B invoices', async () => {
    const res = await api().get('/api/invoices').set(headersA);
    expect(res.status).toBe(200);
    const ids = (res.body.invoices ?? (res.body as { id?: string }[])).map((inv: { id?: string }) => inv.id);
    expect(ids).not.toContain(invoiceBId);
  });

  it('GET /api/invoices/:id with Tenant B invoice ID returns 404', async () => {
    const res = await api().get(`/api/invoices/${invoiceBId}`).set(headersA);
    expect(res.status).toBe(404);
  });

  it('DELETE /api/invoices/:id with Tenant B invoice ID returns 404', async () => {
    const res = await api().delete(`/api/invoices/${invoiceBId}`).set(headersA);
    expect(res.status).toBe(404);
    // Verify the invoice still exists in Tenant B
    const check = await pool.query('SELECT id FROM standalone_invoices WHERE id = $1 AND tenant_id = $2', [
      invoiceBId,
      TENANT_B,
    ]);
    expect(check.rows.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Quotations
// ---------------------------------------------------------------------------
describe('Quotations — cross-tenant', () => {
  it('GET /api/quotations list does not include Tenant B quotations', async () => {
    const res = await api().get('/api/quotations').set(headersA);
    expect(res.status).toBe(200);
    const ids = (res.body as { id?: string }[]).map(q => q.id);
    expect(ids).not.toContain(quotationBId);
  });

  it('GET /api/quotations/:id with Tenant B quotation ID returns 404', async () => {
    const res = await api().get(`/api/quotations/${quotationBId}`).set(headersA);
    expect(res.status).toBe(404);
  });

  it('PUT /api/quotations/:id/status with Tenant B quotation ID does not mutate B data', async () => {
    const res = await api().put(`/api/quotations/${quotationBId}/status`).set(headersA).send({ status: 'Accepted' });
    expect(res.status).toBe(404);
    // Verify B's quotation is still Draft
    const check = await pool.query('SELECT status FROM quotations WHERE id = $1 AND tenant_id = $2', [
      quotationBId,
      TENANT_B,
    ]);
    expect(check.rows[0]?.status).toBe('Draft');
  });
});

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------
describe('Orders — cross-tenant', () => {
  it('GET /api/orders list does not include Tenant B orders', async () => {
    const res = await api().get('/api/orders').set(headersA);
    expect(res.status).toBe(200);
    const ids = (res.body as { id?: string }[]).map(o => o.id);
    expect(ids).not.toContain(orderBId);
  });

  it('GET /api/orders/:id with Tenant B order ID returns 404', async () => {
    const res = await api().get(`/api/orders/${orderBId}`).set(headersA);
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------
describe('Expenses — cross-tenant', () => {
  it('GET /api/expenses list does not include Tenant B expenses', async () => {
    const res = await api().get('/api/expenses').set(headersA);
    expect(res.status).toBe(200);
    const ids = (res.body as { id?: string }[]).map(e => e.id);
    expect(ids).not.toContain(expenseBId);
  });
});

// ---------------------------------------------------------------------------
// Finance
// ---------------------------------------------------------------------------
describe('Finance — cross-tenant', () => {
  it('GET /api/vendor-finance/:vendorId with Tenant B vendor ID returns 404 or empty', async () => {
    const res = await api().get(`/api/vendor-finance/${vendorBId}`).set(headersA);
    if (res.status === 200) {
      expect(Number(res.body.balance ?? 0)).toBe(0);
      expect((res.body.payments ?? []).length).toBe(0);
    } else {
      expect(res.status).toBe(404);
    }
  });

  it('POST /api/vendor-finance/:vendorId/payments with Tenant B vendor ID returns 404', async () => {
    const res = await api()
      .post(`/api/vendor-finance/${vendorBId}/payments`)
      .set(headersA)
      .send({ amount: 100, paymentDate: '2026-01-01', paymentMethod: 'Cash' });
    expect(res.status).toBe(404);
    // Verify no payment was created for Tenant B vendor
    const check = await pool.query('SELECT id FROM vendor_payments WHERE vendor_id = $1 AND tenant_id = $2', [
      vendorBId,
      TENANT_B,
    ]);
    expect(check.rows.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------
describe('Notifications — cross-tenant', () => {
  it('GET /api/notifications does not return Tenant B notifications', async () => {
    // Insert a notification for Tenant B
    await pool.query(
      `INSERT INTO tenant_notifications (id, tenant_id, title, body, type, source)
       VALUES ('NOTIF-B-1', $1, 'B Notification', 'secret', 'info', 'super_admin')
       ON CONFLICT DO NOTHING`,
      [TENANT_B],
    );
    const res = await api().get('/api/notifications').set(headersA);
    expect(res.status).toBe(200);
    const all = (res.body.items ?? []) as { id?: string }[];
    expect(all.map(n => n.id)).not.toContain('NOTIF-B-1');
  });
});

// ---------------------------------------------------------------------------
// Audit Log
// ---------------------------------------------------------------------------
describe('Audit Log — cross-tenant', () => {
  it('GET /api/audit-log does not return Tenant B audit entries', async () => {
    await pool.query(
      `INSERT INTO audit_log (tenant_id, user_id, action, entity_type)
       VALUES ($1, 'U-B', 'TestAction', 'test')`,
      [TENANT_B],
    );
    const res = await api().get('/api/audit-log').set(headersA);
    expect(res.status).toBe(200);
    const entries = (res.body.data ?? []) as { tenantId?: string }[];
    for (const entry of entries) {
      // All returned entries must belong to Tenant A, never Tenant B
      if (entry.tenantId) {
        expect(entry.tenantId).toBe(TENANT_A);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// JWT tenantId always wins over X-Tenant-ID header
// ---------------------------------------------------------------------------
describe('JWT tenantId overrides client-supplied X-Tenant-ID', () => {
  it('Token for Tenant A with X-Tenant-ID: Tenant B header still scopes to Tenant A', async () => {
    // Send Token A but X-Tenant-ID: TENANT_B
    const headersManipulated = {
      Authorization: `Bearer ${tokenA}`,
      'X-Tenant-ID': TENANT_B,
      'X-DG-Client': 'web',
    };
    const res = await api().get('/api/products').set(headersManipulated);
    // Should succeed (JWT is valid) but return Tenant A's data (empty), not Tenant B's
    expect(res.status).toBe(200);
    const ids = (res.body as { id?: string }[]).map(p => p.id);
    expect(ids).not.toContain(productBId);
  });

  it('Fabricated tenantId in body for vendor payment is rejected (vendor not in JWT tenant)', async () => {
    const res = await api()
      .post(`/api/vendor-finance/${vendorBId}/payments`)
      .set({ Authorization: `Bearer ${tokenA}`, 'X-Tenant-ID': TENANT_A, 'X-DG-Client': 'web' })
      .send({ amount: 100, paymentDate: '2026-01-01', paymentMethod: 'Cash' });
    expect(res.status).toBe(404);
  });
});
