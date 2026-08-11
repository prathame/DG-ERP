import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool, cleanupTestData } from '../helpers';
import { uid } from '../../server/utils/helpers';
import { postInvoicePaymentToBooks, postStandaloneInvoiceToBooks } from '../../server/services/opsToBooks';
import { getTrialBalance, getBooksProfitLoss } from '../../server/services/bookFinancialStatements';

const TENANT = 'T-TEST-OPS-BOOKS';

async function seedBooksShell() {
  await pool.query(
    `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, business_type)
     VALUES ($1,'Ops Books',$2,'ob@test.com','OB','active','service')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT, `ob-${TENANT.toLowerCase()}`],
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
     VALUES ($1,$2,'Current Assets','B','G-CA')
     ON CONFLICT (tenant_id, external_ref) DO NOTHING`,
    [g, TENANT],
  );
  const cash = uid('BL');
  await pool.query(
    `INSERT INTO book_ledgers (id, tenant_id, name, group_id, nature, ledger_type, opening_balance, opening_side, external_ref)
     VALUES ($1,$2,'Cash Account',$3,'B','CS',0,'D','ACASHACT')
     ON CONFLICT (tenant_id, external_ref) DO NOTHING`,
    [cash, TENANT, g],
  );
}

describe('opsToBooks + CA statements', () => {
  beforeAll(async () => {
    await seedBooksShell();
  });

  afterAll(async () => {
    await cleanupTestData(TENANT);
    await pool.query(`DELETE FROM tenants WHERE id = $1`, [TENANT]);
  });

  it('posts invoice + receipt and balances trial balance', async () => {
    await cleanupTestData(TENANT);
    await seedBooksShell();

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const invId = uid('INV');
      await postStandaloneInvoiceToBooks(client, TENANT, {
        id: invId,
        invoiceNumber: 'INV/TEST/1',
        customerName: 'Test Party',
        partyId: null,
        grandTotal: 1000,
        invoiceDate: '2025-06-01',
      });
      await postInvoicePaymentToBooks(client, TENANT, {
        id: uid('IP'),
        amount: 400,
        paymentDate: '2025-06-05',
        paymentMethod: 'Cash',
        partyName: 'Test Party',
      });
      await client.query('COMMIT');
    } finally {
      client.release();
    }

    const tb = await getTrialBalance(pool, TENANT, '2025-04-01', '2025-06-30');
    expect(tb.balanced).toBe(true);
    expect(tb.totals.periodDebit).toBe(tb.totals.periodCredit);

    const pnl = await getBooksProfitLoss(pool, TENANT, '2025-04-01', '2025-06-30');
    expect(pnl.totalIncome).toBeGreaterThanOrEqual(1000);
  });

  it('is idempotent on re-post', async () => {
    await cleanupTestData(TENANT);
    await seedBooksShell();
    const invId = 'INV-IDEMP-1';
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const a = await postStandaloneInvoiceToBooks(client, TENANT, {
        id: invId,
        invoiceNumber: 'INV/IDEMP/1',
        customerName: 'Idem Party',
        grandTotal: 250,
        invoiceDate: '2025-07-01',
      });
      const b = await postStandaloneInvoiceToBooks(client, TENANT, {
        id: invId,
        invoiceNumber: 'INV/IDEMP/1',
        customerName: 'Idem Party',
        grandTotal: 250,
        invoiceDate: '2025-07-01',
      });
      await client.query('COMMIT');
      expect(a).toBeTruthy();
      expect(b).toBe(a);
    } finally {
      client.release();
    }
    const count = await pool.query(
      `SELECT COUNT(*)::int AS c FROM book_vouchers WHERE tenant_id = $1 AND external_ref = $2`,
      [TENANT, `ops:si:${invId}`],
    );
    expect(count.rows[0].c).toBe(1);
  });
});
