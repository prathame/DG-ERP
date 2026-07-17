/**
 * HTTP coverage for quiet notification center + SA pushes.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import bcrypt from 'bcrypt';
import { pool, cleanupTestData, createTestToken, createSuperAdminToken } from '../helpers';
import { api, authHeaders } from '../http';
import { uid } from '../../server/utils/helpers';

const TENANT = 'T-TEST-HTTP-NOTIF';
const USER = 'U-HTTP-NOTIF';
let token = '';
let saToken = '';

describe('HTTP: notifications feed + SA notify', () => {
  beforeAll(async () => {
    await cleanupTestData(TENANT);
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status)
       VALUES ($1, 'HTTP Notif Co', 'http-notif-co', 'http-notif@test.com', 'Admin', 'active')
       ON CONFLICT (id) DO NOTHING`,
      [TENANT],
    );
    const hash = bcrypt.hashSync('password123', 12);
    await pool.query(
      `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
       VALUES ($1, $2, 'http-notif@test.com', $3, 'Admin', 'Admin')
       ON CONFLICT DO NOTHING`,
      [USER, TENANT, hash],
    );
    token = createTestToken({
      userId: USER,
      tenantId: TENANT,
      email: 'http-notif@test.com',
      role: 'Admin',
      name: 'Admin',
    });
    saToken = createSuperAdminToken();
  });

  afterAll(async () => {
    await cleanupTestData(TENANT);
  });

  it('returns feed shape', async () => {
    const res = await api().get('/api/notifications').set(authHeaders(token, TENANT));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.generatedAt).toBeTruthy();
  });

  it('SA notify appears in feed and can be marked read', async () => {
    const notify = await api()
      .post(`/api/super-admin/tenants/${TENANT}/notify`)
      .set({ Authorization: `Bearer ${saToken}` })
      .send({ title: 'SA Ping', message: 'Hello tenant', type: 'warning' });
    expect(notify.status).toBe(200);
    expect(notify.body.id).toBeTruthy();

    const feed = await api().get('/api/notifications').set(authHeaders(token, TENANT));
    expect(feed.status).toBe(200);
    const admin = (feed.body.items as { id: string; kind: string; title: string; read?: boolean }[]).find(
      i => i.id === notify.body.id,
    );
    expect(admin?.kind).toBe('admin_message');
    expect(admin?.title).toBe('SA Ping');
    expect(admin?.read).toBe(false);

    const read = await api().post(`/api/notifications/${notify.body.id}/read`).set(authHeaders(token, TENANT));
    expect(read.status).toBe(200);

    const feed2 = await api().get('/api/notifications').set(authHeaders(token, TENANT));
    const admin2 = (feed2.body.items as { id: string; read?: boolean }[]).find(i => i.id === notify.body.id);
    expect(admin2?.read).toBe(true);
  });

  it('read-all marks SA messages read', async () => {
    const id = uid('TN');
    await pool.query(
      `INSERT INTO tenant_notifications (id, tenant_id, title, body, type, source, expires_at)
       VALUES ($1,$2,'Bulk','Msg','info','super_admin', NOW() + INTERVAL '30 days')`,
      [id, TENANT],
    );
    const res = await api().post('/api/notifications/read-all').set(authHeaders(token, TENANT));
    expect(res.status).toBe(200);
    const row = (
      await pool.query('SELECT read_at FROM tenant_notifications WHERE id = $1 AND tenant_id = $2', [id, TENANT])
    ).rows[0];
    expect(row?.read_at).toBeTruthy();
  });
});
