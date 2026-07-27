import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { api } from '../http';
import { pool, createSuperAdminToken, cleanupTestData } from '../helpers';

const SA = () => ({ Authorization: `Bearer ${createSuperAdminToken()}` });

const CLOUD_EMAIL = 'hotel-deploy-cloud@test.dgerp';
const BYO_EMAIL = 'hotel-deploy-byo@test.dgerp';
const LOCAL_EMAIL = 'hotel-deploy-local@test.dgerp';
const RETAIL_EMAIL = 'hotel-deploy-retail@test.dgerp';

async function deleteByEmail(email: string) {
  const row = (await pool.query(`SELECT id FROM tenants WHERE admin_email = $1`, [email])).rows[0] as
    { id: string } | undefined;
  if (row?.id) await cleanupTestData(row.id);
}

describe('HTTP SA hotel deployment onboard', () => {
  beforeAll(async () => {
    await deleteByEmail(CLOUD_EMAIL);
    await deleteByEmail(BYO_EMAIL);
    await deleteByEmail(LOCAL_EMAIL);
    await deleteByEmail(RETAIL_EMAIL);
  });

  afterAll(async () => {
    await deleteByEmail(CLOUD_EMAIL);
    await deleteByEmail(BYO_EMAIL);
    await deleteByEmail(LOCAL_EMAIL);
    await deleteByEmail(RETAIL_EMAIL);
  });

  it('rejects byo_db without URL before creating a tenant', async () => {
    const res = await api().post('/api/super-admin/tenants').set(SA()).send({
      companyName: 'Hotel Byo Bad',
      adminEmail: BYO_EMAIL,
      adminName: 'Admin',
      plan: 'TRIAL',
      businessType: 'hotel_restaurant',
      hotelDeployment: 'byo_db',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/databaseUrl/i);
    const orphan = (await pool.query(`SELECT id FROM tenants WHERE admin_email = $1`, [BYO_EMAIL])).rows[0];
    expect(orphan).toBeUndefined();
  });

  it('creates cloud hotel without seeding hosp tables', async () => {
    const res = await api().post('/api/super-admin/tenants').set(SA()).send({
      companyName: 'Hotel Cloud Co',
      adminEmail: CLOUD_EMAIL,
      adminName: 'Admin',
      plan: 'TRIAL',
      businessType: 'hotel_restaurant',
      hotelDeployment: 'cloud',
      needMobile: false,
    });
    expect(res.status).toBe(201);
    expect(res.body.hotelDeployment).toBe('cloud');
    expect(res.body.hotelDatabaseUrlConfigured).toBe(false);
    const tid = res.body.tenantId as string;
    const tables = await pool.query(`SELECT COUNT(*)::int AS c FROM hosp_dining_tables WHERE tenant_id = $1`, [tid]);
    expect(tables.rows[0].c).toBe(0);
  });

  it('creates byo_db hotel with encrypted URL and does not seed', async () => {
    const secretUrl = 'postgresql://hotel:s3cret@db.example:5432/ops';
    const res = await api().post('/api/super-admin/tenants').set(SA()).send({
      companyName: 'Hotel Byo Co',
      adminEmail: BYO_EMAIL,
      adminName: 'Admin',
      plan: 'TRIAL',
      businessType: 'hotel_restaurant',
      hotelDeployment: 'byo_db',
      databaseUrl: secretUrl,
      needMobile: false,
    });
    expect(res.status).toBe(201);
    expect(res.body.hotelDeployment).toBe('byo_db');
    expect(res.body.hotelDatabaseUrlConfigured).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain(secretUrl);

    const tid = res.body.tenantId as string;
    const row = (await pool.query(`SELECT hotel_deployment, hotel_database_url FROM tenants WHERE id = $1`, [tid]))
      .rows[0] as { hotel_deployment: string; hotel_database_url: string };
    expect(row.hotel_deployment).toBe('byo_db');
    expect(row.hotel_database_url).toBeTruthy();
    expect(row.hotel_database_url).not.toContain('s3cret');
    const tables = await pool.query(`SELECT COUNT(*)::int AS c FROM hosp_dining_tables WHERE tenant_id = $1`, [tid]);
    expect(tables.rows[0].c).toBe(0);

    const get = await api().get(`/api/super-admin/tenants/${tid}`).set(SA());
    expect(get.status).toBe(200);
    expect(get.body.tenant.hotelDeployment).toBe('byo_db');
    expect(get.body.tenant.hotelDatabaseUrl).toBe('••••••••');
  });

  it('creates local_server hotel without seeding', async () => {
    const res = await api().post('/api/super-admin/tenants').set(SA()).send({
      companyName: 'Hotel Local Co',
      adminEmail: LOCAL_EMAIL,
      adminName: 'Admin',
      plan: 'TRIAL',
      businessType: 'hotel_restaurant',
      hotelDeployment: 'local_server',
      needMobile: false,
    });
    expect(res.status).toBe(201);
    expect(res.body.hotelDeployment).toBe('local_server');
    const tid = res.body.tenantId as string;
    const tables = await pool.query(`SELECT COUNT(*)::int AS c FROM hosp_dining_tables WHERE tenant_id = $1`, [tid]);
    expect(tables.rows[0].c).toBe(0);
  });

  it('ignores hotelDeployment on non-hotel create', async () => {
    const res = await api().post('/api/super-admin/tenants').set(SA()).send({
      companyName: 'Retail Not Hotel',
      adminEmail: RETAIL_EMAIL,
      adminName: 'Admin',
      plan: 'TRIAL',
      businessType: 'retail',
      hotelDeployment: 'byo_db',
      databaseUrl: 'postgresql://x:y@h/db',
      needMobile: false,
    });
    expect(res.status).toBe(201);
    expect(res.body.hotelDeployment).toBeNull();
    const tid = res.body.tenantId as string;
    const row = (await pool.query(`SELECT hotel_deployment, hotel_database_url FROM tenants WHERE id = $1`, [tid]))
      .rows[0] as { hotel_deployment: string | null; hotel_database_url: string | null };
    expect(row.hotel_deployment).toBeNull();
    expect(row.hotel_database_url).toBeNull();
  });

  it('update: leaving byo clears URL; leaving hotel clears deployment', async () => {
    const byo = (await pool.query(`SELECT id FROM tenants WHERE admin_email = $1`, [BYO_EMAIL])).rows[0] as {
      id: string;
    };
    expect(byo?.id).toBeTruthy();

    const toCloud = await api().put(`/api/super-admin/tenants/${byo.id}`).set(SA()).send({ hotelDeployment: 'cloud' });
    expect(toCloud.status).toBe(200);
    expect(toCloud.body.hotelDeployment).toBe('cloud');
    expect(toCloud.body.hotelDatabaseUrlConfigured).toBe(false);
    const afterCloud = (await pool.query(`SELECT hotel_database_url FROM tenants WHERE id = $1`, [byo.id])).rows[0] as {
      hotel_database_url: string | null;
    };
    expect(afterCloud.hotel_database_url).toBeNull();

    // put URL-only → flips to byo_db
    const urlOnly = await api()
      .put(`/api/super-admin/tenants/${byo.id}`)
      .set(SA())
      .send({ databaseUrl: 'postgresql://u:p@host/db2' });
    expect(urlOnly.status).toBe(200);
    expect(urlOnly.body.hotelDeployment).toBe('byo_db');
    expect(urlOnly.body.hotelDatabaseUrlConfigured).toBe(true);

    // leave hotel type
    const leave = await api().put(`/api/super-admin/tenants/${byo.id}`).set(SA()).send({ businessType: 'retail' });
    expect(leave.status).toBe(200);
    const afterLeave = (
      await pool.query(`SELECT hotel_deployment, hotel_database_url FROM tenants WHERE id = $1`, [byo.id])
    ).rows[0] as { hotel_deployment: string | null; hotel_database_url: string | null };
    expect(afterLeave.hotel_deployment).toBeNull();
    expect(afterLeave.hotel_database_url).toBeNull();
  });

  it('update rejects hotelDeployment on non-hotel tenant', async () => {
    const retail = (await pool.query(`SELECT id FROM tenants WHERE admin_email = $1`, [RETAIL_EMAIL])).rows[0] as {
      id: string;
    };
    const res = await api().put(`/api/super-admin/tenants/${retail.id}`).set(SA()).send({ hotelDeployment: 'cloud' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/hotel_restaurant/i);
  });
});
