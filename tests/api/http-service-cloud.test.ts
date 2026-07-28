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

  it('allows manufacturer seats without company session lock', async () => {
    const mid = 'T-SC-MFG';
    const uid = 'U-SC-MFG';
    const m1 = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
    const m2 = 'ffffffffffffffffffffffffffffffff';
    await cleanupTestData(mid);
    const hash = bcrypt.hashSync('password12', 4);
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, status, business_type, admin_email, admin_name, client_access_mode)
       VALUES ($1, 'Mfg', 'mfg-sc', 'active', 'manufacturer', 'm@t.com', 'M', 'both')`,
      [mid],
    );
    await pool.query(
      `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
       VALUES ($1,$2,'m@t.com',$3,'M','Admin')
       ON CONFLICT (id, tenant_id) DO NOTHING`,
      [uid, mid, hash],
    );
    const seats = await api()
      .get(`/api/super-admin/tenants/${mid}/service-cloud`)
      .set({ Authorization: `Bearer ${saToken()}` });
    expect(seats.status).toBe(200);
    expect(seats.body.businessType).toBe('manufacturer');
    expect(seats.body.companySessionLock).toBe(false);

    await api()
      .put(`/api/super-admin/tenants/${mid}/service-cloud/users/${uid}`)
      .set({ Authorization: `Bearer ${saToken()}` })
      .send({ mobileSlots: 2, desktopSlots: 0 });

    const tokenM = () =>
      createTestToken({
        userId: uid,
        tenantId: mid,
        email: 'm@t.com',
        role: 'Admin',
        name: 'M',
      });

    const claim1 = await api()
      .post('/api/service-cloud/claim-device')
      .set({ Authorization: `Bearer ${tokenM()}`, 'X-DG-Client': 'capacitor-cloud' })
      .send({ machineId: m1 });
    expect(claim1.status).toBe(200);

    // Second device / second acquire must not get company busy (multi-user)
    const claim2 = await api()
      .post('/api/service-cloud/claim-device')
      .set({ Authorization: `Bearer ${tokenM()}`, 'X-DG-Client': 'capacitor-cloud' })
      .send({ machineId: m2 });
    expect(claim2.status).toBe(200);

    const acq1 = await api()
      .post('/api/service-cloud/session/acquire')
      .set({ Authorization: `Bearer ${tokenM()}`, 'X-DG-Client': 'capacitor-cloud' })
      .send({ machineId: m1 });
    expect(acq1.status).toBe(200);
    expect(acq1.body.companySessionLock).toBe(false);
    expect(acq1.body.busy).toBe(false);

    const acq2 = await api()
      .post('/api/service-cloud/session/acquire')
      .set({ Authorization: `Bearer ${tokenM()}`, 'X-DG-Client': 'capacitor-cloud' })
      .send({ machineId: m2 });
    expect(acq2.status).toBe(200);
    expect(acq2.body.busy).toBe(false);

    await cleanupTestData(mid);
  });

  it('transfers desktop bind when second user claims same machine', async () => {
    const tid = 'T-SC-XFER';
    const u1 = 'U-SC-X1';
    const u2 = 'U-SC-X2';
    const shared = '10101010101010101010101010101010';
    await cleanupTestData(tid);
    const hash = bcrypt.hashSync('password12', 4);
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, status, business_type, admin_email, admin_name, client_access_mode)
       VALUES ($1, 'Xfer Co', 'sc-xfer', 'active', 'manufacturer', 'x1@t.com', 'X1', 'both')`,
      [tid],
    );
    await pool.query(
      `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
       VALUES ($1,$2,'x1@t.com',$3,'X1','Admin'), ($4,$2,'x2@t.com',$3,'X2','Admin')`,
      [u1, tid, hash, u2],
    );
    await api()
      .put(`/api/super-admin/tenants/${tid}/service-cloud/users/${u1}`)
      .set({ Authorization: `Bearer ${saToken()}` })
      .send({ mobileSlots: 0, desktopSlots: 1 });
    await api()
      .put(`/api/super-admin/tenants/${tid}/service-cloud/users/${u2}`)
      .set({ Authorization: `Bearer ${saToken()}` })
      .send({ mobileSlots: 0, desktopSlots: 1 });

    const tok1 = () => createTestToken({ userId: u1, tenantId: tid, email: 'x1@t.com', role: 'Admin', name: 'X1' });
    const tok2 = () => createTestToken({ userId: u2, tenantId: tid, email: 'x2@t.com', role: 'Admin', name: 'X2' });

    const c1 = await api()
      .post('/api/service-cloud/claim-device')
      .set({ Authorization: `Bearer ${tok1()}`, 'X-DG-Client': 'electron-cloud' })
      .send({ machineId: shared, label: 'Shared PC' });
    expect(c1.status).toBe(200);

    const seatsBefore = await api()
      .get(`/api/super-admin/tenants/${tid}/service-cloud`)
      .set({ Authorization: `Bearer ${saToken()}` });
    const x1Before = (
      seatsBefore.body.users as { id: string; devices: { machineId: string | null; label: string | null }[] }[]
    ).find(u => u.id === u1);
    expect(x1Before?.devices.some(d => d.machineId === shared && d.label === 'Shared PC')).toBe(true);

    const c2 = await api()
      .post('/api/service-cloud/claim-device')
      .set({ Authorization: `Bearer ${tok2()}`, 'X-DG-Client': 'electron-cloud' })
      .send({ machineId: shared, label: 'Shared PC' });
    expect(c2.status).toBe(200);
    expect(c2.body.transferred).toBe(true);

    const seatsAfter = await api()
      .get(`/api/super-admin/tenants/${tid}/service-cloud`)
      .set({ Authorization: `Bearer ${saToken()}` });
    const users = seatsAfter.body.users as {
      id: string;
      devices: { machineId: string | null; label: string | null }[];
    }[];
    const x1 = users.find(u => u.id === u1);
    const x2 = users.find(u => u.id === u2);
    expect(x1?.devices.every(d => !d.machineId)).toBe(true);
    expect(x2?.devices.some(d => d.machineId === shared)).toBe(true);

    await cleanupTestData(tid);
  });

  it('seats payload reports unbound vs bound occupancy', async () => {
    const seats = await api()
      .get(`/api/super-admin/tenants/${TENANT}/service-cloud`)
      .set({ Authorization: `Bearer ${saToken()}` });
    expect(seats.status).toBe(200);
    const alice = (
      seats.body.users as {
        id: string;
        mobileSlots: number;
        desktopSlots: number;
        devices: { deviceKind: string; machineId: string | null }[];
      }[]
    ).find(u => u.id === USER_A);
    expect(alice).toBeTruthy();
    expect(alice!.mobileSlots + alice!.desktopSlots).toBe(alice!.devices.length);
    const unbound = alice!.devices.filter(d => !d.machineId).length;
    const bound = alice!.devices.filter(d => !!d.machineId).length;
    expect(unbound + bound).toBe(alice!.devices.length);
  });

  it('SA seat-user create is capped by the tenant plan max_users, for any business type', async () => {
    // Plan cap applies regardless of business type — try both service and manufacturer.
    for (const businessType of ['service', 'manufacturer']) {
      const tid = `T-SC-CAP-${businessType.slice(0, 3).toUpperCase()}`;
      const adminId = `U-SC-CAP-${businessType.slice(0, 3).toUpperCase()}`;
      await cleanupTestData(tid);
      const planId = `plan-seat-cap-${businessType}`;
      await pool.query(
        `INSERT INTO plans (id, name, max_products, max_vendors, max_users, max_barcodes, features, price_monthly, price_yearly)
         VALUES ($1, 'SeatCap', -1, -1, 1, -1, '[]', 0, 0)
         ON CONFLICT (id) DO UPDATE SET max_users = 1`,
        [planId],
      );
      const hash = bcrypt.hashSync('password12', 4);
      await pool.query(
        `INSERT INTO tenants (id, company_name, slug, status, business_type, admin_email, admin_name, plan_id)
         VALUES ($1, 'Seat Cap Co', $2, 'active', $3, 'admin@seatcap.test', 'Admin', $4)`,
        [tid, `seat-cap-${businessType}`, businessType, planId],
      );
      await pool.query(
        `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
         VALUES ($1,$2,'admin@seatcap.test',$3,'Admin','Admin')`,
        [adminId, tid, hash],
      );

      // Plan allows exactly 1 user; the admin already fills that seat.
      const blocked = await api()
        .post(`/api/super-admin/tenants/${tid}/service-cloud/users`)
        .set({ Authorization: `Bearer ${saToken()}` })
        .send({ name: 'Extra', email: 'extra@seatcap.test', password: 'password12', mobileSlots: 1, desktopSlots: 0 });
      expect(blocked.status).toBe(403);
      expect(blocked.body.error).toMatch(/Plan limit reached/i);

      // Same cap also blocks Tenant Settings → Add User (server/routes/admin.ts) — kept in sync.
      const tenantAdminToken = createTestToken({
        userId: adminId,
        tenantId: tid,
        email: 'admin@seatcap.test',
        role: 'Admin',
        name: 'Admin',
      });
      const blockedSettings = await api()
        .post('/api/admin/users')
        .set({ Authorization: `Bearer ${tenantAdminToken}` })
        .send({ email: 'extra2@seatcap.test', password: 'password12', name: 'Extra2', role: 'Staff' });
      expect(blockedSettings.status).toBe(403);
      expect(blockedSettings.body.error).toMatch(/Plan limit reached/i);

      // Seats payload reports the same plan cap for the SA UI to display before hitting the 403.
      const seats = await api()
        .get(`/api/super-admin/tenants/${tid}/service-cloud`)
        .set({ Authorization: `Bearer ${saToken()}` });
      expect(seats.status).toBe(200);
      expect(seats.body.planMaxUsers).toBe(1);
      expect(seats.body.activeUserCount).toBe(1);

      await cleanupTestData(tid);
      await pool.query('DELETE FROM plans WHERE id = $1', [planId]);
    }
  });

  it('SA soft-deletes seat user and blocks deleting last admin', async () => {
    const tid = 'T-SC-DEL';
    const adminId = 'U-SC-DEL-A';
    const staffId = 'U-SC-DEL-B';
    await cleanupTestData(tid);
    const hash = bcrypt.hashSync('password12', 4);
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, status, business_type, admin_email, admin_name, client_access_mode)
       VALUES ($1, 'Del Co', 'sc-del', 'active', 'manufacturer', 'a@del.test', 'Admin', 'both')`,
      [tid],
    );
    await pool.query(
      `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
       VALUES ($1,$2,'a@del.test',$3,'Admin','Admin'), ($4,$2,'b@del.test',$3,'Staff','Staff')`,
      [adminId, tid, hash, staffId],
    );
    await api()
      .put(`/api/super-admin/tenants/${tid}/service-cloud/users/${staffId}`)
      .set({ Authorization: `Bearer ${saToken()}` })
      .send({ mobileSlots: 1, desktopSlots: 0 });

    const deleted = await api()
      .delete(`/api/super-admin/tenants/${tid}/service-cloud/users/${staffId}`)
      .set({ Authorization: `Bearer ${saToken()}` });
    expect(deleted.status).toBe(200);
    expect(deleted.body.ok).toBe(true);
    const remaining = deleted.body.users as { id: string }[];
    expect(remaining.find(u => u.id === staffId)).toBeUndefined();
    expect(remaining.find(u => u.id === adminId)).toBeTruthy();

    const slots = await pool.query(
      `SELECT COUNT(*)::int AS c FROM service_cloud_device_slots WHERE tenant_id=$1 AND user_id=$2`,
      [tid, staffId],
    );
    expect(slots.rows[0].c).toBe(0);

    const lastAdmin = await api()
      .delete(`/api/super-admin/tenants/${tid}/service-cloud/users/${adminId}`)
      .set({ Authorization: `Bearer ${saToken()}` });
    expect(lastAdmin.status).toBe(400);
    expect(lastAdmin.body.error).toMatch(/last admin/i);

    const tenantDetail = await api()
      .get(`/api/super-admin/tenants/${tid}`)
      .set({ Authorization: `Bearer ${saToken()}` });
    expect(tenantDetail.status).toBe(200);
    const listed = tenantDetail.body.users as { id: string; name: string }[];
    expect(listed.find(u => u.id === staffId)).toBeUndefined();
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe(adminId);
    expect(Number(tenantDetail.body.stats.users)).toBe(1);

    await cleanupTestData(tid);
  });
});
