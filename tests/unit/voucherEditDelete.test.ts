import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool, cleanupTestData } from '../helpers';
import { uid } from '../../server/utils/helpers';
import {
  BookVoucherNotFoundError,
  BookVoucherValidationError,
  createBookVoucher,
  deleteBookVoucher,
  updateBookVoucher,
} from '../../server/services/bookVouchers';

const TENANT = 'T-TEST-VOUCHER-EDIT';

async function seed() {
  await pool.query(
    `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, business_type)
     VALUES ($1,'Voucher Edit Test',$2,'ve@test.com','VE','active','service')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT, `ve-${TENANT.toLowerCase()}`],
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
  const sales = uid('BL');
  await pool.query(
    `INSERT INTO book_ledgers (id, tenant_id, name, group_id, nature, ledger_type, opening_balance, external_ref)
     VALUES
       ($1,$4,'Cash Account',$5,'A','CS',0,'L-CASH'),
       ($2,$4,'PARTY ONE',$5,'A','PR',0,'L-PARTY'),
       ($3,$4,'Sales Account',$5,'I','GL',0,'L-SALES')`,
    [cash, party, sales, TENANT, g],
  );
  return { cash, party, sales };
}

describe('book voucher edit / delete / renumber', () => {
  beforeAll(async () => {
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, business_type)
       VALUES ($1,'Voucher Edit Test',$2,'ve@test.com','VE','active','service')
       ON CONFLICT (id) DO NOTHING`,
      [TENANT, `ve-${TENANT.toLowerCase()}`],
    );
  });

  afterAll(async () => {
    await cleanupTestData(TENANT);
    await pool.query(`DELETE FROM tenants WHERE id = $1`, [TENANT]);
  });

  it('renumbers header, rebuilds amount, and deletes', async () => {
    await cleanupTestData(TENANT);
    const { cash, party } = await seed();

    const client = await pool.connect();
    let id = '';
    try {
      await client.query('BEGIN');
      const created = await createBookVoucher(client, TENANT, {
        voucherType: 'receipt',
        voucherDate: '2025-09-01',
        voucherNumber: 'CR/1',
        partyLedgerId: party,
        contraLedgerId: cash,
        amount: 1000,
        narration: 'Original',
      });
      id = created.id;

      const renamed = await updateBookVoucher(client, TENANT, id, {
        voucherNumber: 'CR/99',
        narration: 'Renumbered',
      });
      expect(renamed.amount).toBe(1000);
      const afterRename = (
        await client.query(`SELECT voucher_number, narration FROM book_vouchers WHERE id = $1`, [id])
      ).rows[0];
      expect(afterRename.voucher_number).toBe('CR/99');
      expect(afterRename.narration).toBe('Renumbered');

      const rebuilt = await updateBookVoucher(client, TENANT, id, {
        amount: 1500,
        partyLedgerId: party,
        contraLedgerId: cash,
      });
      expect(rebuilt.amount).toBe(1500);

      await deleteBookVoucher(client, TENANT, id);
      await client.query('COMMIT');
    } finally {
      client.release();
    }

    const gone = await pool.query(`SELECT id FROM book_vouchers WHERE tenant_id = $1 AND id = $2`, [TENANT, id]);
    expect(gone.rows).toHaveLength(0);
    const entries = await pool.query(`SELECT id FROM book_voucher_entries WHERE tenant_id = $1 AND voucher_id = $2`, [
      TENANT,
      id,
    ]);
    expect(entries.rows).toHaveLength(0);

    const c2 = await pool.connect();
    try {
      await expect(deleteBookVoucher(c2, TENANT, id)).rejects.toBeInstanceOf(BookVoucherNotFoundError);
    } finally {
      c2.release();
    }
  });

  it('blocks body edit on ops dual-write vouchers but allows header edit', async () => {
    await cleanupTestData(TENANT);
    const { party, sales } = await seed();
    const vid = uid('BV');
    await pool.query(
      `INSERT INTO book_vouchers
         (id, tenant_id, voucher_type, voucher_date, voucher_number, party_ledger_id, contra_ledger_id, amount, narration, external_ref)
       VALUES ($1,$2,'sales','2025-09-10','SI/1',$3,$4,500,'Ops sale','ops:si:x')`,
      [vid, TENANT, party, sales],
    );
    await pool.query(
      `INSERT INTO book_voucher_entries (id, tenant_id, voucher_id, line_no, ledger_id, debit, credit)
       VALUES ($1,$2,$3,1,$4,500,0), ($5,$2,$3,2,$6,0,500)`,
      [uid('BE'), TENANT, vid, party, uid('BE'), sales],
    );

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await updateBookVoucher(client, TENANT, vid, { voucherNumber: 'SI/RENO', narration: 'Header only' });
      await expect(
        updateBookVoucher(client, TENANT, vid, { amount: 999, partyLedgerId: party, contraLedgerId: sales }),
      ).rejects.toBeInstanceOf(BookVoucherValidationError);
      await client.query('COMMIT');
    } finally {
      client.release();
    }

    const v = (
      await pool.query(`SELECT voucher_number, amount::float AS amount, narration FROM book_vouchers WHERE id = $1`, [
        vid,
      ])
    ).rows[0];
    expect(v.voucher_number).toBe('SI/RENO');
    expect(v.narration).toBe('Header only');
    expect(Number(v.amount)).toBe(500);
  });
});
