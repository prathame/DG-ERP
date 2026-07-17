/**
 * HTTP coverage for Capacitor mobile public + auth + Super Admin endpoints.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import bcrypt from 'bcrypt';
import { pool, cleanupTestData, createTestToken, createSuperAdminToken } from '../helpers';
import { api, authHeaders } from '../http';

const TENANT = 'T-TEST-HTTP-MOBILE';
const USER = 'U-HTTP-MOBILE';
const SLUG = 'test-http-mobile';
const INVITE = 'DG-M-ABCD-EF01-2345';
let token = '';
let saToken = '';

describe('HTTP: mobile redeem / heartbeat / register-device / SA', () => {
  beforeAll(async () => {
    await cleanupTestData(TENANT);
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status,
        mobile_invite_code, mobile_invite_expires_at, mobile_min_version, mobile_latest_version)
       VALUES ($1, 'HTTP Mobile Co', $2, 'http-mobile@test.com', 'Admin', 'active',
        $3, NOW() + INTERVAL '30 days', '2.0.0', '2.2.0')
       ON CONFLICT (id) DO UPDATE SET
         mobile_invite_code = EXCLUDED.mobile_invite_code,
         mobile_invite_expires_at = EXCLUDED.mobile_invite_expires_at,
         mobile_min_version = EXCLUDED.mobile_min_version,
         mobile_latest_version = EXCLUDED.mobile_latest_version,
         status = 'active'`,
      [TENANT, SLUG, INVITE]
    );
    const hash = bcrypt.hashSync('password123', 12);
    await pool.query(
      `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
       VALUES ($1, $2, 'http-mobile@test.com', $3, 'Admin', 'Admin')
       ON CONFLICT DO NOTHING`,
      [USER, TENANT, hash]
    );
    token = createTestToken({
      userId: USER, tenantId: TENANT, email: 'http-mobile@test.com', role: 'Admin', name: 'Admin',
    });
    saToken = createSuperAdminToken();
  });

  afterAll(async () => {
    await cleanupTestData(TENANT);
  });

  it('redeem-invite returns branding without internal tenantId', async () => {
    const res = await api().post('/api/mobile/redeem-invite').send({ code: INVITE });
    expect(res.status).toBe(200);
    expect(res.body.slug).toBe(SLUG);
    expect(res.body.companyName).toBe('HTTP Mobile Co');
    expect(res.body.tenantId).toBeUndefined();
  });

  it('redeem-invite rejects unknown / empty / expired codes', async () => {
    expect((await api().post('/api/mobile/redeem-invite').send({ code: 'DG-M-DEAD-BEEF-0000' })).status).toBe(404);
    expect((await api().post('/api/mobile/redeem-invite').send({})).status).toBe(400);

    await pool.query(
      `UPDATE tenants SET mobile_invite_expires_at = NOW() - INTERVAL '1 day' WHERE id = $1`,
      [TENANT]
    );
    expect((await api().post('/api/mobile/redeem-invite').send({ code: INVITE })).status).toBe(410);
    await pool.query(
      `UPDATE tenants SET mobile_invite_expires_at = NOW() + INTERVAL '30 days' WHERE id = $1`,
      [TENANT]
    );
  });

  it('redeem-invite rejects suspended tenant', async () => {
    await pool.query(`UPDATE tenants SET status = 'suspended' WHERE id = $1`, [TENANT]);
    expect((await api().post('/api/mobile/redeem-invite').send({ code: INVITE })).status).toBe(403);
    await pool.query(`UPDATE tenants SET status = 'active' WHERE id = $1`, [TENANT]);
  });

  it('unauthenticated heartbeat by slug omits tenantStatus', async () => {
    const res = await api().post('/api/mobile/heartbeat').send({
      deviceId: 'dev_unauth_probe_01',
      platform: 'android',
      appVersion: '2.1.0',
      slug: SLUG,
    });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.tenantStatus).toBeUndefined();
    expect(res.body.forceUpdate).toBe(false);
    expect(res.body.updateAvailable).toBe(true);
  });

  it('heartbeat without slug/auth returns empty sync flags', async () => {
    const res = await api().post('/api/mobile/heartbeat').send({
      deviceId: 'dev_no_tenant_01',
      platform: 'web-mobile',
      appVersion: '2.2.0',
    });
    expect(res.status).toBe(200);
    expect(res.body.forceSyncAt).toBeNull();
    expect(res.body.updateAvailable).toBe(false);
  });

  it('heartbeat rejects short deviceId', async () => {
    const res = await api().post('/api/mobile/heartbeat').send({ deviceId: 'ab', slug: SLUG });
    expect(res.status).toBe(400);
  });

  it('authenticated heartbeat includes tenantStatus and registers device', async () => {
    const res = await api()
      .post('/api/mobile/heartbeat')
      .set(authHeaders(token, TENANT))
      .send({
        deviceId: 'dev_auth_device_01',
        platform: 'ios',
        appVersion: '1.9.0',
        slug: SLUG,
      });
    expect(res.status).toBe(200);
    expect(res.body.tenantStatus).toBe('active');
    expect(res.body.forceUpdate).toBe(true);

    const { rows } = await pool.query(
      'SELECT device_id FROM mobile_devices WHERE tenant_id = $1 AND device_id = $2',
      [TENANT, 'dev_auth_device_01']
    );
    expect(rows.length).toBe(1);
  });

  it('register-device requires auth and accepts valid deviceId', async () => {
    const unauth = await api().post('/api/mobile/register-device').send({ deviceId: 'dev_x' });
    expect(unauth.status).toBe(401);

    const bad = await api()
      .post('/api/mobile/register-device')
      .set(authHeaders(token, TENANT))
      .send({ deviceId: 'ab' });
    expect(bad.status).toBe(400);

    const ok = await api()
      .post('/api/mobile/register-device')
      .set(authHeaders(token, TENANT))
      .send({ deviceId: 'dev_register_ok_1', platform: 'android', appVersion: '2.2.0' });
    expect(ok.status).toBe(200);
    expect(ok.body.ok).toBe(true);
  });

  it('SA rotate invite / get invite / force-sync / version / devices', async () => {
    const rotated = await api()
      .post(`/api/super-admin/tenants/${TENANT}/mobile-invite`)
      .set({ Authorization: `Bearer ${saToken}` })
      .send({ daysValid: 14 });
    expect(rotated.status).toBe(200);
    expect(rotated.body.code).toMatch(/^DG-M-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/);
    expect(rotated.body.shareText).toContain('/download');

    const got = await api()
      .get(`/api/super-admin/tenants/${TENANT}/mobile-invite`)
      .set({ Authorization: `Bearer ${saToken}` });
    expect(got.status).toBe(200);
    expect(got.body.code).toBe(rotated.body.code);

    const sync = await api()
      .post(`/api/super-admin/tenants/${TENANT}/mobile-force-sync`)
      .set({ Authorization: `Bearer ${saToken}` });
    expect(sync.status).toBe(200);
    expect(sync.body.ok).toBe(true);

    const badVer = await api()
      .put(`/api/super-admin/tenants/${TENANT}/mobile-version`)
      .set({ Authorization: `Bearer ${saToken}` })
      .send({ minVersion: '<script>', latestVersion: '2.3.0' });
    expect(badVer.status).toBe(400);

    const ver = await api()
      .put(`/api/super-admin/tenants/${TENANT}/mobile-version`)
      .set({ Authorization: `Bearer ${saToken}` })
      .send({ minVersion: '2.1.0', latestVersion: '2.3.0' });
    expect(ver.status).toBe(200);
    expect(ver.body.minVersion).toBe('2.1.0');

    const devices = await api()
      .get(`/api/super-admin/tenants/${TENANT}/mobile-devices`)
      .set({ Authorization: `Bearer ${saToken}` });
    expect(devices.status).toBe(200);
    expect(Array.isArray(devices.body.devices)).toBe(true);
    expect(devices.body.devices.length).toBeGreaterThan(0);
  });

  it('SA mobile routes 404 for unknown tenant', async () => {
    const id = 'T-DOES-NOT-EXIST';
    expect((await api().post(`/api/super-admin/tenants/${id}/mobile-invite`).set({ Authorization: `Bearer ${saToken}` })).status).toBe(404);
    expect((await api().get(`/api/super-admin/tenants/${id}/mobile-invite`).set({ Authorization: `Bearer ${saToken}` })).status).toBe(404);
    expect((await api().post(`/api/super-admin/tenants/${id}/mobile-force-sync`).set({ Authorization: `Bearer ${saToken}` })).status).toBe(404);
    expect((await api().put(`/api/super-admin/tenants/${id}/mobile-version`).set({ Authorization: `Bearer ${saToken}` }).send({ minVersion: '1.0.0' })).status).toBe(404);
  });
});
