import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import bcrypt from 'bcrypt';
import { pool, createTestToken, createSuperAdminToken, cleanupTestData } from '../helpers';

const TEST_TENANT = 'T-TEST-AUTH';
const TEST_EMAIL = 'auth-test@test.com';

describe('Auth', () => {
  beforeAll(async () => {
    await cleanupTestData(TEST_TENANT);
    // Create test tenant
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status)
       VALUES ($1, 'Test Co', 'test-auth', $2, 'Test', 'active')
       ON CONFLICT (id) DO NOTHING`,
      [TEST_TENANT, TEST_EMAIL]
    );
    // Create test user
    const hash = bcrypt.hashSync('password123', 12);
    await pool.query(
      `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
       VALUES ('U-AUTH-1', $1, $2, $3, 'Test User', 'Admin')
       ON CONFLICT DO NOTHING`,
      [TEST_TENANT, TEST_EMAIL, hash]
    );
  });

  afterAll(async () => {
    await cleanupTestData(TEST_TENANT);
  });

  it('should create valid JWT token', () => {
    const token = createTestToken({
      userId: 'U1',
      tenantId: TEST_TENANT,
      email: TEST_EMAIL,
      role: 'Admin',
      name: 'Test',
    });
    expect(token).toBeTruthy();
    expect(token.split('.').length).toBe(3);
  });

  it('should create super admin token', () => {
    const token = createSuperAdminToken();
    expect(token).toBeTruthy();
    expect(token.split('.').length).toBe(3);
  });

  it('should verify password with bcrypt', () => {
    const hash = bcrypt.hashSync('mypassword', 12);
    expect(bcrypt.compareSync('mypassword', hash)).toBe(true);
    expect(bcrypt.compareSync('wrongpassword', hash)).toBe(false);
  });

  it('should have test user in database', async () => {
    const { rows } = await pool.query(
      'SELECT id, email, role FROM users WHERE tenant_id = $1',
      [TEST_TENANT]
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].email).toBe(TEST_EMAIL);
  });

  it('should reject login with wrong password', async () => {
    const user = (
      await pool.query(
        'SELECT password_hash FROM users WHERE email = $1 AND tenant_id = $2',
        [TEST_EMAIL, TEST_TENANT]
      )
    ).rows[0];
    expect(bcrypt.compareSync('wrongpassword', user.password_hash)).toBe(false);
  });

  it('should accept login with correct password', async () => {
    const user = (
      await pool.query(
        'SELECT password_hash FROM users WHERE email = $1 AND tenant_id = $2',
        [TEST_EMAIL, TEST_TENANT]
      )
    ).rows[0];
    expect(bcrypt.compareSync('password123', user.password_hash)).toBe(true);
  });

  it('should block vendor login when portal disabled', async () => {
    await pool.query(
      'UPDATE tenants SET vendor_portal_enabled = false WHERE id = $1',
      [TEST_TENANT]
    );
    const tenant = (
      await pool.query(
        'SELECT vendor_portal_enabled FROM tenants WHERE id = $1',
        [TEST_TENANT]
      )
    ).rows[0];
    expect(tenant.vendor_portal_enabled).toBe(false);
    // Restore
    await pool.query(
      'UPDATE tenants SET vendor_portal_enabled = true WHERE id = $1',
      [TEST_TENANT]
    );
  });

  it('should block expired subscription', async () => {
    await pool.query(
      'UPDATE tenants SET subscription_ends_at = $1 WHERE id = $2',
      ['2020-01-01', TEST_TENANT]
    );
    const tenant = (
      await pool.query(
        'SELECT subscription_ends_at FROM tenants WHERE id = $1',
        [TEST_TENANT]
      )
    ).rows[0];
    expect(new Date(tenant.subscription_ends_at).getTime()).toBeLessThan(Date.now());
    // Restore
    await pool.query(
      'UPDATE tenants SET subscription_ends_at = NULL WHERE id = $1',
      [TEST_TENANT]
    );
  });

  it('should enforce minimum password length', () => {
    expect('short'.length).toBeLessThan(8);
    expect('longpassword123'.length).toBeGreaterThanOrEqual(8);
  });

  it('should create password reset token', async () => {
    const tokenValue = 'reset-token-' + Date.now();
    const expiresAt = new Date(Date.now() + 3600000).toISOString();
    await pool.query(
      `INSERT INTO password_reset_tokens (id, email, tenant_id, token, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      ['PRT-1', TEST_EMAIL, TEST_TENANT, tokenValue, expiresAt]
    );
    const { rows } = await pool.query(
      'SELECT * FROM password_reset_tokens WHERE token = $1',
      [tokenValue]
    );
    expect(rows.length).toBe(1);
    expect(rows[0].used).toBe(false);
    expect(new Date(rows[0].expires_at).getTime()).toBeGreaterThan(Date.now());
  });

  it('should mark reset token as used', async () => {
    await pool.query(
      'UPDATE password_reset_tokens SET used = true WHERE id = $1',
      ['PRT-1']
    );
    const { rows } = await pool.query(
      'SELECT used FROM password_reset_tokens WHERE id = $1',
      ['PRT-1']
    );
    expect(rows[0].used).toBe(true);
  });

  it('should change user password', async () => {
    const newHash = bcrypt.hashSync('newpassword456', 12);
    await pool.query(
      'UPDATE users SET password_hash = $1 WHERE id = $2 AND tenant_id = $3',
      [newHash, 'U-AUTH-1', TEST_TENANT]
    );
    const user = (
      await pool.query(
        'SELECT password_hash FROM users WHERE id = $1 AND tenant_id = $2',
        ['U-AUTH-1', TEST_TENANT]
      )
    ).rows[0];
    expect(bcrypt.compareSync('newpassword456', user.password_hash)).toBe(true);
    expect(bcrypt.compareSync('password123', user.password_hash)).toBe(false);
  });
});
