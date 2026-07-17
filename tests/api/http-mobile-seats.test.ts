/**
 * Service mobile offline seats — SA issue, activate, heartbeat entitlement.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import bcrypt from 'bcrypt';
import { pool, cleanupTestData, createTestToken, createSuperAdminToken } from '../helpers';
import { api, authHeaders } from '../http';

const SVC = 'T-TEST-HTTP-MSEAT-SVC';
const MFG = 'T-TEST-HTTP-MSEAT-MFG';
const USER = 'U-HTTP-MSEAT';
const SLUG = 'test-http-mseat-svc';
let token = '';
let saToken = '';

describe('HTTP: service mobile seats', () => {
  beforeAll(async () => {
    await cleanupTestData(SVC);
    await cleanupTestData(MFG);
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, business_type)
       VALUES ($1, 'Seat Service Co', $2, 'mseat-svc@test.com', 'Admin', 'active', 'service')
       ON CONFLICT (id) DO UPDATE SET business_type = 'service', status = 'active', slug = EXCLUDED.slug`,
      [SVC, SLUG],
    );
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, business_type)
       VALUES ($1, 'Seat Mfg Co', 'test-http-mseat-mfg', 'mseat-mfg@test.com', 'Admin', 'active', 'manufacturer')
       ON CONFLICT (id) DO UPDATE SET business_type = 'manufacturer', status = 'active'`,
      [MFG],
    );
    const hash = bcrypt.hashSync('password123', 12);
    await pool.query(
      `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
       VALUES ($1, $2, 'mseat-svc@test.com', $3, 'Admin', 'Admin')
       ON CONFLICT DO NOTHING`,
      [USER, SVC, hash],
    );
    token = createTestToken({
      userId: USER,
      tenantId: SVC,
      email: 'mseat-svc@test.com',
      role: 'Admin',
      name: 'Admin',
    });
    saToken = createSuperAdminToken();
  });

  afterAll(async () => {
    await cleanupTestData(SVC);
    await cleanupTestData(MFG);
  });

  it('rejects seat issue for non-service tenant', async () => {
    const res = await api()
      .post(`/api/super-admin/tenants/${MFG}/mobile-seats`)
      .set({ Authorization: `Bearer ${saToken}` })
      .send({});
    expect(res.status).toBe(400);
  });

  it('issues seat, activates, heartbeat reports offlineEnabled', async () => {
    const issue = await api()
      .post(`/api/super-admin/tenants/${SVC}/mobile-seats`)
      .set({ Authorization: `Bearer ${saToken}` })
      .send({});
    expect(issue.status).toBe(201);
    expect(issue.body.seatKey).toMatch(/^DG-MS-/);

    const deviceId = 'dev_seat_test_device_01';
    const act = await api().post('/api/mobile/activate-seat').send({
      seatKey: issue.body.seatKey,
      deviceId,
      platform: 'android',
      appVersion: '2.2.0',
    });
    expect(act.status).toBe(200);
    expect(act.body.offlineEnabled).toBe(true);
    expect(act.body.slug).toBe(SLUG);

    const wrong = await api().post('/api/mobile/activate-seat').send({
      seatKey: issue.body.seatKey,
      deviceId: 'dev_seat_other_device_99',
      platform: 'ios',
    });
    expect(wrong.status).toBe(403);

    const hb = await api()
      .post('/api/mobile/heartbeat')
      .set(authHeaders(token, SVC))
      .send({ deviceId, platform: 'android', appVersion: '2.2.0', slug: SLUG });
    expect(hb.status).toBe(200);
    expect(hb.body.businessType).toBe('service');
    expect(hb.body.seatValid).toBe(true);
    expect(hb.body.offlineEnabled).toBe(true);

    const list = await api()
      .get(`/api/super-admin/tenants/${SVC}/mobile-seats`)
      .set({ Authorization: `Bearer ${saToken}` });
    expect(list.status).toBe(200);
    expect(list.body.seats.some((s: { seatKey: string }) => s.seatKey === issue.body.seatKey)).toBe(true);
  });

  it('suspend blocks offline entitlement', async () => {
    const issue = await api()
      .post(`/api/super-admin/tenants/${SVC}/mobile-seats`)
      .set({ Authorization: `Bearer ${saToken}` })
      .send({});
    const deviceId = 'dev_seat_suspend_01';
    await api().post('/api/mobile/activate-seat').send({
      seatKey: issue.body.seatKey,
      deviceId,
      platform: 'android',
    });

    const seats = (
      await api()
        .get(`/api/super-admin/tenants/${SVC}/mobile-seats`)
        .set({ Authorization: `Bearer ${saToken}` })
    ).body.seats as { id: string; seatKey: string }[];
    const seat = seats.find(s => s.seatKey === issue.body.seatKey)!;

    const sus = await api()
      .put(`/api/super-admin/tenants/${SVC}/mobile-seats/${seat.id}`)
      .set({ Authorization: `Bearer ${saToken}` })
      .send({ status: 'suspended' });
    expect(sus.status).toBe(200);

    const hb = await api()
      .post('/api/mobile/heartbeat')
      .set(authHeaders(token, SVC))
      .send({ deviceId, platform: 'android', appVersion: '2.2.0' });
    expect(hb.body.seatValid).toBe(false);
    expect(hb.body.offlineEnabled).toBe(false);
  });

  it('transfer clears device binding', async () => {
    const issue = await api()
      .post(`/api/super-admin/tenants/${SVC}/mobile-seats`)
      .set({ Authorization: `Bearer ${saToken}` })
      .send({});
    const deviceId = 'dev_seat_xfer_01';
    await api().post('/api/mobile/activate-seat').send({
      seatKey: issue.body.seatKey,
      deviceId,
      platform: 'ios',
    });
    const seats = (
      await api()
        .get(`/api/super-admin/tenants/${SVC}/mobile-seats`)
        .set({ Authorization: `Bearer ${saToken}` })
    ).body.seats as { id: string; seatKey: string }[];
    const seat = seats.find(s => s.seatKey === issue.body.seatKey)!;

    const xfer = await api()
      .put(`/api/super-admin/tenants/${SVC}/mobile-seats/${seat.id}`)
      .set({ Authorization: `Bearer ${saToken}` })
      .send({ clearDevice: true });
    expect(xfer.status).toBe(200);
    expect(xfer.body.seat.deviceId).toBeNull();

    const act2 = await api().post('/api/mobile/activate-seat').send({
      seatKey: issue.body.seatKey,
      deviceId: 'dev_seat_xfer_02',
      platform: 'android',
    });
    expect(act2.status).toBe(200);
  });
});
