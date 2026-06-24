import { Router } from 'express';
import { db } from '../db';
import { logAudit } from '../utils/helpers';

const router = Router();

// Static routes MUST come before :vendorId param routes
router.get('/api/vendor-finance/summary', (_req, res) => {
  try {
    const vendors = db.prepare(`
      SELECT v.id, v.name, v.phone,
        COALESCE((SELECT SUM(COALESCE(pd.net_price, p.price)) FROM product_distribution pd JOIN products p ON pd.product_id = p.id WHERE pd.vendor_id = v.id), 0) as total_distributed_value,
        COALESCE((SELECT SUM(amount) FROM vendor_payments WHERE vendor_id = v.id), 0) as total_paid,
        (SELECT COUNT(*) FROM product_distribution WHERE vendor_id = v.id) as units_distributed
      FROM vendors v WHERE v.id != 'OWNER' ORDER BY v.name
    `).all() as { id: string; name: string; phone: string | null; total_distributed_value: number; total_paid: number; units_distributed: number }[];
    const reminders = db.prepare('SELECT vendor_id, enabled, reminder_days, last_reminder_date FROM vendor_reminder_settings').all() as { vendor_id: string; enabled: number; reminder_days: number; last_reminder_date: string | null }[];
    const reminderMap = Object.fromEntries(reminders.map((r) => [r.vendor_id, r]));
    res.json(vendors.map((v) => {
      const rem = reminderMap[v.id];
      return {
        vendorId: v.id,
        vendorName: v.name,
        vendorPhone: v.phone ?? '',
        totalDistributedValue: v.total_distributed_value,
        totalPaid: v.total_paid,
        balance: v.total_distributed_value - v.total_paid,
        unitsDistributed: v.units_distributed,
        reminder: rem ? { enabled: !!rem.enabled, days: rem.reminder_days, lastSent: rem.last_reminder_date } : { enabled: false, days: 7, lastSent: null },
      };
    }));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get('/api/vendor-finance/reminders-due', (_req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const rows = db.prepare(`
      SELECT vrs.vendor_id, vrs.reminder_days, vrs.last_reminder_date, v.name, v.phone,
        COALESCE((SELECT SUM(COALESCE(pd.billed_price, pd.net_price, p.price)) FROM product_distribution pd JOIN products p ON pd.product_id = p.id WHERE pd.vendor_id = v.id), 0) as total_value,
        COALESCE((SELECT SUM(amount) FROM vendor_payments WHERE vendor_id = v.id), 0) as total_paid
      FROM vendor_reminder_settings vrs
      JOIN vendors v ON vrs.vendor_id = v.id
      WHERE vrs.enabled = 1
    `).all() as { vendor_id: string; reminder_days: number; last_reminder_date: string | null; name: string; phone: string | null; total_value: number; total_paid: number }[];
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
    res.status(500).json({ error: String(err) });
  }
});

router.get('/api/vendor-finance/:vendorId', (req, res) => {
  try {
    const { vendorId } = req.params;
    const vendor = db.prepare('SELECT id, name, phone, email, address, contact_person FROM vendors WHERE id = ?').get(vendorId) as Record<string, unknown> | undefined;
    if (!vendor) return res.status(404).json({ error: 'Vendor not found' });
    const totalValue = db.prepare('SELECT COALESCE(SUM(COALESCE(pd.billed_price, pd.net_price, p.price)), 0) as total FROM product_distribution pd JOIN products p ON pd.product_id = p.id WHERE pd.vendor_id = ?').get(vendorId) as { total: number };
    const totalPaid = db.prepare('SELECT COALESCE(SUM(amount), 0) as total FROM vendor_payments WHERE vendor_id = ?').get(vendorId) as { total: number };
    const payments = db.prepare('SELECT * FROM vendor_payments WHERE vendor_id = ? ORDER BY payment_date DESC').all(vendorId) as Record<string, unknown>[];
    const distributions = db.prepare(`
      SELECT pd.distribution_date, p.name as product_name, p.price as original_price, pd.discount_percent,
             COALESCE(pd.net_price, p.price) as unit_price, COUNT(*) as qty,
             SUM(COALESCE(pd.net_price, p.price)) as line_total
      FROM product_distribution pd JOIN products p ON pd.product_id = p.id
      WHERE pd.vendor_id = ?
      GROUP BY pd.distribution_date, pd.product_id, pd.discount_percent
      ORDER BY pd.distribution_date DESC
    `).all(vendorId) as { distribution_date: string; product_name: string; original_price: number; discount_percent: number; unit_price: number; qty: number; line_total: number }[];
    const reminder = db.prepare('SELECT enabled, reminder_days, last_reminder_date FROM vendor_reminder_settings WHERE vendor_id = ?').get(vendorId) as { enabled: number; reminder_days: number; last_reminder_date: string | null } | undefined;
    res.json({
      vendor: { id: vendor.id, name: vendor.name, phone: vendor.phone, email: vendor.email, address: vendor.address, contactPerson: vendor.contact_person },
      totalDistributedValue: totalValue.total,
      totalPaid: totalPaid.total,
      balance: totalValue.total - totalPaid.total,
      payments: payments.map((p) => ({
        id: p.id, amount: p.amount, paymentDate: p.payment_date, paymentMethod: p.payment_method, referenceNumber: p.reference_number, notes: p.notes, createdAt: p.created_at,
      })),
      distributions: distributions.map((d) => ({
        date: d.distribution_date, productName: d.product_name, originalPrice: d.original_price, discountPercent: d.discount_percent ?? 0, unitPrice: d.unit_price, quantity: d.qty, total: d.line_total,
      })),
      reminder: reminder ? { enabled: !!reminder.enabled, days: reminder.reminder_days, lastSent: reminder.last_reminder_date } : { enabled: false, days: 7, lastSent: null },
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post('/api/vendor-finance/:vendorId/payments', (req, res) => {
  try {
    const { vendorId } = req.params;
    const { amount, paymentDate, paymentMethod, referenceNumber, notes } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Amount must be greater than 0' });
    const vendor = db.prepare('SELECT id FROM vendors WHERE id = ?').get(vendorId);
    if (!vendor) return res.status(404).json({ error: 'Vendor not found' });
    const id = `VP${Date.now()}`;
    db.prepare('INSERT INTO vendor_payments (id, vendor_id, amount, payment_date, payment_method, reference_number, notes) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, vendorId, amount, paymentDate || new Date().toISOString().slice(0, 10), paymentMethod || 'Cash', referenceNumber || null, notes || null);
    const vendorName = (db.prepare('SELECT name FROM vendors WHERE id = ?').get(vendorId) as { name: string } | undefined)?.name ?? vendorId;
    logAudit('Payment Recorded', 'payment', id, `${vendorName} paid ₹${amount}, Method: ${paymentMethod || 'Cash'}`);
    const row = db.prepare('SELECT * FROM vendor_payments WHERE id = ?').get(id) as Record<string, unknown>;
    res.status(201).json({
      id: row.id, amount: row.amount, paymentDate: row.payment_date, paymentMethod: row.payment_method, referenceNumber: row.reference_number, notes: row.notes,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.put('/api/vendor-finance/:vendorId/reminder', (req, res) => {
  try {
    const { vendorId } = req.params;
    const { enabled, reminderDays } = req.body;
    db.prepare('INSERT OR REPLACE INTO vendor_reminder_settings (vendor_id, enabled, reminder_days) VALUES (?, ?, ?)').run(vendorId, enabled ? 1 : 0, reminderDays ?? 7);
    const row = db.prepare('SELECT * FROM vendor_reminder_settings WHERE vendor_id = ?').get(vendorId) as Record<string, unknown>;
    res.json({ enabled: !!(row.enabled), days: row.reminder_days, lastSent: row.last_reminder_date });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post('/api/vendor-finance/:vendorId/reminder-sent', (req, res) => {
  try {
    const { vendorId } = req.params;
    const today = new Date().toISOString().slice(0, 10);
    db.prepare('UPDATE vendor_reminder_settings SET last_reminder_date = ? WHERE vendor_id = ?').run(today, vendorId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
