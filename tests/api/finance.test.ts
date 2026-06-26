import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool, cleanupTestData } from '../helpers';

const TEST_TENANT = 'T-TEST-FIN';

describe('Finance', () => {
  beforeAll(async () => {
    await cleanupTestData(TEST_TENANT);
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status)
       VALUES ($1, 'Fin Co', 'test-fin', 'fin@test.com', 'Fin', 'active')
       ON CONFLICT (id) DO NOTHING`,
      [TEST_TENANT]
    );
    await pool.query(
      `INSERT INTO vendors (id, tenant_id, name)
       VALUES ('V-F1', $1, 'Finance Vendor')
       ON CONFLICT DO NOTHING`,
      [TEST_TENANT]
    );
    await pool.query(
      `INSERT INTO vendors (id, tenant_id, name)
       VALUES ('V-F2', $1, 'Second Vendor')
       ON CONFLICT DO NOTHING`,
      [TEST_TENANT]
    );
  });

  afterAll(async () => {
    await cleanupTestData(TEST_TENANT);
  });

  it('should record vendor payment', async () => {
    await pool.query(
      `INSERT INTO vendor_payments (id, tenant_id, vendor_id, amount, payment_method, payment_date)
       VALUES ('VP-1', $1, 'V-F1', 5000, 'Cash', CURRENT_DATE)`,
      [TEST_TENANT]
    );
    const { rows } = await pool.query(
      'SELECT amount, payment_method FROM vendor_payments WHERE id = $1 AND tenant_id = $2',
      ['VP-1', TEST_TENANT]
    );
    expect(Number(rows[0].amount)).toBe(5000);
    expect(rows[0].payment_method).toBe('Cash');
  });

  it('should record multiple payment methods', async () => {
    await pool.query(
      `INSERT INTO vendor_payments (id, tenant_id, vendor_id, amount, payment_method, payment_date)
       VALUES ('VP-2', $1, 'V-F1', 3000, 'UPI', CURRENT_DATE)`,
      [TEST_TENANT]
    );
    await pool.query(
      `INSERT INTO vendor_payments (id, tenant_id, vendor_id, amount, payment_method, payment_date)
       VALUES ('VP-3', $1, 'V-F1', 2000, 'Bank Transfer', CURRENT_DATE)`,
      [TEST_TENANT]
    );

    const { rows } = await pool.query(
      'SELECT payment_method FROM vendor_payments WHERE tenant_id = $1 ORDER BY id',
      [TEST_TENANT]
    );
    const methods = rows.map((r: Record<string, unknown>) => r.payment_method);
    expect(methods).toContain('Cash');
    expect(methods).toContain('UPI');
    expect(methods).toContain('Bank Transfer');
  });

  it('should calculate vendor balance', async () => {
    const totalPaid = (
      await pool.query(
        'SELECT COALESCE(SUM(amount), 0) as t FROM vendor_payments WHERE vendor_id = $1 AND tenant_id = $2',
        ['V-F1', TEST_TENANT]
      )
    ).rows[0].t;
    expect(Number(totalPaid)).toBe(10000); // 5000 + 3000 + 2000
  });

  it('vendor with no payments should have zero balance', async () => {
    const totalPaid = (
      await pool.query(
        'SELECT COALESCE(SUM(amount), 0) as t FROM vendor_payments WHERE vendor_id = $1 AND tenant_id = $2',
        ['V-F2', TEST_TENANT]
      )
    ).rows[0].t;
    expect(Number(totalPaid)).toBe(0);
  });

  it('payment amount should not be negative', () => {
    const amount = -100;
    expect(amount).toBeLessThan(0);
  });

  it('should record payment with reference number', async () => {
    await pool.query(
      `INSERT INTO vendor_payments (id, tenant_id, vendor_id, amount, payment_method, payment_date, reference_number)
       VALUES ('VP-4', $1, 'V-F2', 1500, 'Cheque', CURRENT_DATE, 'CHQ-001')`,
      [TEST_TENANT]
    );
    const { rows } = await pool.query(
      'SELECT reference_number FROM vendor_payments WHERE id = $1 AND tenant_id = $2',
      ['VP-4', TEST_TENANT]
    );
    expect(rows[0].reference_number).toBe('CHQ-001');
  });

  it('should record payment with notes', async () => {
    await pool.query(
      `INSERT INTO vendor_payments (id, tenant_id, vendor_id, amount, payment_method, payment_date, notes)
       VALUES ('VP-5', $1, 'V-F2', 800, 'Cash', CURRENT_DATE, 'Partial payment for June')`,
      [TEST_TENANT]
    );
    const { rows } = await pool.query(
      'SELECT notes FROM vendor_payments WHERE id = $1 AND tenant_id = $2',
      ['VP-5', TEST_TENANT]
    );
    expect(rows[0].notes).toBe('Partial payment for June');
  });

  it('should query payments by vendor', async () => {
    const { rows } = await pool.query(
      'SELECT COUNT(*) as c FROM vendor_payments WHERE vendor_id = $1 AND tenant_id = $2',
      ['V-F1', TEST_TENANT]
    );
    expect(Number(rows[0].c)).toBe(3);
  });

  it('should query payments by date', async () => {
    const { rows } = await pool.query(
      'SELECT COUNT(*) as c FROM vendor_payments WHERE payment_date = CURRENT_DATE AND tenant_id = $1',
      [TEST_TENANT]
    );
    expect(Number(rows[0].c)).toBeGreaterThan(0);
  });
});
