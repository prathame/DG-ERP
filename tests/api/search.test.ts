import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool, cleanupTestData } from '../helpers';

const TEST_TENANT = 'T-TEST-SRCH';

describe('Search', () => {
  beforeAll(async () => {
    await cleanupTestData(TEST_TENANT);
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status)
       VALUES ($1, 'Search Co', 'test-srch', 'srch@test.com', 'Search', 'active')
       ON CONFLICT (id) DO NOTHING`,
      [TEST_TENANT]
    );
    await pool.query(
      `INSERT INTO vendors (id, tenant_id, name, phone)
       VALUES ('V-SRCH', $1, 'Apex Distributors', '5550001111')
       ON CONFLICT DO NOTHING`,
      [TEST_TENANT]
    );
    await pool.query(
      `INSERT INTO customers (id, tenant_id, name, phone, vendor_id)
       VALUES ('C-SRCH', $1, 'Rahul Sharma', '5550002222', 'V-SRCH')`,
      [TEST_TENANT]
    );
    await pool.query(
      `INSERT INTO products (id, tenant_id, name, price)
       VALUES ('P-SRCH', $1, 'Submersible Pump V8', 12000)`,
      [TEST_TENANT]
    );
    await pool.query(
      `INSERT INTO product_inventory (id, tenant_id, product_id, barcode, status)
       VALUES ('I-SRCH', $1, 'P-SRCH', 'SRCH-BC-12345', 'InStock')`,
      [TEST_TENANT]
    );
  });

  afterAll(async () => {
    await cleanupTestData(TEST_TENANT);
  });

  it('should search products by name', async () => {
    const { rows } = await pool.query(
      'SELECT * FROM products WHERE tenant_id = $1 AND name ILIKE $2',
      [TEST_TENANT, '%submersible%']
    );
    expect(rows.length).toBe(1);
    expect(rows[0].name).toBe('Submersible Pump V8');
  });

  it('should search customers by phone', async () => {
    const { rows } = await pool.query(
      'SELECT * FROM customers WHERE tenant_id = $1 AND phone LIKE $2',
      [TEST_TENANT, '%0002222%']
    );
    expect(rows.length).toBe(1);
    expect(rows[0].name).toBe('Rahul Sharma');
  });

  it('should search vendors by name', async () => {
    const { rows } = await pool.query(
      'SELECT * FROM vendors WHERE tenant_id = $1 AND name ILIKE $2',
      [TEST_TENANT, '%apex%']
    );
    expect(rows.length).toBe(1);
    expect(rows[0].name).toBe('Apex Distributors');
  });

  it('should search barcodes', async () => {
    const { rows } = await pool.query(
      'SELECT * FROM product_inventory WHERE tenant_id = $1 AND barcode ILIKE $2',
      [TEST_TENANT, '%SRCH-BC%']
    );
    expect(rows.length).toBe(1);
    expect(rows[0].barcode).toBe('SRCH-BC-12345');
  });

  it('empty search should return empty results', async () => {
    const products = await pool.query(
      'SELECT * FROM products WHERE tenant_id = $1 AND name ILIKE $2',
      [TEST_TENANT, '%zzz_nonexistent_zzz%']
    );
    expect(products.rows.length).toBe(0);

    const customers = await pool.query(
      'SELECT * FROM customers WHERE tenant_id = $1 AND phone LIKE $2',
      [TEST_TENANT, '%0000000000%']
    );
    expect(customers.rows.length).toBe(0);
  });
});
