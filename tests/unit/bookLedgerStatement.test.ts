import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool, cleanupTestData } from '../helpers';
import { uid } from '../../server/utils/helpers';
import { createBookVoucher } from '../../server/services/bookVouchers';
import { signedOpeningBalance } from '../../server/services/bookReports';

const TENANT = 'T-TEST-BOOK-STMT';

async function seed() {
  await pool.query(
    `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, business_type)
     VALUES ($1,'Book Stmt Test',$2,'bst@test.com','BST','active','service')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT, `bst-${TENANT.toLowerCase()}`],
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
     VALUES ($1,$2,'Sundry Debtors','A','G-SD')`,
    [g, TENANT],
  );
  const cash = uid('BL');
  const party = uid('BL');
  await pool.query(
    `INSERT INTO book_ledgers (id, tenant_id, name, group_id, nature, ledger_type, opening_balance, opening_side, external_ref)
     VALUES
       ($1,$3,'Cash',$4,'A','CS',0,'D','L-CASH'),
       ($2,$3,'PARTY ONE',$4,'A','PR',2000,'D','L-PARTY')`,
    [cash, party, TENANT, g],
  );
  return { cash, party };
}

describe('book ledger statement (integration)', () => {
  beforeAll(async () => {
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, business_type)
       VALUES ($1,'Book Stmt Test',$2,'bst@test.com','BST','active','service')
       ON CONFLICT (id) DO NOTHING`,
      [TENANT, `bst-${TENANT.toLowerCase()}`],
    );
  });

  afterAll(async () => {
    await cleanupTestData(TENANT);
    await pool.query(`DELETE FROM tenants WHERE id = $1`, [TENANT]);
  });

  it('computes opening + receipt closing for a party ledger', async () => {
    await cleanupTestData(TENANT);
    const { cash, party } = await seed();

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await createBookVoucher(client, TENANT, {
        voucherType: 'receipt',
        voucherDate: '2025-05-10',
        voucherNumber: 'CR/9',
        partyLedgerId: party,
        contraLedgerId: cash,
        amount: 500,
        narration: 'Part payment',
      });
      await client.query('COMMIT');
    } finally {
      client.release();
    }

    const ledger = (await pool.query(`SELECT opening_balance, opening_side FROM book_ledgers WHERE id = $1`, [party]))
      .rows[0];
    const bookOpen = signedOpeningBalance(ledger.opening_balance, ledger.opening_side);
    expect(bookOpen).toBe(2000);

    const mov = await pool.query(
      `SELECT COALESCE(SUM(e.debit),0)::float AS debit, COALESCE(SUM(e.credit),0)::float AS credit
       FROM book_voucher_entries e
       WHERE e.tenant_id = $1 AND e.ledger_id = $2`,
      [TENANT, party],
    );
    // Receipt credits the party (reduces receivable)
    expect(Number(mov.rows[0].credit)).toBe(500);
    const closing = bookOpen + Number(mov.rows[0].debit) - Number(mov.rows[0].credit);
    expect(closing).toBe(1500);
  });
});
