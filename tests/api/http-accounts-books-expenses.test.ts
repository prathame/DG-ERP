/**
 * Accounts P&L and Cash Flow must include Books expense vouchers when the desk has data
 * (same source as Analytics / Purchases → Expenses).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool, createTestToken, cleanupTestData } from '../helpers';
import { api, authHeaders } from '../http';

const T = 'T-ACCT-BOOKS-EXP';
const U = 'U-ACCT-BOOKS-EXP';

const L_CASH = 'LDG-ACCT-CASH';
const L_PURCHASE = 'LDG-ACCT-PURCH';
const G_ASSET = 'GRP-ACCT-ASSET';
const G_EXPENSE = 'GRP-ACCT-EXP';

const token = createTestToken({
  userId: U,
  tenantId: T,
  email: 'acct-books@test.com',
  role: 'Admin',
  name: 'Acct Books',
});
const hdrs = authHeaders(token, T);

const FROM = '2025-04-01';
const TO = '2026-03-31';
const EXPENSE_DATE = '2026-03-15';
const EXPENSE_AMOUNT = 7500;

beforeAll(async () => {
  await cleanupTestData(T);

  await pool.query(
    `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, plan_id)
     VALUES ($1,'Acct Books Co','acct-books-co','acct-books@test.com','Acct','active','TRIAL')
     ON CONFLICT (id) DO NOTHING`,
    [T],
  );
  const bcrypt = await import('bcrypt');
  const hash = await bcrypt.hash('Test1234!', 10);
  await pool.query(
    `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
     VALUES ($1,$2,'acct-books@test.com',$3,'Acct','Admin') ON CONFLICT DO NOTHING`,
    [U, T, hash],
  );

  await pool.query(
    `INSERT INTO book_account_groups (id, tenant_id, name, nature, external_ref) VALUES
     ($1,$2,'Assets','A','ops:G-ASSET'),
     ($3,$2,'Expenses','E','ops:G-EXP')
     ON CONFLICT DO NOTHING`,
    [G_ASSET, T, G_EXPENSE],
  );

  await pool.query(
    `INSERT INTO book_ledgers (id, tenant_id, name, group_id, nature, ledger_type, is_system) VALUES
     ($1,$2,'Cash Account',$3,'A','CS',true),
     ($4,$2,'Tools Expense',$5,'E','EX',false)
     ON CONFLICT DO NOTHING`,
    [L_CASH, T, G_ASSET, L_PURCHASE, G_EXPENSE],
  );

  await pool.query(
    `INSERT INTO book_financial_years (id, tenant_id, code, label, start_date, end_date, is_active)
     VALUES ('FY-ACCT-EXP',$1,'2025-26','FY 2025-26','2025-04-01','2026-03-31',true)
     ON CONFLICT DO NOTHING`,
    [T],
  );

  const pay = await api().post('/api/books/vouchers').set(hdrs).send({
    voucherType: 'payment',
    voucherDate: EXPENSE_DATE,
    amount: EXPENSE_AMOUNT,
    partyLedgerId: L_PURCHASE,
    contraLedgerId: L_CASH,
  });
  expect(pay.status).toBe(201);
});

afterAll(async () => {
  await cleanupTestData(T);
});

describe('Accounts books expense alignment', () => {
  it('P&L otherExpenses includes Books payment vouchers', async () => {
    const r = await api().get(`/api/accounts/profit-loss?from=${FROM}&to=${TO}`).set(hdrs);
    expect(r.status).toBe(200);
    expect(r.body.expenses.otherExpenses).toBeGreaterThanOrEqual(EXPENSE_AMOUNT);
    expect(r.body.expenses.total).toBeGreaterThanOrEqual(EXPENSE_AMOUNT);
  });

  it('Cash flow outflows.expenses includes Books payment vouchers', async () => {
    const r = await api().get(`/api/accounts/cash-flow?from=${FROM}&to=${TO}`).set(hdrs);
    expect(r.status).toBe(200);
    expect(r.body.outflows.expenses).toBeGreaterThanOrEqual(EXPENSE_AMOUNT);
    const mar = (r.body.monthly as { month: string; expenses: number }[]).find(m => m.month === '2026-03');
    expect(mar?.expenses ?? 0).toBeGreaterThanOrEqual(EXPENSE_AMOUNT);
  });

  it('Analytics expenses match accounts P&L otherExpenses for the period', async () => {
    const [pnl, overview] = await Promise.all([
      api().get(`/api/accounts/profit-loss?from=${FROM}&to=${TO}`).set(hdrs),
      api().get(`/api/analytics/overview?from=${FROM}&to=${TO}`).set(hdrs),
    ]);
    expect(pnl.status).toBe(200);
    expect(overview.status).toBe(200);
    expect(Math.abs(pnl.body.expenses.otherExpenses - overview.body.money.expenses)).toBeLessThan(0.05);
  });
});
