import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool, cleanupTestData } from '../helpers';

const TEST_TENANT = 'T-TEST-MAP';
const OTHER_TENANT = 'T-TEST-MAP2';

describe('Vendor-Customer Mapping', () => {
  beforeAll(async () => {
    await cleanupTestData(TEST_TENANT);
    await cleanupTestData(OTHER_TENANT);
    // Tenant 1
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status)
       VALUES ($1, 'Map Co', 'test-map', 'map@test.com', 'Map', 'active')
       ON CONFLICT (id) DO NOTHING`,
      [TEST_TENANT]
    );
    // Tenant 2
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status)
       VALUES ($1, 'Map2 Co', 'test-map2', 'map2@test.com', 'Map2', 'active')
       ON CONFLICT (id) DO NOTHING`,
      [OTHER_TENANT]
    );
    // Tenant 1 vendors
    await pool.query(
      `INSERT INTO vendors (id, tenant_id, name) VALUES ('V-MAP-1', $1, 'Mapped Vendor')`,
      [TEST_TENANT]
    );
    await pool.query(
      `INSERT INTO vendors (id, tenant_id, name) VALUES ('V-MAP-2', $1, 'Lonely Vendor')`,
      [TEST_TENANT]
    );
    // Tenant 1 customers mapped to V-MAP-1
    await pool.query(
      `INSERT INTO customers (id, tenant_id, name, phone, vendor_id) VALUES ('C-MAP-1', $1, 'Cust Alpha', '4040404040', 'V-MAP-1')`,
      [TEST_TENANT]
    );
    await pool.query(
      `INSERT INTO customers (id, tenant_id, name, phone, vendor_id) VALUES ('C-MAP-2', $1, 'Cust Beta', '5050505050', 'V-MAP-1')`,
      [TEST_TENANT]
    );
    await pool.query(
      `INSERT INTO customers (id, tenant_id, name, phone, vendor_id) VALUES ('C-MAP-3', $1, 'Cust Gamma', '6060606060', 'V-MAP-1')`,
      [TEST_TENANT]
    );
    // Tenant 2 vendor + customer (different scope)
    await pool.query(
      `INSERT INTO vendors (id, tenant_id, name) VALUES ('V-MAP-3', $1, 'Other Vendor')`,
      [OTHER_TENANT]
    );
    await pool.query(
      `INSERT INTO customers (id, tenant_id, name, phone, vendor_id) VALUES ('C-MAP-4', $1, 'Other Cust', '7070707070', 'V-MAP-3')`,
      [OTHER_TENANT]
    );
  });

  afterAll(async () => {
    await cleanupTestData(TEST_TENANT);
    await cleanupTestData(OTHER_TENANT);
  });

  it('should map vendor to customers', async () => {
    const { rows } = await pool.query(
      'SELECT * FROM customers WHERE vendor_id = $1 AND tenant_id = $2',
      ['V-MAP-1', TEST_TENANT]
    );
    expect(rows.length).toBe(3);
    const names = rows.map(r => r.name).sort();
    expect(names).toEqual(['Cust Alpha', 'Cust Beta', 'Cust Gamma']);
  });

  it('vendor with no customers should return empty', async () => {
    const { rows } = await pool.query(
      'SELECT * FROM customers WHERE vendor_id = $1 AND tenant_id = $2',
      ['V-MAP-2', TEST_TENANT]
    );
    expect(rows.length).toBe(0);
  });

  it('should support multiple customers per vendor', async () => {
    const { rows } = await pool.query(
      `SELECT v.name as vendor_name, COUNT(c.id) as customer_count
       FROM vendors v
       LEFT JOIN customers c ON c.vendor_id = v.id AND c.tenant_id = v.tenant_id
       WHERE v.tenant_id = $1
       GROUP BY v.id, v.name
       ORDER BY customer_count DESC`,
      [TEST_TENANT]
    );
    expect(rows.length).toBe(2);
    expect(rows[0].vendor_name).toBe('Mapped Vendor');
    expect(Number(rows[0].customer_count)).toBe(3);
    expect(rows[1].vendor_name).toBe('Lonely Vendor');
    expect(Number(rows[1].customer_count)).toBe(0);
  });

  it('mapping should be scoped by tenant', async () => {
    const t1 = await pool.query(
      'SELECT COUNT(*) as c FROM customers WHERE vendor_id IS NOT NULL AND tenant_id = $1',
      [TEST_TENANT]
    );
    const t2 = await pool.query(
      'SELECT COUNT(*) as c FROM customers WHERE vendor_id IS NOT NULL AND tenant_id = $1',
      [OTHER_TENANT]
    );
    expect(Number(t1.rows[0].c)).toBe(3);
    expect(Number(t2.rows[0].c)).toBe(1);
  });
});
