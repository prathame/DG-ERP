import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool, cleanupTestData } from '../helpers';
import {
  BookCoaValidationError,
  createBookGroup,
  createBookLedger,
  deleteBookGroup,
  deleteBookLedger,
  listBookGroups,
  setBookLedgerOpening,
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
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
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
      await client.query('COMMIT');

      const groups = await listBookGroups(client, TENANT);
      expect(groups.find(g => g.id === groupId)?.ledgerCount).toBe(1);

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
  });

  it('updates opening and blocks delete when voucher exists', async () => {
    await cleanupTestData(TENANT);
    await ensureTenant();
    const client = await pool.connect();
    let ledgerId = '';
    let cashId = '';
    try {
      await client.query('BEGIN');
      const g = await createBookGroup(client, TENANT, { name: 'Cash-in-Hand', nature: 'A' });
      cashId = await createBookLedger(client, TENANT, {
        name: 'Cash Account',
        groupId: g,
        nature: 'A',
        ledgerType: 'CS',
      });
      ledgerId = await createBookLedger(client, TENANT, {
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
      await client.query('COMMIT');
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
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const g = await createBookGroup(client, TENANT, { name: 'Income', nature: 'I' });
      await createBookLedger(client, TENANT, {
        name: 'Sales Income',
        groupId: g,
        nature: 'I',
        ledgerType: 'IN',
      });
      await expect(deleteBookGroup(client, TENANT, g)).rejects.toBeInstanceOf(BookCoaValidationError);
      await client.query('ROLLBACK');
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
  });

  it('receipt preferredInvoiceNumbers allocates against bill first', async () => {
    await cleanupTestData(TENANT);
    await ensureTenant();
    const vendorId = uid('VN');
    const invId = uid('SI');
    const client = await pool.connect();
    let partyId = '';
    let cashId = '';
    try {
      await client.query('BEGIN');
      await client.query(`INSERT INTO vendors (id, tenant_id, name) VALUES ($1,$2,'Bill Party')`, [vendorId, TENANT]);
      const g = await createBookGroup(client, TENANT, { name: 'Debtors', nature: 'A' });
      partyId = await createBookLedger(client, TENANT, {
        name: 'Bill Party',
        groupId: g,
        nature: 'A',
        ledgerType: 'PR',
      });
      cashId = await createBookLedger(client, TENANT, {
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
      await client.query('COMMIT');
      expect(created.ops.dualWrite).toBe('receipt');
      expect(created.ops.billMatched).toBe(1);
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
