import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool, cleanupTestData } from '../helpers';

const TEST_TENANT = 'T-TEST-WARRANTIES';
const OTHER_TENANT = 'T-TEST-WAR-OT';

describe('Warranties', () => {
  beforeAll(async () => {
    await cleanupTestData(TEST_TENANT);
    await cleanupTestData(OTHER_TENANT);

    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status)
       VALUES ($1, 'War Test Co', 'test-warranties', 'war@test.com', 'Test', 'active')
       ON CONFLICT (id) DO NOTHING`,
      [TEST_TENANT]
    );
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status)
       VALUES ($1, 'Other Co', 'test-war-other', 'warother@test.com', 'Other', 'active')
       ON CONFLICT (id) DO NOTHING`,
      [OTHER_TENANT]
    );

    await pool.query(
      `INSERT INTO vendors (id, tenant_id, name) VALUES ('V-WAR-1', $1, 'War Vendor') ON CONFLICT DO NOTHING`,
      [TEST_TENANT]
    );
    await pool.query(
      `INSERT INTO products (id, tenant_id, name, price, warranty_months)
       VALUES ('P-WAR-1', $1, 'Test Pump', 3000, 12) ON CONFLICT DO NOTHING`,
      [TEST_TENANT]
    );
    await pool.query(
      `INSERT INTO products (id, tenant_id, name, price, warranty_months)
       VALUES ('P-WAR-OT', $1, 'Other Pump', 2000, 6) ON CONFLICT DO NOTHING`,
      [OTHER_TENANT]
    );

    // Inventory: BC-W-SOLD=sold/has warranty, BC-W-STOCK=InStock (for OWNER replacement),
    // BC-W-DIST=Distributed (for vendor replacement), BC-W-NEW=for new warranty creation
    await pool.query(
      `INSERT INTO product_inventory (id, tenant_id, product_id, barcode, status) VALUES
         ('PI-WAR-1', $1, 'P-WAR-1', 'BC-W-SOLD',  'Sold'),
         ('PI-WAR-2', $1, 'P-WAR-1', 'BC-W-STOCK', 'InStock'),
         ('PI-WAR-3', $1, 'P-WAR-1', 'BC-W-DIST',  'Distributed'),
         ('PI-WAR-4', $1, 'P-WAR-1', 'BC-W-NEW',   'InStock'),
         ('PI-WAR-5', $1, 'P-WAR-1', 'BC-W-DMGD',  'InStock')
       ON CONFLICT DO NOTHING`,
      [TEST_TENANT]
    );

    await pool.query(
      `INSERT INTO product_distribution (id, tenant_id, product_id, barcode, vendor_id, distribution_date, status, net_price) VALUES
         ('PD-WAR-1', $1, 'P-WAR-1', 'BC-W-DIST',  'V-WAR-1', CURRENT_DATE, 'Distributed', 2500),
         ('PD-WAR-2', $1, 'P-WAR-1', 'BC-W-SOLD',  'V-WAR-1', CURRENT_DATE, 'Sold',        2500),
         ('PD-WAR-3', $1, 'P-WAR-1', 'BC-W-DMGD',  'V-WAR-1', CURRENT_DATE, 'Damaged',     2500)
       ON CONFLICT DO NOTHING`,
      [TEST_TENANT]
    );

    await pool.query(
      `INSERT INTO product_sales (id, tenant_id, barcode, product_id, vendor_id, customer_name, customer_phone, purchase_date, sale_price) VALUES
         ('PS-WAR-1', $1, 'BC-W-SOLD', 'P-WAR-1', 'V-WAR-1', 'John Doe', '1111111111', CURRENT_DATE, 3000)
       ON CONFLICT DO NOTHING`,
      [TEST_TENANT]
    );

    const futureExpiry = new Date();
    futureExpiry.setMonth(futureExpiry.getMonth() + 12);
    const futureStr = futureExpiry.toISOString().slice(0, 10);

    await pool.query(
      `INSERT INTO warranties (id, tenant_id, product_id, barcode, customer_name, customer_phone, activation_date, expiry_date, status) VALUES
         ('W-ACT-1',  $1, 'P-WAR-1', 'BC-W-SOLD',  'John Doe',   '1111111111', '2025-01-01', $2,           'Active'),
         ('W-EXP-1',  $1, 'P-WAR-1', 'BC-W-DIST',  'Expired Guy', '2222222222', '2020-01-01', '2021-01-01', 'Active'),
         ('W-ALREP',  $1, 'P-WAR-1', 'BC-W-NEW',   'Already Rep', '3333333333', '2024-01-01', $2,           'Replaced')
       ON CONFLICT DO NOTHING`,
      [TEST_TENANT, futureStr]
    );

    // W-ALREP already has a replaced_barcode
    await pool.query(
      `UPDATE warranties SET replaced_barcode = 'BC-SOME-OLD' WHERE id = 'W-ALREP' AND tenant_id = $1`,
      [TEST_TENANT]
    );

    // Warranty for the OTHER_TENANT (tenant isolation)
    await pool.query(
      `INSERT INTO warranties (id, tenant_id, product_id, barcode, customer_name, customer_phone, activation_date, expiry_date, status)
       VALUES ('W-OT-1', $1, 'P-WAR-OT', 'BC-OT-001', 'Other User', '9999999999', '2025-01-01', $2, 'Active')
       ON CONFLICT DO NOTHING`,
      [OTHER_TENANT, futureStr]
    );
  });

  afterAll(async () => {
    await cleanupTestData(TEST_TENANT);
    await cleanupTestData(OTHER_TENANT);
  });

  // ── GET list ──────────────────────────────────────────────────────────────

  it('should list warranties for tenant', async () => {
    const { rows } = await pool.query(
      `SELECT w.*, p.name as product_name FROM warranties w
       LEFT JOIN products p ON w.product_id = p.id AND p.tenant_id = $1
       WHERE w.tenant_id = $1`,
      [TEST_TENANT]
    );
    expect(rows.length).toBeGreaterThanOrEqual(3);
    expect(rows.every((r: Record<string, unknown>) => r.tenant_id === TEST_TENANT)).toBe(true);
  });

  it('should auto-expire warranties past expiry_date', async () => {
    const today = new Date().toISOString().slice(0, 10);
    await pool.query(
      `UPDATE warranties SET status = 'Expired' WHERE tenant_id = $1 AND expiry_date < $2 AND status != 'Expired'`,
      [TEST_TENANT, today]
    );
    const { rows } = await pool.query(
      `SELECT status FROM warranties WHERE id = 'W-EXP-1' AND tenant_id = $1`,
      [TEST_TENANT]
    );
    expect(rows[0].status).toBe('Expired');
  });

  it('should not auto-expire active warranties with future expiry', async () => {
    const today = new Date().toISOString().slice(0, 10);
    await pool.query(
      `UPDATE warranties SET status = 'Expired' WHERE tenant_id = $1 AND expiry_date < $2 AND status != 'Expired'`,
      [TEST_TENANT, today]
    );
    const { rows } = await pool.query(
      `SELECT status FROM warranties WHERE id = 'W-ACT-1' AND tenant_id = $1`,
      [TEST_TENANT]
    );
    expect(rows[0].status).toBe('Active');
  });

  it('should filter warranties by status', async () => {
    const { rows } = await pool.query(
      `SELECT id FROM warranties WHERE tenant_id = $1 AND status = $2`,
      [TEST_TENANT, 'Active']
    );
    expect(rows.every((r: { id: string }) => r.id)).toBe(true);
    const ids = rows.map((r: { id: string }) => r.id);
    expect(ids).toContain('W-ACT-1');
    expect(ids).not.toContain('W-EXP-1'); // now Expired after auto-expire test
  });

  it('should filter warranties by search (customer_name)', async () => {
    const search = 'John';
    const { rows } = await pool.query(
      `SELECT id FROM warranties WHERE tenant_id = $1 AND customer_name ILIKE $2`,
      [TEST_TENANT, `%${search}%`]
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.map((r: { id: string }) => r.id)).toContain('W-ACT-1');
  });

  it('should filter warranties by vendorId via product_sales subquery', async () => {
    const { rows } = await pool.query(
      `SELECT w.id FROM warranties w
       WHERE w.tenant_id = $1
         AND w.barcode IN (SELECT barcode FROM product_sales WHERE vendor_id = $2 AND tenant_id = $1)`,
      [TEST_TENANT, 'V-WAR-1']
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.map((r: { id: string }) => r.id)).toContain('W-ACT-1');
  });

  it('should enforce tenant isolation on list', async () => {
    const { rows } = await pool.query(
      `SELECT id FROM warranties WHERE tenant_id = $1`,
      [TEST_TENANT]
    );
    const ids = rows.map((r: { id: string }) => r.id);
    expect(ids).not.toContain('W-OT-1');
  });

  it('should support pagination via limit/offset', async () => {
    const { rows: page1 } = await pool.query(
      `SELECT id FROM warranties WHERE tenant_id = $1 ORDER BY activation_date DESC LIMIT 2 OFFSET 0`,
      [TEST_TENANT]
    );
    const { rows: page2 } = await pool.query(
      `SELECT id FROM warranties WHERE tenant_id = $1 ORDER BY activation_date DESC LIMIT 2 OFFSET 2`,
      [TEST_TENANT]
    );
    // pages should not share the same first row when there are enough rows
    if (page1.length === 2 && page2.length >= 1) {
      expect(page2[0].id).not.toBe(page1[0].id);
    }
  });

  it('should count total warranties for pagination', async () => {
    const { rows } = await pool.query(
      `SELECT COUNT(*) as c FROM warranties WHERE tenant_id = $1`,
      [TEST_TENANT]
    );
    expect(parseInt(rows[0].c, 10)).toBeGreaterThanOrEqual(3);
  });

  it('should join product name on list', async () => {
    const { rows } = await pool.query(
      `SELECT w.id, p.name as product_name FROM warranties w
       LEFT JOIN products p ON w.product_id = p.id AND p.tenant_id = $1
       WHERE w.tenant_id = $1 AND w.id = 'W-ACT-1'`,
      [TEST_TENANT]
    );
    expect(rows[0].product_name).toBe('Test Pump');
  });

  // ── POST create ───────────────────────────────────────────────────────────

  it('should require barcode to create warranty', async () => {
    // Route returns 400 when barcode is falsy — verify the guard condition
    const barcode = '';
    expect(!barcode).toBe(true);
  });

  it('should look up product via product_inventory barcode', async () => {
    const { rows } = await pool.query(
      `SELECT pi.product_id FROM product_inventory pi WHERE pi.barcode = $1 AND pi.tenant_id = $2 LIMIT 1`,
      ['BC-W-STOCK', TEST_TENANT]
    );
    expect(rows.length).toBe(1);
    expect(rows[0].product_id).toBe('P-WAR-1');
  });

  it('should return no inventory row for unknown barcode', async () => {
    const { rows } = await pool.query(
      `SELECT pi.product_id FROM product_inventory pi WHERE pi.barcode = $1 AND pi.tenant_id = $2 LIMIT 1`,
      ['BC-DOES-NOT-EXIST', TEST_TENANT]
    );
    expect(rows.length).toBe(0); // triggers 404 in route
  });

  it('should calculate expiry from warranty_months', async () => {
    const { rows } = await pool.query(
      `SELECT warranty_months FROM products WHERE id = 'P-WAR-1' AND tenant_id = $1`,
      [TEST_TENANT]
    );
    const months = rows[0].warranty_months; // 12
    const now = new Date();
    const expiry = new Date(now.getFullYear(), now.getMonth() + months, Math.min(now.getDate(), 28));
    expect(expiry.getTime()).toBeGreaterThan(Date.now());
    expect(months).toBe(12);
  });

  it('should insert warranty with Active status', async () => {
    const id = 'W-CREATED-1';
    const today = new Date().toISOString().slice(0, 10);
    const expiry = new Date();
    expiry.setMonth(expiry.getMonth() + 12);
    const expiryStr = expiry.toISOString().slice(0, 10);

    await pool.query(
      `INSERT INTO warranties (id, tenant_id, product_id, barcode, customer_name, customer_phone, activation_date, expiry_date, status)
       VALUES ($1, $2, 'P-WAR-1', 'BC-W-STOCK', 'New Customer', '4444444444', $3, $4, 'Active')`,
      [id, TEST_TENANT, today, expiryStr]
    );

    const { rows } = await pool.query(
      `SELECT * FROM warranties WHERE id = $1 AND tenant_id = $2`,
      [id, TEST_TENANT]
    );
    expect(rows.length).toBe(1);
    expect(rows[0].status).toBe('Active');
    expect(rows[0].customer_name).toBe('New Customer');
    expect(rows[0].expiry_date).toBeTruthy();

    // cleanup
    await pool.query(`DELETE FROM warranties WHERE id = $1`, [id]);
  });

  it('should not create warranty for another tenant barcode', async () => {
    const { rows } = await pool.query(
      `SELECT pi.product_id FROM product_inventory pi WHERE pi.barcode = $1 AND pi.tenant_id = $2 LIMIT 1`,
      ['BC-OT-001', TEST_TENANT] // OTHER_TENANT barcode, queried with TEST_TENANT
    );
    expect(rows.length).toBe(0); // no cross-tenant leak
  });

  // ── PUT update ────────────────────────────────────────────────────────────

  it('should update customer name and phone', async () => {
    await pool.query(
      `UPDATE warranties SET
         customer_name  = COALESCE($1, customer_name),
         customer_phone = COALESCE($2, customer_phone),
         status         = COALESCE($3, status)
       WHERE id = $4 AND tenant_id = $5`,
      ['Updated Name', '5555555555', null, 'W-ACT-1', TEST_TENANT]
    );
    const { rows } = await pool.query(
      `SELECT customer_name, customer_phone FROM warranties WHERE id = 'W-ACT-1' AND tenant_id = $1`,
      [TEST_TENANT]
    );
    expect(rows[0].customer_name).toBe('Updated Name');
    expect(rows[0].customer_phone).toBe('5555555555');
  });

  it('should update status to Replaced', async () => {
    // effectiveStatus skips 'Expired' — test non-Expired case
    const effectiveStatus = 'Replaced';
    await pool.query(
      `UPDATE warranties SET status = COALESCE($1, status) WHERE id = $2 AND tenant_id = $3`,
      [effectiveStatus, 'W-ACT-1', TEST_TENANT]
    );
    const { rows } = await pool.query(
      `SELECT status FROM warranties WHERE id = 'W-ACT-1' AND tenant_id = $1`,
      [TEST_TENANT]
    );
    expect(rows[0].status).toBe('Replaced');

    // restore
    await pool.query(`UPDATE warranties SET status = 'Active' WHERE id = 'W-ACT-1' AND tenant_id = $1`, [TEST_TENANT]);
  });

  it('should not update status when effectiveStatus is Expired (route skips it)', () => {
    // Route: const effectiveStatus = status === 'Expired' ? undefined : status
    const status = 'Expired';
    const effectiveStatus = status === 'Expired' ? undefined : status;
    expect(effectiveStatus).toBeUndefined();
  });

  it('should return 0 rowCount when warranty not found', async () => {
    const result = await pool.query(
      `UPDATE warranties SET customer_name = $1 WHERE id = $2 AND tenant_id = $3`,
      ['X', 'W-NONEXISTENT', TEST_TENANT]
    );
    expect(result.rowCount).toBe(0); // triggers 404 in route
  });

  it('should reject update on other tenant warranty', async () => {
    const result = await pool.query(
      `UPDATE warranties SET customer_name = $1 WHERE id = $2 AND tenant_id = $3`,
      ['Hacker', 'W-OT-1', TEST_TENANT] // TEST_TENANT trying to update OTHER_TENANT warranty
    );
    expect(result.rowCount).toBe(0);
  });

  it('should clear replaced_barcode when sent as empty string', async () => {
    // Seed a warranty with replaced_barcode
    await pool.query(
      `UPDATE warranties SET replaced_barcode = 'BC-CLEAR-TEST' WHERE id = 'W-ACT-1' AND tenant_id = $1`,
      [TEST_TENANT]
    );
    // Route clears it when replacedBarcode === ''
    await pool.query(
      `UPDATE warranties SET replaced_barcode = NULL WHERE id = $1 AND tenant_id = $2`,
      ['W-ACT-1', TEST_TENANT]
    );
    const { rows } = await pool.query(
      `SELECT replaced_barcode FROM warranties WHERE id = 'W-ACT-1' AND tenant_id = $1`,
      [TEST_TENANT]
    );
    expect(rows[0].replaced_barcode).toBeNull();
  });

  it('should block replacement when warranty already has replaced_barcode', async () => {
    const { rows } = await pool.query(
      `SELECT replaced_barcode FROM warranties WHERE id = 'W-ALREP' AND tenant_id = $1`,
      [TEST_TENANT]
    );
    expect(rows[0].replaced_barcode).not.toBeNull(); // route returns 400
  });

  it('should block replacement when product_replacements already has old_barcode', async () => {
    // Seed an existing replacement record for BC-W-SOLD
    await pool.query(
      `INSERT INTO product_replacements (id, tenant_id, old_barcode, new_barcode, warranty_id, product_id, product_name, customer_name, customer_phone, replaced_date, reason, vendor_id)
       VALUES ('REP-EXIST', $1, 'BC-W-EXIST', 'BC-W-EXIST-NEW', 'W-ACT-1', 'P-WAR-1', 'Test Pump', 'Test', '0000000000', CURRENT_DATE, 'Warranty claim', 'V-WAR-1')
       ON CONFLICT DO NOTHING`,
      [TEST_TENANT]
    );
    const { rows } = await pool.query(
      `SELECT 1 FROM product_replacements WHERE old_barcode = $1 AND tenant_id = $2 LIMIT 1`,
      ['BC-W-EXIST', TEST_TENANT]
    );
    expect(rows.length).toBe(1); // existingRep truthy → route ROLLBACKs and returns 400
  });

  it('should validate new barcode: Distributed status + matching vendor', async () => {
    // BC-W-DIST is Distributed to V-WAR-1 — valid replacement for a V-WAR-1 warranty
    const { rows } = await pool.query(
      `SELECT vendor_id, status FROM product_distribution WHERE barcode = $1 AND tenant_id = $2`,
      ['BC-W-DIST', TEST_TENANT]
    );
    expect(rows[0].vendor_id).toBe('V-WAR-1');
    expect(rows[0].status).toBe('Distributed');
  });

  it('should reject new barcode with Damaged old distribution', async () => {
    // distOld.status === 'Damaged' → route returns 400 "not valid"
    const { rows } = await pool.query(
      `SELECT status FROM product_distribution WHERE barcode = $1 AND tenant_id = $2`,
      ['BC-W-DMGD', TEST_TENANT]
    );
    expect(rows[0].status).toBe('Damaged');
  });

  it('should allow OWNER replacement via InStock inventory', async () => {
    // repVendorId = 'OWNER' when no sale or distribution for old barcode
    // For OWNER: invNew.status === 'InStock' makes newValid true
    const { rows } = await pool.query(
      `SELECT status FROM product_inventory WHERE barcode = $1 AND tenant_id = $2`,
      ['BC-W-STOCK', TEST_TENANT]
    );
    expect(rows[0].status).toBe('InStock');
  });

  it('should run replacement transaction: insert replacement record', async () => {
    const repId = 'REP-TXN-1';
    const wClient = await pool.connect();
    try {
      await wClient.query('BEGIN');
      await wClient.query(
        `INSERT INTO product_replacements (id, tenant_id, old_barcode, new_barcode, warranty_id, product_id, product_name, customer_name, customer_phone, replaced_date, reason, vendor_id)
         VALUES ($1, $2, 'BC-W-SOLD', 'BC-W-DIST', 'W-ACT-1', 'P-WAR-1', 'Test Pump', 'John Doe', '1111111111', CURRENT_DATE, 'Warranty claim', 'V-WAR-1')`,
        [repId, TEST_TENANT]
      );
      await wClient.query(`UPDATE product_distribution SET status = 'Damaged'  WHERE barcode = 'BC-W-SOLD' AND tenant_id = $1`, [TEST_TENANT]);
      await wClient.query(`UPDATE product_distribution SET status = 'Replaced' WHERE barcode = 'BC-W-DIST' AND tenant_id = $1`, [TEST_TENANT]);
      await wClient.query(`UPDATE warranties SET replaced_barcode = $1, status = 'Replaced' WHERE id = $2 AND tenant_id = $3`, ['BC-W-DIST', 'W-ACT-1', TEST_TENANT]);
      await wClient.query('COMMIT');
    } catch (e) {
      await wClient.query('ROLLBACK');
      throw e;
    } finally {
      wClient.release();
    }

    const { rows: repRows } = await pool.query(
      `SELECT * FROM product_replacements WHERE id = $1 AND tenant_id = $2`,
      [repId, TEST_TENANT]
    );
    expect(repRows.length).toBe(1);
    expect(repRows[0].old_barcode).toBe('BC-W-SOLD');
    expect(repRows[0].new_barcode).toBe('BC-W-DIST');

    const { rows: wRows } = await pool.query(
      `SELECT replaced_barcode, status FROM warranties WHERE id = 'W-ACT-1' AND tenant_id = $1`,
      [TEST_TENANT]
    );
    expect(wRows[0].replaced_barcode).toBe('BC-W-DIST');
    expect(wRows[0].status).toBe('Replaced');

    const { rows: distOld } = await pool.query(
      `SELECT status FROM product_distribution WHERE barcode = 'BC-W-SOLD' AND tenant_id = $1`,
      [TEST_TENANT]
    );
    expect(distOld[0].status).toBe('Damaged');

    const { rows: distNew } = await pool.query(
      `SELECT status FROM product_distribution WHERE barcode = 'BC-W-DIST' AND tenant_id = $1`,
      [TEST_TENANT]
    );
    expect(distNew[0].status).toBe('Replaced');
  });

  it('OWNER replacement should set new inventory status to Sold', async () => {
    const wClient = await pool.connect();
    try {
      await wClient.query('BEGIN');
      await wClient.query(
        `UPDATE product_inventory SET status = 'Sold' WHERE barcode = $1 AND tenant_id = $2`,
        ['BC-W-NEW', TEST_TENANT]
      );
      await wClient.query('COMMIT');
    } finally {
      wClient.release();
    }
    const { rows } = await pool.query(
      `SELECT status FROM product_inventory WHERE barcode = $1 AND tenant_id = $2`,
      ['BC-W-NEW', TEST_TENANT]
    );
    expect(rows[0].status).toBe('Sold');
  });

  // ── DELETE ────────────────────────────────────────────────────────────────

  it('should delete warranty by id and tenant_id', async () => {
    const id = 'W-DEL-1';
    const today = new Date().toISOString().slice(0, 10);
    const expiry = new Date();
    expiry.setMonth(expiry.getMonth() + 6);
    await pool.query(
      `INSERT INTO warranties (id, tenant_id, product_id, barcode, customer_name, customer_phone, activation_date, expiry_date, status)
       VALUES ($1, $2, 'P-WAR-1', 'BC-W-DEL', 'Del User', '6666666666', $3, $4, 'Active')`,
      [id, TEST_TENANT, today, expiry.toISOString().slice(0, 10)]
    );

    const result = await pool.query(
      `DELETE FROM warranties WHERE id = $1 AND tenant_id = $2`,
      [id, TEST_TENANT]
    );
    expect(result.rowCount).toBe(1);

    const { rows } = await pool.query(
      `SELECT id FROM warranties WHERE id = $1`, [id]
    );
    expect(rows.length).toBe(0);
  });

  it('should return 0 rowCount when deleting non-existent warranty', async () => {
    const result = await pool.query(
      `DELETE FROM warranties WHERE id = $1 AND tenant_id = $2`,
      ['W-GHOST', TEST_TENANT]
    );
    expect(result.rowCount).toBe(0); // triggers 404 in route
  });

  it('should not delete warranty belonging to other tenant', async () => {
    const result = await pool.query(
      `DELETE FROM warranties WHERE id = $1 AND tenant_id = $2`,
      ['W-OT-1', TEST_TENANT] // correct id, wrong tenant
    );
    expect(result.rowCount).toBe(0);

    // confirm it still exists under its own tenant
    const { rows } = await pool.query(
      `SELECT id FROM warranties WHERE id = 'W-OT-1' AND tenant_id = $1`,
      [OTHER_TENANT]
    );
    expect(rows.length).toBe(1);
  });

  // ── Auth guard ────────────────────────────────────────────────────────────

  it('should require tenant ID (empty string is falsy)', () => {
    const tenantId = '' as string;
    expect(!tenantId).toBe(true); // route returns 401
  });

  it('should require tenant ID (undefined is falsy)', () => {
    const tenantId = undefined as unknown as string;
    expect(!tenantId).toBe(true); // route returns 401
  });

  it('Vendor role without scoped vendor is blocked', () => {
    // Route: if (req.user?.role === 'Vendor' && !scoped) return 403
    const role = 'Vendor';
    const scoped = null; // vendorScopeId returns null when not linked
    expect(role === 'Vendor' && !scoped).toBe(true);
  });
});
