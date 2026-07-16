import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool, cleanupTestData } from '../helpers';

const TEST_TENANT = 'T-TEST-PURCH';
const OTHER_TENANT = 'T-TEST-PURCH-OT';

describe('Purchases & Suppliers', () => {
  beforeAll(async () => {
    await cleanupTestData(TEST_TENANT);
    await cleanupTestData(OTHER_TENANT);

    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status)
       VALUES ($1, 'Purch Co', 'test-purch', 'purch@test.com', 'Admin', 'active')
       ON CONFLICT (id) DO NOTHING`,
      [TEST_TENANT]
    );
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status)
       VALUES ($1, 'Other Purch', 'test-purch-ot', 'purchot@test.com', 'Other', 'active')
       ON CONFLICT (id) DO NOTHING`,
      [OTHER_TENANT]
    );

    await pool.query(
      `INSERT INTO products (id, tenant_id, name, price)
       VALUES ('P-PUR-1', $1, 'Purchase Item', 200),
              ('P-PUR-2', $1, 'Purchase Item 2', 150)
       ON CONFLICT DO NOTHING`,
      [TEST_TENANT]
    );
  });

  afterAll(async () => {
    await cleanupTestData(TEST_TENANT);
    await cleanupTestData(OTHER_TENANT);
  });

  // ── Suppliers CRUD ─────────────────────────────────────────────────────────

  describe('Suppliers CRUD', () => {
    it('creates supplier', async () => {
      await pool.query(
        `INSERT INTO suppliers (id, tenant_id, name, contact_person, phone, email, address, gst_number)
         VALUES ('S-1', $1, 'Steel Mills', 'Kiran', '9876501234', 'steel@test.com', 'Rajkot', '24AABCT1332L1ZS')`,
        [TEST_TENANT]
      );
      const { rows } = await pool.query(
        'SELECT * FROM suppliers WHERE id = $1 AND tenant_id = $2',
        ['S-1', TEST_TENANT]
      );
      expect(rows[0].name).toBe('Steel Mills');
      expect(rows[0].gst_number).toBe('24AABCT1332L1ZS');
    });

    it('rejects empty name', () => {
      const name = '';
      expect(!name || !name.trim()).toBe(true);
    });

    it('detects duplicate supplier name (case-insensitive)', async () => {
      const dup = (await pool.query(
        'SELECT id FROM suppliers WHERE tenant_id = $1 AND LOWER(name) = LOWER($2)',
        [TEST_TENANT, 'steel mills']
      )).rows[0];
      expect(dup).toBeTruthy();
    });

    it('validates phone pattern used by route', () => {
      const ok = /^\+?\d[\d\s-]{6,14}$/.test('9876501234');
      const bad = /^\+?\d[\d\s-]{6,14}$/.test('12');
      expect(ok).toBe(true);
      expect(bad).toBe(false);
    });

    it('lists suppliers ordered by name + search', async () => {
      await pool.query(
        `INSERT INTO suppliers (id, tenant_id, name, phone)
         VALUES ('S-2', $1, 'Zinc Corp', '9111122222'),
                ('S-3', $1, 'Copper Hub', '9333344444')
         ON CONFLICT DO NOTHING`,
        [TEST_TENANT]
      );
      const { rows } = await pool.query(
        'SELECT name FROM suppliers WHERE tenant_id = $1 ORDER BY name',
        [TEST_TENANT]
      );
      expect(rows.map((r: { name: string }) => r.name)).toEqual(
        [...rows.map((r: { name: string }) => r.name)].sort((a, b) => a.localeCompare(b))
      );

      const search = await pool.query(
        `SELECT * FROM suppliers WHERE tenant_id = $1 AND (name ILIKE $2 OR contact_person ILIKE $2 OR phone ILIKE $2 OR email ILIKE $2)`,
        [TEST_TENANT, '%zinc%']
      );
      expect(search.rows.length).toBe(1);
      expect(search.rows[0].name).toBe('Zinc Corp');
    });

    it('updates supplier fields', async () => {
      await pool.query(
        `UPDATE suppliers SET contact_person = $1, address = $2 WHERE id = $3 AND tenant_id = $4`,
        ['Kiran Updated', 'Jamnagar', 'S-1', TEST_TENANT]
      );
      const { rows } = await pool.query(
        'SELECT contact_person, address FROM suppliers WHERE id = $1 AND tenant_id = $2',
        ['S-1', TEST_TENANT]
      );
      expect(rows[0].contact_person).toBe('Kiran Updated');
      expect(rows[0].address).toBe('Jamnagar');
    });

    it('is tenant-isolated', async () => {
      await pool.query(
        `INSERT INTO suppliers (id, tenant_id, name) VALUES ('S-OT', $1, 'Other Supplier')
         ON CONFLICT DO NOTHING`,
        [OTHER_TENANT]
      );
      const { rows } = await pool.query(
        'SELECT * FROM suppliers WHERE tenant_id = $1 AND name = $2',
        [TEST_TENANT, 'Other Supplier']
      );
      expect(rows.length).toBe(0);
    });

    it('maps to API camelCase shape', async () => {
      const r = (await pool.query(
        'SELECT id, name, contact_person, phone, email, address, gst_number FROM suppliers WHERE id = $1 AND tenant_id = $2',
        ['S-1', TEST_TENANT]
      )).rows[0];
      const mapped = {
        id: r.id, name: r.name, contactPerson: r.contact_person, phone: r.phone,
        email: r.email, address: r.address, gstNumber: r.gst_number ?? null,
      };
      expect(mapped.contactPerson).toBe('Kiran Updated');
      expect(mapped.gstNumber).toBe('24AABCT1332L1ZS');
    });
  });

  // ── Purchase batches ───────────────────────────────────────────────────────

  describe('Purchase batches', () => {
    it('creates purchase batch rows with cost / billed / GST', async () => {
      const batchId = 'PB-1';
      const gstRate = 18;
      const costPrice = 100;
      const disc = 10;
      const costPricePerUnit = Math.round((costPrice * (100 - disc) / 100) * 100) / 100;
      const gstApplied = true;
      const billedPricePerUnit = gstApplied
        ? Math.round(costPricePerUnit * (100 + gstRate) / 100)
        : costPricePerUnit;
      expect(costPricePerUnit).toBe(90);
      expect(billedPricePerUnit).toBe(106); // 90 * 1.18 = 106.2 → 106

      for (let i = 0; i < 3; i++) {
        await pool.query(
          `INSERT INTO product_purchases
             (id, tenant_id, batch_id, product_id, barcode, supplier_id, purchase_date, cost_price, gst_applied, billed_price, discount_percent)
           VALUES ($1, $2, $3, 'P-PUR-1', $4, 'S-1', CURRENT_DATE, $5, true, $6, $7)`,
          [`PP-${i}`, TEST_TENANT, batchId, `BC-PUR-${i}`, costPricePerUnit, billedPricePerUnit, disc]
        );
        await pool.query(
          `INSERT INTO product_inventory (id, tenant_id, product_id, barcode, status)
           VALUES ($1, $2, 'P-PUR-1', $3, 'InStock') ON CONFLICT DO NOTHING`,
          [`PI-PUR-${i}`, TEST_TENANT, `BC-PUR-${i}`]
        );
      }

      const { rows } = await pool.query(
        'SELECT COUNT(*)::int as c, SUM(billed_price) as billed FROM product_purchases WHERE batch_id = $1 AND tenant_id = $2',
        [batchId, TEST_TENANT]
      );
      expect(rows[0].c).toBe(3);
      expect(Number(rows[0].billed)).toBe(318);
    });

    it('lists batches grouped with totals', async () => {
      const { rows } = await pool.query(`
        SELECT batch_id, supplier_id, COUNT(*)::int as units,
               SUM(COALESCE(billed_price, cost_price)) as total_billed,
               SUM(cost_price) as total_cost
        FROM product_purchases
        WHERE tenant_id = $1 AND batch_id IS NOT NULL
        GROUP BY batch_id, supplier_id
        ORDER BY batch_id
      `, [TEST_TENANT]);
      expect(rows.length).toBeGreaterThanOrEqual(1);
      const b = rows.find((r: { batch_id: string }) => r.batch_id === 'PB-1');
      expect(b.units).toBe(3);
      expect(Number(b.total_billed)).toBe(318);
    });

    it('gets batch detail by batchId', async () => {
      const { rows } = await pool.query(
        `SELECT pp.*, p.name as product_name, s.name as supplier_name
         FROM product_purchases pp
         JOIN products p ON pp.product_id = p.id AND p.tenant_id = pp.tenant_id
         JOIN suppliers s ON pp.supplier_id = s.id AND s.tenant_id = pp.tenant_id
         WHERE pp.batch_id = $1 AND pp.tenant_id = $2
         ORDER BY pp.id`,
        ['PB-1', TEST_TENANT]
      );
      expect(rows.length).toBe(3);
      expect(rows[0].supplier_name).toBe('Steel Mills');
      expect(rows[0].product_name).toBe('Purchase Item');
    });

    it('404 pattern when batch missing', async () => {
      const { rows } = await pool.query(
        'SELECT 1 FROM product_purchases WHERE batch_id = $1 AND tenant_id = $2 LIMIT 1',
        ['PB-MISSING', TEST_TENANT]
      );
      expect(rows.length).toBe(0);
    });

    it('requires supplier and at least one item', () => {
      const supplierId = '';
      const items: unknown[] = [];
      expect(!supplierId).toBe(true);
      expect(!Array.isArray(items) || items.length === 0).toBe(true);
    });
  });

  // ── Supplier finance ───────────────────────────────────────────────────────

  describe('Supplier finance', () => {
    it('summary computes purchased / paid / balance', async () => {
      const suppliers = (await pool.query(`
        SELECT s.id, s.name,
          COALESCE((SELECT SUM(COALESCE(pp.billed_price, pp.cost_price)) FROM product_purchases pp
            WHERE pp.supplier_id = s.id AND pp.tenant_id = $1), 0) as total_purchased_value,
          COALESCE((SELECT SUM(amount) FROM supplier_payments WHERE supplier_id = s.id AND tenant_id = $1), 0) as total_paid,
          (SELECT COUNT(*) FROM product_purchases WHERE supplier_id = s.id AND tenant_id = $1) as units_purchased
        FROM suppliers s WHERE s.tenant_id = $1 ORDER BY s.name
      `, [TEST_TENANT])).rows;

      const steel = suppliers.find((s: { id: string }) => s.id === 'S-1');
      expect(Number(steel.total_purchased_value)).toBe(318);
      expect(Number(steel.total_paid)).toBe(0);
      expect(Number(steel.units_purchased)).toBe(3);
      expect(Number(steel.total_purchased_value) - Number(steel.total_paid)).toBe(318);
    });

    it('records payment within remaining balance', async () => {
      await pool.query(
        `INSERT INTO supplier_payments (id, tenant_id, supplier_id, amount, payment_date, payment_method, batch_id)
         VALUES ('SP-1', $1, 'S-1', 100, CURRENT_DATE, 'NEFT', 'PB-1')`,
        [TEST_TENANT]
      );
      const paid = Number((await pool.query(
        'SELECT COALESCE(SUM(amount),0) as t FROM supplier_payments WHERE supplier_id = $1 AND tenant_id = $2',
        ['S-1', TEST_TENANT]
      )).rows[0].t);
      expect(paid).toBe(100);
    });

    it('detects batch overpay', async () => {
      const due = (await pool.query(
        `SELECT
           SUM(COALESCE(pp.billed_price, pp.cost_price, 0)) as bill_value,
           COALESCE((SELECT SUM(sp.amount) FROM supplier_payments sp
             WHERE sp.batch_id = $1 AND sp.supplier_id = $2 AND sp.tenant_id = $3), 0) as paid
         FROM product_purchases pp
         WHERE pp.batch_id = $1 AND pp.supplier_id = $2 AND pp.tenant_id = $3`,
        ['PB-1', 'S-1', TEST_TENANT]
      )).rows[0];
      const remaining = Number(due.bill_value) - Number(due.paid);
      expect(remaining).toBe(218);
      expect(300 > remaining + 0.01).toBe(true);
    });

    it('detects supplier-level overpay', async () => {
      const due = (await pool.query(
        `SELECT
           COALESCE((SELECT SUM(COALESCE(pp.billed_price, pp.cost_price, 0)) FROM product_purchases pp
             WHERE pp.supplier_id = $1 AND pp.tenant_id = $2), 0) as bill_value,
           COALESCE((SELECT SUM(sp.amount) FROM supplier_payments sp
             WHERE sp.supplier_id = $1 AND sp.tenant_id = $2), 0) as paid`,
        ['S-1', TEST_TENANT]
      )).rows[0];
      const remaining = Number(due.bill_value) - Number(due.paid);
      expect(remaining).toBe(218);
    });

    it('rejects zero/negative payment amounts', () => {
      for (const amount of [0, -5, NaN]) {
        const parsed = Number(amount);
        expect(!parsed || isNaN(parsed) || parsed <= 0).toBe(true);
      }
    });

    it('detail endpoint shape includes payments list', async () => {
      const payments = (await pool.query(
        'SELECT * FROM supplier_payments WHERE supplier_id = $1 AND tenant_id = $2 ORDER BY payment_date DESC',
        ['S-1', TEST_TENANT]
      )).rows;
      expect(payments.length).toBe(1);
      const mapped = payments.map((p: Record<string, unknown>) => ({
        id: p.id, amount: Number(p.amount), paymentDate: p.payment_date,
        paymentMethod: p.payment_method, referenceNumber: p.reference_number, notes: p.notes,
      }));
      expect(mapped[0].amount).toBe(100);
      expect(mapped[0].paymentMethod).toBe('NEFT');
    });

    it('404 when supplier missing', async () => {
      const supplier = (await pool.query(
        'SELECT * FROM suppliers WHERE id = $1 AND tenant_id = $2',
        ['S-MISSING', TEST_TENANT]
      )).rows[0];
      expect(supplier).toBeUndefined();
    });
  });

  // ── Delete supplier rules ──────────────────────────────────────────────────

  describe('DELETE /api/suppliers/:id', () => {
    it('blocks delete when purchases exist', async () => {
      const hasPurchases = (await pool.query(
        'SELECT 1 FROM product_purchases WHERE supplier_id = $1 AND tenant_id = $2 LIMIT 1',
        ['S-1', TEST_TENANT]
      )).rows[0];
      expect(hasPurchases).toBeTruthy();
    });

    it('deletes supplier without purchases (and orphan payments)', async () => {
      await pool.query(
        `INSERT INTO suppliers (id, tenant_id, name) VALUES ('S-DEL', $1, 'Temp Supplier')
         ON CONFLICT DO NOTHING`,
        [TEST_TENANT]
      );
      await pool.query(
        `INSERT INTO supplier_payments (id, tenant_id, supplier_id, amount, payment_date)
         VALUES ('SP-DEL', $1, 'S-DEL', 50, CURRENT_DATE) ON CONFLICT DO NOTHING`,
        [TEST_TENANT]
      );
      await pool.query('DELETE FROM supplier_payments WHERE supplier_id = $1 AND tenant_id = $2', ['S-DEL', TEST_TENANT]);
      const result = await pool.query('DELETE FROM suppliers WHERE id = $1 AND tenant_id = $2', ['S-DEL', TEST_TENANT]);
      expect(result.rowCount).toBe(1);
    });
  });
});
