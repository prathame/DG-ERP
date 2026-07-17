import { Router } from 'express';
import { pool } from '../pg-db';
import { handleApiError } from '../utils/http-error';
import { AuthRequest, vendorScopeId, assertVendorLinked } from '../middleware/auth';

const router = Router();

router.get('/api/dashboard/stats', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const unlinked = assertVendorLinked(req);
    if (unlinked) return res.status(403).json({ error: unlinked });

    const today = new Date().toISOString().slice(0, 10);
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const thisMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().slice(0, 10);
    const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10);

    const vid = vendorScopeId(req);
    if (vid) {
      // H3: Vendor JWT — only their own figures
      const [scalar, outstanding, todayDist, topProducts] = await Promise.all([
        pool.query(
          `
          SELECT
            (SELECT COALESCE(SUM(sale_price),0) FROM product_sales WHERE tenant_id=$1 AND vendor_id=$2) AS total_revenue,
            (SELECT COUNT(*) FROM warranties w WHERE w.status='Active' AND w.tenant_id=$1
              AND w.barcode IN (SELECT barcode FROM product_sales WHERE vendor_id=$2 AND tenant_id=$1)) AS active_warranties,
            (SELECT COUNT(*) FROM warranties w WHERE w.status='Under Claim' AND w.tenant_id=$1
              AND w.barcode IN (SELECT barcode FROM product_sales WHERE vendor_id=$2 AND tenant_id=$1)) AS pending_claims,
            (SELECT COALESCE(SUM(points),0) FROM rewards WHERE type='Earned' AND tenant_id=$1 AND user_id=$2) AS rewards_earned,
            (SELECT COUNT(DISTINCT product_id) FROM product_distribution WHERE tenant_id=$1 AND vendor_id=$2) AS total_products,
            (SELECT COUNT(*) FROM product_distribution WHERE status='Distributed' AND tenant_id=$1 AND vendor_id=$2) AS with_vendors,
            (SELECT COUNT(*) FROM product_distribution WHERE status='Sold' AND tenant_id=$1 AND vendor_id=$2) AS products_sold,
            (SELECT COALESCE(total_reward_points,0) FROM vendors WHERE tenant_id=$1 AND id=$2) AS vendor_rewards,
            0 AS with_admin,
            (SELECT COUNT(*) FROM product_distribution WHERE tenant_id=$1 AND vendor_id=$2) AS total_inventory,
            0 AS available_in_inventory,
            (SELECT COUNT(*) FROM product_sales WHERE purchase_date=$3 AND tenant_id=$1 AND vendor_id=$2) AS today_sales,
            (SELECT COUNT(*) FROM product_sales WHERE purchase_date BETWEEN $4 AND $5 AND tenant_id=$1 AND vendor_id=$2) AS this_month_sales,
            (SELECT COUNT(*) FROM product_sales WHERE purchase_date BETWEEN $6 AND $7 AND tenant_id=$1 AND vendor_id=$2) AS last_month_sales,
            (SELECT COALESCE(SUM(sale_price),0) FROM product_sales WHERE purchase_date BETWEEN $4 AND $5 AND tenant_id=$1 AND vendor_id=$2) AS this_month_revenue,
            (SELECT COALESCE(SUM(sale_price),0) FROM product_sales WHERE purchase_date BETWEEN $6 AND $7 AND tenant_id=$1 AND vendor_id=$2) AS last_month_revenue,
            (SELECT COALESCE(SUM(amount),0) FROM vendor_payments WHERE tenant_id=$1 AND vendor_id=$2) AS total_vendor_received,
            (SELECT COALESCE(SUM(amount),0) FROM vendor_payments WHERE payment_date=$3 AND tenant_id=$1 AND vendor_id=$2) AS today_collections,
            (SELECT COALESCE(SUM(sale_price),0) FROM product_sales WHERE purchase_date=$3 AND tenant_id=$1 AND vendor_id=$2) AS today_revenue,
            (SELECT COUNT(*) FROM warranties w WHERE w.status='Active' AND w.expiry_date BETWEEN $3 AND ($3::date + INTERVAL '30 days') AND w.tenant_id=$1
              AND w.barcode IN (SELECT barcode FROM product_sales WHERE vendor_id=$2 AND tenant_id=$1)) AS expiring_warranties
        `,
          [tenantId, vid, today, thisMonthStart, thisMonthEnd, prevMonthStart, prevMonthEnd],
        ),
        pool.query(
          `
          SELECT COALESCE(SUM(COALESCE(pd.billed_price, pd.net_price, p.price)), 0)
            - COALESCE((SELECT SUM(amount) FROM vendor_payments WHERE tenant_id=$1 AND vendor_id=$2), 0) AS outstanding
          FROM product_distribution pd
          JOIN products p ON pd.product_id = p.id AND p.tenant_id = $1
          WHERE pd.tenant_id = $1 AND pd.vendor_id = $2
        `,
          [tenantId, vid],
        ),
        pool.query(
          `
          SELECT COALESCE(SUM(COALESCE(pd.billed_price, pd.net_price, p.price)), 0) AS total
          FROM product_distribution pd
          JOIN products p ON pd.product_id = p.id AND p.tenant_id = $1
          WHERE pd.tenant_id = $1 AND pd.vendor_id = $2 AND pd.distribution_date = $3
        `,
          [tenantId, vid, today],
        ),
        pool.query(
          `
          SELECT p.name, COUNT(ps.id) AS sold
          FROM product_sales ps
          JOIN products p ON ps.product_id = p.id AND p.tenant_id = $1
          WHERE ps.tenant_id = $1 AND ps.vendor_id = $2
          GROUP BY p.name ORDER BY sold DESC LIMIT 5
        `,
          [tenantId, vid],
        ),
      ]);
      const s = scalar.rows[0] as Record<string, string>;
      return res.json({
        totalRevenue: Number(s.total_revenue) || 0,
        activeWarranties: Number(s.active_warranties) || 0,
        pendingClaims: Number(s.pending_claims) || 0,
        rewardPointsIssued: Number(s.rewards_earned) || 0,
        totalProducts: Number(s.total_products) || 0,
        productsDistributed: Number(s.with_vendors) || 0,
        productsSold: Number(s.products_sold) || 0,
        vendorRewardPoints: Number(s.vendor_rewards) || 0,
        availableInInventory: 0,
        withAdmin: 0,
        withVendors: Number(s.with_vendors) || 0,
        totalBeforeDistribution: Number(s.total_inventory) || 0,
        todaySales: Number(s.today_sales) || 0,
        thisMonthSales: Number(s.this_month_sales) || 0,
        lastMonthSales: Number(s.last_month_sales) || 0,
        thisMonthRevenue: Number(s.this_month_revenue) || 0,
        lastMonthRevenue: Number(s.last_month_revenue) || 0,
        totalVendorReceived: Number(s.total_vendor_received) || 0,
        totalVendorOutstanding: Number(outstanding.rows[0]?.outstanding) || 0,
        todayCollections: Number(s.today_collections) || 0,
        todayRevenue: Number(s.today_revenue) || 0,
        todayDistributionValue: Number(todayDist.rows[0]?.total) || 0,
        expiringWarranties: Number(s.expiring_warranties) || 0,
        lowStockProducts: [],
        topProducts: (topProducts.rows as { name: string; sold: number }[]).map(p => ({
          ...p,
          sold: Number(p.sold) || 0,
        })),
      });
    }

    // ── 1: All scalar counts in ONE query ─────────────────────────────────────
    const scalarQ = pool.query(
      `
      SELECT
        (SELECT COALESCE(SUM(sale_price),0)   FROM product_sales        WHERE tenant_id=$1)                                           AS total_revenue,
        (SELECT COUNT(*)                       FROM warranties            WHERE status='Active'       AND tenant_id=$1)                AS active_warranties,
        (SELECT COUNT(*)                       FROM warranties            WHERE status='Under Claim'  AND tenant_id=$1)                AS pending_claims,
        (SELECT COALESCE(SUM(points),0)        FROM rewards               WHERE type='Earned'         AND tenant_id=$1)                AS rewards_earned,
        (SELECT COUNT(*)                       FROM products              WHERE tenant_id=$1)                                           AS total_products,
        (SELECT COUNT(*)                       FROM product_distribution  WHERE status='Distributed'  AND tenant_id=$1)                AS with_vendors,
        (SELECT COUNT(*)                       FROM product_distribution  WHERE status='Sold'         AND tenant_id=$1)                AS products_sold,
        (SELECT COALESCE(SUM(total_reward_points),0) FROM vendors         WHERE tenant_id=$1)                                          AS vendor_rewards,
        (SELECT COUNT(*)                       FROM product_inventory     WHERE status='InStock'      AND tenant_id=$1)                AS with_admin,
        (SELECT COUNT(*)                       FROM product_inventory     WHERE tenant_id=$1)                                           AS total_inventory,
        (SELECT COALESCE(SUM(stock),0)         FROM products              WHERE tenant_id=$1)                                           AS available_in_inventory,
        (SELECT COUNT(*)                       FROM product_sales         WHERE purchase_date=$2      AND tenant_id=$1)                AS today_sales,
        (SELECT COUNT(*)                       FROM product_sales         WHERE purchase_date BETWEEN $3 AND $4 AND tenant_id=$1)       AS this_month_sales,
        (SELECT COUNT(*)                       FROM product_sales         WHERE purchase_date BETWEEN $5 AND $6 AND tenant_id=$1)       AS last_month_sales,
        (SELECT COALESCE(SUM(sale_price),0)    FROM product_sales         WHERE purchase_date BETWEEN $3 AND $4 AND tenant_id=$1)       AS this_month_revenue,
        (SELECT COALESCE(SUM(sale_price),0)    FROM product_sales         WHERE purchase_date BETWEEN $5 AND $6 AND tenant_id=$1)       AS last_month_revenue,
        (SELECT COALESCE(SUM(amount),0)        FROM vendor_payments       WHERE tenant_id=$1)                                           AS total_vendor_received,
        (SELECT COALESCE(SUM(amount),0)        FROM vendor_payments       WHERE payment_date=$2       AND tenant_id=$1)                AS today_collections,
        (SELECT COALESCE(SUM(sale_price),0)    FROM product_sales         WHERE purchase_date=$2      AND tenant_id=$1)                AS today_revenue,
        (SELECT COUNT(*)                       FROM warranties             WHERE status='Active' AND expiry_date BETWEEN $2 AND ($2::date + INTERVAL '30 days') AND tenant_id=$1) AS expiring_warranties
    `,
      [tenantId, today, thisMonthStart, thisMonthEnd, prevMonthStart, prevMonthEnd],
    );

    // ── 2: Outstanding — kept separate (complex subquery) ────────────────────
    const outstandingQ = pool.query(
      `
      SELECT
        COALESCE(SUM(COALESCE(pd.billed_price, pd.net_price, p.price)), 0)
        - COALESCE((SELECT SUM(amount) FROM vendor_payments WHERE tenant_id=$1), 0) AS outstanding
      FROM product_distribution pd
      JOIN products p ON pd.product_id = p.id AND p.tenant_id = $1
      WHERE pd.tenant_id = $1
    `,
      [tenantId],
    );

    // ── 3: Today distribution value ──────────────────────────────────────────
    const todayDistQ = pool.query(
      `
      SELECT COALESCE(SUM(COALESCE(pd.billed_price, pd.net_price, p.price)), 0) AS total
      FROM product_distribution pd
      JOIN products p ON pd.product_id = p.id AND p.tenant_id = $1
      WHERE pd.tenant_id = $1 AND pd.distribution_date = $2
    `,
      [tenantId, today],
    );

    // ── 4: Low stock, top products, expiring warranties — all run in parallel ─
    const lowStockQ = pool.query(
      `
      SELECT p.id, p.name, COUNT(pi.id) AS stock
      FROM products p
      LEFT JOIN product_inventory pi ON pi.product_id = p.id AND pi.status = 'InStock' AND pi.tenant_id = $1
      WHERE p.tenant_id = $1
      GROUP BY p.id, p.name
      HAVING COUNT(pi.id) < 10
      ORDER BY COUNT(pi.id) ASC
      LIMIT 5
    `,
      [tenantId],
    );

    const topProductsQ = pool.query(
      `
      SELECT p.name, COUNT(ps.id) AS sold
      FROM product_sales ps
      JOIN products p ON ps.product_id = p.id AND p.tenant_id = $1
      WHERE ps.tenant_id = $1
      GROUP BY p.name
      ORDER BY sold DESC
      LIMIT 5
    `,
      [tenantId],
    );

    const [scalar, outstanding, todayDist, lowStock, topProducts] = await Promise.all([
      scalarQ,
      outstandingQ,
      todayDistQ,
      lowStockQ,
      topProductsQ,
    ]);

    const s = scalar.rows[0] as Record<string, string>;

    res.json({
      totalRevenue: Number(s.total_revenue) || 0,
      activeWarranties: Number(s.active_warranties) || 0,
      pendingClaims: Number(s.pending_claims) || 0,
      rewardPointsIssued: Number(s.rewards_earned) || 0,
      totalProducts: Number(s.total_products) || 0,
      productsDistributed: Number(s.with_vendors) || 0,
      productsSold: Number(s.products_sold) || 0,
      vendorRewardPoints: Number(s.vendor_rewards) || 0,
      availableInInventory: Number(s.available_in_inventory) || 0,
      withAdmin: Number(s.with_admin) || 0,
      withVendors: Number(s.with_vendors) || 0,
      totalBeforeDistribution: Number(s.total_inventory) || 0,
      todaySales: Number(s.today_sales) || 0,
      thisMonthSales: Number(s.this_month_sales) || 0,
      lastMonthSales: Number(s.last_month_sales) || 0,
      thisMonthRevenue: Number(s.this_month_revenue) || 0,
      lastMonthRevenue: Number(s.last_month_revenue) || 0,
      totalVendorReceived: Number(s.total_vendor_received) || 0,
      totalVendorOutstanding: Number(outstanding.rows[0]?.outstanding) || 0,
      todayCollections: Number(s.today_collections) || 0,
      todayRevenue: Number(s.today_revenue) || 0,
      todayDistributionValue: Number(todayDist.rows[0]?.total) || 0,
      expiringWarranties: Number(s.expiring_warranties) || 0,
      lowStockProducts: (lowStock.rows as { id: string; name: string; stock: number }[]).map(p => ({
        ...p,
        stock: Number(p.stock) || 0,
      })),
      topProducts: (topProducts.rows as { name: string; sold: number }[]).map(p => ({
        ...p,
        sold: Number(p.sold) || 0,
      })),
    });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.get('/api/analytics/recent-activity', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const vid = vendorScopeId(req);
    if (req.user?.role === 'Vendor' && !vid) {
      return res.status(403).json({ error: 'Vendor account is not linked to a vendor profile.' });
    }

    const rows = vid
      ? ((
          await pool.query(
            `
          SELECT type, id, label, amount, date FROM (
            SELECT 'sale' as type, id, COALESCE(customer_name, 'Customer') as label, sale_price as amount, purchase_date::text as date
              FROM product_sales WHERE tenant_id = $1 AND vendor_id = $2
            UNION ALL
            SELECT 'payment', id, vendor_id as label, amount, payment_date::text
              FROM vendor_payments WHERE tenant_id = $1 AND vendor_id = $2
            UNION ALL
            SELECT 'distribution', COALESCE(batch_id, id), vendor_id as label,
              SUM(COALESCE(billed_price, net_price, 0)) as amount, MIN(distribution_date)::text as date
              FROM product_distribution WHERE tenant_id = $1 AND vendor_id = $2
              GROUP BY COALESCE(batch_id, id), vendor_id
          ) t ORDER BY date DESC LIMIT 15
        `,
            [tenantId, vid],
          )
        ).rows as { type: string; id: string; label: string; amount: number; date: string }[])
      : ((
          await pool.query(
            `
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
        `,
            [tenantId],
          )
        ).rows as { type: string; id: string; label: string; amount: number; date: string }[]);

    const vendorIds = [
      ...new Set(rows.filter(r => r.type === 'payment' || r.type === 'distribution').map(r => r.label)),
    ];
    const vendorMap: Record<string, string> = {};
    if (vendorIds.length) {
      const vRows = (
        await pool.query('SELECT id, name FROM vendors WHERE tenant_id = $1 AND id = ANY($2)', [tenantId, vendorIds])
      ).rows as { id: string; name: string }[];
      for (const v of vRows) vendorMap[v.id] = v.name;
    }

    res.json(
      rows.map(r => ({
        ...r,
        amount: Number(r.amount) || 0,
        label: r.type === 'payment' || r.type === 'distribution' ? vendorMap[r.label] || r.label : r.label,
      })),
    );
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

// Combined analytics overview
router.get('/api/analytics/overview', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const vid = vendorScopeId(req);
    if (req.user?.role === 'Vendor' && !vid) {
      return res.status(403).json({ error: 'Vendor account is not linked to a vendor profile.' });
    }
    if (vid) {
      // Vendor-scoped overview — no tenant-wide invoices/expenses/masters
      const { from, to } = req.query as { from?: string; to?: string };
      const dateFilter = (col: string) =>
        from && to ? `AND ${col} BETWEEN $3 AND $4` : from ? `AND ${col} >= $3` : '';
      const p = from && to ? [tenantId, vid, from, to] : from ? [tenantId, vid, from] : [tenantId, vid];
      const [collections, salesRev, distribution, outstanding, activityRows] = await Promise.all([
        pool
          .query(
            `SELECT COALESCE(SUM(amount),0) as v FROM vendor_payments WHERE tenant_id=$1 AND vendor_id=$2 ${dateFilter('payment_date')}`,
            p,
          )
          .then(r => Number(r.rows[0].v) || 0),
        pool
          .query(
            `SELECT COALESCE(SUM(sale_price),0) as v FROM product_sales WHERE tenant_id=$1 AND vendor_id=$2 ${dateFilter('purchase_date')}`,
            p,
          )
          .then(r => Number(r.rows[0].v) || 0),
        pool
          .query(
            `SELECT COALESCE(SUM(COALESCE(pd.billed_price,pd.net_price,p.price)),0) as v FROM product_distribution pd JOIN products p ON pd.product_id=p.id AND p.tenant_id=$1 WHERE pd.tenant_id=$1 AND pd.vendor_id=$2 ${dateFilter('pd.distribution_date')}`,
            p,
          )
          .then(r => Number(r.rows[0].v) || 0),
        pool
          .query(
            `SELECT COALESCE(SUM(COALESCE(pd.billed_price,pd.net_price,p.price)),0)-COALESCE((SELECT SUM(amount) FROM vendor_payments WHERE tenant_id=$1 AND vendor_id=$2),0) as v FROM product_distribution pd JOIN products p ON pd.product_id=p.id AND p.tenant_id=$1 WHERE pd.tenant_id=$1 AND pd.vendor_id=$2`,
            [tenantId, vid],
          )
          .then(r => Number(r.rows[0].v) || 0),
        pool.query(
          `SELECT type,id,label,amount,date FROM (
          SELECT 'sale' as type,id,COALESCE(customer_name,'Customer') as label,sale_price as amount,purchase_date::text as date FROM product_sales WHERE tenant_id=$1 AND vendor_id=$2
          UNION ALL SELECT 'payment',id,vendor_id,amount,payment_date::text FROM vendor_payments WHERE tenant_id=$1 AND vendor_id=$2
          UNION ALL SELECT 'distribution',COALESCE(batch_id,id),vendor_id,SUM(COALESCE(billed_price,net_price,0)),MIN(distribution_date)::text FROM product_distribution WHERE tenant_id=$1 AND vendor_id=$2 GROUP BY COALESCE(batch_id,id),vendor_id
        ) t ORDER BY date DESC LIMIT 15`,
          [tenantId, vid],
        ),
      ]);
      const vName =
        (
          (await pool.query('SELECT name FROM vendors WHERE id=$1 AND tenant_id=$2', [vid, tenantId])).rows[0] as
            { name: string } | undefined
        )?.name || vid;
      return res.json({
        money: { collections, revenue: salesRev, distribution, expenses: 0, outstanding, invoiceOutstanding: 0 },
        recentActivity: activityRows.rows.map((r: Record<string, unknown>) => ({
          ...r,
          amount: Number(r.amount) || 0,
          label: r.type === 'payment' || r.type === 'distribution' ? vName : r.label,
        })),
        topVendors: [{ vendorId: vid, vendorName: vName, balance: outstanding }],
        counts: { customerMaster: 0, vendorMaster: 1, itemMaster: 0, bankMaster: 0, staffCount: 0 },
      });
    }

    const { from, to } = req.query as { from?: string; to?: string };
    const dateFilter = (col: string) => (from && to ? `AND ${col} BETWEEN $2 AND $3` : from ? `AND ${col} >= $2` : '');
    const params = (extra: unknown[]) =>
      from && to ? [tenantId, from, to, ...extra] : from ? [tenantId, from, ...extra] : [tenantId, ...extra];

    const [
      collections,
      salesRev,
      invoiceRev,
      distribution,
      expenses,
      outstanding,
      invoiceOutstanding,
      activityRows,
      vendorSummary,
      counts,
    ] = await Promise.all([
      pool
        .query(
          `SELECT COALESCE(SUM(amount),0) as v FROM vendor_payments WHERE tenant_id=$1 ${dateFilter('payment_date')}`,
          params([]),
        )
        .then(r => Number(r.rows[0].v) || 0),
      pool
        .query(
          `SELECT COALESCE(SUM(sale_price),0) as v FROM product_sales WHERE tenant_id=$1 ${dateFilter('purchase_date')}`,
          params([]),
        )
        .then(r => Number(r.rows[0].v) || 0),
      pool
        .query(
          `SELECT COALESCE(SUM(grand_total),0) as v FROM standalone_invoices WHERE tenant_id=$1 AND status!='cancelled' ${dateFilter('invoice_date')}`,
          params([]),
        )
        .then(r => Number(r.rows[0].v) || 0),
      pool
        .query(
          `SELECT COALESCE(SUM(COALESCE(pd.billed_price,pd.net_price,p.price)),0) as v FROM product_distribution pd JOIN products p ON pd.product_id=p.id AND p.tenant_id=$1 WHERE pd.tenant_id=$1 ${dateFilter('pd.distribution_date')}`,
          params([]),
        )
        .then(r => Number(r.rows[0].v) || 0),
      pool
        .query(
          `SELECT COALESCE(SUM(amount),0) as v FROM expenses WHERE tenant_id=$1 ${dateFilter('expense_date')}`,
          params([]),
        )
        .then(r => Number(r.rows[0].v) || 0),
      pool
        .query(
          `SELECT COALESCE(SUM(COALESCE(pd.billed_price,pd.net_price,p.price)),0)-COALESCE((SELECT SUM(amount) FROM vendor_payments WHERE tenant_id=$1),0) as v FROM product_distribution pd JOIN products p ON pd.product_id=p.id AND p.tenant_id=$1 WHERE pd.tenant_id=$1`,
          [tenantId],
        )
        .then(r => Number(r.rows[0].v) || 0),
      pool
        .query(
          `SELECT COALESCE(SUM(grand_total),0) as v FROM standalone_invoices WHERE tenant_id=$1 AND status NOT IN ('paid','cancelled')`,
          [tenantId],
        )
        .then(r => Number(r.rows[0].v) || 0),
      pool.query(
        `SELECT type,id,label,amount,date FROM (
        SELECT 'sale' as type,id,COALESCE(customer_name,'Customer') as label,sale_price as amount,purchase_date::text as date FROM product_sales WHERE tenant_id=$1
        UNION ALL SELECT 'invoice',id,COALESCE(customer_name,'Customer'),grand_total,invoice_date::text FROM standalone_invoices WHERE tenant_id=$1 AND status!='cancelled'
        UNION ALL SELECT 'payment',id,vendor_id,amount,payment_date::text FROM vendor_payments WHERE tenant_id=$1
        UNION ALL SELECT 'distribution',COALESCE(batch_id,id),vendor_id,SUM(COALESCE(billed_price,net_price,0)),MIN(distribution_date)::text FROM product_distribution WHERE tenant_id=$1 GROUP BY COALESCE(batch_id,id),vendor_id
        UNION ALL SELECT 'expense',id,category,amount,expense_date::text FROM expenses WHERE tenant_id=$1
      ) t ORDER BY date DESC LIMIT 15`,
        [tenantId],
      ),
      // Fix P1: vendor totals use separate CTEs to avoid row-multiplication bug
      pool.query(
        `
        WITH dist_totals AS (
          SELECT pd.vendor_id,
                 SUM(COALESCE(pd.billed_price, pd.net_price, p.price)) AS distributed
          FROM product_distribution pd
          JOIN products p ON pd.product_id = p.id AND p.tenant_id = $1
          WHERE pd.tenant_id = $1
          GROUP BY pd.vendor_id
        ),
        pay_totals AS (
          SELECT vendor_id, SUM(amount) AS paid
          FROM vendor_payments WHERE tenant_id = $1
          GROUP BY vendor_id
        )
        SELECT v.id, v.name, v.phone,
               COALESCE(d.distributed, 0) AS distributed,
               COALESCE(p.paid, 0)        AS paid
        FROM vendors v
        LEFT JOIN dist_totals d ON d.vendor_id = v.id
        LEFT JOIN pay_totals  p ON p.vendor_id = v.id
        WHERE v.tenant_id = $1 AND v.id != 'OWNER'
          AND COALESCE(d.distributed, 0) - COALESCE(p.paid, 0) > 0
        ORDER BY (COALESCE(d.distributed, 0) - COALESCE(p.paid, 0)) DESC
        LIMIT 5
      `,
        [tenantId],
      ),
      pool.query(
        `SELECT
        (SELECT COUNT(*) FROM customers   WHERE tenant_id=$1) as customers,
        (SELECT COUNT(*) FROM vendors     WHERE tenant_id=$1 AND id!='OWNER') as vendors,
        (SELECT COUNT(*) FROM products    WHERE tenant_id=$1) as items,
        (SELECT COUNT(*) FROM banks       WHERE tenant_id=$1) as banks,
        (SELECT COUNT(*) FROM staff_members WHERE tenant_id=$1) as staff`,
        [tenantId],
      ),
    ]);

    const vendorIds = [
      ...new Set(
        activityRows.rows
          .filter((r: Record<string, unknown>) => r.type === 'payment' || r.type === 'distribution')
          .map((r: Record<string, unknown>) => r.label as string),
      ),
    ];
    const vendorMap: Record<string, string> = {};
    if (vendorIds.length) {
      const vr = await pool.query('SELECT id,name FROM vendors WHERE tenant_id=$1 AND id=ANY($2)', [
        tenantId,
        vendorIds,
      ]);
      for (const v of vr.rows as { id: string; name: string }[]) vendorMap[v.id] = v.name;
    }

    const c = counts.rows[0] as Record<string, string>;
    res.json({
      money: { collections, revenue: salesRev + invoiceRev, distribution, expenses, outstanding, invoiceOutstanding },
      recentActivity: activityRows.rows.map((r: Record<string, unknown>) => ({
        ...r,
        amount: Number(r.amount) || 0,
        label: r.type === 'payment' || r.type === 'distribution' ? vendorMap[r.label as string] || r.label : r.label,
      })),
      topVendors: (
        vendorSummary.rows as { id: string; name: string; phone: string; distributed: string; paid: string }[]
      ).map(r => ({
        vendorId: r.id,
        vendorName: r.name,
        balance: Number(r.distributed) - Number(r.paid),
      })),
      counts: {
        customerMaster: Number(c.customers) || 0,
        vendorMaster: Number(c.vendors) || 0,
        itemMaster: Number(c.items) || 0,
        bankMaster: Number(c.banks) || 0,
        staffCount: Number(c.staff) || 0,
      },
    });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.get('/api/dashboard/rewards-summary', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const vid = vendorScopeId(req);
    if (req.user?.role === 'Vendor' && !vid) {
      return res.status(403).json({ error: 'Vendor account is not linked to a vendor profile.' });
    }

    const [vendorRows, productSales] = await Promise.all([
      pool.query(
        `
        SELECT v.id, v.name, v.total_sales as products_sold, v.total_reward_points
        FROM vendors v WHERE v.tenant_id = $1 ${vid ? 'AND v.id = $2' : ''} ORDER BY v.total_reward_points DESC
      `,
        vid ? [tenantId, vid] : [tenantId],
      ),
      pool.query(
        `
        SELECT p.name as product_name, COUNT(ps.id) as sold
        FROM product_sales ps JOIN products p ON ps.product_id = p.id AND p.tenant_id = $1
        WHERE ps.tenant_id = $1 ${vid ? 'AND ps.vendor_id = $2' : ''} GROUP BY p.name ORDER BY sold DESC LIMIT 5
      `,
        vid ? [tenantId, vid] : [tenantId],
      ),
    ]);

    res.json({
      vendors: (
        vendorRows.rows as { id: string; name: string; products_sold: number; total_reward_points: number }[]
      ).map(v => ({
        id: v.id,
        name: v.name,
        productsSold: Number(v.products_sold) || 0,
        rewardPoints: Number(v.total_reward_points) || 0,
      })),
      topProducts: (productSales.rows as { product_name: string; sold: number }[]).map(p => ({
        name: p.product_name,
        sold: Number(p.sold) || 0,
      })),
    });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

export default router;
