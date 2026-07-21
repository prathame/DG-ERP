import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import bcrypt from 'bcrypt';
import { api, authHeaders } from '../http';
import { pool, createTestToken, cleanupTestData } from '../helpers';

const TEST_TENANT = 'T-TEST-HTTP-AUTH';
const TEST_EMAIL = 'http-auth@test.com';
const TEST_PASSWORD = 'CorrectHorseBattery1';
const TEST_SLUG = 'http-auth-co';

describe('HTTP Auth', () => {
  beforeAll(async () => {
    await cleanupTestData(TEST_TENANT);
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status)
       VALUES ($1, 'HTTP Auth Co', $2, $3, 'Admin', 'active')
       ON CONFLICT (id) DO NOTHING`,
      [TEST_TENANT, TEST_SLUG, TEST_EMAIL],
    );
    const hash = await bcrypt.hash(TEST_PASSWORD, 12);
    await pool.query(
      `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
       VALUES ('U-HTTP-AUTH-1', $1, $2, $3, 'HTTP Auth User', 'Admin')
       ON CONFLICT DO NOTHING`,
      [TEST_TENANT, TEST_EMAIL, hash],
    );
  });

  afterAll(async () => {
    await cleanupTestData(TEST_TENANT);
  });

  it('GET /api/health reports DB status', async () => {
    const res = await api().get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.db).toBe('up');
    expect(res.headers['x-correlation-id']).toBeTruthy();
  });

  it('POST /api/auth/login succeeds with valid credentials', async () => {
    const res = await api()
      .post('/api/auth/login')
      .send({ email: TEST_EMAIL, password: TEST_PASSWORD, slug: TEST_SLUG });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.tenantId).toBe(TEST_TENANT);
  });

  it('POST /api/auth/login rejects wrong password', async () => {
    const res = await api()
      .post('/api/auth/login')
      .send({ email: TEST_EMAIL, password: 'wrong-password', slug: TEST_SLUG });
    expect(res.status).toBe(401);
  });

  it('authenticated routes require Bearer token', async () => {
    const res = await api().get('/api/products');
    expect(res.status).toBe(401);
  });

  it('authenticated routes accept valid JWT', async () => {
    // Clear any session left by prior login tests so bare test tokens still work
    await pool.query(`DELETE FROM user_sessions WHERE user_id = $1 AND tenant_id = $2`, ['U-HTTP-AUTH-1', TEST_TENANT]);
    const token = createTestToken({
      userId: 'U-HTTP-AUTH-1',
      tenantId: TEST_TENANT,
      email: TEST_EMAIL,
      role: 'Admin',
      name: 'HTTP Auth User',
    });
    const res = await api().get('/api/products').set(authHeaders(token));
    expect(res.status).toBe(200);
  });

  it('POST /api/auth/forgot-password does not enumerate users', async () => {
    const res = await api().post('/api/auth/forgot-password').send({ email: 'nobody-exists@example.com' });
    expect([200, 201]).toContain(res.status);
  });
});
