/**
 * Financial year listing, creation, and closing.
 *
 * Seeds a minimal COA, posts vouchers in FY 2024-25, then closes the year.
 * Verifies: FY list, FY create, FY close carry-forward logic (P&L zeroed,
 * balance-sheet carried, net profit folded into capital ledger, period lock
 * set, next FY created).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool, createTestToken, cleanupTestData } from '../helpers';
import { api, authHeaders } from '../http';

const T = 'T-FY-CLOSE-001';
const U_ADMIN = 'U-FY-ADMIN';
const U_STAFF = 'U-FY-STAFF';

const G_ASSET = 'GRP-FYC-ASSET';
const G_INCOME = 'GRP-FYC-INC';
const G_EXPENSE = 'GRP-FYC-EXP';
const G_CAPITAL = 'GRP-FYC-CAP';
const L_CASH = 'LDG-FYC-CASH';
const L_SALES = 'LDG-FYC-SALES';
const L_RENT = 'LDG-FYC-RENT';
const L_CAPITAL = 'LDG-FYC-CAP';
const FY_ID = 'FY-FYC-2425';

const adminToken = createTestToken({
  userId: U_ADMIN,
  tenantId: T,
  email: 'fyadmin@test.com',
  role: 'Admin',
  name: 'FY Admin',
});
const staffToken = createTestToken({
  userId: U_STAFF,
  tenantId: T,
  email: 'fystaff@test.com',
  role: 'Staff',
  name: 'FY Staff',
});
const adminHdrs = authHeaders(adminToken, T);
const staffHdrs = authHeaders(staffToken, T);

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

beforeAll(async () => {
  await cleanupTestData(T);

  await pool.query(
    `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, plan_id)
     VALUES ($1,'FY Close Corp','fy-close-corp','fyadmin@test.com','FY Admin','active','TRIAL')
     ON CONFLICT (id) DO NOTHING`,
    [T],
  );
  const bcrypt = await import('bcrypt');
  const hash = await bcrypt.hash('Test1234!', 10);
  await pool.query(
    `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
     VALUES ($1,$2,'fyadmin@test.com',$3,'FY Admin','Admin'),
            ($4,$2,'fystaff@test.com',$3,'FY Staff','Staff')
     ON CONFLICT DO NOTHING`,
    [U_ADMIN, T, hash, U_STAFF],
  );

  // Account groups
  await pool.query(
    `INSERT INTO book_account_groups (id, tenant_id, name, nature) VALUES
     ($1,$2,'Current Assets','A'),
     ($3,$2,'Direct Income','I'),
     ($4,$2,'Direct Expenses','E'),
     ($5,$2,'Capital Account','Capital')
     ON CONFLICT DO NOTHING`,
    [G_ASSET, T, G_INCOME, G_EXPENSE, G_CAPITAL],
  );

  // Ledgers with opening balances
  await pool.query(
    `INSERT INTO book_ledgers (id, tenant_id, name, group_id, nature, ledger_type, opening_balance, opening_side) VALUES
     ($1,$2,'Cash',$3,'A','CS',50000,'Dr'),
     ($4,$2,'Sales',$5,'I','IN',0,'Cr'),
     ($6,$2,'Rent Expense',$7,'E','EX',0,'Dr'),
     ($8,$2,'Capital',$9,'Capital',null,100000,'Cr')
     ON CONFLICT DO NOTHING`,
    [L_CASH, T, G_ASSET, L_SALES, G_INCOME, L_RENT, G_EXPENSE, L_CAPITAL, G_CAPITAL],
  );

  // FY 2024-25
  await pool.query(
    `INSERT INTO book_financial_years (id, tenant_id, code, label, start_date, end_date, is_active)
     VALUES ($1,$2,'YR24','FY 2024-25','2024-04-01','2025-03-31',true)
     ON CONFLICT DO NOTHING`,
    [FY_ID, T],
  );

  // Post vouchers within FY 2024-25:
  // Sales receipt: Dr Cash 30000, Cr Sales 30000
  await api()
    .post('/api/books/vouchers')
    .set(adminHdrs)
    .send({
      voucherType: 'receipt',
      voucherDate: '2024-06-15',
      partyLedgerId: L_SALES,
      contraLedgerId: L_CASH,
      amount: 30000,
      narration: 'Sales revenue',
    })
    .expect(201);

  // Rent payment: Dr Rent 12000, Cr Cash 12000
  await api()
    .post('/api/books/vouchers')
    .set(adminHdrs)
    .send({
      voucherType: 'payment',
      voucherDate: '2024-09-10',
      partyLedgerId: L_RENT,
      contraLedgerId: L_CASH,
      amount: 12000,
      narration: 'Office rent',
    })
    .expect(201);
});

afterAll(async () => {
  await cleanupTestData(T);
});

// ─── FY List ─────────────────────────────────────────────────────────────────

describe('GET /api/books/financial-years', () => {
  it('lists financial years', async () => {
    const res = await api().get('/api/books/financial-years').set(adminHdrs).expect(200);
    expect(res.body).toBeInstanceOf(Array);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    const fy = res.body.find((f: { id: string }) => f.id === FY_ID);
    expect(fy).toBeDefined();
    expect(fy.code).toBe('YR24');
    expect(fy.isActive).toBe(true);
    expect(fy.startDate).toBe('2024-04-01');
    expect(fy.endDate).toBe('2025-03-31');
  });
});

// ─── FY Create ───────────────────────────────────────────────────────────────

describe('POST /api/books/financial-years', () => {
  it('rejects non-admin', async () => {
    await api()
      .post('/api/books/financial-years')
      .set(staffHdrs)
      .send({ startDate: '2025-04-01', endDate: '2026-03-31' })
      .expect(403);
  });

  it('rejects missing dates', async () => {
    await api().post('/api/books/financial-years').set(adminHdrs).send({}).expect(400);
  });

  it('rejects start >= end', async () => {
    await api()
      .post('/api/books/financial-years')
      .set(adminHdrs)
      .send({ startDate: '2026-03-31', endDate: '2025-04-01' })
      .expect(400);
  });

  it('creates a new FY', async () => {
    const res = await api()
      .post('/api/books/financial-years')
      .set(adminHdrs)
      .send({ startDate: '2025-04-01', endDate: '2026-03-31' })
      .expect(201);
    expect(res.body.code).toBe('YR25');
    expect(res.body.label).toBe('FY 2025-26');
    expect(res.body.isActive).toBe(true);
  });
});

// ─── FY Close ────────────────────────────────────────────────────────────────

describe('POST /api/books/financial-years/:id/close', () => {
  it('rejects non-admin', async () => {
    await api().post(`/api/books/financial-years/${FY_ID}/close`).set(staffHdrs).expect(403);
  });

  it('rejects unknown FY', async () => {
    await api().post('/api/books/financial-years/NONEXISTENT/close').set(adminHdrs).expect(404);
  });

  it('closes FY 2024-25 and carries forward balances', async () => {
    const res = await api().post(`/api/books/financial-years/${FY_ID}/close`).set(adminHdrs).expect(200);

    expect(res.body.closed).toBe(true);
    expect(res.body.label).toBe('FY 2024-25');
    // Net profit = Sales 30000 - Rent 12000 = 18000
    expect(r2(res.body.netProfit)).toBe(18000);
    expect(res.body.ledgersUpdated).toBeGreaterThanOrEqual(4);
  });

  it('marks FY as inactive after close', async () => {
    const res = await api().get('/api/books/financial-years').set(adminHdrs).expect(200);
    const closed = res.body.find((f: { id: string }) => f.id === FY_ID);
    expect(closed.isActive).toBe(false);
  });

  it('creates next FY (2025-26) automatically', async () => {
    const res = await api().get('/api/books/financial-years').set(adminHdrs).expect(200);
    const next = res.body.find((f: { code: string }) => f.code === 'YR25');
    expect(next).toBeDefined();
    expect(next.isActive).toBe(true);
  });

  it('zeroes income/expense opening balances', async () => {
    // Sales and Rent should have opening_balance = 0
    const { rows } = await pool.query(
      `SELECT id, name, opening_balance, opening_side FROM book_ledgers WHERE tenant_id = $1 AND id IN ($2, $3)`,
      [T, L_SALES, L_RENT],
    );
    for (const r of rows) {
      expect(r2(Number(r.opening_balance))).toBe(0);
    }
  });

  it('carries forward balance-sheet balances', async () => {
    // Cash: opened 50000 Dr + received 30000 - paid 12000 = 68000 Dr
    const cash = (
      await pool.query(`SELECT opening_balance, opening_side FROM book_ledgers WHERE id = $1 AND tenant_id = $2`, [
        L_CASH,
        T,
      ])
    ).rows[0];
    expect(r2(Number(cash.opening_balance))).toBe(68000);
    expect(cash.opening_side).toBe('Dr');
  });

  it('folds net profit into capital-type ledger', async () => {
    // Look for Profit & Loss A/c or Capital ledger with profit added
    const { rows } = await pool.query(
      `SELECT l.name, l.opening_balance, l.opening_side FROM book_ledgers l
       JOIN book_account_groups g ON g.id = l.group_id AND g.tenant_id = l.tenant_id
       WHERE l.tenant_id = $1 AND (LOWER(g.nature) = 'capital' OR LOWER(l.nature) = 'capital')`,
      [T],
    );
    // Total capital-side opening should include original 100000 + profit 18000
    const totalCapital = rows.reduce((sum, r) => {
      const val = Number(r.opening_balance) || 0;
      return sum + (r.opening_side === 'Cr' ? val : -val);
    }, 0);
    expect(r2(totalCapital)).toBe(118000);
  });

  it('sets period lock to FY end date', async () => {
    const res = await api().get('/api/books/summary').set(adminHdrs).expect(200);
    expect(res.body.lockDate).toBe('2025-03-31');
  });

  it('rejects closing an already-closed FY', async () => {
    await api().post(`/api/books/financial-years/${FY_ID}/close`).set(adminHdrs).expect(400);
  });

  it('audit-logs the close event', async () => {
    // Use a dedicated connection with tenant context set to bypass FORCE RLS
    const client = await pool.connect();
    try {
      await client.query(`SELECT set_config('app.tenant_id', $1, false)`, [T]);
      const { rows } = await client.query(
        `SELECT action, entity_type, entity_id, details FROM audit_log
         WHERE tenant_id = $1 AND entity_type = 'financial_year' AND action = 'CLOSE'`,
        [T],
      );
      expect(rows.length).toBeGreaterThanOrEqual(1);
      expect(rows[0].entity_id).toBe(FY_ID);
      expect(rows[0].details).toContain('18000');
    } finally {
      client.release();
    }
  });
});

// ─── requireAdmin on financial deletes ───────────────────────────────────────

describe('requireAdmin on financial DELETE endpoints', () => {
  let expenseId: string;

  beforeAll(async () => {
    // Create an expense as admin for staff to try to delete
    const res = await api()
      .post('/api/expenses')
      .set(adminHdrs)
      .send({ description: 'Test expense', amount: 500, date: '2025-05-01', category: 'Office' })
      .expect(201);
    expenseId = res.body.id;
  });

  it('Staff cannot delete expenses (403)', async () => {
    await api().delete(`/api/expenses/${expenseId}`).set(staffHdrs).expect(403);
  });

  it('Admin can delete expenses', async () => {
    const res = await api().delete(`/api/expenses/${expenseId}`).set(adminHdrs).expect(200);
    expect(res.body.ok).toBe(true);
  });
});
