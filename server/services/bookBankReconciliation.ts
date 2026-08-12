/**
 * Miracle-style Bank Reconciliation (BRS) on Books bank ledgers.
 * Tick cleared bank-book lines; compare books balance to statement balance.
 */
import type { Pool, PoolClient } from 'pg';
import { uid } from '../utils/helpers';
import { buildStatementLines, formatBalanceLabel, round2, signedOpeningBalance } from './bookReports';

export type BankReconLine = {
  entryId: string;
  voucherId: string;
  date: string | Date;
  voucherNumber: string | null;
  voucherType: string;
  particulars: string;
  narration: string | null;
  debit: number;
  credit: number;
  balance: number;
  balanceLabel: string;
  cleared: boolean;
  reconciledOn: string | null;
};

async function listBankLedgers(pool: Pool, tenantId: string) {
  const accounts = (
    await pool.query(
      `SELECT id, name, external_ref, opening_balance, opening_side, ledger_type
       FROM book_ledgers
       WHERE tenant_id = $1 AND ledger_type = 'BK'
       ORDER BY
         CASE WHEN external_ref IN ('ops:BANK') THEN 0 ELSE 1 END,
         name`,
      [tenantId],
    )
  ).rows as Array<{
    id: string;
    name: string;
    external_ref: string | null;
    opening_balance: number;
    opening_side: string | null;
    ledger_type: string;
  }>;
  return accounts;
}

export async function getBankReconciliation(
  pool: Pool,
  tenantId: string,
  asOf: string,
  ledgerId?: string | null,
  statementBalanceOverride?: number | null,
) {
  const accounts = await listBankLedgers(pool, tenantId);
  const accountList = accounts.map(a => ({
    id: a.id,
    name: a.name,
    externalRef: a.external_ref,
  }));

  if (!accounts.length) {
    return {
      accounts: accountList,
      ledger: null,
      asOf,
      statementBalance: 0,
      booksBalance: 0,
      booksBalanceLabel: '0.00',
      unclearedDeposits: 0,
      unclearedCheques: 0,
      adjustedBalance: 0,
      difference: 0,
      balanced: true,
      lines: [] as BankReconLine[],
    };
  }

  const selected =
    (ledgerId && accounts.find(a => a.id === ledgerId)) ||
    accounts.find(a => a.external_ref === 'ops:BANK') ||
    accounts[0];

  const bookOpening = signedOpeningBalance(selected.opening_balance, selected.opening_side);

  const { rows } = await pool.query(
    `SELECT e.id AS entry_id, e.voucher_id, v.voucher_date, v.voucher_number, v.voucher_type, v.narration,
            e.debit::float AS debit, e.credit::float AS credit,
            m.reconciled_on,
            (
              SELECT STRING_AGG(x.name, ', ' ORDER BY x.name)
              FROM (
                SELECT DISTINCT ol.name AS name
                FROM book_voucher_entries oe
                JOIN book_ledgers ol ON ol.id = oe.ledger_id AND ol.tenant_id = oe.tenant_id
                WHERE oe.tenant_id = e.tenant_id AND oe.voucher_id = e.voucher_id AND oe.ledger_id <> e.ledger_id
              ) x
            ) AS particulars
     FROM book_voucher_entries e
     JOIN book_vouchers v ON v.id = e.voucher_id AND v.tenant_id = e.tenant_id
     LEFT JOIN book_bank_recon_marks m
       ON m.tenant_id = e.tenant_id AND m.entry_id = e.id
     WHERE e.tenant_id = $1 AND e.ledger_id = $2 AND v.voucher_date <= $3
       AND v.voucher_type NOT IN ('pdc_receipt','pdc_payment','memorandum')
     ORDER BY v.voucher_date, v.voucher_number NULLS LAST, e.line_no
     LIMIT 10000`,
    [tenantId, selected.id, asOf],
  );

  const built = buildStatementLines(
    bookOpening,
    rows.map(r => ({
      voucherId: r.voucher_id,
      voucherDate: r.voucher_date,
      voucherNumber: r.voucher_number,
      voucherType: r.voucher_type,
      narration: r.narration,
      debit: Number(r.debit || 0),
      credit: Number(r.credit || 0),
    })),
  );

  const lines: BankReconLine[] = built.map((l, i) => {
    const cleared = Boolean(rows[i]?.reconciled_on);
    const reconOn = rows[i]?.reconciled_on;
    return {
      entryId: String(rows[i]?.entry_id),
      voucherId: l.voucherId,
      date: typeof l.voucherDate === 'string' ? l.voucherDate.slice(0, 10) : l.voucherDate,
      voucherNumber: l.voucherNumber,
      voucherType: l.voucherType,
      particulars: String(rows[i]?.particulars || l.narration || '—'),
      narration: l.narration,
      debit: l.debit,
      credit: l.credit,
      balance: l.balance,
      balanceLabel: l.balanceLabel,
      cleared,
      reconciledOn: reconOn ? String(reconOn).slice(0, 10) : null,
    };
  });

  const booksBalance = lines.length ? lines[lines.length - 1].balance : bookOpening;
  let unclearedDeposits = 0;
  let unclearedCheques = 0;
  for (const line of lines) {
    if (line.cleared) continue;
    unclearedDeposits = round2(unclearedDeposits + line.debit);
    unclearedCheques = round2(unclearedCheques + line.credit);
  }

  // Statement ≈ books − deposits not yet credited + cheques not yet presented
  const adjustedBalance = round2(booksBalance - unclearedDeposits + unclearedCheques);

  const session = (
    await pool.query(
      `SELECT statement_balance::float AS statement_balance
       FROM book_bank_recon_sessions
       WHERE tenant_id = $1 AND ledger_id = $2 AND as_of = $3`,
      [tenantId, selected.id, asOf],
    )
  ).rows[0] as { statement_balance: number } | undefined;

  const statementBalance =
    statementBalanceOverride != null && Number.isFinite(statementBalanceOverride)
      ? round2(statementBalanceOverride)
      : round2(Number(session?.statement_balance) || 0);

  const difference = round2(statementBalance - adjustedBalance);

  return {
    accounts: accountList,
    ledger: {
      id: selected.id,
      name: selected.name,
      ledgerType: selected.ledger_type,
      externalRef: selected.external_ref,
    },
    asOf,
    statementBalance,
    booksBalance,
    booksBalanceLabel: formatBalanceLabel(booksBalance),
    unclearedDeposits,
    unclearedCheques,
    adjustedBalance,
    difference,
    balanced: Math.abs(difference) < 0.05,
    lines,
  };
}

