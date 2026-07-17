/**
 * Service cloud seats — access mode, device slots, company-wide session lock.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool, createSuperAdminToken, createTestToken, cleanupTestData } from '../helpers';
import { api } from '../http';
import bcrypt from 'bcrypt';

const TENANT = 'T-SC-TEST01';
const USER_A = 'U-SC-A';
const USER_B = 'U-SC-B';
const MACHINE_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const MACHINE_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const MACHINE_C = 'cccccccccccccccccccccccccccccccc';

describe('HTTP: service-cloud seats', () => {
  const saToken = () => createSuperAdminToken();
  const tokenA = () =>
    createTestToken({
      userId: USER_A,
      tenantId: TENANT,
      email: 'a@sc.test',
      role: 'Admin',
      name: 'Alice',
    });
  const tokenB = () =>
    createTestToken({
      userId: USER_B,
      tenantId: TENANT,
      email: 'b@sc.test',
      role: 'Admin',
      name: 'Bob',
    });

  beforeAll(async () => {
    await cleanupTestData(TENANT);
    const hash = bcrypt.hashSync('password12', 4);
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, status, business_type, admin_email, admin_name)
       VALUES ($1, 'Service Cloud Co', 'sc-test', 'active', 'service', 'a@sc.test', 'Alice')
       ON CONFLICT (id) DO UPDATE SET business_type='service', client_access_mode=NULL`,
      [TENANT],
    );
    await pool.query(
      `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
       VALUES ($1,$2,'a@sc.test',$3,'Alice','Admin')
       ON CONFLICT (id, tenant_id) DO NOTHING`,
      [USER_A, TENANT, hash],
    );
    await pool.query(
      `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
       VALUES ($1,$2,'b@sc.test',$3,'Bob','Admin')
       ON CONFLICT (id, tenant_id) DO NOTHING`,
      [USER_B, TENANT, hash],
    );
  });

  afterAll(async () => {
    await cleanupTestData(TENANT);
  });

  it('rejects invalid access mode', async () => {
    const bad = await api()
      .put(`/api/super-admin/tenants/${TENANT}/service-cloud/access-mode`)
      .set({ Authorization: `Bearer ${saToken()}` })
      .send({ clientAccessMode: 'tablet' });
    expect(bad.status).toBe(400);
  });

  it('SA sets access mode and device slots', async () => {
    const mode = await api()
      .put(`/api/super-admin/tenants/${TENANT}/service-cloud/access-mode`)
      .set({ Authorization: `Bearer ${saToken()}` })
      .send({ clientAccessMode: 'both' });
    expect(mode.status).toBe(200);
    expect(mode.body.clientAccessMode).toBe('both');

    const slotsA = await api()
      .put(`/api/super-admin/tenants/${TENANT}/service-cloud/users/${USER_A}`)
      .set({ Authorization: `Bearer ${saToken()}` })
      .send({ mobileSlots: 1, desktopSlots: 1 });
    expect(slotsA.status).toBe(200);
    const alice = (slotsA.body.users as { id: string; mobileSlots: number; desktopSlots: number }[]).find(
      u => u.id === USER_A,
    );
    expect(alice?.mobileSlots).toBe(1);
    expect(alice?.desktopSlots).toBe(1);

    const slotsB = await api()
      .put(`/api/super-admin/tenants/${TENANT}/service-cloud/users/${USER_B}`)
      .set({ Authorization: `Bearer ${saToken()}` })
      .send({ mobileSlots: 1, desktopSlots: 0 });
    expect(slotsB.status).toBe(200);
  });

  it('SA create user with slots', async () => {
    const created = await api()
      .post(`/api/super-admin/tenants/${TENANT}/service-cloud/users`)
      .set({ Authorization: `Bearer ${saToken()}` })
      .send({
        name: 'Carol',
        email: 'c@sc.test',
        password: 'password12',
        mobileSlots: 0,
        desktopSlots: 1,
      });
    expect(created.status).toBe(201);
    expect(created.body.userId).toBeTruthy();
    const carol = (created.body.users as { email: string; desktopSlots: number }[]).find(u => u.email === 'c@sc.test');
    expect(carol?.desktopSlots).toBe(1);
  });

  it('blocks web clients from claim-device', async () => {
    const claim = await api()
      .post('/api/service-cloud/claim-device')
      .set({ Authorization: `Bearer ${tokenA()}` })
      .send({ machineId: MACHINE_A, client: 'web' });
    expect(claim.status).toBe(403);
  });

  it('claim-device binds slot; second machine needs another slot', async () => {
    const claim = await api()
      .post('/api/service-cloud/claim-device')
      .set({ Authorization: `Bearer ${tokenA()}`, 'X-DG-Client': 'electron-cloud' })
      .send({ machineId: MACHINE_A, label: 'Laptop A' });
    expect(claim.status).toBe(200);
    expect(claim.body.deviceKind).toBe('desktop');

    const claim2 = await api()
      .post('/api/service-cloud/claim-device')
      .set({ Authorization: `Bearer ${tokenA()}`, 'X-DG-Client': 'electron-cloud' })
      .send({ machineId: MACHINE_B, label: 'Laptop B' });
    expect(claim2.status).toBe(403);

    // Re-claim same machine is idempotent
    const again = await api()
      .post('/api/service-cloud/claim-device')
      .set({ Authorization: `Bearer ${tokenA()}`, 'X-DG-Client': 'electron-cloud' })
      .send({ machineId: MACHINE_A });
    expect(again.status).toBe(200);
    expect(again.body.alreadyBound).toBe(true);
  });

  it('company-wide session: second user gets busy until holder releases', async () => {
    const acq = await api()
      .post('/api/service-cloud/session/acquire')
      .set({ Authorization: `Bearer ${tokenA()}`, 'X-DG-Client': 'electron-cloud' })
      .send({ machineId: MACHINE_A });
    expect(acq.status).toBe(200);
    expect(acq.body.ok).toBe(true);

    const claimB = await api()
      .post('/api/service-cloud/claim-device')
      .set({ Authorization: `Bearer ${tokenB()}`, 'X-DG-Client': 'capacitor-cloud' })
      .send({ machineId: MACHINE_B, label: 'Phone B' });
    expect(claimB.status).toBe(200);

    const busy = await api()
      .post('/api/service-cloud/session/acquire')
      .set({ Authorization: `Bearer ${tokenB()}`, 'X-DG-Client': 'capacitor-cloud' })
      .send({ machineId: MACHINE_B });
    expect(busy.status).toBe(409);
    expect(busy.body.busy).toBe(true);
    expect(busy.body.holder.userName).toBe('Alice');

    // Non-holder cannot release
    const steal = await api()
      .post('/api/service-cloud/session/release')
      .set({ Authorization: `Bearer ${tokenB()}`, 'X-DG-Client': 'capacitor-cloud' })
      .send({ machineId: MACHINE_B });
    expect(steal.status).toBe(403);

    const relMissing = await api()
      .post('/api/service-cloud/session/release')
      .set({ Authorization: `Bearer ${tokenA()}`, 'X-DG-Client': 'electron-cloud' })
      .send({});
    expect(relMissing.status).toBe(400);

    const hb = await api()
      .post('/api/service-cloud/session/heartbeat')
      .set({ Authorization: `Bearer ${tokenA()}`, 'X-DG-Client': 'electron-cloud' })
      .send({ machineId: MACHINE_A });
    expect(hb.status).toBe(200);
    expect(hb.body.ok).toBe(true);

    // Wrong user cannot heartbeat even with stolen machineId knowledge
    const hbSteal = await api()
      .post('/api/service-cloud/session/heartbeat')
      .set({ Authorization: `Bearer ${tokenB()}`, 'X-DG-Client': 'capacitor-cloud' })
      .send({ machineId: MACHINE_A });
    expect(hbSteal.status).toBe(409);

    const status = await api()
      .get('/api/service-cloud/session/status')
      .set({ Authorization: `Bearer ${tokenB()}` });
    expect(status.status).toBe(200);
    expect(status.body.applicable).toBe(true);
    expect(status.body.busy).toBe(true);

    const rel = await api()
      .post('/api/service-cloud/session/release')
      .set({ Authorization: `Bearer ${tokenA()}`, 'X-DG-Client': 'electron-cloud' })
      .send({ machineId: MACHINE_A });
    expect(rel.status).toBe(200);

    const acqB = await api()
      .post('/api/service-cloud/session/acquire')
      .set({ Authorization: `Bearer ${tokenB()}`, 'X-DG-Client': 'capacitor-cloud' })
      .send({ machineId: MACHINE_B });
    expect(acqB.status).toBe(200);

    await api()
      .post('/api/service-cloud/session/release')
      .set({ Authorization: `Bearer ${tokenB()}`, 'X-DG-Client': 'capacitor-cloud' })
      .send({ machineId: MACHINE_B });
  });

  it('atomic acquire: concurrent second machine stays busy', async () => {
    await api()
      .post('/api/service-cloud/session/acquire')
      .set({ Authorization: `Bearer ${tokenA()}`, 'X-DG-Client': 'electron-cloud' })
      .send({ machineId: MACHINE_A });

    const [r1, r2] = await Promise.all([
      api()
        .post('/api/service-cloud/session/acquire')
        .set({ Authorization: `Bearer ${tokenA()}`, 'X-DG-Client': 'electron-cloud' })
        .send({ machineId: MACHINE_A }),
      api()
        .post('/api/service-cloud/session/acquire')
        .set({ Authorization: `Bearer ${tokenB()}`, 'X-DG-Client': 'capacitor-cloud' })
        .send({ machineId: MACHINE_B }),
    ]);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(409);

    await api()
      .post('/api/service-cloud/session/release')
      .set({ Authorization: `Bearer ${tokenA()}`, 'X-DG-Client': 'electron-cloud' })
      .send({ machineId: MACHINE_A });
  });

  it('SA unbind frees slot for a new machine', async () => {
    const seats = await api()
      .get(`/api/super-admin/tenants/${TENANT}/service-cloud`)
      .set({ Authorization: `Bearer ${saToken()}` });
    expect(seats.status).toBe(200);
    const alice = (seats.body.users as { id: string; devices: { id: string; machineId: string | null }[] }[]).find(
      u => u.id === USER_A,
    );
    const bound = alice?.devices.find(d => d.machineId === MACHINE_A);
    expect(bound).toBeTruthy();

    const unbind = await api()
      .post(`/api/super-admin/tenants/${TENANT}/service-cloud/slots/${bound!.id}/unbind`)
      .set({ Authorization: `Bearer ${saToken()}` });
    expect(unbind.status).toBe(200);

    const claim = await api()
      .post('/api/service-cloud/claim-device')
      .set({ Authorization: `Bearer ${tokenA()}`, 'X-DG-Client': 'electron-cloud' })
      .send({ machineId: MACHINE_C });
    expect(claim.status).toBe(200);
  });

  it('mobile-only mode rejects desktop claim', async () => {
    await api()
      .put(`/api/super-admin/tenants/${TENANT}/service-cloud/access-mode`)
      .set({ Authorization: `Bearer ${saToken()}` })
      .send({ clientAccessMode: 'mobile' });

    const desk = await api()
      .post('/api/service-cloud/claim-device')
      .set({ Authorization: `Bearer ${tokenA()}`, 'X-DG-Client': 'electron-cloud' })
      .send({ machineId: 'dddddddddddddddddddddddddddddddd' });
    expect(desk.status).toBe(403);

    // restore both for cleanliness
    await api()
      .put(`/api/super-admin/tenants/${TENANT}/service-cloud/access-mode`)
      .set({ Authorization: `Bearer ${saToken()}` })
      .send({ clientAccessMode: 'both' });
  });

  it('rejects manufacturer tenants', async () => {
    const mid = 'T-SC-MFG';
    await cleanupTestData(mid);
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, status, business_type, admin_email, admin_name)
       VALUES ($1, 'Mfg', 'mfg-sc', 'active', 'manufacturer', 'm@t.com', 'M')`,
      [mid],
    );
    const res = await api()
      .get(`/api/super-admin/tenants/${mid}/service-cloud`)
      .set({ Authorization: `Bearer ${saToken()}` });
    expect(res.status).toBe(404);
    await cleanupTestData(mid);
  });
});
