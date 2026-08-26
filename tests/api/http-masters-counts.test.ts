/**
 * GET /api/masters/counts must return JSON numbers (hub tiles hide string counts).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import bcrypt from 'bcrypt';
import { pool, cleanupTestData, createTestToken } from '../helpers';
import { api, authHeaders } from '../http';

const TENANT = 'T-TEST-HTTP-MCNT';
const USER = 'U-HTTP-MCNT';
let token = '';

describe('HTTP: masters hub counts', () => {
  beforeAll(async () => {
    await cleanupTestData(TENANT);
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status)
       VALUES ($1, 'HTTP MCount Co', 'http-mcnt', 'http-mcnt@test.com', 'Admin', 'active')
       ON CONFLICT (id) DO NOTHING`,
      [TENANT],
    );
    const hash = bcrypt.hashSync('password123', 12);
    await pool.query(
      `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
       VALUES ($1, $2, 'http-mcnt@test.com', $3, 'Admin', 'Admin')
       ON CONFLICT DO NOTHING`,
      [USER, TENANT, hash],
    );
    await pool.query(`INSERT INTO vendors (id, tenant_id, name) VALUES ('V-MCNT-1', $1, 'Party One')`, [TENANT]);
    await pool.query(`INSERT INTO vendors (id, tenant_id, name) VALUES ('V-MCNT-2', $1, 'Party Two')`, [TENANT]);
    await pool.query(`INSERT INTO products (id, tenant_id, name, price) VALUES ('P-MCNT-1', $1, 'USB Cable', 120)`, [
      TENANT,
    ]);
    await pool.query(`INSERT INTO customers (id, tenant_id, name) VALUES ('C-MCNT-1', $1, 'Walk-in')`, [TENANT]);
    token = createTestToken({
      userId: USER,
      tenantId: TENANT,
      email: 'http-mcnt@test.com',
      role: 'Admin',
      name: 'Admin',
    });
  });

  afterAll(async () => {
    await cleanupTestData(TENANT);
  });

  it('GET /api/masters/counts returns numbers matching saved rows', async () => {
    const res = await api().get('/api/masters/counts').set(authHeaders(token, TENANT));
    expect(res.status).toBe(200);
    expect(typeof res.body.vendorMaster).toBe('number');
    expect(typeof res.body.itemMaster).toBe('number');
    expect(typeof res.body.customerMaster).toBe('number');
    expect(res.body.vendorMaster).toBe(2);
    expect(res.body.itemMaster).toBe(1);
    expect(res.body.customerMaster).toBe(1);
  });
});
