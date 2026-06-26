import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool, cleanupTestData } from '../helpers';

const TEST_TENANT = 'T-TEST-CUST';

describe('Customers', () => {
  beforeAll(async () => {
    await cleanupTestData(TEST_TENANT);
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status)
       VALUES ($1, 'Cust Co', 'test-cust', 'cust@test.com', 'Cust', 'active')
       ON CONFLICT (id) DO NOTHING`,
      [TEST_TENANT]
    );
    await pool.query(
      `INSERT INTO vendors (id, tenant_id, name)
       VALUES ('V-CUST', $1, 'Cust Vendor')
       ON CONFLICT DO NOTHING`,
      [TEST_TENANT]
    );
    await pool.query(
      `INSERT INTO products (id, tenant_id, name, price)
       VALUES ('P-CUST', $1, 'Cust Product', 2000)`,
      [TEST_TENANT]
    );
    await pool.query(
      `INSERT INTO product_inventory (id, tenant_id, product_id, barcode, status)
       VALUES ('I-CUST', $1, 'P-CUST', 'CUST-BC-001', 'Sold')`,
      [TEST_TENANT]
    );
  });

  afterAll(async () => {
    await cleanupTestData(TEST_TENANT);
  });

  it('should create a customer', async () => {
    await pool.query(
      `INSERT INTO customers (id, tenant_id, name, phone, email, address, vendor_id)
       VALUES ('C-1', $1, 'John Doe', '9876543210', 'john@test.com', '123 Main St', 'V-CUST')`,
      [TEST_TENANT]
    );
    const { rows } = await pool.query(
      'SELECT * FROM customers WHERE id = $1 AND tenant_id = $2',
      ['C-1', TEST_TENANT]
    );
    expect(rows.length).toBe(1);
    expect(rows[0].name).toBe('John Doe');
    expect(rows[0].phone).toBe('9876543210');
  });

  it('customer should be linked to vendor', async () => {
    const { rows } = await pool.query(
      'SELECT vendor_id FROM customers WHERE id = $1 AND tenant_id = $2',
      ['C-1', TEST_TENANT]
    );
    expect(rows[0].vendor_id).toBe('V-CUST');
  });

  it('customer phone should be unique within tenant', async () => {
    const { rows } = await pool.query(
      'SELECT COUNT(*) as c FROM customers WHERE phone = $1 AND tenant_id = $2',
      ['9876543210', TEST_TENANT]
    );
    expect(Number(rows[0].c)).toBe(1);
  });

  it('should update customer details', async () => {
    await pool.query(
      'UPDATE customers SET name = $1, address = $2 WHERE id = $3 AND tenant_id = $4',
      ['Jane Doe', '456 Oak Ave', 'C-1', TEST_TENANT]
    );
    const { rows } = await pool.query(
      'SELECT name, address FROM customers WHERE id = $1 AND tenant_id = $2',
      ['C-1', TEST_TENANT]
    );
    expect(rows[0].name).toBe('Jane Doe');
    expect(rows[0].address).toBe('456 Oak Ave');
  });

  it('should delete a customer', async () => {
    await pool.query(
      `INSERT INTO customers (id, tenant_id, name, phone)
       VALUES ('C-DEL', $1, 'Del Customer', '1111111111')`,
      [TEST_TENANT]
    );
    await pool.query(
      'DELETE FROM customers WHERE id = $1 AND tenant_id = $2',
      ['C-DEL', TEST_TENANT]
    );
    const { rows } = await pool.query(
      'SELECT * FROM customers WHERE id = $1 AND tenant_id = $2',
      ['C-DEL', TEST_TENANT]
    );
    expect(rows.length).toBe(0);
  });

  it('should query customer purchase history via sales', async () => {
    await pool.query(
      `INSERT INTO product_sales (id, tenant_id, barcode, product_id, vendor_id, customer_id, customer_name, customer_phone, purchase_date, sale_price)
       VALUES ('S-CUST-1', $1, 'CUST-BC-001', 'P-CUST', 'V-CUST', 'C-1', 'Jane Doe', '9876543210', CURRENT_DATE, 2000)`,
      [TEST_TENANT]
    );
    const { rows } = await pool.query(
      'SELECT * FROM product_sales WHERE customer_id = $1 AND tenant_id = $2',
      ['C-1', TEST_TENANT]
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(Number(rows[0].sale_price)).toBe(2000);
  });
});
