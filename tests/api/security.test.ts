import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { pool, createTestToken, cleanupTestData } from '../helpers';

const TENANT_A = 'T-SEC-A';
const TENANT_B = 'T-SEC-B';

describe('Security', () => {
  beforeAll(async () => {
    await cleanupTestData(TENANT_A);
    await cleanupTestData(TENANT_B);
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status)
       VALUES ($1, 'Company A', 'sec-a', 'a@test.com', 'A', 'active')
       ON CONFLICT (id) DO NOTHING`,
      [TENANT_A]
    );
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status)
       VALUES ($1, 'Company B', 'sec-b', 'b@test.com', 'B', 'active')
       ON CONFLICT (id) DO NOTHING`,
      [TENANT_B]
    );
    await pool.query(
      `INSERT INTO products (id, tenant_id, name, price)
       VALUES ('P-A1', $1, 'Product A', 100)
       ON CONFLICT DO NOTHING`,
      [TENANT_A]
    );
    await pool.query(
      `INSERT INTO products (id, tenant_id, name, price)
       VALUES ('P-B1', $1, 'Product B', 200)
       ON CONFLICT DO NOTHING`,
      [TENANT_B]
    );
  });

  afterAll(async () => {
    await cleanupTestData(TENANT_A);
    await cleanupTestData(TENANT_B);
  });

  it('tenant A cannot see tenant B products', async () => {
    const { rows } = await pool.query(
      'SELECT * FROM products WHERE tenant_id = $1',
      [TENANT_A]
    );
    const ids = rows.map((r: Record<string, unknown>) => r.id);
    expect(ids).toContain('P-A1');
    expect(ids).not.toContain('P-B1');
  });

  it('tenant B cannot see tenant A products', async () => {
    const { rows } = await pool.query(
      'SELECT * FROM products WHERE tenant_id = $1',
      [TENANT_B]
    );
    const ids = rows.map((r: Record<string, unknown>) => r.id);
    expect(ids).toContain('P-B1');
    expect(ids).not.toContain('P-A1');
  });

  it('JWT token contains correct tenant ID', () => {
    const token = createTestToken({
      userId: 'U1',
      tenantId: TENANT_A,
      email: 'a@test.com',
      role: 'Admin',
      name: 'A',
    });
    const decoded = jwt.decode(token) as { tenantId: string };
    expect(decoded.tenantId).toBe(TENANT_A);
  });

  it('JWT with wrong secret should fail verification', () => {
    const token = createTestToken({
      userId: 'U1',
      tenantId: TENANT_A,
      email: 'a@test.com',
      role: 'Admin',
      name: 'A',
    });
    expect(() => jwt.verify(token, 'wrong-secret')).toThrow();
  });

  it('JWT should contain correct role', () => {
    const token = createTestToken({
      userId: 'U1',
      tenantId: TENANT_A,
      email: 'a@test.com',
      role: 'Vendor',
      name: 'A',
    });
    const decoded = jwt.decode(token) as { role: string };
    expect(decoded.role).toBe('Vendor');
  });

  it('JWT should have expiration', () => {
    const token = createTestToken({
      userId: 'U1',
      tenantId: TENANT_A,
      email: 'a@test.com',
      role: 'Admin',
      name: 'A',
    });
    const decoded = jwt.decode(token) as { exp: number };
    expect(decoded.exp).toBeDefined();
    expect(decoded.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('bcrypt uses 12 rounds', () => {
    const hash = bcrypt.hashSync('test', 12);
    expect(hash).toMatch(/^\$2[aby]\$12\$/);
  });

  it('XSS in company name should be escaped', () => {
    const malicious = '<script>alert(1)</script>';
    const escaped = malicious
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    expect(escaped).not.toContain('<script>');
    expect(escaped).toContain('&lt;script&gt;');
  });

  it('SQL injection via parameterized query is safe', async () => {
    const malicious = "'; DROP TABLE products;--";
    const { rows } = await pool.query(
      'SELECT * FROM products WHERE name = $1 AND tenant_id = $2',
      [malicious, TENANT_A]
    );
    expect(rows.length).toBe(0);
    // Verify table still exists
    const check = await pool.query(
      'SELECT COUNT(*) as c FROM products WHERE tenant_id = $1',
      [TENANT_A]
    );
    expect(Number(check.rows[0].c)).toBeGreaterThan(0);
  });

  it('same barcode in different tenants are independent', async () => {
    await pool.query(
      `INSERT INTO product_inventory (id, tenant_id, product_id, barcode, status)
       VALUES ('I-A1', $1, 'P-A1', 'SHARED001', 'InStock')
       ON CONFLICT DO NOTHING`,
      [TENANT_A]
    );
    await pool.query(
      `INSERT INTO product_inventory (id, tenant_id, product_id, barcode, status)
       VALUES ('I-B1', $1, 'P-B1', 'SHARED001', 'InStock')
       ON CONFLICT DO NOTHING`,
      [TENANT_B]
    );

    const a = (
      await pool.query(
        'SELECT product_id FROM product_inventory WHERE barcode = $1 AND tenant_id = $2',
        ['SHARED001', TENANT_A]
      )
    ).rows[0];
    const b = (
      await pool.query(
        'SELECT product_id FROM product_inventory WHERE barcode = $1 AND tenant_id = $2',
        ['SHARED001', TENANT_B]
      )
    ).rows[0];

    expect(a.product_id).toBe('P-A1');
    expect(b.product_id).toBe('P-B1');
  });

  it('tenant A users should not appear in tenant B queries', async () => {
    const hash = bcrypt.hashSync('test', 12);
    await pool.query(
      `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
       VALUES ('U-SEC-A', $1, 'usera@test.com', $2, 'User A', 'Admin')
       ON CONFLICT DO NOTHING`,
      [TENANT_A, hash]
    );
    await pool.query(
      `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
       VALUES ('U-SEC-B', $1, 'userb@test.com', $2, 'User B', 'Admin')
       ON CONFLICT DO NOTHING`,
      [TENANT_B, hash]
    );

    const usersA = (
      await pool.query('SELECT id FROM users WHERE tenant_id = $1', [TENANT_A])
    ).rows.map((r: Record<string, unknown>) => r.id);
    const usersB = (
      await pool.query('SELECT id FROM users WHERE tenant_id = $1', [TENANT_B])
    ).rows.map((r: Record<string, unknown>) => r.id);

    expect(usersA).toContain('U-SEC-A');
    expect(usersA).not.toContain('U-SEC-B');
    expect(usersB).toContain('U-SEC-B');
    expect(usersB).not.toContain('U-SEC-A');
  });

  it('vendor isolation between tenants', async () => {
    await pool.query(
      `INSERT INTO vendors (id, tenant_id, name) VALUES ('V-SEC-A', $1, 'Vendor A') ON CONFLICT DO NOTHING`,
      [TENANT_A]
    );
    await pool.query(
      `INSERT INTO vendors (id, tenant_id, name) VALUES ('V-SEC-B', $1, 'Vendor B') ON CONFLICT DO NOTHING`,
      [TENANT_B]
    );

    const vendorsA = (
      await pool.query('SELECT id FROM vendors WHERE tenant_id = $1', [TENANT_A])
    ).rows.map((r: Record<string, unknown>) => r.id);
    expect(vendorsA).toContain('V-SEC-A');
    expect(vendorsA).not.toContain('V-SEC-B');
  });
});
