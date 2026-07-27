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
    const headers = authHeaders(token(MFG_TENANT, MFG_USER), MFG_TENANT);
    const res = await api().get('/api/hospitality/tables').set(headers);
    expect(res.status).toBe(403);

    const catalog = await api().post('/api/hospitality/menu-categories').set(headers).send({ name: 'Nope' });
    expect(catalog.status).toBe(403);

    const parcels = await api().post('/api/hospitality/parcels').set(headers).send({ customerName: 'X' });
    expect(parcels.status).toBe(403);

    const analytics = await api().get('/api/hospitality/analytics').set(headers);
    expect(analytics.status).toBe(403);

    const accounts = await api().get('/api/hospitality/accounts-summary').set(headers);
    expect(accounts.status).toBe(403);
  });

  it('returns hospitality analytics snapshot for hotel tenants', async () => {
    const headers = authHeaders(token(HOSP_TENANT, HOSP_USER), HOSP_TENANT);
    await seedHospitalityCatalog(HOSP_TENANT);

    const res = await api().get('/api/hospitality/analytics?period=today').set(headers);
    expect(res.status).toBe(200);
    expect(res.body.period).toBe('today');
    expect(res.body.tables).toMatchObject({
      total: expect.any(Number),
      occupied: expect.any(Number),
      available: expect.any(Number),
    });
    expect(res.body.orders).toMatchObject({
      dineIn: expect.any(Number),
      parcel: expect.any(Number),
      total: expect.any(Number),
      revenue: expect.any(Number),
    });
    expect(typeof res.body.kitchenQueueDepth).toBe('number');
    expect(typeof res.body.parcelsOpen).toBe('number');
  });

  it('creates party quote with free-text lines (no product barcode)', async () => {
    const headers = authHeaders(token(HOSP_TENANT, HOSP_USER), HOSP_TENANT);
    const res = await api()
      .post('/api/quotations')
      .set(headers)
      .send({
        customerName: 'Sharma Wedding',
        customerPhone: '9876500000',
        items: [
          { description: 'Veg thali × 50', quantity: 50, customPrice: 250, withGst: true },
          { description: 'Paneer platter', quantity: 10, customPrice: 800, withGst: true },
        ],
        gstRate: 5,
      });
    expect(res.status).toBe(201);
    expect(res.body.customerName || res.body.customer_name || res.body.vendorName).toBeTruthy();
    const items = res.body.items as Array<{ productId: string; productName: string; quantity: number }>;
    expect(items.length).toBe(2);
    expect(items[0].productId).toBe('');
    expect(items[0].productName).toMatch(/Veg thali/i);
    expect(Number(res.body.total)).toBeGreaterThan(0);
  });

  it('returns restaurant accounts summary for hotel tenants', async () => {
    const headers = authHeaders(token(HOSP_TENANT, HOSP_USER), HOSP_TENANT);
    const res = await api().get('/api/hospitality/accounts-summary?period=week').set(headers);
    expect(res.status).toBe(200);
    expect(res.body.period).toBe('week');
    expect(res.body.sales).toMatchObject({
      revenue: expect.any(Number),
      orderCount: expect.any(Number),
      dineIn: { revenue: expect.any(Number), orders: expect.any(Number) },
      parcel: { revenue: expect.any(Number), orders: expect.any(Number) },
    });
    expect(Array.isArray(res.body.byDay)).toBe(true);
    expect(res.body.expenses).toMatchObject({
      total: expect.any(Number),
      count: expect.any(Number),
      byCategory: expect.any(Array),
    });
    expect(res.body.gst).toMatchObject({
      chargeGst: expect.any(Boolean),
      pricesIncludeGst: expect.any(Boolean),
      note: expect.any(String),
    });
  });

  it('saves optional guest fields and looks up member by phone', async () => {
    const headers = authHeaders(token(HOSP_TENANT, HOSP_USER), HOSP_TENANT);
    await seedHospitalityCatalog(HOSP_TENANT);

    const plan = await api().post('/api/hospitality/membership-plans').set(headers).send({
      name: 'Guest Lookup Plan',
      period: 'monthly',
      fee: 100,
      discountPercent: 0,
      useMemberPrices: true,
    });
    expect(plan.status).toBe(201);
    const mem = await api().post('/api/hospitality/members').set(headers).send({
      name: 'Priya Guest',
      phone: '9876501234',
      planId: plan.body.plan.id,
    });
    expect(mem.status).toBe(201);

    const byPhone = await api().get('/api/hospitality/members?phone=9876501234').set(headers);
    expect(byPhone.status).toBe(200);
    expect(byPhone.body.members).toHaveLength(1);
    expect(byPhone.body.members[0].name).toBe('Priya Guest');
    expect(byPhone.body.members[0].valid).toBe(true);

    const lookupOk = await api().get('/api/hospitality/members/lookup?phone=9876501234').set(headers);
    expect(lookupOk.status).toBe(200);
    expect(lookupOk.body).toMatchObject({ found: true, valid: true, member: { name: 'Priya Guest' } });

    const lookupMiss = await api().get('/api/hospitality/members/lookup?phone=0000000000').set(headers);
    expect(lookupMiss.status).toBe(200);
    expect(lookupMiss.body).toMatchObject({ found: false, valid: false, member: null });
    expect(String(lookupMiss.body.reason || '')).toMatch(/no membership/i);

    const tables = await api().get('/api/hospitality/tables').set(headers);
    const table = tables.body.tables.find((t: { status: string }) => t.status === 'available') || tables.body.tables[0];
    const opened = await api().post(`/api/hospitality/tables/${table.id}/open`).set(headers).send({});
    expect(opened.status).toBe(200);
    const orderId = opened.body.order.id as string;

    const emptyGuest = await api().put(`/api/hospitality/orders/${orderId}/guest`).set(headers).send({
      customerName: '',
      customerPhone: '',
    });
    expect(emptyGuest.status).toBe(200);
    expect(emptyGuest.body.order.customer_name).toBe('');
    expect(emptyGuest.body.order.customer_phone).toBe('');

    const guest = await api().put(`/api/hospitality/orders/${orderId}/guest`).set(headers).send({
      customerName: 'Walk-in',
      customerPhone: '9876501234',
    });
    expect(guest.status).toBe(200);
    expect(guest.body.order.customer_name).toBe('Walk-in');
    expect(guest.body.order.customer_phone).toBe('9876501234');

    const attached = await api()
      .put(`/api/hospitality/orders/${orderId}/member`)
      .set(headers)
      .send({ memberId: mem.body.member.id });
    expect(attached.status).toBe(200);
    expect(attached.body.member?.id).toBe(mem.body.member.id);
    expect(attached.body.order.customer_name).toBe('Priya Guest');
    expect(attached.body.order.customer_phone).toBe('9876501234');
  });

  it('covers order lifecycle: open → add item → kitchen → bill → payment done (available)', async () => {
    const headers = authHeaders(token(HOSP_TENANT, HOSP_USER), HOSP_TENANT);

    await seedHospitalityCatalog(HOSP_TENANT);

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
    expect(billRes.body.table?.status || billRes.body.order.status).toBeTruthy();

    const closeRes = await api().post(`/api/hospitality/orders/${orderId}/close`).set(headers).send({});
    expect(closeRes.status).toBe(200);

    const after = await api().get('/api/hospitality/tables').set(headers);
    const freed = (after.body.tables as Array<{ id: string; status: string }>).find(t => t.id === table.id);
    expect(freed?.status).toBe('available');
  });

  it('Waiter cannot mark payment done; Admin can and frees table', async () => {
    const adminHeaders = authHeaders(token(HOSP_TENANT, HOSP_USER), HOSP_TENANT);
    const waiterId = 'U-TEST-HOSP-WAITER';
    const hash = await bcrypt.hash('password123', 12);
    await pool.query(
      `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
       VALUES ($1, $2, $3, $4, 'Waiter', 'Waiter')
       ON CONFLICT DO NOTHING`,
      [waiterId, HOSP_TENANT, `${waiterId}@test.com`, hash],
    );
    const waiterHeaders = authHeaders(token(HOSP_TENANT, waiterId), HOSP_TENANT);

    await seedHospitalityCatalog(HOSP_TENANT);
    const tables = await api().get('/api/hospitality/tables').set(adminHeaders);
    const free = (tables.body.tables as Array<{ id: string; status: string }>).find(t => t.status === 'available');
    expect(free).toBeTruthy();
    const open = await api().post(`/api/hospitality/tables/${free!.id}/open`).set(waiterHeaders).send({});
    expect(open.status).toBe(200);
    const orderId = open.body.order.id as string;

    const menu = await api().get('/api/hospitality/menu').set(waiterHeaders);
    const item = menu.body.items[0] as { id: string };
    await api()
      .post(`/api/hospitality/orders/${orderId}/items`)
      .set(waiterHeaders)
      .send({ menuItemId: item.id, qty: 1 });
    const bill = await api().post(`/api/hospitality/orders/${orderId}/bill`).set(waiterHeaders).send({});
    expect(bill.status).toBe(200);

    const denied = await api().post(`/api/hospitality/orders/${orderId}/close`).set(waiterHeaders).send({});
    expect(denied.status).toBe(403);

    const clearDenied = await api().post(`/api/hospitality/tables/${free!.id}/clear`).set(waiterHeaders).send({});
    expect(clearDenied.status).toBe(403);

    const paid = await api().post(`/api/hospitality/orders/${orderId}/close`).set(adminHeaders).send({});
    expect(paid.status).toBe(200);
    const after = await api().get('/api/hospitality/tables').set(waiterHeaders);
    expect((after.body.tables as Array<{ id: string; status: string }>).find(t => t.id === free!.id)?.status).toBe(
      'available',
    );
  });

  it('cancels open order (Admin any; Waiter empty only) and removes queued lines', async () => {
    const adminHeaders = authHeaders(token(HOSP_TENANT, HOSP_USER), HOSP_TENANT);
    const waiterId = 'U-TEST-HOSP-WAITER-CANCEL';
    const hash = await bcrypt.hash('password123', 12);
    await pool.query(
      `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
       VALUES ($1, $2, $3, $4, 'Waiter', 'Waiter')
       ON CONFLICT DO NOTHING`,
      [waiterId, HOSP_TENANT, `${waiterId}@test.com`, hash],
    );
    const waiterHeaders = authHeaders(token(HOSP_TENANT, waiterId), HOSP_TENANT);

    await seedHospitalityCatalog(HOSP_TENANT);
    const tables = await api().get('/api/hospitality/tables').set(adminHeaders);
    const free = (tables.body.tables as Array<{ id: string; status: string }>).find(t => t.status === 'available');
    expect(free).toBeTruthy();

    // Waiter can cancel empty open order
    const emptyOpen = await api().post(`/api/hospitality/tables/${free!.id}/open`).set(waiterHeaders).send({});
    expect(emptyOpen.status).toBe(200);
    const emptyCancel = await api()
      .post(`/api/hospitality/orders/${emptyOpen.body.order.id}/cancel`)
      .set(waiterHeaders)
      .send({});
    expect(emptyCancel.status).toBe(200);

    const reopen = await api().post(`/api/hospitality/tables/${free!.id}/open`).set(waiterHeaders).send({});
    const orderId = reopen.body.order.id as string;
    const menu = await api().get('/api/hospitality/menu').set(waiterHeaders);
    const item = menu.body.items[0] as { id: string };
    const added = await api()
      .post(`/api/hospitality/orders/${orderId}/items`)
      .set(waiterHeaders)
      .send({ menuItemId: item.id, qty: 1 });
    expect(added.status).toBe(200);
    const lineId = added.body.items[0].id as string;

    const waiterDenied = await api().post(`/api/hospitality/orders/${orderId}/cancel`).set(waiterHeaders).send({});
    expect(waiterDenied.status).toBe(403);

    const removed = await api().delete(`/api/hospitality/order-items/${lineId}`).set(waiterHeaders);
    expect(removed.status).toBe(200);
    expect(removed.body.items.length).toBe(0);

    // Re-add and Admin cancel with items
    const added2 = await api()
      .post(`/api/hospitality/orders/${orderId}/items`)
      .set(waiterHeaders)
      .send({ menuItemId: item.id, qty: 1 });
    expect(added2.status).toBe(200);
    const adminCancel = await api().post(`/api/hospitality/orders/${orderId}/cancel`).set(adminHeaders).send({});
    expect(adminCancel.status).toBe(200);
    const after = await api().get('/api/hospitality/tables').set(adminHeaders);
    expect((after.body.tables as Array<{ id: string; status: string }>).find(t => t.id === free!.id)?.status).toBe(
      'available',
    );
  });

  it('Admin bulk-cancels orders by tableIds and bulk-deletes free tables', async () => {
    const adminHeaders = authHeaders(token(HOSP_TENANT, HOSP_USER), HOSP_TENANT);
    const waiterId = 'U-TEST-HOSP-WAITER-BULK';
    const hash = await bcrypt.hash('password123', 12);
    await pool.query(
      `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
       VALUES ($1, $2, $3, $4, 'Waiter', 'Waiter')
       ON CONFLICT DO NOTHING`,
      [waiterId, HOSP_TENANT, `${waiterId}@test.com`, hash],
    );
    const waiterHeaders = authHeaders(token(HOSP_TENANT, waiterId), HOSP_TENANT);

    await seedHospitalityCatalog(HOSP_TENANT);
    const t1 = await api()
      .post('/api/hospitality/tables')
      .set(adminHeaders)
      .send({ name: 'Bulk-A', seats: 2, zone: 'Test' });
    const t2 = await api()
      .post('/api/hospitality/tables')
      .set(adminHeaders)
      .send({ name: 'Bulk-B', seats: 2, zone: 'Test' });
    expect(t1.status).toBe(201);
    expect(t2.status).toBe(201);
    const id1 = t1.body.table.id as string;
    const id2 = t2.body.table.id as string;

    await api().post(`/api/hospitality/tables/${id1}/open`).set(adminHeaders).send({});
    await api().post(`/api/hospitality/tables/${id2}/open`).set(adminHeaders).send({});

    const denied = await api()
      .post('/api/hospitality/orders/bulk-cancel')
      .set(waiterHeaders)
      .send({ tableIds: [id1, id2] });
    expect(denied.status).toBe(403);

    const cancelled = await api()
      .post('/api/hospitality/orders/bulk-cancel')
      .set(adminHeaders)
      .send({ tableIds: [id1, id2] });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.cancelled).toBe(2);

    const bulkDelDenied = await api()
      .post('/api/hospitality/tables/bulk-delete')
      .set(waiterHeaders)
      .send({ ids: [id1, id2] });
    expect(bulkDelDenied.status).toBe(403);

    const deleted = await api()
      .post('/api/hospitality/tables/bulk-delete')
      .set(adminHeaders)
      .send({ ids: [id1, id2] });
    expect(deleted.status).toBe(200);
    expect(deleted.body.deleted).toBe(2);
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

  it('catalog CRUD: category → item → modifier → table', async () => {
    const headers = authHeaders(token(HOSP_TENANT, HOSP_USER), HOSP_TENANT);

    const cat = await api()
      .post('/api/hospitality/menu-categories')
      .set(headers)
      .send({ name: 'Admin Cat', sortOrder: 99 });
    expect(cat.status).toBe(201);
    const categoryId = cat.body.category.id as string;

    const item = await api()
      .post('/api/hospitality/menu-items')
      .set(headers)
      .send({ name: 'Admin Dish', categoryId, price: 199, description: 'Test', available: true });
    expect(item.status).toBe(201);
    const itemId = item.body.item.id as string;

    const upd = await api()
      .put(`/api/hospitality/menu-items/${itemId}`)
      .set(headers)
      .send({ name: 'Admin Dish', categoryId, price: 249, available: false });
    expect(upd.status).toBe(200);
    expect(Number(upd.body.item.price)).toBe(249);
    expect(upd.body.item.available).toBe(false);

    const group = await api()
      .post('/api/hospitality/modifier-groups')
      .set(headers)
      .send({ name: 'Extra Sauce', required: false, maxSelect: 2 });
    expect(group.status).toBe(201);
    const groupId = group.body.group.id as string;

    const mod = await api()
      .post(`/api/hospitality/modifier-groups/${groupId}/modifiers`)
      .set(headers)
      .send({ name: 'Garlic', priceDelta: 20 });
    expect(mod.status).toBe(201);

    const link = await api()
      .put(`/api/hospitality/menu-items/${itemId}`)
      .set(headers)
      .send({ name: 'Admin Dish', categoryId, price: 249, available: true, modifierGroupIds: [groupId] });
    expect(link.status).toBe(200);

    const groups = await api().get('/api/hospitality/modifier-groups').set(headers);
    expect(groups.status).toBe(200);
    expect(groups.body.groups.some((g: { id: string }) => g.id === groupId)).toBe(true);

    const table = await api()
      .post('/api/hospitality/tables')
      .set(headers)
      .send({ name: 'Admin-T99', seats: 3, zone: 'Patio' });
    expect(table.status).toBe(201);
    const tableId = table.body.table.id as string;

    const tUpd = await api()
      .put(`/api/hospitality/tables/${tableId}`)
      .set(headers)
      .send({ name: 'Admin-T99', seats: 5, zone: 'Patio' });
    expect(tUpd.status).toBe(200);
    expect(tUpd.body.table.seats).toBe(5);

    const delItem = await api().delete(`/api/hospitality/menu-items/${itemId}`).set(headers);
    expect(delItem.status).toBe(200);
    const delMod = await api().delete(`/api/hospitality/modifiers/${mod.body.modifier.id}`).set(headers);
    expect(delMod.status).toBe(200);
    const delGroup = await api().delete(`/api/hospitality/modifier-groups/${groupId}`).set(headers);
    expect(delGroup.status).toBe(200);
    const delCat = await api().delete(`/api/hospitality/menu-categories/${categoryId}`).set(headers);
    expect(delCat.status).toBe(200);
    const delTable = await api().delete(`/api/hospitality/tables/${tableId}`).set(headers);
    expect(delTable.status).toBe(200);
  });

  it('rejects DELETE table while an open order exists', async () => {
    const headers = authHeaders(token(HOSP_TENANT, HOSP_USER), HOSP_TENANT);

    const table = await api()
      .post('/api/hospitality/tables')
      .set(headers)
      .send({ name: 'Busy-Del-T', seats: 2, zone: 'Test' });
    expect(table.status).toBe(201);
    const tableId = table.body.table.id as string;

    const open = await api().post(`/api/hospitality/tables/${tableId}/open`).set(headers).send({});
    expect(open.status).toBe(200);

    const blocked = await api().delete(`/api/hospitality/tables/${tableId}`).set(headers);
    expect(blocked.status).toBe(400);
    expect(String(blocked.body.error || '')).toMatch(/active order/i);

    const close = await api().post(`/api/hospitality/orders/${open.body.order.id}/close`).set(headers).send({});
    expect(close.status).toBe(200);
  });

  it('parcel lifecycle: create → add item → kitchen label → bill → close', async () => {
    const headers = authHeaders(token(HOSP_TENANT, HOSP_USER), HOSP_TENANT);
    await seedHospitalityCatalog(HOSP_TENANT);

    const created = await api()
      .post('/api/hospitality/parcels')
      .set(headers)
      .send({ customerName: 'Ravi', customerPhone: '9999999999' });
    expect(created.status).toBe(201);
    expect(created.body.order.order_type).toBe('parcel');
    expect(created.body.order.table_id).toBeNull();
    expect(created.body.label).toMatch(/Parcel/);
    const orderId = created.body.order.id as string;

    const menu = await api().get('/api/hospitality/menu').set(headers);
    expect(menu.status).toBe(200);
    const item = menu.body.items[0];
    expect(item).toBeTruthy();

    const added = await api()
      .post(`/api/hospitality/orders/${orderId}/items`)
      .set(headers)
      .send({ menuItemId: item.id, qty: 1 });
    expect(added.status).toBe(200);
    expect(added.body.items.length).toBeGreaterThanOrEqual(1);

    const kitchen = await api().get('/api/hospitality/kitchen').set(headers);
    expect(kitchen.status).toBe(200);
    const ticket = kitchen.body.tickets.find(
      (t: { order_type?: string; label?: string }) =>
        t.order_type === 'parcel' || String(t.label || '').includes('Parcel'),
    );
    expect(ticket).toBeTruthy();

    const list = await api().get('/api/hospitality/parcels').set(headers);
    expect(list.status).toBe(200);
    expect(list.body.parcels.some((p: { id: string }) => p.id === orderId)).toBe(true);

    const bill = await api().post(`/api/hospitality/orders/${orderId}/bill`).set(headers).send({});
    expect(bill.status).toBe(200);
    expect(bill.body.order.status).toBe('billed');

    const close = await api().post(`/api/hospitality/orders/${orderId}/close`).set(headers).send({});
    expect(close.status).toBe(200);

    const after = await api().get('/api/hospitality/parcels').set(headers);
    expect(after.body.parcels.some((p: { id: string }) => p.id === orderId)).toBe(false);
  });

  it('membership pricing: member_price / % off for active; list for expired; order discount', async () => {
    const headers = authHeaders(token(HOSP_TENANT, HOSP_USER), HOSP_TENANT);
    await seedHospitalityCatalog(HOSP_TENANT);

    const planMp = await api().post('/api/hospitality/membership-plans').set(headers).send({
      name: 'Gold MP',
      period: 'monthly',
      fee: 499,
      discountPercent: 0,
      useMemberPrices: true,
    });
    expect(planMp.status).toBe(201);
    const planPct = await api().post('/api/hospitality/membership-plans').set(headers).send({
      name: 'Silver Pct',
      period: 'monthly',
      fee: 199,
      discountPercent: 10,
      useMemberPrices: false,
    });
    expect(planPct.status).toBe(201);

    const memActive = await api()
      .post('/api/hospitality/members')
      .set(headers)
      .send({ name: 'Active Mem', phone: '9000000001', planId: planMp.body.plan.id });
    expect(memActive.status).toBe(201);
    const memPct = await api()
      .post('/api/hospitality/members')
      .set(headers)
      .send({ name: 'Pct Mem', phone: '9000000002', planId: planPct.body.plan.id });
    expect(memPct.status).toBe(201);
    const memExp = await api()
      .post('/api/hospitality/members')
      .set(headers)
      .send({ name: 'Exp Mem', phone: '9000000003', planId: planMp.body.plan.id });
    expect(memExp.status).toBe(201);
    await api().put(`/api/hospitality/members/${memExp.body.member.id}`).set(headers).send({
      name: 'Exp Mem',
      phone: '9000000003',
      planId: planMp.body.plan.id,
      status: 'expired',
    });

    const cats = await api().get('/api/hospitality/menu-categories').set(headers);
    const categoryId = cats.body.categories[0].id as string;
    const dish = await api().post('/api/hospitality/menu-items').set(headers).send({
      name: 'Member Dish',
      categoryId,
      price: 200,
      memberPrice: 150,
      available: true,
    });
    expect(dish.status).toBe(201);
    const dishId = dish.body.item.id as string;

    async function openAndPrice(memberId: string) {
      const tables = await api().get('/api/hospitality/tables').set(headers);
      const free = (tables.body.tables as Array<{ id: string; status: string }>).find(t => t.status === 'available');
      expect(free).toBeTruthy();
      const open = await api().post(`/api/hospitality/tables/${free!.id}/open`).set(headers).send({});
      const orderId = open.body.order.id as string;
      await api().put(`/api/hospitality/orders/${orderId}/member`).set(headers).send({ memberId });
      const add = await api()
        .post(`/api/hospitality/orders/${orderId}/items`)
        .set(headers)
        .send({ menuItemId: dishId, qty: 1 });
      expect(add.status).toBe(200);
      return { orderId, unit: Number(add.body.items[0].unit_price), tableId: free!.id };
    }

    const a = await openAndPrice(memActive.body.member.id);
    expect(a.unit).toBe(150);
    await api().post(`/api/hospitality/orders/${a.orderId}/close`).set(headers).send({});

    const p = await openAndPrice(memPct.body.member.id);
    expect(p.unit).toBe(180);
    const disc = await api()
      .put(`/api/hospitality/orders/${p.orderId}/discount`)
      .set(headers)
      .send({ discountPercent: 10, discountAmount: 0 });
    expect(disc.status).toBe(200);
    expect(Number(disc.body.subtotal)).toBe(180);
    expect(Number(disc.body.discount_value)).toBe(18);
    expect(Number(disc.body.total)).toBe(162);
    await api().post(`/api/hospitality/orders/${p.orderId}/close`).set(headers).send({});

    const e = await openAndPrice(memExp.body.member.id);
    expect(e.unit).toBe(200);
    await api().post(`/api/hospitality/orders/${e.orderId}/close`).set(headers).send({});
  });
});
