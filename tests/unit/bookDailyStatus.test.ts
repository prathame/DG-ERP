import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool, cleanupTestData } from '../helpers';
import { uid } from '../../server/utils/helpers';
import { getBooksDailyStatus } from '../../server/services/bookDailyStatus';

const TENANT = 'T-TEST-BOOK-DAILY-STATUS';

describe('bookDailyStatus', () => {
  beforeAll(async () => {
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, business_type)
       VALUES ($1,'Daily Status Test',$2,'ds@test.com','DS','active','service')
       ON CONFLICT (id) DO NOTHING`,
      [TENANT, `ds-${TENANT.toLowerCase()}`],
    );
  });

  afterAll(async () => {
    await cleanupTestData(TENANT);
    await pool.query(`DELETE FROM tenants WHERE id = $1`, [TENANT]);
  });

  it('rejects bad dates and aggregates day vouchers', async () => {
    await expect(getBooksDailyStatus(pool, TENANT, '12-08-2025')).rejects.toThrow(/YYYY-MM-DD/);

    await cleanupTestData(TENANT);
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, business_type)
       VALUES ($1,'Daily Status Test',$2,'ds@test.com','DS','active','service')
       ON CONFLICT (id) DO NOTHING`,
      [TENANT, `ds-${TENANT.toLowerCase()}`],
    );

    const fy = uid('BF');
    const g = uid('BG');
    const cash = uid('BL');
    const party = uid('BL');
    const r1 = uid('BV');
    const p1 = uid('BV');
    const pdc = uid('BV');

    await pool.query(
      `INSERT INTO book_financial_years (id, tenant_id, code, label, is_active, external_ref)
       VALUES ($1,$2,'YR25','FY 2025-26',true,'YR25')
       ON CONFLICT (tenant_id, code) DO UPDATE SET is_active = true`,
      [fy, TENANT],
    );
    await pool.query(
      `INSERT INTO book_account_groups (id, tenant_id, name, nature, external_ref)
       VALUES ($1,$2,'Cash','A','G-CASH')`,
      [g, TENANT],
    );
    await pool.query(
      `INSERT INTO book_ledgers (id, tenant_id, name, group_id, nature, ledger_type, opening_balance, external_ref)
       VALUES
         ($1,$3,'Cash Account',$4,'A','CS',0,'ops:CASH'),
         ($2,$3,'Party',$4,'A','PR',0,'L-PARTY')`,
      [cash, party, TENANT, g],
    );
    await pool.query(`ALTER TABLE book_vouchers ADD COLUMN IF NOT EXISTS memo_status TEXT`);
    await pool.query(
      `INSERT INTO book_vouchers
         (id, tenant_id, financial_year_id, voucher_type, voucher_date, voucher_number,
          party_ledger_id, contra_ledger_id, amount, narration, external_ref, memo_status)
       VALUES
         ($1,$4,$5,'receipt','2025-08-12','CR/1',$6,$7,1000,'in',$8,null),
         ($2,$4,$5,'payment','2025-08-12','CP/1',$6,$7,250,'out',$9,null),
         ($3,$4,$5,'pdc_receipt','2025-08-12','PDC/1',$6,$7,500,'pdc',$10,'open')`,
      [r1, p1, pdc, TENANT, fy, party, cash, `manual:${r1}`, `manual:${p1}`, `manual:${pdc}`],
    );
    await pool.query(
      `INSERT INTO book_voucher_entries
         (id, tenant_id, voucher_id, line_no, ledger_id, debit, credit, external_ref)
       VALUES
         ($1,$3,$4,1,$5,1000,0,'e1'),
         ($2,$3,$4,2,$6,0,1000,'e2')`,
      [uid('BE'), uid('BE'), TENANT, r1, cash, party],
    );

    const status = await getBooksDailyStatus(pool, TENANT, '2025-08-12');
    expect(status.voucherCount).toBe(2); // PDC excluded
    expect(status.receipts).toBe(1000);
    expect(status.payments).toBe(250);
    expect(status.dayBookLines).toBe(2);
    expect(status.openPdcCount).toBe(1);
    expect(status.cashBalance).toBe(1000);
    expect(status.byType.map(r => r.voucherType).sort()).toEqual(['payment', 'receipt']);

    const empty = await getBooksDailyStatus(pool, TENANT, '2025-01-01');
    expect(empty.voucherCount).toBe(0);
    expect(empty.dayBookLines).toBe(0);
    expect(empty.receipts).toBe(0);
    expect(empty.openPdcCount).toBe(1);
  });
});
