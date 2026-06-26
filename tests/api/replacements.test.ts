import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool, cleanupTestData } from '../helpers';

const TEST_TENANT = 'T-TEST-REPL';

describe('Replacements', () => {
  beforeAll(async () => {
    await cleanupTestData(TEST_TENANT);
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status)
       VALUES ($1, 'Repl Co', 'test-repl', 'repl@test.com', 'Repl', 'active')
       ON CONFLICT (id) DO NOTHING`,
      [TEST_TENANT]
    );
    await pool.query(
      `INSERT INTO vendors (id, tenant_id, name)
       VALUES ('V-REPL', $1, 'Repl Vendor')
       ON CONFLICT DO NOTHING`,
      [TEST_TENANT]
    );
    await pool.query(
      `INSERT INTO products (id, tenant_id, name, price, warranty_months)
       VALUES ('P-REPL', $1, 'Replaceable Pump', 3000, 24)`,
      [TEST_TENANT]
    );
    // Old barcode (sold, has warranty)
    await pool.query(
      `INSERT INTO product_inventory (id, tenant_id, product_id, barcode, status)
       VALUES ('I-REPL-OLD', $1, 'P-REPL', 'REPL-OLD-001', 'Sold')`,
      [TEST_TENANT]
    );
    // New barcode (in stock, will become replacement)
    await pool.query(
      `INSERT INTO product_inventory (id, tenant_id, product_id, barcode, status)
       VALUES ('I-REPL-NEW', $1, 'P-REPL', 'REPL-NEW-001', 'InStock')`,
      [TEST_TENANT]
    );
    // Warranty for the old barcode
    const expiry = new Date();
    expiry.setMonth(expiry.getMonth() + 12);
    await pool.query(
      `INSERT INTO warranties (id, tenant_id, product_id, barcode, customer_name, customer_phone, activation_date, expiry_date, status)
       VALUES ('W-REPL', $1, 'P-REPL', 'REPL-OLD-001', 'Repl Customer', '8888888888', CURRENT_DATE, $2, 'Active')`,
      [TEST_TENANT, expiry.toISOString().split('T')[0]]
    );
  });

  afterAll(async () => {
    await cleanupTestData(TEST_TENANT);
  });

  it('should create a replacement record', async () => {
    await pool.query(
      `INSERT INTO product_replacements (id, tenant_id, old_barcode, new_barcode, warranty_id, product_id, product_name, customer_name, customer_phone, replaced_date, reason, vendor_id)
       VALUES ('R-1', $1, 'REPL-OLD-001', 'REPL-NEW-001', 'W-REPL', 'P-REPL', 'Replaceable Pump', 'Repl Customer', '8888888888', CURRENT_DATE, 'Defective motor', 'V-REPL')`,
      [TEST_TENANT]
    );
    const { rows } = await pool.query(
      'SELECT * FROM product_replacements WHERE id = $1 AND tenant_id = $2',
      ['R-1', TEST_TENANT]
    );
    expect(rows.length).toBe(1);
    expect(rows[0].old_barcode).toBe('REPL-OLD-001');
    expect(rows[0].new_barcode).toBe('REPL-NEW-001');
  });

  it('replacement record should be saved correctly', async () => {
    const { rows } = await pool.query(
      'SELECT * FROM product_replacements WHERE id = $1 AND tenant_id = $2',
      ['R-1', TEST_TENANT]
    );
    expect(rows[0].reason).toBe('Defective motor');
    expect(rows[0].customer_name).toBe('Repl Customer');
    expect(rows[0].customer_phone).toBe('8888888888');
  });

  it('old barcode status should be updated to Replaced', async () => {
    await pool.query(
      "UPDATE product_inventory SET status = 'Replaced' WHERE barcode = 'REPL-OLD-001' AND tenant_id = $1",
      [TEST_TENANT]
    );
    const { rows } = await pool.query(
      'SELECT status FROM product_inventory WHERE barcode = $1 AND tenant_id = $2',
      ['REPL-OLD-001', TEST_TENANT]
    );
    expect(rows[0].status).toBe('Replaced');
  });

  it('new barcode status should be set to Sold', async () => {
    await pool.query(
      "UPDATE product_inventory SET status = 'Sold' WHERE barcode = 'REPL-NEW-001' AND tenant_id = $1",
      [TEST_TENANT]
    );
    const { rows } = await pool.query(
      'SELECT status FROM product_inventory WHERE barcode = $1 AND tenant_id = $2',
      ['REPL-NEW-001', TEST_TENANT]
    );
    expect(rows[0].status).toBe('Sold');
  });

  it('replacement history should be queryable', async () => {
    const { rows } = await pool.query(
      'SELECT * FROM product_replacements WHERE tenant_id = $1 ORDER BY replaced_date DESC',
      [TEST_TENANT]
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].old_barcode).toBe('REPL-OLD-001');
  });

  it('replacement should be linked to correct product', async () => {
    const { rows } = await pool.query(
      'SELECT product_id, product_name FROM product_replacements WHERE id = $1 AND tenant_id = $2',
      ['R-1', TEST_TENANT]
    );
    expect(rows[0].product_id).toBe('P-REPL');
    expect(rows[0].product_name).toBe('Replaceable Pump');
  });
});
