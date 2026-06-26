import { Router } from 'express';
import { pool } from '../pg-db';

const router = Router();

router.get('/api/dashboard/stats', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const revenue = (await pool.query("SELECT COALESCE(SUM(sale_price), 0) as total FROM product_sales WHERE tenant_id = $1", [tenantId])).rows[0] as { total: number };
    const warranties = (await pool.query("SELECT COUNT(*) as count FROM warranties WHERE status = 'Active' AND tenant_id = $1", [tenantId])).rows[0] as { count: number };
    const pendingClaims = (await pool.query("SELECT COUNT(*) as count FROM warranties WHERE status = 'Under Claim' AND tenant_id = $1", [tenantId])).rows[0] as { count: number };
    const rewardsEarned = (await pool.query("SELECT COALESCE(SUM(points), 0) as total FROM rewards WHERE type = 'Earned' AND tenant_id = $1", [tenantId])).rows[0] as { total: number };
    const totalProducts = (await pool.query('SELECT COUNT(*) as count FROM products WHERE tenant_id = $1', [tenantId])).rows[0] as { count: number };
    const distributed = (await pool.query("SELECT COUNT(*) as count FROM product_distribution WHERE status = 'Distributed' AND tenant_id = $1", [tenantId])).rows[0] as { count: number };
    const sold = (await pool.query("SELECT COUNT(*) as count FROM product_distribution WHERE status = 'Sold' AND tenant_id = $1", [tenantId])).rows[0] as { count: number };
    const vendorRewards = (await pool.query('SELECT COALESCE(SUM(total_reward_points), 0) as total FROM vendors WHERE tenant_id = $1', [tenantId])).rows[0] as { total: number };
    const withAdmin = (await pool.query("SELECT COUNT(*) as count FROM product_inventory WHERE status = 'InStock' AND tenant_id = $1", [tenantId])).rows[0] as { count: number };
    const withVendors = (await pool.query("SELECT COUNT(*) as count FROM product_distribution WHERE status = 'Distributed' AND tenant_id = $1", [tenantId])).rows[0] as { count: number };
    const totalInventory = (await pool.query("SELECT COUNT(*) as count FROM product_inventory WHERE tenant_id = $1", [tenantId])).rows[0] as { count: number };
    const availableInInventory = (await pool.query('SELECT COALESCE(SUM(stock), 0) as total FROM products WHERE tenant_id = $1', [tenantId])).rows[0] as { total: number };
    const totalBeforeDistribution = totalInventory.count;

    const today = new Date().toISOString().slice(0, 10);
    const thisMonth = today.slice(0, 7);
    const lastMonthDate = new Date(); lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);
    const lastMonth = lastMonthDate.toISOString().slice(0, 7);

    const todaySales = (await pool.query("SELECT COUNT(*) as c FROM product_sales WHERE purchase_date = $1 AND tenant_id = $2", [today, tenantId])).rows[0] as { c: number };
    const thisMonthSales = (await pool.query("SELECT COUNT(*) as c FROM product_sales WHERE to_char(purchase_date, 'YYYY-MM') = $1 AND tenant_id = $2", [thisMonth, tenantId])).rows[0] as { c: number };
    const lastMonthSales = (await pool.query("SELECT COUNT(*) as c FROM product_sales WHERE to_char(purchase_date, 'YYYY-MM') = $1 AND tenant_id = $2", [lastMonth, tenantId])).rows[0] as { c: number };
    const thisMonthRevenue = (await pool.query("SELECT COALESCE(SUM(sale_price), 0) as t FROM product_sales WHERE to_char(purchase_date, 'YYYY-MM') = $1 AND tenant_id = $2", [thisMonth, tenantId])).rows[0] as { t: number };
    const lastMonthRevenue = (await pool.query("SELECT COALESCE(SUM(sale_price), 0) as t FROM product_sales WHERE to_char(purchase_date, 'YYYY-MM') = $1 AND tenant_id = $2", [lastMonth, tenantId])).rows[0] as { t: number };

    const lowStockProducts = (await pool.query(`
      SELECT p.id, p.name, COUNT(pi.id) as stock FROM products p
      LEFT JOIN product_inventory pi ON pi.product_id = p.id AND pi.status = 'InStock' AND pi.tenant_id = $1
      WHERE p.tenant_id = $1
      GROUP BY p.id HAVING COUNT(pi.id) < 10 ORDER BY COUNT(pi.id) ASC LIMIT 5
    `, [tenantId])).rows as { id: string; name: string; stock: number }[];

    const topProducts = (await pool.query(`
      SELECT p.name, COUNT(ps.id) as sold FROM product_sales ps JOIN products p ON ps.product_id = p.id AND p.tenant_id = $1
      WHERE ps.tenant_id = $1
      GROUP BY ps.product_id, p.name ORDER BY sold DESC LIMIT 5
    `, [tenantId])).rows as { name: string; sold: number }[];

    const expiringWarranties = (await pool.query(`
      SELECT COUNT(*) as c FROM warranties WHERE status = 'Active' AND expiry_date BETWEEN $1 AND (CAST($1 AS DATE) + INTERVAL '30 days') AND tenant_id = $2
    `, [today, tenantId])).rows[0] as { c: number };

    res.json({
      totalRevenue: revenue.total,
      activeWarranties: warranties.count,
      pendingClaims: pendingClaims.count,
      rewardPointsIssued: rewardsEarned.total,
      totalProducts: totalProducts.count,
      productsDistributed: distributed.count,
      productsSold: sold.count,
      vendorRewardPoints: vendorRewards.total,
      availableInInventory: availableInInventory.total,
      withAdmin: withAdmin.count,
      withVendors: withVendors.count,
      totalBeforeDistribution: totalBeforeDistribution,
      todaySales: todaySales.c,
      thisMonthSales: thisMonthSales.c,
      lastMonthSales: lastMonthSales.c,
      thisMonthRevenue: thisMonthRevenue.t,
      lastMonthRevenue: lastMonthRevenue.t,
      lowStockProducts,
      topProducts,
      expiringWarranties: expiringWarranties.c,
    });
  } catch (err) {
    console.error('[API Error]', req.path, err); res.status(500).json({ error: 'Internal server error' });
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
    console.error('[API Error]', req.path, err); res.status(500).json({ error: 'Internal server error' });
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
    console.error('[API Error]', req.path, err); res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
