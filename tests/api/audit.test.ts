import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool, cleanupTestData } from '../helpers';

const TEST_TENANT = 'T-TEST-AUDIT';
const OTHER_TENANT = 'T-TEST-AUDIT2';

describe('Audit Log', () => {
  beforeAll(async () => {
    await cleanupTestData(TEST_TENANT);
    await cleanupTestData(OTHER_TENANT);
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status)
       VALUES ($1, 'Audit Co', 'test-audit', 'audit@test.com', 'Audit', 'active')
       ON CONFLICT (id) DO NOTHING`,
      [TEST_TENANT]
    );
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status)
       VALUES ($1, 'Audit2 Co', 'test-audit2', 'audit2@test.com', 'Audit2', 'active')
       ON CONFLICT (id) DO NOTHING`,
      [OTHER_TENANT]
    );
  });

  afterAll(async () => {
    await cleanupTestData(TEST_TENANT);
    await cleanupTestData(OTHER_TENANT);
  });

  it('should create an audit log entry', async () => {
    await pool.query(
      `INSERT INTO audit_log (tenant_id, user_id, user_name, action, entity_type, entity_id, details)
       VALUES ($1, 'U-AUD-1', 'Audit User', 'CREATE', 'product', 'P-AUD-1', 'Created product Alpha Pump')`,
      [TEST_TENANT]
    );
    const { rows } = await pool.query(
      "SELECT * FROM audit_log WHERE tenant_id = $1 AND action = 'CREATE' AND entity_type = 'product'",
      [TEST_TENANT]
    );
    expect(rows.length).toBe(1);
    expect(rows[0].details).toBe('Created product Alpha Pump');
  });

  it('audit should be scoped by tenant', async () => {
    await pool.query(
      `INSERT INTO audit_log (tenant_id, user_id, user_name, action, entity_type, entity_id, details)
       VALUES ($1, 'U-AUD-2', 'Other User', 'UPDATE', 'vendor', 'V-AUD-1', 'Updated vendor in other tenant')`,
      [OTHER_TENANT]
    );
    const t1 = await pool.query(
      'SELECT COUNT(*) as c FROM audit_log WHERE tenant_id = $1',
      [TEST_TENANT]
    );
    const t2 = await pool.query(
      'SELECT COUNT(*) as c FROM audit_log WHERE tenant_id = $1',
      [OTHER_TENANT]
    );
    expect(Number(t1.rows[0].c)).toBeGreaterThan(0);
    expect(Number(t2.rows[0].c)).toBeGreaterThan(0);
    // They should be independent
    const t1Rows = await pool.query(
      'SELECT * FROM audit_log WHERE tenant_id = $1',
      [TEST_TENANT]
    );
    const hasOtherTenant = t1Rows.rows.some(r => r.tenant_id === OTHER_TENANT);
    expect(hasOtherTenant).toBe(false);
  });

  it('audit should include user info', async () => {
    const { rows } = await pool.query(
      "SELECT user_id, user_name FROM audit_log WHERE tenant_id = $1 AND action = 'CREATE'",
      [TEST_TENANT]
    );
    expect(rows[0].user_id).toBe('U-AUD-1');
    expect(rows[0].user_name).toBe('Audit User');
  });

  it('audit should have timestamps', async () => {
    const { rows } = await pool.query(
      'SELECT created_at FROM audit_log WHERE tenant_id = $1 LIMIT 1',
      [TEST_TENANT]
    );
    expect(rows[0].created_at).toBeTruthy();
    const ts = new Date(rows[0].created_at);
    expect(ts.getTime()).toBeLessThanOrEqual(Date.now());
    expect(ts.getTime()).toBeGreaterThan(Date.now() - 60000); // within last minute
  });

  it('should query audit log by action type', async () => {
    await pool.query(
      `INSERT INTO audit_log (tenant_id, user_id, user_name, action, entity_type, entity_id, details)
       VALUES ($1, 'U-AUD-1', 'Audit User', 'DELETE', 'product', 'P-AUD-DEL', 'Deleted product')`,
      [TEST_TENANT]
    );
    await pool.query(
      `INSERT INTO audit_log (tenant_id, user_id, user_name, action, entity_type, entity_id, details)
       VALUES ($1, 'U-AUD-1', 'Audit User', 'UPDATE', 'product', 'P-AUD-1', 'Updated product price')`,
      [TEST_TENANT]
    );

    const creates = await pool.query(
      "SELECT * FROM audit_log WHERE tenant_id = $1 AND action = 'CREATE'",
      [TEST_TENANT]
    );
    const deletes = await pool.query(
      "SELECT * FROM audit_log WHERE tenant_id = $1 AND action = 'DELETE'",
      [TEST_TENANT]
    );
    const updates = await pool.query(
      "SELECT * FROM audit_log WHERE tenant_id = $1 AND action = 'UPDATE'",
      [TEST_TENANT]
    );

    expect(creates.rows.length).toBeGreaterThan(0);
    expect(deletes.rows.length).toBeGreaterThan(0);
    expect(updates.rows.length).toBeGreaterThan(0);
  });
});
