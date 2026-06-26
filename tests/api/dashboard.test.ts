import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool, cleanupTestData } from '../helpers';

const TEST_TENANT = 'T-TEST-DASH';

describe('Dashboard', () => {
  beforeAll(async () => {
    await cleanupTestData(TEST_TENANT);
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status)
       VALUES ($1, 'Dash Co', 'test-dash', 'dash@test.com', 'Dash', 'active')
       ON CONFLICT (id) DO NOTHING`,
      [TEST_TENANT]
    );
    await pool.query(
      `INSERT INTO vendors (id, tenant_id, name)
       VALUES ('V-DASH', $1, 'Dash Vendor')
       ON CONFLICT DO NOTHING`,
      [TEST_TENANT]
    );
    // Create two products
    await pool.query(
      `INSERT INTO products (id, tenant_id, name, price, stock)
       VALUES ('P-D1', $1, 'Alpha Pump', 5000, 10)`,
      [TEST_TENANT]
    );
    await pool.query(
      `INSERT INTO products (id, tenant_id, name, price, stock)
       VALUES ('P-D2', $1, 'Beta Motor', 8000, 2)`,
      [TEST_TENANT]
    );
    // Create inventory barcodes
    for (let i = 1; i <= 5; i++) {
      await pool.query(
        `INSERT INTO product_inventory (id, tenant_id, product_id, barcode, status)
         VALUES ($1, $2, 'P-D1', $3, 'InStock')`,
        [`I-D1-${i}`, TEST_TENANT, `DASH-A-${i}`]
      );
    }
    for (let i = 1; i <= 2; i++) {
      await pool.query(
        `INSERT INTO product_inventory (id, tenant_id, product_id, barcode, status)
         VALUES ($1, $2, 'P-D2', $3, 'InStock')`,
        [`I-D2-${i}`, TEST_TENANT, `DASH-B-${i}`]
      );
    }
    // Create sales
    await pool.query(
      `INSERT INTO product_sales (id, tenant_id, barcode, product_id, vendor_id, customer_name, customer_phone, purchase_date, sale_price)
       VALUES ('S-D1', $1, 'DASH-A-1', 'P-D1', 'V-DASH', 'Cust A', '1111111111', CURRENT_DATE, 5000)`,
      [TEST_TENANT]
    );
    await pool.query(
      `INSERT INTO product_sales (id, tenant_id, barcode, product_id, vendor_id, customer_name, customer_phone, purchase_date, sale_price)
       VALUES ('S-D2', $1, 'DASH-A-2', 'P-D1', 'V-DASH', 'Cust B', '2222222222', CURRENT_DATE, 5000)`,
      [TEST_TENANT]
    );
    await pool.query(
      `INSERT INTO product_sales (id, tenant_id, barcode, product_id, vendor_id, customer_name, customer_phone, purchase_date, sale_price)
       VALUES ('S-D3', $1, 'DASH-B-1', 'P-D2', 'V-DASH', 'Cust C', '3333333333', CURRENT_DATE, 8000)`,
      [TEST_TENANT]
    );
    // Mark sold barcodes
    await pool.query(
      "UPDATE product_inventory SET status = 'Sold' WHERE barcode IN ('DASH-A-1','DASH-A-2','DASH-B-1') AND tenant_id = $1",
      [TEST_TENANT]
    );
  });

  afterAll(async () => {
    await cleanupTestData(TEST_TENANT);
  });

  it('should calculate total products, sales, and revenue', async () => {
    const products = await pool.query(
      'SELECT COUNT(*) as c FROM products WHERE tenant_id = $1',
      [TEST_TENANT]
    );
    expect(Number(products.rows[0].c)).toBe(2);

    const sales = await pool.query(
      'SELECT COUNT(*) as c FROM product_sales WHERE tenant_id = $1',
      [TEST_TENANT]
    );
    expect(Number(sales.rows[0].c)).toBe(3);

    const revenue = await pool.query(
      'SELECT COALESCE(SUM(sale_price), 0) as total FROM product_sales WHERE tenant_id = $1',
      [TEST_TENANT]
    );
    expect(Number(revenue.rows[0].total)).toBe(18000);
  });

  it('should group product sales by name', async () => {
    const { rows } = await pool.query(
      `SELECT p.name, COUNT(ps.id) as sale_count
       FROM product_sales ps
       JOIN products p ON p.id = ps.product_id AND p.tenant_id = ps.tenant_id
       WHERE ps.tenant_id = $1
       GROUP BY p.name
       ORDER BY sale_count DESC`,
      [TEST_TENANT]
    );
    expect(rows.length).toBe(2);
    expect(rows[0].name).toBe('Alpha Pump');
    expect(Number(rows[0].sale_count)).toBe(2);
    expect(rows[1].name).toBe('Beta Motor');
    expect(Number(rows[1].sale_count)).toBe(1);
  });

  it('should return correct vendor summary', async () => {
    const { rows } = await pool.query(
      `SELECT v.name, COUNT(ps.id) as sale_count, COALESCE(SUM(ps.sale_price), 0) as revenue
       FROM vendors v
       LEFT JOIN product_sales ps ON ps.vendor_id = v.id AND ps.tenant_id = v.tenant_id
       WHERE v.tenant_id = $1
       GROUP BY v.name`,
      [TEST_TENANT]
    );
    expect(rows.length).toBe(1);
    expect(rows[0].name).toBe('Dash Vendor');
    expect(Number(rows[0].sale_count)).toBe(3);
    expect(Number(rows[0].revenue)).toBe(18000);
  });

  it('should return dashboard KPIs', async () => {
    const totalProducts = (await pool.query('SELECT COUNT(*) as c FROM products WHERE tenant_id = $1', [TEST_TENANT])).rows[0];
    const totalVendors = (await pool.query('SELECT COUNT(*) as c FROM vendors WHERE tenant_id = $1', [TEST_TENANT])).rows[0];
    const totalSales = (await pool.query('SELECT COUNT(*) as c FROM product_sales WHERE tenant_id = $1', [TEST_TENANT])).rows[0];
    const totalRevenue = (await pool.query('SELECT COALESCE(SUM(sale_price), 0) as total FROM product_sales WHERE tenant_id = $1', [TEST_TENANT])).rows[0];
    const totalBarcodes = (await pool.query('SELECT COUNT(*) as c FROM product_inventory WHERE tenant_id = $1', [TEST_TENANT])).rows[0];

    expect(Number(totalProducts.c)).toBe(2);
    expect(Number(totalVendors.c)).toBe(1);
    expect(Number(totalSales.c)).toBe(3);
    expect(Number(totalRevenue.total)).toBe(18000);
    expect(Number(totalBarcodes.c)).toBe(7);
  });

  it('should detect low stock products', async () => {
    const LOW_STOCK_THRESHOLD = 3;
    const { rows } = await pool.query(
      `SELECT p.id, p.name, p.stock,
              COUNT(pi.id) FILTER (WHERE pi.status = 'InStock') as in_stock_count
       FROM products p
       LEFT JOIN product_inventory pi ON pi.product_id = p.id AND pi.tenant_id = p.tenant_id
       WHERE p.tenant_id = $1
       GROUP BY p.id, p.name, p.stock
       HAVING COUNT(pi.id) FILTER (WHERE pi.status = 'InStock') < $2`,
      [TEST_TENANT, LOW_STOCK_THRESHOLD]
    );
    // Beta Motor has 1 InStock left (2 total - 1 sold)
    const betaMotor = rows.find(r => r.name === 'Beta Motor');
    expect(betaMotor).toBeDefined();
    expect(Number(betaMotor!.in_stock_count)).toBeLessThan(LOW_STOCK_THRESHOLD);
  });

  it('should not flag well-stocked products as low stock', async () => {
    const LOW_STOCK_THRESHOLD = 3;
    const { rows } = await pool.query(
      `SELECT p.id, p.name,
              COUNT(pi.id) FILTER (WHERE pi.status = 'InStock') as in_stock_count
       FROM products p
       LEFT JOIN product_inventory pi ON pi.product_id = p.id AND pi.tenant_id = p.tenant_id
       WHERE p.tenant_id = $1
       GROUP BY p.id, p.name
       HAVING COUNT(pi.id) FILTER (WHERE pi.status = 'InStock') >= $2`,
      [TEST_TENANT, LOW_STOCK_THRESHOLD]
    );
    const alphaPump = rows.find(r => r.name === 'Alpha Pump');
    expect(alphaPump).toBeDefined();
    expect(Number(alphaPump!.in_stock_count)).toBeGreaterThanOrEqual(LOW_STOCK_THRESHOLD);
  });
});
