import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { api, authHeaders } from '../http';
import { pool, cleanupTestData } from '../helpers';
import { clearAuthCache } from '../../server/utils/authCache';

const TEST_TENANT = 'T-TEST-SINGLE-SESS';
const TEST_EMAIL = 'single-sess@test.com';
const TEST_PASSWORD = 'CorrectHorseBattery1';
const TEST_SLUG = 'single-sess-co';

describe('Single-device session', () => {
  beforeAll(async () => {
    await cleanupTestData(TEST_TENANT);
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status)
       VALUES ($1, 'Single Sess Co', $2, $3, 'Admin', 'active')
       ON CONFLICT (id) DO NOTHING`,
      [TEST_TENANT, TEST_SLUG, TEST_EMAIL],
    );
    const hash = await bcrypt.hash(TEST_PASSWORD, 12);
    await pool.query(
      `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
       VALUES ('U-SINGLE-SESS-1', $1, $2, $3, 'Single Sess User', 'Admin')
       ON CONFLICT DO NOTHING`,
      [TEST_TENANT, TEST_EMAIL, hash],
    );
  });

  afterAll(async () => {
    await cleanupTestData(TEST_TENANT);
  });

  it('login embeds sessionId and stores user_sessions row', async () => {
    const res = await api()
      .post('/api/auth/login')
      .send({
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
        slug: TEST_SLUG,
        deviceId: 'a'.repeat(32),
        platform: 'desktop',
      });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();

    const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET!) as { sessionId?: string };
    expect(decoded.sessionId).toBeTruthy();

    const row = (
      await pool.query(`SELECT session_id, platform FROM user_sessions WHERE user_id = $1 AND tenant_id = $2`, [
        'U-SINGLE-SESS-1',
        TEST_TENANT,
      ])
    ).rows[0];
    expect(row.session_id).toBe(decoded.sessionId);
    expect(row.platform).toBe('desktop');
  });

  it('second login kicks the first device token', async () => {
    const first = await api()
      .post('/api/auth/login')
      .send({ email: TEST_EMAIL, password: TEST_PASSWORD, slug: TEST_SLUG, platform: 'desktop' });
    expect(first.status).toBe(200);
    const tokenA = first.body.token as string;

    const second = await api()
      .post('/api/auth/login')
      .send({ email: TEST_EMAIL, password: TEST_PASSWORD, slug: TEST_SLUG, platform: 'mobile' });
    expect(second.status).toBe(200);
    const tokenB = second.body.token as string;

    const kicked = await api().get('/api/products').set(authHeaders(tokenA));
    expect(kicked.status).toBe(401);
    expect(kicked.body.code).toBe('SESSION_REPLACED');

    const ok = await api().get('/api/products').set(authHeaders(tokenB));
    expect(ok.status).toBe(200);
  });

  it('heartbeat fails after session is replaced', async () => {
    const first = await api()
      .post('/api/auth/login')
      .send({ email: TEST_EMAIL, password: TEST_PASSWORD, slug: TEST_SLUG, platform: 'desktop' });
    const tokenA = first.body.token as string;

    await api()
      .post('/api/auth/login')
      .send({ email: TEST_EMAIL, password: TEST_PASSWORD, slug: TEST_SLUG, platform: 'mobile' });

    const hb = await api().post('/api/auth/session/heartbeat').set(authHeaders(tokenA)).send({});
    expect(hb.status).toBe(401);
    expect(hb.body.code).toBe('SESSION_REPLACED');
  });

  it('heartbeat is a no-op for legacy tokens without sessionId', async () => {
    await pool.query(`DELETE FROM user_sessions WHERE user_id = $1 AND tenant_id = $2`, [
      'U-SINGLE-SESS-1',
      TEST_TENANT,
    ]);
    clearAuthCache(); // avoid same-second iat cache hit with a prior login's active_session_id
    const legacy = jwt.sign(
      {
        userId: 'U-SINGLE-SESS-1',
        tenantId: TEST_TENANT,
        email: TEST_EMAIL,
        role: 'Admin',
        name: 'Single Sess User',
      },
      process.env.JWT_SECRET!,
      { expiresIn: '1h', algorithm: 'HS256' },
    );
    const hb = await api().post('/api/auth/session/heartbeat').set(authHeaders(legacy)).send({});
    expect(hb.status).toBe(200);
    expect(hb.body.legacy).toBe(true);
  });

  it('logout clears session so old token cannot be reused', async () => {
    const login = await api()
      .post('/api/auth/login')
      .send({ email: TEST_EMAIL, password: TEST_PASSWORD, slug: TEST_SLUG, platform: 'desktop' });
    const token = login.body.token as string;

    const out = await api().post('/api/auth/logout').set(authHeaders(token)).send({});
    expect(out.status).toBe(200);

    const rows = await pool.query(`SELECT 1 FROM user_sessions WHERE user_id = $1 AND tenant_id = $2`, [
      'U-SINGLE-SESS-1',
      TEST_TENANT,
    ]);
    expect(rows.rows.length).toBe(0);

    const stale = await api().get('/api/products').set(authHeaders(token));
    expect(stale.status).toBe(401);
    expect(stale.body.code).toBe('SESSION_REPLACED');
  });
});
