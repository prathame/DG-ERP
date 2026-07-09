import { Router } from 'express';
import { pool } from '../pg-db';
import { uid, logAudit } from '../utils/helpers';

const router = Router();

// ============ REDEMPTION SETTINGS ============
router.get('/api/redemption-settings', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const row = (await pool.query(
      'SELECT min_balance, min_points FROM redemption_settings WHERE id = $1 AND tenant_id = $2',
      ['default', tenantId]
    )).rows[0] as { min_balance: number; min_points: number } | undefined;
    res.json({ minBalance: row?.min_balance ?? 100, minPoints: row?.min_points ?? 50 });
  } catch (err) {
    console.error('[API Error]', req.path, err); res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/api/redemption-settings', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { minBalance, minPoints } = req.body;
    const mb = Math.max(0, parseInt(String(minBalance), 10) || 0);
    const mp = Math.max(1, parseInt(String(minPoints), 10) || 1);

    await pool.query(
      `INSERT INTO redemption_settings (id, tenant_id, min_balance, min_points) VALUES ($1, $2, $3, $4)
       ON CONFLICT (id, tenant_id) DO UPDATE SET min_balance = $3, min_points = $4`,
      ['default', tenantId, mb, mp]
    );

    const row = (await pool.query(
      'SELECT min_balance, min_points FROM redemption_settings WHERE id = $1 AND tenant_id = $2',
      ['default', tenantId]
    )).rows[0] as { min_balance: number; min_points: number };
    res.json({ minBalance: row.min_balance, minPoints: row.min_points });
  } catch (err) {
    console.error('[API Error]', req.path, err); res.status(500).json({ error: 'Internal server error' });
  }
});

