import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool, cleanupTestData } from '../helpers';
import { uid } from '../../server/utils/helpers';
import { createBookVoucher } from '../../server/services/bookVouchers';
import { getFundBook } from '../../server/services/bookFinancialStatements';

const TENANT = 'T-TEST-FUND-BOOK';

async function seed() {
  await pool.query(
    `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, business_type)
     VALUES ($1,'Fund Book Test',$2,'fb@test.com','FB','active','service')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT, `fb-${TENANT.toLowerCase()}`],
  );
  const fy = uid('BF');
  await pool.query(
    `INSERT INTO book_financial_years (id, tenant_id, code, label, is_active, external_ref)
     VALUES ($1,$2,'YR25','FY 2025-26',true,'YR25')
     ON CONFLICT (tenant_id, code) DO UPDATE SET is_active = true`,
    [fy, TENANT],
  );
  const g = uid('BG');
  await pool.query(
    `INSERT INTO book_account_groups (id, tenant_id, name, nature, external_ref)
     VALUES ($1,$2,'Current Assets','A','G-CA')`,
    [g, TENANT],
  );
  const cash = uid('BL');
  const spareCash = uid('BL');
  const bank = uid('BL');
  const party = uid('BL');
  await pool.query(
    `INSERT INTO book_ledgers (id, tenant_id, name, group_id, nature, ledger_type, opening_balance, opening_side, external_ref)
     VALUES
       ($1,$5,'Petty Cash',$6,'A','CS',100,'D','L-PETTY'),
       ($2,$5,'Cash Account',$6,'A','CS',4000,'D','ACASHACT'),
       ($3,$5,'HDFC Bank',$6,'A','BK',1000,'D','ops:BANK'),
       ($4,$5,'PARTY ONE',$6,'A','PR',0,'D','L-PARTY')`,
    [spareCash, cash, bank, party, TENANT, g],
  );
  return { cash, spareCash, bank, party };
}

describe('getFundBook (cash / bank book)', () => {
  beforeAll(async () => {
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, business_type)
       VALUES ($1,'Fund Book Test',$2,'fb@test.com','FB','active','service')
       ON CONFLICT (id) DO NOTHING`,
      [TENANT, `fb-${TENANT.toLowerCase()}`],
    );
  });

  afterAll(async () => {
    await cleanupTestData(TENANT);
    await pool.query(`DELETE FROM tenants WHERE id = $1`, [TENANT]);
  });

  it('builds cash book with opening, particulars, running balance; prefers ACASHACT', async () => {
    await cleanupTestData(TENANT);
    const { cash, spareCash, party } = await seed();

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await createBookVoucher(client, TENANT, {
        voucherType: 'receipt',
        voucherDate: '2025-05-10',
        voucherNumber: 'CR/1',
        partyLedgerId: party,
        contraLedgerId: cash,
        amount: 500,
        narration: 'Cash received',
      });
      await createBookVoucher(client, TENANT, {
        voucherType: 'payment',
        voucherDate: '2025-05-15',
        voucherNumber: 'CP/1',
        partyLedgerId: party,
        contraLedgerId: cash,
        amount: 200,
        narration: 'Cash paid',
      });
      await client.query('COMMIT');
    } finally {
      client.release();
    }

    const book = await getFundBook(pool, TENANT, 'cash', '2025-05-01', '2025-05-31');
    expect(book.ledger?.id).toBe(cash);
    expect(book.ledger?.externalRef).toBe('ACASHACT');
    expect(book.accounts.map(a => a.id).sort()).toEqual([cash, spareCash].sort());
    expect(book.opening.balance).toBe(4000);
    expect(book.lines).toHaveLength(2);
    expect(book.lines[0].debit).toBe(500);
    expect(book.lines[0].particulars).toMatch(/PARTY ONE/i);
    expect(book.lines[1].credit).toBe(200);
    expect(book.totals).toEqual({ debit: 500, credit: 200 });
    expect(book.closing.balance).toBe(4300);

    const picked = await getFundBook(pool, TENANT, 'cash', '2025-05-01', '2025-05-31', spareCash);
    expect(picked.ledger?.id).toBe(spareCash);
    expect(picked.opening.balance).toBe(100);
    expect(picked.lines).toHaveLength(0);
  });

  it('builds bank book and returns empty shell when no bank ledgers', async () => {
    await cleanupTestData(TENANT);
    const { bank, party } = await seed();

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await createBookVoucher(client, TENANT, {
        voucherType: 'receipt',
        voucherDate: '2025-06-01',
        voucherNumber: 'BR/1',
        partyLedgerId: party,
        contraLedgerId: bank,
        amount: 300,
        narration: 'Bank deposit',
      });
      await client.query('COMMIT');
    } finally {
      client.release();
    }

    const book = await getFundBook(pool, TENANT, 'bank', '2025-06-01', '2025-06-30');
    expect(book.ledger?.id).toBe(bank);
    expect(book.opening.balance).toBe(1000);
    expect(book.lines).toHaveLength(1);
    expect(book.lines[0].debit).toBe(300);
    expect(book.closing.balance).toBe(1300);

    await cleanupTestData(TENANT);
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, business_type)
       VALUES ($1,'Fund Book Test',$2,'fb@test.com','FB','active','service')
       ON CONFLICT (id) DO NOTHING`,
      [TENANT, `fb-${TENANT.toLowerCase()}`],
    );
    const empty = await getFundBook(pool, TENANT, 'bank', null, null);
    expect(empty.ledger).toBeNull();
    expect(empty.lines).toEqual([]);
  });
});
