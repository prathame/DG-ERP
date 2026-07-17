/**
 * Service mobile offline seats — SA issue, activate, heartbeat entitlement.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import bcrypt from 'bcrypt';
import { pool, cleanupTestData, createTestToken, createSuperAdminToken } from '../helpers';
import { api, authHeaders } from '../http';

const SVC = 'T-TEST-HTTP-MSEAT-SVC';
const SVC2 = 'T-TEST-HTTP-MSEAT-SVC2';
const MFG = 'T-TEST-HTTP-MSEAT-MFG';
const USER = 'U-HTTP-MSEAT';
const USER_MFG = 'U-HTTP-MSEAT-MFG';
const SLUG = 'test-http-mseat-svc';
const SLUG2 = 'test-http-mseat-svc2';
let token = '';
let mfgToken = '';
let saToken = '';

describe('HTTP: service mobile seats', () => {
  beforeAll(async () => {
    await cleanupTestData(SVC);
    await cleanupTestData(SVC2);
    await cleanupTestData(MFG);
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, business_type)
       VALUES ($1, 'Seat Service Co', $2, 'mseat-svc@test.com', 'Admin', 'active', 'service')
       ON CONFLICT (id) DO UPDATE SET business_type = 'service', status = 'active', slug = EXCLUDED.slug`,
      [SVC, SLUG],
    );
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, business_type)
       VALUES ($1, 'Seat Service Co 2', $2, 'mseat-svc2@test.com', 'Admin', 'active', 'service')
       ON CONFLICT (id) DO UPDATE SET business_type = 'service', status = 'active', slug = EXCLUDED.slug`,
      [SVC2, SLUG2],
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
    await pool.query(
      `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
       VALUES ($1, $2, 'mseat-mfg@test.com', $3, 'Admin', 'Admin')
       ON CONFLICT DO NOTHING`,
      [USER_MFG, MFG, hash],
    );
    token = createTestToken({
      userId: USER,
      tenantId: SVC,
      email: 'mseat-svc@test.com',
      role: 'Admin',
      name: 'Admin',
    });
    mfgToken = createTestToken({
      userId: USER_MFG,
      tenantId: MFG,
      email: 'mseat-mfg@test.com',
      role: 'Admin',
      name: 'Admin',
    });
    saToken = createSuperAdminToken();
  });

  afterAll(async () => {
    await cleanupTestData(SVC);
    await cleanupTestData(SVC2);
    await cleanupTestData(MFG);
  });

  it('rejects seat issue for non-service tenant', async () => {
    const res = await api()
      .post(`/api/super-admin/tenants/${MFG}/mobile-seats`)
      .set({ Authorization: `Bearer ${saToken}` })
      .send({});
    expect(res.status).toBe(400);
  });

  it('lists empty seats for manufacturer; 404 for unknown tenant', async () => {
    const mfgList = await api()
      .get(`/api/super-admin/tenants/${MFG}/mobile-seats`)
      .set({ Authorization: `Bearer ${saToken}` });
    expect(mfgList.status).toBe(200);
    expect(mfgList.body.seats).toEqual([]);
    expect(mfgList.body.businessType).toBe('manufacturer');

    const missing = await api()
      .get('/api/super-admin/tenants/T-DOES-NOT-EXIST/mobile-seats')
      .set({ Authorization: `Bearer ${saToken}` });
    expect(missing.status).toBe(404);
  });

  it('activate-seat validates seatKey and deviceId', async () => {
    expect((await api().post('/api/mobile/activate-seat').send({ deviceId: 'dev_ok_01' })).status).toBe(400);
    expect((await api().post('/api/mobile/activate-seat').send({ seatKey: 'DG-MS-NOPE', deviceId: 'x' })).status).toBe(
      400,
    );
    expect(
      (
        await api()
          .post('/api/mobile/activate-seat')
          .send({ seatKey: 'DG-MS-DEAD-BEEF-00000000', deviceId: 'dev_missing_seat_01', slug: SLUG })
      ).status,
    ).toBe(404);
  });

  it('manufacturer heartbeat has no offline entitlement', async () => {
    const hb = await api()
      .post('/api/mobile/heartbeat')
      .set(authHeaders(mfgToken, MFG))
      .send({ deviceId: 'dev_seat_mfg_01', platform: 'android', appVersion: '2.2.0' });
    expect(hb.status).toBe(200);
    expect(hb.body.businessType).toBe('manufacturer');
    expect(hb.body.seatValid).toBe(false);
    expect(hb.body.offlineEnabled).toBe(false);
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
      slug: SLUG,
      deviceId,
      platform: 'android',
      appVersion: '2.2.0',
    });
    expect(act.status).toBe(200);
    expect(act.body.offlineEnabled).toBe(true);
    expect(act.body.slug).toBe(SLUG);

    const wrong = await api().post('/api/mobile/activate-seat').send({
      seatKey: issue.body.seatKey,
      slug: SLUG,
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

  it('rejects seat key for a different company slug', async () => {
    const issue = await api()
      .post(`/api/super-admin/tenants/${SVC}/mobile-seats`)
      .set({ Authorization: `Bearer ${saToken}` })
      .send({});
    const res = await api().post('/api/mobile/activate-seat').send({
      seatKey: issue.body.seatKey,
      slug: SLUG2,
      deviceId: 'dev_seat_wrong_slug_01',
      platform: 'android',
    });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/belong/i);
  });

  it('rejects revoked and expired seats', async () => {
    const issue = await api()
      .post(`/api/super-admin/tenants/${SVC}/mobile-seats`)
      .set({ Authorization: `Bearer ${saToken}` })
      .send({});
    const seats = (
      await api()
        .get(`/api/super-admin/tenants/${SVC}/mobile-seats`)
        .set({ Authorization: `Bearer ${saToken}` })
    ).body.seats as { id: string; seatKey: string }[];
    const seat = seats.find(s => s.seatKey === issue.body.seatKey)!;

    const revoked = await api()
      .put(`/api/super-admin/tenants/${SVC}/mobile-seats/${seat.id}`)
      .set({ Authorization: `Bearer ${saToken}` })
      .send({ status: 'revoked' });
    expect(revoked.status).toBe(200);

    const actRevoked = await api().post('/api/mobile/activate-seat').send({
      seatKey: issue.body.seatKey,
      slug: SLUG,
      deviceId: 'dev_seat_revoked_01',
      platform: 'android',
    });
    expect(actRevoked.status).toBe(403);

    const issue2 = await api()
      .post(`/api/super-admin/tenants/${SVC}/mobile-seats`)
      .set({ Authorization: `Bearer ${saToken}` })
      .send({ validUntil: '2020-01-01' });
    expect(issue2.status).toBe(201);
    const actExpired = await api().post('/api/mobile/activate-seat').send({
      seatKey: issue2.body.seatKey,
      slug: SLUG,
      deviceId: 'dev_seat_expired_01',
      platform: 'android',
    });
    expect(actExpired.status).toBe(403);
    expect(actExpired.body.error).toMatch(/expired/i);
  });

  it('blocks one device from binding two active seats', async () => {
    const a = await api()
      .post(`/api/super-admin/tenants/${SVC}/mobile-seats`)
      .set({ Authorization: `Bearer ${saToken}` })
      .send({});
    const b = await api()
      .post(`/api/super-admin/tenants/${SVC}/mobile-seats`)
      .set({ Authorization: `Bearer ${saToken}` })
      .send({});
    const deviceId = 'dev_seat_multi_01';
    const first = await api().post('/api/mobile/activate-seat').send({
      seatKey: a.body.seatKey,
      slug: SLUG,
      deviceId,
      platform: 'android',
    });
    expect(first.status).toBe(200);
    const second = await api().post('/api/mobile/activate-seat').send({
      seatKey: b.body.seatKey,
      slug: SLUG,
      deviceId,
      platform: 'android',
    });
    expect(second.status).toBe(403);
  });

  it('suspend blocks offline entitlement', async () => {
    const issue = await api()
      .post(`/api/super-admin/tenants/${SVC}/mobile-seats`)
      .set({ Authorization: `Bearer ${saToken}` })
      .send({});
    const deviceId = 'dev_seat_suspend_01';
    await api().post('/api/mobile/activate-seat').send({
      seatKey: issue.body.seatKey,
      slug: SLUG,
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

  it('SA seat update: validUntil, invalid status, empty body, missing seat', async () => {
    const issue = await api()
      .post(`/api/super-admin/tenants/${SVC}/mobile-seats`)
      .set({ Authorization: `Bearer ${saToken}` })
      .send({});
    const seats = (
      await api()
        .get(`/api/super-admin/tenants/${SVC}/mobile-seats`)
        .set({ Authorization: `Bearer ${saToken}` })
    ).body.seats as { id: string; seatKey: string }[];
    const seat = seats.find(s => s.seatKey === issue.body.seatKey)!;

    const until = await api()
      .put(`/api/super-admin/tenants/${SVC}/mobile-seats/${seat.id}`)
      .set({ Authorization: `Bearer ${saToken}` })
      .send({ validUntil: '2099-12-31' });
    expect(until.status).toBe(200);
    expect(String(until.body.seat.validUntil)).toContain('2099');

    const clearUntil = await api()
      .put(`/api/super-admin/tenants/${SVC}/mobile-seats/${seat.id}`)
      .set({ Authorization: `Bearer ${saToken}` })
      .send({ validUntil: '' });
    expect(clearUntil.status).toBe(200);
    expect(clearUntil.body.seat.validUntil).toBeNull();

    const badStatus = await api()
      .put(`/api/super-admin/tenants/${SVC}/mobile-seats/${seat.id}`)
      .set({ Authorization: `Bearer ${saToken}` })
      .send({ status: 'nope' });
    expect(badStatus.status).toBe(400);

    const empty = await api()
      .put(`/api/super-admin/tenants/${SVC}/mobile-seats/${seat.id}`)
      .set({ Authorization: `Bearer ${saToken}` })
      .send({});
    expect(empty.status).toBe(400);

    const missing = await api()
      .put(`/api/super-admin/tenants/${SVC}/mobile-seats/MS-DOES-NOT-EXIST`)
      .set({ Authorization: `Bearer ${saToken}` })
      .send({ clearDevice: true });
    expect(missing.status).toBe(404);
  });

  it('rejects activate when company is suspended; allows re-bind same device', async () => {
    const issue = await api()
      .post(`/api/super-admin/tenants/${SVC}/mobile-seats`)
      .set({ Authorization: `Bearer ${saToken}` })
      .send({});
    const deviceId = 'dev_seat_rebind_01';
    const first = await api().post('/api/mobile/activate-seat').send({
      seatKey: issue.body.seatKey,
      slug: SLUG,
      deviceId,
      platform: 'android',
    });
    expect(first.status).toBe(200);
    const again = await api().post('/api/mobile/activate-seat').send({
      seatKey: issue.body.seatKey,
      slug: SLUG,
      deviceId,
      platform: 'android',
      appVersion: '2.3.0',
    });
    expect(again.status).toBe(200);

    await pool.query(`UPDATE tenants SET status = 'suspended' WHERE id = $1`, [SVC]);
    const suspended = await api().post('/api/mobile/activate-seat').send({
      seatKey: issue.body.seatKey,
      slug: SLUG,
      deviceId: 'dev_seat_suspended_01',
      platform: 'ios',
    });
    expect(suspended.status).toBe(403);
    await pool.query(`UPDATE tenants SET status = 'active' WHERE id = $1`, [SVC]);
  });

  it('transfer clears device binding; rotateKey issues a new key', async () => {
    const issue = await api()
      .post(`/api/super-admin/tenants/${SVC}/mobile-seats`)
      .set({ Authorization: `Bearer ${saToken}` })
      .send({});
    const deviceId = 'dev_seat_xfer_01';
    await api().post('/api/mobile/activate-seat').send({
      seatKey: issue.body.seatKey,
      slug: SLUG,
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
      slug: SLUG,
      deviceId: 'dev_seat_xfer_02',
      platform: 'android',
    });
    expect(act2.status).toBe(200);

    const rotated = await api()
      .put(`/api/super-admin/tenants/${SVC}/mobile-seats/${seat.id}`)
      .set({ Authorization: `Bearer ${saToken}` })
      .send({ rotateKey: true });
    expect(rotated.status).toBe(200);
    expect(rotated.body.seat.seatKey).toMatch(/^DG-MS-/);
    expect(rotated.body.seat.seatKey).not.toBe(issue.body.seatKey);
    expect(rotated.body.seat.deviceId).toBeNull();
  });
});
