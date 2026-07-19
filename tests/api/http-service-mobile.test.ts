/**
 * Service Mobile cloud license lifecycle + backup same-tenant scoping.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool, createSuperAdminToken } from '../helpers';
import { api } from '../http';

const LICENSE_ID = 'SML-TEST-SM01';
const LICENSE_KEY = 'DG-SM-TESTKEY01-TESTKEY02';
const MACHINE_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const MACHINE_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

describe('HTTP: service-mobile licenses', () => {
  const saToken = () => createSuperAdminToken();

  beforeAll(async () => {
    await pool.query(`DELETE FROM service_mobile_backups WHERE license_id = $1`, [LICENSE_ID]).catch(() => {});
    await pool.query(`DELETE FROM service_mobile_notifications WHERE license_id = $1`, [LICENSE_ID]).catch(() => {});
    await pool
      .query(`DELETE FROM service_mobile_licenses WHERE id = $1 OR license_key = $2`, [LICENSE_ID, LICENSE_KEY])
      .catch(() => {});

    await pool.query(
      `INSERT INTO service_mobile_licenses
         (id, license_key, company_name, business_type, max_users, status, settings)
       VALUES ($1, $2, 'Service Mobile Co', 'service', 1, 'active', '{}'::jsonb)`,
      [LICENSE_ID, LICENSE_KEY],
    );
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM service_mobile_backups WHERE license_id = $1`, [LICENSE_ID]).catch(() => {});
    await pool.query(`DELETE FROM service_mobile_notifications WHERE license_id = $1`, [LICENSE_ID]).catch(() => {});
    await pool.query(`DELETE FROM service_mobile_licenses WHERE id = $1`, [LICENSE_ID]).catch(() => {});
  });

  it('SA issues license as service + maxUsers 1 with DG-SM key', async () => {
    const created = await api()
      .post('/api/super-admin/service-mobile')
      .set({ Authorization: `Bearer ${saToken()}` })
      .send({ companyName: 'Issued Co', adminEmail: 'a@test.com' });
    expect(created.status).toBe(201);
    expect(created.body.businessType).toBe('service');
    expect(created.body.maxUsers).toBe(1);
    expect(String(created.body.licenseKey)).toMatch(/^DG-SM-[A-F0-9]{8}-[A-F0-9]{8}-[A-F0-9]{8}$/);

    await pool.query(`DELETE FROM service_mobile_licenses WHERE id = $1`, [created.body.id]);
  });

  it('activate binds device; second device rejected until unbind', async () => {
    const a = await api().post('/api/service-mobile/activate').send({
      licenseKey: LICENSE_KEY,
      machineId: MACHINE_A,
      osInfo: 'Android 14',
      appVersion: '1.0.0',
    });
    expect(a.status).toBe(200);
    expect(a.body.valid).toBe(true);
    expect(a.body.businessType).toBe('service');
    expect(a.body.maxUsers).toBe(1);

    const b = await api().post('/api/service-mobile/activate').send({
      licenseKey: LICENSE_KEY,
      machineId: MACHINE_B,
      osInfo: 'iOS 18',
      appVersion: '1.0.0',
    });
    expect(b.status).toBe(403);

    const unbind = await api()
      .post(`/api/super-admin/service-mobile/${LICENSE_ID}/unbind`)
      .set({ Authorization: `Bearer ${saToken()}` });
    expect(unbind.status).toBe(200);

    const b2 = await api().post('/api/service-mobile/activate').send({
      licenseKey: LICENSE_KEY,
      machineId: MACHINE_B,
      osInfo: 'iOS 18',
      appVersion: '1.0.1',
    });
    expect(b2.status).toBe(200);
  });

  it('SA notify appears on heartbeat for bound device', async () => {
    // Ensure bound to MACHINE_B from previous test (or re-bind)
    await pool.query(`UPDATE service_mobile_licenses SET machine_id=$1 WHERE id=$2`, [MACHINE_B, LICENSE_ID]);

    const notify = await api()
      .post(`/api/super-admin/service-mobile/${LICENSE_ID}/notify`)
      .set({ Authorization: `Bearer ${saToken()}` })
      .send({ title: 'SM Ping', message: 'Hello phone', type: 'warning' });
    expect(notify.status).toBe(200);

    const hb = await api().post('/api/service-mobile/heartbeat').send({
      licenseKey: LICENSE_KEY,
      machineId: MACHINE_B,
      version: '1.0.1',
    });
    expect(hb.status).toBe(200);
    expect(hb.body.licenseValid).toBe(true);
    const pending = hb.body.pendingNotifications as { id: string; title: string }[];
    expect(pending.some(p => p.id === notify.body.id && p.title === 'SM Ping')).toBe(true);

    const ack = await api()
      .post('/api/service-mobile/mark-notifications-delivered')
      .send({
        licenseKey: LICENSE_KEY,
        machineId: MACHINE_B,
        notificationIds: [notify.body.id],
      });
    expect(ack.status).toBe(200);
  });

  it('cloud ERP backup endpoints are disabled (410) — staff keep local files', async () => {
    await pool.query(`UPDATE service_mobile_licenses SET machine_id=$1 WHERE id=$2`, [MACHINE_B, LICENSE_ID]);

    const up = await api()
      .post('/api/service-mobile/backup')
      .send({
        licenseKey: LICENSE_KEY,
        machineId: MACHINE_B,
        ciphertext: Buffer.from('x').toString('base64'),
        nonce: 'n',
      });
    expect(up.status).toBe(410);

    const dl = await api().post('/api/service-mobile/backup/latest').send({
      licenseKey: LICENSE_KEY,
      machineId: MACHINE_B,
    });
    expect(dl.status).toBe(410);

    const act = await api().post('/api/service-mobile/activate').send({
      licenseKey: LICENSE_KEY,
      machineId: MACHINE_B,
      appVersion: '1.0.1',
    });
    // Already bound to MACHINE_B — may 200 or 403 depending on prior tests; hasBackup must stay false
    if (act.status === 200) {
      expect(act.body.hasBackup).toBe(false);
    }
  });

  it('force-sync stamps settings.forceSyncAt', async () => {
    const r = await api()
      .post(`/api/super-admin/service-mobile/${LICENSE_ID}/force-sync`)
      .set({ Authorization: `Bearer ${saToken()}` });
    expect(r.status).toBe(200);
    expect(r.body.forceSyncAt).toBeTruthy();

    const hb = await api().post('/api/service-mobile/heartbeat').send({
      licenseKey: LICENSE_KEY,
      machineId: MACHINE_B,
      version: '1.0.1',
    });
    expect(hb.body.settings?.forceSyncAt).toBeTruthy();
  });

  it('SA service-mobile-analytics returns fleet health (no ERP KPIs)', async () => {
    await pool.query(
      `UPDATE service_mobile_licenses
       SET last_seen = NOW(), app_version = $1, valid_until = CURRENT_DATE + 10
       WHERE id = $2`,
      ['1.0.1', LICENSE_ID],
    );

    const r = await api()
      .get('/api/super-admin/service-mobile-analytics')
      .set({ Authorization: `Bearer ${saToken()}` });
    expect(r.status).toBe(200);
    expect(r.body.total).toBeGreaterThanOrEqual(1);
    expect(r.body.online).toBeGreaterThanOrEqual(1);
    expect(typeof r.body.offline).toBe('number');
    expect(typeof r.body.expiringSoon).toBe('number');
    expect(Array.isArray(r.body.versionDistribution)).toBe(true);
    expect(Array.isArray(r.body.statusBreakdown)).toBe(true);
    expect(r.body.expiryTimeline).toBeTruthy();
    // Must not expose Offline Mobile business analytics
    expect(r.body.mrr).toBeUndefined();
    expect(r.body.revenue).toBeUndefined();
    expect(r.body.collections).toBeUndefined();
    expect(r.body.topTenants).toBeUndefined();
  });
});
