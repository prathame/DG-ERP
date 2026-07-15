import { Router } from 'express';
import { blockVendors, requireAdmin, AuthRequest, vendorScopeId, assertVendorAccess, assertVendorLinked } from '../middleware/auth';
import { pool } from '../pg-db';
import { uid, logAudit, DISTRIBUTION_BILL_UNIT_SQL } from '../utils/helpers';

const router = Router();

// Static routes MUST come before :vendorId param routes
router.get('/api/vendor-finance/summary', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const unlinked = assertVendorLinked(req);
    if (unlinked) return res.status(403).json({ error: unlinked });

    const vendors = (await pool.query(`
      SELECT v.id, v.name, v.phone,
        COALESCE((SELECT SUM(${DISTRIBUTION_BILL_UNIT_SQL}) FROM product_distribution pd JOIN products p ON pd.product_id = p.id WHERE pd.vendor_id = v.id AND pd.tenant_id = $1), 0) as total_distributed_value,
        COALESCE((SELECT SUM(amount) FROM vendor_payments WHERE vendor_id = v.id AND tenant_id = $1), 0) as total_paid,
        (SELECT COUNT(*) FROM product_distribution WHERE vendor_id = v.id AND tenant_id = $1) as units_distributed
      FROM vendors v WHERE v.id != 'OWNER' AND v.tenant_id = $1
      ${vendorScopeId(req) ? `AND v.id = $2` : ''}
      ORDER BY v.name
    `, vendorScopeId(req) ? [tenantId, vendorScopeId(req)] : [tenantId])).rows as { id: string; name: string; phone: string | null; total_distributed_value: number; total_paid: number; units_distributed: number }[];

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
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/api/vendor-finance/reminders-due', blockVendors, async (req: AuthRequest, res) => {
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
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/api/vendor-finance/:vendorId', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { vendorId } = req.params;
    const denied = assertVendorAccess(req, vendorId);
    if (denied) return res.status(403).json({ error: denied });
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
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/api/vendor-finance/:vendorId/payments', blockVendors, async (req: AuthRequest, res) => {
  const client = await pool.connect();
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { vendorId } = req.params;
    const { amount, paymentDate, paymentMethod, referenceNumber, notes, batchId } = req.body;
    const parsedAmount = Number(amount);
    if (!parsedAmount || isNaN(parsedAmount) || parsedAmount <= 0) return res.status(400).json({ error: 'Amount must be a valid number greater than 0' });
    if (parsedAmount > 100000000) return res.status(400).json({ error: 'Amount exceeds maximum limit' });

    const pDate = paymentDate || new Date().toISOString().slice(0, 10);
    const pMethod = paymentMethod || 'Cash';

    await client.query('BEGIN');
    const vendor = (await client.query(
      'SELECT id, name FROM vendors WHERE id = $1 AND tenant_id = $2 FOR UPDATE',
      [vendorId, tenantId]
    )).rows[0] as { id: string; name: string } | undefined;
    if (!vendor) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Vendor not found' });
    }
    const vendorName = vendor.name ?? vendorId;

    if (batchId) {
      const batchDue = (await client.query(
        `SELECT
           SUM(COALESCE(pd.billed_price, pd.net_price, 0)) as bill_value,
           COALESCE((SELECT SUM(vp.amount) FROM vendor_payments vp WHERE vp.batch_id = $1 AND vp.vendor_id = $2 AND vp.tenant_id = $3), 0) as paid
         FROM product_distribution pd
         WHERE pd.batch_id = $1 AND pd.vendor_id = $2 AND pd.tenant_id = $3`,
        [batchId, vendorId, tenantId]
      )).rows[0] as { bill_value: string | number | null; paid: string | number } | undefined;
      if (!batchDue || batchDue.bill_value == null || Number(batchDue.bill_value) <= 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Batch does not belong to this vendor' });
      }
      const remaining = Number(batchDue.bill_value) - Number(batchDue.paid);
      if (remaining <= 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Batch is already fully paid' });
      }
      if (parsedAmount > remaining + 0.01) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Amount exceeds remaining balance of ₹${remaining.toFixed(2)}` });
      }

      const id = uid('VP');
      await client.query(
        'INSERT INTO vendor_payments (id, vendor_id, amount, payment_date, payment_method, reference_number, notes, tenant_id, batch_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
        [id, vendorId, parsedAmount, pDate, pMethod, referenceNumber || null, notes || null, tenantId, batchId]
      );
      await client.query('COMMIT');
      logAudit(pool, tenantId, 'Payment Recorded', 'payment', id, `${vendorName} paid ₹${parsedAmount}, batch ${batchId}`);
    } else {
      // Re-read dues inside the locked transaction to avoid concurrent over-allocation
      const batches = (await client.query(`
        SELECT pd.batch_id,
          SUM(COALESCE(pd.billed_price, pd.net_price, 0)) as bill_value,
          COALESCE((SELECT SUM(vp.amount) FROM vendor_payments vp WHERE vp.batch_id = pd.batch_id AND vp.vendor_id = $1 AND vp.tenant_id = $2), 0) as paid
        FROM product_distribution pd
        WHERE pd.vendor_id = $1 AND pd.tenant_id = $2 AND pd.batch_id IS NOT NULL
        GROUP BY pd.batch_id
        HAVING SUM(COALESCE(pd.billed_price, pd.net_price, 0)) > COALESCE((SELECT SUM(vp.amount) FROM vendor_payments vp WHERE vp.batch_id = pd.batch_id AND vp.vendor_id = $1 AND vp.tenant_id = $2), 0)
        ORDER BY MIN(pd.distribution_date)
      `, [vendorId, tenantId])).rows as { batch_id: string; bill_value: number; paid: number }[];

      const totalDue = batches.reduce((sum, b) => sum + (Number(b.bill_value) - Number(b.paid)), 0);
      if (totalDue <= 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Vendor balance is already fully paid' });
      }
      if (parsedAmount > totalDue + 0.01) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Amount exceeds remaining balance of ₹${totalDue.toFixed(2)}` });
      }

      let remaining = parsedAmount;
      for (const b of batches) {
        if (remaining <= 0) break;
        const due = Number(b.bill_value) - Number(b.paid);
        const pay = Math.min(remaining, due);
        const id = uid('VP');
        await client.query(
          'INSERT INTO vendor_payments (id, vendor_id, amount, payment_date, payment_method, reference_number, notes, tenant_id, batch_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
          [id, vendorId, pay, pDate, pMethod, referenceNumber || null, notes ? `${notes} (batch ${b.batch_id})` : `All-batch payment`, tenantId, b.batch_id]
        );
        remaining -= pay;
      }
      await client.query('COMMIT');
      logAudit(pool, tenantId, 'Payment Recorded', 'payment', uid('VP'), `${vendorName} paid ₹${parsedAmount} across ${batches.length} batches`);
    }

    res.status(201).json({
      id: uid('VP'), amount: parsedAmount, paymentDate: pDate, paymentMethod: pMethod, referenceNumber: referenceNumber || null, notes: notes || null,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' });
  } finally { client.release(); }
});

