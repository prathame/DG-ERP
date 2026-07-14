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
      // Standalone invoice revenue
      const invLedgerRows = (await pool.query(`
        SELECT id as ref_id, invoice_date as dt, customer_name, grand_total as amount, invoice_number
        FROM standalone_invoices WHERE tenant_id = $1 AND invoice_date >= $2 AND invoice_date <= $3 AND status != 'cancelled'
        ORDER BY invoice_date
      `, [tenantId, dateFrom, dateTo])).rows as Record<string, unknown>[];
      for (const r of invLedgerRows) {
        entries.push({ date: r.dt as string, type: 'Invoice', particulars: `Invoice ${r.invoice_number} — ${r.customer_name}`, refId: r.ref_id as string, debit: Number(r.amount) || 0, credit: 0 });
      }

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
  } catch (err) { console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' }); }
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
    `, [tenantId, from, to])).rows[0]?.t ?? 0) || 0;

    const salesRevenue = Number((await pool.query(
      'SELECT COALESCE(SUM(COALESCE(sale_price, 0)), 0) as t FROM product_sales WHERE tenant_id = $1 AND purchase_date >= $2 AND purchase_date <= $3',
      [tenantId, from, to]
    )).rows[0]?.t ?? 0) || 0;

    const invoiceRevenue = Number((await pool.query(
      "SELECT COALESCE(SUM(grand_total), 0) as t FROM standalone_invoices WHERE tenant_id = $1 AND invoice_date >= $2 AND invoice_date <= $3 AND status != 'cancelled'",
      [tenantId, from, to]
    )).rows[0]?.t ?? 0) || 0;

    // Expenses
    const [purchaseRes, staffRes, expenseRes] = await Promise.all([
      pool.query('SELECT COALESCE(SUM(COALESCE(billed_price, cost_price, 0)), 0) as t FROM product_purchases WHERE tenant_id = $1 AND purchase_date >= $2 AND purchase_date <= $3', [tenantId, from, to]),
      pool.query("SELECT COALESCE(SUM(amount), 0) as t FROM staff_payments WHERE tenant_id = $1 AND payment_date >= $2 AND payment_date <= $3 AND payment_type IN ('salary','bonus')", [tenantId, from, to]),
      pool.query('SELECT COALESCE(SUM(amount), 0) as t FROM expenses WHERE tenant_id = $1 AND expense_date >= $2 AND expense_date <= $3', [tenantId, from, to]),
    ]);
    const purchaseCost = Number(purchaseRes.rows[0]?.t ?? 0) || 0;
    const staffCost = Number(staffRes.rows[0]?.t ?? 0) || 0;
    const expenseCost = Number(expenseRes.rows[0]?.t ?? 0) || 0;

    const totalRevenue = distRevenue + salesRevenue + invoiceRevenue;
    const totalExpenses = purchaseCost + staffCost + expenseCost;
    const grossProfit = totalRevenue - totalExpenses;

    res.json({
      period: { from, to },
      revenue: { distributionRevenue: distRevenue, salesRevenue, invoiceRevenue, total: totalRevenue },
      expenses: { purchaseCost, staffPayments: staffCost, otherExpenses: expenseCost, total: totalExpenses },
      grossProfit,
      profitMargin: totalRevenue > 0 ? Math.round((grossProfit / totalRevenue) * 100) : 0,
    });
  } catch (err) { console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' }); }
});

router.get('/api/accounts/balance-sheet', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    // 10 queries → 4 by merging into single SQL with multiple aggregates
    const [assetRes, liabilityRes, staffRes, invoiceRes] = await Promise.all([
      pool.query(`SELECT
        COALESCE((SELECT SUM(p.price) FROM product_inventory pi JOIN products p ON pi.product_id=p.id AND p.tenant_id=$1 WHERE pi.tenant_id=$1 AND pi.status='InStock'),0) as inventory,
        COALESCE((SELECT SUM(${DISTRIBUTION_BILL_UNIT_SQL}) FROM product_distribution pd JOIN products p ON pd.product_id=p.id AND p.tenant_id=$1 WHERE pd.tenant_id=$1),0) as distributed,
        COALESCE((SELECT SUM(amount) FROM vendor_payments WHERE tenant_id=$1),0) as vendor_paid,
        COALESCE((SELECT SUM(amount) FROM expenses WHERE tenant_id=$1),0) as expenses`, [tenantId]),
      pool.query(`SELECT
        COALESCE((SELECT SUM(COALESCE(billed_price,cost_price,0)) FROM product_purchases WHERE tenant_id=$1),0) as purchased,
        COALESCE((SELECT SUM(amount) FROM supplier_payments WHERE tenant_id=$1),0) as supplier_paid`, [tenantId]),
      pool.query(`SELECT
        COALESCE(SUM(CASE WHEN payment_type='advance' THEN amount ELSE 0 END),0)-COALESCE(SUM(CASE WHEN payment_type='advance_repay' THEN amount ELSE 0 END),0) as advance_balance,
        COALESCE(SUM(CASE WHEN payment_type IN ('salary','bonus','advance') THEN amount ELSE 0 END),0) as all_paid
        FROM staff_payments WHERE tenant_id=$1`, [tenantId]),
      pool.query(`SELECT
        COALESCE(SUM(CASE WHEN status NOT IN ('paid','cancelled') THEN grand_total ELSE 0 END),0) as unpaid,
        COALESCE(SUM(CASE WHEN status='paid' THEN grand_total ELSE 0 END),0) as paid
        FROM standalone_invoices WHERE tenant_id=$1`, [tenantId]),
    ]);

    const a = assetRes.rows[0] as Record<string,string>;
    const l = liabilityRes.rows[0] as Record<string,string>;
    const st = staffRes.rows[0] as Record<string,string>;
    const inv = invoiceRes.rows[0] as Record<string,string>;

    // Map to original variable names
    const invValRes = { rows: [{ t: a.inventory }] };
    const distRes = { rows: [{ t: a.distributed }] };
    const vpRes = { rows: [{ t: a.vendor_paid }] };
    const spRes = { rows: [{ t: l.supplier_paid }] };
    const purchRes = { rows: [{ t: l.purchased }] };
    const advRes = { rows: [{ t: st.advance_balance }] };
    const staffAllRes = { rows: [{ t: st.all_paid }] };
    const expRes = { rows: [{ t: a.expenses }] };
    const invUnpaidRes = { rows: [{ t: inv.unpaid }] };
    const invPaidRes = { rows: [{ t: inv.paid }] };
    const inventoryValue = Number(invValRes.rows[0]?.t ?? 0) || 0;
    const totalDistributed = Number(distRes.rows[0]?.t ?? 0) || 0;
    const totalVendorPayments = Number(vpRes.rows[0]?.t ?? 0) || 0;
    const distributionReceivables = totalDistributed - totalVendorPayments;
    const invoiceReceivables = Number(invUnpaidRes.rows[0]?.t ?? 0) || 0;
    const invoiceCashReceived = Number(invPaidRes.rows[0]?.t ?? 0) || 0;
    const totalSupplierPayments = Number(spRes.rows[0]?.t ?? 0) || 0;
    const staffAdvanceBalance = Math.max(0, Number(advRes.rows[0]?.t ?? 0) || 0);
    const staffAllPaid = Number(staffAllRes.rows[0]?.t ?? 0) || 0;
    const totalExpenses = Number(expRes.rows[0]?.t ?? 0) || 0;
    const totalPurchased = Number(purchRes.rows[0]?.t ?? 0) || 0;
    const cashBank = totalVendorPayments + invoiceCashReceived - totalSupplierPayments - staffAllPaid - totalExpenses;
    const receivables = Math.max(0, distributionReceivables) + invoiceReceivables;
    const payables = totalPurchased - totalSupplierPayments;

    const totalAssets = inventoryValue + receivables + Math.max(0, cashBank) + staffAdvanceBalance;
    const totalLiabilities = Math.max(0, payables);
    const netWorth = totalAssets - totalLiabilities;

    res.json({
      assets: {
        inventory: inventoryValue,
        receivables,
        distributionReceivables: Math.max(0, distributionReceivables),
        invoiceReceivables,
        staffAdvances: staffAdvanceBalance,
        cashBank: Math.max(0, cashBank),
        total: totalAssets,
      },
      liabilities: {
        payables: Math.max(0, payables),
        total: totalLiabilities,
      },
      netWorth,
    });
  } catch (err) { console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' }); }
});

router.get('/api/accounts/cash-flow', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const from = (req.query.from as string) || `${new Date().getFullYear()}-04-01`;
    const to = (req.query.to as string) || new Date().toISOString().slice(0, 10);

    const [vpRes, spRes, staffRes, expCfRes, monthlyInRes, monthlyInvRes, monthlyOutRes, monthlyStaffRes, monthlyExpRes, invPaidCfRes] = await Promise.all([
      pool.query('SELECT COALESCE(SUM(amount), 0) as t FROM vendor_payments WHERE tenant_id = $1 AND payment_date >= $2 AND payment_date <= $3', [tenantId, from, to]),
      pool.query('SELECT COALESCE(SUM(amount), 0) as t FROM supplier_payments WHERE tenant_id = $1 AND payment_date >= $2 AND payment_date <= $3', [tenantId, from, to]),
      pool.query("SELECT COALESCE(SUM(amount), 0) as t FROM staff_payments WHERE tenant_id = $1 AND payment_date >= $2 AND payment_date <= $3 AND payment_type IN ('salary','bonus','advance')", [tenantId, from, to]),
      pool.query('SELECT COALESCE(SUM(amount), 0) as t FROM expenses WHERE tenant_id = $1 AND expense_date >= $2 AND expense_date <= $3', [tenantId, from, to]),
      pool.query("SELECT to_char(payment_date, 'YYYY-MM') as month, SUM(amount) as total FROM vendor_payments WHERE tenant_id = $1 AND payment_date >= $2 AND payment_date <= $3 GROUP BY to_char(payment_date, 'YYYY-MM') ORDER BY month", [tenantId, from, to]),
      pool.query("SELECT to_char(invoice_date, 'YYYY-MM') as month, SUM(grand_total) as total FROM standalone_invoices WHERE tenant_id = $1 AND status = 'paid' AND invoice_date >= $2 AND invoice_date <= $3 GROUP BY to_char(invoice_date, 'YYYY-MM') ORDER BY month", [tenantId, from, to]),
      pool.query("SELECT to_char(payment_date, 'YYYY-MM') as month, SUM(amount) as total FROM supplier_payments WHERE tenant_id = $1 AND payment_date >= $2 AND payment_date <= $3 GROUP BY to_char(payment_date, 'YYYY-MM') ORDER BY month", [tenantId, from, to]),
      pool.query("SELECT to_char(payment_date, 'YYYY-MM') as month, SUM(amount) as total FROM staff_payments WHERE tenant_id = $1 AND payment_date >= $2 AND payment_date <= $3 AND payment_type IN ('salary','bonus','advance') GROUP BY to_char(payment_date, 'YYYY-MM') ORDER BY month", [tenantId, from, to]),
      pool.query("SELECT to_char(expense_date, 'YYYY-MM') as month, SUM(amount) as total FROM expenses WHERE tenant_id = $1 AND expense_date >= $2 AND expense_date <= $3 GROUP BY to_char(expense_date, 'YYYY-MM') ORDER BY month", [tenantId, from, to]),
      pool.query("SELECT COALESCE(SUM(grand_total), 0) as t FROM standalone_invoices WHERE tenant_id = $1 AND status = 'paid' AND invoice_date >= $2 AND invoice_date <= $3", [tenantId, from, to]),
    ]);
    const vendorPayments = Number(vpRes.rows[0]?.t ?? 0) || 0;
    const invoicePaid = Number(invPaidCfRes.rows[0]?.t ?? 0) || 0;
    const supplierPayments = Number(spRes.rows[0]?.t ?? 0) || 0;
    const staffPayments = Number(staffRes.rows[0]?.t ?? 0) || 0;
    const expenseTotal = Number(expCfRes.rows[0]?.t ?? 0) || 0;
    const monthlyIn = monthlyInRes.rows as { month: string; total: string }[];
    const monthlyInv = monthlyInvRes.rows as { month: string; total: string }[];
    const monthlyOut = monthlyOutRes.rows as { month: string; total: string }[];
    const monthlyStaff = monthlyStaffRes.rows as { month: string; total: string }[];
    const monthlyExp = monthlyExpRes.rows as { month: string; total: string }[];

    const months = new Set([...monthlyIn.map(r => r.month), ...monthlyInv.map(r => r.month), ...monthlyOut.map(r => r.month), ...monthlyStaff.map(r => r.month), ...monthlyExp.map(r => r.month)]);
    const inMap: Record<string, number> = {}; for (const r of monthlyIn) inMap[r.month] = Number(r.total) || 0;
    const invMap: Record<string, number> = {}; for (const r of monthlyInv) invMap[r.month] = Number(r.total) || 0;
    const outMap: Record<string, number> = {}; for (const r of monthlyOut) outMap[r.month] = Number(r.total) || 0;
    const staffMap: Record<string, number> = {}; for (const r of monthlyStaff) staffMap[r.month] = Number(r.total) || 0;
    const expMap: Record<string, number> = {}; for (const r of monthlyExp) expMap[r.month] = Number(r.total) || 0;
    const totalInflow = vendorPayments + invoicePaid;
    const totalOutflow = supplierPayments + staffPayments + expenseTotal;
    const monthly = [...months].sort().map(m => ({
      month: m,
      inflow: (inMap[m] || 0) + (invMap[m] || 0),
      vendorPayments: inMap[m] || 0,
      invoicePayments: invMap[m] || 0,
      outflow: (outMap[m] || 0) + (staffMap[m] || 0) + (expMap[m] || 0),
      supplierPayments: outMap[m] || 0,
      staffPayments: staffMap[m] || 0,
      expenses: expMap[m] || 0,
      net: (inMap[m] || 0) + (invMap[m] || 0) - (outMap[m] || 0) - (staffMap[m] || 0) - (expMap[m] || 0),
    }));

    res.json({
      period: { from, to },
      inflows: { vendorPayments, invoicePayments: invoicePaid, total: totalInflow },
      outflows: { supplierPayments, staffPayments, expenses: expenseTotal, total: totalOutflow },
      netCashFlow: totalInflow - totalOutflow,
      monthly,
    });
  } catch (err) { console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' }); }
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
  } catch (err) { console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' }); }
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
  } catch (err) { console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' }); }
});

router.delete('/api/accounts/notes/:id', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const result = await pool.query('DELETE FROM credit_debit_notes WHERE id = $1 AND tenant_id = $2', [req.params.id, tenantId]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Note not found' });
    res.status(204).send();
  } catch (err) { console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' }); }
});

// Day Book — all transactions for a specific date
router.get('/api/accounts/day-book', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);

    const [sales, invoices, distributions, purchases, vendorPayments, supplierPayments, staffPays, expenseRows] = await Promise.all([
      pool.query(`SELECT ps.id, ps.purchase_date as date, ps.customer_name, COALESCE(ps.sale_price, p.price) as amount, p.name as product_name, 'Sale' as type
        FROM product_sales ps JOIN products p ON ps.product_id = p.id AND p.tenant_id = $1
        WHERE ps.tenant_id = $1 AND ps.purchase_date = $2`, [tenantId, date]),
      pool.query(`SELECT id, invoice_date as date, customer_name, grand_total as amount, invoice_number, status FROM standalone_invoices WHERE tenant_id = $1 AND invoice_date = $2 AND status != 'cancelled'`, [tenantId, date]),
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
      pool.query(`SELECT id, payment_date as date, staff_name, amount, payment_type, payment_method
        FROM staff_payments WHERE tenant_id = $1 AND payment_date = $2`, [tenantId, date]),
      pool.query(`SELECT id, expense_date as date, category, description, amount, payment_method
        FROM expenses WHERE tenant_id = $1 AND expense_date = $2`, [tenantId, date]),
    ]);

    const entries: { id: string; date: string; type: string; party: string; product?: string; debit: number; credit: number; method?: string }[] = [];

    for (const r of sales.rows as Record<string, unknown>[]) {
      entries.push({ id: r.id as string, date: r.date as string, type: 'Sale', party: (r.customer_name as string) || 'Walk-in', product: r.product_name as string, debit: Number(r.amount) || 0, credit: 0 });
    }
    for (const r of invoices.rows as Record<string, unknown>[]) {
      entries.push({ id: r.id as string, date: r.date as string, type: `Invoice${r.status === 'paid' ? ' (Paid)' : ''}`, party: (r.customer_name as string) || 'Customer', product: r.invoice_number as string, debit: Number(r.amount) || 0, credit: 0 });
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
    const typeLabels: Record<string, string> = { salary: 'Staff Salary', advance: 'Staff Advance', advance_repay: 'Advance Repaid', bonus: 'Staff Bonus', deduction: 'Staff Deduction' };
    for (const r of staffPays.rows as Record<string, unknown>[]) {
      const pType = r.payment_type as string;
      const isOutflow = ['salary', 'bonus', 'advance'].includes(pType);
      entries.push({ id: r.id as string, date: r.date as string, type: typeLabels[pType] || 'Staff Payment', party: r.staff_name as string, debit: isOutflow ? 0 : Number(r.amount) || 0, credit: isOutflow ? Number(r.amount) || 0 : 0, method: r.payment_method as string });
    }

    for (const r of expenseRows.rows as Record<string, unknown>[]) {
      entries.push({ id: r.id as string, date: r.date as string, type: `Expense: ${r.category}`, party: (r.description as string) || (r.category as string), debit: 0, credit: Number(r.amount) || 0, method: r.payment_method as string });
    }

    const totalDebit = entries.reduce((s, e) => s + e.debit, 0);
    const totalCredit = entries.reduce((s, e) => s + e.credit, 0);

    res.json({ date, entries, totalDebit, totalCredit, netFlow: totalDebit - totalCredit });
  } catch (err) { console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' }); }
});

// GSTR-3B Computation — output tax, ITC, net payable
router.get('/api/gstr3b/compute', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { month, year } = req.query;
    const m = Number(month) || new Date().getMonth() + 1;
    const y = Number(year) || new Date().getFullYear();
    const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
    const endDate = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;

    // Output tax — from distribution (sales)
    const distRows = (await pool.query(
      `SELECT SUM(CASE WHEN gst_applied THEN billed_price - cost_price ELSE 0 END) as total_tax,
              SUM(cost_price) as taxable_value,
              SUM(billed_price) as total_value
       FROM product_distribution WHERE tenant_id = $1 AND distribution_date >= $2 AND distribution_date < $3`,
      [tenantId, startDate, endDate]
    )).rows[0] as { total_tax: string; taxable_value: string; total_value: string };

    // Output from standalone invoices
    const invRows = (await pool.query(
      `SELECT COALESCE(SUM(subtotal), 0) as taxable, COALESCE(SUM(tax_total), 0) as tax, COALESCE(SUM(grand_total), 0) as total
       FROM standalone_invoices WHERE tenant_id = $1 AND invoice_date >= $2 AND invoice_date < $3 AND status != 'cancelled'`,
      [tenantId, startDate, endDate]
    )).rows[0] as { taxable: string; tax: string; total: string };

    // ITC — from purchases
    const purchaseRows = (await pool.query(
      `SELECT SUM(CASE WHEN gst_applied THEN billed_price - cost_price ELSE 0 END) as total_itc,
              SUM(cost_price) as taxable_value
       FROM product_purchases WHERE tenant_id = $1 AND purchase_date >= $2 AND purchase_date < $3`,
      [tenantId, startDate, endDate]
    )).rows[0] as { total_itc: string; taxable_value: string };

    // Expenses ITC (only GST-applicable expenses)
    const expenseRows = (await pool.query(
      `SELECT COALESCE(SUM(amount * 0.18 / 1.18), 0) as itc
       FROM expenses WHERE tenant_id = $1 AND expense_date >= $2 AND expense_date < $3
       AND category IN ('Office Supplies', 'Vehicle / Fuel', 'Marketing / Ads', 'Software / Tools', 'Communication / Internet', 'Equipment / Machinery')`,
      [tenantId, startDate, endDate]
    )).rows[0] as { itc: string };

    const outputTax = Number(distRows.total_tax || 0) + Number(invRows.tax || 0);
    const outputTaxable = Number(distRows.taxable_value || 0) + Number(invRows.taxable || 0);
    const itcPurchases = Number(purchaseRows.total_itc || 0);
    const itcExpenses = Number(expenseRows.itc || 0);
    const totalItc = itcPurchases + itcExpenses;
    const netPayable = Math.max(0, outputTax - totalItc);

    // Split into IGST / CGST+SGST (approximate — 50/50 for intra-state)
    const cgst = Math.round(outputTax / 2 * 100) / 100;
    const sgst = Math.round(outputTax / 2 * 100) / 100;
    const itcCgst = Math.round(totalItc / 2 * 100) / 100;
    const itcSgst = Math.round(totalItc / 2 * 100) / 100;

    res.json({
      period: { month: m, year: y },
      output: { taxableValue: Math.round(outputTaxable), cgst, sgst, igst: 0, cess: 0, total: Math.round(outputTax * 100) / 100 },
      itc: { cgst: itcCgst, sgst: itcSgst, igst: 0, total: Math.round(totalItc * 100) / 100, fromPurchases: Math.round(itcPurchases * 100) / 100, fromExpenses: Math.round(itcExpenses * 100) / 100 },
      netPayable: { cgst: Math.round(Math.max(0, cgst - itcCgst) * 100) / 100, sgst: Math.round(Math.max(0, sgst - itcSgst) * 100) / 100, igst: 0, total: Math.round(netPayable * 100) / 100 },
    });
  } catch (err) { console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' }); }
});

// GSTR-2B Reconciliation — stateless, upload JSON → match against purchases → return results
router.post('/api/gstr2b/reconcile', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const twoBData = req.body as Record<string, unknown>;
    if (!twoBData) return res.status(400).json({ error: 'Upload GSTR-2B JSON from GST portal' });

    // Parse 2B — supports both docdata.b2b and bare b2b formats
    const b2b = (twoBData.docdata as Record<string, unknown>)?.b2b ?? twoBData.b2b;
    if (!Array.isArray(b2b) || !b2b.length) return res.status(400).json({ error: 'No B2B data found in uploaded JSON' });

    // Fetch all purchases with supplier GSTIN
    const { rows: purchases } = await pool.query(
      `SELECT pp.batch_id, pp.invoice_number, pp.purchase_date, pp.cost_price, pp.billed_price, pp.gst_applied,
              s.name as supplier_name, s.gst_number as supplier_gstin
       FROM product_purchases pp
       JOIN suppliers s ON pp.supplier_id = s.id AND s.tenant_id = pp.tenant_id
       WHERE pp.tenant_id = $1 AND s.gst_number IS NOT NULL`,
      [tenantId]
    );

    // Group purchases by supplier GSTIN + invoice number
    const normalize = (s: string) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const bookMap = new Map<string, { supplierName: string; supplierGstin: string; invoiceNumber: string; date: string; totalBilled: number; totalCost: number; count: number }>();

    for (const p of purchases) {
      const gstin = normalize(p.supplier_gstin);
      const invNo = normalize(p.invoice_number || p.batch_id);
      const key = `${gstin}::${invNo}`;
      const existing = bookMap.get(key);
      if (existing) {
        existing.totalBilled += Number(p.billed_price) || 0;
        existing.totalCost += Number(p.cost_price) || 0;
        existing.count++;
      } else {
        bookMap.set(key, {
          supplierName: p.supplier_name, supplierGstin: p.supplier_gstin,
          invoiceNumber: p.invoice_number || p.batch_id, date: p.purchase_date,
          totalBilled: Number(p.billed_price) || 0, totalCost: Number(p.cost_price) || 0, count: 1,
        });
      }
    }

    const matchedKeys = new Set<string>();
    const rows: Record<string, unknown>[] = [];

    // Match 2B invoices against books
    for (const supplier of b2b as { ctin?: string; trdnm?: string; inv?: Record<string, unknown>[] }[]) {
      const ctin = normalize(supplier.ctin || '');
      const supplierName = supplier.trdnm || ctin;
      const invoices = Array.isArray(supplier.inv) ? supplier.inv : [];

      for (const inv of invoices) {
        const invNum = normalize(String(inv.inum || ''));
        const twoBVal = Number(inv.val) || 0;
        const items = Array.isArray(inv.items) ? inv.items as { txval?: number; igst?: number; cgst?: number; sgst?: number }[] : [];
        const twoBTaxable = items.reduce((s, it) => s + (Number(it.txval) || 0), 0);
        const itcAvailable = String(inv.itcavl || 'Y').toUpperCase() === 'Y';
        const key = `${ctin}::${invNum}`;
        const book = bookMap.get(key);

        if (book) {
          matchedKeys.add(key);
          const diff = Math.abs(twoBVal - book.totalBilled);
          rows.push({
            status: diff <= 1 ? 'matched' : 'amount_mismatch',
            supplier: supplierName, ctin: supplier.ctin, invoiceNumber: String(inv.inum),
            date: String(inv.dt || book.date), twoBVal, bookVal: book.totalBilled,
            diff: Math.round((twoBVal - book.totalBilled) * 100) / 100, itcAvailable,
          });
        } else {
          rows.push({
            status: 'twob_only',
            supplier: supplierName, ctin: supplier.ctin, invoiceNumber: String(inv.inum),
            date: String(inv.dt || ''), twoBVal, bookVal: 0, diff: twoBVal, itcAvailable,
          });
        }
      }
    }

    // Book-only entries (not matched by any 2B record)
    for (const [key, book] of bookMap) {
      if (!matchedKeys.has(key)) {
        rows.push({
          status: 'book_only',
          supplier: book.supplierName, ctin: book.supplierGstin, invoiceNumber: book.invoiceNumber,
          date: book.date, twoBVal: 0, bookVal: book.totalBilled, diff: -book.totalBilled, itcAvailable: false,
        });
      }
    }

    const stats = {
      total: rows.length,
      matched: rows.filter(r => r.status === 'matched').length,
      amount_mismatch: rows.filter(r => r.status === 'amount_mismatch').length,
      book_only: rows.filter(r => r.status === 'book_only').length,
      twob_only: rows.filter(r => r.status === 'twob_only').length,
    };

    res.json({ rows, stats });
  } catch (err) { console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' }); }
});

export default router;
