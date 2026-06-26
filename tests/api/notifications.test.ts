import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool, cleanupTestData } from '../helpers';

const TEST_TENANT = 'T-TEST-NOTIF';

describe('Notifications', () => {
  beforeAll(async () => {
    await cleanupTestData(TEST_TENANT);
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status)
       VALUES ($1, 'Notif Co', 'test-notif', 'notif@test.com', 'Notif', 'active')
       ON CONFLICT (id) DO NOTHING`,
      [TEST_TENANT]
    );
    await pool.query(
      `INSERT INTO vendors (id, tenant_id, name)
       VALUES ('V-NOTIF', $1, 'Notif Vendor')
       ON CONFLICT DO NOTHING`,
      [TEST_TENANT]
    );
    // Low stock product (only 1 barcode in stock)
    await pool.query(
      `INSERT INTO products (id, tenant_id, name, price, stock)
       VALUES ('P-LOW', $1, 'Low Stock Pump', 3000, 1)`,
      [TEST_TENANT]
    );
    await pool.query(
      `INSERT INTO product_inventory (id, tenant_id, product_id, barcode, status)
       VALUES ('I-LOW', $1, 'P-LOW', 'LOW-001', 'InStock')`,
      [TEST_TENANT]
    );
    // Well-stocked product (10 barcodes)
    await pool.query(
      `INSERT INTO products (id, tenant_id, name, price, stock)
       VALUES ('P-OK', $1, 'OK Stock Motor', 5000, 10)`,
      [TEST_TENANT]
    );
    for (let i = 1; i <= 10; i++) {
      await pool.query(
        `INSERT INTO product_inventory (id, tenant_id, product_id, barcode, status)
         VALUES ($1, $2, 'P-OK', $3, 'InStock')`,
        [`I-OK-${i}`, TEST_TENANT, `OK-${String(i).padStart(3, '0')}`]
      );
    }
    // Expiring warranty (expires in 5 days)
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 5);
    await pool.query(
      `INSERT INTO warranties (id, tenant_id, product_id, barcode, customer_name, customer_phone, activation_date, expiry_date, status)
       VALUES ('W-EXP', $1, 'P-LOW', 'LOW-001', 'Expiring Cust', '7777777777', CURRENT_DATE - INTERVAL '11 months', $2, 'Active')`,
      [TEST_TENANT, expiryDate.toISOString().split('T')[0]]
    );
    // Non-expiring warranty (expires in 6 months)
    const farExpiry = new Date();
    farExpiry.setMonth(farExpiry.getMonth() + 6);
    await pool.query(
      `INSERT INTO warranties (id, tenant_id, product_id, barcode, customer_name, customer_phone, activation_date, expiry_date, status)
       VALUES ('W-OK', $1, 'P-OK', 'OK-001', 'OK Cust', '6666666666', CURRENT_DATE, $2, 'Active')`,
      [TEST_TENANT, farExpiry.toISOString().split('T')[0]]
    );
    // Pending vendor payment
    await pool.query(
      `INSERT INTO vendor_payments (id, tenant_id, vendor_id, amount, payment_date, payment_method, notes)
       VALUES ('VP-PEND', $1, 'V-NOTIF', 50000, CURRENT_DATE + INTERVAL '3 days', 'Bank Transfer', 'Pending payment')`,
      [TEST_TENANT]
    );
  });

  afterAll(async () => {
    await cleanupTestData(TEST_TENANT);
  });

  it('should detect low stock alert', async () => {
    const LOW_STOCK_THRESHOLD = 5;
    const { rows } = await pool.query(
      `SELECT p.id, p.name,
              COUNT(pi.id) FILTER (WHERE pi.status = 'InStock') as in_stock
       FROM products p
       LEFT JOIN product_inventory pi ON pi.product_id = p.id AND pi.tenant_id = p.tenant_id
       WHERE p.tenant_id = $1
       GROUP BY p.id, p.name
       HAVING COUNT(pi.id) FILTER (WHERE pi.status = 'InStock') < $2`,
      [TEST_TENANT, LOW_STOCK_THRESHOLD]
    );
    const lowStockProduct = rows.find(r => r.name === 'Low Stock Pump');
    expect(lowStockProduct).toBeDefined();
    expect(Number(lowStockProduct!.in_stock)).toBeLessThan(LOW_STOCK_THRESHOLD);
  });

  it('should detect expiring warranty', async () => {
    const DAYS_WARNING = 30;
    const { rows } = await pool.query(
      `SELECT * FROM warranties
       WHERE tenant_id = $1
         AND status = 'Active'
         AND expiry_date <= CURRENT_DATE + $2 * INTERVAL '1 day'
         AND expiry_date >= CURRENT_DATE`,
      [TEST_TENANT, DAYS_WARNING]
    );
    expect(rows.length).toBeGreaterThan(0);
    const expiring = rows.find(r => r.customer_name === 'Expiring Cust');
    expect(expiring).toBeDefined();
  });

  it('should detect pending payment notification', async () => {
    const { rows } = await pool.query(
      `SELECT * FROM vendor_payments
       WHERE tenant_id = $1
         AND payment_date > CURRENT_DATE`,
      [TEST_TENANT]
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(Number(rows[0].amount)).toBe(50000);
  });

  it('should not generate false alerts for well-stocked products', async () => {
    const LOW_STOCK_THRESHOLD = 5;
    const { rows } = await pool.query(
      `SELECT p.id, p.name,
              COUNT(pi.id) FILTER (WHERE pi.status = 'InStock') as in_stock
       FROM products p
       LEFT JOIN product_inventory pi ON pi.product_id = p.id AND pi.tenant_id = p.tenant_id
       WHERE p.tenant_id = $1 AND p.name = 'OK Stock Motor'
       GROUP BY p.id, p.name`,
      [TEST_TENANT]
    );
    expect(rows.length).toBe(1);
    expect(Number(rows[0].in_stock)).toBeGreaterThanOrEqual(LOW_STOCK_THRESHOLD);
  });
});
