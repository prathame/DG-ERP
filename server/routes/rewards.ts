import { Router } from 'express';
import { db } from '../db';

const router = Router();

// ============ REDEMPTION SETTINGS ============
router.get('/api/redemption-settings', (_req, res) => {
  try {
    const row = db.prepare('SELECT min_balance, min_points FROM redemption_settings WHERE id = ?').get('default') as { min_balance: number; min_points: number } | undefined;
    res.json({ minBalance: row?.min_balance ?? 100, minPoints: row?.min_points ?? 50 });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.put('/api/redemption-settings', (req, res) => {
  try {
    const { minBalance, minPoints } = req.body;
    const mb = Math.max(0, parseInt(String(minBalance), 10) || 0);
    const mp = Math.max(1, parseInt(String(minPoints), 10) || 1);
    db.prepare('INSERT OR REPLACE INTO redemption_settings (id, min_balance, min_points) VALUES (?, ?, ?)').run('default', mb, mp);
    const row = db.prepare('SELECT min_balance, min_points FROM redemption_settings WHERE id = ?').get('default') as { min_balance: number; min_points: number };
    res.json({ minBalance: row.min_balance, minPoints: row.min_points });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ============ REWARDS ============
router.get('/api/rewards', (req, res) => {
  try {
    const { type, vendorId } = req.query;
    let sql = 'SELECT * FROM rewards';
    const params: (string | number)[] = [];
    const conditions: string[] = [];
    if (typeof type === 'string' && type && type !== 'All') {
      conditions.push('type = ?');
      params.push(type);
    }
    if (typeof vendorId === 'string' && vendorId) {
      conditions.push('vendor_id = ?');
      params.push(vendorId);
    } else {
      conditions.push('vendor_id IS NULL');
    }
    if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY date DESC';
    const rows = (conditions.length ? db.prepare(sql).all(...params) : db.prepare(sql).all()) as Record<string, unknown>[];
    const rewards = rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      points: r.points,
      type: r.type,
      description: r.description,
      date: r.date,
    }));
    res.json(rewards);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get('/api/rewards/balance', (req, res) => {
  try {
    const earned = db.prepare("SELECT COALESCE(SUM(points), 0) as total FROM rewards WHERE type = 'Earned'").get() as { total: number };
    const redeemed = db.prepare("SELECT COALESCE(SUM(points), 0) as total FROM rewards WHERE type = 'Redeemed'").get() as { total: number };
    res.json({ balance: earned.total - redeemed.total });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post('/api/rewards', (req, res) => {
  try {
    const { userId, points, type, description, vendorId } = req.body;
    const ptsToInsert = Math.max(0, parseInt(String(points), 10) || 0);
    const isVendorRedemption = type === 'Redeemed' && typeof vendorId === 'string' && vendorId;
    if (type === 'Redeemed') {
      const settings = db.prepare('SELECT min_balance, min_points FROM redemption_settings WHERE id = ?').get('default') as { min_balance: number; min_points: number } | undefined;
      const minBal = settings?.min_balance ?? 100;
      const minPts = settings?.min_points ?? 50;
      let balance: number;
      if (isVendorRedemption) {
        const v = db.prepare('SELECT total_reward_points FROM vendors WHERE id = ?').get(vendorId) as { total_reward_points: number } | undefined;
        if (!v) return res.status(400).json({ error: 'Vendor not found' });
        balance = v.total_reward_points ?? 0;
      } else {
        const earned = db.prepare("SELECT COALESCE(SUM(points), 0) as total FROM rewards WHERE type = 'Earned' AND (vendor_id IS NULL OR vendor_id = '')").get() as { total: number };
        const redeemed = db.prepare("SELECT COALESCE(SUM(points), 0) as total FROM rewards WHERE type = 'Redeemed' AND (vendor_id IS NULL OR vendor_id = '')").get() as { total: number };
        balance = earned.total - redeemed.total;
      }
      if (balance < minBal) return res.status(400).json({ error: `Minimum balance of ${minBal} pts required to redeem` });
      if (ptsToInsert < minPts) return res.status(400).json({ error: `Minimum ${minPts} pts per redemption` });
      if (ptsToInsert > balance) return res.status(400).json({ error: 'Insufficient balance' });
    }
    const id = `R${Date.now()}`;
    const date = new Date().toISOString().slice(0, 10);
    if (isVendorRedemption) {
      db.prepare('UPDATE vendors SET total_reward_points = total_reward_points - ? WHERE id = ?').run(ptsToInsert, vendorId);
    }
    const stmt = db.prepare(`
      INSERT INTO rewards (id, user_id, points, type, description, date, vendor_id, sale_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(id, userId ?? 'D1', ptsToInsert, type ?? 'Earned', description ?? '', date, isVendorRedemption ? vendorId : null, null);
    const row = db.prepare('SELECT * FROM rewards WHERE id = ?').get(id) as Record<string, unknown>;
    res.status(201).json({
      id: row.id,
      userId: row.user_id,
      points: row.points,
      type: row.type,
      description: row.description,
      date: row.date,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.put('/api/rewards/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { points, type, description, date } = req.body;
    const stmt = db.prepare(`
      UPDATE rewards SET
        points = COALESCE(?, points),
        type = COALESCE(?, type),
        description = COALESCE(?, description),
        date = COALESCE(?, date)
      WHERE id = ?
    `);
    const result = stmt.run(points, type, description, date, id);
    if (result.changes === 0) return res.status(404).json({ error: 'Reward not found' });
    const row = db.prepare('SELECT * FROM rewards WHERE id = ?').get(id) as Record<string, unknown>;
    res.json({
      id: row.id,
      userId: row.user_id,
      points: row.points,
      type: row.type,
      description: row.description,
      date: row.date,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.delete('/api/rewards/:id', (req, res) => {
  try {
    const { id } = req.params;
    const stmt = db.prepare('DELETE FROM rewards WHERE id = ?');
    const result = stmt.run(id);
    if (result.changes === 0) return res.status(404).json({ error: 'Reward not found' });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ============ REWARD RULES ============
router.get('/api/reward-rules', (_req, res) => {
  try {
    const rows = db.prepare(`
      SELECT rr.*, c.name as category_name FROM reward_rules rr LEFT JOIN categories c ON rr.category_id = c.id ORDER BY rr.products_sold_threshold
    `).all() as Record<string, unknown>[];
    res.json(rows.map((r) => ({
      id: r.id,
      categoryId: r.category_id,
      categoryName: r.category_name,
      productsSoldThreshold: r.products_sold_threshold,
      rewardPoints: r.reward_points,
      description: r.description,
    })));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post('/api/reward-rules', (req, res) => {
  try {
    const { categoryId, productsSoldThreshold, rewardPoints, description } = req.body;
    const id = `RR${Date.now()}`;
    db.prepare(`
      INSERT INTO reward_rules (id, category_id, products_sold_threshold, reward_points, description)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, categoryId || null, productsSoldThreshold ?? 0, rewardPoints ?? 0, description || null);
    const row = db.prepare('SELECT rr.*, c.name as category_name FROM reward_rules rr LEFT JOIN categories c ON rr.category_id = c.id WHERE rr.id = ?').get(id) as Record<string, unknown>;
    res.status(201).json({
      id: row.id,
      categoryId: row.category_id,
      categoryName: row.category_name,
      productsSoldThreshold: row.products_sold_threshold,
      rewardPoints: row.reward_points,
      description: row.description,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.put('/api/reward-rules/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { categoryId, productsSoldThreshold, rewardPoints, description } = req.body;
    const result = db.prepare(`
      UPDATE reward_rules SET
        category_id = COALESCE(?, category_id),
        products_sold_threshold = COALESCE(?, products_sold_threshold),
        reward_points = COALESCE(?, reward_points),
        description = COALESCE(?, description)
      WHERE id = ?
    `).run(categoryId, productsSoldThreshold, rewardPoints, description, id);
    if (result.changes === 0) return res.status(404).json({ error: 'Reward rule not found' });
    const row = db.prepare('SELECT rr.*, c.name as category_name FROM reward_rules rr LEFT JOIN categories c ON rr.category_id = c.id WHERE rr.id = ?').get(id) as Record<string, unknown>;
    res.json({
      id: row.id,
      categoryId: row.category_id,
      categoryName: row.category_name,
      productsSoldThreshold: row.products_sold_threshold,
      rewardPoints: row.reward_points,
      description: row.description,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.delete('/api/reward-rules/:id', (req, res) => {
  try {
    const { id } = req.params;
    const result = db.prepare('DELETE FROM reward_rules WHERE id = ?').run(id);
    if (result.changes === 0) return res.status(404).json({ error: 'Reward rule not found' });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
