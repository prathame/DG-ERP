/**
 * Mirror Books salary/wages payment vouchers into staff_payments (Staff Salary).
 * Miracle rarely has person names — use ledger name or "—" as staff_name.
 */
import type { Pool, PoolClient } from 'pg';
import { uid } from '../utils/helpers';

type Db = Pool | PoolClient;

const BOOKS_SALARY_SQL = `
  SELECT
    v.id AS voucher_id,
    v.external_ref,
    v.voucher_date,
    v.voucher_number,
    v.amount::float AS amount,
    v.narration,
    COALESCE(exp_l.name, 'Salary') AS ledger_name,
    CASE
      WHEN UPPER(COALESCE(cash_l.ledger_type, '')) IN ('BK', 'BN')
        OR LOWER(COALESCE(cash_l.name, '')) LIKE '%bank%'
        OR LOWER(COALESCE(cash_l.name, '')) LIKE '%upi%'
      THEN 'Bank Transfer'
      ELSE 'Cash'
    END AS payment_method
  FROM book_vouchers v
  LEFT JOIN book_ledgers cash_l
    ON cash_l.id = v.contra_ledger_id AND cash_l.tenant_id = v.tenant_id
  LEFT JOIN LATERAL (
    SELECT l.name
    FROM book_voucher_entries e
    JOIN book_ledgers l ON l.id = e.ledger_id AND l.tenant_id = e.tenant_id
    WHERE e.tenant_id = v.tenant_id
      AND e.voucher_id = v.id
      AND e.debit > 0
      AND (
        LOWER(COALESCE(l.name, '')) LIKE '%salary%'
        OR LOWER(COALESCE(l.name, '')) LIKE '%wages%'
        OR LOWER(COALESCE(l.name, '')) LIKE '%wage %'
      )
    ORDER BY e.debit DESC
    LIMIT 1
  ) exp_l ON TRUE
  WHERE v.tenant_id = $1
    AND v.voucher_type = 'payment'
    AND exp_l.name IS NOT NULL
`;

export function isSalaryLikeLedgerName(name: string | null | undefined): boolean {
  const n = (name || '').toLowerCase();
  return n.includes('salary') || n.includes('wages') || /\bwage\b/.test(n);
}

/** Prefer narration; else ledger name; else em dash (DB requires non-null name). */
export function staffNameFromSalaryVoucher(narration: string | null | undefined, ledgerName: string): string {
  const fromNarration = (narration || '').trim();
  if (fromNarration) return fromNarration.slice(0, 120);
  const fromLedger = (ledgerName || '').trim();
  if (fromLedger) return fromLedger.slice(0, 120);
  return '—';
}

function paymentIdForVoucher(voucherId: string): string {
  // Deterministic so re-sync upserts instead of duplicating
  return `SPbk-${voucherId}`.slice(0, 64);
}

async function ensureStaffMember(db: Db, tenantId: string, name: string): Promise<void> {
  const exists = (
    await db.query(`SELECT id FROM staff_members WHERE tenant_id = $1 AND LOWER(name) = LOWER($2) LIMIT 1`, [
      tenantId,
      name,
    ])
  ).rows[0];
  if (exists) return;
  await db.query(
    `INSERT INTO staff_members (id, tenant_id, name, phone, role, address, salary, joining_date, status)
     VALUES ($1,$2,$3,NULL,'Imported',NULL,NULL,NULL,'active')`,
    [uid('STF'), tenantId, name],
  );
}

/**
 * Upsert staff_payments (+ staff_members) from Books salary payment vouchers.
 * Safe to call repeatedly after Miracle import or when opening Staff Salary.
 */
export async function syncBooksSalaryToStaff(db: Db, tenantId: string): Promise<{ synced: number }> {
  const { rows } = await db.query(BOOKS_SALARY_SQL, [tenantId]);
  let synced = 0;
  for (const r of rows as Record<string, unknown>[]) {
    const voucherId = String(r.voucher_id);
    const amount = Number(r.amount) || 0;
    if (!(amount > 0)) continue;
    const ledgerName = String(r.ledger_name || 'Salary');
    const staffName = staffNameFromSalaryVoucher(r.narration as string | null, ledgerName);
    const dateRaw = r.voucher_date;
    const date =
      dateRaw instanceof Date
        ? dateRaw.toISOString().slice(0, 10)
        : String(dateRaw || '').slice(0, 10) || new Date().toISOString().slice(0, 10);
    const [yearStr, monthStr] = date.split('-');
    const month = monthStr || '01';
    const year = Number(yearStr) || new Date().getFullYear();
    const id = paymentIdForVoucher(voucherId);
    const notes = `books:${voucherId}`;
    const ref = (r.voucher_number as string) || (r.external_ref as string) || null;

    await ensureStaffMember(db, tenantId, staffName);
    await db.query(
      `INSERT INTO staff_payments
         (id, tenant_id, staff_name, amount, payment_date, payment_type, payment_method, reference_number, notes, month, year)
       VALUES ($1,$2,$3,$4,$5::date,'salary',$6,$7,$8,$9,$10)
       ON CONFLICT (id, tenant_id) DO UPDATE SET
         staff_name = EXCLUDED.staff_name,
         amount = EXCLUDED.amount,
         payment_date = EXCLUDED.payment_date,
         payment_method = EXCLUDED.payment_method,
         reference_number = EXCLUDED.reference_number,
         notes = EXCLUDED.notes,
         month = EXCLUDED.month,
         year = EXCLUDED.year`,
      [id, tenantId, staffName, amount, date, String(r.payment_method || 'Cash'), ref, notes, month, year],
    );
    synced++;
  }
  return { synced };
}
