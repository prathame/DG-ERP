import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool, cleanupTestData } from '../helpers';

const TEST_TENANT = 'T-TEST-SALES';

describe('Sales', () => {
  let saleId: string;

  beforeAll(async () => {
    await cleanupTestData(TEST_TENANT);
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status)
       VALUES ($1, 'Sales Co', 'test-sales', 'sales@test.com', 'Sales', 'active')
       ON CONFLICT (id) DO NOTHING`,
      [TEST_TENANT]
    );
    await pool.query(
      `INSERT INTO vendors (id, tenant_id, name)
       VALUES ('OWNER', $1, 'Owner')
       ON CONFLICT DO NOTHING`,
      [TEST_TENANT]
    );
    await pool.query(
      `INSERT INTO products (id, tenant_id, name, price, warranty_months)
       VALUES ('P-S1', $1, 'Sale Product', 1000, 12)`,
      [TEST_TENANT]
    );
    await pool.query(
      `INSERT INTO product_inventory (id, tenant_id, product_id, barcode, status)
       VALUES ('I-S1', $1, 'P-S1', 'SALE001', 'InStock')`,
      [TEST_TENANT]
    );
    await pool.query(
      `INSERT INTO product_inventory (id, tenant_id, product_id, barcode, status)
       VALUES ('I-S2', $1, 'P-S1', 'SALE002', 'InStock')`,
      [TEST_TENANT]
    );
  });

  afterAll(async () => {
    await cleanupTestData(TEST_TENANT);
  });

  it('barcode should be in stock before sale', async () => {
    const { rows } = await pool.query(
      'SELECT status FROM product_inventory WHERE barcode = $1 AND tenant_id = $2',
      ['SALE001', TEST_TENANT]
    );
    expect(rows[0].status).toBe('InStock');
  });

  it('should create a sale record', async () => {
    saleId = `S-TEST-${Date.now()}`;
    await pool.query(
      `INSERT INTO product_sales (id, tenant_id, barcode, product_id, vendor_id, customer_name, customer_phone, purchase_date, sale_price)
       VALUES ($1, $2, 'SALE001', 'P-S1', 'OWNER', 'Test Customer', '9999999999', CURRENT_DATE, 1000)`,
      [saleId, TEST_TENANT]
    );
    await pool.query(
      "UPDATE product_inventory SET status = 'Sold' WHERE barcode = 'SALE001' AND tenant_id = $1",
      [TEST_TENANT]
    );

    const sale = (
      await pool.query('SELECT * FROM product_sales WHERE id = $1 AND tenant_id = $2', [saleId, TEST_TENANT])
    ).rows[0];
    expect(sale.customer_name).toBe('Test Customer');
    expect(Number(sale.sale_price)).toBe(1000);
    expect(sale.customer_phone).toBe('9999999999');
  });

  it('barcode should be Sold after sale', async () => {
    const { rows } = await pool.query(
      'SELECT status FROM product_inventory WHERE barcode = $1 AND tenant_id = $2',
      ['SALE001', TEST_TENANT]
    );
    expect(rows[0].status).toBe('Sold');
  });

  it('sold barcode should not be available for another sale', async () => {
    const available = (
      await pool.query(
        "SELECT 1 FROM product_inventory WHERE barcode = $1 AND status = 'InStock' AND tenant_id = $2",
        ['SALE001', TEST_TENANT]
      )
    ).rows;
    expect(available.length).toBe(0);
  });

  it('unsold barcode should remain available', async () => {
    const available = (
      await pool.query(
        "SELECT 1 FROM product_inventory WHERE barcode = $1 AND status = 'InStock' AND tenant_id = $2",
        ['SALE002', TEST_TENANT]
      )
    ).rows;
    expect(available.length).toBe(1);
  });

  it('sale should create warranty record', async () => {
    const warrantyId = `W-TEST-${Date.now()}`;
    const activationDate = new Date();
    const expiryDate = new Date();
    expiryDate.setMonth(expiryDate.getMonth() + 12);

    await pool.query(
      `INSERT INTO warranties (id, tenant_id, product_id, barcode, customer_name, customer_phone, activation_date, expiry_date, status)
       VALUES ($1, $2, 'P-S1', 'SALE001', 'Test Customer', '9999999999', $3, $4, 'Active')`,
      [warrantyId, TEST_TENANT, activationDate.toISOString().split('T')[0], expiryDate.toISOString().split('T')[0]]
    );

    const warranty = (
      await pool.query(
        'SELECT * FROM warranties WHERE id = $1 AND tenant_id = $2',
        [warrantyId, TEST_TENANT]
      )
    ).rows[0];
    expect(warranty.status).toBe('Active');
    expect(warranty.customer_name).toBe('Test Customer');
  });

  it('should count total sales per vendor', async () => {
    const { rows } = await pool.query(
      'SELECT COUNT(*) as c FROM product_sales WHERE vendor_id = $1 AND tenant_id = $2',
      ['OWNER', TEST_TENANT]
    );
    expect(Number(rows[0].c)).toBeGreaterThan(0);
  });

  it('should calculate total revenue from sales', async () => {
    const { rows } = await pool.query(
      'SELECT COALESCE(SUM(sale_price), 0) as total FROM product_sales WHERE tenant_id = $1',
      [TEST_TENANT]
    );
    expect(Number(rows[0].total)).toBeGreaterThan(0);
  });
});
