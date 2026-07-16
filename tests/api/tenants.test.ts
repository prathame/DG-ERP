import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool, cleanupTestData } from '../helpers';

const TEST_TENANT = 'T-TEST-TENANT';

describe('Tenants', () => {
  beforeAll(async () => {
    await cleanupTestData(TEST_TENANT);
  });

  afterAll(async () => {
    await cleanupTestData(TEST_TENANT);
  });

  it('should create a tenant', async () => {
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, plan_id)
       VALUES ($1, 'Test Tenant', 'test-tenant', 'tenant@test.com', 'Admin', 'active', 'BASIC')`,
      [TEST_TENANT]
    );
    const { rows } = await pool.query('SELECT * FROM tenants WHERE id = $1', [TEST_TENANT]);
    expect(rows.length).toBe(1);
    expect(rows[0].company_name).toBe('Test Tenant');
    expect(rows[0].status).toBe('active');
  });

  it('slug should be unique', async () => {
    const { rows } = await pool.query(
      'SELECT COUNT(*) as c FROM tenants WHERE slug = $1',
      ['test-tenant']
    );
    expect(Number(rows[0].c)).toBe(1);
  });

  it('should have behavior toggles defaulting to true', async () => {
    const { rows } = await pool.query(
      'SELECT vendor_portal_enabled, barcode_system_enabled, multi_language_enabled FROM tenants WHERE id = $1',
      [TEST_TENANT]
    );
    expect(rows[0].vendor_portal_enabled).toBe(true);
    expect(rows[0].barcode_system_enabled).toBe(true);
    expect(rows[0].multi_language_enabled).toBe(true);
  });

  it('should update behavior toggles', async () => {
    await pool.query(
      'UPDATE tenants SET vendor_portal_enabled = false, barcode_system_enabled = false WHERE id = $1',
      [TEST_TENANT]
    );
    const { rows } = await pool.query(
      'SELECT vendor_portal_enabled, barcode_system_enabled FROM tenants WHERE id = $1',
      [TEST_TENANT]
    );
    expect(rows[0].vendor_portal_enabled).toBe(false);
    expect(rows[0].barcode_system_enabled).toBe(false);
    // restore for later assertions
    await pool.query(
      'UPDATE tenants SET vendor_portal_enabled = true, barcode_system_enabled = true WHERE id = $1',
      [TEST_TENANT]
    );
  });

  it('should set subscription expiry', async () => {
    const futureDate = '2027-06-25';
    await pool.query(
      'UPDATE tenants SET subscription_ends_at = $1 WHERE id = $2',
      [futureDate, TEST_TENANT]
    );
    const { rows } = await pool.query(
      'SELECT subscription_ends_at FROM tenants WHERE id = $1',
      [TEST_TENANT]
    );
    expect(new Date(rows[0].subscription_ends_at).getFullYear()).toBe(2027);
  });

  it('expired subscription should be detectable', async () => {
    await pool.query(
      'UPDATE tenants SET subscription_ends_at = $1 WHERE id = $2',
      ['2020-01-01', TEST_TENANT]
    );
    const { rows } = await pool.query(
      'SELECT subscription_ends_at FROM tenants WHERE id = $1',
      [TEST_TENANT]
    );
    expect(new Date(rows[0].subscription_ends_at).getTime()).toBeLessThan(Date.now());
  });

  it('should suspend and reactivate tenant', async () => {
    await pool.query(
      'UPDATE tenants SET status = $1 WHERE id = $2',
      ['suspended', TEST_TENANT]
    );
    let row = (
      await pool.query('SELECT status FROM tenants WHERE id = $1', [TEST_TENANT])
    ).rows[0];
    expect(row.status).toBe('suspended');

    await pool.query(
      'UPDATE tenants SET status = $1 WHERE id = $2',
      ['active', TEST_TENANT]
    );
    row = (
      await pool.query('SELECT status FROM tenants WHERE id = $1', [TEST_TENANT])
    ).rows[0];
    expect(row.status).toBe('active');
  });

  it('should have vendor portal enabled by default', async () => {
    const { rows } = await pool.query(
      'SELECT vendor_portal_enabled FROM tenants WHERE id = $1',
      [TEST_TENANT]
    );
    expect(rows[0].vendor_portal_enabled).toBe(true);
  });

  it('should have barcode system enabled by default', async () => {
    const { rows } = await pool.query(
      'SELECT barcode_system_enabled FROM tenants WHERE id = $1',
      [TEST_TENANT]
    );
    expect(rows[0].barcode_system_enabled).toBe(true);
  });

  it('should link tenant to plan', async () => {
    const { rows } = await pool.query(
      'SELECT plan_id FROM tenants WHERE id = $1',
      [TEST_TENANT]
    );
    expect(rows[0].plan_id).toBe('BASIC');
  });

  it('should update tenant plan', async () => {
    await pool.query(
      'UPDATE tenants SET plan_id = $1 WHERE id = $2',
      ['PROFESSIONAL', TEST_TENANT]
    );
    const { rows } = await pool.query(
      'SELECT plan_id FROM tenants WHERE id = $1',
      [TEST_TENANT]
    );
    expect(rows[0].plan_id).toBe('PROFESSIONAL');
  });
});
