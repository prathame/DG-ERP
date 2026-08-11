import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool, cleanupTestData } from '../helpers';
import { uid } from '../../server/utils/helpers';
import { BookVoucherValidationError, createBookVoucher } from '../../server/services/bookVouchers';

const TENANT = 'T-TEST-BOOK-VOUCHERS';

async function seedLedgers() {
  await pool.query(
    `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, business_type)
     VALUES ($1,'Book Voucher Test',$2,'bv@test.com','BV','active','service')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT, `bv-${TENANT.toLowerCase()}`],
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
     VALUES ($1,$2,'Cash','A','G-CASH')`,
    [g, TENANT],
  );
  const cash = uid('BL');
  const party = uid('BL');
  const bank = uid('BL');
  await pool.query(
    `INSERT INTO book_ledgers (id, tenant_id, name, group_id, nature, ledger_type, opening_balance, external_ref)
     VALUES
       ($1,$4,'Cash Account',$5,'A','CS',0,'L-CASH'),
       ($2,$4,'MITULBHAI',$5,'A','PR',0,'L-PARTY'),
       ($3,$4,'HDFC Bank',$5,'A','BK',0,'L-BANK')`,
    [cash, party, bank, TENANT, g],
  );
  return { cash, party, bank };
}

describe('bookVouchers', () => {
  beforeAll(async () => {
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, business_type)
       VALUES ($1,'Book Voucher Test',$2,'bv@test.com','BV','active','service')
       ON CONFLICT (id) DO NOTHING`,
      [TENANT, `bv-${TENANT.toLowerCase()}`],
    );
  });

  afterAll(async () => {
    await cleanupTestData(TENANT);
    await pool.query(`DELETE FROM tenants WHERE id = $1`, [TENANT]);
  });

  it('creates a balanced receipt voucher', async () => {
    await cleanupTestData(TENANT);
    const { cash, party } = await seedLedgers();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const created = await createBookVoucher(client, TENANT, {
        voucherType: 'receipt',
        voucherDate: '2025-06-01',
        voucherNumber: 'CR/1',
        partyLedgerId: party,
        contraLedgerId: cash,
        amount: 1500,
        narration: 'Test receipt',
      });
      await client.query('COMMIT');
      expect(created.amount).toBe(1500);
      expect(created.voucherType).toBe('receipt');

      const entries = await pool.query(
        `SELECT ledger_id, debit::float AS debit, credit::float AS credit
         FROM book_voucher_entries WHERE tenant_id = $1 AND voucher_id = $2 ORDER BY line_no`,
        [TENANT, created.id],
      );
      expect(entries.rows).toHaveLength(2);
      expect(entries.rows[0]).toMatchObject({ ledger_id: cash, debit: 1500, credit: 0 });
      expect(entries.rows[1]).toMatchObject({ ledger_id: party, debit: 0, credit: 1500 });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  });

  it('creates payment and contra vouchers', async () => {
    await cleanupTestData(TENANT);
    const { cash, party, bank } = await seedLedgers();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const pay = await createBookVoucher(client, TENANT, {
        voucherType: 'payment',
        voucherDate: '2025-06-02',
        partyLedgerId: party,
        contraLedgerId: cash,
        amount: 200,
      });
      const contra = await createBookVoucher(client, TENANT, {
        voucherType: 'contra',
        voucherDate: '2025-06-03',
        partyLedgerId: bank,
        contraLedgerId: cash,
        amount: 500,
      });
      await client.query('COMMIT');
      expect(pay.voucherType).toBe('payment');
      expect(contra.voucherType).toBe('contra');
      expect(contra.amount).toBe(500);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  });

  it('rejects unbalanced journals and same-ledger cash vouchers', async () => {
    await cleanupTestData(TENANT);
    const { cash, party } = await seedLedgers();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await expect(
        createBookVoucher(client, TENANT, {
          voucherType: 'receipt',
          voucherDate: '2025-06-01',
          partyLedgerId: cash,
          contraLedgerId: cash,
          amount: 10,
        }),
      ).rejects.toBeInstanceOf(BookVoucherValidationError);

      await expect(
        createBookVoucher(client, TENANT, {
          voucherType: 'journal',
          voucherDate: '2025-06-01',
          entries: [
            { ledgerId: cash, debit: 100 },
            { ledgerId: party, credit: 50 },
          ],
        }),
      ).rejects.toThrow(/not balanced/i);

      const ok = await createBookVoucher(client, TENANT, {
        voucherType: 'journal',
        voucherDate: '2025-06-01',
        entries: [
          { ledgerId: cash, debit: 100 },
          { ledgerId: party, credit: 100 },
        ],
      });
      expect(ok.amount).toBe(100);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  });
});
