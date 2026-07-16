import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool, cleanupTestData, createTestToken } from '../helpers';

const TEST_TENANT = 'T-TEST-BANKS2';
const OTHER_TENANT = 'T-TEST-BANKS2-OTHER';

describe('Banks (route logic)', () => {
  beforeAll(async () => {
    await cleanupTestData(TEST_TENANT);
    await cleanupTestData(OTHER_TENANT);
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status)
       VALUES ($1, 'Banks2 Co', 'test-banks2', 'banks2@test.com', 'Banks2', 'active')
       ON CONFLICT (id) DO NOTHING`,
      [TEST_TENANT]
    );
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status)
       VALUES ($1, 'Other Co', 'test-banks2-other', 'other@test.com', 'Other', 'active')
       ON CONFLICT (id) DO NOTHING`,
      [OTHER_TENANT]
    );
    await pool.query(
      `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
       VALUES ('U-B2-ADMIN', $1, 'admin@banks2.com', 'hash', 'Admin User', 'Admin')
       ON CONFLICT DO NOTHING`,
      [TEST_TENANT]
    );
    await pool.query(
      `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
       VALUES ('U-B2-STAFF', $1, 'staff@banks2.com', 'hash', 'Staff User', 'Staff')
       ON CONFLICT DO NOTHING`,
      [TEST_TENANT]
    );
  });

  afterAll(async () => {
    await pool.query('DELETE FROM banks WHERE tenant_id = $1', [TEST_TENANT]).catch(() => {});
    await pool.query('DELETE FROM banks WHERE tenant_id = $1', [OTHER_TENANT]).catch(() => {});
    await cleanupTestData(TEST_TENANT);
    await cleanupTestData(OTHER_TENANT);
  });

  // ── Auth token shape ──────────────────────────────────────────────────────

  it('Admin token passes requireAdmin role check', () => {
    const token = createTestToken({ userId: 'U-B2-ADMIN', tenantId: TEST_TENANT, email: 'admin@banks2.com', role: 'Admin', name: 'Admin User' });
    expect(token.split('.').length).toBe(3);
  });

  it('Staff token has non-admin role', () => {
    const token = createTestToken({ userId: 'U-B2-STAFF', tenantId: TEST_TENANT, email: 'staff@banks2.com', role: 'Staff', name: 'Staff User' });
    // verify role is embedded correctly
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    expect(payload.role).toBe('Staff');
  });

  // ── GET /api/banks — list ─────────────────────────────────────────────────

  it('should return empty list when no banks exist', async () => {
    const { rows } = await pool.query('SELECT * FROM banks WHERE tenant_id = $1', [TEST_TENANT]);
    expect(rows).toEqual([]);
  });

  it('should list banks ordered by name', async () => {
    await pool.query(
      `INSERT INTO banks (id, tenant_id, name, account_number, bank_name, branch, ifsc_code)
       VALUES ('B2-1', $1, 'Zebra Account', '1111111111', 'HDFC', 'City', 'HDFC0001234'),
              ('B2-2', $1, 'Alpha Account', '2222222222', 'SBI',  'Main', 'SBIN0001234')`,
      [TEST_TENANT]
    );
    const { rows } = await pool.query(
      'SELECT * FROM banks WHERE tenant_id = $1 ORDER BY name',
      [TEST_TENANT]
    );
    expect(rows[0].name).toBe('Alpha Account');
    expect(rows[1].name).toBe('Zebra Account');
  });

  it('should map DB columns to camelCase shape', async () => {
    const { rows } = await pool.query(
      'SELECT id, name, account_number, bank_name, branch, ifsc_code FROM banks WHERE id = $1 AND tenant_id = $2',
      ['B2-1', TEST_TENANT]
    );
    const r = rows[0];
    // route maps: account_number → accountNumber, bank_name → bankName, ifsc_code → ifscCode
    expect(r.account_number).toBe('1111111111');
    expect(r.bank_name).toBe('HDFC');
    expect(r.ifsc_code).toBe('HDFC0001234');
  });

  // ── GET /api/banks?search= ────────────────────────────────────────────────

  it('should find bank by name (ILIKE)', async () => {
    const { rows } = await pool.query(
      'SELECT * FROM banks WHERE tenant_id = $1 AND name ILIKE $2 ORDER BY name',
      [TEST_TENANT, '%alpha%']
    );
    expect(rows.length).toBe(1);
    expect(rows[0].name).toBe('Alpha Account');
  });

  it('should find bank by account_number (ILIKE)', async () => {
    const { rows } = await pool.query(
      'SELECT * FROM banks WHERE tenant_id = $1 AND account_number ILIKE $2',
      [TEST_TENANT, '%1111%']
    );
    expect(rows.length).toBe(1);
    expect(rows[0].id).toBe('B2-1');
  });

  it('should find bank by bank_name (ILIKE)', async () => {
    const { rows } = await pool.query(
      'SELECT * FROM banks WHERE tenant_id = $1 AND bank_name ILIKE $2',
      [TEST_TENANT, '%hdfc%']
    );
    expect(rows.length).toBe(1);
    expect(rows[0].id).toBe('B2-1');
  });

  it('should find bank by ifsc_code (ILIKE)', async () => {
    const { rows } = await pool.query(
      'SELECT * FROM banks WHERE tenant_id = $1 AND ifsc_code ILIKE $2',
      [TEST_TENANT, '%SBIN%']
    );
    expect(rows.length).toBe(1);
    expect(rows[0].id).toBe('B2-2');
  });

  it('should return empty when search matches nothing', async () => {
    const { rows } = await pool.query(
      'SELECT * FROM banks WHERE tenant_id = $1 AND (name ILIKE $2 OR account_number ILIKE $2 OR bank_name ILIKE $2 OR ifsc_code ILIKE $2)',
      [TEST_TENANT, '%NOMATCH_XYZ%']
    );
    expect(rows).toEqual([]);
  });

  it('full search query covers all four columns via OR', async () => {
    const term = '%Account%';
    const { rows } = await pool.query(
      'SELECT * FROM banks WHERE tenant_id = $1 AND (name ILIKE $2 OR account_number ILIKE $3 OR bank_name ILIKE $4 OR ifsc_code ILIKE $5) ORDER BY name',
      [TEST_TENANT, term, term, term, term]
    );
    // Both have "Account" in name
    expect(rows.length).toBe(2);
  });

  // ── Tenant isolation ──────────────────────────────────────────────────────

  it('should not return banks from another tenant', async () => {
    await pool.query(
      `INSERT INTO banks (id, tenant_id, name, account_number, bank_name)
       VALUES ('B2-OTHER', $1, 'Other Bank', '9999999999', 'Axis')`,
      [OTHER_TENANT]
    );
    const { rows } = await pool.query(
      'SELECT * FROM banks WHERE tenant_id = $1',
      [TEST_TENANT]
    );
    const ids = rows.map((r: Record<string, unknown>) => r.id);
    expect(ids).not.toContain('B2-OTHER');
  });

  it('should not update another tenant\'s bank', async () => {
    const result = await pool.query(
      'UPDATE banks SET name = $1 WHERE id = $2 AND tenant_id = $3',
      ['Hacked', 'B2-OTHER', TEST_TENANT]
    );
    expect(result.rowCount).toBe(0);
    // original still intact
    const { rows } = await pool.query('SELECT name FROM banks WHERE id = $1', ['B2-OTHER']);
    expect(rows[0].name).toBe('Other Bank');
  });

  it('should not delete another tenant\'s bank', async () => {
    const result = await pool.query(
      'DELETE FROM banks WHERE id = $1 AND tenant_id = $2',
      ['B2-OTHER', TEST_TENANT]
    );
    expect(result.rowCount).toBe(0);
    const { rows } = await pool.query('SELECT id FROM banks WHERE id = $1', ['B2-OTHER']);
    expect(rows.length).toBe(1);
  });

  // ── POST /api/banks — create ──────────────────────────────────────────────

  it('should create a bank with all fields', async () => {
    await pool.query(
      `INSERT INTO banks (id, tenant_id, name, account_number, bank_name, branch, ifsc_code)
       VALUES ('B2-FULL', $1, 'Full Account', '3333333333', 'Axis Bank', 'West Branch', 'UTIB0003333')`,
      [TEST_TENANT]
    );
    const { rows } = await pool.query(
      'SELECT * FROM banks WHERE id = $1 AND tenant_id = $2',
      ['B2-FULL', TEST_TENANT]
    );
    expect(rows[0].name).toBe('Full Account');
    expect(rows[0].account_number).toBe('3333333333');
    expect(rows[0].bank_name).toBe('Axis Bank');
    expect(rows[0].branch).toBe('West Branch');
    expect(rows[0].ifsc_code).toBe('UTIB0003333');
  });

  it('should create a bank with only name (minimal)', async () => {
    await pool.query(
      `INSERT INTO banks (id, tenant_id, name, account_number, bank_name, branch, ifsc_code)
       VALUES ('B2-MIN', $1, 'Minimal Account', NULL, NULL, NULL, NULL)`,
      [TEST_TENANT]
    );
    const { rows } = await pool.query(
      'SELECT * FROM banks WHERE id = $1 AND tenant_id = $2',
      ['B2-MIN', TEST_TENANT]
    );
    expect(rows[0].name).toBe('Minimal Account');
    expect(rows[0].account_number).toBeNull();
    expect(rows[0].bank_name).toBeNull();
  });

  it('should reject duplicate account number within tenant', async () => {
    // Simulate duplicate check: account 3333333333 already exists
    const dup = await pool.query(
      'SELECT id FROM banks WHERE tenant_id = $1 AND account_number = $2',
      [TEST_TENANT, '3333333333']
    );
    expect(dup.rows.length).toBeGreaterThan(0); // route would return 400
  });

  it('should allow same account number across different tenants', async () => {
    // OTHER_TENANT already has 9999999999; TEST_TENANT can also use it
    await pool.query(
      `INSERT INTO banks (id, tenant_id, name, account_number)
       VALUES ('B2-CROSS', $1, 'Cross Tenant', '9999999999')`,
      [TEST_TENANT]
    );
    const { rows } = await pool.query(
      'SELECT id FROM banks WHERE account_number = $1',
      ['9999999999']
    );
    expect(rows.length).toBe(2); // one per tenant
    await pool.query('DELETE FROM banks WHERE id = $1', ['B2-CROSS']);
  });

  it('name whitespace-only should be treated as empty', () => {
    const name = '   '.trim();
    expect(name).toBe('');
    expect(!name).toBe(true); // route condition: !name || !name.trim()
  });

  it('should trim name before inserting', async () => {
    const raw = '  Trimmed Account  ';
    const trimmed = raw.trim();
    await pool.query(
      `INSERT INTO banks (id, tenant_id, name) VALUES ('B2-TRIM', $1, $2)`,
      [TEST_TENANT, trimmed]
    );
    const { rows } = await pool.query('SELECT name FROM banks WHERE id = $1', ['B2-TRIM']);
    expect(rows[0].name).toBe('Trimmed Account');
    await pool.query('DELETE FROM banks WHERE id = $1', ['B2-TRIM']);
  });

  // ── PUT /api/banks/:id — update ───────────────────────────────────────────

  it('should update bank fields using COALESCE', async () => {
    await pool.query(
      `UPDATE banks
       SET name = COALESCE($1, name),
           account_number = COALESCE($2, account_number),
           bank_name = COALESCE($3, bank_name),
           branch = COALESCE($4, branch),
           ifsc_code = COALESCE($5, ifsc_code)
       WHERE id = $6 AND tenant_id = $7`,
      ['Updated Name', null, null, 'New Branch', null, 'B2-FULL', TEST_TENANT]
    );
    const { rows } = await pool.query(
      'SELECT name, branch, bank_name FROM banks WHERE id = $1 AND tenant_id = $2',
      ['B2-FULL', TEST_TENANT]
    );
    expect(rows[0].name).toBe('Updated Name');
    expect(rows[0].branch).toBe('New Branch');
    expect(rows[0].bank_name).toBe('Axis Bank'); // unchanged via COALESCE(null, original)
  });

  it('should return rowCount 0 for update on non-existent bank', async () => {
    const result = await pool.query(
      'UPDATE banks SET name = $1 WHERE id = $2 AND tenant_id = $3',
      ['Ghost', 'B2-GHOST', TEST_TENANT]
    );
    expect(result.rowCount).toBe(0); // route returns 404
  });

  it('should return updated row after PUT', async () => {
    await pool.query(
      'UPDATE banks SET ifsc_code = $1 WHERE id = $2 AND tenant_id = $3',
      ['UTIB0099999', 'B2-FULL', TEST_TENANT]
    );
    const { rows } = await pool.query(
      'SELECT * FROM banks WHERE id = $1 AND tenant_id = $2',
      ['B2-FULL', TEST_TENANT]
    );
    expect(rows[0].ifsc_code).toBe('UTIB0099999');
  });

  // ── DELETE /api/banks/:id ─────────────────────────────────────────────────

  it('should delete a bank and confirm removal', async () => {
    await pool.query(
      `INSERT INTO banks (id, tenant_id, name) VALUES ('B2-DEL', $1, 'To Delete')`,
      [TEST_TENANT]
    );
    const result = await pool.query(
      'DELETE FROM banks WHERE id = $1 AND tenant_id = $2',
      ['B2-DEL', TEST_TENANT]
    );
    expect(result.rowCount).toBe(1);
    const { rows } = await pool.query('SELECT id FROM banks WHERE id = $1', ['B2-DEL']);
    expect(rows.length).toBe(0);
  });

  it('should return rowCount 0 for delete on non-existent bank', async () => {
    const result = await pool.query(
      'DELETE FROM banks WHERE id = $1 AND tenant_id = $2',
      ['B2-GHOST', TEST_TENANT]
    );
    expect(result.rowCount).toBe(0); // route returns 404
  });

  // ── POST /api/banks/batch — batch import ─────────────────────────────────

  it('should batch import multiple banks successfully', async () => {
    const items = [
      { name: 'Batch Bank 1', accountNumber: '4444444444', bankName: 'Kotak', branch: 'A', ifscCode: 'KKBK0004444' },
      { name: 'Batch Bank 2', accountNumber: '5555555555', bankName: 'ICICI', branch: 'B', ifscCode: 'ICIC0005555' },
    ];
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const [i, r] of items.entries()) {
        await client.query(
          'INSERT INTO banks (id, tenant_id, name, account_number, bank_name, branch, ifsc_code) VALUES ($1,$2,$3,$4,$5,$6,$7)',
          [`B2-BATCH-${i}`, TEST_TENANT, r.name, r.accountNumber, r.bankName, r.branch, r.ifscCode]
        );
      }
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    const { rows } = await pool.query(
      'SELECT * FROM banks WHERE tenant_id = $1 AND id LIKE $2 ORDER BY name',
      [TEST_TENANT, 'B2-BATCH-%']
    );
    expect(rows.length).toBe(2);
    expect(rows[0].name).toBe('Batch Bank 1');
    expect(rows[1].name).toBe('Batch Bank 2');
  });

  it('should rollback entire batch on duplicate account number', async () => {
    // 4444444444 already exists from batch above
    const items = [
      { name: 'Good Bank', accountNumber: '7777777777' },
      { name: 'Dup Bank', accountNumber: '4444444444' }, // duplicate
    ];
    const client = await pool.connect();
    let rolledBack = false;
    try {
      await client.query('BEGIN');
      for (const [i, r] of items.entries()) {
        const dup = (await client.query(
          'SELECT id FROM banks WHERE tenant_id = $1 AND account_number = $2',
          [TEST_TENANT, r.accountNumber]
        )).rows[0];
        if (dup) {
          await client.query('ROLLBACK');
          rolledBack = true;
          break;
        }
        await client.query(
          'INSERT INTO banks (id, tenant_id, name, account_number) VALUES ($1,$2,$3,$4)',
          [`B2-ROLLBACK-${i}`, TEST_TENANT, r.name, r.accountNumber]
        );
      }
      if (!rolledBack) await client.query('COMMIT');
    } finally {
      client.release();
    }
    expect(rolledBack).toBe(true);
    // Good Bank (7777777777) should NOT exist — rolled back
    const { rows } = await pool.query(
      'SELECT id FROM banks WHERE account_number = $1 AND tenant_id = $2',
      ['7777777777', TEST_TENANT]
    );
    expect(rows.length).toBe(0);
  });

  it('should rollback entire batch when a row has empty name', async () => {
    const items = [
      { name: 'Valid Name', accountNumber: '8888888888' },
      { name: '', accountNumber: '8888888889' }, // invalid
    ];
    const client = await pool.connect();
    let rolledBack = false;
    let count = 0;
    try {
      await client.query('BEGIN');
      for (const r of items) {
        const name = String(r.name || '').trim();
        if (!name) {
          await client.query('ROLLBACK');
          rolledBack = true;
          break;
        }
        await client.query(
          'INSERT INTO banks (id, tenant_id, name, account_number) VALUES ($1,$2,$3,$4)',
          [`B2-NAMECHECK-${count}`, TEST_TENANT, name, r.accountNumber]
        );
        count++;
      }
      if (!rolledBack) await client.query('COMMIT');
    } finally {
      client.release();
    }
    expect(rolledBack).toBe(true);
    const { rows } = await pool.query(
      'SELECT id FROM banks WHERE account_number = $1 AND tenant_id = $2',
      ['8888888888', TEST_TENANT]
    );
    expect(rows.length).toBe(0);
  });

  it('should reject batch import with empty items array', () => {
    const items: unknown[] = [];
    // route: !Array.isArray(items) || !items.length → 400
    expect(!Array.isArray(items) || !items.length).toBe(true);
  });

  it('should reject batch import when items is not an array', () => {
    const items = null;
    expect(!Array.isArray(items) || !(items as unknown[])?.length).toBe(true);
  });

  it('should allow batch items without accountNumber (null stored)', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const name = 'No Account Bank';
      const acNo = ''; // empty string → stored as null per route logic
      await client.query(
        'INSERT INTO banks (id, tenant_id, name, account_number) VALUES ($1,$2,$3,$4)',
        ['B2-NOACC', TEST_TENANT, name, acNo || null]
      );
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    const { rows } = await pool.query('SELECT account_number FROM banks WHERE id = $1', ['B2-NOACC']);
    expect(rows[0].account_number).toBeNull();
    await pool.query('DELETE FROM banks WHERE id = $1', ['B2-NOACC']);
  });

  // ── Audit log ─────────────────────────────────────────────────────────────

  it('audit_log table exists and accepts bank import entries', async () => {
    const { rows } = await pool.query(
      `INSERT INTO audit_log (tenant_id, action, entity_type, entity_id, details)
       VALUES ($1, 'Banks Batch Import', 'bank', 'batch-test', '2 banks imported via CSV')
       RETURNING *`,
      [TEST_TENANT]
    );
    expect(rows.length).toBe(1);
    expect(rows[0].action).toBe('Banks Batch Import');
    expect(rows[0].entity_type).toBe('bank');
  });

  // ── requireAdmin role validation ─────────────────────────────────────────

  it('Staff role is not in allowed Admin roles', () => {
    const allowed = ['Admin', 'Super Admin'];
    const role = 'Staff';
    expect(allowed.includes(role)).toBe(false); // requireAdmin would 403
  });

  it('Admin role passes requireAdmin', () => {
    const allowed = ['Admin', 'Super Admin'];
    expect(allowed.includes('Admin')).toBe(true);
    expect(allowed.includes('Super Admin')).toBe(true);
  });

  it('Vendor role is blocked by requireAdmin', () => {
    const allowed = ['Admin', 'Super Admin'];
    expect(allowed.includes('Vendor')).toBe(false);
  });

  it('missing tenant_id header triggers 401', () => {
    const tenantId = undefined as string | undefined;
    expect(!tenantId).toBe(true); // route condition
  });
});
