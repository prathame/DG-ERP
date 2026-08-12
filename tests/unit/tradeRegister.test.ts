import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool, cleanupTestData } from '../helpers';
import { uid } from '../../server/utils/helpers';
import { createBookVoucher } from '../../server/services/bookVouchers';
import { getTradeRegister } from '../../server/services/bookTradeRegister';

const TENANT = 'T-TEST-TRADE-REG';

async function seed() {
  await pool.query(
    `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, business_type)
     VALUES ($1,'Trade Reg Test',$2,'tr@test.com','TR','active','service')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT, `tr-${TENANT.toLowerCase()}`],
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
     VALUES ($1,$2,'Trading','T','G-TR')`,
    [g, TENANT],
  );
  const party = uid('BL');
  const sales = uid('BL');
  const purchase = uid('BL');
  const cgst = uid('BL');
  const sgst = uid('BL');
  await pool.query(
    `INSERT INTO book_ledgers (id, tenant_id, name, group_id, nature, ledger_type, opening_balance, opening_side, external_ref)
     VALUES
       ($1,$6,'PARTY ONE',$7,'A','PR',0,'D','L-PARTY'),
       ($2,$6,'Sales Account',$7,'I','GL',0,'C','ops:SALES'),
       ($3,$6,'Purchase Account',$7,'E','GL',0,'D','ops:PURCHASE'),
       ($4,$6,'Output CGST',$7,'L','GL',0,'C','ops:CGST_OUT'),
       ($5,$6,'Output SGST',$7,'L','GL',0,'C','ops:SGST_OUT')`,
    [party, sales, purchase, cgst, sgst, TENANT, g],
  );
  return { party, sales, purchase, cgst, sgst };
}

describe('getTradeRegister (sales / purchase)', () => {
  beforeAll(async () => {
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, business_type)
       VALUES ($1,'Trade Reg Test',$2,'tr@test.com','TR','active','service')
       ON CONFLICT (id) DO NOTHING`,
      [TENANT, `tr-${TENANT.toLowerCase()}`],
    );
  });

  afterAll(async () => {
    await cleanupTestData(TENANT);
    await pool.query(`DELETE FROM tenants WHERE id = $1`, [TENANT]);
  });

  it('lists sales vouchers with GST split and purchase vouchers', async () => {
    await cleanupTestData(TENANT);
    const { party, sales, purchase, cgst, sgst } = await seed();

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Sales with GST: 1000 + 90 + 90 = 1180
      await createBookVoucher(client, TENANT, {
        voucherType: 'sales',
        voucherDate: '2025-08-01',
        voucherNumber: 'SI/1',
        partyLedgerId: party,
        contraLedgerId: sales,
        amount: 1180,
        narration: 'Tax invoice',
        entries: [
          { ledgerId: party, debit: 1180, credit: 0 },
          { ledgerId: sales, debit: 0, credit: 1000 },
          { ledgerId: cgst, debit: 0, credit: 90 },
          { ledgerId: sgst, debit: 0, credit: 90 },
        ],
      });
      // Purchase via journal-style isn't in BOOK_VOUCHER_TYPES — insert directly like ops dual-write
      const vid = uid('BV');
      await client.query(
        `INSERT INTO book_vouchers
           (id, tenant_id, voucher_type, voucher_date, voucher_number, party_ledger_id, contra_ledger_id, amount, narration, external_ref)
         VALUES ($1,$2,'purchase','2025-08-05','PI/1',$3,$4,500,'Supplier bill',$5)`,
        [vid, TENANT, party, purchase, `manual:${vid}`],
      );
      await client.query(
        `INSERT INTO book_voucher_entries (id, tenant_id, voucher_id, line_no, ledger_id, debit, credit)
         VALUES ($1,$2,$3,1,$4,500,0), ($5,$2,$3,2,$6,0,500)`,
        [uid('BE'), TENANT, vid, purchase, uid('BE'), party],
      );
      await client.query('COMMIT');
    } finally {
      client.release();
    }

    const salesReg = await getTradeRegister(pool, TENANT, 'sales', '2025-08-01', '2025-08-31');
    expect(salesReg.rows).toHaveLength(1);
    expect(salesReg.rows[0].voucherNumber).toBe('SI/1');
    expect(salesReg.rows[0].partyName).toMatch(/PARTY ONE/i);
    expect(salesReg.rows[0].amount).toBe(1180);
    expect(salesReg.rows[0].taxable).toBe(1000);
    expect(salesReg.rows[0].cgst).toBe(90);
    expect(salesReg.rows[0].sgst).toBe(90);
    expect(salesReg.totals.amount).toBe(1180);

    const outside = await getTradeRegister(pool, TENANT, 'sales', '2025-07-01', '2025-07-31');
    expect(outside.rows).toHaveLength(0);

    const purchReg = await getTradeRegister(pool, TENANT, 'purchase', '2025-08-01', '2025-08-31');
    expect(purchReg.rows).toHaveLength(1);
    expect(purchReg.rows[0].voucherNumber).toBe('PI/1');
    expect(purchReg.rows[0].amount).toBe(500);
    expect(purchReg.rows[0].taxable).toBe(500);
    expect(purchReg.totals.count).toBe(1);
  });

  it('returns empty totals when no vouchers match', async () => {
    await cleanupTestData(TENANT);
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, business_type)
       VALUES ($1,'Trade Reg Test',$2,'tr@test.com','TR','active','service')
       ON CONFLICT (id) DO NOTHING`,
      [TENANT, `tr-${TENANT.toLowerCase()}`],
    );
    const empty = await getTradeRegister(pool, TENANT, 'sales', null, null);
    expect(empty.rows).toEqual([]);
    expect(empty.totals).toEqual({ count: 0, amount: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0 });
  });
});
