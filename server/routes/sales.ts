import { Router } from 'express';
import { db } from '../db';
import { parsePagination, applyDateFilter, logAudit } from '../utils/helpers';

const router = Router();

// ============ SALES ENTRY (validate barcode: distributed to vendor OR in inventory = Owner sale) ============
router.get('/api/sales/validate/:barcode', (req, res) => {
  try {
    const { barcode } = req.params;
    const restrictToVendorId = typeof req.query.vendorId === 'string' ? req.query.vendorId : null;
    // 1. Check if distributed to vendor (available for sale)
    const dist = db.prepare(`
      SELECT pd.*, p.name as product_name, p.reward_points_value, p.price, v.name as vendor_name
      FROM product_distribution pd
      JOIN products p ON pd.product_id = p.id
      JOIN vendors v ON pd.vendor_id = v.id
      WHERE pd.barcode = ? AND pd.status = 'Distributed'
    `).get(barcode) as Record<string, unknown> | undefined;
    if (dist) {
      if (restrictToVendorId && dist.vendor_id !== restrictToVendorId) return res.json({ valid: false, error: 'Barcode not assigned to your vendor' });
      return res.json({
        valid: true,
        productId: dist.product_id,
        productName: dist.product_name,
        vendorId: dist.vendor_id,
        vendorName: dist.vendor_name,
        barcode,
        rewardPointsValue: dist.reward_points_value ?? 0,
        price: dist.price ?? 0,
      });
    }
    // 2. Already sold or returned (in distribution but not Distributed)
    const assigned = db.prepare('SELECT vendor_id FROM product_distribution WHERE barcode = ?').get(barcode) as { vendor_id: string } | undefined;
    if (assigned) return res.json({ valid: false, error: 'Product already sold or returned' });
    // 3. Check if in inventory (Owner sale - not distributed to any vendor). Vendor users cannot sell Owner inventory.
    if (restrictToVendorId) return res.json({ valid: false, error: 'Barcode not assigned to your vendor' });
    const inv = db.prepare(`
      SELECT pi.product_id, p.name as product_name, p.reward_points_value, p.price
      FROM product_inventory pi
      JOIN products p ON pi.product_id = p.id
      WHERE pi.barcode = ? AND pi.status = 'InStock'
    `).get(barcode) as { product_id: string; product_name: string; reward_points_value: number; price: number } | undefined;
    if (inv) {
      return res.json({
        valid: true,
        productId: inv.product_id,
        productName: inv.product_name,
        vendorId: 'OWNER',
        vendorName: 'Owner',
        barcode,
        rewardPointsValue: inv.reward_points_value ?? 0,
        price: inv.price ?? 0,
      });
    }
    // 4. Barcode not found in inventory at all
    const exists = db.prepare('SELECT 1 FROM product_inventory WHERE barcode = ?').get(barcode);
    if (exists) return res.json({ valid: false, error: 'Product already sold or distributed' });
    return res.json({ valid: false, error: 'Barcode not found' });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post('/api/sales', (req, res) => {
  try {
    const { barcode, customerName, customerPhone, customerEmail, purchaseDate, salePrice } = req.body;
    const date = purchaseDate || new Date().toISOString().slice(0, 10);
    const id = `S${Date.now()}`;

    // Case 1: Distributed to vendor
    const dist = db.prepare(`
      SELECT pd.*, p.id as product_id, p.reward_points_value, p.warranty_months
      FROM product_distribution pd
      JOIN products p ON pd.product_id = p.id
      WHERE pd.barcode = ? AND pd.status = 'Distributed'
    `).get(barcode) as { id: string; product_id: string; vendor_id: string; reward_points_value: number; warranty_months: number } | undefined;

    // Case 2: In inventory only (Owner sale)
    const inv = !dist ? db.prepare(`
      SELECT pi.product_id, p.reward_points_value, p.warranty_months
      FROM product_inventory pi
      JOIN products p ON pi.product_id = p.id
      WHERE pi.barcode = ? AND pi.status = 'InStock'
    `).get(barcode) as { product_id: string; reward_points_value: number; warranty_months: number } | undefined : null;

    const saleData = dist
      ? { productId: dist.product_id, vendorId: dist.vendor_id, points: dist.reward_points_value ?? 0, warrantyMonths: dist.warranty_months ?? 12 }
      : inv
        ? { productId: inv.product_id, vendorId: 'OWNER', points: inv.reward_points_value ?? 0, warrantyMonths: inv.warranty_months ?? 12 }
        : null;

    if (!saleData) return res.status(400).json({ error: 'Invalid sale: barcode not found or already sold' });

    const { productId, vendorId, points, warrantyMonths } = saleData;

    const runSale = db.transaction(() => {
      // Find or create customer - match by phone AND name to avoid merging different people
      const phoneNorm = String(customerPhone ?? '').trim();
      const existingCustomer = phoneNorm
        ? db.prepare("SELECT id FROM customers WHERE TRIM(COALESCE(phone, '')) = ? AND TRIM(COALESCE(name, '')) = ?").get(phoneNorm, String(customerName ?? '').trim()) as { id: string } | undefined
        : undefined;
      let customerId: string;
      if (existingCustomer) {
        customerId = existingCustomer.id;
        db.prepare('UPDATE customers SET vendor_id = COALESCE(vendor_id, ?) WHERE id = ?').run(vendorId, customerId);
      } else {
        customerId = `C${Date.now()}`;
        db.prepare('INSERT INTO customers (id, name, phone, email, address, vendor_id) VALUES (?, ?, ?, ?, ?, ?)')
          .run(customerId, customerName, customerPhone, customerEmail || null, null, vendorId);
      }
      const priceVal = salePrice !== undefined && salePrice !== '' ? parseFloat(String(salePrice)) : null;
      db.prepare(`
        INSERT INTO product_sales (id, barcode, product_id, vendor_id, customer_id, customer_name, customer_phone, customer_email, purchase_date, reward_points_earned, sale_price)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, barcode, productId, vendorId, customerId, customerName, customerPhone, customerEmail || null, date, points, priceVal);
      if (dist) db.prepare("UPDATE product_distribution SET status = 'Sold' WHERE barcode = ?").run(barcode);
      db.prepare("UPDATE product_inventory SET status = 'Sold' WHERE barcode = ?").run(barcode);
      db.prepare('UPDATE vendors SET total_sales = total_sales + 1, total_reward_points = total_reward_points + ? WHERE id = ?').run(points, vendorId);
      const productName = db.prepare('SELECT name FROM products WHERE id = ?').get(productId) as { name: string } | undefined;
      const rewardId = `R${Date.now()}`;
      db.prepare(`
        INSERT INTO rewards (id, user_id, points, type, description, date, vendor_id, sale_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(rewardId, 'D1', points, 'Earned', `${productName?.name ?? 'Product'} sold`, date, vendorId, id);
      // Auto-create warranty based on product warranty_months
      const activationDate = date;
      const expiryDateObj = new Date(activationDate);
      expiryDateObj.setMonth(expiryDateObj.getMonth() + warrantyMonths);
      const expiryDate = expiryDateObj.toISOString().slice(0, 10);
      const warrantyId = `W${Date.now()}`;
      db.prepare(`
        INSERT INTO warranties (id, product_id, barcode, customer_name, customer_phone, activation_date, expiry_date, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'Active')
      `).run(warrantyId, productId, barcode, customerName, customerPhone, activationDate, expiryDate);
    });
    runSale();
    logAudit('Sale Created', 'sale', id, `Barcode: ${barcode}, Customer: ${customerName}, Price: ${salePrice ?? 'N/A'}`);
    const row = db.prepare('SELECT * FROM product_sales WHERE id = ?').get(id) as Record<string, unknown>;
    res.status(201).json({
      id: row.id,
      barcode: row.barcode,
      productId: row.product_id,
      vendorId: row.vendor_id,
      customerName: row.customer_name,
      customerPhone: row.customer_phone,
      customerEmail: row.customer_email,
      purchaseDate: row.purchase_date,
      rewardPointsEarned: row.reward_points_earned,
      salePrice: row.sale_price ?? null,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get('/api/sales', (req, res) => {
  try {
    const { vendorId } = req.query;
    const { limit, offset, page } = parsePagination(req.query as Record<string, unknown>);
    let where = 'WHERE 1=1';
    const params: unknown[] = [];
    if (typeof vendorId === 'string' && vendorId) { where += ' AND ps.vendor_id = ?'; params.push(vendorId); }
    where += applyDateFilter(req.query as Record<string, unknown>, 'ps.purchase_date', params);
    const countParams = [...params];
    const total = (db.prepare(`SELECT COUNT(*) as c FROM product_sales ps ${where}`).get(...countParams) as { c: number }).c;
    let sql = `SELECT ps.*, p.name as product_name FROM product_sales ps JOIN products p ON ps.product_id = p.id ${where} ORDER BY ps.purchase_date DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);
    const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
    res.json({
      data: rows.map((r) => ({
        id: r.id, barcode: r.barcode, productId: r.product_id, productName: r.product_name, vendorId: r.vendor_id,
        customerName: r.customer_name, customerPhone: r.customer_phone, customerEmail: r.customer_email,
        purchaseDate: r.purchase_date, rewardPointsEarned: r.reward_points_earned, salePrice: r.sale_price ?? null,
      })),
      total, page, totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ============ SALES BILL ============
router.get('/api/sales/:id/bill', (req, res) => {
  try {
    const { id } = req.params;
    const sale = db.prepare(`
      SELECT ps.*, p.name as product_name, p.category_id, p.warranty_months, p.price as product_price,
             p.description as product_description, p.batch_number, p.hsn_code, p.gst_rate,
             c.name as category_name,
             v.name as vendor_name, v.contact_person as vendor_contact, v.phone as vendor_phone, v.email as vendor_email, v.address as vendor_address
      FROM product_sales ps
      JOIN products p ON ps.product_id = p.id
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN vendors v ON ps.vendor_id = v.id
      WHERE ps.id = ?
    `).get(id) as Record<string, unknown> | undefined;
    if (!sale) return res.status(404).json({ error: 'Sale not found' });
    const warranty = db.prepare('SELECT activation_date, expiry_date, status FROM warranties WHERE barcode = ? ORDER BY activation_date DESC LIMIT 1').get(sale.barcode) as { activation_date: string; expiry_date: string; status: string } | undefined;
    const company = db.prepare("SELECT name, company_name, phone, address, gst_number FROM users WHERE role IN ('Super Admin', 'Admin') ORDER BY id LIMIT 1").get() as { name: string; company_name: string | null; phone: string | null; address: string | null; gst_number: string | null } | undefined;
    res.json({
      id: sale.id,
      barcode: sale.barcode,
      productName: sale.product_name,
      productDescription: sale.product_description ?? null,
      category: sale.category_name ?? null,
      batchNumber: sale.batch_number ?? null,
      productPrice: sale.product_price ?? 0,
      salePrice: sale.sale_price ?? sale.product_price ?? 0,
      warrantyMonths: sale.warranty_months ?? 12,
      customerName: sale.customer_name,
      customerPhone: sale.customer_phone,
      customerEmail: sale.customer_email ?? null,
      purchaseDate: sale.purchase_date,
      rewardPointsEarned: sale.reward_points_earned ?? 0,
      vendor: {
        name: sale.vendor_name ?? 'Owner',
        contactPerson: sale.vendor_contact ?? null,
        phone: sale.vendor_phone ?? null,
        email: sale.vendor_email ?? null,
        address: sale.vendor_address ?? null,
      },
      warranty: warranty ? {
        activationDate: warranty.activation_date,
        expiryDate: warranty.expiry_date,
        status: warranty.status,
      } : null,
      hsnCode: sale.hsn_code ?? null,
      gstRate: Number(sale.gst_rate) || 18,
      company: {
        name: company?.company_name ?? 'Splendor',
        contactName: company?.name ?? null,
        phone: company?.phone ?? null,
        address: company?.address ?? null,
        gstNumber: company?.gst_number ?? null,
      },
      vendorFinance: (() => {
        const vid = sale.vendor_id as string;
        if (!vid || vid === 'OWNER') return null;
        const totalValue = db.prepare('SELECT COALESCE(SUM(p.price), 0) as t FROM product_distribution pd JOIN products p ON pd.product_id = p.id WHERE pd.vendor_id = ?').get(vid) as { t: number };
        const totalPaid = db.prepare('SELECT COALESCE(SUM(amount), 0) as t FROM vendor_payments WHERE vendor_id = ?').get(vid) as { t: number };
        return { totalDistributedValue: totalValue.t, totalPaid: totalPaid.t, balance: totalValue.t - totalPaid.t };
      })(),
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
