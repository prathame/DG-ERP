/**
 * HTTP coverage for quiet notification center + SA pushes.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import bcrypt from 'bcrypt';
import { pool, cleanupTestData, createTestToken, createSuperAdminToken } from '../helpers';
import { api, authHeaders } from '../http';
import { uid } from '../../server/utils/helpers';

const TENANT = 'T-TEST-HTTP-NOTIF';
const USER = 'U-HTTP-NOTIF';
const VENDOR_USER = 'U-HTTP-NOTIF-V';
const WAREHOUSE_USER = 'U-HTTP-NOTIF-W';
let token = '';
let vendorToken = '';
let warehouseToken = '';
let saToken = '';

describe('HTTP: notifications feed + SA notify', () => {
  beforeAll(async () => {
    await cleanupTestData(TENANT);
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, business_type)
       VALUES ($1, 'HTTP Notif Co', 'http-notif-co', 'http-notif@test.com', 'Admin', 'active', 'manufacturer')
       ON CONFLICT (id) DO NOTHING`,
      [TENANT],
    );
    const hash = bcrypt.hashSync('password123', 12);
    await pool.query(
      `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
       VALUES ($1, $2, 'http-notif@test.com', $3, 'Admin', 'Admin')
       ON CONFLICT DO NOTHING`,
      [USER, TENANT, hash],
    );
    await pool.query(
      `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
       VALUES ($1, $2, 'http-notif-v@test.com', $3, 'Vendor', 'Vendor')
       ON CONFLICT DO NOTHING`,
      [VENDOR_USER, TENANT, hash],
    );
    await pool.query(
      `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
       VALUES ($1, $2, 'http-notif-w@test.com', $3, 'Warehouse', 'Warehouse')
       ON CONFLICT DO NOTHING`,
      [WAREHOUSE_USER, TENANT, hash],
    );
    token = createTestToken({
      userId: USER,
      tenantId: TENANT,
      email: 'http-notif@test.com',
      role: 'Admin',
      name: 'Admin',
    });
    vendorToken = createTestToken({
      userId: VENDOR_USER,
      tenantId: TENANT,
      email: 'http-notif-v@test.com',
      role: 'Vendor',
      name: 'Vendor',
    });
    warehouseToken = createTestToken({
      userId: WAREHOUSE_USER,
      tenantId: TENANT,
      email: 'http-notif-w@test.com',
      role: 'Warehouse',
      name: 'Warehouse',
    });
    saToken = createSuperAdminToken();
  });

  afterAll(async () => {
    await cleanupTestData(TENANT);
  });

  it('returns feed shape', async () => {
    const res = await api().get('/api/notifications').set(authHeaders(token, TENANT));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.generatedAt).toBeTruthy();
  });

  it('SA notify appears in feed and can be marked read', async () => {
    const notify = await api()
      .post(`/api/super-admin/tenants/${TENANT}/notify`)
      .set({ Authorization: `Bearer ${saToken}` })
      .send({ title: 'SA Ping', message: 'Hello tenant', type: 'warning' });
    expect(notify.status).toBe(200);
    expect(notify.body.id).toBeTruthy();

    const feed = await api().get('/api/notifications').set(authHeaders(token, TENANT));
    expect(feed.status).toBe(200);
    const admin = (feed.body.items as { id: string; kind: string; title: string; read?: boolean }[]).find(
      i => i.id === notify.body.id,
    );
    expect(admin?.kind).toBe('admin_message');
    expect(admin?.title).toBe('SA Ping');
    expect(admin?.read).toBe(false);

    const read = await api().post(`/api/notifications/${notify.body.id}/read`).set(authHeaders(token, TENANT));
    expect(read.status).toBe(200);

    const feed2 = await api().get('/api/notifications').set(authHeaders(token, TENANT));
    const admin2 = (feed2.body.items as { id: string; read?: boolean }[]).find(i => i.id === notify.body.id);
    expect(admin2?.read).toBe(true);
  });

  it('read-all marks SA messages read', async () => {
    const id = uid('TN');
    await pool.query(
      `INSERT INTO tenant_notifications (id, tenant_id, title, body, type, source, expires_at)
       VALUES ($1,$2,'Bulk','Msg','info','super_admin', NOW() + INTERVAL '30 days')`,
      [id, TENANT],
    );
    const res = await api().post('/api/notifications/read-all').set(authHeaders(token, TENANT));
    expect(res.status).toBe(200);
    const row = (
      await pool.query('SELECT read_at FROM tenant_notifications WHERE id = $1 AND tenant_id = $2', [id, TENANT])
    ).rows[0];
    expect(row?.read_at).toBeTruthy();
  });

  it('Vendor role never receives business digests', async () => {
    // Seed an expiring price rule so Admin would see a digest
    const pid = uid('P');
    await pool.query(
      `INSERT INTO products (id, tenant_id, name, price, warranty_months, stock)
       VALUES ($1, $2, 'Notif Product', 100, 0, 5) ON CONFLICT DO NOTHING`,
      [pid, TENANT],
    );
    await pool.query(
      `INSERT INTO price_lists (id, tenant_id, name, product_id, vendor_id, min_qty, price, valid_to, is_active)
       VALUES ($1, $2, 'Expiring', $3, NULL, 1, 90, CURRENT_DATE + 3, true)`,
      [uid('PL'), TENANT, pid],
    );

    const adminFeed = await api().get('/api/notifications').set(authHeaders(token, TENANT));
    expect(adminFeed.status).toBe(200);
    const hasPl = (adminFeed.body.items as { kind: string }[]).some(i => i.kind === 'price_list_expiring');
    expect(hasPl).toBe(true);

    const vendorFeed = await api().get('/api/notifications').set(authHeaders(vendorToken, TENANT));
    expect(vendorFeed.status).toBe(200);
    const digests = (vendorFeed.body.items as { kind: string }[]).filter(i => i.kind !== 'admin_message');
    expect(digests).toEqual([]);
  });

  it('Warehouse role does not see finance digests', async () => {
    const feed = await api().get('/api/notifications').set(authHeaders(warehouseToken, TENANT));
    expect(feed.status).toBe(200);
    const kinds = (feed.body.items as { kind: string }[]).map(i => i.kind);
    expect(kinds).not.toContain('outstanding_overdue');
    expect(kinds).not.toContain('quote_expiring');
    // inventory is view for Warehouse — low_stock / price_list may appear
  });

  it('broadcast inserts for active tenants', async () => {
    const res = await api()
      .post('/api/super-admin/notifications/broadcast')
      .set({ Authorization: `Bearer ${saToken}` })
      .send({ title: 'Blast', message: 'All hands', type: 'info' });
    expect(res.status).toBe(200);
    expect(res.body.sent).toBeGreaterThanOrEqual(1);
    const row = (
      await pool.query(
        `SELECT id FROM tenant_notifications WHERE tenant_id = $1 AND title = 'Blast' ORDER BY created_at DESC LIMIT 1`,
        [TENANT],
      )
    ).rows[0];
    expect(row).toBeTruthy();
  });
});

describe('HTTP: service overdue digests ignore drafts', () => {
  const ST = 'T-TEST-HTTP-NOTIF-SVC';
  const SU = 'U-HTTP-NOTIF-SVC';
  let svcToken = '';

  beforeAll(async () => {
    await cleanupTestData(ST);
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, business_type)
       VALUES ($1, 'HTTP Notif Svc', 'http-notif-svc', 'http-notif-svc@test.com', 'Admin', 'active', 'service')
       ON CONFLICT (id) DO NOTHING`,
      [ST],
    );
    const hash = bcrypt.hashSync('password123', 12);
    await pool.query(
      `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
       VALUES ($1, $2, 'http-notif-svc@test.com', $3, 'Admin', 'Admin')
       ON CONFLICT DO NOTHING`,
      [SU, ST, hash],
    );
    svcToken = createTestToken({
      userId: SU,
      tenantId: ST,
      email: 'http-notif-svc@test.com',
      role: 'Admin',
      name: 'Admin',
    });
    await pool.query(
      `INSERT INTO standalone_invoices (
         id, tenant_id, invoice_number, customer_name, items, subtotal, tax_total, grand_total,
         status, invoice_date, due_date
       ) VALUES ($1, $2, 'INV-DRAFT-1', 'Client', '[]', 100, 0, 100, 'draft', CURRENT_DATE - 10, CURRENT_DATE - 5)`,
      [uid('INV'), ST],
    );
  });

  afterAll(async () => {
    await cleanupTestData(ST);
  });

  it('does not flag overdue for draft invoices', async () => {
    const feed = await api().get('/api/notifications').set(authHeaders(svcToken, ST));
    expect(feed.status).toBe(200);
    const overdue = (feed.body.items as { kind: string }[]).find(i => i.kind === 'outstanding_overdue');
    expect(overdue).toBeUndefined();
  });
});