// ============ REWARDS ============
router.get('/api/rewards', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { type, vendorId } = req.query;
    let sql = 'SELECT * FROM rewards WHERE tenant_id = $1';
    const params: (string | number)[] = [tenantId];
    let paramIdx = 2;

    if (typeof type === 'string' && type && type !== 'All') {
      sql += ` AND type = $${paramIdx}`;
      params.push(type);
      paramIdx++;
    }
    if (typeof vendorId === 'string' && vendorId) {
      sql += ` AND vendor_id = $${paramIdx}`;
      params.push(vendorId);
      paramIdx++;
    } else {
      sql += ' AND vendor_id IS NULL';
    }

    sql += ' ORDER BY date DESC';
    const { rows } = await pool.query(sql, params);
    const rewards = rows.map((r: Record<string, unknown>) => ({
      id: r.id,
      userId: r.user_id,
      points: r.points,
      type: r.type,
      description: r.description,
      date: r.date,
    }));
    res.json(rewards);
  } catch (err) {
    console.error('[API Error]', req.path, err); res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/api/rewards/balance', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const earned = (await pool.query(
      "SELECT COALESCE(SUM(points), 0) as total FROM rewards WHERE type = 'Earned' AND tenant_id = $1",
      [tenantId]
    )).rows[0] as { total: number };
    const redeemed = (await pool.query(
      "SELECT COALESCE(SUM(points), 0) as total FROM rewards WHERE type = 'Redeemed' AND tenant_id = $1",
      [tenantId]
    )).rows[0] as { total: number };
    res.json({ balance: earned.total - redeemed.total });
  } catch (err) {
    console.error('[API Error]', req.path, err); res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/api/rewards', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { userId, points, type, description, vendorId } = req.body;
    const ptsToInsert = Math.max(0, parseInt(String(points), 10) || 0);
    const isVendorRedemption = type === 'Redeemed' && typeof vendorId === 'string' && vendorId;

    if (type === 'Redeemed') {
      const settings = (await pool.query(
        'SELECT min_balance, min_points FROM redemption_settings WHERE id = $1 AND tenant_id = $2',
        ['default', tenantId]
      )).rows[0] as { min_balance: number; min_points: number } | undefined;
      const minBal = settings?.min_balance ?? 100;
      const minPts = settings?.min_points ?? 50;

      let balance: number;
      if (isVendorRedemption) {
        const v = (await pool.query(
          'SELECT total_reward_points FROM vendors WHERE id = $1 AND tenant_id = $2',
          [vendorId, tenantId]
        )).rows[0] as { total_reward_points: number } | undefined;
        if (!v) return res.status(400).json({ error: 'Vendor not found' });
        balance = v.total_reward_points ?? 0;
      } else {
        const earned = (await pool.query(
          "SELECT COALESCE(SUM(points), 0) as total FROM rewards WHERE type = 'Earned' AND (vendor_id IS NULL OR vendor_id = '') AND tenant_id = $1",
          [tenantId]
        )).rows[0] as { total: number };
        const redeemed = (await pool.query(
          "SELECT COALESCE(SUM(points), 0) as total FROM rewards WHERE type = 'Redeemed' AND (vendor_id IS NULL OR vendor_id = '') AND tenant_id = $1",
          [tenantId]
        )).rows[0] as { total: number };
        balance = earned.total - redeemed.total;
      }
      if (balance < minBal) return res.status(400).json({ error: `Minimum balance of ${minBal} pts required to redeem` });
      if (ptsToInsert < minPts) return res.status(400).json({ error: `Minimum ${minPts} pts per redemption` });
      if (ptsToInsert > balance) return res.status(400).json({ error: 'Insufficient balance' });
    }

    const id = uid('R');
    const date = new Date().toISOString().slice(0, 10);

    if (isVendorRedemption) {
      await pool.query(
        'UPDATE vendors SET total_reward_points = total_reward_points - $1 WHERE id = $2 AND tenant_id = $3',
        [ptsToInsert, vendorId, tenantId]
      );
    }

    await pool.query(
      `INSERT INTO rewards (id, tenant_id, user_id, points, type, description, date, vendor_id, sale_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [id, tenantId, userId ?? 'D1', ptsToInsert, type ?? 'Earned', description ?? '', date, isVendorRedemption ? vendorId : null, null]
    );

    const row = (await pool.query(
      'SELECT * FROM rewards WHERE id = $1 AND tenant_id = $2', [id, tenantId]
    )).rows[0] as Record<string, unknown>;
    res.status(201).json({
      id: row.id,
      userId: row.user_id,
      points: row.points,
      type: row.type,
      description: row.description,
      date: row.date,
    });
  } catch (err) {
    console.error('[API Error]', req.path, err); res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/api/rewards/:id', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { id } = req.params;
    const { points, type, description, date } = req.body;
    const result = await pool.query(
      `UPDATE rewards SET
        points = COALESCE($1, points),
        type = COALESCE($2, type),
        description = COALESCE($3, description),
        date = COALESCE($4, date)
      WHERE id = $5 AND tenant_id = $6`,
      [points, type, description, date, id, tenantId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Reward not found' });

    const row = (await pool.query(
      'SELECT * FROM rewards WHERE id = $1 AND tenant_id = $2', [id, tenantId]
    )).rows[0] as Record<string, unknown>;
    res.json({
      id: row.id,
      userId: row.user_id,
      points: row.points,
      type: row.type,
      description: row.description,
      date: row.date,
    });
  } catch (err) {
    console.error('[API Error]', req.path, err); res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/api/rewards/:id', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { id } = req.params;
    const result = await pool.query(
      'DELETE FROM rewards WHERE id = $1 AND tenant_id = $2',
      [id, tenantId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Reward not found' });
    res.status(204).send();
  } catch (err) {
    console.error('[API Error]', req.path, err); res.status(500).json({ error: 'Internal server error' });
  }
});

// ============ REWARD RULES ============
router.get('/api/reward-rules', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { rows } = await pool.query(
      `SELECT rr.*, c.name as category_name FROM reward_rules rr
       LEFT JOIN categories c ON rr.category_id = c.id AND c.tenant_id = $1
       WHERE rr.tenant_id = $1
       ORDER BY rr.products_sold_threshold`,
      [tenantId]
    );
    res.json(rows.map((r: Record<string, unknown>) => ({
      id: r.id,
      categoryId: r.category_id,
      categoryName: r.category_name,
      productsSoldThreshold: r.products_sold_threshold,
      rewardPoints: r.reward_points,
      description: r.description,
    })));
  } catch (err) {
    console.error('[API Error]', req.path, err); res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/api/reward-rules', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { categoryId, productsSoldThreshold, rewardPoints, description } = req.body;
    const id = uid('RR');

    await pool.query(
      `INSERT INTO reward_rules (id, tenant_id, category_id, products_sold_threshold, reward_points, description)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, tenantId, categoryId || null, productsSoldThreshold ?? 0, rewardPoints ?? 0, description || null]
    );

    const row = (await pool.query(
      `SELECT rr.*, c.name as category_name FROM reward_rules rr
       LEFT JOIN categories c ON rr.category_id = c.id AND c.tenant_id = $1
       WHERE rr.id = $2 AND rr.tenant_id = $1`,
      [tenantId, id]
    )).rows[0] as Record<string, unknown>;
    res.status(201).json({
      id: row.id,
      categoryId: row.category_id,
      categoryName: row.category_name,
      productsSoldThreshold: row.products_sold_threshold,
      rewardPoints: row.reward_points,
      description: row.description,
    });
  } catch (err) {
    console.error('[API Error]', req.path, err); res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/api/reward-rules/:id', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { id } = req.params;
    const { categoryId, productsSoldThreshold, rewardPoints, description } = req.body;
    const result = await pool.query(
      `UPDATE reward_rules SET
        category_id = COALESCE($1, category_id),
        products_sold_threshold = COALESCE($2, products_sold_threshold),
        reward_points = COALESCE($3, reward_points),
        description = COALESCE($4, description)
      WHERE id = $5 AND tenant_id = $6`,
      [categoryId, productsSoldThreshold, rewardPoints, description, id, tenantId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Reward rule not found' });

    const row = (await pool.query(
      `SELECT rr.*, c.name as category_name FROM reward_rules rr
       LEFT JOIN categories c ON rr.category_id = c.id AND c.tenant_id = $1
       WHERE rr.id = $2 AND rr.tenant_id = $1`,
      [tenantId, id]
    )).rows[0] as Record<string, unknown>;
    res.json({
      id: row.id,
      categoryId: row.category_id,
      categoryName: row.category_name,
      productsSoldThreshold: row.products_sold_threshold,
      rewardPoints: row.reward_points,
      description: row.description,
    });
  } catch (err) {
    console.error('[API Error]', req.path, err); res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/api/reward-rules/:id', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { id } = req.params;
    const result = await pool.query(
      'DELETE FROM reward_rules WHERE id = $1 AND tenant_id = $2',
      [id, tenantId]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Reward rule not found' });
    res.status(204).send();
  } catch (err) {
    console.error('[API Error]', req.path, err); res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
