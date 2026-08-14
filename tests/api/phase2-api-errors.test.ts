/**
 * Phase 2: API error handling tests.
 *
 * Verifies correct HTTP status codes, safe error messages (no stack traces),
 * and security properties of error responses.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool, createTestToken, cleanupTestData } from '../helpers';
import { api, authHeaders } from '../http';

const T = 'T-ERR-TEST-001';
const U = 'U-ERR-ADMIN-001';

const token = createTestToken({ userId: U, tenantId: T, email: 'err@test.com', role: 'Admin', name: 'Err Admin' });
const hdrs = authHeaders(token, T);

beforeAll(async () => {
  await cleanupTestData(T);
  await pool.query(
    `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, plan_id)
     VALUES ($1,'Error Test Corp','err-test-corp','err@test.com','Err','active','TRIAL') ON CONFLICT (id) DO NOTHING`,
    [T],
  );
  const bcrypt = await import('bcrypt');
  const hash = await bcrypt.hash('Test1234!', 10);
  await pool.query(
    `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
     VALUES ($1,$2,'err@test.com',$3,'Err','Admin') ON CONFLICT DO NOTHING`,
    [U, T, hash],
  );
});

afterAll(async () => {
  await cleanupTestData(T);
});

// ─── 400 Validation ───────────────────────────────────────────────────────────

describe('400 — validation errors', () => {
  it('POST /api/products without name returns 400', async () => {
    const r = await api().post('/api/products').set(hdrs).send({ price: 100 });
    expect(r.status).toBe(400);
    expect(r.body.error).toBeDefined();
    expect(r.body.error).not.toMatch(/stack|at /i);
  });

  it('POST /api/customers with invalid phone returns 400', async () => {
    const r = await api().post('/api/customers').set(hdrs).send({ name: 'Test', phone: '123' });
    expect(r.status).toBe(400);
    expect(r.body.error).toBeDefined();
  });

  it('POST /api/books/vouchers with invalid voucherType returns 400', async () => {
    const r = await api()
      .post('/api/books/vouchers')
      .set(hdrs)
      .send({ voucherType: 'invalid_type', voucherDate: '2026-01-01' });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/voucherType/i);
  });

  it('Malformed JSON body returns 400 not 500', async () => {
    const r = await api()
      .post('/api/products')
      .set(hdrs)
      .set('Content-Type', 'application/json')
      .send('{invalid json{{{{');
    // Should return 400 (bad request) not 500 (server error)
    expect(r.status).toBe(400);
  });
});

// ─── 401 Unauthenticated ──────────────────────────────────────────────────────

describe('401 — unauthenticated', () => {
  it('GET /api/products without Authorization returns 401', async () => {
    const r = await api().get('/api/products').set({ 'X-DG-Client': 'web', 'X-Tenant-ID': T });
    expect(r.status).toBe(401);
    expect(r.body.error).toBeDefined();
    expect(r.body).not.toHaveProperty('stack');
  });

  it('POST /api/auth/login with wrong credentials returns 401', async () => {
    // platform is required by the login route (403 without it)
    const r = await api().post('/api/auth/login').send({
      email: 'err@test.com',
      password: 'WrongPassword!',
      slug: 'err-test-corp',
      platform: 'web',
    });
    expect(r.status).toBe(401);
    // Must NOT leak whether the email exists
    expect(r.body.error).not.toMatch(/email not found|user not found/i);
  });
});

// ─── 403 Forbidden ────────────────────────────────────────────────────────────

describe('403 — forbidden', () => {
  it('Staff role cannot delete product — returns 403', async () => {
    const staffTok = authHeaders(
      createTestToken({ userId: 'U-ERR-STAFF', tenantId: T, email: 's@test.com', role: 'Staff', name: 'Staff' }),
      T,
    );
    // Seed staff user
    const bcrypt = await import('bcrypt');
    const hash = await bcrypt.hash('Test1234!', 10);
    await pool.query(
      `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
       VALUES ('U-ERR-STAFF',$1,'s@test.com',$2,'Staff','Staff') ON CONFLICT DO NOTHING`,
      [T, hash],
    );
    const r = await api().delete('/api/products/NONEXISTENT-ID').set(staffTok);
    expect(r.status).toBe(403);
  });
});

// ─── 404 Not Found ────────────────────────────────────────────────────────────

describe('404 — not found', () => {
  it('GET /api/products/DOESNOTEXIST returns 404', async () => {
    const r = await api().get('/api/products/verify/BARCODE-THAT-DOES-NOT-EXIST-XYZ99').set(hdrs);
    expect(r.status).toBe(404);
    expect(r.body.error).toBeDefined();
    expect(r.body).not.toHaveProperty('stack');
  });

  it('GET /api/invoices/NONEXISTENT returns 404', async () => {
    const r = await api().get('/api/invoices/INV-DOES-NOT-EXIST').set(hdrs);
    expect(r.status).toBe(404);
  });

  it('GET /api/orders/NONEXISTENT returns 404', async () => {
    const r = await api().get('/api/orders/ORD-DOES-NOT-EXIST').set(hdrs);
    expect(r.status).toBe(404);
  });
});

// ─── 409 Duplicate / Conflict ────────────────────────────────────────────────

describe('409 — duplicate conflict', () => {
  it('creating product with duplicate name returns 400/409', async () => {
    const name = `DupProduct-${Date.now()}`;
    // barcodeMode: 'auto' avoids the prefix-required validation
    const r1 = await api().post('/api/products').set(hdrs).send({ name, price: 100, barcodeMode: 'auto', quantity: 1 });
    expect(r1.status).toBe(201);
    const r2 = await api().post('/api/products').set(hdrs).send({ name, price: 200, barcodeMode: 'auto', quantity: 1 });
    expect([400, 409]).toContain(r2.status);
    expect(r2.body.error).toBeDefined();
  });
});

// ─── Error response safety ────────────────────────────────────────────────────

describe('Error response safety — no sensitive data in error bodies', () => {
  it('5xx errors never include stack traces', async () => {
    // Force a 5xx by sending a syntactically valid but semantically broken request
    // that might trigger an unhandled error path
    const r = await api().post('/api/invoice-finance/payments').set(hdrs).send({ invoiceId: null, amount: null });
    // Whether 400 or 500, body must not contain stack traces
    const body = JSON.stringify(r.body);
    expect(body).not.toMatch(/at Object\.|at async|node_modules/);
    expect(body).not.toMatch(/pg-db|pg\/lib/);
  });

  it('error responses include correlationId', async () => {
    const r = await api().get('/api/invoices/NONEXISTENT').set(hdrs);
    // correlationId is set in header by the server
    expect(r.headers['x-correlation-id']).toBeDefined();
  });

  it('forgot-password returns same message for known and unknown email', async () => {
    const knownEmail = 'err@test.com';
    const unknownEmail = `definitely-not-exist-${Date.now()}@nowhere.invalid`;

    const rKnown = await api().post('/api/auth/forgot-password').send({ email: knownEmail, slug: 'err-test-corp' });
    const rUnknown = await api().post('/api/auth/forgot-password').send({ email: unknownEmail, slug: 'err-test-corp' });

    // Both must return 200
    expect(rKnown.status).toBe(200);
    expect(rUnknown.status).toBe(200);
    // Both must return identical message (anti-enumeration)
    expect(rKnown.body.message).toBe(rUnknown.body.message);
    expect(rKnown.body.ok).toBe(true);
    expect(rUnknown.body.ok).toBe(true);
  });
});

// ─── Public endpoints availability ───────────────────────────────────────────

describe('Public endpoints', () => {
  it('GET /api/health returns 200', async () => {
    const r = await api().get('/api/health');
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
  });

  it('GET /api/live returns 200', async () => {
    const r = await api().get('/api/live');
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
  });

  it('GET /api/ready returns 200 when DB is up', async () => {
    const r = await api().get('/api/ready');
    expect(r.status).toBe(200);
    expect(r.body.db).toBe('up');
  });
});
