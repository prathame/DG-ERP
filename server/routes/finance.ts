import { Router } from 'express';
import { pool } from '../pg-db';
import { uid, logAudit, DISTRIBUTION_BILL_UNIT_SQL } from '../utils/helpers';

const router = Router();

// Static routes MUST come before :vendorId param routes
router.get('/api/vendor-finance/summary', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const vendors = (await pool.query(`
      SELECT v.id, v.name, v.phone,
        COALESCE((SELECT SUM(${DISTRIBUTION_BILL_UNIT_SQL}) FROM product_distribution pd JOIN products p ON pd.product_id = p.id WHERE pd.vendor_id = v.id AND pd.tenant_id = $1), 0) as total_distributed_value,
        COALESCE((SELECT SUM(amount) FROM vendor_payments WHERE vendor_id = v.id AND tenant_id = $1), 0) as total_paid,
        (SELECT COUNT(*) FROM product_distribution WHERE vendor_id = v.id AND tenant_id = $1) as units_distributed
      FROM vendors v WHERE v.id != 'OWNER' AND v.tenant_id = $1 ORDER BY v.name
    `, [tenantId])).rows as { id: string; name: string; phone: string | null; total_distributed_value: number; total_paid: number; units_distributed: number }[];

    const reminders = (await pool.query('SELECT vendor_id, enabled, reminder_days, last_reminder_date FROM vendor_reminder_settings WHERE tenant_id = $1', [tenantId])).rows as { vendor_id: string; enabled: boolean; reminder_days: number; last_reminder_date: string | null }[];
    const reminderMap = Object.fromEntries(reminders.map((r) => [r.vendor_id, r]));

    res.json(vendors.map((v) => {
      const rem = reminderMap[v.id];
      const distVal = Number(v.total_distributed_value) || 0;
      const paidVal = Number(v.total_paid) || 0;
      return {
        vendorId: v.id,
        vendorName: v.name,
        vendorPhone: v.phone ?? '',
        totalDistributedValue: distVal,
        totalPaid: paidVal,
        balance: distVal - paidVal,
        unitsDistributed: Number(v.units_distributed) || 0,
        reminder: rem ? { enabled: !!rem.enabled, days: rem.reminder_days, lastSent: rem.last_reminder_date } : { enabled: false, days: 7, lastSent: null },
      };
    }));
  } catch (err) {
    console.error('[API Error]', req.path, err); res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/api/vendor-finance/reminders-due', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const today = new Date().toISOString().slice(0, 10);
    const rows = (await pool.query(`
      SELECT vrs.vendor_id, vrs.reminder_days, vrs.last_reminder_date, v.name, v.phone,
        COALESCE((SELECT SUM(${DISTRIBUTION_BILL_UNIT_SQL}) FROM product_distribution pd JOIN products p ON pd.product_id = p.id WHERE pd.vendor_id = v.id AND pd.tenant_id = $1), 0) as total_value,
        COALESCE((SELECT SUM(amount) FROM vendor_payments WHERE vendor_id = v.id AND tenant_id = $1), 0) as total_paid
      FROM vendor_reminder_settings vrs
      JOIN vendors v ON vrs.vendor_id = v.id
      WHERE vrs.enabled = true AND vrs.tenant_id = $1
    `, [tenantId])).rows as { vendor_id: string; reminder_days: number; last_reminder_date: string | null; name: string; phone: string | null; total_value: number; total_paid: number }[];

    const due = rows.filter((r) => {
      const balance = r.total_value - r.total_paid;
      if (balance <= 0) return false;
      if (!r.last_reminder_date) return true;
      const lastSent = new Date(r.last_reminder_date);
      const nextDue = new Date(lastSent);
      nextDue.setDate(nextDue.getDate() + r.reminder_days);
      return nextDue.toISOString().slice(0, 10) <= today;
    });

    res.json(due.map((r) => ({
      vendorId: r.vendor_id, vendorName: r.name, vendorPhone: r.phone ?? '',
      balance: r.total_value - r.total_paid, totalValue: r.total_value, totalPaid: r.total_paid,
      reminderDays: r.reminder_days, lastSent: r.last_reminder_date,
    })));
  } catch (err) {
    console.error('[API Error]', req.path, err); res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/api/vendor-finance/:vendorId', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { vendorId } = req.params;
    const vendor = (await pool.query('SELECT id, name, phone, email, address, contact_person FROM vendors WHERE id = $1 AND tenant_id = $2', [vendorId, tenantId])).rows[0] as Record<string, unknown> | undefined;
    if (!vendor) return res.status(404).json({ error: 'Vendor not found' });

    const totalValue = (await pool.query(`SELECT COALESCE(SUM(${DISTRIBUTION_BILL_UNIT_SQL}), 0) as total FROM product_distribution pd JOIN products p ON pd.product_id = p.id WHERE pd.vendor_id = $1 AND pd.tenant_id = $2`, [vendorId, tenantId])).rows[0] as { total: number };
    const totalPaid = (await pool.query('SELECT COALESCE(SUM(amount), 0) as total FROM vendor_payments WHERE vendor_id = $1 AND tenant_id = $2', [vendorId, tenantId])).rows[0] as { total: number };
    const payments = (await pool.query('SELECT * FROM vendor_payments WHERE vendor_id = $1 AND tenant_id = $2 ORDER BY payment_date DESC', [vendorId, tenantId])).rows as Record<string, unknown>[];
    const distributions = (await pool.query(`
      SELECT pd.distribution_date, p.name as product_name, p.price as original_price, pd.discount_percent,
             ${DISTRIBUTION_BILL_UNIT_SQL} as unit_price, COUNT(*) as qty,
             SUM(${DISTRIBUTION_BILL_UNIT_SQL}) as line_total
      FROM product_distribution pd JOIN products p ON pd.product_id = p.id AND p.tenant_id = $2
      WHERE pd.vendor_id = $1 AND pd.tenant_id = $2
      GROUP BY pd.distribution_date, pd.product_id, pd.discount_percent, p.name, p.price, pd.billed_price, pd.net_price
      ORDER BY pd.distribution_date DESC
    `, [vendorId, tenantId])).rows as { distribution_date: string; product_name: string; original_price: number; discount_percent: number; unit_price: number; qty: number; line_total: number }[];
    const reminder = (await pool.query('SELECT enabled, reminder_days, last_reminder_date FROM vendor_reminder_settings WHERE vendor_id = $1 AND tenant_id = $2', [vendorId, tenantId])).rows[0] as { enabled: boolean; reminder_days: number; last_reminder_date: string | null } | undefined;

    const distVal = Number(totalValue.total) || 0;
    const paidVal = Number(totalPaid.total) || 0;
    res.json({
      vendor: { id: vendor.id, name: vendor.name, phone: vendor.phone, email: vendor.email, address: vendor.address, contactPerson: vendor.contact_person },
      totalDistributedValue: distVal,
      totalPaid: paidVal,
      balance: distVal - paidVal,
      payments: payments.map((p) => ({
        id: p.id, amount: p.amount, paymentDate: p.payment_date, paymentMethod: p.payment_method, referenceNumber: p.reference_number, notes: p.notes, createdAt: p.created_at,
      })),
      distributions: distributions.map((d) => ({
        date: d.distribution_date, productName: d.product_name, originalPrice: d.original_price, discountPercent: d.discount_percent ?? 0, unitPrice: d.unit_price, quantity: d.qty, total: d.line_total,
      })),
      reminder: reminder ? { enabled: !!reminder.enabled, days: reminder.reminder_days, lastSent: reminder.last_reminder_date } : { enabled: false, days: 7, lastSent: null },
    });
  } catch (err) {
    console.error('[API Error]', req.path, err); res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/api/vendor-finance/:vendorId/payments', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { vendorId } = req.params;
    const { amount, paymentDate, paymentMethod, referenceNumber, notes, batchId } = req.body;
    const parsedAmount = Number(amount);
    if (!parsedAmount || isNaN(parsedAmount) || parsedAmount <= 0) return res.status(400).json({ error: 'Amount must be a valid number greater than 0' });

    const vendor = (await pool.query('SELECT id FROM vendors WHERE id = $1 AND tenant_id = $2', [vendorId, tenantId])).rows[0];
    if (!vendor) return res.status(404).json({ error: 'Vendor not found' });

    const pDate = paymentDate || new Date().toISOString().slice(0, 10);
    const pMethod = paymentMethod || 'Cash';
    const vendorName = ((await pool.query('SELECT name FROM vendors WHERE id = $1 AND tenant_id = $2', [vendorId, tenantId])).rows[0] as { name: string } | undefined)?.name ?? vendorId;

    if (batchId) {
      const id = uid('VP');
      await pool.query(
        'INSERT INTO vendor_payments (id, vendor_id, amount, payment_date, payment_method, reference_number, notes, tenant_id, batch_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
        [id, vendorId, parsedAmount, pDate, pMethod, referenceNumber || null, notes || null, tenantId, batchId]
      );
      logAudit(pool, tenantId, 'Payment Recorded', 'payment', id, `${vendorName} paid ₹${parsedAmount}, batch ${batchId}`);
    } else {
      const batches = (await pool.query(`
        SELECT pd.batch_id,
          SUM(COALESCE(pd.billed_price, pd.net_price, 0)) as bill_value,
          COALESCE((SELECT SUM(vp.amount) FROM vendor_payments vp WHERE vp.batch_id = pd.batch_id AND vp.vendor_id = $1 AND vp.tenant_id = $2), 0) as paid
        FROM product_distribution pd
        WHERE pd.vendor_id = $1 AND pd.tenant_id = $2 AND pd.batch_id IS NOT NULL
        GROUP BY pd.batch_id
        HAVING SUM(COALESCE(pd.billed_price, pd.net_price, 0)) > COALESCE((SELECT SUM(vp.amount) FROM vendor_payments vp WHERE vp.batch_id = pd.batch_id AND vp.vendor_id = $1 AND vp.tenant_id = $2), 0)
        ORDER BY MIN(pd.distribution_date)
      `, [vendorId, tenantId])).rows as { batch_id: string; bill_value: number; paid: number }[];

      let remaining = parsedAmount;
      for (const b of batches) {
        if (remaining <= 0) break;
        const due = Number(b.bill_value) - Number(b.paid);
        const pay = Math.min(remaining, due);
        const id = uid('VP');
        await pool.query(
          'INSERT INTO vendor_payments (id, vendor_id, amount, payment_date, payment_method, reference_number, notes, tenant_id, batch_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
          [id, vendorId, pay, pDate, pMethod, referenceNumber || null, notes ? `${notes} (batch ${b.batch_id})` : `All-batch payment`, tenantId, b.batch_id]
        );
        remaining -= pay;
      }
      if (remaining > 0) {
        const id = uid('VP');
        await pool.query(
          'INSERT INTO vendor_payments (id, vendor_id, amount, payment_date, payment_method, reference_number, notes, tenant_id, batch_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
          [id, vendorId, remaining, pDate, pMethod, referenceNumber || null, notes || 'Advance payment', tenantId, null]
        );
      }
      logAudit(pool, tenantId, 'Payment Recorded', 'payment', uid('VP'), `${vendorName} paid ₹${parsedAmount} across ${batches.length} batches`);
    }

    res.status(201).json({
      id: uid('VP'), amount: parsedAmount, paymentDate: pDate, paymentMethod: pMethod, referenceNumber: referenceNumber || null, notes: notes || null,
    });
  } catch (err) {
    console.error('[API Error]', req.path, err); res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/api/vendor-finance/:vendorId/reminder', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { vendorId } = req.params;
    const { enabled, reminderDays } = req.body;

    await pool.query(
      `INSERT INTO vendor_reminder_settings (vendor_id, enabled, reminder_days, tenant_id) VALUES ($1, $2, $3, $4)
       ON CONFLICT (vendor_id, tenant_id) DO UPDATE SET enabled = $2, reminder_days = $3`,
      [vendorId, enabled ? true : false, reminderDays ?? 7, tenantId]
    );

    const row = (await pool.query('SELECT * FROM vendor_reminder_settings WHERE vendor_id = $1 AND tenant_id = $2', [vendorId, tenantId])).rows[0] as Record<string, unknown>;
    res.json({ enabled: !!(row.enabled), days: row.reminder_days, lastSent: row.last_reminder_date });
  } catch (err) {
    console.error('[API Error]', req.path, err); res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/api/vendor-finance/:vendorId/reminder-sent', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { vendorId } = req.params;
    const today = new Date().toISOString().slice(0, 10);
    await pool.query('UPDATE vendor_reminder_settings SET last_reminder_date = $1 WHERE vendor_id = $2 AND tenant_id = $3', [today, vendorId, tenantId]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[API Error]', req.path, err); res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
