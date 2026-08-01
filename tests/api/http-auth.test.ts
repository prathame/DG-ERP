import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import bcrypt from 'bcrypt';
import { api, authHeaders } from '../http';
import { pool, createTestToken, createSuperAdminToken, cleanupTestData } from '../helpers';

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
      .send({ email: TEST_EMAIL, password: TEST_PASSWORD, slug: TEST_SLUG, platform: 'desktop' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.tenantId).toBe(TEST_TENANT);
  });

  it('POST /api/auth/login allows browser / web clients (PWA / Safari)', async () => {
    const res = await api()
      .post('/api/auth/login')
      .send({ email: TEST_EMAIL, password: TEST_PASSWORD, slug: TEST_SLUG, platform: 'web' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
  });

  it('POST /api/auth/login rejects unknown platform', async () => {
    const res = await api()
      .post('/api/auth/login')
      .send({ email: TEST_EMAIL, password: TEST_PASSWORD, slug: TEST_SLUG, platform: 'toaster' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('APP_ONLY');
  });

  it('POST /api/auth/login rejects wrong password', async () => {
    const res = await api()
      .post('/api/auth/login')
      .send({ email: TEST_EMAIL, password: 'wrong-password', slug: TEST_SLUG, platform: 'desktop' });
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

  it('soft-deleted users cannot use password reset or authenticated APIs', async () => {
    const deletedId = 'U-HTTP-AUTH-DEL';
    const deletedEmail = `deleted-${deletedId.toLowerCase()}@invalid.local`;
    const hash = await bcrypt.hash('DeletedUserPass1!', 12);
    await pool.query(`DELETE FROM users WHERE id = $1 AND tenant_id = $2`, [deletedId, TEST_TENANT]);
    await pool.query(
      `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
       VALUES ($1, $2, $3, $4, 'Deleted User', 'Staff')`,
      [deletedId, TEST_TENANT, deletedEmail, hash],
    );

    const forgot = await api().post('/api/auth/forgot-password').send({ email: deletedEmail, slug: TEST_SLUG });
    expect([200, 201]).toContain(forgot.status);
    const tokens = await pool.query(
      `SELECT id FROM password_reset_tokens WHERE LOWER(email) = LOWER($1) AND tenant_id = $2 AND used = false`,
      [deletedEmail, TEST_TENANT],
    );
    expect(tokens.rows.length).toBe(0);

    await pool.query(
      `INSERT INTO password_reset_tokens (id, email, tenant_id, token, expires_at)
       VALUES ('PRT-DEL-TEST', $1, $2, 'del-reset-token-xyz', NOW() + INTERVAL '5 minutes')`,
      [deletedEmail, TEST_TENANT],
    );
    const reset = await api()
      .post('/api/auth/reset-password')
      .send({ token: 'del-reset-token-xyz', newPassword: 'BrandNewPass99!' });
    expect(reset.status).toBe(400);

    const stillDeleted = await pool.query(`SELECT email FROM users WHERE id = $1 AND tenant_id = $2`, [
      deletedId,
      TEST_TENANT,
    ]);
    expect(stillDeleted.rows[0]?.email).toBe(deletedEmail);

    await pool.query(`DELETE FROM user_sessions WHERE user_id = $1 AND tenant_id = $2`, [deletedId, TEST_TENANT]);
    const token = createTestToken({
      userId: deletedId,
      tenantId: TEST_TENANT,
      email: deletedEmail,
      role: 'Staff',
      name: 'Deleted User',
    });
    const apiRes = await api().get('/api/products').set(authHeaders(token));
    expect(apiRes.status).toBe(401);
  });

  it('SA impersonate skips soft-deleted admins', async () => {
    const tid = 'T-HTTP-AUTH-IMP';
    const deadAdmin = 'U-HTTP-AUTH-IMP-DEAD';
    const liveAdmin = 'U-HTTP-AUTH-IMP-LIVE';
    await cleanupTestData(tid);
    const hash = await bcrypt.hash(TEST_PASSWORD, 12);
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status)
       VALUES ($1, 'Impersonate Co', 'http-auth-imp', 'live@imp.test', 'Live Admin', 'active')`,
      [tid],
    );
    await pool.query(
      `INSERT INTO users (id, tenant_id, email, password_hash, name, role, created_at)
       VALUES
         ($1, $2, $3, $4, 'Deleted User', 'Admin', NOW() - INTERVAL '2 days'),
         ($5, $2, 'live@imp.test', $4, 'Live Admin', 'Admin', NOW() - INTERVAL '1 day')`,
      [deadAdmin, tid, `deleted-${deadAdmin.toLowerCase()}@invalid.local`, hash, liveAdmin],
    );

    const res = await api()
      .post(`/api/super-admin/tenants/${tid}/impersonate`)
      .set({ Authorization: `Bearer ${createSuperAdminToken()}` });
    expect(res.status).toBe(200);
    expect(res.body.user?.id).toBe(liveAdmin);
    expect(res.body.user?.email).toBe('live@imp.test');
  });
});
