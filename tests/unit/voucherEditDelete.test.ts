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

  it('updates journal lines, accepts explicit entries, and rejects bad body edits', async () => {
    await cleanupTestData(TENANT);
    const { cash, party, sales } = await seed();

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const journal = await createBookVoucher(client, TENANT, {
        voucherType: 'journal',
        voucherDate: '2025-09-12',
        voucherNumber: 'JV/1',
        entries: [
          { ledgerId: party, debit: 200, credit: 0 },
          { ledgerId: sales, debit: 0, credit: 200 },
        ],
      });

      await expect(updateBookVoucher(client, TENANT, journal.id, { entries: [] })).rejects.toBeInstanceOf(
        BookVoucherValidationError,
      );

      const j2 = await updateBookVoucher(client, TENANT, journal.id, {
        voucherDate: '2025-09-13',
        entries: [
          { ledgerId: party, debit: 300, credit: 0 },
          { ledgerId: cash, debit: 0, credit: 300 },
        ],
      });
      expect(j2.amount).toBe(300);

      const receipt = await createBookVoucher(client, TENANT, {
        voucherType: 'receipt',
        voucherDate: '2025-09-14',
        partyLedgerId: party,
        contraLedgerId: cash,
        amount: 50,
      });
      const withEntries = await updateBookVoucher(client, TENANT, receipt.id, {
        entries: [
          { ledgerId: cash, debit: 75, credit: 0 },
          { ledgerId: party, debit: 0, credit: 75 },
        ],
      });
      expect(withEntries.amount).toBe(75);

      await expect(updateBookVoucher(client, TENANT, receipt.id, { voucherDate: 'not-a-date' })).rejects.toBeInstanceOf(
        BookVoucherValidationError,
      );

      await expect(
        updateBookVoucher(client, TENANT, receipt.id, {
          partyLedgerId: party,
          contraLedgerId: null,
          amount: 10,
        }),
      ).rejects.toBeInstanceOf(BookVoucherValidationError);

      // purchase-type body rebuild is unsupported
      const pid = uid('BV');
      await client.query(
        `INSERT INTO book_vouchers
           (id, tenant_id, voucher_type, voucher_date, voucher_number, party_ledger_id, contra_ledger_id, amount, narration, external_ref)
         VALUES ($1,$2,'purchase','2025-09-15','PI/1',$3,$4,80,'Buy', $5)`,
        [pid, TENANT, party, sales, `manual:${pid}`],
      );
      await client.query(
        `INSERT INTO book_voucher_entries (id, tenant_id, voucher_id, line_no, ledger_id, debit, credit)
         VALUES ($1,$2,$3,1,$4,80,0), ($5,$2,$3,2,$6,0,80)`,
        [uid('BE'), TENANT, pid, sales, uid('BE'), party],
      );
      await expect(
        updateBookVoucher(client, TENANT, pid, { amount: 90, partyLedgerId: party, contraLedgerId: sales }),
      ).rejects.toBeInstanceOf(BookVoucherValidationError);

      // header date change still ok
      await updateBookVoucher(client, TENANT, pid, { voucherDate: '2025-09-16' });

      await client.query('COMMIT');
    } finally {
      client.release();
    }
  });

  it('clears dual-write invoice payments when deleting a manual receipt', async () => {
    await cleanupTestData(TENANT);
    const { cash, party } = await seed();
    const vendorId = uid('V');
    await pool.query(`INSERT INTO vendors (id, tenant_id, name, external_ref) VALUES ($1,$2,'PARTY ONE','L-PARTY')`, [
      vendorId,
      TENANT,
    ]);
    const invId = uid('SI');
    await pool.query(
      `INSERT INTO standalone_invoices
         (id, tenant_id, invoice_number, customer_name, party_type, party_id, grand_total, subtotal, status, invoice_date)
       VALUES ($1,$2,'INV-VE-1','PARTY ONE','vendor',$3,1000,1000,'sent','2025-09-01')`,
      [invId, TENANT, vendorId],
    );

    const client = await pool.connect();
    let voucherId = '';
    try {
      await client.query('BEGIN');
      const created = await createBookVoucher(client, TENANT, {
        voucherType: 'receipt',
        voucherDate: '2025-09-20',
        voucherNumber: 'CR/DW',
        partyLedgerId: party,
        contraLedgerId: cash,
        amount: 400,
      });
      voucherId = created.id;
      expect(created.ops.dualWrite).toBe('receipt');
      const before = await client.query(
        `SELECT id FROM invoice_payments WHERE tenant_id = $1 AND idempotency_key LIKE $2`,
        [TENANT, `books:${voucherId}:%`],
      );
      expect(before.rows.length).toBeGreaterThan(0);

      await deleteBookVoucher(client, TENANT, voucherId);
      await client.query('COMMIT');
    } finally {
      client.release();
    }

    const ips = await pool.query(`SELECT id FROM invoice_payments WHERE tenant_id = $1 AND idempotency_key LIKE $2`, [
      TENANT,
      `books:${voucherId}:%`,
    ]);
    expect(ips.rows).toHaveLength(0);
  });
});
