import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import bcrypt from 'bcrypt';
import { pool, cleanupTestData, createTestToken } from '../helpers';
import { api, authHeaders } from '../http';

const TENANT = 'T-TEST-FY-GLOBAL';
const USER = 'U-TEST-FY-GLOBAL';
const PRODUCT = 'P-FY-1';
const VENDOR = 'V-FY-1';
const STAFF_A = 'STF-FY-A';
const STAFF_B = 'STF-FY-B';
let token = '';

describe('HTTP: global FY/date-range filtering across core modules', () => {
  beforeAll(async () => {
    await cleanupTestData(TENANT);
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status)
       VALUES ($1, 'FY Global Co', 'fy-global-co', 'fy-global@test.com', 'FY Admin', 'active')
       ON CONFLICT (id) DO NOTHING`,
      [TENANT],
    );
    const hash = bcrypt.hashSync('password123', 12);
    await pool.query(
      `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
       VALUES ($1, $2, 'fy-global@test.com', $3, 'FY Admin', 'Admin')
       ON CONFLICT DO NOTHING`,
      [USER, TENANT, hash],
    );
    await pool.query(
      `INSERT INTO vendors (id, tenant_id, name, phone)
       VALUES ($1, $2, 'FY Vendor', '9999999999')
       ON CONFLICT DO NOTHING`,
      [VENDOR, TENANT],
    );
    await pool.query(
      `INSERT INTO products (id, tenant_id, name, price, stock, warranty_months)
       VALUES ($1, $2, 'FY Product', 1000, 10, 12)
       ON CONFLICT DO NOTHING`,
      [PRODUCT, TENANT],
    );
    await pool.query(
      `INSERT INTO staff_members (id, tenant_id, name, role, salary, status)
       VALUES
       ($1, $3, 'Alice FY', 'Sales', 25000, 'active'),
       ($2, $3, 'Bob FY', 'Support', 22000, 'active')
       ON CONFLICT DO NOTHING`,
      [STAFF_A, STAFF_B, TENANT],
    );

    // In-range rows (FY 2026-27 style window used by tests)
    await pool.query(
      `INSERT INTO product_distribution
       (id, tenant_id, product_id, barcode, vendor_id, distribution_date, status, net_price, billed_price)
       VALUES
       ('D-FY-IN', $1, $2, 'FYBC-IN', $3, '2026-04-15', 'Sold', 1000, 1000)`,
      [TENANT, PRODUCT, VENDOR],
    );
    await pool.query(
      `INSERT INTO product_sales
       (id, tenant_id, barcode, product_id, vendor_id, customer_name, customer_phone, purchase_date, sale_price)
       VALUES
       ('S-FY-IN', $1, 'FYBC-IN', $2, $3, 'Customer In', '9000000001', '2026-05-10', 1400)`,
      [TENANT, PRODUCT, VENDOR],
    );
    await pool.query(
      `INSERT INTO expenses
       (id, tenant_id, category, description, amount, expense_date, payment_method)
       VALUES
       ('EXP-FY-IN', $1, 'Utilities', 'In-range expense', 800, '2026-06-10', 'Cash')`,
      [TENANT],
    );
    await pool.query(
      `INSERT INTO staff_payments
       (id, tenant_id, staff_name, amount, payment_date, payment_type, payment_method, month, year)
       VALUES
       ('SP-FY-IN', $1, 'Alice FY', 25000, '2026-05-05', 'salary', 'Cash', '05', 2026)`,
      [TENANT],
    );

    // Out-of-range rows
    await pool.query(
      `INSERT INTO product_distribution
       (id, tenant_id, product_id, barcode, vendor_id, distribution_date, status, net_price, billed_price)
       VALUES
       ('D-FY-OUT', $1, $2, 'FYBC-OUT', $3, '2025-03-20', 'Sold', 1000, 1000)`,
      [TENANT, PRODUCT, VENDOR],
    );
    await pool.query(
      `INSERT INTO product_sales
       (id, tenant_id, barcode, product_id, vendor_id, customer_name, customer_phone, purchase_date, sale_price)
       VALUES
       ('S-FY-OUT', $1, 'FYBC-OUT', $2, $3, 'Customer Out', '9000000002', '2025-03-21', 1400)`,
      [TENANT, PRODUCT, VENDOR],
    );
    await pool.query(
      `INSERT INTO expenses
       (id, tenant_id, category, description, amount, expense_date, payment_method)
       VALUES
       ('EXP-FY-OUT', $1, 'Rent', 'Out-range expense', 1200, '2025-03-22', 'Cash')`,
      [TENANT],
    );
    await pool.query(
      `INSERT INTO staff_payments
       (id, tenant_id, staff_name, amount, payment_date, payment_type, payment_method, month, year)
       VALUES
       ('SP-FY-OUT', $1, 'Bob FY', 22000, '2025-03-25', 'salary', 'Cash', '03', 2025)`,
      [TENANT],
    );

    await pool.query(
      `INSERT INTO standalone_invoices
       (id, tenant_id, invoice_number, customer_name, items, subtotal, tax_total, grand_total, status, invoice_date)
       VALUES
       ('INV-FY-IN', $1, 'INV/FY/IN', 'FY Customer In', '[]', 5000, 0, 5000, 'sent', '2026-05-15'),
       ('INV-FY-OUT', $1, 'INV/FY/OUT', 'FY Customer Out', '[]', 10000, 0, 10000, 'sent', '2025-03-31')`,
      [TENANT],
    );

    token = createTestToken({
      userId: USER,
      tenantId: TENANT,
      email: 'fy-global@test.com',
      role: 'Admin',
      name: 'FY Admin',
    });
  });

  afterAll(async () => {
    await cleanupTestData(TENANT);
  });

  const hdrs = () => authHeaders(token, TENANT);
  const from = '2026-04-01';
  const to = '2027-03-31';

  it('filters distribution list, batch list, and summary by from/to', async () => {
    const list = await api().get(`/api/distribution?from=${from}&to=${to}`).set(hdrs());
    expect(list.status).toBe(200);
    expect((list.body as { id: string }[]).map(r => r.id)).toContain('D-FY-IN');
    expect((list.body as { id: string }[]).map(r => r.id)).not.toContain('D-FY-OUT');

    const batches = await api().get(`/api/distribution/batches?from=${from}&to=${to}`).set(hdrs());
    expect(batches.status).toBe(200);
    expect((batches.body as { batchId: string }[]).map(r => r.batchId)).toContain('D-FY-IN');
    expect((batches.body as { batchId: string }[]).map(r => r.batchId)).not.toContain('D-FY-OUT');

    const summary = await api().get(`/api/distribution/summary?from=${from}&to=${to}`).set(hdrs());
    expect(summary.status).toBe(200);
    expect(Number(summary.body.totalDistributed)).toBe(1);
    const vendorStat = (summary.body.vendorStats as { vendorId: string; distributed: number }[]).find(
      v => v.vendorId === VENDOR,
    );
    expect(vendorStat?.distributed).toBe(1);
  });

  it('filters sales list by dateFrom/dateTo', async () => {
    const res = await api().get(`/api/sales?dateFrom=${from}&dateTo=${to}`).set(hdrs());
    expect(res.status).toBe(200);
    const ids = ((res.body?.data || []) as { id: string }[]).map(r => r.id);
    expect(ids).toContain('S-FY-IN');
    expect(ids).not.toContain('S-FY-OUT');
  });

  it('filters expenses list by from/to', async () => {
    const res = await api().get(`/api/expenses?from=${from}&to=${to}`).set(hdrs());
    expect(res.status).toBe(200);
    const ids = (res.body as { id: string }[]).map(r => r.id);
    expect(ids).toContain('EXP-FY-IN');
    expect(ids).not.toContain('EXP-FY-OUT');
  });

  it('filters payroll list and summary by from/to', async () => {
    const list = await api().get(`/api/payroll?from=${from}&to=${to}`).set(hdrs());
    expect(list.status).toBe(200);
    const payIds = (list.body as { id: string }[]).map(r => r.id);
    expect(payIds).toContain('SP-FY-IN');
    expect(payIds).not.toContain('SP-FY-OUT');

    const summary = await api().get(`/api/payroll/summary?from=${from}&to=${to}`).set(hdrs());
    expect(summary.status).toBe(200);
    expect(Number(summary.body.grandTotal)).toBe(25000);
    const staffNames = (summary.body.byStaff as { name: string }[]).map(r => r.name);
    expect(staffNames).toContain('Alice FY');
    expect(staffNames).not.toContain('Bob FY');
  });

  it('filters staff aggregates by from/to in /api/staff', async () => {
    const res = await api().get(`/api/staff?from=${from}&to=${to}`).set(hdrs());
    expect(res.status).toBe(200);
    const rows = res.body as { name: string; totalPaid: number; paymentCount: number }[];
    const alice = rows.find(r => r.name === 'Alice FY');
    const bob = rows.find(r => r.name === 'Bob FY');
    expect(alice).toBeTruthy();
    expect(Number(alice?.totalPaid || 0)).toBe(25000);
    expect(Number(alice?.paymentCount || 0)).toBe(1);
    expect(bob).toBeTruthy();
    expect(Number(bob?.totalPaid || 0)).toBe(0);
    expect(Number(bob?.paymentCount || 0)).toBe(0);
  });

  it('filters invoices list by from/to', async () => {
    const res = await api().get(`/api/invoices?from=${from}&to=${to}`).set(hdrs());
    expect(res.status).toBe(200);
    const ids = (res.body as { id: string }[]).map(r => r.id);
    expect(ids).toContain('INV-FY-IN');
    expect(ids).not.toContain('INV-FY-OUT');
    expect(Number(res.headers['x-total-count'])).toBe(1);
  });

  it('filters analytics overview KPIs and recent activity by from/to', async () => {
    const res = await api().get(`/api/analytics/overview?from=${from}&to=${to}`).set(hdrs());
    expect(res.status).toBe(200);

    expect(Number(res.body.money.revenue)).toBe(6400);
    expect(Number(res.body.money.expenses)).toBe(800);
    expect(Number(res.body.money.invoiceOutstanding)).toBe(5000);

    const activity = res.body.recentActivity as { id: string; date: string }[];
    const ids = activity.map(r => r.id);
    expect(ids).toContain('S-FY-IN');
    expect(ids).toContain('EXP-FY-IN');
    expect(ids).toContain('INV-FY-IN');
    expect(ids).not.toContain('S-FY-OUT');
    expect(ids).not.toContain('EXP-FY-OUT');
    expect(ids).not.toContain('INV-FY-OUT');
    for (const row of activity) {
      expect(row.date >= from).toBe(true);
      expect(row.date <= to).toBe(true);
    }
  });

  it('filters /api/analytics/recent-activity by from/to', async () => {
    const res = await api().get(`/api/analytics/recent-activity?from=${from}&to=${to}`).set(hdrs());
    expect(res.status).toBe(200);
    const activity = res.body as { id: string; date: string }[];
    const ids = activity.map(r => r.id);
    expect(ids).toContain('S-FY-IN');
    expect(ids).not.toContain('S-FY-OUT');
    expect(ids).not.toContain('INV-FY-OUT');
    for (const row of activity) {
      expect(row.date >= from).toBe(true);
      expect(row.date <= to).toBe(true);
    }
  });
});
