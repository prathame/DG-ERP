import { Router } from 'express';
import { pool } from '../pg-db';
import { uid, DISTRIBUTION_BILL_UNIT_SQL, logAudit } from '../utils/helpers';

const router = Router();

router.get('/api/accounts/ledger', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { from, to, type } = req.query;
    const dateFrom = typeof from === 'string' ? from : '2000-01-01';
    const dateTo = typeof to === 'string' ? to : '2099-12-31';

    const entries: { date: string; type: string; particulars: string; refId: string; debit: number; credit: number }[] = [];

    if (!type || type === 'all' || type === 'sales') {
      // Distribution revenue (debit — receivable created)
      const distRows = (await pool.query(`
        SELECT COALESCE(pd.batch_id, pd.id) as ref_id, MIN(pd.distribution_date) as dt, v.name as vendor_name,
          SUM(${DISTRIBUTION_BILL_UNIT_SQL}) as amount, COUNT(*) as qty
        FROM product_distribution pd
        JOIN products p ON pd.product_id = p.id AND p.tenant_id = $1
        JOIN vendors v ON pd.vendor_id = v.id AND v.tenant_id = $1
        WHERE pd.tenant_id = $1 AND pd.distribution_date >= $2 AND pd.distribution_date <= $3
        GROUP BY COALESCE(pd.batch_id, pd.id), v.name
        ORDER BY MIN(pd.distribution_date)
      `, [tenantId, dateFrom, dateTo])).rows as Record<string, unknown>[];
      for (const r of distRows) {
        entries.push({ date: r.dt as string, type: 'Distribution', particulars: `Distribution to ${r.vendor_name} (${r.qty} items)`, refId: r.ref_id as string, debit: Number(r.amount) || 0, credit: 0 });
      }

      // Sales revenue
      const salesRows = (await pool.query(`
        SELECT ps.id as ref_id, ps.purchase_date as dt, ps.customer_name, COALESCE(ps.sale_price, p.price) as amount, p.name as product_name
        FROM product_sales ps JOIN products p ON ps.product_id = p.id AND p.tenant_id = $1
        WHERE ps.tenant_id = $1 AND ps.purchase_date >= $2 AND ps.purchase_date <= $3
        ORDER BY ps.purchase_date
      `, [tenantId, dateFrom, dateTo])).rows as Record<string, unknown>[];
      for (const r of salesRows) {
        entries.push({ date: r.dt as string, type: 'Sale', particulars: `Sale to ${r.customer_name} — ${r.product_name}`, refId: r.ref_id as string, debit: Number(r.amount) || 0, credit: 0 });
      }
    }

    if (!type || type === 'all' || type === 'purchases') {
      // Purchase expenses (credit — payable created)
      const purchRows = (await pool.query(`
        SELECT pp.batch_id as ref_id, MIN(pp.purchase_date) as dt, s.name as supplier_name,
          SUM(COALESCE(pp.billed_price, pp.cost_price)) as amount, COUNT(*) as qty
        FROM product_purchases pp
        JOIN suppliers s ON pp.supplier_id = s.id AND s.tenant_id = $1
        WHERE pp.tenant_id = $1 AND pp.purchase_date >= $2 AND pp.purchase_date <= $3
        GROUP BY pp.batch_id, s.name ORDER BY MIN(pp.purchase_date)
      `, [tenantId, dateFrom, dateTo])).rows as Record<string, unknown>[];
      for (const r of purchRows) {
        entries.push({ date: r.dt as string, type: 'Purchase', particulars: `Purchase from ${r.supplier_name} (${r.qty} items)`, refId: r.ref_id as string, debit: 0, credit: Number(r.amount) || 0 });
      }
    }

    if (!type || type === 'all' || type === 'payments') {
      // Vendor payments received (credit — cash in)
      const vpRows = (await pool.query(`
        SELECT vp.id as ref_id, vp.payment_date as dt, v.name as vendor_name, vp.amount, vp.payment_method
        FROM vendor_payments vp JOIN vendors v ON vp.vendor_id = v.id AND v.tenant_id = $1
        WHERE vp.tenant_id = $1 AND vp.payment_date >= $2 AND vp.payment_date <= $3
        ORDER BY vp.payment_date
      `, [tenantId, dateFrom, dateTo])).rows as Record<string, unknown>[];
      for (const r of vpRows) {
        entries.push({ date: r.dt as string, type: 'Payment Received', particulars: `Payment from ${r.vendor_name} (${r.payment_method})`, refId: r.ref_id as string, debit: 0, credit: Number(r.amount) || 0 });
      }

      // Supplier payments made (debit — cash out)
      const spRows = (await pool.query(`
        SELECT sp.id as ref_id, sp.payment_date as dt, s.name as supplier_name, sp.amount, sp.payment_method
        FROM supplier_payments sp JOIN suppliers s ON sp.supplier_id = s.id AND s.tenant_id = $1
        WHERE sp.tenant_id = $1 AND sp.payment_date >= $2 AND sp.payment_date <= $3
        ORDER BY sp.payment_date
      `, [tenantId, dateFrom, dateTo])).rows as Record<string, unknown>[];
      for (const r of spRows) {
        entries.push({ date: r.dt as string, type: 'Payment Made', particulars: `Payment to ${r.supplier_name} (${r.payment_method})`, refId: r.ref_id as string, debit: Number(r.amount) || 0, credit: 0 });
      }
    }

    entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let balance = 0;
    const withBalance = entries.map(e => {
      balance += e.debit - e.credit;
      return { ...e, balance };
    });

    const totals = { debit: entries.reduce((s, e) => s + e.debit, 0), credit: entries.reduce((s, e) => s + e.credit, 0) };
    res.json({ entries: withBalance, totals, count: entries.length });
  } catch (err) { console.error('[API Error]', req.path, err); res.status(500).json({ error: 'Internal server error' }); }
});

