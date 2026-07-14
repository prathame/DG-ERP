import { Router } from 'express';
import { pool } from '../pg-db';

const router = Router();

router.get('/api/dashboard/stats', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const today = new Date().toISOString().slice(0, 10);
    const thisMonth = today.slice(0, 7);
    const lastMonthDate = new Date(); lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);
    const lastMonth = lastMonthDate.toISOString().slice(0, 7);

    const [revenue, warranties, pendingClaims, rewardsEarned, totalProducts, distributed, sold, vendorRewards, withAdmin, withVendors, totalInventory, availableInInventory, todaySales, thisMonthSales, lastMonthSales, thisMonthRevenue, lastMonthRevenue, totalVendorReceived, totalVendorOutstanding, todayCollections, todayRevenue, todayDistributionValue] = await Promise.all([
      pool.query("SELECT COALESCE(SUM(sale_price), 0) as total FROM product_sales WHERE tenant_id = $1", [tenantId]).then(r => r.rows[0] as { total: number }),
      pool.query("SELECT COUNT(*) as count FROM warranties WHERE status = 'Active' AND tenant_id = $1", [tenantId]).then(r => r.rows[0] as { count: number }),
      pool.query("SELECT COUNT(*) as count FROM warranties WHERE status = 'Under Claim' AND tenant_id = $1", [tenantId]).then(r => r.rows[0] as { count: number }),
      pool.query("SELECT COALESCE(SUM(points), 0) as total FROM rewards WHERE type = 'Earned' AND tenant_id = $1", [tenantId]).then(r => r.rows[0] as { total: number }),
      pool.query('SELECT COUNT(*) as count FROM products WHERE tenant_id = $1', [tenantId]).then(r => r.rows[0] as { count: number }),
      pool.query("SELECT COUNT(*) as count FROM product_distribution WHERE status = 'Distributed' AND tenant_id = $1", [tenantId]).then(r => r.rows[0] as { count: number }),
      pool.query("SELECT COUNT(*) as count FROM product_distribution WHERE status = 'Sold' AND tenant_id = $1", [tenantId]).then(r => r.rows[0] as { count: number }),
      pool.query('SELECT COALESCE(SUM(total_reward_points), 0) as total FROM vendors WHERE tenant_id = $1', [tenantId]).then(r => r.rows[0] as { total: number }),
      pool.query("SELECT COUNT(*) as count FROM product_inventory WHERE status = 'InStock' AND tenant_id = $1", [tenantId]).then(r => r.rows[0] as { count: number }),
      pool.query("SELECT COUNT(*) as count FROM product_distribution WHERE status = 'Distributed' AND tenant_id = $1", [tenantId]).then(r => r.rows[0] as { count: number }),
      pool.query("SELECT COUNT(*) as count FROM product_inventory WHERE tenant_id = $1", [tenantId]).then(r => r.rows[0] as { count: number }),
      pool.query('SELECT COALESCE(SUM(stock), 0) as total FROM products WHERE tenant_id = $1', [tenantId]).then(r => r.rows[0] as { total: number }),
      pool.query("SELECT COUNT(*) as c FROM product_sales WHERE purchase_date = $1 AND tenant_id = $2", [today, tenantId]).then(r => r.rows[0] as { c: number }),
      pool.query("SELECT COUNT(*) as c FROM product_sales WHERE to_char(purchase_date, 'YYYY-MM') = $1 AND tenant_id = $2", [thisMonth, tenantId]).then(r => r.rows[0] as { c: number }),
      pool.query("SELECT COUNT(*) as c FROM product_sales WHERE to_char(purchase_date, 'YYYY-MM') = $1 AND tenant_id = $2", [lastMonth, tenantId]).then(r => r.rows[0] as { c: number }),
      pool.query("SELECT COALESCE(SUM(sale_price), 0) as t FROM product_sales WHERE to_char(purchase_date, 'YYYY-MM') = $1 AND tenant_id = $2", [thisMonth, tenantId]).then(r => r.rows[0] as { t: number }),
      pool.query("SELECT COALESCE(SUM(sale_price), 0) as t FROM product_sales WHERE to_char(purchase_date, 'YYYY-MM') = $1 AND tenant_id = $2", [lastMonth, tenantId]).then(r => r.rows[0] as { t: number }),
      pool.query("SELECT COALESCE(SUM(amount), 0) as total FROM vendor_payments WHERE tenant_id = $1", [tenantId]).then(r => r.rows[0] as { total: number }),
      pool.query(`SELECT COALESCE(SUM(COALESCE(pd.billed_price, pd.net_price, p.price)), 0) - COALESCE((SELECT SUM(amount) FROM vendor_payments WHERE tenant_id = $1), 0) as outstanding FROM product_distribution pd JOIN products p ON pd.product_id = p.id AND p.tenant_id = $1 WHERE pd.tenant_id = $1`, [tenantId]).then(r => r.rows[0] as { outstanding: number }),
      pool.query("SELECT COALESCE(SUM(amount), 0) as total FROM vendor_payments WHERE tenant_id = $1 AND payment_date = $2", [tenantId, today]).then(r => r.rows[0] as { total: number }),
      pool.query("SELECT COALESCE(SUM(sale_price), 0) as total FROM product_sales WHERE tenant_id = $1 AND purchase_date = $2", [tenantId, today]).then(r => r.rows[0] as { total: number }),
      pool.query(`SELECT COALESCE(SUM(COALESCE(pd.billed_price, pd.net_price, p.price)), 0) as total FROM product_distribution pd JOIN products p ON pd.product_id = p.id AND p.tenant_id = $1 WHERE pd.tenant_id = $1 AND pd.distribution_date = $2`, [tenantId, today]).then(r => r.rows[0] as { total: number }),
    ]);
    const totalBeforeDistribution = totalInventory.count;

    const lowStockProducts = (await pool.query(`
      SELECT p.id, p.name, COUNT(pi.id) as stock FROM products p
      LEFT JOIN product_inventory pi ON pi.product_id = p.id AND pi.status = 'InStock' AND pi.tenant_id = $1
      WHERE p.tenant_id = $1
      GROUP BY p.id, p.name HAVING COUNT(pi.id) < 10 ORDER BY COUNT(pi.id) ASC LIMIT 5
    `, [tenantId])).rows as { id: string; name: string; stock: number }[];

    const topProducts = (await pool.query(`
      SELECT p.name, COUNT(ps.id) as sold FROM product_sales ps JOIN products p ON ps.product_id = p.id AND p.tenant_id = $1
      WHERE ps.tenant_id = $1
      GROUP BY p.name ORDER BY sold DESC LIMIT 5
    `, [tenantId])).rows as { name: string; sold: number }[];

    const expiringWarranties = (await pool.query(`
      SELECT COUNT(*) as c FROM warranties WHERE status = 'Active' AND expiry_date BETWEEN $1 AND (CAST($1 AS DATE) + INTERVAL '30 days') AND tenant_id = $2
    `, [today, tenantId])).rows[0] as { c: number };

    res.json({
      totalRevenue: Number(revenue.total) || 0,
      activeWarranties: Number(warranties.count) || 0,
      pendingClaims: Number(pendingClaims.count) || 0,
      rewardPointsIssued: Number(rewardsEarned.total) || 0,
      totalProducts: Number(totalProducts.count) || 0,
      productsDistributed: Number(distributed.count) || 0,
      productsSold: Number(sold.count) || 0,
      vendorRewardPoints: Number(vendorRewards.total) || 0,
      availableInInventory: Number(availableInInventory.total) || 0,
      withAdmin: Number(withAdmin.count) || 0,
      withVendors: Number(withVendors.count) || 0,
      totalBeforeDistribution: Number(totalBeforeDistribution) || 0,
      todaySales: Number(todaySales.c) || 0,
      thisMonthSales: Number(thisMonthSales.c) || 0,
      lastMonthSales: Number(lastMonthSales.c) || 0,
      thisMonthRevenue: Number(thisMonthRevenue.t) || 0,
      lastMonthRevenue: Number(lastMonthRevenue.t) || 0,
      lowStockProducts: lowStockProducts.map((p) => ({ ...p, stock: Number(p.stock) || 0 })),
      topProducts: topProducts.map((p) => ({ ...p, sold: Number(p.sold) || 0 })),
      expiringWarranties: Number(expiringWarranties.c) || 0,
      totalVendorReceived: Number(totalVendorReceived.total) || 0,
      totalVendorOutstanding: Number(totalVendorOutstanding.outstanding) || 0,
      todayCollections: Number(todayCollections.total) || 0,
      todayRevenue: Number(todayRevenue.total) || 0,
      todayDistributionValue: Number(todayDistributionValue.total) || 0,
    });
  } catch (err) {
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' });
  }
});


