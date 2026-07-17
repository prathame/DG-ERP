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
  });

  it('company-wide session: second user gets busy until release', async () => {
    const acq = await api()
      .post('/api/service-cloud/session/acquire')
      .set({ Authorization: `Bearer ${tokenA()}`, 'X-DG-Client': 'electron-cloud' })
      .send({ machineId: MACHINE_A });
    expect(acq.status).toBe(200);
    expect(acq.body.ok).toBe(true);

    // Bob needs a mobile claim first
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

    const MACHINE_C = 'cccccccccccccccccccccccccccccccc';
    const claim = await api()
      .post('/api/service-cloud/claim-device')
      .set({ Authorization: `Bearer ${tokenA()}`, 'X-DG-Client': 'electron-cloud' })
      .send({ machineId: MACHINE_C });
    expect(claim.status).toBe(200);
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