router.get('/api/accounts/profit-loss', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const from = (req.query.from as string) || `${new Date().getFullYear()}-04-01`;
    const to = (req.query.to as string) || new Date().toISOString().slice(0, 10);

    // Revenue
    const distRevenue = Number((await pool.query(`
      SELECT COALESCE(SUM(${DISTRIBUTION_BILL_UNIT_SQL}), 0) as t
      FROM product_distribution pd JOIN products p ON pd.product_id = p.id AND p.tenant_id = $1
      WHERE pd.tenant_id = $1 AND pd.distribution_date >= $2 AND pd.distribution_date <= $3
    `, [tenantId, from, to])).rows[0].t) || 0;

    const salesRevenue = Number((await pool.query(
      'SELECT COALESCE(SUM(COALESCE(sale_price, 0)), 0) as t FROM product_sales WHERE tenant_id = $1 AND purchase_date >= $2 AND purchase_date <= $3',
      [tenantId, from, to]
    )).rows[0].t) || 0;

    // Expenses
    const purchaseCost = Number((await pool.query(
      'SELECT COALESCE(SUM(COALESCE(billed_price, cost_price, 0)), 0) as t FROM product_purchases WHERE tenant_id = $1 AND purchase_date >= $2 AND purchase_date <= $3',
      [tenantId, from, to]
    )).rows[0].t) || 0;

    const totalRevenue = distRevenue + salesRevenue;
    const totalExpenses = purchaseCost;
    const grossProfit = totalRevenue - totalExpenses;

    res.json({
      period: { from, to },
      revenue: { distributionRevenue: distRevenue, salesRevenue, total: totalRevenue },
      expenses: { purchaseCost, total: totalExpenses },
      grossProfit,
      profitMargin: totalRevenue > 0 ? Math.round((grossProfit / totalRevenue) * 100) : 0,
    });
  } catch (err) { console.error('[API Error]', req.path, err); res.status(500).json({ error: 'Internal server error' }); }
});