export async function markBankReconEntries(
  client: PoolClient,
  tenantId: string,
  ledgerId: string,
  entryIds: string[],
  reconciled: boolean,
  asOf: string,
): Promise<number> {
  const ids = [...new Set(entryIds.filter(Boolean))];
  if (!ids.length) return 0;

  // Ensure entries belong to this tenant + bank ledger
  const owned = (
    await client.query(
      `SELECT e.id
       FROM book_voucher_entries e
       WHERE e.tenant_id = $1 AND e.ledger_id = $2 AND e.id = ANY($3::text[])`,
      [tenantId, ledgerId, ids],
    )
  ).rows as { id: string }[];
  const ownedIds = owned.map(r => r.id);
  if (!ownedIds.length) return 0;

  if (!reconciled) {
    const del = await client.query(
      `DELETE FROM book_bank_recon_marks WHERE tenant_id = $1 AND entry_id = ANY($2::text[])`,
      [tenantId, ownedIds],
    );
    return del.rowCount ?? 0;
  }

  let n = 0;
  for (const entryId of ownedIds) {
    await client.query(
      `INSERT INTO book_bank_recon_marks (tenant_id, entry_id, ledger_id, reconciled_on)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (tenant_id, entry_id) DO UPDATE SET
         ledger_id = EXCLUDED.ledger_id,
         reconciled_on = EXCLUDED.reconciled_on`,
      [tenantId, entryId, ledgerId, asOf],
    );
    n++;
  }
  return n;
}

export async function saveBankReconStatement(
  client: PoolClient,
  tenantId: string,
  ledgerId: string,
  asOf: string,
  statementBalance: number,
  notes?: string | null,
): Promise<void> {
  const bal = round2(statementBalance);
  const existing = (
    await client.query(
      `SELECT id FROM book_bank_recon_sessions WHERE tenant_id = $1 AND ledger_id = $2 AND as_of = $3`,
      [tenantId, ledgerId, asOf],
    )
  ).rows[0] as { id: string } | undefined;
  if (existing) {
    await client.query(
      `UPDATE book_bank_recon_sessions
       SET statement_balance = $1, notes = $2, updated_at = NOW()
       WHERE id = $3 AND tenant_id = $4`,
      [bal, notes ?? null, existing.id, tenantId],
    );
    return;
  }
  await client.query(
    `INSERT INTO book_bank_recon_sessions (id, tenant_id, ledger_id, as_of, statement_balance, notes)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [uid('BR'), tenantId, ledgerId, asOf, bal, notes ?? null],
  );
}
