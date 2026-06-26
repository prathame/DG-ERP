import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool, cleanupTestData } from '../helpers';

const TEST_TENANT = 'T-TEST-BANK';

describe('Banks', () => {
  beforeAll(async () => {
    await cleanupTestData(TEST_TENANT);
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status)
       VALUES ($1, 'Bank Co', 'test-bank', 'bank@test.com', 'Bank', 'active')
       ON CONFLICT (id) DO NOTHING`,
      [TEST_TENANT]
    );
  });

  afterAll(async () => {
    await pool.query('DELETE FROM banks WHERE tenant_id = $1', [TEST_TENANT]).catch(() => {});
    await cleanupTestData(TEST_TENANT);
  });

  it('should create a bank', async () => {
    await pool.query(
      `INSERT INTO banks (id, tenant_id, name, account_number, bank_name, branch, ifsc_code)
       VALUES ('B-1', $1, 'Primary Account', '1234567890', 'State Bank', 'Main Branch', 'SBIN0001234')`,
      [TEST_TENANT]
    );
    const { rows } = await pool.query(
      'SELECT * FROM banks WHERE id = $1 AND tenant_id = $2',
      ['B-1', TEST_TENANT]
    );
    expect(rows.length).toBe(1);
    expect(rows[0].name).toBe('Primary Account');
    expect(rows[0].ifsc_code).toBe('SBIN0001234');
  });

  it('should list banks for tenant', async () => {
    await pool.query(
      `INSERT INTO banks (id, tenant_id, name, account_number, bank_name, branch, ifsc_code)
       VALUES ('B-2', $1, 'Secondary Account', '9876543210', 'HDFC Bank', 'City Branch', 'HDFC0005678')`,
      [TEST_TENANT]
    );
    const { rows } = await pool.query(
      'SELECT * FROM banks WHERE tenant_id = $1 ORDER BY name',
      [TEST_TENANT]
    );
    expect(rows.length).toBe(2);
  });

  it('should update bank details', async () => {
    await pool.query(
      'UPDATE banks SET branch = $1, ifsc_code = $2 WHERE id = $3 AND tenant_id = $4',
      ['Updated Branch', 'SBIN0009999', 'B-1', TEST_TENANT]
    );
    const { rows } = await pool.query(
      'SELECT branch, ifsc_code FROM banks WHERE id = $1 AND tenant_id = $2',
      ['B-1', TEST_TENANT]
    );
    expect(rows[0].branch).toBe('Updated Branch');
    expect(rows[0].ifsc_code).toBe('SBIN0009999');
  });

  it('should delete a bank', async () => {
    await pool.query(
      'DELETE FROM banks WHERE id = $1 AND tenant_id = $2',
      ['B-2', TEST_TENANT]
    );
    const { rows } = await pool.query(
      'SELECT * FROM banks WHERE id = $1 AND tenant_id = $2',
      ['B-2', TEST_TENANT]
    );
    expect(rows.length).toBe(0);
  });

  it('bank should be linked to tenant', async () => {
    const { rows } = await pool.query(
      'SELECT tenant_id FROM banks WHERE id = $1',
      ['B-1']
    );
    expect(rows[0].tenant_id).toBe(TEST_TENANT);
  });
});