router.get('/api/accounts/balance-sheet', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    // Assets
    const inventoryValue = Number((await pool.query(`
      SELECT COALESCE(SUM(p.price), 0) as t FROM product_inventory pi
      JOIN products p ON pi.product_id = p.id AND p.tenant_id = $1
      WHERE pi.tenant_id = $1 AND pi.status IN ('InStock', 'Distributed')
    `, [tenantId])).rows[0].t) || 0;

    const totalDistributed = Number((await pool.query(`
      SELECT COALESCE(SUM(${DISTRIBUTION_BILL_UNIT_SQL}), 0) as t
      FROM product_distribution pd JOIN products p ON pd.product_id = p.id AND p.tenant_id = $1
      WHERE pd.tenant_id = $1
    `, [tenantId])).rows[0].t) || 0;

    const totalVendorPayments = Number((await pool.query(
      'SELECT COALESCE(SUM(amount), 0) as t FROM vendor_payments WHERE tenant_id = $1', [tenantId]
    )).rows[0].t) || 0;

    const receivables = totalDistributed - totalVendorPayments;

    const totalSupplierPayments = Number((await pool.query(
      'SELECT COALESCE(SUM(amount), 0) as t FROM supplier_payments WHERE tenant_id = $1', [tenantId]
    )).rows[0].t) || 0;

    const cashBank = totalVendorPayments - totalSupplierPayments;

    // Liabilities
    const totalPurchased = Number((await pool.query(
      'SELECT COALESCE(SUM(COALESCE(billed_price, cost_price, 0)), 0) as t FROM product_purchases WHERE tenant_id = $1', [tenantId]
    )).rows[0].t) || 0;

    const payables = totalPurchased - totalSupplierPayments;

    const totalAssets = inventoryValue + Math.max(0, receivables) + Math.max(0, cashBank);
    const totalLiabilities = Math.max(0, payables);
    const netWorth = totalAssets - totalLiabilities;

    res.json({
      assets: {
        inventory: inventoryValue,
        receivables: Math.max(0, receivables),
        cashBank: Math.max(0, cashBank),
        total: totalAssets,
      },
      liabilities: {
        payables: Math.max(0, payables),
        total: totalLiabilities,
      },
      netWorth,
    });
  } catch (err) { console.error('[API Error]', req.path, err); res.status(500).json({ error: 'Internal server error' }); }
});

router.get('/api/accounts/cash-flow', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const from = (req.query.from as string) || `${new Date().getFullYear()}-04-01`;
    const to = (req.query.to as string) || new Date().toISOString().slice(0, 10);

    const vendorPayments = Number((await pool.query(
      'SELECT COALESCE(SUM(amount), 0) as t FROM vendor_payments WHERE tenant_id = $1 AND payment_date >= $2 AND payment_date <= $3',
      [tenantId, from, to]
    )).rows[0].t) || 0;

    const supplierPayments = Number((await pool.query(
      'SELECT COALESCE(SUM(amount), 0) as t FROM supplier_payments WHERE tenant_id = $1 AND payment_date >= $2 AND payment_date <= $3',
      [tenantId, from, to]
    )).rows[0].t) || 0;

    // Monthly breakdown
    const monthlyIn = (await pool.query(`
      SELECT to_char(payment_date, 'YYYY-MM') as month, SUM(amount) as total
      FROM vendor_payments WHERE tenant_id = $1 AND payment_date >= $2 AND payment_date <= $3
      GROUP BY to_char(payment_date, 'YYYY-MM') ORDER BY month
    `, [tenantId, from, to])).rows as { month: string; total: string }[];

    const monthlyOut = (await pool.query(`
      SELECT to_char(payment_date, 'YYYY-MM') as month, SUM(amount) as total
      FROM supplier_payments WHERE tenant_id = $1 AND payment_date >= $2 AND payment_date <= $3
      GROUP BY to_char(payment_date, 'YYYY-MM') ORDER BY month
    `, [tenantId, from, to])).rows as { month: string; total: string }[];

    const months = new Set([...monthlyIn.map(r => r.month), ...monthlyOut.map(r => r.month)]);
    const inMap: Record<string, number> = {}; for (const r of monthlyIn) inMap[r.month] = Number(r.total) || 0;
    const outMap: Record<string, number> = {}; for (const r of monthlyOut) outMap[r.month] = Number(r.total) || 0;
    const monthly = [...months].sort().map(m => ({ month: m, inflow: inMap[m] || 0, outflow: outMap[m] || 0, net: (inMap[m] || 0) - (outMap[m] || 0) }));

    res.json({
      period: { from, to },
      inflows: { vendorPayments, total: vendorPayments },
      outflows: { supplierPayments, total: supplierPayments },
      netCashFlow: vendorPayments - supplierPayments,
      monthly,
    });
  } catch (err) { console.error('[API Error]', req.path, err); res.status(500).json({ error: 'Internal server error' }); }
});

