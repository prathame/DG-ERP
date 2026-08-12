import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool, cleanupTestData } from '../helpers';
import { uid } from '../../server/utils/helpers';
import { createBookVoucher } from '../../server/services/bookVouchers';
import { getTradingAccount } from '../../server/services/bookFinancialStatements';

const TENANT = 'T-TEST-TRADING-AC';

async function seed() {
  await pool.query(
    `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, business_type)
     VALUES ($1,'Trading Ac Test',$2,'ta@test.com','TA','active','service')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT, `ta-${TENANT.toLowerCase()}`],
  );
  const fy = uid('BF');
  await pool.query(
    `INSERT INTO book_financial_years (id, tenant_id, code, label, is_active, external_ref)
     VALUES ($1,$2,'YR25','FY 2025-26',true,'YR25')
     ON CONFLICT (tenant_id, code) DO UPDATE SET is_active = true`,
    [fy, TENANT],
  );
  const gAsset = uid('BG');
  const gInc = uid('BG');
  const gExp = uid('BG');
  await pool.query(
    `INSERT INTO book_account_groups (id, tenant_id, name, nature, external_ref)
     VALUES
       ($1,$4,'Current Assets','A','G-CA'),
       ($2,$4,'Income','I','G-IN'),
       ($3,$4,'Purchases','E','G-PU')`,
    [gAsset, gInc, gExp, TENANT],
  );
  const cash = uid('BL');
  const stock = uid('BL');
  const sales = uid('BL');
  const purchase = uid('BL');
  const trading = uid('BL');
  await pool.query(
    `INSERT INTO book_ledgers (id, tenant_id, name, group_id, nature, ledger_type, opening_balance, opening_side, external_ref)
     VALUES
       ($1,$6,'Cash',$7,'A','CS',0,'D','L-CASH'),
       ($2,$6,'Stock Account',$7,'A','GL',1000,'D','L-STOCK'),
       ($3,$6,'Sales Income',$8,'I','IN',0,'C','L-SALES'),
       ($4,$6,'Purchase Account',$9,'E','EX',0,'D','L-PUR'),
       ($5,$6,'Job Work Trading',$8,'T','TS',0,'C','L-TRADE')`,
    [cash, stock, sales, purchase, trading, TENANT, gAsset, gInc, gExp],
  );
  return { cash, stock, sales, purchase, trading };
}

describe('getTradingAccount', () => {
  beforeAll(async () => {
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, business_type)
       VALUES ($1,'Trading Ac Test',$2,'ta@test.com','TA','active','service')
       ON CONFLICT (id) DO NOTHING`,
      [TENANT, `ta-${TENANT.toLowerCase()}`],
    );
  });

  afterAll(async () => {
    await cleanupTestData(TENANT);
    await pool.query(`DELETE FROM tenants WHERE id = $1`, [TENANT]);
  });

  it('builds debit/credit with opening stock, sales, purchase and gross profit', async () => {
    await cleanupTestData(TENANT);
    const { cash, sales, purchase, trading } = await seed();

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await createBookVoucher(client, TENANT, {
        voucherType: 'journal',
        voucherDate: '2025-05-10',
        voucherNumber: 'JV/S1',
        narration: 'Sales',
        entries: [
          { ledgerId: cash, debit: 5000, credit: 0 },
          { ledgerId: sales, debit: 0, credit: 5000 },
        ],
      });
      await createBookVoucher(client, TENANT, {
        voucherType: 'journal',
        voucherDate: '2025-05-12',
        voucherNumber: 'JV/P1',
        narration: 'Purchase',
        entries: [
          { ledgerId: purchase, debit: 2000, credit: 0 },
          { ledgerId: cash, debit: 0, credit: 2000 },
        ],
      });
      await createBookVoucher(client, TENANT, {
        voucherType: 'journal',
        voucherDate: '2025-05-15',
        voucherNumber: 'JV/T1',
        narration: 'Trading credit',
        entries: [
          { ledgerId: cash, debit: 300, credit: 0 },
          { ledgerId: trading, debit: 0, credit: 300 },
        ],
      });
      await client.query('COMMIT');
    } finally {
      client.release();
    }

    const ac = await getTradingAccount(pool, TENANT, '2025-05-01', '2025-05-31');
    expect(ac.debit.some(l => /opening stock/i.test(l.name) && l.amount === 1000)).toBe(true);
    expect(ac.debit.some(l => /purchase/i.test(l.name) && l.amount === 2000)).toBe(true);
    expect(ac.credit.some(l => /sales/i.test(l.name) && l.amount === 5000)).toBe(true);
    expect(ac.credit.some(l => /trading/i.test(l.name) && l.amount === 300)).toBe(true);
    // Opening 1000 + Purchase 2000 = 3000 Dr; Sales 5000 + Trading 300 + Closing stock 1000 = 6300 Cr
    // Gross profit = 6300 - 3000 = 3300 (before GP plug on debit)
    expect(ac.grossProfit).toBe(3300);
    expect(ac.grossLabel).toBe('Gross profit');
    expect(ac.totalDebit).toBe(ac.totalCredit);
    expect(ac.debit.some(l => /gross profit/i.test(l.name))).toBe(true);
  });
});
