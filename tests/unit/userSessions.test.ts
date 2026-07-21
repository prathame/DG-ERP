import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import bcrypt from 'bcrypt';
import { pool, cleanupTestData } from '../helpers';
import {
  clearSuperAdminSession,
  clearUserSession,
  getSuperAdminSessionId,
  replaceSuperAdminSession,
  replaceUserSession,
  touchUserSession,
} from '../../server/utils/userSessions';

const TEST_TENANT = 'T-TEST-USER-SESS';
const SA_ID = 'SA-USER-SESS-TEST';

describe('userSessions helpers', () => {
  beforeAll(async () => {
    await cleanupTestData(TEST_TENANT);
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status)
       VALUES ($1, 'User Sess Co', 'user-sess-co', 'us@test.com', 'Admin', 'active')
       ON CONFLICT (id) DO NOTHING`,
      [TEST_TENANT],
    );
    const hash = await bcrypt.hash('password123', 12);
    await pool.query(
      `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
       VALUES ('U-USER-SESS-1', $1, 'us@test.com', $2, 'Sess User', 'Admin')
       ON CONFLICT DO NOTHING`,
      [TEST_TENANT, hash],
    );
    const saHash = await bcrypt.hash('sapassword1', 12);
    await pool.query(
      `INSERT INTO super_admins (id, email, name, password_hash, role)
       VALUES ($1, 'sa-sess@test.com', 'SA Sess', $2, 'super_admin')
       ON CONFLICT (id) DO NOTHING`,
      [SA_ID, saHash],
    );
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM super_admin_sessions WHERE user_id = $1`, [SA_ID]).catch(() => {});
    await pool.query(`DELETE FROM super_admins WHERE id = $1`, [SA_ID]).catch(() => {});
    await cleanupTestData(TEST_TENANT);
  });

  it('replace + touch + clear (by sessionId and full clear)', async () => {
    const sid = await replaceUserSession({
      userId: 'U-USER-SESS-1',
      tenantId: TEST_TENANT,
      deviceId: 'b'.repeat(32),
      platform: 'desktop',
      userAgent: 'test-agent',
    });
    expect(sid).toBeTruthy();

    expect(await touchUserSession('U-USER-SESS-1', TEST_TENANT, sid)).toBe(true);
    expect(await touchUserSession('U-USER-SESS-1', TEST_TENANT, 'wrong-session')).toBe(false);

    await clearUserSession('U-USER-SESS-1', TEST_TENANT, sid);
    const gone = await pool.query(`SELECT 1 FROM user_sessions WHERE user_id = $1 AND tenant_id = $2`, [
      'U-USER-SESS-1',
      TEST_TENANT,
    ]);
    expect(gone.rows.length).toBe(0);

    await replaceUserSession({ userId: 'U-USER-SESS-1', tenantId: TEST_TENANT, platform: 'mobile' });
    await clearUserSession('U-USER-SESS-1', TEST_TENANT); // clear without sessionId
    const gone2 = await pool.query(`SELECT 1 FROM user_sessions WHERE user_id = $1 AND tenant_id = $2`, [
      'U-USER-SESS-1',
      TEST_TENANT,
    ]);
    expect(gone2.rows.length).toBe(0);
  });

  it('super-admin session replace / get / clear', async () => {
    const sid = await replaceSuperAdminSession({
      userId: SA_ID,
      deviceId: 'c'.repeat(32),
      platform: 'web',
      userAgent: 'sa-agent',
    });
    expect(await getSuperAdminSessionId(SA_ID)).toBe(sid);

    const sid2 = await replaceSuperAdminSession({ userId: SA_ID, platform: 'desktop' });
    expect(await getSuperAdminSessionId(SA_ID)).toBe(sid2);

    await clearSuperAdminSession(SA_ID, sid2);
    expect(await getSuperAdminSessionId(SA_ID)).toBeNull();

    await replaceSuperAdminSession({ userId: SA_ID, platform: 'mobile' });
    await clearSuperAdminSession(SA_ID); // clear without sessionId
    expect(await getSuperAdminSessionId(SA_ID)).toBeNull();
  });
});
