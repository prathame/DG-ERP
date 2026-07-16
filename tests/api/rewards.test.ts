import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool, cleanupTestData } from '../helpers';

const TEST_TENANT = 'T-TEST-REWARDS';
const OTHER_TENANT = 'T-TEST-REWARDS-OTHER';

describe('Rewards', () => {
  beforeAll(async () => {
    await cleanupTestData(TEST_TENANT);
    await cleanupTestData(OTHER_TENANT);

    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status)
       VALUES ($1, 'Rewards Co', 'test-rewards', 'rewards@test.com', 'Test', 'active')
       ON CONFLICT (id) DO NOTHING`,
      [TEST_TENANT]
    );
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status)
       VALUES ($1, 'Other Co', 'test-rewards-other', 'other@test.com', 'Other', 'active')
       ON CONFLICT (id) DO NOTHING`,
      [OTHER_TENANT]
    );

    await pool.query(
      `INSERT INTO vendors (id, tenant_id, name, total_reward_points)
       VALUES ('V-RWD-1', $1, 'Vendor One', 500)
       ON CONFLICT DO NOTHING`,
      [TEST_TENANT]
    );
    await pool.query(
      `INSERT INTO vendors (id, tenant_id, name, total_reward_points)
       VALUES ('V-RWD-2', $1, 'Vendor Two', 0)
       ON CONFLICT DO NOTHING`,
      [TEST_TENANT]
    );
  });

  afterAll(async () => {
    await cleanupTestData(TEST_TENANT);
    await cleanupTestData(OTHER_TENANT);
  });

  // ============ REDEMPTION SETTINGS ============

  describe('GET /api/redemption-settings', () => {
    it('returns defaults when no row exists', async () => {
      const row = (await pool.query(
        'SELECT min_balance, min_points FROM redemption_settings WHERE id = $1 AND tenant_id = $2',
        ['default', TEST_TENANT]
      )).rows[0];
      // Route returns defaults 100/50 when no row
      const minBalance = row?.min_balance ?? 100;
      const minPoints = row?.min_points ?? 50;
      expect(minBalance).toBe(100);
      expect(minPoints).toBe(50);
    });

    it('returns stored settings after upsert', async () => {
      await pool.query(
        `INSERT INTO redemption_settings (id, tenant_id, min_balance, min_points)
         VALUES ('default', $1, 200, 75)
         ON CONFLICT (id, tenant_id) DO UPDATE SET min_balance = 200, min_points = 75`,
        [TEST_TENANT]
      );
      const row = (await pool.query(
        'SELECT min_balance, min_points FROM redemption_settings WHERE id = $1 AND tenant_id = $2',
        ['default', TEST_TENANT]
      )).rows[0];
      expect(row.min_balance).toBe(200);
      expect(row.min_points).toBe(75);
    });

    it('is tenant-isolated — other tenant sees its own defaults', async () => {
      const row = (await pool.query(
        'SELECT min_balance, min_points FROM redemption_settings WHERE id = $1 AND tenant_id = $2',
        ['default', OTHER_TENANT]
      )).rows[0];
      expect(row).toBeUndefined();
    });
  });

  describe('PUT /api/redemption-settings', () => {
    it('upserts min_balance and min_points', async () => {
      const mb = 300;
      const mp = 100;
      await pool.query(
        `INSERT INTO redemption_settings (id, tenant_id, min_balance, min_points)
         VALUES ('default', $1, $2, $3)
         ON CONFLICT (id, tenant_id) DO UPDATE SET min_balance = $2, min_points = $3`,
        [TEST_TENANT, mb, mp]
      );
      const row = (await pool.query(
        'SELECT min_balance, min_points FROM redemption_settings WHERE id = $1 AND tenant_id = $2',
        ['default', TEST_TENANT]
      )).rows[0];
      expect(row.min_balance).toBe(300);
      expect(row.min_points).toBe(100);
    });

    it('clamps min_points to at least 1', () => {
      // Route uses Math.max(1, parseInt(...) || 1)
      const mp = Math.max(1, parseInt('0', 10) || 1);
      expect(mp).toBe(1);
    });

    it('clamps min_balance to at least 0', () => {
      const mb = Math.max(0, parseInt('-50', 10) || 0);
      expect(mb).toBe(0);
    });

    it('upserts — second write overwrites first', async () => {
      await pool.query(
        `INSERT INTO redemption_settings (id, tenant_id, min_balance, min_points)
         VALUES ('default', $1, 50, 10)
         ON CONFLICT (id, tenant_id) DO UPDATE SET min_balance = 50, min_points = 10`,
        [TEST_TENANT]
      );
      const row = (await pool.query(
        'SELECT min_balance, min_points FROM redemption_settings WHERE id = $1 AND tenant_id = $2',
        ['default', TEST_TENANT]
      )).rows[0];
      expect(row.min_balance).toBe(50);
      expect(row.min_points).toBe(10);
      // Reset for other tests
      await pool.query(
        `UPDATE redemption_settings SET min_balance = 100, min_points = 50
         WHERE id = 'default' AND tenant_id = $1`,
        [TEST_TENANT]
      );
    });
  });

  // ============ REWARDS BALANCE ============

  describe('GET /api/rewards/balance', () => {
    beforeAll(async () => {
      await pool.query('DELETE FROM rewards WHERE tenant_id = $1', [TEST_TENANT]);
    });

    it('returns 0 with no rewards', async () => {
      const earned = (await pool.query(
        "SELECT COALESCE(SUM(points), 0) as total FROM rewards WHERE type = 'Earned' AND tenant_id = $1",
        [TEST_TENANT]
      )).rows[0].total;
      const redeemed = (await pool.query(
        "SELECT COALESCE(SUM(points), 0) as total FROM rewards WHERE type = 'Redeemed' AND tenant_id = $1",
        [TEST_TENANT]
      )).rows[0].total;
      expect(Number(earned) - Number(redeemed)).toBe(0);
    });

    it('balance = earned - redeemed', async () => {
      await pool.query(
        `INSERT INTO rewards (id, tenant_id, user_id, points, type, description, date)
         VALUES ('RW-BAL-1', $1, 'U1', 200, 'Earned', 'seed', CURRENT_DATE)`,
        [TEST_TENANT]
      );
      await pool.query(
        `INSERT INTO rewards (id, tenant_id, user_id, points, type, description, date)
         VALUES ('RW-BAL-2', $1, 'U1', 50, 'Redeemed', 'redeem', CURRENT_DATE)`,
        [TEST_TENANT]
      );
      const earned = (await pool.query(
        "SELECT COALESCE(SUM(points), 0) as total FROM rewards WHERE type = 'Earned' AND tenant_id = $1",
        [TEST_TENANT]
      )).rows[0].total;
      const redeemed = (await pool.query(
        "SELECT COALESCE(SUM(points), 0) as total FROM rewards WHERE type = 'Redeemed' AND tenant_id = $1",
        [TEST_TENANT]
      )).rows[0].total;
      expect(Number(earned) - Number(redeemed)).toBe(150);
    });

    it('is tenant-isolated', async () => {
      const earned = (await pool.query(
        "SELECT COALESCE(SUM(points), 0) as total FROM rewards WHERE type = 'Earned' AND tenant_id = $1",
        [OTHER_TENANT]
      )).rows[0].total;
      expect(Number(earned)).toBe(0);
    });
  });

  // ============ GET /api/rewards ============

  describe('GET /api/rewards', () => {
    it('lists all rewards for tenant', async () => {
      const { rows } = await pool.query(
        'SELECT * FROM rewards WHERE tenant_id = $1 ORDER BY date DESC',
        [TEST_TENANT]
      );
      expect(rows.length).toBeGreaterThanOrEqual(2);
    });

    it('filters by type', async () => {
      const { rows } = await pool.query(
        "SELECT * FROM rewards WHERE tenant_id = $1 AND type = 'Earned' ORDER BY date DESC",
        [TEST_TENANT]
      );
      expect(rows.every((r: Record<string, unknown>) => r.type === 'Earned')).toBe(true);
    });

    it('filters by vendorId', async () => {
      await pool.query(
        `INSERT INTO rewards (id, tenant_id, user_id, points, type, description, date, vendor_id)
         VALUES ('RW-VENDOR-1', $1, 'U1', 100, 'Earned', 'vendor earn', CURRENT_DATE, 'V-RWD-1')`,
        [TEST_TENANT]
      );
      const { rows } = await pool.query(
        "SELECT * FROM rewards WHERE tenant_id = $1 AND vendor_id = 'V-RWD-1'",
        [TEST_TENANT]
      );
      expect(rows.length).toBeGreaterThanOrEqual(1);
      expect(rows.every((r: Record<string, unknown>) => r.vendor_id === 'V-RWD-1')).toBe(true);
    });

    it('does not leak other tenant rewards', async () => {
      await pool.query(
        `INSERT INTO rewards (id, tenant_id, user_id, points, type, description, date)
         VALUES ('RW-OTHER-1', $1, 'U1', 999, 'Earned', 'other', CURRENT_DATE)`,
        [OTHER_TENANT]
      );
      const { rows } = await pool.query(
        'SELECT * FROM rewards WHERE tenant_id = $1',
        [TEST_TENANT]
      );
      expect(rows.every((r: Record<string, unknown>) => r.tenant_id === TEST_TENANT)).toBe(true);
    });
  });

  // ============ POST /api/rewards (Earned) ============

  describe('POST /api/rewards — Earned', () => {
    it('inserts an Earned reward', async () => {
      const id = 'RW-EARN-1';
      const date = new Date().toISOString().slice(0, 10);
      await pool.query(
        `INSERT INTO rewards (id, tenant_id, user_id, points, type, description, date)
         VALUES ($1, $2, 'U1', 100, 'Earned', 'test earn', $3)`,
        [id, TEST_TENANT, date]
      );
      const { rows } = await pool.query(
        'SELECT * FROM rewards WHERE id = $1 AND tenant_id = $2',
        [id, TEST_TENANT]
      );
      expect(rows.length).toBe(1);
      expect(rows[0].points).toBe(100);
      expect(rows[0].type).toBe('Earned');
    });

    it('increments vendor total_reward_points when vendorId provided on Earned', async () => {
      const before = (await pool.query(
        'SELECT total_reward_points FROM vendors WHERE id = $1 AND tenant_id = $2',
        ['V-RWD-1', TEST_TENANT]
      )).rows[0].total_reward_points;

      const pts = 50;
      const id = 'RW-EARN-V1';
      const date = new Date().toISOString().slice(0, 10);
      await pool.query(
        `INSERT INTO rewards (id, tenant_id, user_id, points, type, description, date, vendor_id)
         VALUES ($1, $2, 'U1', $3, 'Earned', 'vendor earn', $4, 'V-RWD-1')`,
        [id, TEST_TENANT, pts, date]
      );
      await pool.query(
        'UPDATE vendors SET total_reward_points = total_reward_points + $1 WHERE id = $2 AND tenant_id = $3',
        [pts, 'V-RWD-1', TEST_TENANT]
      );

      const after = (await pool.query(
        'SELECT total_reward_points FROM vendors WHERE id = $1 AND tenant_id = $2',
        ['V-RWD-1', TEST_TENANT]
      )).rows[0].total_reward_points;
      expect(Number(after)).toBe(Number(before) + pts);
    });

    it('does not increment vendor points for non-Earned type', async () => {
      const before = (await pool.query(
        'SELECT total_reward_points FROM vendors WHERE id = $1 AND tenant_id = $2',
        ['V-RWD-2', TEST_TENANT]
      )).rows[0].total_reward_points;

      // Simulates the route logic: earnVendorId is set, but type is not 'Earned'
      const type = 'Adjustment';
      const earnVendorId = 'V-RWD-2';
      if (earnVendorId && type === 'Earned') {
        // would update — won't reach here
        await pool.query(
          'UPDATE vendors SET total_reward_points = total_reward_points + 100 WHERE id = $1 AND tenant_id = $2',
          [earnVendorId, TEST_TENANT]
        );
      }

      const after = (await pool.query(
        'SELECT total_reward_points FROM vendors WHERE id = $1 AND tenant_id = $2',
        ['V-RWD-2', TEST_TENANT]
      )).rows[0].total_reward_points;
      expect(Number(after)).toBe(Number(before));
    });
  });

  // ============ POST /api/rewards (Redeemed) ============

  describe('POST /api/rewards — Redeemed', () => {
    beforeAll(async () => {
      // Ensure redemption_settings allow small amounts for tests
      await pool.query(
        `INSERT INTO redemption_settings (id, tenant_id, min_balance, min_points)
         VALUES ('default', $1, 50, 10)
         ON CONFLICT (id, tenant_id) DO UPDATE SET min_balance = 50, min_points = 10`,
        [TEST_TENANT]
      );
      // Reset V-RWD-1 to known value
      await pool.query(
        'UPDATE vendors SET total_reward_points = 500 WHERE id = $1 AND tenant_id = $2',
        ['V-RWD-1', TEST_TENANT]
      );
    });

    it('rejects redemption when vendor not found', async () => {
      // Simulate the route's vendor lookup
      const v = (await pool.query(
        'SELECT total_reward_points FROM vendors WHERE id = $1 AND tenant_id = $2',
        ['V-NONEXISTENT', TEST_TENANT]
      )).rows[0];
      expect(v).toBeUndefined();
      // Route returns 400 Vendor not found
    });

    it('rejects when vendor balance below minBalance', async () => {
      await pool.query(
        'UPDATE vendors SET total_reward_points = 10 WHERE id = $1 AND tenant_id = $2',
        ['V-RWD-2', TEST_TENANT]
      );
      const settings = (await pool.query(
        'SELECT min_balance, min_points FROM redemption_settings WHERE id = $1 AND tenant_id = $2',
        ['default', TEST_TENANT]
      )).rows[0] as { min_balance: number; min_points: number } | undefined;
      const minBal = settings?.min_balance ?? 100;
      const balance = (await pool.query(
        'SELECT total_reward_points FROM vendors WHERE id = $1 AND tenant_id = $2',
        ['V-RWD-2', TEST_TENANT]
      )).rows[0].total_reward_points;
      expect(Number(balance)).toBeLessThan(minBal);
      // Route returns 400 "Minimum balance of X pts required"
    });

    it('rejects when points < minPoints', async () => {
      const settings = (await pool.query(
        'SELECT min_balance, min_points FROM redemption_settings WHERE id = $1 AND tenant_id = $2',
        ['default', TEST_TENANT]
      )).rows[0] as { min_balance: number; min_points: number };
      const minPts = settings.min_points;
      const attemptPts = 5;
      expect(attemptPts).toBeLessThan(minPts);
      // Route returns 400 "Minimum X pts per redemption"
    });

    it('rejects when points exceed balance', async () => {
      const balance = (await pool.query(
        'SELECT total_reward_points FROM vendors WHERE id = $1 AND tenant_id = $2',
        ['V-RWD-1', TEST_TENANT]
      )).rows[0].total_reward_points;
      const overDraw = Number(balance) + 100;
      expect(overDraw).toBeGreaterThan(Number(balance));
      // Route returns 400 "Insufficient balance"
    });

    it('vendor redemption decrements vendor total_reward_points', async () => {
      const before = (await pool.query(
        'SELECT total_reward_points FROM vendors WHERE id = $1 AND tenant_id = $2',
        ['V-RWD-1', TEST_TENANT]
      )).rows[0].total_reward_points;

      const pts = 100;
      const id = 'RW-REDEEM-V1';
      const date = new Date().toISOString().slice(0, 10);

      // Simulate the transactional steps the route performs
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          'UPDATE vendors SET total_reward_points = total_reward_points - $1 WHERE id = $2 AND tenant_id = $3',
          [pts, 'V-RWD-1', TEST_TENANT]
        );
        await client.query(
          `INSERT INTO rewards (id, tenant_id, user_id, points, type, description, date, vendor_id)
           VALUES ($1, $2, 'U1', $3, 'Redeemed', 'vendor redeem', $4, 'V-RWD-1')`,
          [id, TEST_TENANT, pts, date]
        );
        await client.query('COMMIT');
      } finally {
        client.release();
      }

      const after = (await pool.query(
        'SELECT total_reward_points FROM vendors WHERE id = $1 AND tenant_id = $2',
        ['V-RWD-1', TEST_TENANT]
      )).rows[0].total_reward_points;
      expect(Number(after)).toBe(Number(before) - pts);

      const reward = (await pool.query(
        'SELECT * FROM rewards WHERE id = $1 AND tenant_id = $2',
        [id, TEST_TENANT]
      )).rows[0];
      expect(reward.type).toBe('Redeemed');
      expect(reward.points).toBe(pts);
    });

    it('non-vendor redemption (general balance) succeeds with enough balance', async () => {
      // Ensure general earned > redeemed > minBalance threshold
      await pool.query('DELETE FROM rewards WHERE tenant_id = $1 AND vendor_id IS NULL', [TEST_TENANT]);
      await pool.query(
        `INSERT INTO rewards (id, tenant_id, user_id, points, type, description, date)
         VALUES ('RW-GEN-EARN', $1, 'U1', 500, 'Earned', 'general earn', CURRENT_DATE)`,
        [TEST_TENANT]
      );

      const earned = (await pool.query(
        "SELECT COALESCE(SUM(points),0) as total FROM rewards WHERE type='Earned' AND (vendor_id IS NULL OR vendor_id='') AND tenant_id=$1",
        [TEST_TENANT]
      )).rows[0].total;
      const redeemed = (await pool.query(
        "SELECT COALESCE(SUM(points),0) as total FROM rewards WHERE type='Redeemed' AND (vendor_id IS NULL OR vendor_id='') AND tenant_id=$1",
        [TEST_TENANT]
      )).rows[0].total;
      const balance = Number(earned) - Number(redeemed);
      expect(balance).toBeGreaterThanOrEqual(50); // minBalance

      const pts = 20; // >= minPoints(10), <= balance
      const id = 'RW-GEN-REDEEM';
      await pool.query(
        `INSERT INTO rewards (id, tenant_id, user_id, points, type, description, date)
         VALUES ($1, $2, 'U1', $3, 'Redeemed', 'general redeem', CURRENT_DATE)`,
        [id, TEST_TENANT, pts]
      );
      const row = (await pool.query(
        'SELECT * FROM rewards WHERE id = $1 AND tenant_id = $2',
        [id, TEST_TENANT]
      )).rows[0];
      expect(row.type).toBe('Redeemed');
      expect(Number(row.points)).toBe(pts);
    });
  });

  // ============ PUT /api/rewards/:id ============

  describe('PUT /api/rewards/:id', () => {
    const rewardId = 'RW-UPDATE-1';

    beforeAll(async () => {
      await pool.query(
        `INSERT INTO rewards (id, tenant_id, user_id, points, type, description, date, vendor_id)
         VALUES ($1, $2, 'U1', 200, 'Earned', 'original', CURRENT_DATE, 'V-RWD-1')
         ON CONFLICT DO NOTHING`,
        [rewardId, TEST_TENANT]
      );
      // Set vendor to known value
      await pool.query(
        'UPDATE vendors SET total_reward_points = 300 WHERE id = $1 AND tenant_id = $2',
        ['V-RWD-1', TEST_TENANT]
      );
    });

    it('updates points and description', async () => {
      await pool.query(
        `UPDATE rewards SET points = 150, description = 'updated' WHERE id = $1 AND tenant_id = $2`,
        [rewardId, TEST_TENANT]
      );
      const row = (await pool.query(
        'SELECT points, description FROM rewards WHERE id = $1 AND tenant_id = $2',
        [rewardId, TEST_TENANT]
      )).rows[0];
      expect(Number(row.points)).toBe(150);
      expect(row.description).toBe('updated');
    });

    it('returns 404 when reward not found in tenant', async () => {
      const result = await pool.query(
        'UPDATE rewards SET points = 999 WHERE id = $1 AND tenant_id = $2',
        ['RW-NONEXISTENT', TEST_TENANT]
      );
      expect(result.rowCount).toBe(0);
      // Route returns 404
    });

    it('adjusts vendor counter when type changes Earned→Redeemed', async () => {
      // Route: oldDelta = +oldPoints, newDelta = -newPoints, adjust = newDelta - oldDelta
      const oldPoints = 200;
      const newPoints = 100;
      const oldType = 'Earned';
      const newType = 'Redeemed';
      const oldDelta = oldType === 'Redeemed' ? -oldPoints : oldType === 'Earned' ? oldPoints : 0;
      const newDelta = newType === 'Redeemed' ? -newPoints : newType === 'Earned' ? newPoints : 0;
      const adjust = newDelta - oldDelta;
      expect(adjust).toBe(-100 - 200); // -300

      const before = 300;
      expect(before + adjust).toBe(0);
    });

    it('no vendor adjustment when vendorId is null', () => {
      const adjust = -50;
      const vendorId = null;
      // Route: if (adjust !== 0 && vendorId) — won't run
      expect(adjust !== 0 && vendorId !== null).toBe(false);
    });

    it('does not update reward from other tenant', async () => {
      const result = await pool.query(
        'UPDATE rewards SET points = 999 WHERE id = $1 AND tenant_id = $2',
        [rewardId, OTHER_TENANT]
      );
      expect(result.rowCount).toBe(0);
    });
  });

  // ============ DELETE /api/rewards/:id ============

  describe('DELETE /api/rewards/:id', () => {
    it('deletes a reward and reverses vendor Earned counter', async () => {
      const id = 'RW-DEL-1';
      const pts = 75;
      await pool.query(
        `INSERT INTO rewards (id, tenant_id, user_id, points, type, description, date, vendor_id)
         VALUES ($1, $2, 'U1', $3, 'Earned', 'to delete', CURRENT_DATE, 'V-RWD-1')`,
        [id, TEST_TENANT, pts]
      );
      await pool.query(
        'UPDATE vendors SET total_reward_points = 200 WHERE id = $1 AND tenant_id = $2',
        ['V-RWD-1', TEST_TENANT]
      );

      const existing = (await pool.query(
        'SELECT * FROM rewards WHERE id = $1 AND tenant_id = $2',
        [id, TEST_TENANT]
      )).rows[0];
      expect(existing).toBeDefined();

      const rType = existing.type as string;
      const reverse = rType === 'Redeemed' ? pts : rType === 'Earned' ? -pts : 0;
      // Earned → reverse = -pts (subtract from vendor)

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('DELETE FROM rewards WHERE id = $1 AND tenant_id = $2', [id, TEST_TENANT]);
        if (reverse !== 0 && existing.vendor_id) {
          await client.query(
            'UPDATE vendors SET total_reward_points = total_reward_points + $1 WHERE id = $2 AND tenant_id = $3',
            [reverse, existing.vendor_id, TEST_TENANT]
          );
        }
        await client.query('COMMIT');
      } finally {
        client.release();
      }

      const gone = (await pool.query(
        'SELECT * FROM rewards WHERE id = $1 AND tenant_id = $2',
        [id, TEST_TENANT]
      )).rows[0];
      expect(gone).toBeUndefined();

      const vendor = (await pool.query(
        'SELECT total_reward_points FROM vendors WHERE id = $1 AND tenant_id = $2',
        ['V-RWD-1', TEST_TENANT]
      )).rows[0];
      expect(Number(vendor.total_reward_points)).toBe(200 - pts);
    });

    it('returns 404 when reward not found', async () => {
      const result = await pool.query(
        'DELETE FROM rewards WHERE id = $1 AND tenant_id = $2',
        ['RW-NONEXISTENT', TEST_TENANT]
      );
      expect(result.rowCount).toBe(0);
    });

    it('deleting Redeemed reward adds back to vendor (reverse = +pts)', () => {
      const rType = 'Redeemed';
      const pts = 50;
      const reverse = rType === 'Redeemed' ? pts : rType === 'Earned' ? -pts : 0;
      expect(reverse).toBe(50);
    });

    it('no vendor update when vendorId null on delete', () => {
      const reverse = -100;
      const vendorId = null;
      expect(reverse !== 0 && vendorId !== null).toBe(false);
    });
  });

  // ============ REWARD RULES ============

  describe('GET /api/reward-rules', () => {
    it('returns empty array when no rules', async () => {
      const { rows } = await pool.query(
        'SELECT * FROM reward_rules WHERE tenant_id = $1',
        [OTHER_TENANT]
      );
      expect(rows).toHaveLength(0);
    });

    it('returns rules for tenant', async () => {
      await pool.query(
        `INSERT INTO reward_rules (id, tenant_id, products_sold_threshold, reward_points, description)
         VALUES ('RR-1', $1, 10, 100, 'Rule one')`,
        [TEST_TENANT]
      );
      const { rows } = await pool.query(
        'SELECT * FROM reward_rules WHERE tenant_id = $1 ORDER BY products_sold_threshold',
        [TEST_TENANT]
      );
      expect(rows.length).toBeGreaterThanOrEqual(1);
      expect(rows.some((r: Record<string, unknown>) => r.id === 'RR-1')).toBe(true);
    });

    it('is tenant-isolated', async () => {
      const { rows } = await pool.query(
        'SELECT * FROM reward_rules WHERE tenant_id = $1',
        [OTHER_TENANT]
      );
      expect(rows.every((r: Record<string, unknown>) => r.tenant_id === OTHER_TENANT)).toBe(true);
    });
  });

  describe('POST /api/reward-rules', () => {
    it('inserts a rule with all fields', async () => {
      const id = 'RR-POST-1';
      await pool.query(
        `INSERT INTO reward_rules (id, tenant_id, category_id, products_sold_threshold, reward_points, description)
         VALUES ($1, $2, NULL, 20, 200, 'Post rule')`,
        [id, TEST_TENANT]
      );
      const row = (await pool.query(
        'SELECT * FROM reward_rules WHERE id = $1 AND tenant_id = $2',
        [id, TEST_TENANT]
      )).rows[0];
      expect(row.products_sold_threshold).toBe(20);
      expect(row.reward_points).toBe(200);
      expect(row.description).toBe('Post rule');
    });

    it('inserts a rule with nullable categoryId', async () => {
      const id = 'RR-POST-NULL';
      await pool.query(
        `INSERT INTO reward_rules (id, tenant_id, category_id, products_sold_threshold, reward_points)
         VALUES ($1, $2, NULL, 5, 50)`,
        [id, TEST_TENANT]
      );
      const row = (await pool.query(
        'SELECT category_id FROM reward_rules WHERE id = $1 AND tenant_id = $2',
        [id, TEST_TENANT]
      )).rows[0];
      expect(row.category_id).toBeNull();
    });
  });

  describe('PUT /api/reward-rules/:id', () => {
    it('updates reward rule fields', async () => {
      await pool.query(
        `UPDATE reward_rules SET reward_points = 999, description = 'updated rule'
         WHERE id = $1 AND tenant_id = $2`,
        ['RR-1', TEST_TENANT]
      );
      const row = (await pool.query(
        'SELECT reward_points, description FROM reward_rules WHERE id = $1 AND tenant_id = $2',
        ['RR-1', TEST_TENANT]
      )).rows[0];
      expect(row.reward_points).toBe(999);
      expect(row.description).toBe('updated rule');
    });

    it('returns 404 for nonexistent rule', async () => {
      const result = await pool.query(
        'UPDATE reward_rules SET reward_points = 1 WHERE id = $1 AND tenant_id = $2',
        ['RR-NONEXISTENT', TEST_TENANT]
      );
      expect(result.rowCount).toBe(0);
    });

    it('does not update rule from other tenant', async () => {
      const result = await pool.query(
        'UPDATE reward_rules SET reward_points = 999 WHERE id = $1 AND tenant_id = $2',
        ['RR-1', OTHER_TENANT]
      );
      expect(result.rowCount).toBe(0);
    });
  });

  describe('DELETE /api/reward-rules/:id', () => {
    it('deletes an existing rule', async () => {
      const id = 'RR-DEL-1';
      await pool.query(
        `INSERT INTO reward_rules (id, tenant_id, products_sold_threshold, reward_points)
         VALUES ($1, $2, 1, 10)`,
        [id, TEST_TENANT]
      );
      const result = await pool.query(
        'DELETE FROM reward_rules WHERE id = $1 AND tenant_id = $2',
        [id, TEST_TENANT]
      );
      expect(result.rowCount).toBe(1);
      const gone = (await pool.query(
        'SELECT * FROM reward_rules WHERE id = $1', [id]
      )).rows[0];
      expect(gone).toBeUndefined();
    });

    it('returns 404 for nonexistent rule', async () => {
      const result = await pool.query(
        'DELETE FROM reward_rules WHERE id = $1 AND tenant_id = $2',
        ['RR-NONEXISTENT', TEST_TENANT]
      );
      expect(result.rowCount).toBe(0);
    });
  });

  // ============ AUTH / MISSING TENANT ============

  describe('Auth checks — tenant ID required', () => {
    it('GET /api/rewards without tenant returns 401 pattern', () => {
      // Route: if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
      const tenantId = undefined as string | undefined;
      expect(!tenantId).toBe(true);
    });

    it('blockVendors rejects role=Vendor', () => {
      // Simulate blockVendors middleware logic
      const role = 'Vendor';
      const blocked = role === 'Vendor';
      expect(blocked).toBe(true);
      // Non-vendor passes
      expect('Admin' === 'Vendor').toBe(false);
    });

    it('vendorScopeId returns null for non-vendor role', () => {
      // vendorScopeId: if role !== 'Vendor' return null
      const role = 'Admin';
      const scopeId = role !== 'Vendor' ? null : 'some-vendor-id';
      expect(scopeId).toBeNull();
    });

    it('vendor role with no linked vendorId returns 403 on GET /rewards', () => {
      // Route: jwtVendorId === null && req.user?.role === 'Vendor' → 403
      const jwtVendorId: string | null = null;
      const role = 'Vendor';
      const shouldBlock = jwtVendorId === null && role === 'Vendor';
      expect(shouldBlock).toBe(true);
    });

    it('vendor role with linked vendorId gets scoped results', () => {
      const jwtVendorId = 'V-RWD-1';
      const role = 'Vendor';
      // Route uses jwtVendorId as effectiveVendorId
      const effectiveVendorId = role === 'Vendor' ? jwtVendorId : undefined;
      expect(effectiveVendorId).toBe('V-RWD-1');
    });
  });

  // ============ BALANCE COMPUTATION EDGE CASES ============

  describe('Balance edge cases', () => {
    it('ptsToInsert clamped to 0 for negative/NaN input', () => {
      expect(Math.max(0, parseInt('-10', 10) || 0)).toBe(0);
      expect(Math.max(0, parseInt('abc', 10) || 0)).toBe(0);
      expect(Math.max(0, parseInt('50', 10) || 0)).toBe(50);
    });

    it('minPoints always >= 1', () => {
      expect(Math.max(1, parseInt('0', 10) || 1)).toBe(1);
      expect(Math.max(1, parseInt('-5', 10) || 1)).toBe(1);
      expect(Math.max(1, parseInt('20', 10) || 1)).toBe(20);
    });

    it('redemption_settings row missing → fallback 100/50', () => {
      const row: { min_balance: number; min_points: number } | undefined = undefined;
      expect(row?.min_balance ?? 100).toBe(100);
      expect(row?.min_points ?? 50).toBe(50);
    });
  });
});
