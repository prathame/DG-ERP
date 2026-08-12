import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool, cleanupTestData } from '../helpers';
import { uid } from '../../server/utils/helpers';
import { createBookVoucher } from '../../server/services/bookVouchers';
import {
  getBankReconciliation,
  markBankReconEntries,
  saveBankReconStatement,
} from '../../server/services/bookBankReconciliation';

const TENANT = 'T-TEST-BANK-RECON';

async function seed() {
  await pool.query(
    `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, business_type)
     VALUES ($1,'Bank Recon Test',$2,'br@test.com','BR','active','service')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT, `br-${TENANT.toLowerCase()}`],
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
     VALUES ($1,$2,'Current Assets','A','G-CA')`,
    [g, TENANT],
  );
  const bank = uid('BL');
  const party = uid('BL');
  await pool.query(
    `INSERT INTO book_ledgers (id, tenant_id, name, group_id, nature, ledger_type, opening_balance, opening_side, external_ref)
     VALUES
       ($1,$3,'HDFC Bank',$4,'A','BK',1000,'D','ops:BANK'),
       ($2,$3,'PARTY ONE',$4,'A','PR',0,'D','L-PARTY')`,
    [bank, party, TENANT, g],
  );
  return { bank, party };
}

describe('bank reconciliation (BRS)', () => {
  beforeAll(async () => {
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, business_type)
       VALUES ($1,'Bank Recon Test',$2,'br@test.com','BR','active','service')
       ON CONFLICT (id) DO NOTHING`,
      [TENANT, `br-${TENANT.toLowerCase()}`],
    );
  });

  afterAll(async () => {
    await cleanupTestData(TENANT);
    await pool.query(`DELETE FROM tenants WHERE id = $1`, [TENANT]);
  });

  it('marks cleared lines and balances statement vs adjusted books', async () => {
    await cleanupTestData(TENANT);
    const { bank, party } = await seed();

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await createBookVoucher(client, TENANT, {
        voucherType: 'receipt',
        voucherDate: '2025-07-01',
        voucherNumber: 'BR/1',
        partyLedgerId: party,
        contraLedgerId: bank,
        amount: 500,
        narration: 'Deposit in transit',
      });
      await createBookVoucher(client, TENANT, {
        voucherType: 'payment',
        voucherDate: '2025-07-02',
        voucherNumber: 'BP/1',
        partyLedgerId: party,
        contraLedgerId: bank,
        amount: 200,
        narration: 'Outstanding cheque',
      });
      await client.query('COMMIT');
    } finally {
      client.release();
    }

    let recon = await getBankReconciliation(pool, TENANT, '2025-07-31', bank);
    expect(recon.ledger?.id).toBe(bank);
    expect(recon.booksBalance).toBe(1300); // 1000 + 500 − 200
    expect(recon.lines).toHaveLength(2);
    expect(recon.unclearedDeposits).toBe(500);
    expect(recon.unclearedCheques).toBe(200);
    // adjusted = books − uncleared Dr + uncleared Cr = 1300 − 500 + 200 = 1000
    expect(recon.adjustedBalance).toBe(1000);
    expect(recon.statementBalance).toBe(0);
    expect(recon.difference).toBe(-1000);

    // Query override without persisting
    const overridden = await getBankReconciliation(pool, TENANT, '2025-07-31', bank, 1000);
    expect(overridden.statementBalance).toBe(1000);
    expect(overridden.difference).toBe(0);
    expect(overridden.balanced).toBe(true);

    const depositId = recon.lines.find(l => l.debit === 500)!.entryId;
    const chequeId = recon.lines.find(l => l.credit === 200)!.entryId;

    const markClient = await pool.connect();
    try {
      await markClient.query('BEGIN');
      expect(await markBankReconEntries(markClient, TENANT, bank, [], true, '2025-07-31')).toBe(0);
      expect(await markBankReconEntries(markClient, TENANT, bank, ['not-an-entry'], true, '2025-07-31')).toBe(0);
      // Clear the cheque only — deposit still in transit
      await markBankReconEntries(markClient, TENANT, bank, [chequeId], true, '2025-07-31');
      await saveBankReconStatement(markClient, TENANT, bank, '2025-07-31', 800);
      // Update existing session
      await saveBankReconStatement(markClient, TENANT, bank, '2025-07-31', 800, 'ok');
      await markClient.query('COMMIT');
    } finally {
      markClient.release();
    }

    recon = await getBankReconciliation(pool, TENANT, '2025-07-31', bank);
    expect(recon.statementBalance).toBe(800);
    expect(recon.unclearedDeposits).toBe(500);
    expect(recon.unclearedCheques).toBe(0);
    // adjusted = 1300 − 500 + 0 = 800
    expect(recon.adjustedBalance).toBe(800);
    expect(recon.difference).toBe(0);
    expect(recon.balanced).toBe(true);
    expect(recon.lines.find(l => l.entryId === chequeId)?.cleared).toBe(true);
    expect(recon.lines.find(l => l.entryId === depositId)?.cleared).toBe(false);

    const unmark = await pool.connect();
    try {
      await unmark.query('BEGIN');
      await markBankReconEntries(unmark, TENANT, bank, [chequeId], false, '2025-07-31');
      await unmark.query('COMMIT');
    } finally {
      unmark.release();
    }

    recon = await getBankReconciliation(pool, TENANT, '2025-07-31', bank);
    expect(recon.unclearedCheques).toBe(200);
    expect(recon.balanced).toBe(false);
  });

  it('returns empty shell when no bank ledgers; prefers ops:BANK', async () => {
    await cleanupTestData(TENANT);
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, business_type)
       VALUES ($1,'Bank Recon Test',$2,'br@test.com','BR','active','service')
       ON CONFLICT (id) DO NOTHING`,
      [TENANT, `br-${TENANT.toLowerCase()}`],
    );

    const empty = await getBankReconciliation(pool, TENANT, '2025-07-31');
    expect(empty.ledger).toBeNull();
    expect(empty.lines).toEqual([]);
    expect(empty.balanced).toBe(true);

    const { bank } = await seed();
    const withOpeningOnly = await getBankReconciliation(pool, TENANT, '2025-07-31');
    expect(withOpeningOnly.ledger?.id).toBe(bank);
    expect(withOpeningOnly.booksBalance).toBe(1000);
    expect(withOpeningOnly.lines).toHaveLength(0);
  });
});
