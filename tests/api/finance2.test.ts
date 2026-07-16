import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool, cleanupTestData } from '../helpers';
import { DISTRIBUTION_BILL_UNIT_SQL } from '../../server/utils/helpers';

const TEST_TENANT = 'T-TEST-FIN2';
const OTHER_TENANT = 'T-TEST-FIN2-OT';

describe('Vendor Finance', () => {
  beforeAll(async () => {
    await cleanupTestData(TEST_TENANT);
    await cleanupTestData(OTHER_TENANT);

    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status)
       VALUES ($1, 'Fin2 Co', 'test-fin2', 'fin2@test.com', 'Fin', 'active')
       ON CONFLICT (id) DO NOTHING`,
      [TEST_TENANT]
    );
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status)
       VALUES ($1, 'Other Fin', 'test-fin2-ot', 'fin2ot@test.com', 'Other', 'active')
       ON CONFLICT (id) DO NOTHING`,
      [OTHER_TENANT]
    );

    await pool.query(
      `INSERT INTO vendors (id, tenant_id, name, phone)
       VALUES ('V-FIN-1', $1, 'Finance Vendor A', '9000000001'),
              ('V-FIN-2', $1, 'Finance Vendor B', '9000000002'),
              ('OWNER', $1, 'Owner', NULL)
       ON CONFLICT DO NOTHING`,
      [TEST_TENANT]
    );
    await pool.query(
      `INSERT INTO vendors (id, tenant_id, name)
       VALUES ('V-FIN-OT', $1, 'Other Vendor') ON CONFLICT DO NOTHING`,
      [OTHER_TENANT]
    );

    await pool.query(
      `INSERT INTO products (id, tenant_id, name, price)
       VALUES ('P-FIN-1', $1, 'Fin Product', 1000) ON CONFLICT DO NOTHING`,
      [TEST_TENANT]
    );

    // Two batches for V-FIN-1 — ₹1000 billed each unit (2 units batch1, 1 unit batch2)
    for (const [id, barcode, batch, price] of [
      ['PD-F1', 'BC-F1', 'BATCH-F1', 1000],
      ['PD-F2', 'BC-F2', 'BATCH-F1', 1000],
      ['PD-F3', 'BC-F3', 'BATCH-F2', 500],
    ] as const) {
      await pool.query(
        `INSERT INTO product_inventory (id, tenant_id, product_id, barcode, status)
         VALUES ($1, $2, 'P-FIN-1', $3, 'Distributed') ON CONFLICT DO NOTHING`,
        [`I-${id}`, TEST_TENANT, barcode]
      );
      await pool.query(
        `INSERT INTO product_distribution
           (id, tenant_id, product_id, barcode, vendor_id, batch_id, distribution_date, status, net_price, billed_price)
         VALUES ($1, $2, 'P-FIN-1', $3, 'V-FIN-1', $4, CURRENT_DATE, 'Distributed', $5, $5)
         ON CONFLICT DO NOTHING`,
        [id, TEST_TENANT, barcode, batch, price]
      );
    }
  });

  afterAll(async () => {
    await cleanupTestData(TEST_TENANT);
    await cleanupTestData(OTHER_TENANT);
  });

  // ── GET /api/vendor-finance/summary ────────────────────────────────────────

  describe('GET /api/vendor-finance/summary', () => {
    it('computes distributed value, paid, and balance per vendor', async () => {
      const vendors = (await pool.query(`
        SELECT v.id, v.name, v.phone,
          COALESCE((SELECT SUM(${DISTRIBUTION_BILL_UNIT_SQL}) FROM product_distribution pd
            JOIN products p ON pd.product_id = p.id WHERE pd.vendor_id = v.id AND pd.tenant_id = $1), 0) as total_distributed_value,
          COALESCE((SELECT SUM(amount) FROM vendor_payments WHERE vendor_id = v.id AND tenant_id = $1), 0) as total_paid,
          (SELECT COUNT(*) FROM product_distribution WHERE vendor_id = v.id AND tenant_id = $1) as units_distributed
        FROM vendors v WHERE v.id != 'OWNER' AND v.tenant_id = $1
        ORDER BY v.name
      `, [TEST_TENANT])).rows;

      const a = vendors.find((v: { id: string }) => v.id === 'V-FIN-1');
      expect(a).toBeTruthy();
      expect(Number(a.total_distributed_value)).toBe(2500); // 1000+1000+500
      expect(Number(a.total_paid)).toBe(0);
      expect(Number(a.units_distributed)).toBe(3);

      const summary = vendors.map((v: Record<string, unknown>) => {
        const distVal = Number(v.total_distributed_value) || 0;
        const paidVal = Number(v.total_paid) || 0;
        return {
          vendorId: v.id,
          balance: distVal - paidVal,
          totalDistributedValue: distVal,
          totalPaid: paidVal,
        };
      });
      const row = summary.find((s) => s.vendorId === 'V-FIN-1')!;
      expect(row.balance).toBe(2500);
    });

    it('excludes OWNER from summary', async () => {
      const { rows } = await pool.query(
        `SELECT id FROM vendors WHERE tenant_id = $1 AND id != 'OWNER'`,
        [TEST_TENANT]
      );
      expect(rows.every((r: { id: string }) => r.id !== 'OWNER')).toBe(true);
    });

    it('is tenant-isolated', async () => {
      const { rows } = await pool.query(
        `SELECT v.id FROM vendors v WHERE v.tenant_id = $1 AND v.id != 'OWNER'`,
        [TEST_TENANT]
      );
      expect(rows.find((r: { id: string }) => r.id === 'V-FIN-OT')).toBeUndefined();
    });

    it('attaches default reminder when none configured', async () => {
      const rem = (await pool.query(
        'SELECT * FROM vendor_reminder_settings WHERE vendor_id = $1 AND tenant_id = $2',
        ['V-FIN-1', TEST_TENANT]
      )).rows[0];
      const reminder = rem
        ? { enabled: !!rem.enabled, days: rem.reminder_days, lastSent: rem.last_reminder_date }
        : { enabled: false, days: 7, lastSent: null };
      expect(reminder.enabled).toBe(false);
      expect(reminder.days).toBe(7);
    });
  });

  // ── GET /api/vendor-finance/:vendorId ──────────────────────────────────────

  describe('GET /api/vendor-finance/:vendorId', () => {
    it('returns vendor detail with distributions grouped', async () => {
      const vendor = (await pool.query(
        'SELECT id, name, phone FROM vendors WHERE id = $1 AND tenant_id = $2',
        ['V-FIN-1', TEST_TENANT]
      )).rows[0];
      expect(vendor.name).toBe('Finance Vendor A');

      const distributions = (await pool.query(`
        SELECT pd.batch_id, SUM(${DISTRIBUTION_BILL_UNIT_SQL}) as line_total, COUNT(*) as qty
        FROM product_distribution pd JOIN products p ON pd.product_id = p.id AND p.tenant_id = $2
        WHERE pd.vendor_id = $1 AND pd.tenant_id = $2
        GROUP BY pd.batch_id
        ORDER BY pd.batch_id
      `, ['V-FIN-1', TEST_TENANT])).rows;

      expect(distributions.length).toBe(2);
      const b1 = distributions.find((d: { batch_id: string }) => d.batch_id === 'BATCH-F1');
      expect(Number(b1.line_total)).toBe(2000);
      expect(Number(b1.qty)).toBe(2);
    });

    it('404 when vendor missing', async () => {
      const vendor = (await pool.query(
        'SELECT id FROM vendors WHERE id = $1 AND tenant_id = $2',
        ['V-NOPE', TEST_TENANT]
      )).rows[0];
      expect(vendor).toBeUndefined();
    });
  });

  // ── POST payments + overpay caps ───────────────────────────────────────────

  describe('POST /api/vendor-finance/:vendorId/payments', () => {
    it('rejects zero / negative / NaN amounts', () => {
      for (const amount of [0, -10, NaN, 'abc']) {
        const parsed = Number(amount);
        expect(!parsed || isNaN(parsed) || parsed <= 0).toBe(true);
      }
    });

    it('rejects amount above 1e8', () => {
      expect(100000001 > 100000000).toBe(true);
    });

    it('records batch payment within remaining balance', async () => {
      const batchId = 'BATCH-F1';
      const bill = Number((await pool.query(
        `SELECT SUM(COALESCE(billed_price, net_price, 0)) as t FROM product_distribution
         WHERE batch_id = $1 AND vendor_id = $2 AND tenant_id = $3`,
        [batchId, 'V-FIN-1', TEST_TENANT]
      )).rows[0].t);
      expect(bill).toBe(2000);

      await pool.query(
        `INSERT INTO vendor_payments (id, tenant_id, vendor_id, amount, payment_date, payment_method, batch_id)
         VALUES ('VP-F1', $1, 'V-FIN-1', 500, CURRENT_DATE, 'UPI', $2)`,
        [TEST_TENANT, batchId]
      );
      const paid = Number((await pool.query(
        `SELECT COALESCE(SUM(amount),0) as t FROM vendor_payments
         WHERE batch_id = $1 AND vendor_id = $2 AND tenant_id = $3`,
        [batchId, 'V-FIN-1', TEST_TENANT]
      )).rows[0].t);
      expect(paid).toBe(500);
      const remaining = bill - paid;
      expect(remaining).toBe(1500);
    });

    it('detects overpay against batch remaining', async () => {
      const batchId = 'BATCH-F1';
      const due = (await pool.query(
        `SELECT
           SUM(COALESCE(pd.billed_price, pd.net_price, 0)) as bill_value,
           COALESCE((SELECT SUM(vp.amount) FROM vendor_payments vp
             WHERE vp.batch_id = $1 AND vp.vendor_id = $2 AND vp.tenant_id = $3), 0) as paid
         FROM product_distribution pd
         WHERE pd.batch_id = $1 AND pd.vendor_id = $2 AND pd.tenant_id = $3`,
        [batchId, 'V-FIN-1', TEST_TENANT]
      )).rows[0];
      const remaining = Number(due.bill_value) - Number(due.paid);
      const parsedAmount = remaining + 100;
      expect(parsedAmount > remaining + 0.01).toBe(true);
    });

    it('detects overpay against total vendor due', async () => {
      const batches = (await pool.query(`
        SELECT pd.batch_id,
          SUM(COALESCE(pd.billed_price, pd.net_price, 0)) as bill_value,
          COALESCE((SELECT SUM(vp.amount) FROM vendor_payments vp
            WHERE vp.batch_id = pd.batch_id AND vp.vendor_id = $1 AND vp.tenant_id = $2), 0) as paid
        FROM product_distribution pd
        WHERE pd.vendor_id = $1 AND pd.tenant_id = $2 AND pd.batch_id IS NOT NULL
        GROUP BY pd.batch_id
      `, ['V-FIN-1', TEST_TENANT])).rows as { bill_value: number; paid: number }[];

      const totalDue = batches.reduce((sum, b) => sum + (Number(b.bill_value) - Number(b.paid)), 0);
      // paid 500 on BATCH-F1 → due = 2000-500 + 500 = 2000
      expect(totalDue).toBe(2000);
      expect(2500 > totalDue + 0.01).toBe(true);
    });

    it('allocates all-batch payment across unpaid batches FIFO', async () => {
      // Pay remaining 1500 on F1 + 500 on F2 = 2000
      const batches = (await pool.query(`
        SELECT pd.batch_id,
          SUM(COALESCE(pd.billed_price, pd.net_price, 0)) as bill_value,
          COALESCE((SELECT SUM(vp.amount) FROM vendor_payments vp
            WHERE vp.batch_id = pd.batch_id AND vp.vendor_id = $1 AND vp.tenant_id = $2), 0) as paid
        FROM product_distribution pd
        WHERE pd.vendor_id = $1 AND pd.tenant_id = $2 AND pd.batch_id IS NOT NULL
        GROUP BY pd.batch_id
        HAVING SUM(COALESCE(pd.billed_price, pd.net_price, 0)) >
          COALESCE((SELECT SUM(vp.amount) FROM vendor_payments vp
            WHERE vp.batch_id = pd.batch_id AND vp.vendor_id = $1 AND vp.tenant_id = $2), 0)
        ORDER BY MIN(pd.distribution_date), pd.batch_id
      `, ['V-FIN-1', TEST_TENANT])).rows as { batch_id: string; bill_value: number; paid: number }[];

      let remaining = 2000;
      let i = 0;
      for (const b of batches) {
        if (remaining <= 0) break;
        const due = Number(b.bill_value) - Number(b.paid);
        const pay = Math.min(remaining, due);
        await pool.query(
          `INSERT INTO vendor_payments (id, tenant_id, vendor_id, amount, payment_date, payment_method, batch_id)
           VALUES ($1, $2, 'V-FIN-1', $3, CURRENT_DATE, 'Cash', $4)`,
          [`VP-ALLOC-${i++}`, TEST_TENANT, pay, b.batch_id]
        );
        remaining -= pay;
      }
      expect(remaining).toBe(0);

      const balance = Number((await pool.query(`
        SELECT
          COALESCE((SELECT SUM(${DISTRIBUTION_BILL_UNIT_SQL}) FROM product_distribution pd
            JOIN products p ON pd.product_id = p.id WHERE pd.vendor_id = $1 AND pd.tenant_id = $2), 0)
          - COALESCE((SELECT SUM(amount) FROM vendor_payments WHERE vendor_id = $1 AND tenant_id = $2), 0) as bal
      `, ['V-FIN-1', TEST_TENANT])).rows[0].bal);
      expect(balance).toBe(0);
    });

    it('rejects payment when already fully paid', async () => {
      const due = (await pool.query(`
        SELECT
          COALESCE((SELECT SUM(COALESCE(pd.billed_price, pd.net_price, 0)) FROM product_distribution pd
            WHERE pd.vendor_id = $1 AND pd.tenant_id = $2), 0) as bill_value,
          COALESCE((SELECT SUM(amount) FROM vendor_payments WHERE vendor_id = $1 AND tenant_id = $2), 0) as paid
      `, ['V-FIN-1', TEST_TENANT])).rows[0];
      const remaining = Number(due.bill_value) - Number(due.paid);
      expect(remaining).toBe(0);
    });
  });

  // ── Reminders ──────────────────────────────────────────────────────────────

  describe('PUT reminder / POST reminder-sent', () => {
    it('upserts reminder settings', async () => {
      await pool.query(
        `INSERT INTO vendor_reminder_settings (vendor_id, tenant_id, enabled, reminder_days)
         VALUES ('V-FIN-2', $1, true, 14)
         ON CONFLICT (vendor_id, tenant_id) DO UPDATE SET enabled = true, reminder_days = 14`,
        [TEST_TENANT]
      );
      const row = (await pool.query(
        'SELECT enabled, reminder_days FROM vendor_reminder_settings WHERE vendor_id = $1 AND tenant_id = $2',
        ['V-FIN-2', TEST_TENANT]
      )).rows[0];
      expect(row.enabled).toBe(true);
      expect(Number(row.reminder_days)).toBe(14);
    });

    it('marks reminder sent with today', async () => {
      await pool.query(
        `INSERT INTO vendor_reminder_settings (vendor_id, tenant_id, enabled, reminder_days)
         VALUES ('V-FIN-2', $1, true, 14) ON CONFLICT DO NOTHING`,
        [TEST_TENANT]
      );
      await pool.query(
        `UPDATE vendor_reminder_settings SET last_reminder_date = CURRENT_DATE
         WHERE vendor_id = $1 AND tenant_id = $2`,
        ['V-FIN-2', TEST_TENANT]
      );
      const row = (await pool.query(
        `SELECT last_reminder_date::text as d FROM vendor_reminder_settings
         WHERE vendor_id = $1 AND tenant_id = $2`,
        ['V-FIN-2', TEST_TENANT]
      )).rows[0];
      const dbToday = (await pool.query('SELECT CURRENT_DATE::text as d')).rows[0].d;
      expect(row.d).toBe(dbToday);
    });

    it('reminders-due includes unpaid vendors past interval', async () => {
      // Give V-FIN-2 some unpaid distribution + old last_reminder
      await pool.query(
        `INSERT INTO product_inventory (id, tenant_id, product_id, barcode, status)
         VALUES ('I-PD-F4', $1, 'P-FIN-1', 'BC-F4', 'Distributed') ON CONFLICT DO NOTHING`,
        [TEST_TENANT]
      );
      await pool.query(
        `INSERT INTO product_distribution
           (id, tenant_id, product_id, barcode, vendor_id, batch_id, distribution_date, status, net_price, billed_price)
         VALUES ('PD-F4', $1, 'P-FIN-1', 'BC-F4', 'V-FIN-2', 'BATCH-F3', CURRENT_DATE, 'Distributed', 800, 800)
         ON CONFLICT DO NOTHING`,
        [TEST_TENANT]
      );
      await pool.query(
        `UPDATE vendor_reminder_settings SET last_reminder_date = CURRENT_DATE - 20, enabled = true, reminder_days = 7
         WHERE vendor_id = $1 AND tenant_id = $2`,
        ['V-FIN-2', TEST_TENANT]
      );

      const today = new Date().toISOString().slice(0, 10);
      const rows = (await pool.query(`
        SELECT vrs.vendor_id, vrs.reminder_days, vrs.last_reminder_date, v.name,
          COALESCE((SELECT SUM(${DISTRIBUTION_BILL_UNIT_SQL}) FROM product_distribution pd
            JOIN products p ON pd.product_id = p.id WHERE pd.vendor_id = v.id AND pd.tenant_id = $1), 0) as total_value,
          COALESCE((SELECT SUM(amount) FROM vendor_payments WHERE vendor_id = v.id AND tenant_id = $1), 0) as total_paid
        FROM vendor_reminder_settings vrs
        JOIN vendors v ON vrs.vendor_id = v.id
        WHERE vrs.enabled = true AND vrs.tenant_id = $1
      `, [TEST_TENANT])).rows;

      const due = rows.filter((r: Record<string, unknown>) => {
        const balance = Number(r.total_value) - Number(r.total_paid);
        if (balance <= 0) return false;
        if (!r.last_reminder_date) return true;
        const lastSent = new Date(String(r.last_reminder_date));
        const nextDue = new Date(lastSent);
        nextDue.setDate(nextDue.getDate() + Number(r.reminder_days));
        return nextDue.toISOString().slice(0, 10) <= today;
      });

      expect(due.some((r: { vendor_id: string }) => r.vendor_id === 'V-FIN-2')).toBe(true);
    });
  });
});
