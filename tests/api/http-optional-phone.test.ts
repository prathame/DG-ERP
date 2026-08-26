/**
 * Walk-in B2C: phone is optional. Empty stores null; invalid 10-digit is 400.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import bcrypt from 'bcrypt';
import { pool, cleanupTestData, createTestToken } from '../helpers';
import { api, authHeaders } from '../http';
import { phoneValidationError, isValidPhone } from '../../shared/phone';

const TENANT = 'T-TEST-HTTP-PHONE';
const USER = 'U-HTTP-PHONE';
const PRODUCT = 'P-HTTP-PHONE';
let token = '';

describe('optional walk-in phone', () => {
  it('accepts empty and valid Indian mobiles; rejects junk', () => {
    expect(phoneValidationError('')).toBeNull();
    expect(phoneValidationError('   ')).toBeNull();
    expect(phoneValidationError(null)).toBeNull();
    expect(isValidPhone('9876543210')).toBe(true);
    expect(phoneValidationError('123')).toMatch(/Invalid phone/);
  });
});

describe('HTTP: walk-in party without phone', () => {
  beforeAll(async () => {
    await cleanupTestData(TENANT);
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status)
       VALUES ($1, 'HTTP Phone Co', 'http-phone-co', 'http-phone@test.com', 'Admin', 'active')
       ON CONFLICT (id) DO NOTHING`,
      [TENANT],
    );
    const hash = bcrypt.hashSync('password123', 12);
    await pool.query(
      `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
       VALUES ($1, $2, 'http-phone@test.com', $3, 'Admin', 'Admin')
       ON CONFLICT DO NOTHING`,
      [USER, TENANT, hash],
    );
    await pool.query(`INSERT INTO vendors (id, tenant_id, name) VALUES ('OWNER', $1, 'Owner') ON CONFLICT DO NOTHING`, [
      TENANT,
    ]);
    await pool.query(
      `INSERT INTO products (id, tenant_id, name, price, warranty_months, stock)
       VALUES ($1, $2, 'Walk-in SKU', 100, 0, 1)
       ON CONFLICT DO NOTHING`,
      [PRODUCT, TENANT],
    );
    await pool.query(
      `INSERT INTO product_inventory (id, tenant_id, product_id, barcode, status)
       VALUES ('I-HTTP-PHONE', $1, $2, 'PHONE-BC-1', 'InStock')
       ON CONFLICT DO NOTHING`,
      [TENANT, PRODUCT],
    );
    token = createTestToken({
      userId: USER,
      tenantId: TENANT,
      email: 'http-phone@test.com',
      role: 'Admin',
      name: 'Admin',
    });
  });

  afterAll(async () => {
    await cleanupTestData(TENANT);
  });

  it('POST /api/vendors without phone stores null', async () => {
    const res = await api().post('/api/vendors').set(authHeaders(token, TENANT)).send({ name: 'Walk-in Cash' });
    expect(res.status).toBe(201);
    expect(res.body.phone == null || res.body.phone === '').toBe(true);
  });

  it('POST /api/vendors with invalid phone returns 400', async () => {
    const res = await api()
      .post('/api/vendors')
      .set(authHeaders(token, TENANT))
      .send({ name: 'Bad Phone Vendor', phone: '123' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/phone/i);
  });

  it('POST /api/customers without phone stores null', async () => {
    const res = await api().post('/api/customers').set(authHeaders(token, TENANT)).send({ name: 'Walk-in Customer' });
    expect(res.status).toBe(201);
    expect(res.body.phone == null || res.body.phone === '').toBe(true);
  });

  it('POST /api/invoices without phone stores null', async () => {
    const res = await api()
      .post('/api/invoices')
      .set(authHeaders(token, TENANT))
      .send({
        invoiceNumber: 'INV/PHONE/0001',
        customerName: 'Counter Sale',
        status: 'draft',
        gstEnabled: false,
        items: [{ description: 'Loose item', qty: 1, rate: 50, gstPercent: 0 }],
      });
    expect(res.status).toBe(201);
    expect(res.body.customerPhone == null || res.body.customerPhone === '').toBe(true);
  });

  it('POST /api/sales with invalid phone returns 400', async () => {
    const res = await api().post('/api/sales').set(authHeaders(token, TENANT)).send({
      barcode: 'PHONE-BC-1',
      customerName: 'Walk-in',
      customerPhone: '123',
      salePrice: 100,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/phone/i);
  });

  it('POST /api/sales without phone stores null', async () => {
    const res = await api().post('/api/sales').set(authHeaders(token, TENANT)).send({
      barcode: 'PHONE-BC-1',
      customerName: 'Walk-in',
      salePrice: 100,
    });
    expect(res.status).toBe(201);
    expect(res.body.customerPhone == null || res.body.customerPhone === '').toBe(true);
    const sale = await pool.query('SELECT customer_phone FROM product_sales WHERE id = $1 AND tenant_id = $2', [
      res.body.id,
      TENANT,
    ]);
    expect(sale.rows[0].customer_phone == null || sale.rows[0].customer_phone === '').toBe(true);
  });
});