router.put('/api/vendor-finance/:vendorId/reminder', blockVendors, async (req: AuthRequest, res) => {
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
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/api/vendor-finance/:vendorId/reminder-sent', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { vendorId } = req.params;
    const today = new Date().toISOString().slice(0, 10);
    await pool.query('UPDATE vendor_reminder_settings SET last_reminder_date = $1 WHERE vendor_id = $2 AND tenant_id = $3', [today, vendorId, tenantId]);
    res.json({ ok: true });
  } catch (err) {
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' });
  }
});

// Bank statement CSV — parse and match to vendors
router.post('/api/vendor-finance/bank-statement/preview', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { transactions } = req.body as { transactions: { date: string; description: string; amount: number; reference?: string }[] };
    if (!Array.isArray(transactions) || !transactions.length) return res.status(400).json({ error: 'No transactions to process' });

    // Fetch all vendors with phone/name
    const vendors = (await pool.query(
      "SELECT v.id, v.name, v.phone, v.email FROM vendors v WHERE v.tenant_id = $1 AND v.id != 'OWNER'",
      [tenantId]
    )).rows as { id: string; name: string; phone: string | null; email: string | null }[];

    // Fetch outstanding batches per vendor
    const batchRows = (await pool.query(`
      SELECT COALESCE(pd.batch_id, pd.id) as batch_id, pd.vendor_id,
        MIN(pd.distribution_date) as date,
        SUM(COALESCE(pd.billed_price, pd.net_price, p.price)) as bill_value
      FROM product_distribution pd
      JOIN products p ON pd.product_id = p.id AND p.tenant_id = $1
      WHERE pd.tenant_id = $1
      GROUP BY COALESCE(pd.batch_id, pd.id), pd.vendor_id
    `, [tenantId])).rows as { batch_id: string; vendor_id: string; date: string; bill_value: string }[];

    const paymentRows = (await pool.query(
      'SELECT batch_id, SUM(amount) as paid FROM vendor_payments WHERE tenant_id = $1 GROUP BY batch_id',
      [tenantId]
    )).rows as { batch_id: string; paid: string }[];
    const paidMap: Record<string, number> = {};
    for (const p of paymentRows) paidMap[p.batch_id] = Number(p.paid);

    // Build outstanding batches per vendor
    const vendorBatches: Record<string, { batchId: string; date: string; billValue: number; paid: number; balance: number }[]> = {};
    for (const b of batchRows) {
      const paid = paidMap[b.batch_id] || 0;
      const balance = Number(b.bill_value) - paid;
      if (balance <= 0) continue;
      if (!vendorBatches[b.vendor_id]) vendorBatches[b.vendor_id] = [];
      vendorBatches[b.vendor_id].push({ batchId: b.batch_id, date: b.date, billValue: Number(b.bill_value), paid, balance });
    }
    // Sort each vendor's batches by date (oldest first for auto-apply)
    for (const vid of Object.keys(vendorBatches)) vendorBatches[vid].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Match transactions to vendors
    const matched: { txIdx: number; date: string; description: string; amount: number; reference?: string; vendorId: string; vendorName: string; matchedBy: string; suggestedBatches: { batchId: string; date: string; balance: number; applyAmount: number }[] }[] = [];
    const unmatched: { txIdx: number; date: string; description: string; amount: number; reference?: string }[] = [];

    for (let i = 0; i < transactions.length; i++) {
      const tx = transactions[i];
      if (!tx.amount || tx.amount <= 0) continue;
      const desc = (tx.description || '').toLowerCase();

      // Extract all 10-digit numbers from description (covers raw phone, UPI phone@bank, NEFT refs)
      const allTenDigit = new Set((tx.description.match(/\d{10}/g) || []).map(n => n.slice(-10)));
      // Also extract phone from UPI handle before @ (e.g. 9764057232@axl)
      const upiId = (tx.description.split('/')[2] || '');
      const upiHandle = upiId.split('@')[0].replace(/\D/g, '');
      if (upiHandle.length === 10) allTenDigit.add(upiHandle);

      let matchedVendor: typeof vendors[0] | null = null;
      let matchedBy = '';

      for (const v of vendors) {
        const vPhone = v.phone ? v.phone.replace(/\D/g, '').slice(-10) : '';
        if (!vPhone) continue;
        if (allTenDigit.has(vPhone)) { matchedVendor = v; matchedBy = `phone: ${v.phone}`; break; }
      }

      if (matchedVendor) {
        // Auto-suggest batch allocation (oldest first)
        const batches = vendorBatches[matchedVendor.id] || [];
        let remaining = tx.amount;
        const suggestedBatches: { batchId: string; date: string; balance: number; applyAmount: number }[] = [];
        for (const b of batches) {
          if (remaining <= 0) break;
          const apply = Math.min(remaining, b.balance);
          suggestedBatches.push({ batchId: b.batchId, date: b.date, balance: b.balance, applyAmount: apply });
          remaining -= apply;
        }
        matched.push({ txIdx: i, date: tx.date, description: tx.description, amount: tx.amount, reference: tx.reference, vendorId: matchedVendor.id, vendorName: matchedVendor.name, matchedBy, suggestedBatches });
      } else {
        unmatched.push({ txIdx: i, date: tx.date, description: tx.description, amount: tx.amount, reference: tx.reference });
      }
    }

    res.json({ matched, unmatched, totalMatched: matched.length, totalUnmatched: unmatched.length, totalAmount: matched.reduce((s, m) => s + m.amount, 0) });
  } catch (err) { console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' }); }
});

