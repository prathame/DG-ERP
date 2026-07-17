/**
 * Cloud queue + local apply path for on-prem Bell notifications.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool, cleanupTestData, createSuperAdminToken } from '../helpers';
import { api } from '../http';
import { uid } from '../../server/utils/helpers';

const TENANT = 'T-TEST-ONPREM-NOTIF';
const LICENSE_ID = 'OPL-TEST-NOTIF';
const LICENSE_KEY = 'DG-TESTNOTIF01-TESTNOTIF02-TESTNOTIF03';

describe('HTTP: on-prem SA notifications via heartbeat', () => {
  const saToken = () => createSuperAdminToken();

  beforeAll(async () => {
    await cleanupTestData(TENANT);
    await pool.query(`DELETE FROM onprem_notifications WHERE license_id = $1`, [LICENSE_ID]).catch(() => {});
    await pool.query(`DELETE FROM onprem_licenses WHERE id = $1`, [LICENSE_ID]).catch(() => {});

    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, business_type)
       VALUES ($1, 'Onprem Notif Co', 'onprem-notif-co', 'onprem-notif@test.com', 'Admin', 'active', 'manufacturer')
       ON CONFLICT (id) DO NOTHING`,
      [TENANT],
    );
    await pool.query(
      `INSERT INTO onprem_licenses (id, license_key, company_name, business_type, status, machine_id, settings)
       VALUES ($1, $2, 'Onprem Notif Co', 'manufacturer', 'active', 'machine-test-notif', '{}'::jsonb)`,
      [LICENSE_ID, LICENSE_KEY],
    );
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM onprem_notifications WHERE license_id = $1`, [LICENSE_ID]).catch(() => {});
    await pool.query(`DELETE FROM onprem_licenses WHERE id = $1`, [LICENSE_ID]).catch(() => {});
    await cleanupTestData(TENANT);
  });

  it('SA notify queues and heartbeat returns pending', async () => {
    const notify = await api()
      .post(`/api/super-admin/onprem/${LICENSE_ID}/notify`)
      .set({ Authorization: `Bearer ${saToken()}` })
      .send({ title: 'Onprem Ping', message: 'Hello desktop', type: 'warning' });
    expect(notify.status).toBe(200);
    expect(notify.body.id).toBeTruthy();

    const hb = await api().post('/api/onprem/heartbeat').send({
      licenseKey: LICENSE_KEY,
      machineId: 'machine-test-notif',
      version: '9.9.9',
    });
    expect(hb.status).toBe(200);
    expect(hb.body.licenseValid).toBe(true);
    const pending = hb.body.pendingNotifications as { id: string; title: string }[];
    expect(Array.isArray(pending)).toBe(true);
    expect(pending.some(p => p.id === notify.body.id && p.title === 'Onprem Ping')).toBe(true);
  });

  it('local apply + mark delivered clears pending', async () => {
    const notifId = uid('OPN');
    await pool.query(
      `INSERT INTO onprem_notifications (id, license_id, title, body, type, source, expires_at)
       VALUES ($1,$2,'Apply Me','Body','info','super_admin', NOW() + INTERVAL '30 days')`,
      [notifId, LICENSE_ID],
    );

    // Localhost-only apply (supertest hits 127.0.0.1). Uses first non-OWNER tenant.
    const apply = await api()
      .post('/api/onprem/apply-notifications')
      .send({
        licenseKey: LICENSE_KEY,
        notifications: [
          {
            id: notifId,
            title: 'Apply Me',
            body: 'Body',
            type: 'info',
            source: 'super_admin',
          },
        ],
      });
    expect(apply.status).toBe(200);
    expect(apply.body.ok).toBe(true);
    expect(apply.body.ids).toContain(notifId);

    const mark = await api()
      .post('/api/onprem/mark-notifications-delivered')
      .send({
        licenseKey: LICENSE_KEY,
        machineId: 'machine-test-notif',
        ids: [notifId],
      });
    expect(mark.status).toBe(200);
    expect(mark.body.marked).toBeGreaterThanOrEqual(1);

    const hb = await api().post('/api/onprem/heartbeat').send({
      licenseKey: LICENSE_KEY,
      machineId: 'machine-test-notif',
    });
    const pending = (hb.body.pendingNotifications as { id: string }[]) || [];
    expect(pending.some(p => p.id === notifId)).toBe(false);
  });

  it('broadcast also queues for active on-prem licenses', async () => {
    const res = await api()
      .post('/api/super-admin/notifications/broadcast')
      .set({ Authorization: `Bearer ${saToken()}` })
      .send({ title: 'Blast Onprem', message: 'All devices', type: 'info' });
    expect(res.status).toBe(200);
    expect(res.body.onpremSent).toBeGreaterThanOrEqual(1);

    const row = (
      await pool.query(
        `SELECT id FROM onprem_notifications
         WHERE license_id = $1 AND title = 'Blast Onprem' AND delivered_at IS NULL
         ORDER BY created_at DESC LIMIT 1`,
        [LICENSE_ID],
      )
    ).rows[0];
    expect(row).toBeTruthy();
  });

  it('wrong machineId gets no pending and mark-delivered 403', async () => {
    const notifId = uid('OPN');
    await pool.query(
      `INSERT INTO onprem_notifications (id, license_id, title, body, type, source, expires_at)
       VALUES ($1,$2,'Machine Gate','Body','info','super_admin', NOW() + INTERVAL '30 days')`,
      [notifId, LICENSE_ID],
    );

    const hb = await api().post('/api/onprem/heartbeat').send({
      licenseKey: LICENSE_KEY,
      machineId: 'wrong-machine',
    });
    expect(hb.status).toBe(200);
    expect(hb.body.licenseValid).toBe(false);
    expect(hb.body.pendingNotifications || []).toEqual([]);

    const mark = await api()
      .post('/api/onprem/mark-notifications-delivered')
      .send({
        licenseKey: LICENSE_KEY,
        machineId: 'wrong-machine',
        ids: [notifId],
      });
    expect(mark.status).toBe(403);

    const markMissing = await api()
      .post('/api/onprem/mark-notifications-delivered')
      .send({
        licenseKey: LICENSE_KEY,
        ids: [notifId],
      });
    expect(markMissing.status).toBe(403);
  });

  it('expired on-prem notifications are not returned', async () => {
    const notifId = uid('OPN');
    await pool.query(
      `INSERT INTO onprem_notifications (id, license_id, title, body, type, source, expires_at)
       VALUES ($1,$2,'Expired','Body','info','super_admin', NOW() - INTERVAL '1 day')`,
      [notifId, LICENSE_ID],
    );
    const hb = await api().post('/api/onprem/heartbeat').send({
      licenseKey: LICENSE_KEY,
      machineId: 'machine-test-notif',
    });
    const pending = (hb.body.pendingNotifications as { id: string }[]) || [];
    expect(pending.some(p => p.id === notifId)).toBe(false);
  });

  it('idempotent re-apply still returns ids for ack', async () => {
    const notifId = uid('OPN');
    const payload = {
      licenseKey: LICENSE_KEY,
      notifications: [{ id: notifId, title: 'Idem', body: 'Body', type: 'info' }],
    };
    const first = await api().post('/api/onprem/apply-notifications').send(payload);
    expect(first.status).toBe(200);
    expect(first.body.inserted).toBeGreaterThanOrEqual(1);

    const second = await api().post('/api/onprem/apply-notifications').send(payload);
    expect(second.status).toBe(200);
    expect(second.body.ids).toContain(notifId);
    expect(second.body.inserted).toBe(0);
  });
});
