import { Router } from 'express';
import { db } from '../db';
import { parsePagination, applyDateFilter } from '../utils/helpers';

const router = Router();

router.get('/api/warranties', (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    db.prepare("UPDATE warranties SET status = 'Expired' WHERE expiry_date < ? AND status != 'Expired'").run(today);
    const { search, status, vendorId } = req.query;
    let sql = 'SELECT w.*, p.name as product_name FROM warranties w LEFT JOIN products p ON w.product_id = p.id';
    if (typeof vendorId === 'string' && vendorId) {
      sql += ' WHERE w.barcode IN (SELECT barcode FROM product_sales WHERE vendor_id = ?)';
    } else {
      sql += ' WHERE 1=1';
    }
    const params: (string | number)[] = [];
    if (typeof vendorId === 'string' && vendorId) params.push(vendorId);
    if (typeof search === 'string' && search) {
      sql += ' AND (w.barcode LIKE ? OR w.customer_name LIKE ? OR p.name LIKE ? OR p.barcode = ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, search);
    }
    if (typeof status === 'string' && status && status !== 'All Status') {
      sql += ' AND w.status = ?';
      params.push(status);
    }
    sql += applyDateFilter(req.query as Record<string, unknown>, 'w.activation_date', params);
    const { limit, offset, page } = parsePagination(req.query as Record<string, unknown>);
    const countSql = sql.replace('SELECT w.*, p.name as product_name FROM', 'SELECT COUNT(*) as c FROM');
    const total = (db.prepare(countSql).get(...params) as { c: number }).c;
    sql += ' ORDER BY w.activation_date DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    const rows = db.prepare(sql).all(...params);
    const warranties = rows.map((r: Record<string, unknown>) => ({
      id: r.id, productId: r.product_id, productName: r.product_name ?? null, barcode: r.barcode,
      replacedBarcode: r.replaced_barcode ?? null, customerName: r.customer_name, customerPhone: r.customer_phone,
      activationDate: r.activation_date, expiryDate: r.expiry_date, status: r.status,
    }));
    res.json({ data: warranties, total, page, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post('/api/warranties', (req, res) => {
  try {
    let { barcode, customerName, customerPhone } = req.body;
    if (!barcode) return res.status(400).json({ error: 'Barcode is required' });
    const id = `W${Date.now()}`;
    const activationDate = new Date().toISOString().slice(0, 10);
    const product = db.prepare('SELECT id, warranty_months FROM products WHERE barcode = ?').get(barcode) as { id: string; warranty_months: number } | undefined;
    const warrantyMonths = product?.warranty_months ?? 24;
    const expiryDate = new Date();
    expiryDate.setMonth(expiryDate.getMonth() + warrantyMonths);
    const expiryStr = expiryDate.toISOString().slice(0, 10);
    const productId = product?.id ?? '1';
    const stmt = db.prepare(`
      INSERT INTO warranties (id, product_id, barcode, customer_name, customer_phone, activation_date, expiry_date, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'Active')
    `);
    stmt.run(id, productId, barcode, customerName, customerPhone, activationDate, expiryStr);
    const row = db.prepare('SELECT * FROM warranties WHERE id = ?').get(id) as Record<string, unknown>;
    res.status(201).json({
      id: row.id,
      productId: row.product_id,
      barcode: row.barcode,
      customerName: row.customer_name,
      customerPhone: row.customer_phone,
      activationDate: row.activation_date,
      expiryDate: row.expiry_date,
      status: row.status,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.put('/api/warranties/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { customerName, customerPhone, status, replacedBarcode } = req.body;
    const effectiveStatus = status === 'Expired' ? undefined : status;
    const updates: string[] = ['customer_name = COALESCE(?, customer_name)', 'customer_phone = COALESCE(?, customer_phone)', 'status = COALESCE(?, status)'];
    const params: unknown[] = [customerName, customerPhone, effectiveStatus];
    if (replacedBarcode !== undefined) {
      updates.push('replaced_barcode = ?');
      params.push(replacedBarcode || null);
    }
    params.push(id);
    const stmt = db.prepare(`UPDATE warranties SET ${updates.join(', ')} WHERE id = ?`);
    const result = stmt.run(...params);
    if (result.changes === 0) return res.status(404).json({ error: 'Warranty not found' });
    const row = db.prepare('SELECT * FROM warranties WHERE id = ?').get(id) as Record<string, unknown>;
    // When replacedBarcode is set, create a product_replacements record
    if (replacedBarcode && typeof replacedBarcode === 'string' && replacedBarcode.trim()) {
      try {
        const w = row as { barcode: string; product_id: string; customer_name: string; customer_phone: string; activation_date?: string };
        const prod = db.prepare('SELECT name FROM products WHERE id = ?').get(w.product_id) as { name: string } | undefined;
        const sale = db.prepare('SELECT vendor_id FROM product_sales WHERE barcode = ?').get(w.barcode) as { vendor_id: string } | undefined;
        const dist = db.prepare('SELECT vendor_id FROM product_distribution WHERE barcode = ?').get(w.barcode) as { vendor_id: string } | undefined;
        const repVendorId = sale?.vendor_id ?? dist?.vendor_id ?? 'OWNER';
        const repId = `REP${Date.now()}-${id}`;
        const replacedDate = new Date().toISOString().slice(0, 10);
        db.prepare(`
          INSERT INTO product_replacements (id, old_barcode, new_barcode, warranty_id, product_id, product_name, customer_name, customer_phone, replaced_date, reason, vendor_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(repId, w.barcode, replacedBarcode.trim(), id, w.product_id, prod?.name ?? null, w.customer_name, w.customer_phone, replacedDate, 'Warranty claim', repVendorId);
        try {
          db.prepare("UPDATE product_distribution SET status = 'Damaged' WHERE barcode = ?").run(w.barcode);
          db.prepare("UPDATE product_distribution SET status = 'Replaced' WHERE barcode = ?").run(replacedBarcode.trim());
          if (repVendorId === 'OWNER') db.prepare("UPDATE product_inventory SET status = 'Sold' WHERE barcode = ?").run(replacedBarcode.trim());
        } catch (_) {}
      } catch (_) {}
    }
    res.json({
      id: row.id,
      productId: row.product_id,
      barcode: row.barcode,
      replacedBarcode: row.replaced_barcode ?? null,
      customerName: row.customer_name,
      customerPhone: row.customer_phone,
      activationDate: row.activation_date,
      expiryDate: row.expiry_date,
      status: row.status,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.delete('/api/warranties/:id', (req, res) => {
  try {
    const { id } = req.params;
    const stmt = db.prepare('DELETE FROM warranties WHERE id = ?');
    const result = stmt.run(id);
    if (result.changes === 0) return res.status(404).json({ error: 'Warranty not found' });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