// Credit/Debit Notes
router.get('/api/accounts/notes', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { type } = req.query;
    let sql = 'SELECT * FROM credit_debit_notes WHERE tenant_id = $1';
    const params: unknown[] = [tenantId];
    if (type === 'credit' || type === 'debit') { sql += ' AND note_type = $2'; params.push(type); }
    sql += ' ORDER BY created_at DESC';
    const { rows } = await pool.query(sql, params);
    res.json(rows.map((r: Record<string, unknown>) => ({
      id: r.id, noteNumber: r.note_number, noteType: r.note_type,
      vendorId: r.vendor_id, vendorName: r.vendor_name, customerName: r.customer_name,
      noteDate: r.note_date, reason: r.reason,
      items: typeof r.items === 'string' ? JSON.parse(r.items) : r.items,
      subtotal: Number(r.subtotal) || 0, gstRate: Number(r.gst_rate) || 18,
      gstAmount: Number(r.gst_amount) || 0, total: Number(r.total) || 0,
      referenceInvoice: r.reference_invoice, status: r.status,
    })));
  } catch (err) { console.error('[API Error]', req.path, err); res.status(500).json({ error: 'Internal server error' }); }
});

router.post('/api/accounts/notes', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { noteType, vendorId, vendorName, customerName, noteDate, reason, items, gstRate, referenceInvoice } = req.body;
    if (!noteType || !['credit', 'debit'].includes(noteType)) return res.status(400).json({ error: 'noteType must be credit or debit' });
    if (!items || !Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'At least one item required' });

    const id = uid(noteType === 'credit' ? 'CN' : 'DN');
    const prefix = noteType === 'credit' ? 'CN' : 'DN';
    const count = (await pool.query('SELECT COUNT(*) as c FROM credit_debit_notes WHERE tenant_id = $1 AND note_type = $2', [tenantId, noteType])).rows[0] as { c: number };
    const noteNum = `${prefix}-${String(Number(count.c) + 1).padStart(4, '0')}`;
    const rate = Number(gstRate) || 18;

    let subtotal = 0; let gstAmount = 0;
    const resolvedItems: { description: string; quantity: number; price: number; withGst: boolean; lineNet: number; lineGst: number; lineTotal: number }[] = [];
    for (const item of items) {
      const qty = Number(item.quantity) || 1;
      const price = Number(item.price) || 0;
      const net = qty * price;
      const gst = item.withGst !== false ? Math.round(net * rate / 100) : 0;
      resolvedItems.push({ description: item.description || '', quantity: qty, price, withGst: item.withGst !== false, lineNet: net, lineGst: gst, lineTotal: net + gst });
      subtotal += net; gstAmount += gst;
    }
    const total = subtotal + gstAmount;

    let vName = vendorName || '';
    if (vendorId && !vName) {
      const v = (await pool.query('SELECT name FROM vendors WHERE id = $1 AND tenant_id = $2', [vendorId, tenantId])).rows[0] as { name: string } | undefined;
      vName = v?.name ?? '';
    }

    await pool.query(
      `INSERT INTO credit_debit_notes (id, tenant_id, note_number, note_type, vendor_id, vendor_name, customer_name, note_date, reason, items, subtotal, gst_rate, gst_amount, total, reference_invoice)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [id, tenantId, noteNum, noteType, vendorId || null, vName, customerName || vName, noteDate || new Date().toISOString().slice(0, 10), reason || null, JSON.stringify(resolvedItems), subtotal, rate, gstAmount, total, referenceInvoice || null]
    );

    await logAudit(pool, tenantId, `${noteType === 'credit' ? 'Credit' : 'Debit'} Note Created`, 'note', id, `${noteNum} — ₹${total} for ${vName || customerName || 'N/A'}`);
    res.status(201).json({ id, noteNumber: noteNum, noteType, vendorName: vName, customerName: customerName || vName, total, status: 'Active' });
  } catch (err) { console.error('[API Error]', req.path, err); res.status(500).json({ error: 'Internal server error' }); }
});

router.delete('/api/accounts/notes/:id', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const result = await pool.query('DELETE FROM credit_debit_notes WHERE id = $1 AND tenant_id = $2', [req.params.id, tenantId]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Note not found' });
    res.status(204).send();
  } catch (err) { console.error('[API Error]', req.path, err); res.status(500).json({ error: 'Internal server error' }); }
});

// Day Book — all transactions for a specific date
router.get('/api/accounts/day-book', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);

    const [sales, distributions, purchases, vendorPayments, supplierPayments] = await Promise.all([
      pool.query(`SELECT ps.id, ps.purchase_date as date, ps.customer_name, COALESCE(ps.sale_price, p.price) as amount, p.name as product_name, 'Sale' as type
        FROM product_sales ps JOIN products p ON ps.product_id = p.id AND p.tenant_id = $1
        WHERE ps.tenant_id = $1 AND ps.purchase_date = $2`, [tenantId, date]),
      pool.query(`SELECT pd.batch_id as id, pd.distribution_date as date, v.name as party_name,
        ${DISTRIBUTION_BILL_UNIT_SQL} as amount, p.name as product_name, 'Distribution' as type
        FROM product_distribution pd
        JOIN products p ON pd.product_id = p.id AND p.tenant_id = $1
        JOIN vendors v ON pd.vendor_id = v.id AND v.tenant_id = $1
        WHERE pd.tenant_id = $1 AND pd.distribution_date = $2`, [tenantId, date]),
      pool.query(`SELECT pp.batch_id as id, pp.purchase_date as date, s.name as party_name,
        COALESCE(pp.billed_price, pp.cost_price) as amount, p.name as product_name, 'Purchase' as type
        FROM product_purchases pp
        JOIN products p ON pp.product_id = p.id AND p.tenant_id = $1
        JOIN suppliers s ON pp.supplier_id = s.id AND s.tenant_id = $1
        WHERE pp.tenant_id = $1 AND pp.purchase_date = $2`, [tenantId, date]),
      pool.query(`SELECT vp.id, vp.payment_date as date, v.name as party_name, vp.amount, vp.payment_method, 'Payment Received' as type
        FROM vendor_payments vp JOIN vendors v ON vp.vendor_id = v.id AND v.tenant_id = $1
        WHERE vp.tenant_id = $1 AND vp.payment_date = $2`, [tenantId, date]),
      pool.query(`SELECT sp.id, sp.payment_date as date, s.name as party_name, sp.amount, sp.payment_method, 'Payment Made' as type
        FROM supplier_payments sp JOIN suppliers s ON sp.supplier_id = s.id AND s.tenant_id = $1
        WHERE sp.tenant_id = $1 AND sp.payment_date = $2`, [tenantId, date]),
    ]);

    const entries: { id: string; date: string; type: string; party: string; product?: string; debit: number; credit: number; method?: string }[] = [];

    for (const r of sales.rows as Record<string, unknown>[]) {
      entries.push({ id: r.id as string, date: r.date as string, type: 'Sale', party: (r.customer_name as string) || 'Walk-in', product: r.product_name as string, debit: Number(r.amount) || 0, credit: 0 });
    }
    for (const r of distributions.rows as Record<string, unknown>[]) {
      entries.push({ id: r.id as string, date: r.date as string, type: 'Distribution', party: r.party_name as string, product: r.product_name as string, debit: Number(r.amount) || 0, credit: 0 });
    }
    for (const r of purchases.rows as Record<string, unknown>[]) {
      entries.push({ id: r.id as string, date: r.date as string, type: 'Purchase', party: r.party_name as string, product: r.product_name as string, debit: 0, credit: Number(r.amount) || 0 });
    }
    for (const r of vendorPayments.rows as Record<string, unknown>[]) {
      entries.push({ id: r.id as string, date: r.date as string, type: 'Payment Received', party: r.party_name as string, debit: Number(r.amount) || 0, credit: 0, method: r.payment_method as string });
    }
    for (const r of supplierPayments.rows as Record<string, unknown>[]) {
      entries.push({ id: r.id as string, date: r.date as string, type: 'Payment Made', party: r.party_name as string, debit: 0, credit: Number(r.amount) || 0, method: r.payment_method as string });
    }

    const totalDebit = entries.reduce((s, e) => s + e.debit, 0);
    const totalCredit = entries.reduce((s, e) => s + e.credit, 0);

    res.json({ date, entries, totalDebit, totalCredit, netFlow: totalDebit - totalCredit });
  } catch (err) { console.error('[API Error]', req.path, err); res.status(500).json({ error: 'Internal server error' }); }
});

export default router;
