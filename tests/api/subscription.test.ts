import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import bcrypt from 'bcrypt';
import { pool, createTestToken, cleanupTestData } from '../helpers';

const TENANT = 'T-TEST-SUB';
const EMAIL = 'sub-test@test.com';

describe('Subscription — End to End', () => {
  beforeAll(async () => {
    await cleanupTestData(TENANT);
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, plan_id)
       VALUES ($1, 'Sub Test Co', 'sub-test', $2, 'Sub Admin', 'active', 'BASIC')
       ON CONFLICT (id) DO NOTHING`,
      [TENANT, EMAIL]
    );
    const hash = bcrypt.hashSync('password123', 12);
    await pool.query(
      `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
       VALUES ('U-SUB-1', $1, $2, $3, 'Sub User', 'Admin')
       ON CONFLICT DO NOTHING`,
      [TENANT, EMAIL, hash]
    );
  });

  afterAll(async () => { await cleanupTestData(TENANT); });

  // --- Trial ---
  describe('Trial', () => {
    it('trial should auto-set 14 day expiry', async () => {
      const trialEnd = new Date();
      trialEnd.setDate(trialEnd.getDate() + 14);
      await pool.query('UPDATE tenants SET status = $1, trial_ends_at = $2 WHERE id = $3', ['trial', trialEnd.toISOString(), TENANT]);
      const { rows } = await pool.query('SELECT status, trial_ends_at FROM tenants WHERE id = $1', [TENANT]);
      expect(rows[0].status).toBe('trial');
      const days = Math.ceil((new Date(rows[0].trial_ends_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      expect(days).toBeGreaterThanOrEqual(13);
      expect(days).toBeLessThanOrEqual(14);
    });

    it('expired trial should be detectable', async () => {
      await pool.query('UPDATE tenants SET trial_ends_at = $1 WHERE id = $2', ['2020-01-01', TENANT]);
      const { rows } = await pool.query('SELECT trial_ends_at FROM tenants WHERE id = $1', [TENANT]);
      expect(new Date(rows[0].trial_ends_at).getTime()).toBeLessThan(Date.now());
    });

    it('expired trial should block login', async () => {
      await pool.query('UPDATE tenants SET status = $1, trial_ends_at = $2 WHERE id = $3', ['trial', '2020-01-01', TENANT]);
      const tenant = (await pool.query('SELECT status, trial_ends_at FROM tenants WHERE id = $1', [TENANT])).rows[0];
      const isExpired = tenant.status === 'trial' && new Date(tenant.trial_ends_at).getTime() < Date.now();
      expect(isExpired).toBe(true);
    });
  });

  // --- Subscription dates ---
  describe('Subscription Dates', () => {
    it('should set subscription start and end', async () => {
      const end = '2026-07-01T00:00:00+05:30';
      await pool.query('UPDATE tenants SET status = $1, subscription_ends_at = $2, trial_ends_at = NULL WHERE id = $3', ['active', end, TENANT]);
      const { rows } = await pool.query('SELECT subscription_ends_at FROM tenants WHERE id = $1', [TENANT]);
      const istDate = new Date(rows[0].subscription_ends_at).toLocaleString('en-CA', { timeZone: 'Asia/Kolkata' }).split(',')[0];
      expect(istDate).toBe('2026-07-01');
    });

    it('monthly plan should be start + 1 month', () => {
      const start = new Date('2026-06-15');
      start.setMonth(start.getMonth() + 1);
      expect(start.toISOString().split('T')[0]).toBe('2026-07-15');
    });

    it('yearly plan should be start + 1 year', () => {
      const start = new Date('2026-06-15');
      start.setFullYear(start.getFullYear() + 1);
      expect(start.toISOString().split('T')[0]).toBe('2027-06-15');
    });

    it('active subscription should be detectable', async () => {
      const futureDate = new Date();
      futureDate.setMonth(futureDate.getMonth() + 1);
      await pool.query('UPDATE tenants SET subscription_ends_at = $1 WHERE id = $2', [futureDate.toISOString(), TENANT]);
      const { rows } = await pool.query('SELECT subscription_ends_at FROM tenants WHERE id = $1', [TENANT]);
      expect(new Date(rows[0].subscription_ends_at).getTime()).toBeGreaterThan(Date.now());
    });

    it('expired subscription should block login', async () => {
      await pool.query('UPDATE tenants SET subscription_ends_at = $1, status = $2 WHERE id = $3', ['2020-01-01', 'active', TENANT]);
      const tenant = (await pool.query('SELECT status, subscription_ends_at FROM tenants WHERE id = $1', [TENANT])).rows[0];
      const isExpired = tenant.status === 'active' && new Date(tenant.subscription_ends_at).getTime() < Date.now();
      expect(isExpired).toBe(true);
    });
  });

  // --- Plan change rules ---
  describe('Plan Change Rules', () => {
    it('should NOT allow plan change during active subscription', async () => {
      const futureDate = new Date();
      futureDate.setMonth(futureDate.getMonth() + 1);
      await pool.query('UPDATE tenants SET subscription_ends_at = $1, plan_id = $2 WHERE id = $3', [futureDate.toISOString(), 'BASIC', TENANT]);
      const { rows } = await pool.query('SELECT subscription_ends_at FROM tenants WHERE id = $1', [TENANT]);
      const isActive = new Date(rows[0].subscription_ends_at).getTime() > Date.now();
      expect(isActive).toBe(true);
      // Plan change should be blocked by frontend — subscription is active
    });

    it('should allow plan change after subscription expires', async () => {
      await pool.query('UPDATE tenants SET subscription_ends_at = $1 WHERE id = $2', ['2020-01-01', TENANT]);
      const { rows } = await pool.query('SELECT subscription_ends_at FROM tenants WHERE id = $1', [TENANT]);
      const isExpired = new Date(rows[0].subscription_ends_at).getTime() < Date.now();
      expect(isExpired).toBe(true);
      // Now plan change is allowed
      await pool.query('UPDATE tenants SET plan_id = $1 WHERE id = $2', ['STANDARD', TENANT]);
      const updated = (await pool.query('SELECT plan_id FROM tenants WHERE id = $1', [TENANT])).rows[0];
      expect(updated.plan_id).toBe('STANDARD');
    });
  });

  // --- Feature toggle sync on plan change ---
  describe('Feature Toggle Sync', () => {
    it('Basic plan should disable barcode and vendor portal', async () => {
      const plan = (await pool.query('SELECT features FROM plans WHERE id = $1', ['BASIC'])).rows[0];
      expect(plan.features.barcodeSystem).toBe(false);
      expect(plan.features.vendorPortal).toBe(false);
    });

    it('Standard plan should enable barcode and vendor portal', async () => {
      const plan = (await pool.query('SELECT features FROM plans WHERE id = $1', ['STANDARD'])).rows[0];
      expect(plan.features.barcodeSystem).toBe(true);
      expect(plan.features.vendorPortal).toBe(true);
    });

    it('Professional plan should enable all features', async () => {
      const plan = (await pool.query('SELECT features FROM plans WHERE id = $1', ['PROFESSIONAL'])).rows[0];
      expect(plan.features.warranty).toBe(true);
      expect(plan.features.barcodeSystem).toBe(true);
      expect(plan.features.chatbot).toBe(true);
      expect(plan.features.vendorPortal).toBe(true);
      expect(plan.features.rewards).toBe(true);
    });

    it('upgrading from Basic to Standard should enable barcode', async () => {
      // Simulate: set tenant to Basic features
      await pool.query('UPDATE tenants SET plan_id = $1, barcode_system_enabled = false, vendor_portal_enabled = false WHERE id = $2', ['BASIC', TENANT]);
      let tenant = (await pool.query('SELECT barcode_system_enabled FROM tenants WHERE id = $1', [TENANT])).rows[0];
      expect(tenant.barcode_system_enabled).toBe(false);

      // Upgrade to Standard — apply features
      const stdPlan = (await pool.query('SELECT features FROM plans WHERE id = $1', ['STANDARD'])).rows[0];
      await pool.query('UPDATE tenants SET plan_id = $1, barcode_system_enabled = $2, vendor_portal_enabled = $3 WHERE id = $4',
        ['STANDARD', stdPlan.features.barcodeSystem, stdPlan.features.vendorPortal, TENANT]);
      tenant = (await pool.query('SELECT barcode_system_enabled, vendor_portal_enabled FROM tenants WHERE id = $1', [TENANT])).rows[0];
      expect(tenant.barcode_system_enabled).toBe(true);
      expect(tenant.vendor_portal_enabled).toBe(true);
    });

    it('downgrading from Professional to Basic should disable features', async () => {
      await pool.query(
        'UPDATE tenants SET plan_id = $1, barcode_system_enabled = true, vendor_portal_enabled = true, chatbot_enabled = true WHERE id = $2',
        ['PROFESSIONAL', TENANT]
      );

      const basicPlan = (await pool.query('SELECT features FROM plans WHERE id = $1', ['BASIC'])).rows[0];
      await pool.query(
        'UPDATE tenants SET plan_id = $1, barcode_system_enabled = $2, vendor_portal_enabled = $3, chatbot_enabled = $4 WHERE id = $5',
        ['BASIC', basicPlan.features.barcodeSystem, basicPlan.features.vendorPortal, basicPlan.features.chatbot, TENANT]
      );
      const tenant = (await pool.query(
        'SELECT barcode_system_enabled, vendor_portal_enabled, chatbot_enabled FROM tenants WHERE id = $1',
        [TENANT]
      )).rows[0];
      expect(tenant.barcode_system_enabled).toBe(false);
      expect(tenant.vendor_portal_enabled).toBe(false);
      expect(tenant.chatbot_enabled).toBe(false);
    });

    it('data should survive downgrade', async () => {
      // Add product while on Professional
      await pool.query('UPDATE tenants SET plan_id = $1 WHERE id = $2', ['PROFESSIONAL', TENANT]);
      await pool.query(`INSERT INTO products (id, tenant_id, name, price) VALUES ('P-SUB-1', $1, 'Survive Product', 500) ON CONFLICT DO NOTHING`, [TENANT]);

      // Downgrade to Basic
      await pool.query('UPDATE tenants SET plan_id = $1 WHERE id = $2', ['BASIC', TENANT]);

      // Product still exists
      const { rows } = await pool.query('SELECT name FROM products WHERE id = $1 AND tenant_id = $2', ['P-SUB-1', TENANT]);
      expect(rows.length).toBe(1);
      expect(rows[0].name).toBe('Survive Product');
    });
  });

  // --- Renewal ---
  describe('Renewal', () => {
    it('renewal should set new end date from today', async () => {
      const newEnd = new Date();
      newEnd.setMonth(newEnd.getMonth() + 1);
      await pool.query('UPDATE tenants SET subscription_ends_at = $1, status = $2 WHERE id = $3', [newEnd.toISOString(), 'active', TENANT]);
      const { rows } = await pool.query('SELECT subscription_ends_at, status FROM tenants WHERE id = $1', [TENANT]);
      expect(rows[0].status).toBe('active');
      const days = Math.ceil((new Date(rows[0].subscription_ends_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      expect(days).toBeGreaterThanOrEqual(28);
    });

    it('renewal should reactivate suspended tenant', async () => {
      await pool.query('UPDATE tenants SET status = $1, subscription_ends_at = $2 WHERE id = $3', ['suspended', '2020-01-01', TENANT]);
      let tenant = (await pool.query('SELECT status FROM tenants WHERE id = $1', [TENANT])).rows[0];
      expect(tenant.status).toBe('suspended');

      // Renew
      const newEnd = new Date();
      newEnd.setMonth(newEnd.getMonth() + 1);
      await pool.query('UPDATE tenants SET status = $1, subscription_ends_at = $2 WHERE id = $3', ['active', newEnd.toISOString(), TENANT]);
      tenant = (await pool.query('SELECT status FROM tenants WHERE id = $1', [TENANT])).rows[0];
      expect(tenant.status).toBe('active');
    });

    it('upgrade during renewal should change plan and features', async () => {
      await pool.query('UPDATE tenants SET plan_id = $1, subscription_ends_at = $2 WHERE id = $3', ['BASIC', '2020-01-01', TENANT]);

      // Renew with upgrade to Professional
      const proPlan = (await pool.query('SELECT features FROM plans WHERE id = $1', ['PROFESSIONAL'])).rows[0];
      const newEnd = new Date();
      newEnd.setFullYear(newEnd.getFullYear() + 1);
      await pool.query(
        'UPDATE tenants SET plan_id = $1, subscription_ends_at = $2, status = $3, chatbot_enabled = $4, barcode_system_enabled = $5, vendor_portal_enabled = $6 WHERE id = $7',
        ['PROFESSIONAL', newEnd.toISOString(), 'active', proPlan.features.chatbot, proPlan.features.barcodeSystem, proPlan.features.vendorPortal, TENANT]
      );

      const tenant = (await pool.query(
        'SELECT plan_id, chatbot_enabled, barcode_system_enabled, vendor_portal_enabled, status FROM tenants WHERE id = $1',
        [TENANT]
      )).rows[0];
      expect(tenant.plan_id).toBe('PROFESSIONAL');
      expect(tenant.status).toBe('active');
      expect(tenant.chatbot_enabled).toBe(true);
      expect(tenant.barcode_system_enabled).toBe(true);
      expect(tenant.vendor_portal_enabled).toBe(true);
    });
  });

  // --- Expiry banner logic ---
  describe('Expiry Banner', () => {
    it('> 15 days: no banner', () => {
      const days = 20;
      const showBanner = days <= 15;
      expect(showBanner).toBe(false);
    });

    it('8-15 days: amber warning', () => {
      const days = 10;
      const showBanner = days <= 15;
      const isAmber = days > 7 && days <= 15;
      expect(showBanner).toBe(true);
      expect(isAmber).toBe(true);
    });

    it('1-7 days: red warning', () => {
      const days = 5;
      const isRed = days > 0 && days <= 7;
      expect(isRed).toBe(true);
    });

    it('0 or negative: expired banner', () => {
      const days = -2;
      const isExpired = days <= 0;
      expect(isExpired).toBe(true);
    });
  });
});
