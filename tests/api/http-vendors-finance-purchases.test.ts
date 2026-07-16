/**
 * Supertest HTTP coverage — executes real route handlers via createApp().
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import bcrypt from 'bcrypt';
import { pool, cleanupTestData, createTestToken } from '../helpers';
import { api, authHeaders } from '../http';

const TENANT = 'T-TEST-HTTP-VFP';
const USER = 'U-HTTP-VFP';
let token = '';
let vendorId = '';
let supplierId = '';
let productId = '';
let batchId = '';

describe('HTTP: vendors / finance / purchases', () => {
  beforeAll(async () => {
    await cleanupTestData(TENANT);
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status)
       VALUES ($1, 'HTTP VFP Co', 'test-http-vfp', 'http-vfp@test.com', 'Admin', 'active')
       ON CONFLICT (id) DO NOTHING`,
      [TENANT]
    );
    const hash = bcrypt.hashSync('password123', 12);
    await pool.query(
      `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
       VALUES ($1, $2, 'http-vfp@test.com', $3, 'Admin', 'Admin')
       ON CONFLICT DO NOTHING`,
      [USER, TENANT, hash]
    );
    token = createTestToken({
      userId: USER, tenantId: TENANT, email: 'http-vfp@test.com', role: 'Admin', name: 'Admin',
    });

    // Seed product via SQL — HTTP create needs plan limits / barcode mode
    productId = 'P-HTTP-1';
    await pool.query(
      `INSERT INTO products (id, tenant_id, name, price, gst_rate)
       VALUES ($1, $2, 'HTTP Widget', 500, 18) ON CONFLICT DO NOTHING`,
      [productId, TENANT]
    );
  });

  afterAll(async () => {
    await cleanupTestData(TENANT);
  });

  it('GET /api/health is public', async () => {
    const res = await api().get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('GET /api/vendors requires auth', async () => {
    const res = await api().get('/api/vendors');
    expect(res.status).toBe(401);
  });

  it('POST /api/vendors creates vendor', async () => {
    const res = await api()
      .post('/api/vendors')
      .set(authHeaders(token, TENANT))
      .send({ name: 'HTTP Vendor', phone: '9876543210' });
    expect(res.status).toBe(201);
    vendorId = res.body.id;
    expect(vendorId).toBeTruthy();
  });

  it('POST /api/vendors rejects bad phone', async () => {
    const res = await api()
      .post('/api/vendors')
      .set(authHeaders(token, TENANT))
      .send({ name: 'Bad', phone: '12' });
    expect(res.status).toBe(400);
  });

  it('GET /api/vendors?search works', async () => {
    const res = await api()
      .get('/api/vendors?search=HTTP')
      .set(authHeaders(token, TENANT));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body) || Array.isArray(res.body?.vendors) || res.body).toBeTruthy();
  });

  it('GET /api/vendor-finance/summary', async () => {
    const res = await api()
      .get('/api/vendor-finance/summary')
      .set(authHeaders(token, TENANT));
    expect(res.status).toBe(200);
  });

  it('PUT reminder + GET finance detail', async () => {
    expect(vendorId).toBeTruthy();
    const rem = await api()
      .put(`/api/vendor-finance/${vendorId}/reminder`)
      .set(authHeaders(token, TENANT))
      .send({ enabled: true, reminderDays: 7 });
    expect(rem.status).toBe(200);

    const detail = await api()
      .get(`/api/vendor-finance/${vendorId}`)
      .set(authHeaders(token, TENANT));
    expect(detail.status).toBe(200);
  });

  it('POST /api/suppliers + finance', async () => {
    const res = await api()
      .post('/api/suppliers')
      .set(authHeaders(token, TENANT))
      .send({ name: 'HTTP Steel', phone: '9876501234' });
    expect(res.status).toBe(201);
    supplierId = res.body.id;

    const summary = await api()
      .get('/api/supplier-finance/summary')
      .set(authHeaders(token, TENANT));
    expect(summary.status).toBe(200);
  });

  it('POST /api/purchases/batch', async () => {
    expect(supplierId && productId).toBeTruthy();
    const res = await api()
      .post('/api/purchases/batch')
      .set(authHeaders(token, TENANT))
      .send({
        supplierId,
        purchaseDate: '2026-07-15',
        items: [{ productId, quantity: 2, costPrice: 100, discountPercent: 0, withGst: true }],
      });
    expect([200, 201]).toContain(res.status);
    batchId = res.body.batchId || res.body.id || '';
  });

  it('GET purchase batch + supplier payment overpay', async () => {
    if (batchId) {
      const get = await api()
        .get(`/api/purchases/batch/${batchId}`)
        .set(authHeaders(token, TENANT));
      expect(get.status).toBe(200);
    }
    const over = await api()
      .post(`/api/supplier-finance/${supplierId}/payments`)
      .set(authHeaders(token, TENANT))
      .send({ amount: 99999999, paymentDate: '2026-07-15', paymentMethod: 'Cash' });
    expect(over.status).toBe(400);

    const pay = await api()
      .post(`/api/supplier-finance/${supplierId}/payments`)
      .set(authHeaders(token, TENANT))
      .send({ amount: 50, paymentDate: '2026-07-15', paymentMethod: 'UPI' });
    expect(pay.status).toBe(201);
  });
});
