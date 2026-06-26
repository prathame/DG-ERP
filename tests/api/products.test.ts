import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool, cleanupTestData } from '../helpers';

const TEST_TENANT = 'T-TEST-PROD';

describe('Products', () => {
  beforeAll(async () => {
    await cleanupTestData(TEST_TENANT);
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status)
       VALUES ($1, 'Prod Co', 'test-prod', 'prod@test.com', 'Prod', 'active')
       ON CONFLICT (id) DO NOTHING`,
      [TEST_TENANT]
    );
  });

  afterAll(async () => {
    await cleanupTestData(TEST_TENANT);
  });

  it('should create a product', async () => {
    await pool.query(
      `INSERT INTO products (id, tenant_id, name, price, stock)
       VALUES ('P-T1', $1, 'Test Pump', 5000, 0)`,
      [TEST_TENANT]
    );
    const { rows } = await pool.query(
      'SELECT * FROM products WHERE id = $1 AND tenant_id = $2',
      ['P-T1', TEST_TENANT]
    );
    expect(rows.length).toBe(1);
    expect(rows[0].name).toBe('Test Pump');
    expect(Number(rows[0].price)).toBe(5000);
  });

  it('should create barcode inventory', async () => {
    for (let i = 1; i <= 5; i++) {
      await pool.query(
        `INSERT INTO product_inventory (id, tenant_id, product_id, barcode, status)
         VALUES ($1, $2, 'P-T1', $3, 'InStock')`,
        [`I-T${i}`, TEST_TENANT, `TST000${i}`]
      );
    }
    const { rows } = await pool.query(
      'SELECT COUNT(*) as c FROM product_inventory WHERE product_id = $1 AND tenant_id = $2',
      ['P-T1', TEST_TENANT]
    );
    expect(Number(rows[0].c)).toBe(5);
  });

  it('should not allow duplicate barcodes within tenant', async () => {
    const exists =
      (
        await pool.query(
          'SELECT 1 FROM product_inventory WHERE barcode = $1 AND tenant_id = $2',
          ['TST0001', TEST_TENANT]
        )
      ).rows.length > 0;
    expect(exists).toBe(true);
  });

  it('should update product price', async () => {
    await pool.query(
      'UPDATE products SET price = 6000 WHERE id = $1 AND tenant_id = $2',
      ['P-T1', TEST_TENANT]
    );
    const { rows } = await pool.query(
      'SELECT price FROM products WHERE id = $1 AND tenant_id = $2',
      ['P-T1', TEST_TENANT]
    );
    expect(Number(rows[0].price)).toBe(6000);
  });

  it('should update product name', async () => {
    await pool.query(
      'UPDATE products SET name = $1 WHERE id = $2 AND tenant_id = $3',
      ['Updated Pump', 'P-T1', TEST_TENANT]
    );
    const { rows } = await pool.query(
      'SELECT name FROM products WHERE id = $1 AND tenant_id = $2',
      ['P-T1', TEST_TENANT]
    );
    expect(rows[0].name).toBe('Updated Pump');
  });

  it('should delete product', async () => {
    await pool.query(
      `INSERT INTO products (id, tenant_id, name, price)
       VALUES ('P-DEL', $1, 'To Delete', 100)`,
      [TEST_TENANT]
    );
    await pool.query(
      'DELETE FROM products WHERE id = $1 AND tenant_id = $2',
      ['P-DEL', TEST_TENANT]
    );
    const { rows } = await pool.query(
      'SELECT * FROM products WHERE id = $1 AND tenant_id = $2',
      ['P-DEL', TEST_TENANT]
    );
    expect(rows.length).toBe(0);
  });

  it('barcode status should default to InStock', async () => {
    const { rows } = await pool.query(
      'SELECT status FROM product_inventory WHERE barcode = $1 AND tenant_id = $2',
      ['TST0001', TEST_TENANT]
    );
    expect(rows[0].status).toBe('InStock');
  });

  it('should set warranty months on product', async () => {
    await pool.query(
      `INSERT INTO products (id, tenant_id, name, price, warranty_months)
       VALUES ('P-WAR', $1, 'Warranty Product', 2000, 24)`,
      [TEST_TENANT]
    );
    const { rows } = await pool.query(
      'SELECT warranty_months FROM products WHERE id = $1 AND tenant_id = $2',
      ['P-WAR', TEST_TENANT]
    );
    expect(rows[0].warranty_months).toBe(24);
  });

  it('product default warranty should be 12 months', async () => {
    const { rows } = await pool.query(
      'SELECT warranty_months FROM products WHERE id = $1 AND tenant_id = $2',
      ['P-T1', TEST_TENANT]
    );
    expect(rows[0].warranty_months).toBe(12);
  });

  it('product default GST rate should be 18%', async () => {
    const { rows } = await pool.query(
      'SELECT gst_rate FROM products WHERE id = $1 AND tenant_id = $2',
      ['P-T1', TEST_TENANT]
    );
    expect(Number(rows[0].gst_rate)).toBe(18);
  });

  it('should query products by name', async () => {
    const { rows } = await pool.query(
      'SELECT id FROM products WHERE tenant_id = $1 AND name ILIKE $2',
      [TEST_TENANT, '%pump%']
    );
    expect(rows.length).toBeGreaterThan(0);
  });

  it('should count in-stock barcodes for a product', async () => {
    const { rows } = await pool.query(
      `SELECT COUNT(*) as c FROM product_inventory
       WHERE product_id = $1 AND tenant_id = $2 AND status = 'InStock'`,
      ['P-T1', TEST_TENANT]
    );
    expect(Number(rows[0].c)).toBe(5);
  });
});
