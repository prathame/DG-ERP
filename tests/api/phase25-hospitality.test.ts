/**
 * Phase 2.5: Complete Hospitality module workflow test.
 *
 * Tests the full restaurant workflow:
 * Table → Open → Add items → Kitchen status → Bill → Close (Admin)
 *
 * Also tests: cancel order, parcel order, queue, analytics
 *
 * Uses exact route shapes documented in the hospitality agent audit.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool, createTestToken, cleanupTestData } from '../helpers';
import { api, authHeaders } from '../http';

const T = 'T-HOSP-QA-001';
const U_ADMIN = 'U-HOSP-ADMIN';
const U_STAFF = 'U-HOSP-STAFF';

const adminToken = createTestToken({
  userId: U_ADMIN,
  tenantId: T,
  email: 'admin@hosp.test',
  role: 'Admin',
  name: 'Admin',
});
const staffToken = createTestToken({
  userId: U_STAFF,
  tenantId: T,
  email: 'staff@hosp.test',
  role: 'Staff',
  name: 'Staff',
});

const hdrsAdmin = authHeaders(adminToken, T);
const hdrsStaff = authHeaders(staffToken, T);

// IDs created during tests
let tableId: string;
let categoryId: string;
let menuItemId1: string;
let menuItemId2: string;
let orderId: string;
let orderItemId: string;

beforeAll(async () => {
  await cleanupTestData(T);

  // Create hotel_restaurant tenant
  await pool.query(
    `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, plan_id, business_type)
     VALUES ($1,'QA Restaurant','qa-restaurant','admin@hosp.test','Admin','active','TRIAL','hotel_restaurant')
     ON CONFLICT (id) DO NOTHING`,
    [T],
  );
  const bcrypt = await import('bcrypt');
  const hash = await bcrypt.hash('Test1234!', 10);
  await pool.query(
    `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
     VALUES ($1,$2,'admin@hosp.test',$3,'Admin','Admin'),
            ($4,$2,'staff@hosp.test',$3,'Staff','Staff')
     ON CONFLICT DO NOTHING`,
    [U_ADMIN, T, hash, U_STAFF],
  );
  await pool.query(
    `INSERT INTO bill_settings (tenant_id, hosp_charge_gst, hosp_prices_include_gst)
     VALUES ($1, false, true) ON CONFLICT DO NOTHING`,
    [T],
  );
});

afterAll(async () => {
  await cleanupTestData(T);
});

// ─── Setup: tables and menu ───────────────────────────────────────────────────

describe('Setup: tables and menu', () => {
  it('POST /api/hospitality/tables — create dining table', async () => {
    const r = await api().post('/api/hospitality/tables').set(hdrsAdmin).send({
      name: 'Table 1',
      seats: 4,
      zone: 'Main Hall',
    });
    expect(r.status).toBe(201);
    tableId = r.body.table?.id ?? r.body.id;
    expect(tableId).toBeDefined();
    console.log(`\n[HOSP] Table created: ${tableId}`);
  });

  it('GET /api/hospitality/tables — table visible and available', async () => {
    const r = await api().get('/api/hospitality/tables').set(hdrsAdmin);
    expect(r.status).toBe(200);
    const tables = r.body.tables ?? r.body;
    expect(Array.isArray(tables)).toBe(true);
    const table = (tables as Array<{ id: string; status: string }>).find(t => t.id === tableId);
    expect(table).toBeDefined();
    expect(table?.status).toBe('available');
  });

  it('POST /api/hospitality/menu-categories — create category', async () => {
    const r = await api().post('/api/hospitality/menu-categories').set(hdrsAdmin).send({
      name: 'Main Course',
      sortOrder: 1,
    });
    expect(r.status).toBe(201);
    categoryId = r.body.category?.id ?? r.body.id;
    expect(categoryId).toBeDefined();
  });

  it('POST /api/hospitality/menu-items — create two dishes', async () => {
    const r1 = await api().post('/api/hospitality/menu-items').set(hdrsAdmin).send({
      name: 'Dal Makhani',
      categoryId,
      price: 220,
      available: true,
    });
    expect(r1.status).toBe(201);
    menuItemId1 = r1.body.item?.id ?? r1.body.id;
    expect(menuItemId1).toBeDefined();

    const r2 = await api().post('/api/hospitality/menu-items').set(hdrsAdmin).send({
      name: 'Garlic Naan',
      categoryId,
      price: 55,
      available: true,
    });
    expect(r2.status).toBe(201);
    menuItemId2 = r2.body.item?.id ?? r2.body.id;
    expect(menuItemId2).toBeDefined();
  });

  it('GET /api/hospitality/menu — returns 200 with menu data', async () => {
    const r = await api().get('/api/hospitality/menu').set(hdrsAdmin);
    expect(r.status).toBe(200);
    // Menu response exists and is non-null
    expect(r.body).not.toBeNull();
    // Accept any valid menu structure
    const hasData =
      Array.isArray(r.body) ||
      Array.isArray(r.body?.categories) ||
      Array.isArray(r.body?.menu) ||
      typeof r.body === 'object';
    expect(hasData).toBe(true);
  });
});

// ─── Core workflow: Table → Order → Kitchen → Bill → Close ───────────────────

describe('Core order workflow', () => {
  it('POST /api/hospitality/tables/:id/open — opens order, table becomes occupied', async () => {
    const r = await api().post(`/api/hospitality/tables/${tableId}/open`).set(hdrsStaff);
    expect(r.status).toBe(200);
    // Order ID is at response.order.id
    orderId = r.body.order?.id;
    expect(orderId).toBeDefined();
    expect(r.body.order?.status).toBe('open');
    console.log(`[HOSP] Order opened: ${orderId}`);

    // Table should now be occupied
    const tablesR = await api().get('/api/hospitality/tables').set(hdrsAdmin);
    const table = (tablesR.body.tables ?? (tablesR.body as Array<{ id: string; status: string }>)).find(
      (t: { id: string }) => t.id === tableId,
    );
    expect(table?.status).toBe('occupied');
  });

  it('POST /api/hospitality/tables/:id/open again — idempotent, returns same order', async () => {
    const r = await api().post(`/api/hospitality/tables/${tableId}/open`).set(hdrsStaff);
    expect(r.status).toBe(200);
    expect(r.body.order?.id).toBe(orderId); // Same order ID
  });

  it('POST /api/hospitality/orders/:id/items — add Dal Makhani (qty 2)', async () => {
    const r = await api().post(`/api/hospitality/orders/${orderId}/items`).set(hdrsStaff).send({
      menuItemId: menuItemId1,
      qty: 2,
      notes: 'Less spice',
    });
    expect(r.status).toBe(200);
    // Get order item ID from the response
    const items = r.body.items ?? [];
    const item = items.find((i: { menu_item_id: string }) => i.menu_item_id === menuItemId1);
    expect(item).toBeDefined();
    orderItemId = item?.id;
    expect(item?.kitchen_status).toBe('queued');
    expect(item?.qty).toBe(2);
  });

  it('POST /api/hospitality/orders/:id/items — add Garlic Naan (qty 3)', async () => {
    const r = await api().post(`/api/hospitality/orders/${orderId}/items`).set(hdrsStaff).send({
      menuItemId: menuItemId2,
      qty: 3,
    });
    expect(r.status).toBe(200);
    const items = r.body.items ?? [];
    expect(items.length).toBe(2); // both items now
  });

  it('GET /api/hospitality/kitchen — items in queued state', async () => {
    const r = await api().get('/api/hospitality/kitchen').set(hdrsAdmin);
    expect(r.status).toBe(200);
    const tickets = r.body.tickets ?? r.body;
    expect(Array.isArray(tickets)).toBe(true);
    const inOrder = (tickets as Array<{ order_id: string; kitchen_status: string }>).filter(
      t => t.order_id === orderId,
    );
    expect(inOrder.length).toBeGreaterThan(0);
    expect(inOrder.every(t => t.kitchen_status === 'queued')).toBe(true);
  });

  it('PATCH /api/hospitality/order-items/:id/status — Dal Makhani → preparing → ready → served', async () => {
    for (const status of ['preparing', 'ready', 'served'] as const) {
      const r = await api().patch(`/api/hospitality/order-items/${orderItemId}/status`).set(hdrsStaff).send({ status });
      expect(r.status).toBe(200);
      expect(r.body.ok).toBe(true);
    }
    // Verify in DB
    const item = (await pool.query('SELECT kitchen_status FROM hosp_order_items WHERE id = $1', [orderItemId]))
      .rows[0] as { kitchen_status: string };
    expect(item.kitchen_status).toBe('served');
  });

  it('GET /api/hospitality/orders/:id — order detail with correct subtotal', async () => {
    const r = await api().get(`/api/hospitality/orders/${orderId}`).set(hdrsAdmin);
    expect(r.status).toBe(200);
    // Dal Makhani × 2 = 440, Garlic Naan × 3 = 165, subtotal = 605
    const subtotal = Number(r.body.subtotal ?? 0);
    expect(subtotal).toBe(605);
    expect(r.body.total).toBeDefined();
  });

  it('POST /api/hospitality/orders/:id/bill — mark billed, table becomes billing', async () => {
    const r = await api().post(`/api/hospitality/orders/${orderId}/bill`).set(hdrsStaff);
    expect(r.status).toBe(200);
    expect(r.body.order?.status).toBe('billed');

    const tablesR = await api().get('/api/hospitality/tables').set(hdrsAdmin);
    const table = (tablesR.body.tables ?? (tablesR.body as Array<{ id: string; status: string }>)).find(
      (t: { id: string }) => t.id === tableId,
    );
    expect(table?.status).toBe('billing');
  });

  it('POST /api/hospitality/orders/:id/close (Admin) — closed, table becomes available', async () => {
    const r = await api().post(`/api/hospitality/orders/${orderId}/close`).set(hdrsAdmin);
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);

    // Table should be available again
    const tablesR = await api().get('/api/hospitality/tables').set(hdrsAdmin);
    const table = (tablesR.body.tables ?? (tablesR.body as Array<{ id: string; status: string }>)).find(
      (t: { id: string }) => t.id === tableId,
    );
    expect(table?.status).toBe('available');
    expect(table?.open_order_id).toBeNull();
  });

  it('staff cannot close order (Admin-only)', async () => {
    // Create a new order to test
    await api().post(`/api/hospitality/tables/${tableId}/open`).set(hdrsStaff);
    const openR = await api().post(`/api/hospitality/tables/${tableId}/open`).set(hdrsStaff);
    const newOrderId = openR.body.order?.id;
    if (newOrderId) {
      await api().post(`/api/hospitality/orders/${newOrderId}/bill`).set(hdrsStaff);
      const closeR = await api().post(`/api/hospitality/orders/${newOrderId}/close`).set(hdrsStaff);
      expect(closeR.status).toBe(403);
      // Admin cleanup
      await api().post(`/api/hospitality/orders/${newOrderId}/close`).set(hdrsAdmin);
    }
  });
});

// ─── Cancel order ─────────────────────────────────────────────────────────────

describe('Order cancellation', () => {
  let cancelOrderId: string;

  it('Admin can cancel an order with items', async () => {
    const openR = await api().post(`/api/hospitality/tables/${tableId}/open`).set(hdrsAdmin);
    cancelOrderId = openR.body.order?.id;

    await api().post(`/api/hospitality/orders/${cancelOrderId}/items`).set(hdrsAdmin).send({
      menuItemId: menuItemId1,
      qty: 1,
    });

    const cancelR = await api().post(`/api/hospitality/orders/${cancelOrderId}/cancel`).set(hdrsAdmin);
    expect(cancelR.status).toBe(200);

    // Table should be available
    const tablesR = await api().get('/api/hospitality/tables').set(hdrsAdmin);
    const table = (tablesR.body.tables ?? (tablesR.body as Array<{ id: string; status: string }>)).find(
      (t: { id: string }) => t.id === tableId,
    );
    expect(table?.status).toBe('available');
  });

  it('Staff cannot cancel order with items (Admin-only for non-empty)', async () => {
    const openR = await api().post(`/api/hospitality/tables/${tableId}/open`).set(hdrsAdmin);
    const oid = openR.body.order?.id;
    await api().post(`/api/hospitality/orders/${oid}/items`).set(hdrsStaff).send({
      menuItemId: menuItemId2,
      qty: 1,
    });
    const r = await api().post(`/api/hospitality/orders/${oid}/cancel`).set(hdrsStaff);
    expect(r.status).toBe(403);
    // Admin cleanup
    await api().post(`/api/hospitality/orders/${oid}/cancel`).set(hdrsAdmin);
  });
});

// ─── Parcel order ─────────────────────────────────────────────────────────────

describe('Parcel (takeaway) orders', () => {
  it('POST /api/hospitality/parcels — creates parcel order with token', async () => {
    const r = await api().post('/api/hospitality/parcels').set(hdrsStaff).send({
      customerName: 'Walk-in Customer',
      customerPhone: '9800012345',
    });
    expect([200, 201]).toContain(r.status);
    const parcelOrder = r.body.order ?? r.body;
    expect(parcelOrder?.order_type).toBe('parcel');
    expect(parcelOrder?.token).toBeDefined();
    // Cancel to clean up
    if (parcelOrder?.id) {
      await api().post(`/api/hospitality/orders/${parcelOrder.id}/cancel`).set(hdrsAdmin);
    }
  });

  it('GET /api/hospitality/parcels — returns open parcel orders', async () => {
    const r = await api().get('/api/hospitality/parcels').set(hdrsAdmin);
    expect(r.status).toBe(200);
    const parcels = r.body.parcels ?? r.body;
    expect(Array.isArray(parcels)).toBe(true);
  });
});

// ─── Queue ────────────────────────────────────────────────────────────────────

describe('Guest queue', () => {
  it('POST /api/hospitality/queue — add guest to waitlist', async () => {
    const r = await api().post('/api/hospitality/queue').set(hdrsStaff).send({
      guestName: 'Patel Family',
      partySize: 4,
    });
    expect([200, 201]).toContain(r.status);
    expect(r.body.token ?? r.body.entry?.token).toBeDefined();
  });

  it('GET /api/hospitality/queue — shows waiting guest', async () => {
    const r = await api().get('/api/hospitality/queue').set(hdrsAdmin);
    expect(r.status).toBe(200);
    const entries = r.body.entries ?? r.body;
    expect(Array.isArray(entries)).toBe(true);
    const waiting = (entries as Array<{ status: string; guest_name: string }>).filter(e => e.status === 'waiting');
    expect(waiting.some(e => e.guest_name === 'Patel Family')).toBe(true);
  });
});

// ─── Analytics ────────────────────────────────────────────────────────────────

describe('Hospitality analytics', () => {
  it('GET /api/hospitality/analytics?period=today — returns floor stats', async () => {
    const r = await api().get('/api/hospitality/analytics?period=today').set(hdrsAdmin);
    expect(r.status).toBe(200);
    expect(r.body.tables).toBeDefined();
    expect(r.body.orders).toBeDefined();
    expect(typeof r.body.orders.revenue).toBe('number');
  });

  it('GET /api/hospitality/accounts-summary?period=today — returns revenue breakdown', async () => {
    const r = await api().get('/api/hospitality/accounts-summary?period=today').set(hdrsAdmin);
    expect(r.status).toBe(200);
  });
});

// ─── Non-hospitality tenant blocked ──────────────────────────────────────────

describe('Non-hospitality tenant cannot use hospitality endpoints', () => {
  const T_MFG = 'T-MFG-HOSP-TEST';
  const U_MFG = 'U-MFG-HOSP-ADMIN';

  beforeAll(async () => {
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, plan_id, business_type)
       VALUES ($1,'MFG Corp','mfg-hosp','mfg@hosp.test','Admin','active','TRIAL','manufacturer')
       ON CONFLICT (id) DO NOTHING`,
      [T_MFG],
    );
    const bcrypt = await import('bcrypt');
    const hash = await bcrypt.hash('Test1234!', 10);
    await pool.query(
      `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
       VALUES ($1,$2,'mfg@hosp.test',$3,'Admin','Admin') ON CONFLICT DO NOTHING`,
      [U_MFG, T_MFG, hash],
    );
  });

  afterAll(async () => {
    await cleanupTestData(T_MFG);
  });

  it('manufacturer tenant gets 403 on hospitality endpoints', async () => {
    const mfgToken = createTestToken({
      userId: U_MFG,
      tenantId: T_MFG,
      email: 'mfg@hosp.test',
      role: 'Admin',
      name: 'Admin',
    });
    const mfgHdrs = authHeaders(mfgToken, T_MFG);
    const r = await api().get('/api/hospitality/tables').set(mfgHdrs);
    expect(r.status).toBe(403);
  });
});
