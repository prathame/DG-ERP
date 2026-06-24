import { Router } from 'express';
import { db } from '../db';

const router = Router();

router.get('/api/masters/counts', (_req, res) => {
  try {
    const customers = db.prepare('SELECT COUNT(*) as count FROM customers').get() as { count: number };
    const vendors = db.prepare('SELECT COUNT(*) as count FROM vendors').get() as { count: number };
    const products = db.prepare('SELECT COUNT(*) as count FROM products').get() as { count: number };
    const banks = db.prepare('SELECT COUNT(*) as count FROM banks').get() as { count: number };
    const categories = db.prepare('SELECT COUNT(*) as count FROM categories').get() as { count: number };
    res.json({
      customerMaster: customers.count,
      vendorMaster: vendors.count,
      itemMaster: products.count,
      bankMaster: banks.count,
      categoryMaster: categories.count,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
