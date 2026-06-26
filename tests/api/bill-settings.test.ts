import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool, cleanupTestData } from '../helpers';

const TEST_TENANT = 'T-TEST-BILL';
const OTHER_TENANT = 'T-TEST-BILL2';

describe('Bill Settings', () => {
  beforeAll(async () => {
    await cleanupTestData(TEST_TENANT);
    await cleanupTestData(OTHER_TENANT);
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status)
       VALUES ($1, 'Bill Co', 'test-bill', 'bill@test.com', 'Bill', 'active')
       ON CONFLICT (id) DO NOTHING`,
      [TEST_TENANT]
    );
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status)
       VALUES ($1, 'Bill2 Co', 'test-bill2', 'bill2@test.com', 'Bill2', 'active')
       ON CONFLICT (id) DO NOTHING`,
      [OTHER_TENANT]
    );
  });

  afterAll(async () => {
    await cleanupTestData(TEST_TENANT);
    await cleanupTestData(OTHER_TENANT);
  });

  it('should create bill settings', async () => {
    await pool.query(
      `INSERT INTO bill_settings (tenant_id, primary_color, tagline, invoice_prefix, challan_prefix)
       VALUES ($1, '#F27D26', 'Quality First', 'INV-', 'CHN-')
       ON CONFLICT (tenant_id) DO NOTHING`,
      [TEST_TENANT]
    );
    const { rows } = await pool.query(
      'SELECT * FROM bill_settings WHERE tenant_id = $1',
      [TEST_TENANT]
    );
    expect(rows.length).toBe(1);
    expect(rows[0].tagline).toBe('Quality First');
    expect(rows[0].invoice_prefix).toBe('INV-');
  });

  it('should update logo with base64 data', async () => {
    const fakeBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    await pool.query(
      'UPDATE bill_settings SET logo_base64 = $1 WHERE tenant_id = $2',
      [fakeBase64, TEST_TENANT]
    );
    const { rows } = await pool.query(
      'SELECT logo_base64 FROM bill_settings WHERE tenant_id = $1',
      [TEST_TENANT]
    );
    expect(rows[0].logo_base64).toBe(fakeBase64);
    expect(rows[0].logo_base64).toContain('data:image/png;base64,');
  });

  it('should update primary color with hex value', async () => {
    const newColor = '#3B82F6';
    await pool.query(
      'UPDATE bill_settings SET primary_color = $1 WHERE tenant_id = $2',
      [newColor, TEST_TENANT]
    );
    const { rows } = await pool.query(
      'SELECT primary_color FROM bill_settings WHERE tenant_id = $1',
      [TEST_TENANT]
    );
    expect(rows[0].primary_color).toBe('#3B82F6');
    // Validate hex format
    expect(rows[0].primary_color).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it('should update bank details', async () => {
    await pool.query(
      `UPDATE bill_settings
       SET bank_account_name = $1, bank_account_number = $2, bank_name = $3, bank_branch = $4, bank_ifsc = $5, bank_upi_id = $6
       WHERE tenant_id = $7`,
      ['Bill Corp', '1234567890123', 'HDFC Bank', 'MG Road', 'HDFC0001234', 'bill@upi', TEST_TENANT]
    );
    const { rows } = await pool.query(
      'SELECT bank_account_name, bank_account_number, bank_name, bank_ifsc, bank_upi_id FROM bill_settings WHERE tenant_id = $1',
      [TEST_TENANT]
    );
    expect(rows[0].bank_account_name).toBe('Bill Corp');
    expect(rows[0].bank_account_number).toBe('1234567890123');
    expect(rows[0].bank_ifsc).toBe('HDFC0001234');
    expect(rows[0].bank_upi_id).toBe('bill@upi');
  });

  it('should update terms and conditions', async () => {
    const terms = '1. Goods once sold will not be returned.\n2. Warranty as per product policy.\n3. Subject to local jurisdiction.';
    await pool.query(
      'UPDATE bill_settings SET terms_and_conditions = $1 WHERE tenant_id = $2',
      [terms, TEST_TENANT]
    );
    const { rows } = await pool.query(
      'SELECT terms_and_conditions FROM bill_settings WHERE tenant_id = $1',
      [TEST_TENANT]
    );
    expect(rows[0].terms_and_conditions).toContain('Goods once sold');
    expect(rows[0].terms_and_conditions).toContain('Warranty as per product policy');
  });

  it('should toggle show/hide settings', async () => {
    await pool.query(
      'UPDATE bill_settings SET show_rewards = false, show_barcode = false, show_warranty = true WHERE tenant_id = $1',
      [TEST_TENANT]
    );
    const { rows } = await pool.query(
      'SELECT show_rewards, show_barcode, show_warranty FROM bill_settings WHERE tenant_id = $1',
      [TEST_TENANT]
    );
    expect(rows[0].show_rewards).toBe(false);
    expect(rows[0].show_barcode).toBe(false);
    expect(rows[0].show_warranty).toBe(true);

    // Toggle back
    await pool.query(
      'UPDATE bill_settings SET show_rewards = true, show_barcode = true WHERE tenant_id = $1',
      [TEST_TENANT]
    );
    const updated = (await pool.query(
      'SELECT show_rewards, show_barcode FROM bill_settings WHERE tenant_id = $1',
      [TEST_TENANT]
    )).rows[0];
    expect(updated.show_rewards).toBe(true);
    expect(updated.show_barcode).toBe(true);
  });

  it('bill settings should be scoped by tenant', async () => {
    await pool.query(
      `INSERT INTO bill_settings (tenant_id, primary_color, tagline)
       VALUES ($1, '#EF4444', 'Different Tenant')
       ON CONFLICT (tenant_id) DO NOTHING`,
      [OTHER_TENANT]
    );
    const t1 = (await pool.query('SELECT * FROM bill_settings WHERE tenant_id = $1', [TEST_TENANT])).rows;
    const t2 = (await pool.query('SELECT * FROM bill_settings WHERE tenant_id = $1', [OTHER_TENANT])).rows;

    expect(t1.length).toBe(1);
    expect(t2.length).toBe(1);
    expect(t1[0].primary_color).not.toBe(t2[0].primary_color);
    expect(t1[0].tagline).not.toBe(t2[0].tagline);
  });
});
