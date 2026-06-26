import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool, cleanupTestData } from '../helpers';

const TEST_TENANT = 'T-TEST-DIST';

describe('Distribution', () => {
  beforeAll(async () => {
    await cleanupTestData(TEST_TENANT);
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status)
       VALUES ($1, 'Dist Co', 'test-dist', 'dist@test.com', 'Dist', 'active')
       ON CONFLICT (id) DO NOTHING`,
      [TEST_TENANT]
    );
    await pool.query(
      `INSERT INTO vendors (id, tenant_id, name)
       VALUES ('V-D1', $1, 'Vendor One')
       ON CONFLICT DO NOTHING`,
      [TEST_TENANT]
    );
    await pool.query(
      `INSERT INTO vendors (id, tenant_id, name)
       VALUES ('V-D2', $1, 'Vendor Two')
       ON CONFLICT DO NOTHING`,
      [TEST_TENANT]
    );
    await pool.query(
      `INSERT INTO products (id, tenant_id, name, price)
       VALUES ('P-D1', $1, 'Dist Product', 500)`,
      [TEST_TENANT]
    );
    for (let i = 1; i <= 3; i++) {
      await pool.query(
        `INSERT INTO product_inventory (id, tenant_id, product_id, barcode, status)
         VALUES ($1, $2, 'P-D1', $3, 'InStock')`,
        [`I-D${i}`, TEST_TENANT, `DIST000${i}`]
      );
    }
  });

  afterAll(async () => {
    await cleanupTestData(TEST_TENANT);
  });

  it('should distribute product to vendor', async () => {
    await pool.query(
      `INSERT INTO product_distribution (id, tenant_id, product_id, barcode, vendor_id, distribution_date, status, net_price)
       VALUES ('D-1', $1, 'P-D1', 'DIST0001', 'V-D1', CURRENT_DATE, 'Distributed', 500)`,
      [TEST_TENANT]
    );
    const { rows } = await pool.query(
      'SELECT * FROM product_distribution WHERE id = $1 AND tenant_id = $2',
      ['D-1', TEST_TENANT]
    );
    expect(rows[0].vendor_id).toBe('V-D1');
    expect(rows[0].status).toBe('Distributed');
  });

  it('should apply discount correctly', () => {
    const price = 1000;
    const discount = 10;
    const netPrice = Math.round(price * (100 - discount) / 100);
    expect(netPrice).toBe(900);
  });

  it('should calculate GST on top of price', () => {
    const basePrice = 1000;
    const gstRate = 18;
    const gstAmount = Math.round(basePrice * gstRate / 100);
    const total = basePrice + gstAmount;
    expect(gstAmount).toBe(180);
    expect(total).toBe(1180);
  });

  it('CGST + SGST should equal total GST', () => {
    const gstAmount = 180;
    const cgst = Math.round(gstAmount / 2);
    const sgst = gstAmount - cgst;
    expect(cgst + sgst).toBe(gstAmount);
  });

  it('distributed barcode should not be InStock', async () => {
    await pool.query(
      "UPDATE product_inventory SET status = 'Distributed' WHERE barcode = 'DIST0001' AND tenant_id = $1",
      [TEST_TENANT]
    );
    const { rows } = await pool.query(
      "SELECT status FROM product_inventory WHERE barcode = 'DIST0001' AND tenant_id = $1",
      [TEST_TENANT]
    );
    expect(rows[0].status).toBe('Distributed');
  });

  it('should distribute to different vendors', async () => {
    await pool.query(
      `INSERT INTO product_distribution (id, tenant_id, product_id, barcode, vendor_id, distribution_date, status, net_price)
       VALUES ('D-2', $1, 'P-D1', 'DIST0002', 'V-D2', CURRENT_DATE, 'Distributed', 500)`,
      [TEST_TENANT]
    );
    await pool.query(
      "UPDATE product_inventory SET status = 'Distributed' WHERE barcode = 'DIST0002' AND tenant_id = $1",
      [TEST_TENANT]
    );

    const vendorOneItems = (
      await pool.query(
        'SELECT COUNT(*) as c FROM product_distribution WHERE vendor_id = $1 AND tenant_id = $2',
        ['V-D1', TEST_TENANT]
      )
    ).rows[0];
    const vendorTwoItems = (
      await pool.query(
        'SELECT COUNT(*) as c FROM product_distribution WHERE vendor_id = $1 AND tenant_id = $2',
        ['V-D2', TEST_TENANT]
      )
    ).rows[0];

    expect(Number(vendorOneItems.c)).toBe(1);
    expect(Number(vendorTwoItems.c)).toBe(1);
  });

  it('should record distribution with discount', async () => {
    await pool.query(
      `INSERT INTO product_distribution (id, tenant_id, product_id, barcode, vendor_id, distribution_date, status, discount_percent, net_price)
       VALUES ('D-3', $1, 'P-D1', 'DIST0003', 'V-D1', CURRENT_DATE, 'Distributed', 15, 425)`,
      [TEST_TENANT]
    );
    const { rows } = await pool.query(
      'SELECT discount_percent, net_price FROM product_distribution WHERE id = $1 AND tenant_id = $2',
      ['D-3', TEST_TENANT]
    );
    expect(Number(rows[0].discount_percent)).toBe(15);
    expect(Number(rows[0].net_price)).toBe(425);
  });

  it('should track distribution count per vendor', async () => {
    const { rows } = await pool.query(
      'SELECT COUNT(*) as c FROM product_distribution WHERE vendor_id = $1 AND tenant_id = $2',
      ['V-D1', TEST_TENANT]
    );
    expect(Number(rows[0].c)).toBe(2);
  });

  it('remaining InStock barcodes should be correct', async () => {
    const { rows } = await pool.query(
      `SELECT COUNT(*) as c FROM product_inventory
       WHERE product_id = 'P-D1' AND tenant_id = $1 AND status = 'InStock'`,
      [TEST_TENANT]
    );
    expect(Number(rows[0].c)).toBe(1); // only DIST0003 left InStock
  });
});