router.get('/api/dashboard/money', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { from, to } = req.query as { from?: string; to?: string };
    const dateFilter = (col: string) => from && to ? `AND ${col} BETWEEN $2 AND $3` : from ? `AND ${col} >= $2` : '';
    const params = (extra: unknown[]) => from && to ? [tenantId, from, to, ...extra] : from ? [tenantId, from, ...extra] : [tenantId, ...extra];

    const [collections, revenue, distribution, expenses, outstanding, invoiceOutstanding] = await Promise.all([
      pool.query(`SELECT COALESCE(SUM(amount),0) as v FROM vendor_payments WHERE tenant_id=$1 ${dateFilter('payment_date')}`, params([])).then(r => Number(r.rows[0].v) || 0),
      Promise.all([
        pool.query(`SELECT COALESCE(SUM(sale_price),0) as v FROM product_sales WHERE tenant_id=$1 ${dateFilter('purchase_date')}`, params([])),
        pool.query(`SELECT COALESCE(SUM(grand_total),0) as v FROM standalone_invoices WHERE tenant_id=$1 AND status != 'cancelled' ${dateFilter('invoice_date')}`, params([])),
      ]).then(([ps, si]) => (Number(ps.rows[0].v) || 0) + (Number(si.rows[0].v) || 0)),
      pool.query(`SELECT COALESCE(SUM(COALESCE(pd.billed_price,pd.net_price,p.price)),0) as v FROM product_distribution pd JOIN products p ON pd.product_id=p.id AND p.tenant_id=$1 WHERE pd.tenant_id=$1 ${dateFilter('pd.distribution_date')}`, params([])).then(r => Number(r.rows[0].v) || 0),
      pool.query(`SELECT COALESCE(SUM(amount),0) as v FROM expenses WHERE tenant_id=$1 ${dateFilter('expense_date')}`, params([])).then(r => Number(r.rows[0].v) || 0),
      pool.query(`SELECT COALESCE(SUM(COALESCE(pd.billed_price,pd.net_price,p.price)),0) - COALESCE((SELECT SUM(amount) FROM vendor_payments WHERE tenant_id=$1),0) as v FROM product_distribution pd JOIN products p ON pd.product_id=p.id AND p.tenant_id=$1 WHERE pd.tenant_id=$1`, [tenantId]).then(r => Number(r.rows[0].v) || 0),
      pool.query(`SELECT COALESCE(SUM(grand_total),0) as v FROM standalone_invoices WHERE tenant_id=$1 AND status NOT IN ('paid','cancelled')`, [tenantId]).then(r => Number(r.rows[0].v) || 0),
    ]);
    res.json({ collections, revenue, distribution, expenses, outstanding, invoiceOutstanding });
  } catch (err) {
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/api/analytics/recent-activity', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const rows = (await pool.query(`
      SELECT type, id, label, amount, date FROM (
        SELECT 'sale' as type, id, COALESCE(customer_name, 'Customer') as label, sale_price as amount, purchase_date::text as date FROM product_sales WHERE tenant_id = $1
        UNION ALL
        SELECT 'invoice', id, COALESCE(customer_name, 'Customer') as label, grand_total as amount, invoice_date::text as date FROM standalone_invoices WHERE tenant_id = $1 AND status != 'cancelled'
        UNION ALL
        SELECT 'payment', id, vendor_id as label, amount, payment_date::text FROM vendor_payments WHERE tenant_id = $1
        UNION ALL
        SELECT 'distribution', COALESCE(batch_id, id), vendor_id as label, SUM(COALESCE(billed_price, net_price, 0)) as amount, MIN(distribution_date)::text as date FROM product_distribution WHERE tenant_id = $1 GROUP BY COALESCE(batch_id, id), vendor_id
        UNION ALL
        SELECT 'expense', id, category as label, amount, expense_date::text FROM expenses WHERE tenant_id = $1
      ) t ORDER BY date DESC LIMIT 15
    `, [tenantId])).rows as { type: string; id: string; label: string; amount: number; date: string }[];

    // Resolve vendor IDs to names for payment + distribution rows
    const vendorIds = [...new Set(rows.filter(r => r.type === 'payment' || r.type === 'distribution').map(r => r.label))];
    const vendorMap: Record<string, string> = {};
    if (vendorIds.length) {
      const vRows = (await pool.query('SELECT id, name FROM vendors WHERE tenant_id = $1 AND id = ANY($2)', [tenantId, vendorIds])).rows as { id: string; name: string }[];
      for (const v of vRows) vendorMap[v.id] = v.name;
    }

    res.json(rows.map(r => ({ ...r, amount: Number(r.amount) || 0, label: (r.type === 'payment' || r.type === 'distribution') ? (vendorMap[r.label] || r.label) : r.label })));
  } catch (err) {
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' });
  }
});

// Combined analytics overview — replaces 4 separate frontend calls with 1
router.get('/api/analytics/overview', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { from, to } = req.query as { from?: string; to?: string };
    const dateFilter = (col: string) => from && to ? `AND ${col} BETWEEN $2 AND $3` : from ? `AND ${col} >= $2` : '';
    const params = (extra: unknown[]) => from && to ? [tenantId, from, to, ...extra] : from ? [tenantId, from, ...extra] : [tenantId, ...extra];

    const [collections, salesRev, invoiceRev, distribution, expenses, outstanding, invoiceOutstanding,
           activityRows, vendorSummary, counts] = await Promise.all([
      pool.query(`SELECT COALESCE(SUM(amount),0) as v FROM vendor_payments WHERE tenant_id=$1 ${dateFilter('payment_date')}`, params([])).then(r => Number(r.rows[0].v) || 0),
      pool.query(`SELECT COALESCE(SUM(sale_price),0) as v FROM product_sales WHERE tenant_id=$1 ${dateFilter('purchase_date')}`, params([])).then(r => Number(r.rows[0].v) || 0),
      pool.query(`SELECT COALESCE(SUM(grand_total),0) as v FROM standalone_invoices WHERE tenant_id=$1 AND status!='cancelled' ${dateFilter('invoice_date')}`, params([])).then(r => Number(r.rows[0].v) || 0),
      pool.query(`SELECT COALESCE(SUM(COALESCE(pd.billed_price,pd.net_price,p.price)),0) as v FROM product_distribution pd JOIN products p ON pd.product_id=p.id AND p.tenant_id=$1 WHERE pd.tenant_id=$1 ${dateFilter('pd.distribution_date')}`, params([])).then(r => Number(r.rows[0].v) || 0),
      pool.query(`SELECT COALESCE(SUM(amount),0) as v FROM expenses WHERE tenant_id=$1 ${dateFilter('expense_date')}`, params([])).then(r => Number(r.rows[0].v) || 0),
      pool.query(`SELECT COALESCE(SUM(COALESCE(pd.billed_price,pd.net_price,p.price)),0)-COALESCE((SELECT SUM(amount) FROM vendor_payments WHERE tenant_id=$1),0) as v FROM product_distribution pd JOIN products p ON pd.product_id=p.id AND p.tenant_id=$1 WHERE pd.tenant_id=$1`, [tenantId]).then(r => Number(r.rows[0].v) || 0),
      pool.query(`SELECT COALESCE(SUM(grand_total),0) as v FROM standalone_invoices WHERE tenant_id=$1 AND status NOT IN ('paid','cancelled')`, [tenantId]).then(r => Number(r.rows[0].v) || 0),
      pool.query(`SELECT type,id,label,amount,date FROM (
        SELECT 'sale' as type,id,COALESCE(customer_name,'Customer') as label,sale_price as amount,purchase_date::text as date FROM product_sales WHERE tenant_id=$1
        UNION ALL SELECT 'invoice',id,COALESCE(customer_name,'Customer'),grand_total,invoice_date::text FROM standalone_invoices WHERE tenant_id=$1 AND status!='cancelled'
        UNION ALL SELECT 'payment',id,vendor_id,amount,payment_date::text FROM vendor_payments WHERE tenant_id=$1
        UNION ALL SELECT 'distribution',COALESCE(batch_id,id),vendor_id,SUM(COALESCE(billed_price,net_price,0)),MIN(distribution_date)::text FROM product_distribution WHERE tenant_id=$1 GROUP BY COALESCE(batch_id,id),vendor_id
        UNION ALL SELECT 'expense',id,category,amount,expense_date::text FROM expenses WHERE tenant_id=$1
      ) t ORDER BY date DESC LIMIT 15`, [tenantId]),
      pool.query(`SELECT v.id,v.name,v.phone,SUM(COALESCE(pd.billed_price,pd.net_price,p.price)) as distributed,COALESCE(SUM(vp.amount),0) as paid
        FROM vendors v
        LEFT JOIN product_distribution pd ON pd.vendor_id=v.id AND pd.tenant_id=$1
        LEFT JOIN products p ON pd.product_id=p.id AND p.tenant_id=$1
        LEFT JOIN vendor_payments vp ON vp.vendor_id=v.id AND vp.tenant_id=$1
        WHERE v.tenant_id=$1 AND v.id!='OWNER'
        GROUP BY v.id,v.name,v.phone
        HAVING SUM(COALESCE(pd.billed_price,pd.net_price,p.price))-COALESCE(SUM(vp.amount),0)>0
        ORDER BY (SUM(COALESCE(pd.billed_price,pd.net_price,p.price))-COALESCE(SUM(vp.amount),0)) DESC
        LIMIT 5`, [tenantId]),
      pool.query(`SELECT
        (SELECT COUNT(*) FROM customers WHERE tenant_id=$1) as customers,
        (SELECT COUNT(*) FROM vendors WHERE tenant_id=$1 AND id!='OWNER') as vendors,
        (SELECT COUNT(*) FROM products WHERE tenant_id=$1) as items,
        (SELECT COUNT(*) FROM banks WHERE tenant_id=$1) as banks,
        (SELECT COUNT(*) FROM staff_members WHERE tenant_id=$1) as staff`, [tenantId]),
    ]);

    // Resolve vendor names for activity
    const vendorIds = [...new Set(activityRows.rows.filter((r: Record<string,unknown>) => r.type === 'payment' || r.type === 'distribution').map((r: Record<string,unknown>) => r.label as string))];
    const vendorMap: Record<string,string> = {};
    if (vendorIds.length) {
      const vr = await pool.query('SELECT id,name FROM vendors WHERE tenant_id=$1 AND id=ANY($2)', [tenantId, vendorIds]);
      for (const v of vr.rows as {id:string;name:string}[]) vendorMap[v.id] = v.name;
    }

    const c = counts.rows[0] as Record<string,string>;
    res.json({
      money: { collections, revenue: salesRev + invoiceRev, distribution, expenses, outstanding, invoiceOutstanding },
      recentActivity: activityRows.rows.map((r: Record<string,unknown>) => ({ ...r, amount: Number(r.amount)||0, label: (r.type==='payment'||r.type==='distribution') ? (vendorMap[r.label as string]||r.label) : r.label })),
      topVendors: vendorSummary.rows.map((r: Record<string,unknown>) => ({ vendorId: r.id, vendorName: r.name, balance: Number(r.distributed)||0 - Number(r.paid)||0 })),
      counts: { customerMaster: Number(c.customers)||0, vendorMaster: Number(c.vendors)||0, itemMaster: Number(c.items)||0, bankMaster: Number(c.banks)||0, staffCount: Number(c.staff)||0 },
    });
  } catch (err) {
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/api/dashboard/rewards-summary', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const rows = (await pool.query(`
      SELECT v.id, v.name, v.total_sales as products_sold, v.total_reward_points
      FROM vendors v
      WHERE v.tenant_id = $1
      ORDER BY v.total_reward_points DESC
    `, [tenantId])).rows as { id: string; name: string; products_sold: number; total_reward_points: number }[];

    const productSales = (await pool.query(`
      SELECT p.name as product_name, COUNT(ps.id) as sold
      FROM product_sales ps
      JOIN products p ON ps.product_id = p.id AND p.tenant_id = $1
      WHERE ps.tenant_id = $1
      GROUP BY p.name
      ORDER BY sold DESC
    `, [tenantId])).rows as { product_name: string; sold: number }[];

    res.json({
      vendorSummaries: rows.map((r) => ({
        vendorId: r.id,
        vendorName: r.name,
        productsSold: r.products_sold,
        totalRewardPoints: r.total_reward_points,
      })),
      categoryWiseSales: productSales.map((c) => ({
        categoryId: null,
        categoryName: c.product_name,
        sold: c.sold,
      })),
    });
  } catch (err) {
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/api/dashboard/vendor/:vendorId', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { vendorId } = req.params;
    const vendor = (await pool.query('SELECT * FROM vendors WHERE id = $1 AND tenant_id = $2', [vendorId, tenantId])).rows[0] as Record<string, unknown> | undefined;
    if (!vendor) return res.status(404).json({ error: 'Vendor not found' });

    const assigned = (await pool.query(`
      SELECT pd.*, p.name as product_name, p.reward_points_value
      FROM product_distribution pd
      JOIN products p ON pd.product_id = p.id AND p.tenant_id = $2
      WHERE pd.vendor_id = $1 AND pd.status = 'Distributed' AND pd.tenant_id = $2
    `, [vendorId, tenantId])).rows as Record<string, unknown>[];

    const sales = (await pool.query(`
      SELECT ps.*, p.name as product_name
      FROM product_sales ps
      JOIN products p ON ps.product_id = p.id AND p.tenant_id = $2
      WHERE ps.vendor_id = $1 AND ps.tenant_id = $2
      ORDER BY ps.purchase_date DESC
    `, [vendorId, tenantId])).rows as Record<string, unknown>[];

    const categorySales = (await pool.query(`
      SELECT p.name as product_name, COUNT(ps.id) as sold
      FROM product_sales ps
      JOIN products p ON ps.product_id = p.id AND p.tenant_id = $2
      WHERE ps.vendor_id = $1 AND ps.tenant_id = $2
      GROUP BY p.name
      ORDER BY sold DESC
    `, [vendorId, tenantId])).rows as { product_name: string; sold: number }[];

    res.json({
      vendor: {
        id: vendor.id,
        name: vendor.name,
        totalSales: vendor.total_sales ?? 0,
        totalRewardPoints: vendor.total_reward_points ?? 0,
      },
      assignedProducts: assigned.map((a) => ({
        id: a.id,
        productName: a.product_name,
        barcode: a.barcode,
        rewardPointsValue: a.reward_points_value,
      })),
      salesHistory: sales.map((s) => ({
        id: s.id,
        productName: s.product_name,
        customerName: s.customer_name,
        purchaseDate: s.purchase_date,
        rewardPointsEarned: s.reward_points_earned,
      })),
      categoryWiseSales: categorySales.map((c) => ({
        categoryName: c.product_name,
        sold: c.sold,
      })),
    });
  } catch (err) {
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
