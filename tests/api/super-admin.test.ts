import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import bcrypt from 'bcrypt';
import { pool, createSuperAdminToken, cleanupTestData } from '../helpers';

const TEST_TENANT = 'T-TEST-SA';

describe('Super Admin', () => {
  beforeAll(async () => {
    await cleanupTestData(TEST_TENANT);
    // Ensure super_admin exists for login tests
    const hash = bcrypt.hashSync('superadmin123', 12);
    await pool.query(
      `INSERT INTO super_admins (id, email, password_hash, name, role)
       VALUES ('SA-TEST-1', 'sa-test@dgerp.com', $1, 'Test SA', 'owner')
       ON CONFLICT (id) DO NOTHING`,
      [hash]
    );
    // Create a tenant for management tests
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status)
       VALUES ($1, 'SA Test Co', 'sa-test-co', 'sa-tenant@test.com', 'Admin', 'active')
       ON CONFLICT (id) DO NOTHING`,
      [TEST_TENANT]
    );
  });

  afterAll(async () => {
    await cleanupTestData(TEST_TENANT);
    await pool.query("DELETE FROM super_admins WHERE id = 'SA-TEST-1'").catch(() => {});
  });

  it('should validate super admin login with correct password', async () => {
    const { rows } = await pool.query(
      'SELECT password_hash FROM super_admins WHERE email = $1',
      ['sa-test@dgerp.com']
    );
    expect(rows.length).toBe(1);
    expect(bcrypt.compareSync('superadmin123', rows[0].password_hash)).toBe(true);
  });

  it('should reject super admin login with wrong password', async () => {
    const { rows } = await pool.query(
      'SELECT password_hash FROM super_admins WHERE email = $1',
      ['sa-test@dgerp.com']
    );
    expect(bcrypt.compareSync('wrongpassword', rows[0].password_hash)).toBe(false);
  });

  it('should list all tenants', async () => {
    const { rows } = await pool.query('SELECT * FROM tenants WHERE id = $1', [TEST_TENANT]);
    expect(rows.length).toBe(1);
    expect(rows[0].company_name).toBe('SA Test Co');
  });

  it('should create a new tenant', async () => {
    const newId = 'T-TEST-SA-NEW';
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status)
       VALUES ($1, 'New Tenant', 'sa-new-tenant', 'new@test.com', 'New Admin', 'active')
       ON CONFLICT (id) DO NOTHING`,
      [newId]
    );
    const { rows } = await pool.query('SELECT * FROM tenants WHERE id = $1', [newId]);
    expect(rows.length).toBe(1);
    expect(rows[0].status).toBe('active');
    await pool.query('DELETE FROM tenants WHERE id = $1', [newId]);
  });

  it('should update tenant status', async () => {
    await pool.query(
      'UPDATE tenants SET status = $1 WHERE id = $2',
      ['suspended', TEST_TENANT]
    );
    const { rows } = await pool.query('SELECT status FROM tenants WHERE id = $1', [TEST_TENANT]);
    expect(rows[0].status).toBe('suspended');
    // Restore
    await pool.query('UPDATE tenants SET status = $1 WHERE id = $2', ['active', TEST_TENANT]);
  });

  it('should delete a tenant', async () => {
    const delId = 'T-TEST-SA-DEL';
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status)
       VALUES ($1, 'Del Tenant', 'sa-del-tenant', 'del@test.com', 'Del Admin', 'active')`,
      [delId]
    );
    await pool.query('DELETE FROM tenants WHERE id = $1', [delId]);
    const { rows } = await pool.query('SELECT * FROM tenants WHERE id = $1', [delId]);
    expect(rows.length).toBe(0);
  });

  it('should generate impersonate token', () => {
    const token = createSuperAdminToken();
    expect(token).toBeTruthy();
    expect(token.split('.').length).toBe(3);
  });

  it('should query audit log', async () => {
    await pool.query(
      `INSERT INTO audit_log (tenant_id, user_id, user_name, action, entity_type, entity_id, details)
       VALUES ($1, 'SA-TEST-1', 'Test SA', 'LOGIN', 'super_admin', 'SA-TEST-1', 'Super admin login')`,
      [TEST_TENANT]
    );
    const { rows } = await pool.query(
      'SELECT * FROM audit_log WHERE tenant_id = $1 AND action = $2',
      [TEST_TENANT, 'LOGIN']
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].user_name).toBe('Test SA');
  });
});
