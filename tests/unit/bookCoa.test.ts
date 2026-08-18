import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool, cleanupTestData } from '../helpers';
import {
  BookCoaNotFoundError,
  BookCoaValidationError,
  createBookGroup,
  createBookLedger,
  deleteBookGroup,
  deleteBookLedger,
  listBookGroups,
  setBookLedgerOpening,
  updateBookGroup,
  updateBookLedger,
} from '../../server/services/bookCoa';
import { createBookVoucher } from '../../server/services/bookVouchers';
import { uid } from '../../server/utils/helpers';

const TENANT = 'T-TEST-BOOK-COA';

async function ensureTenant() {
  await pool.query(
    `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, business_type)
     VALUES ($1,'Book COA Test',$2,'coa@test.com','COA','active','service')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT, `bv-coa-${TENANT.toLowerCase()}`],
  );
}

async function withClient<T>(fn: (client: import('pg').PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    client.release();
  }
}

describe('bookCoa', () => {
  beforeAll(async () => {
    await ensureTenant();
  });

  afterAll(async () => {
    await cleanupTestData(TENANT);
    await pool.query(`DELETE FROM tenants WHERE id = $1`, [TENANT]);
  });

  it('creates group and ledger with opening balance', async () => {
    await cleanupTestData(TENANT);
    await ensureTenant();
    const { groupId, ledgerId } = await withClient(async client => {
      const groupId = await createBookGroup(client, TENANT, { name: 'Sundry Debtors', nature: 'A' });
      const ledgerId = await createBookLedger(client, TENANT, {
        name: 'Ahmedabad Traders',
        groupId,
        nature: 'A',
        ledgerType: 'PR',
        openingBalance: 12500,
        openingSide: 'D',
        city: 'Ahmedabad',
      });
      return { groupId, ledgerId };
    });

    const client = await pool.connect();
    try {
      const groups = await listBookGroups(client, TENANT);
      expect(groups.find(g => g.id === groupId)?.ledgerCount).toBe(1);
    } finally {
      client.release();
    }

    const ledger = (
      await pool.query(
        `SELECT name, opening_balance::float AS ob, opening_side, group_id FROM book_ledgers WHERE id = $1 AND tenant_id = $2`,
        [ledgerId, TENANT],
      )
    ).rows[0];
    expect(ledger.name).toBe('Ahmedabad Traders');
    expect(ledger.ob).toBe(12500);
    expect(ledger.opening_side).toBe('D');
    expect(ledger.group_id).toBe(groupId);

    const detail = (
      await pool.query(`SELECT city FROM book_ledger_details WHERE ledger_id = $1 AND tenant_id = $2`, [
        ledgerId,
        TENANT,
      ])
    ).rows[0];
    expect(detail.city).toBe('Ahmedabad');
  });

  it('updates opening and blocks delete when voucher exists', async () => {
    await cleanupTestData(TENANT);
    await ensureTenant();
    const { ledgerId } = await withClient(async client => {
      const g = await createBookGroup(client, TENANT, { name: 'Cash-in-Hand', nature: 'A' });
      const cashId = await createBookLedger(client, TENANT, {
        name: 'Cash Account',
        groupId: g,
        nature: 'A',
        ledgerType: 'CS',
      });
      const ledgerId = await createBookLedger(client, TENANT, {
        name: 'Party One',
        groupId: g,
        nature: 'A',
        ledgerType: 'PR',
      });
      await setBookLedgerOpening(client, TENANT, ledgerId, 500, 'C');
      await updateBookLedger(client, TENANT, ledgerId, {
        name: 'Party One',
        groupId: g,
        nature: 'A',
        ledgerType: 'PR',
        openingBalance: 500,
        openingSide: 'C',
      });
      await createBookVoucher(client, TENANT, {
        voucherType: 'receipt',
        voucherDate: '2025-06-01',
        partyLedgerId: ledgerId,
        contraLedgerId: cashId,
        amount: 100,
      });
      return { ledgerId };
    });

    const row = (
      await pool.query(`SELECT opening_balance::float AS ob, opening_side FROM book_ledgers WHERE id = $1`, [ledgerId])
    ).rows[0];
    expect(row.ob).toBe(500);
    expect(row.opening_side).toBe('C');

    const client2 = await pool.connect();
    try {
      await expect(deleteBookLedger(client2, TENANT, ledgerId)).rejects.toBeInstanceOf(BookCoaValidationError);
    } finally {
      client2.release();
    }
  });

  it('rejects deleting non-empty group', async () => {
    await cleanupTestData(TENANT);
    await ensureTenant();
    await withClient(async client => {
      const g = await createBookGroup(client, TENANT, { name: 'Income', nature: 'I' });
      await createBookLedger(client, TENANT, {
        name: 'Sales Income',
        groupId: g,
        nature: 'I',
        ledgerType: 'IN',
      });
      await expect(deleteBookGroup(client, TENANT, g)).rejects.toBeInstanceOf(BookCoaValidationError);
    });
  });

  it('validates inputs and not-found paths', async () => {
    await cleanupTestData(TENANT);
    await ensureTenant();
    await withClient(async client => {
      await expect(createBookGroup(client, TENANT, { name: '' })).rejects.toBeInstanceOf(BookCoaValidationError);
      await expect(createBookGroup(client, TENANT, { name: 'x'.repeat(201) })).rejects.toBeInstanceOf(
        BookCoaValidationError,
      );
      await expect(createBookGroup(client, TENANT, { name: 'Bad Nature', nature: 'Z' })).rejects.toBeInstanceOf(
        BookCoaValidationError,
      );
      await expect(createBookLedger(client, TENANT, { name: 'Bad Side', openingSide: 'X' })).rejects.toBeInstanceOf(
        BookCoaValidationError,
      );
      await expect(
        createBookLedger(client, TENANT, { name: 'Bad Bal', openingBalance: Number.NaN }),
      ).rejects.toBeInstanceOf(BookCoaValidationError);
      await expect(
        createBookLedger(client, TENANT, { name: 'Missing Group', groupId: 'BG-NOPE' }),
      ).rejects.toBeInstanceOf(BookCoaValidationError);

      await expect(updateBookGroup(client, TENANT, 'BG-MISSING', { name: 'Nope' })).rejects.toBeInstanceOf(
        BookCoaNotFoundError,
      );
      await expect(deleteBookGroup(client, TENANT, 'BG-MISSING')).rejects.toBeInstanceOf(BookCoaNotFoundError);
      await expect(updateBookLedger(client, TENANT, 'BL-MISSING', { name: 'Nope' })).rejects.toBeInstanceOf(
        BookCoaNotFoundError,
      );
      await expect(setBookLedgerOpening(client, TENANT, 'BL-MISSING', 1, 'D')).rejects.toBeInstanceOf(
        BookCoaNotFoundError,
      );
      await expect(deleteBookLedger(client, TENANT, 'BL-MISSING')).rejects.toBeInstanceOf(BookCoaNotFoundError);
    });
  });

  it('updates and deletes empty groups; blocks self-parent and child delete', async () => {
    await cleanupTestData(TENANT);
    await ensureTenant();
    await withClient(async client => {
      const parent = await createBookGroup(client, TENANT, {
        name: 'Assets',
        nature: 'A',
        groupCode: 'A1',
      });
      const child = await createBookGroup(client, TENANT, {
        name: 'Current Assets',
        nature: 'A',
        parentId: parent,
      });
      await expect(
        updateBookGroup(client, TENANT, parent, { name: 'Assets', parentId: parent }),
      ).rejects.toBeInstanceOf(BookCoaValidationError);

      await updateBookGroup(client, TENANT, child, {
        name: 'Current Assets Renamed',
        nature: 'A',
        parentId: parent,
        groupCode: 'CA',
      });
      const groups = await listBookGroups(client, TENANT);
      expect(groups.find(g => g.id === child)?.name).toBe('Current Assets Renamed');
      expect(groups.find(g => g.id === child)?.parentName).toBe('Assets');

      await expect(createBookGroup(client, TENANT, { name: 'Assets' })).rejects.toBeInstanceOf(BookCoaValidationError);
      await expect(updateBookGroup(client, TENANT, child, { name: 'Assets', parentId: parent })).rejects.toBeInstanceOf(
        BookCoaValidationError,
      );

      await expect(deleteBookGroup(client, TENANT, parent)).rejects.toBeInstanceOf(BookCoaValidationError);

      await deleteBookGroup(client, TENANT, child);
      await deleteBookGroup(client, TENANT, parent);
      expect((await listBookGroups(client, TENANT)).length).toBe(0);
    });
  });

  it('deletes unused ledger; blocks system ledger; defaults opening side', async () => {
    await cleanupTestData(TENANT);
    await ensureTenant();
    const { a, b } = await withClient(async client => {
      const g = await createBookGroup(client, TENANT, { name: 'Misc', nature: 'A' });
      const a = await createBookLedger(client, TENANT, {
        name: 'Temp Ledger',
        groupId: g,
        openingBalance: 100,
        // no openingSide → defaults to D
      });
      const b = await createBookLedger(client, TENANT, {
        name: 'Credit Alias',
        groupId: g,
        openingBalance: 50,
        openingSide: 'CREDIT',
      });
      await expect(createBookLedger(client, TENANT, { name: 'Temp Ledger', groupId: g })).rejects.toBeInstanceOf(
        BookCoaValidationError,
      );

      await updateBookLedger(client, TENANT, b, {
        name: 'Credit Alias 2',
        groupId: g,
        openingBalance: 75,
        openingSide: 'CR',
        contactPerson: 'Patel',
        mobile: '999',
      });
      await expect(updateBookLedger(client, TENANT, b, { name: 'Temp Ledger', groupId: g })).rejects.toBeInstanceOf(
        BookCoaValidationError,
      );

      const sysId = uid('BL');
      await client.query(
        `INSERT INTO book_ledgers
           (id, tenant_id, name, group_id, nature, ledger_type, opening_balance, is_system, external_ref)
         VALUES ($1,$2,'System Cash',$3,'A','CS',0,true,'ops:SYS')`,
        [sysId, TENANT, g],
      );
      await expect(deleteBookLedger(client, TENANT, sysId)).rejects.toBeInstanceOf(BookCoaValidationError);

      // Party/contra header ref without entry lines (covers delete guard)
      const orphan = await createBookLedger(client, TENANT, { name: 'Orphan Party', groupId: g });
      await client.query(
        `INSERT INTO book_vouchers
           (id, tenant_id, voucher_type, voucher_date, party_ledger_id, amount, external_ref)
         VALUES ($1,$2,'journal','2025-06-01',$3,0,$4)`,
        [uid('BV'), TENANT, orphan, `manual-orphan:${uid('X')}`],
      );
      await expect(deleteBookLedger(client, TENANT, orphan)).rejects.toBeInstanceOf(BookCoaValidationError);

      await deleteBookLedger(client, TENANT, a);
      await deleteBookLedger(client, TENANT, b);
      return { a, b };
    });

    const left = await pool.query(`SELECT id FROM book_ledgers WHERE tenant_id = $1 AND id = ANY($2::text[])`, [
      TENANT,
      [a, b],
    ]);
    expect(left.rows).toHaveLength(0);
  });

  it('receipt preferredInvoiceNumbers allocates against bill first', async () => {
    await cleanupTestData(TENANT);
    await ensureTenant();
    const vendorId = uid('VN');
    const invId = uid('SI');
    await withClient(async client => {
      await client.query(`INSERT INTO vendors (id, tenant_id, name) VALUES ($1,$2,'Bill Party')`, [vendorId, TENANT]);
      const g = await createBookGroup(client, TENANT, { name: 'Debtors', nature: 'A' });
      const partyId = await createBookLedger(client, TENANT, {
        name: 'Bill Party',
        groupId: g,
        nature: 'A',
        ledgerType: 'PR',
      });
      const cashId = await createBookLedger(client, TENANT, {
        name: 'Cash Desk',
        groupId: g,
        nature: 'A',
        ledgerType: 'CS',
      });
      await client.query(
        `INSERT INTO standalone_invoices
           (id, tenant_id, invoice_number, customer_name, party_type, party_id, grand_total, subtotal, status, invoice_date)
         VALUES ($1,$2,'INV-AGAINST-1','Bill Party','vendor',$3,1000,1000,'sent','2025-05-01')`,
        [invId, TENANT, vendorId],
      );
      await client.query(
        `INSERT INTO standalone_invoices
           (id, tenant_id, invoice_number, customer_name, party_type, party_id, grand_total, subtotal, status, invoice_date)
         VALUES ($1,$2,'INV-FIFO-OLD','Bill Party','vendor',$3,800,800,'sent','2025-04-01')`,
        [uid('SI'), TENANT, vendorId],
      );

      const created = await createBookVoucher(client, TENANT, {
        voucherType: 'receipt',
        voucherDate: '2025-06-15',
        partyLedgerId: partyId,
        contraLedgerId: cashId,
        amount: 400,
        preferredInvoiceNumbers: ['INV-AGAINST-1'],
      });
      expect(created.ops.dualWrite).toBe('receipt');
      expect(created.ops.billMatched).toBe(1);
    });

    const paid = (
      await pool.query(`SELECT amount::float AS amt FROM invoice_payments WHERE tenant_id = $1 AND invoice_id = $2`, [
        TENANT,
        invId,
      ])
    ).rows;
    expect(paid).toHaveLength(1);
    expect(paid[0].amt).toBe(400);
  });
});
