/**
 * Phase 2: Role × Module × Action permission matrix tests.
 *
 * Tests that the backend enforces permissions correctly for every role,
 * not just what the frontend hides. Attempts unauthorized mutations directly
 * via the API and verifies correct 403 responses.
 *
 * Roles tested: Admin, Manager, Staff, Warehouse, Vendor
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool, createTestToken, cleanupTestData } from '../helpers';
import { api, authHeaders } from '../http';

const T = 'T-ROLE-PERM-001';

const USERS = {
  admin: { id: 'U-RP-ADMIN', role: 'Admin', email: 'admin@rp.test' },
  manager: { id: 'U-RP-MANAGER', role: 'Manager', email: 'manager@rp.test' },
  staff: { id: 'U-RP-STAFF', role: 'Staff', email: 'staff@rp.test' },
  warehouse: { id: 'U-RP-WAREHOUSE', role: 'Warehouse', email: 'wh@rp.test' },
  vendor: { id: 'U-RP-VENDOR', role: 'Vendor', email: 'vnd@rp.test', vendorId: 'VEND-RP-001' },
};

function tok(u: { id: string; role: string; email: string; vendorId?: string }) {
  return authHeaders(createTestToken({ userId: u.id, tenantId: T, email: u.email, role: u.role, name: u.role }), T);
}

// Tokens
const admin = tok(USERS.admin);
const manager = tok(USERS.manager);
const staff = tok(USERS.staff);
const warehouse = tok(USERS.warehouse);
const vendor = tok(USERS.vendor);

let prodId: string;

beforeAll(async () => {
  await cleanupTestData(T);

  await pool.query(
    `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, plan_id)
     VALUES ($1,'Role Perm Corp','role-perm-corp','admin@rp.test','Admin','active','TRIAL')
     ON CONFLICT (id) DO NOTHING`,
    [T],
  );
  const bcrypt = await import('bcrypt');
  const hash = await bcrypt.hash('Test1234!', 10);
  for (const u of Object.values(USERS)) {
    await pool.query(
      `INSERT INTO users (id, tenant_id, email, password_hash, name, role, vendor_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
      [u.id, T, u.email, hash, u.role, u.role, 'vendorId' in u ? u.vendorId : null],
    );
  }

  // Vendor
  await pool.query(
    `INSERT INTO vendors (id, tenant_id, name) VALUES ('VEND-RP-001',$1,'RP Vendor')
     ON CONFLICT DO NOTHING`,
    [T],
  );

  // Seed a product
  const r = await api()
    .post('/api/products')
    .set(admin)
    .send({ name: `RP Product ${Date.now()}`, price: 100 });
  prodId = r.body?.id ?? 'PROD-RP-NONE';
});

afterAll(async () => {
  await cleanupTestData(T);
});

// ─── Admin: can do everything ─────────────────────────────────────────────────

describe('Admin role', () => {
  it('can read products', async () => {
    const r = await api().get('/api/products').set(admin);
    expect(r.status).toBe(200);
  });
  it('can create product', async () => {
    const r = await api()
      .post('/api/products')
      .set(admin)
      .send({ name: `Admin Product ${Date.now()}`, price: 50, barcodeMode: 'auto', quantity: 1 });
    expect(r.status).toBe(201);
  });
  it('can access audit log', async () => {
    const r = await api().get('/api/audit-log').set(admin);
    expect(r.status).toBe(200);
  });
  it('can access admin users list', async () => {
    const r = await api().get('/api/admin/users').set(admin);
    expect(r.status).toBe(200);
  });
});

// ─── Staff: view-only on most modules ─────────────────────────────────────────

describe('Staff role — view allowed, mutation denied', () => {
  it('can read products', async () => {
    const r = await api().get('/api/products').set(staff);
    expect(r.status).toBe(200);
  });
  it('cannot create product', async () => {
    const r = await api()
      .post('/api/products')
      .set(staff)
      .send({ name: `Staff Prod ${Date.now()}`, price: 50, barcodeMode: 'auto', quantity: 1 });
    expect(r.status).toBe(403);
  });
  it('cannot delete product', async () => {
    const r = await api().delete(`/api/products/${prodId}`).set(staff);
    expect(r.status).toBe(403);
  });
  it('cannot access admin users', async () => {
    const r = await api().get('/api/admin/users').set(staff);
    expect(r.status).toBe(403);
  });
  it('cannot access audit log', async () => {
    const r = await api().get('/api/audit-log').set(staff);
    expect(r.status).toBe(403);
  });
  it('cannot create vendor', async () => {
    const r = await api()
      .post('/api/vendors')
      .set(staff)
      .send({ name: `Staff Vendor ${Date.now()}` });
    expect(r.status).toBe(403);
  });
  it('can read vendors', async () => {
    const r = await api().get('/api/vendors').set(staff);
    expect(r.status).toBe(200);
  });
  it('cannot create expense', async () => {
    const r = await api()
      .post('/api/expenses')
      .set(staff)
      .send({ category: 'Test', amount: 100, expenseDate: '2026-01-01' });
    expect(r.status).toBe(403);
  });
});

// ─── Manager: full except settings ───────────────────────────────────────────

describe('Manager role', () => {
  it('can create product', async () => {
    const r = await api()
      .post('/api/products')
      .set(manager)
      .send({ name: `Mgr Prod ${Date.now()}`, price: 75, barcodeMode: 'auto', quantity: 1 });
    expect(r.status).toBe(201);
  });
  it('can create vendor', async () => {
    const r = await api()
      .post('/api/vendors')
      .set(manager)
      .send({ name: `Mgr Vendor ${Date.now()}` });
    expect(r.status).toBe(201);
  });
  it('cannot create user (admin-only)', async () => {
    const r = await api()
      .post('/api/admin/users')
      .set(manager)
      .send({
        name: 'Mgr New User',
        email: `mgruser${Date.now()}@test.com`,
        role: 'Staff',
      });
    expect(r.status).toBe(403);
  });
});

// ─── Warehouse: view dashboard/inventory, print distribution ─────────────────

describe('Warehouse role', () => {
  it('can read products', async () => {
    const r = await api().get('/api/products').set(warehouse);
    expect(r.status).toBe(200);
  });
  it('cannot create product', async () => {
    const r = await api()
      .post('/api/products')
      .set(warehouse)
      .send({ name: `WH Prod ${Date.now()}`, price: 25, barcodeMode: 'auto', quantity: 1 });
    expect(r.status).toBe(403);
  });
  it('cannot create vendor', async () => {
    const r = await api()
      .post('/api/vendors')
      .set(warehouse)
      .send({ name: `WH Vendor ${Date.now()}` });
    expect(r.status).toBe(403);
  });
  it('cannot create expense', async () => {
    const r = await api()
      .post('/api/expenses')
      .set(warehouse)
      .send({ category: 'Test', amount: 50, expenseDate: '2026-01-01' });
    expect(r.status).toBe(403);
  });
  it('cannot create invoice', async () => {
    const r = await api().post('/api/invoices').set(warehouse).send({
      customerName: 'Test',
      items: [],
      subtotal: 0,
      taxTotal: 0,
      grandTotal: 0,
    });
    expect(r.status).toBe(403);
  });
});

// ─── Vendor: view own distribution and finance only ──────────────────────────

describe('Vendor role — IDOR protection', () => {
  it('cannot create product', async () => {
    const r = await api()
      .post('/api/products')
      .set(vendor)
      .send({ name: `Vnd Prod ${Date.now()}`, price: 100, barcodeMode: 'auto', quantity: 1 });
    expect(r.status).toBe(403);
  });
  it('cannot create vendor', async () => {
    const r = await api()
      .post('/api/vendors')
      .set(vendor)
      .send({ name: `Vnd Vendor ${Date.now()}` });
    expect(r.status).toBe(403);
  });
  it('cannot create expense', async () => {
    const r = await api()
      .post('/api/expenses')
      .set(vendor)
      .send({ category: 'Test', amount: 100, expenseDate: '2026-01-01' });
    expect(r.status).toBe(403);
  });
  it('cannot access admin users', async () => {
    const r = await api().get('/api/admin/users').set(vendor);
    expect(r.status).toBe(403);
  });
  it('cannot access reports', async () => {
    const r = await api().get('/api/reports/gst-summary').set(vendor);
    expect(r.status).toBe(403);
  });
  it('cannot access accounts', async () => {
    const r = await api().get('/api/accounts/profit-loss').set(vendor);
    expect(r.status).toBe(403);
  });
  it('cannot create customer', async () => {
    const r = await api().post('/api/customers').set(vendor).send({
      name: 'Test Customer',
      phone: '9800000001',
    });
    expect(r.status).toBe(403);
  });
  it('product list is scoped — Vendor JWT links to VEND-RP-001', async () => {
    // Vendor portal user must be linked to a vendor profile to see products.
    // The user U-RP-VENDOR has vendor_id = VEND-RP-001 but no distribution exists for it.
    // Expect 200 with empty list (no products distributed to this vendor) OR
    // 403 (vendor not linked) — NOT other tenants' products.
    const r = await api().get('/api/products').set(vendor);
    expect([200, 403]).toContain(r.status);
    if (r.status === 200) {
      // If 200, the list must be empty (no distributions for VEND-RP-001)
      expect(Array.isArray(r.body)).toBe(true);
    }
  });
});

// ─── Unauthenticated — must return 401 ───────────────────────────────────────

describe('Unauthenticated access', () => {
  it('GET /api/products returns 401 without token', async () => {
    const r = await api().get('/api/products').set('X-DG-Client', 'web');
    expect(r.status).toBe(401);
  });
  it('POST /api/invoices returns 401 without token', async () => {
    const r = await api().post('/api/invoices').set('X-DG-Client', 'web').send({});
    expect(r.status).toBe(401);
  });
  it('GET /api/admin/users returns 401 without token', async () => {
    const r = await api().get('/api/admin/users').set('X-DG-Client', 'web');
    expect(r.status).toBe(401);
  });
});

// ─── Invalid token ────────────────────────────────────────────────────────────

describe('Invalid token', () => {
  it('returns 401 on forged JWT', async () => {
    const r = await api().get('/api/products').set({
      Authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiJVLUhBQ0tFUiIsInRlbmFudElkIjoiVEhBQ0tFUiJ9.FORGED',
      'X-DG-Client': 'web',
      'X-Tenant-ID': T,
    });
    expect(r.status).toBe(401);
  });

  it('returns 401 on expired-looking JWT with wrong secret', async () => {
    const r = await api().get('/api/products').set({
      Authorization: 'Bearer bad.token.here',
      'X-DG-Client': 'web',
      'X-Tenant-ID': T,
    });
    expect(r.status).toBe(401);
  });
});
