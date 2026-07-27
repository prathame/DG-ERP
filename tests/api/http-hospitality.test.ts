import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import bcrypt from 'bcrypt';
import { api, authHeaders } from '../http';
import { pool, createTestToken, cleanupTestData } from '../helpers';
import { seedHospitalityCatalog } from '../../server/utils/hospitalitySeed';

const HOSP_TENANT = 'T-TEST-HOSP';
const MFG_TENANT = 'T-TEST-HOSP-MFG';
const HOSP_USER = 'U-TEST-HOSP';
const MFG_USER = 'U-TEST-HOSP-MFG';

function token(tenantId: string, userId: string) {
  return createTestToken({
    userId,
    tenantId,
    email: `${userId}@test.com`,
    role: 'Admin',
    name: 'Hosp Tester',
  });
}

async function seedTenant(id: string, businessType: string, userId: string) {
  await pool.query(
    `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, business_type)
     VALUES ($1, $2, $3, $4, 'Admin', 'active', $5)
     ON CONFLICT (id) DO UPDATE SET business_type = EXCLUDED.business_type`,
    [id, `${id} Co`, id.toLowerCase().replace(/_/g, '-'), `${id}@test.com`, businessType],
  );
  const hash = await bcrypt.hash('password123', 12);
  await pool.query(
    `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
     VALUES ($1, $2, $3, $4, 'Hosp Tester', 'Admin')
     ON CONFLICT DO NOTHING`,
    [userId, id, `${userId}@test.com`, hash],
  );
}

describe('HTTP Hospitality', () => {
  beforeAll(async () => {
    await cleanupTestData(HOSP_TENANT);
    await cleanupTestData(MFG_TENANT);
    await seedTenant(HOSP_TENANT, 'hotel_restaurant', HOSP_USER);
    await seedTenant(MFG_TENANT, 'manufacturer', MFG_USER);
  });

  afterAll(async () => {
    await cleanupTestData(HOSP_TENANT);
    await cleanupTestData(MFG_TENANT);
  });

  it('seedHospitalityCatalog creates floor + menu and is idempotent', async () => {
    await seedHospitalityCatalog(HOSP_TENANT);
    const tables = await pool.query(`SELECT COUNT(*)::int AS c FROM hosp_dining_tables WHERE tenant_id = $1`, [
      HOSP_TENANT,
    ]);
    expect(tables.rows[0].c).toBeGreaterThanOrEqual(12);
    const items = await pool.query(`SELECT COUNT(*)::int AS c FROM hosp_menu_items WHERE tenant_id = $1`, [
      HOSP_TENANT,
    ]);
    expect(items.rows[0].c).toBeGreaterThanOrEqual(10);

    await seedHospitalityCatalog(HOSP_TENANT);
    const again = await pool.query(`SELECT COUNT(*)::int AS c FROM hosp_dining_tables WHERE tenant_id = $1`, [
      HOSP_TENANT,
    ]);
    expect(again.rows[0].c).toBe(tables.rows[0].c);
  });

  it('rejects hospitality APIs for non-hotel tenants', async () => {
    const res = await api()
      .get('/api/hospitality/tables')
      .set(authHeaders(token(MFG_TENANT, MFG_USER), MFG_TENANT));
    expect(res.status).toBe(403);
  });

  it('covers order lifecycle: open → add item → kitchen → bill → close → clear', async () => {
    const headers = authHeaders(token(HOSP_TENANT, HOSP_USER), HOSP_TENANT);

    const seedRes = await api().post('/api/hospitality/seed').set(headers).send({});
    expect(seedRes.status).toBe(200);

    const tablesRes = await api().get('/api/hospitality/tables').set(headers);
    expect(tablesRes.status).toBe(200);
    expect(tablesRes.body.tables.length).toBeGreaterThan(0);
    const table = tablesRes.body.tables[0] as { id: string };

    const menuRes = await api().get('/api/hospitality/menu').set(headers);
    expect(menuRes.status).toBe(200);
    const item = menuRes.body.items[0] as {
      id: string;
      modifierGroups: Array<{ modifiers: Array<{ id: string }> }>;
    };
    expect(item).toBeTruthy();

    const openRes = await api().post(`/api/hospitality/tables/${table.id}/open`).set(headers).send({});
    expect(openRes.status).toBe(200);
    const orderId = openRes.body.order.id as string;

    const modIds = item.modifierGroups?.flatMap(g => g.modifiers.slice(0, 1).map(m => m.id)).filter(Boolean) ?? [];
    const addRes = await api()
      .post(`/api/hospitality/orders/${orderId}/items`)
      .set(headers)
      .send({ menuItemId: item.id, qty: 1, notes: 'no onion', modifierIds: modIds });
    expect(addRes.status).toBe(200);
    expect(addRes.body.items.length).toBeGreaterThan(0);
    const orderItemId = addRes.body.items[0].id as string;

    const kitchenRes = await api().get('/api/hospitality/kitchen').set(headers);
    expect(kitchenRes.status).toBe(200);
    expect(kitchenRes.body.tickets.some((t: { id: string }) => t.id === orderItemId)).toBe(true);

    for (const status of ['preparing', 'ready', 'served'] as const) {
      const st = await api().patch(`/api/hospitality/order-items/${orderItemId}/status`).set(headers).send({ status });
      expect(st.status).toBe(200);
    }

    const billRes = await api().post(`/api/hospitality/orders/${orderId}/bill`).set(headers).send({});
    expect(billRes.status).toBe(200);

    const closeRes = await api().post(`/api/hospitality/orders/${orderId}/close`).set(headers).send({});
    expect(closeRes.status).toBe(200);

    const clearRes = await api().post(`/api/hospitality/tables/${table.id}/clear`).set(headers).send({});
    expect(clearRes.status).toBe(200);
  });

  it('covers entry queue: add → call-next → seat', async () => {
    const headers = authHeaders(token(HOSP_TENANT, HOSP_USER), HOSP_TENANT);

    const add = await api().post('/api/hospitality/queue').set(headers).send({ guestName: 'Asha', partySize: 3 });
    expect(add.status).toBe(200);
    expect(add.body.token).toMatch(/^T-/);

    const call = await api().post('/api/hospitality/queue/call-next').set(headers).send({});
    expect(call.status).toBe(200);

    const tablesRes = await api().get('/api/hospitality/tables').set(headers);
    const free = (tablesRes.body.tables as Array<{ id: string; status: string }>).find(t => t.status === 'available');
    expect(free).toBeTruthy();

    const seat = await api()
      .post(`/api/hospitality/queue/${call.body.id}/seat`)
      .set(headers)
      .send({ tableId: free!.id });
    expect(seat.status).toBe(200);

    const q = await api().get('/api/hospitality/queue').set(headers);
    expect(q.status).toBe(200);
    expect(q.body.nowServing || q.body.entries.length >= 0).toBeTruthy();
  });
});
