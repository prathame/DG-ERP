import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool, createSuperAdminToken, cleanupTestData } from '../helpers';

const TEST_TENANT = 'T-TEST-BILL';

describe('Billing (Super Admin)', () => {
  beforeAll(async () => {
    await cleanupTestData(TEST_TENANT);
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status)
       VALUES ($1, 'Bill Co', 'test-bill', 'bill@test.com', 'Bill', 'active')
       ON CONFLICT (id) DO NOTHING`,
      [TEST_TENANT]
    );
  });

  afterAll(async () => {
    await cleanupTestData(TEST_TENANT);
  });

  it('super admin token should have correct role', () => {
    const token = createSuperAdminToken();
    const jwt = require('jsonwebtoken');
    const decoded = jwt.decode(token) as { role: string; email: string };
    expect(decoded.role).toBe('super_admin');
    expect(decoded.email).toBe('test-admin@dgerp.com');
  });

  it('should create tenant invoice', async () => {
    await pool.query(
      `INSERT INTO tenant_invoices (id, tenant_id, invoice_number, amount, gst_amount, total, status)
       VALUES ('INV-1', $1, 'DG-TEST-001', 999, 180, 1179, 'unpaid')`,
      [TEST_TENANT]
    );
    const { rows } = await pool.query(
      'SELECT * FROM tenant_invoices WHERE id = $1',
      ['INV-1']
    );
    expect(rows[0].invoice_number).toBe('DG-TEST-001');
    expect(Number(rows[0].total)).toBe(1179);
    expect(rows[0].status).toBe('unpaid');
  });

  it('should mark invoice as paid', async () => {
    await pool.query(
      "UPDATE tenant_invoices SET status = 'paid', paid_at = NOW() WHERE id = $1",
      ['INV-1']
    );
    const { rows } = await pool.query(
      'SELECT status, paid_at FROM tenant_invoices WHERE id = $1',
      ['INV-1']
    );
    expect(rows[0].status).toBe('paid');
    expect(rows[0].paid_at).toBeTruthy();
  });

  it('GST calculation should be correct', () => {
    const amount = 999;
    const gstRate = 18;
    const gst = Math.round(amount * gstRate / 100);
    expect(gst).toBe(180);
    expect(amount + gst).toBe(1179);
  });

  it('should create invoice with period dates', async () => {
    await pool.query(
      `INSERT INTO tenant_invoices (id, tenant_id, invoice_number, amount, gst_amount, total, status, period_start, period_end, plan_name)
       VALUES ('INV-2', $1, 'DG-TEST-002', 499, 90, 589, 'unpaid', '2026-06-01', '2026-06-30', 'Basic')`,
      [TEST_TENANT]
    );
    const { rows } = await pool.query(
      'SELECT period_start, period_end, plan_name FROM tenant_invoices WHERE id = $1',
      ['INV-2']
    );
    expect(rows[0].plan_name).toBe('Basic');
    expect(rows[0].period_start).toBeTruthy();
    expect(rows[0].period_end).toBeTruthy();
  });

  it('should list all invoices for a tenant', async () => {
    const { rows } = await pool.query(
      'SELECT id FROM tenant_invoices WHERE tenant_id = $1 ORDER BY created_at',
      [TEST_TENANT]
    );
    expect(rows.length).toBe(2);
  });

  it('should calculate total outstanding', async () => {
    const { rows } = await pool.query(
      "SELECT COALESCE(SUM(total), 0) as outstanding FROM tenant_invoices WHERE tenant_id = $1 AND status = 'unpaid'",
      [TEST_TENANT]
    );
    expect(Number(rows[0].outstanding)).toBe(589); // INV-2 is still unpaid
  });

  it('should calculate total paid', async () => {
    const { rows } = await pool.query(
      "SELECT COALESCE(SUM(total), 0) as paid FROM tenant_invoices WHERE tenant_id = $1 AND status = 'paid'",
      [TEST_TENANT]
    );
    expect(Number(rows[0].paid)).toBe(1179); // INV-1 was paid
  });

  it('invoice number should be unique', async () => {
    const { rows } = await pool.query(
      'SELECT COUNT(DISTINCT invoice_number) as c FROM tenant_invoices WHERE tenant_id = $1',
      [TEST_TENANT]
    );
    const totalInvoices = (
      await pool.query(
        'SELECT COUNT(*) as c FROM tenant_invoices WHERE tenant_id = $1',
        [TEST_TENANT]
      )
    ).rows[0];
    expect(Number(rows[0].c)).toBe(Number(totalInvoices.c));
  });

  it('should add notes to invoice', async () => {
    await pool.query(
      "UPDATE tenant_invoices SET notes = 'Late payment fee applied' WHERE id = $1",
      ['INV-2']
    );
    const { rows } = await pool.query(
      'SELECT notes FROM tenant_invoices WHERE id = $1',
      ['INV-2']
    );
    expect(rows[0].notes).toBe('Late payment fee applied');
  });
});
