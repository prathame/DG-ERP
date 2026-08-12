import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool, cleanupTestData } from '../helpers';
import { uid } from '../../server/utils/helpers';
import { createBookVoucher } from '../../server/services/bookVouchers';
import { getFundBook } from '../../server/services/bookFinancialStatements';

/** Quick cash/bank entry posts receipt/payment with fund as contra — same as Fund Book Quick entry UI. */
const TENANT = 'T-TEST-QUICK-FUND';

async function seed() {
  await pool.query(
    `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, business_type)
     VALUES ($1,'Quick Fund Test',$2,'qf@test.com','QF','active','service')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT, `qf-${TENANT.toLowerCase()}`],
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
  const bank = uid('BL');
  const party = uid('BL');
  await pool.query(
    `INSERT INTO book_ledgers (id, tenant_id, name, group_id, nature, ledger_type, opening_balance, opening_side, external_ref)
     VALUES
       ($1,$4,'Cash Account',$5,'A','CS',1000,'D','ACASHACT'),
       ($2,$4,'HDFC Bank',$5,'A','BK',2000,'D','ops:BANK'),
       ($3,$4,'PARTY ONE',$5,'A','PR',0,'D','L-PARTY')`,
    [cash, bank, party, TENANT, g],
  );
  return { cash, bank, party };
}

describe('quick cash/bank entry (receipt/payment → fund book)', () => {
  beforeAll(async () => {
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, business_type)
       VALUES ($1,'Quick Fund Test',$2,'qf@test.com','QF','active','service')
       ON CONFLICT (id) DO NOTHING`,
      [TENANT, `qf-${TENANT.toLowerCase()}`],
    );
  });

  afterAll(async () => {
    await cleanupTestData(TENANT);
    await pool.query(`DELETE FROM tenants WHERE id = $1`, [TENANT]);
  });

  it('posts receipt and payment against cash and bank ledgers', async () => {
    await cleanupTestData(TENANT);
    const { cash, bank, party } = await seed();

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await createBookVoucher(client, TENANT, {
        voucherType: 'receipt',
        voucherDate: '2025-10-01',
        voucherNumber: 'CR/Q1',
        partyLedgerId: party,
        contraLedgerId: cash,
        amount: 250,
        narration: 'Quick cash in',
      });
      await createBookVoucher(client, TENANT, {
        voucherType: 'payment',
        voucherDate: '2025-10-02',
        voucherNumber: 'CP/Q1',
        partyLedgerId: party,
        contraLedgerId: cash,
        amount: 40,
        narration: 'Quick cash out',
      });
      await createBookVoucher(client, TENANT, {
        voucherType: 'receipt',
        voucherDate: '2025-10-03',
        voucherNumber: 'BR/Q1',
        partyLedgerId: party,
        contraLedgerId: bank,
        amount: 500,
        narration: 'Quick bank in',
      });
      await client.query('COMMIT');
    } finally {
      client.release();
    }

    const cashBook = await getFundBook(pool, TENANT, 'cash', '2025-10-01', '2025-10-31', cash);
    expect(cashBook.lines).toHaveLength(2);
    expect(cashBook.lines[0].debit).toBe(250);
    expect(cashBook.lines[1].credit).toBe(40);
    expect(cashBook.closing.balance).toBe(1210);

    const bankBook = await getFundBook(pool, TENANT, 'bank', '2025-10-01', '2025-10-31', bank);
    expect(bankBook.lines).toHaveLength(1);
    expect(bankBook.lines[0].debit).toBe(500);
    expect(bankBook.closing.balance).toBe(2500);
  });
});
