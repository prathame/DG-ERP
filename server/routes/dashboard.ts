import { Router } from 'express';
import { db } from '../db';

const router = Router();

router.get('/api/dashboard/stats', (req, res) => {
  try {
    const revenue = db.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = 'Sales'").get() as { total: number };
    const warranties = db.prepare("SELECT COUNT(*) as count FROM warranties WHERE status = 'Active'").get() as { count: number };
    const pendingClaims = db.prepare("SELECT COUNT(*) as count FROM warranties WHERE status = 'Under Claim'").get() as { count: number };
    const rewardsEarned = db.prepare("SELECT COALESCE(SUM(points), 0) as total FROM rewards WHERE type = 'Earned'").get() as { total: number };
    const totalProducts = db.prepare('SELECT COUNT(*) as count FROM products').get() as { count: number };
    const distributed = db.prepare("SELECT COUNT(*) as count FROM product_distribution WHERE status = 'Distributed'").get() as { count: number };
    const sold = db.prepare("SELECT COUNT(*) as count FROM product_distribution WHERE status = 'Sold'").get() as { count: number };
    const vendorRewards = db.prepare('SELECT COALESCE(SUM(total_reward_points), 0) as total FROM vendors').get() as { total: number };
    const withAdmin = db.prepare("SELECT COUNT(*) as count FROM product_inventory WHERE status = 'InStock'").get() as { count: number };
    const withVendors = db.prepare("SELECT COUNT(*) as count FROM product_distribution WHERE status = 'Distributed'").get() as { count: number };
    const totalInventory = db.prepare("SELECT COUNT(*) as count FROM product_inventory").get() as { count: number };
    const availableInInventory = db.prepare('SELECT COALESCE(SUM(stock), 0) as total FROM products').get() as { total: number };
    const totalBeforeDistribution = totalInventory.count;
    const today = new Date().toISOString().slice(0, 10);
    const thisMonth = today.slice(0, 7);
    const lastMonthDate = new Date(); lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);
    const lastMonth = lastMonthDate.toISOString().slice(0, 7);
    const todaySales = db.prepare("SELECT COUNT(*) as c FROM product_sales WHERE purchase_date = ?").get(today) as { c: number };
    const thisMonthSales = db.prepare("SELECT COUNT(*) as c FROM product_sales WHERE purchase_date LIKE ?").get(`${thisMonth}%`) as { c: number };
    const lastMonthSales = db.prepare("SELECT COUNT(*) as c FROM product_sales WHERE purchase_date LIKE ?").get(`${lastMonth}%`) as { c: number };
    const thisMonthRevenue = db.prepare("SELECT COALESCE(SUM(sale_price), 0) as t FROM product_sales WHERE purchase_date LIKE ?").get(`${thisMonth}%`) as { t: number };
    const lastMonthRevenue = db.prepare("SELECT COALESCE(SUM(sale_price), 0) as t FROM product_sales WHERE purchase_date LIKE ?").get(`${lastMonth}%`) as { t: number };
    const lowStockProducts = db.prepare(`
      SELECT p.id, p.name, COUNT(pi.id) as stock FROM products p
      LEFT JOIN product_inventory pi ON pi.product_id = p.id AND pi.status = 'InStock'
      GROUP BY p.id HAVING stock < 10 ORDER BY stock ASC LIMIT 5
    `).all() as { id: string; name: string; stock: number }[];
    const topProducts = db.prepare(`
      SELECT p.name, COUNT(ps.id) as sold FROM product_sales ps JOIN products p ON ps.product_id = p.id
      GROUP BY ps.product_id ORDER BY sold DESC LIMIT 5
    `).all() as { name: string; sold: number }[];
    const expiringWarranties = db.prepare(`
      SELECT COUNT(*) as c FROM warranties WHERE status = 'Active' AND expiry_date BETWEEN ? AND date(?, '+30 days')
    `).get(today, today) as { c: number };
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
    res.status(500).json({ error: String(err) });
  }
});

router.get('/api/dashboard/chart', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT strftime('%m', date) as month_num, strftime('%Y', date) as year, type, SUM(amount) as total
      FROM transactions
      WHERE date >= date('now', '-6 months')
      GROUP BY year, month_num, type
    `).all() as { month_num: string; year: string; type: string; total: number }[];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const byMonth: Record<string, { sales: number; claims: number }> = {};
    for (const r of rows) {
      const key = `${r.year}-${r.month_num}`;
      if (!byMonth[key]) byMonth[key] = { sales: 0, claims: 0 };
      if (r.type === 'Sales') byMonth[key].sales += r.total;
      else if (r.type === 'Purchase') byMonth[key].claims += r.total;
    }
    const sorted = Object.entries(byMonth).sort((a, b) => a[0].localeCompare(b[0])).slice(-6);
    let chartData = sorted.map(([k, v]) => {
      const [, m] = k.split('-');
      return { name: monthNames[parseInt(m, 10) - 1], sales: Math.round(v.sales), claims: Math.round(v.claims) };
    });
    if (chartData.length === 0) {
      chartData = [{ name: 'N/A', sales: 0, claims: 0 }];
    }
    res.json(chartData);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get('/api/dashboard/rewards-summary', (_req, res) => {
  try {
    const rows = db.prepare(`
      SELECT v.id, v.name, v.total_sales as products_sold, v.total_reward_points
      FROM vendors v
      ORDER BY v.total_reward_points DESC
    `).all() as { id: string; name: string; products_sold: number; total_reward_points: number }[];
    const categorySales = db.prepare(`
      SELECT p.category_id, c.name as category_name, COUNT(ps.id) as sold
      FROM product_sales ps
      JOIN products p ON ps.product_id = p.id
      LEFT JOIN categories c ON p.category_id = c.id
      GROUP BY p.category_id, c.name
    `).all() as { category_id: string | null; category_name: string | null; sold: number }[];
    res.json({
      vendorSummaries: rows.map((r) => ({
        vendorId: r.id,
        vendorName: r.name,
        productsSold: r.products_sold,
        totalRewardPoints: r.total_reward_points,
      })),
      categoryWiseSales: categorySales.map((c) => ({
        categoryId: c.category_id,
        categoryName: c.category_name ?? 'Uncategorized',
        sold: c.sold,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get('/api/dashboard/vendor/:vendorId', (req, res) => {
  try {
    const { vendorId } = req.params;
    const vendor = db.prepare('SELECT * FROM vendors WHERE id = ?').get(vendorId) as Record<string, unknown> | undefined;
    if (!vendor) return res.status(404).json({ error: 'Vendor not found' });
    const assigned = db.prepare(`
      SELECT pd.*, p.name as product_name, p.reward_points_value
      FROM product_distribution pd
      JOIN products p ON pd.product_id = p.id
      WHERE pd.vendor_id = ? AND pd.status = 'Distributed'
    `).all(vendorId) as Record<string, unknown>[];
    const sales = db.prepare(`
      SELECT ps.*, p.name as product_name
      FROM product_sales ps
      JOIN products p ON ps.product_id = p.id
      WHERE ps.vendor_id = ?
      ORDER BY ps.purchase_date DESC
    `).all(vendorId) as Record<string, unknown>[];
    const categorySales = db.prepare(`
      SELECT p.category_id, c.name as category_name, COUNT(ps.id) as sold
      FROM product_sales ps
      JOIN products p ON ps.product_id = p.id
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE ps.vendor_id = ?
      GROUP BY p.category_id, c.name
    `).all(vendorId) as { category_id: string | null; category_name: string | null; sold: number }[];
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
        categoryName: c.category_name ?? 'Uncategorized',
        sold: c.sold,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
