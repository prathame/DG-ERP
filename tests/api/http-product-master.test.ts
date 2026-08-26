/**
 * Product master: save an SKU with qty 0 and no barcodes (buy/sell rates + unit).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import bcrypt from 'bcrypt';
import { pool, cleanupTestData, createTestToken } from '../helpers';
import { api, authHeaders } from '../http';

const TENANT = 'T-TEST-HTTP-PM';
const USER = 'U-HTTP-PM';
let token = '';

describe('HTTP: product master without opening stock', () => {
  beforeAll(async () => {
    await cleanupTestData(TENANT);
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status)
       VALUES ($1, 'HTTP PM Co', 'http-pm-co', 'http-pm@test.com', 'Admin', 'active')
       ON CONFLICT (id) DO NOTHING`,
      [TENANT],
    );
    const hash = bcrypt.hashSync('password123', 12);
    await pool.query(
      `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
       VALUES ($1, $2, 'http-pm@test.com', $3, 'Admin', 'Admin')
       ON CONFLICT DO NOTHING`,
      [USER, TENANT, hash],
    );
    token = createTestToken({
      userId: USER,
      tenantId: TENANT,
      email: 'http-pm@test.com',
      role: 'Admin',
      name: 'Admin',
    });
  });

  afterAll(async () => {
    await cleanupTestData(TENANT);
  });

  it('POST /api/products with barcodeMode none and qty 0 does not mint barcodes', async () => {
    const res = await api().post('/api/products').set(authHeaders(token, TENANT)).send({
      name: 'VMC Bracket',
      barcodeMode: 'none',
      quantity: 0,
      price: 250,
      costPrice: 80,
      packName: 'Nos',
      gstRate: 18,
    });
    expect(res.status).toBe(201);
    expect(Number(res.body.stock)).toBe(0);
    expect(Number(res.body.price)).toBe(250);
    expect(Number(res.body.costPrice)).toBe(80);
    expect(res.body.packName).toBe('Nos');
    const inv = await pool.query(
      'SELECT COUNT(*) as c FROM product_inventory WHERE product_id = $1 AND tenant_id = $2',
      [res.body.id, TENANT],
    );
    expect(Number(inv.rows[0].c)).toBe(0);
  });
});