// Apply bank statement payments (after preview)
router.post('/api/vendor-finance/bank-statement/apply', blockVendors, async (req: AuthRequest, res) => {
  const client = await pool.connect();
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { payments } = req.body as { payments: { vendorId: string; amount: number; date: string; reference?: string; batchId?: string; note?: string }[] };
    if (!Array.isArray(payments) || !payments.length) return res.status(400).json({ error: 'No payments to apply' });

    const importBatchId = uid('BSI');
    await client.query('BEGIN');
    let count = 0;
    const skipped: string[] = [];
    for (const p of payments) {
      const amount = Number(p.amount);
      if (!p.vendorId || !amount || amount <= 0 || amount > 100000000) {
        skipped.push(`${p.vendorId || '?'}: invalid amount`);
        continue;
      }
      const vendor = (await client.query(
        'SELECT id FROM vendors WHERE id = $1 AND tenant_id = $2 FOR UPDATE',
        [p.vendorId, tenantId]
      )).rows[0];
      if (!vendor) {
        skipped.push(`${p.vendorId}: vendor not found`);
        continue;
      }
      if (p.batchId) {
        const batchDue = (await client.query(
          `SELECT
             SUM(COALESCE(pd.billed_price, pd.net_price, 0)) as bill_value,
             COALESCE((SELECT SUM(vp.amount) FROM vendor_payments vp WHERE vp.batch_id = $1 AND vp.vendor_id = $2 AND vp.tenant_id = $3), 0) as paid
           FROM product_distribution pd
           WHERE pd.batch_id = $1 AND pd.vendor_id = $2 AND pd.tenant_id = $3`,
          [p.batchId, p.vendorId, tenantId]
        )).rows[0] as { bill_value: string | number | null; paid: string | number } | undefined;
        if (!batchDue || batchDue.bill_value == null || Number(batchDue.bill_value) <= 0) {
          skipped.push(`${p.vendorId}: batch ${p.batchId} invalid`);
          continue;
        }
        const remaining = Number(batchDue.bill_value) - Number(batchDue.paid);
        if (amount > remaining + 0.01) {
          skipped.push(`${p.vendorId}: amount exceeds batch balance`);
          continue;
        }
      } else {
        const due = (await client.query(
          `SELECT
             COALESCE((SELECT SUM(COALESCE(pd.billed_price, pd.net_price, 0)) FROM product_distribution pd WHERE pd.vendor_id = $1 AND pd.tenant_id = $2), 0) as bill_value,
             COALESCE((SELECT SUM(vp.amount) FROM vendor_payments vp WHERE vp.vendor_id = $1 AND vp.tenant_id = $2), 0) as paid`,
          [p.vendorId, tenantId]
        )).rows[0] as { bill_value: string | number; paid: string | number };
        const remaining = Number(due.bill_value) - Number(due.paid);
        if (amount > remaining + 0.01) {
          skipped.push(`${p.vendorId}: amount exceeds vendor balance`);
          continue;
        }
      }
      const id = uid('VP');
      await client.query(
        'INSERT INTO vendor_payments (id, tenant_id, vendor_id, amount, payment_date, payment_method, reference_number, notes, batch_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [id, tenantId, p.vendorId, amount, p.date || new Date().toISOString().slice(0, 10), 'Bank Statement',
         p.reference || null, `[${importBatchId}] ${p.note || 'Bank statement import'}`, p.batchId || null]
      );
      count++;
    }
    await client.query('COMMIT');
    await logAudit(pool, tenantId, 'Bank Statement Import', 'payment', importBatchId, `${count} payments applied from bank statement`);
    res.json({ applied: count, importBatchId, skipped });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (e as Error).message);
    res.status(500).json({ error: 'Failed to apply payments' });
  } finally { client.release(); }
});

export default router;
