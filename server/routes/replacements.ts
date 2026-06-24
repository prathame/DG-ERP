import { Router } from 'express';
import { db } from '../db';

const router = Router();

// Validate old barcode: returns vendor info (sold or distributed by which vendor)
router.get('/api/replacements/validate-old/:barcode', (req, res) => {
  try {
    const { barcode } = req.params;
    const restrictToVendorId = typeof req.query.vendorId === 'string' ? req.query.vendorId : null;
    const sale = db.prepare(`
      SELECT ps.vendor_id, ps.product_id, ps.customer_name, ps.customer_phone, ps.customer_email, v.name as vendor_name
      FROM product_sales ps
      JOIN vendors v ON ps.vendor_id = v.id
      WHERE ps.barcode = ?
    `).get(barcode) as { vendor_id: string; product_id: string; vendor_name: string; customer_name: string; customer_phone: string; customer_email: string | null } | undefined;
    if (sale) {
      if (restrictToVendorId && sale.vendor_id !== restrictToVendorId) return res.json({ valid: false, error: 'Old barcode was sold by another vendor' });
      const prod = db.prepare('SELECT name FROM products WHERE id = ?').get(sale.product_id) as { name: string } | undefined;
      return res.json({
        valid: true,
        vendorId: sale.vendor_id,
        vendorName: sale.vendor_name,
        productId: sale.product_id,
        productName: prod?.name ?? null,
        customerName: sale.customer_name ?? '',
        customerPhone: sale.customer_phone ?? '',
        customerEmail: sale.customer_email ?? '',
      });
    }
    const dist = db.prepare(`
      SELECT pd.vendor_id, pd.product_id, v.name as vendor_name
      FROM product_distribution pd
      JOIN vendors v ON pd.vendor_id = v.id
      WHERE pd.barcode = ?
    `).get(barcode) as { vendor_id: string; product_id: string; vendor_name: string } | undefined;
    if (dist) {
      if (restrictToVendorId && dist.vendor_id !== restrictToVendorId) return res.json({ valid: false, error: 'Old barcode is assigned to another vendor' });
      const prod = db.prepare('SELECT name FROM products WHERE id = ?').get(dist.product_id) as { name: string } | undefined;
      return res.json({ valid: true, vendorId: dist.vendor_id, vendorName: dist.vendor_name, productId: dist.product_id, productName: prod?.name ?? null, customerName: '', customerPhone: '', customerEmail: '' });
    }
    return res.json({ valid: false, error: 'Old barcode not found (not sold or distributed)' });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Validate new barcode: must be allocated to vendor (Distributed) for replacement
router.get('/api/replacements/validate-new/:barcode', (req, res) => {
  try {
    const { barcode } = req.params;
    const vendorId = typeof req.query.vendorId === 'string' ? req.query.vendorId : null;
    if (!vendorId) return res.json({ valid: false, error: 'Vendor context required. Verify old barcode first.' });
    const dist = db.prepare(`
      SELECT pd.vendor_id, pd.product_id, v.name as vendor_name, p.name as product_name
      FROM product_distribution pd
      JOIN vendors v ON pd.vendor_id = v.id
      JOIN products p ON pd.product_id = p.id
      WHERE pd.barcode = ? AND pd.status = 'Distributed'
    `).get(barcode) as { vendor_id: string; product_id: string; vendor_name: string; product_name: string } | undefined;
    if (dist) {
      if (dist.vendor_id !== vendorId) return res.json({ valid: false, error: `New barcode is allocated to ${dist.vendor_name}, not your vendor` });
      return res.json({ valid: true, vendorId: dist.vendor_id, vendorName: dist.vendor_name, productId: dist.product_id, productName: dist.product_name });
    }
    const assigned = db.prepare('SELECT vendor_id FROM product_distribution WHERE barcode = ?').get(barcode) as { vendor_id: string } | undefined;
    if (assigned) return res.json({ valid: false, error: 'New barcode already sold or returned' });
    if (vendorId === 'OWNER') {
      const inv = db.prepare('SELECT pi.product_id, p.name FROM product_inventory pi JOIN products p ON pi.product_id = p.id WHERE pi.barcode = ? AND pi.status = ?').get(barcode, 'InStock') as { product_id: string; name: string } | undefined;
      if (inv) return res.json({ valid: true, vendorId: 'OWNER', vendorName: 'Owner', productId: inv.product_id, productName: inv.name });
    }
    return res.json({ valid: false, error: 'New barcode not allocated to your vendor. It must be distributed to you and available (status: Distributed).' });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get('/api/replacements', (req, res) => {
  try {
    const vendorId = req.query.vendorId as string | undefined;
    let sql = `
      SELECT r.id, r.old_barcode, r.new_barcode, r.warranty_id, r.product_id, r.product_name,
             r.customer_name, r.customer_phone, r.replaced_date, r.reason, r.created_at, r.vendor_id,
             v.name as vendor_name
      FROM product_replacements r
      LEFT JOIN vendors v ON r.vendor_id = v.id
    `;
    const params: unknown[] = [];
    if (vendorId) {
      sql += ` WHERE (r.vendor_id = ? OR (r.vendor_id IS NULL AND (
        EXISTS (SELECT 1 FROM product_sales ps WHERE ps.barcode = r.old_barcode AND ps.vendor_id = ?)
        OR EXISTS (SELECT 1 FROM product_distribution pd WHERE pd.barcode = r.old_barcode AND pd.vendor_id = ?)
      )))`;
      params.push(vendorId, vendorId, vendorId);
    }
    sql += ' ORDER BY r.replaced_date DESC, r.created_at DESC';
    const stmt = db.prepare(sql);
    const rows = stmt.all(...params);
    const replacements = rows.map((r: Record<string, unknown>) => ({
      id: r.id,
      oldBarcode: r.old_barcode,
      newBarcode: r.new_barcode,
      warrantyId: r.warranty_id ?? null,
      productId: r.product_id ?? null,
      productName: r.product_name ?? null,
      vendorId: r.vendor_id ?? null,
      vendorName: r.vendor_name ?? null,
      customerName: r.customer_name,
      customerPhone: r.customer_phone,
      replacedDate: r.replaced_date,
      reason: r.reason ?? null,
      createdAt: r.created_at,
    }));
    res.json(replacements);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post('/api/replacements', (req, res) => {
  try {
    const { oldBarcode, newBarcode, warrantyId, customerName, customerPhone, replacedDate, reason } = req.body;
    const restrictToVendorId = typeof req.body.vendorId === 'string' ? req.body.vendorId : null;
    if (!oldBarcode || !newBarcode || !customerName || !customerPhone) {
      return res.status(400).json({ error: 'oldBarcode, newBarcode, customerName, customerPhone are required' });
    }
    const sale = db.prepare('SELECT product_id, vendor_id FROM product_sales WHERE barcode = ?').get(oldBarcode) as { product_id: string; vendor_id: string } | undefined;
    const distOld = db.prepare('SELECT product_id, vendor_id FROM product_distribution WHERE barcode = ?').get(oldBarcode) as { product_id: string; vendor_id: string } | undefined;
    const vendorId = sale?.vendor_id ?? distOld?.vendor_id ?? null;
    if (!vendorId) return res.status(400).json({ error: 'Old barcode not found (not sold or distributed)' });
    if (restrictToVendorId && vendorId !== restrictToVendorId) return res.status(400).json({ error: 'Old barcode belongs to another vendor' });
    const distNew = db.prepare('SELECT vendor_id FROM product_distribution WHERE barcode = ? AND status = ?').get(newBarcode, 'Distributed') as { vendor_id: string } | undefined;
    const invNew = vendorId === 'OWNER' ? db.prepare('SELECT 1 FROM product_inventory WHERE barcode = ? AND status = ?').get(newBarcode, 'InStock') : null;
    const newValid = distNew?.vendor_id === vendorId || (vendorId === 'OWNER' && invNew);
    if (!newValid) return res.status(400).json({ error: 'New barcode is not allocated to the same vendor. Verify new barcode before saving.' });
    const id = `REP${Date.now()}`;
    const date = replacedDate || new Date().toISOString().slice(0, 10);
    const productId = sale?.product_id ?? distOld?.product_id ?? null;
    const prod = productId ? db.prepare('SELECT name FROM products WHERE id = ?').get(productId) as { name: string } | undefined : null;
    const insertCols = 'id, old_barcode, new_barcode, warranty_id, product_id, product_name, customer_name, customer_phone, replaced_date, reason, vendor_id';
    db.prepare(`INSERT INTO product_replacements (${insertCols}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, oldBarcode, newBarcode, warrantyId || null, productId, prod?.name ?? null, customerName, customerPhone, date, reason || null, vendorId);
    // Mark old barcode as Damaged, new barcode as Replaced (vendor stock reduced)
    try {
      db.prepare("UPDATE product_distribution SET status = 'Damaged' WHERE barcode = ?").run(oldBarcode);
      db.prepare("UPDATE product_distribution SET status = 'Replaced' WHERE barcode = ?").run(newBarcode);
      if (vendorId === 'OWNER') db.prepare("UPDATE product_inventory SET status = 'Sold' WHERE barcode = ?").run(newBarcode);
    } catch (_) {}
    const row = db.prepare('SELECT r.*, v.name as vendor_name FROM product_replacements r LEFT JOIN vendors v ON r.vendor_id = v.id WHERE r.id = ?').get(id) as Record<string, unknown>;
    res.status(201).json({
      id: row.id,
      oldBarcode: row.old_barcode,
      newBarcode: row.new_barcode,
      warrantyId: row.warranty_id ?? null,
      productId: row.product_id ?? null,
      productName: row.product_name ?? null,
      vendorId: row.vendor_id ?? null,
      vendorName: row.vendor_name ?? null,
      customerName: row.customer_name,
      customerPhone: row.customer_phone,
      replacedDate: row.replaced_date,
      reason: row.reason ?? null,
      createdAt: row.created_at,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
