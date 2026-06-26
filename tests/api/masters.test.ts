import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool, cleanupTestData } from '../helpers';

const TEST_TENANT = 'T-TEST-MSTR';
const OTHER_TENANT = 'T-TEST-MSTR2';

describe('Masters', () => {
  beforeAll(async () => {
    await cleanupTestData(TEST_TENANT);
    await cleanupTestData(OTHER_TENANT);
    // Tenant 1
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status)
       VALUES ($1, 'Master Co', 'test-mstr', 'mstr@test.com', 'Master', 'active')
       ON CONFLICT (id) DO NOTHING`,
      [TEST_TENANT]
    );
    // Tenant 2
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status)
       VALUES ($1, 'Other Co', 'test-mstr2', 'mstr2@test.com', 'Other', 'active')
       ON CONFLICT (id) DO NOTHING`,
      [OTHER_TENANT]
    );
    // Tenant 1 data
    await pool.query(
      `INSERT INTO products (id, tenant_id, name, price) VALUES ('P-M1', $1, 'Prod 1', 100)`,
      [TEST_TENANT]
    );
    await pool.query(
      `INSERT INTO products (id, tenant_id, name, price) VALUES ('P-M2', $1, 'Prod 2', 200)`,
      [TEST_TENANT]
    );
    await pool.query(
      `INSERT INTO vendors (id, tenant_id, name) VALUES ('V-M1', $1, 'Vendor 1')`,
      [TEST_TENANT]
    );
    await pool.query(
      `INSERT INTO customers (id, tenant_id, name, phone) VALUES ('C-M1', $1, 'Cust 1', '1010101010')`,
      [TEST_TENANT]
    );
    await pool.query(
      `INSERT INTO customers (id, tenant_id, name, phone) VALUES ('C-M2', $1, 'Cust 2', '2020202020')`,
      [TEST_TENANT]
    );
    await pool.query(
      `INSERT INTO customers (id, tenant_id, name, phone) VALUES ('C-M3', $1, 'Cust 3', '3030303030')`,
      [TEST_TENANT]
    );
    // Tenant 2 data
    await pool.query(
      `INSERT INTO products (id, tenant_id, name, price) VALUES ('P-M3', $1, 'Other Prod', 300)`,
      [OTHER_TENANT]
    );
    await pool.query(
      `INSERT INTO vendors (id, tenant_id, name) VALUES ('V-M2', $1, 'Other Vendor')`,
      [OTHER_TENANT]
    );
  });

  afterAll(async () => {
    await cleanupTestData(TEST_TENANT);
    await cleanupTestData(OTHER_TENANT);
  });

  it('should query master counts for products, vendors, customers', async () => {
    const products = await pool.query(
      'SELECT COUNT(*) as c FROM products WHERE tenant_id = $1',
      [TEST_TENANT]
    );
    const vendors = await pool.query(
      'SELECT COUNT(*) as c FROM vendors WHERE tenant_id = $1',
      [TEST_TENANT]
    );
    const customers = await pool.query(
      'SELECT COUNT(*) as c FROM customers WHERE tenant_id = $1',
      [TEST_TENANT]
    );

    expect(Number(products.rows[0].c)).toBe(2);
    expect(Number(vendors.rows[0].c)).toBe(1);
    expect(Number(customers.rows[0].c)).toBe(3);
  });

  it('counts should be scoped by tenant', async () => {
    const t1Products = await pool.query(
      'SELECT COUNT(*) as c FROM products WHERE tenant_id = $1',
      [TEST_TENANT]
    );
    const t2Products = await pool.query(
      'SELECT COUNT(*) as c FROM products WHERE tenant_id = $1',
      [OTHER_TENANT]
    );

    expect(Number(t1Products.rows[0].c)).toBe(2);
    expect(Number(t2Products.rows[0].c)).toBe(1);
    expect(Number(t1Products.rows[0].c)).not.toBe(Number(t2Products.rows[0].c));
  });

  it('tenant 2 should not see tenant 1 customers', async () => {
    const { rows } = await pool.query(
      'SELECT COUNT(*) as c FROM customers WHERE tenant_id = $1',
      [OTHER_TENANT]
    );
    expect(Number(rows[0].c)).toBe(0);
  });
});
