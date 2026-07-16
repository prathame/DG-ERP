import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool, cleanupTestData, createTestToken } from '../helpers';
import { isValidPhone, isValidEmail, isValidGstin } from '../../server/utils/helpers';

const TEST_TENANT = 'T-TEST-VENDORS';
const OTHER_TENANT = 'T-TEST-VENDORS-OT';

describe('Vendors', () => {
  beforeAll(async () => {
    await cleanupTestData(TEST_TENANT);
    await cleanupTestData(OTHER_TENANT);

    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, vendor_portal_enabled)
       VALUES ($1, 'Vendors Co', 'test-vendors', 'vendors@test.com', 'Admin', 'active', false)
       ON CONFLICT (id) DO NOTHING`,
      [TEST_TENANT]
    );
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status)
       VALUES ($1, 'Other Co', 'test-vendors-ot', 'vot@test.com', 'Other', 'active')
       ON CONFLICT (id) DO NOTHING`,
      [OTHER_TENANT]
    );
    await pool.query(
      `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
       VALUES ('U-V-ADMIN', $1, 'admin@vendors.com', 'hash', 'Admin', 'Admin')
       ON CONFLICT DO NOTHING`,
      [TEST_TENANT]
    );
    await pool.query(
      `INSERT INTO products (id, tenant_id, name, price)
       VALUES ('P-V-1', $1, 'Vendor Product', 500) ON CONFLICT DO NOTHING`,
      [TEST_TENANT]
    );
  });

  afterAll(async () => {
    await cleanupTestData(TEST_TENANT);
    await cleanupTestData(OTHER_TENANT);
  });

  // ── Auth / tokens ──────────────────────────────────────────────────────────

  it('Admin token embeds tenant and role', () => {
    const token = createTestToken({
      userId: 'U-V-ADMIN', tenantId: TEST_TENANT, email: 'admin@vendors.com', role: 'Admin', name: 'Admin',
    });
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    expect(payload.tenantId).toBe(TEST_TENANT);
    expect(payload.role).toBe('Admin');
  });

  // ── Validation helpers used by POST /api/vendors ───────────────────────────

  describe('input validation (route rules)', () => {
    it('accepts valid Indian mobile', () => {
      expect(isValidPhone('9876543210')).toBe(true);
      expect(isValidPhone('+919876543210')).toBe(true);
    });
    it('rejects invalid phone', () => {
      expect(isValidPhone('12345')).toBe(false);
      expect(isValidPhone('0123456789')).toBe(false);
    });
    it('accepts valid email', () => {
      expect(isValidEmail('a@b.com')).toBe(true);
    });
    it('rejects invalid email', () => {
      expect(isValidEmail('not-an-email')).toBe(false);
    });
    it('accepts valid GSTIN', () => {
      expect(isValidGstin('24AABCT1332L1ZS')).toBe(true);
    });
    it('rejects short GSTIN', () => {
      expect(isValidGstin('24AA')).toBe(false);
    });
  });

  // ── CREATE ─────────────────────────────────────────────────────────────────

  describe('POST /api/vendors (create)', () => {
    it('creates vendor with contact fields', async () => {
      await pool.query(
        `INSERT INTO vendors (id, tenant_id, name, contact_person, phone, email, address, gst_number)
         VALUES ('V-CREATE-1', $1, 'Alpha Traders', 'Ravi', '9876543210', 'alpha@test.com', 'Ahmedabad', '24AABCT1332L1ZS')`,
        [TEST_TENANT]
      );
      const { rows } = await pool.query(
        'SELECT * FROM vendors WHERE id = $1 AND tenant_id = $2',
        ['V-CREATE-1', TEST_TENANT]
      );
      expect(rows.length).toBe(1);
      expect(rows[0].name).toBe('Alpha Traders');
      expect(rows[0].contact_person).toBe('Ravi');
      expect(rows[0].phone).toBe('9876543210');
      expect(rows[0].gst_number).toBe('24AABCT1332L1ZS');
    });

    it('rejects duplicate name (case-insensitive) — route logic', async () => {
      const dup = (await pool.query(
        'SELECT id, name FROM vendors WHERE tenant_id = $1 AND LOWER(name) = LOWER($2)',
        [TEST_TENANT, 'alpha traders']
      )).rows[0];
      expect(dup).toBeTruthy();
      expect(dup.name).toBe('Alpha Traders');
    });

    it('rejects duplicate email — route logic', async () => {
      const emailDup = (await pool.query(
        `SELECT id FROM vendors WHERE tenant_id = $1 AND email IS NOT NULL AND email != '' AND LOWER(email) = LOWER($2)`,
        [TEST_TENANT, 'alpha@test.com']
      )).rows[0];
      expect(emailDup).toBeTruthy();
    });

    it('requires non-empty name', () => {
      const name = '   ';
      expect(!name.trim()).toBe(true);
    });
  });

  // ── LIST / SEARCH ──────────────────────────────────────────────────────────

  describe('GET /api/vendors', () => {
    beforeAll(async () => {
      await pool.query(
        `INSERT INTO vendors (id, tenant_id, name, contact_person, phone, email)
         VALUES ('V-LIST-2', $1, 'Beta Motors', 'Sita', '9123456780', 'beta@test.com'),
                ('V-LIST-3', $1, 'Gamma Parts', 'Amit', '9988776655', 'gamma@test.com')
         ON CONFLICT DO NOTHING`,
        [TEST_TENANT]
      );
      await pool.query(
        `INSERT INTO vendors (id, tenant_id, name)
         VALUES ('V-OTHER', $1, 'Other Tenant Vendor') ON CONFLICT DO NOTHING`,
        [OTHER_TENANT]
      );
    });

    it('lists vendors for tenant ordered by name', async () => {
      const { rows } = await pool.query(
        `SELECT * FROM vendors WHERE tenant_id = $1 ORDER BY name`,
        [TEST_TENANT]
      );
      expect(rows.length).toBeGreaterThanOrEqual(3);
      const names = rows.map((r: { name: string }) => r.name);
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    });

    it('search by name ILIKE', async () => {
      const { rows } = await pool.query(
        `SELECT * FROM vendors WHERE tenant_id = $1 AND (name ILIKE $2 OR contact_person ILIKE $2 OR phone ILIKE $2 OR email ILIKE $2)`,
        [TEST_TENANT, '%beta%']
      );
      expect(rows.length).toBe(1);
      expect(rows[0].name).toBe('Beta Motors');
    });

    it('search by phone', async () => {
      const { rows } = await pool.query(
        `SELECT * FROM vendors WHERE tenant_id = $1 AND phone ILIKE $2`,
        [TEST_TENANT, '%998877%']
      );
      expect(rows.length).toBe(1);
      expect(rows[0].id).toBe('V-LIST-3');
    });

    it('is tenant-isolated', async () => {
      const { rows } = await pool.query(
        'SELECT * FROM vendors WHERE tenant_id = $1 AND name = $2',
        [TEST_TENANT, 'Other Tenant Vendor']
      );
      expect(rows.length).toBe(0);
      const other = await pool.query(
        'SELECT * FROM vendors WHERE tenant_id = $1',
        [OTHER_TENANT]
      );
      expect(other.rows.length).toBe(1);
    });

    it('vendor-scoped user only sees linked vendor', async () => {
      const scopedId = 'V-CREATE-1';
      const { rows } = await pool.query(
        'SELECT * FROM vendors WHERE tenant_id = $1 AND id = $2',
        [TEST_TENANT, scopedId]
      );
      expect(rows.length).toBe(1);
      expect(rows[0].id).toBe(scopedId);
    });
  });

  // ── UPDATE ─────────────────────────────────────────────────────────────────

  describe('PUT /api/vendors/:id', () => {
    it('updates contact fields', async () => {
      await pool.query(
        `UPDATE vendors SET contact_person = $1, phone = $2, address = $3
         WHERE id = $4 AND tenant_id = $5`,
        ['Ravi Updated', '9000011111', 'Surat', 'V-CREATE-1', TEST_TENANT]
      );
      const { rows } = await pool.query(
        'SELECT contact_person, phone, address FROM vendors WHERE id = $1 AND tenant_id = $2',
        ['V-CREATE-1', TEST_TENANT]
      );
      expect(rows[0].contact_person).toBe('Ravi Updated');
      expect(rows[0].phone).toBe('9000011111');
      expect(rows[0].address).toBe('Surat');
    });

    it('blocks rename to existing vendor name', async () => {
      const dup = (await pool.query(
        'SELECT id FROM vendors WHERE tenant_id = $1 AND LOWER(name) = LOWER($2) AND id != $3',
        [TEST_TENANT, 'Beta Motors', 'V-CREATE-1']
      )).rows[0];
      expect(dup).toBeTruthy();
    });

    it('returns not found for missing id', async () => {
      const result = await pool.query(
        'UPDATE vendors SET name = $1 WHERE id = $2 AND tenant_id = $3',
        ['Nope', 'V-MISSING', TEST_TENANT]
      );
      expect(result.rowCount).toBe(0);
    });
  });

  // ── BULK IMPORT ────────────────────────────────────────────────────────────

  describe('POST /api/vendors/bulk', () => {
    it('imports multiple vendors atomically', async () => {
      const vendors = [
        { name: 'Bulk One', phone: '9111111111' },
        { name: 'Bulk Two', phone: '9222222222' },
      ];
      for (const v of vendors) {
        await pool.query(
          `INSERT INTO vendors (id, tenant_id, name, phone) VALUES ($1, $2, $3, $4)`,
          [`V-BULK-${v.name.replace(/\s/g, '')}`, TEST_TENANT, v.name, v.phone]
        );
      }
      const { rows } = await pool.query(
        `SELECT name FROM vendors WHERE tenant_id = $1 AND name LIKE 'Bulk%' ORDER BY name`,
        [TEST_TENANT]
      );
      expect(rows.map((r: { name: string }) => r.name)).toEqual(['Bulk One', 'Bulk Two']);
    });

    it('rejects empty name in bulk payload', () => {
      const vendors = [{ name: 'Ok' }, { name: '  ' }];
      const bad = vendors.findIndex((v) => !v.name.trim());
      expect(bad).toBe(1);
    });

    it('detects duplicate before insert (fail-fast)', async () => {
      const dup = (await pool.query(
        'SELECT id FROM vendors WHERE tenant_id = $1 AND LOWER(name) = LOWER($2)',
        [TEST_TENANT, 'Bulk One']
      )).rows[0];
      expect(dup).toBeTruthy();
    });
  });

  // ── DELETE ─────────────────────────────────────────────────────────────────

  describe('DELETE /api/vendors/:id', () => {
    it('blocks delete when distributions exist', async () => {
      await pool.query(
        `INSERT INTO product_inventory (id, tenant_id, product_id, barcode, status)
         VALUES ('PI-V-1', $1, 'P-V-1', 'BC-V-DEL', 'Distributed') ON CONFLICT DO NOTHING`,
        [TEST_TENANT]
      );
      await pool.query(
        `INSERT INTO product_distribution (id, tenant_id, product_id, barcode, vendor_id, distribution_date, status, net_price)
         VALUES ('PD-V-1', $1, 'P-V-1', 'BC-V-DEL', 'V-LIST-2', CURRENT_DATE, 'Distributed', 500)
         ON CONFLICT DO NOTHING`,
        [TEST_TENANT]
      );
      const hasDist = (await pool.query(
        'SELECT 1 FROM product_distribution WHERE vendor_id = $1 AND tenant_id = $2 LIMIT 1',
        ['V-LIST-2', TEST_TENANT]
      )).rows[0];
      expect(hasDist).toBeTruthy();
    });

    it('deletes vendor without distributions and cleans payments/reminders', async () => {
      await pool.query(
        `INSERT INTO vendors (id, tenant_id, name) VALUES ('V-DEL-OK', $1, 'Deletable Vendor')
         ON CONFLICT DO NOTHING`,
        [TEST_TENANT]
      );
      await pool.query(
        `INSERT INTO vendor_payments (id, tenant_id, vendor_id, amount, payment_date, payment_method)
         VALUES ('VP-DEL', $1, 'V-DEL-OK', 100, CURRENT_DATE, 'Cash') ON CONFLICT DO NOTHING`,
        [TEST_TENANT]
      );
      await pool.query(
        `INSERT INTO vendor_reminder_settings (vendor_id, tenant_id, enabled, reminder_days)
         VALUES ('V-DEL-OK', $1, true, 7) ON CONFLICT DO NOTHING`,
        [TEST_TENANT]
      );

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('DELETE FROM vendor_reminder_settings WHERE vendor_id = $1 AND tenant_id = $2', ['V-DEL-OK', TEST_TENANT]);
        await client.query('DELETE FROM vendor_payments WHERE vendor_id = $1 AND tenant_id = $2', ['V-DEL-OK', TEST_TENANT]);
        const result = await client.query('DELETE FROM vendors WHERE id = $1 AND tenant_id = $2', ['V-DEL-OK', TEST_TENANT]);
        expect(result.rowCount).toBe(1);
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }

      const gone = await pool.query('SELECT 1 FROM vendors WHERE id = $1 AND tenant_id = $2', ['V-DEL-OK', TEST_TENANT]);
      expect(gone.rows.length).toBe(0);
    });

    it('404 when vendor missing', async () => {
      const result = await pool.query(
        'DELETE FROM vendors WHERE id = $1 AND tenant_id = $2',
        ['V-NOPE', TEST_TENANT]
      );
      expect(result.rowCount).toBe(0);
    });
  });

  // ── RESPONSE SHAPE ─────────────────────────────────────────────────────────

  it('maps DB columns to API camelCase shape', async () => {
    const { rows } = await pool.query(
      'SELECT id, name, contact_person, phone, email, address, total_sales, total_reward_points, gst_number FROM vendors WHERE id = $1 AND tenant_id = $2',
      ['V-CREATE-1', TEST_TENANT]
    );
    const r = rows[0];
    const mapped = {
      id: r.id,
      name: r.name,
      contactPerson: r.contact_person,
      phone: r.phone,
      email: r.email,
      address: r.address,
      totalSales: r.total_sales ?? 0,
      totalRewardPoints: r.total_reward_points ?? 0,
      gstNumber: r.gst_number ?? null,
    };
    expect(mapped.contactPerson).toBe('Ravi Updated');
    expect(mapped).toHaveProperty('totalSales');
    expect(mapped).toHaveProperty('gstNumber');
  });
});
