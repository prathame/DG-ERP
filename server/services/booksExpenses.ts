/**
 * Books payment vouchers that debit expense-like ledgers (Miracle + ops dual-write).
 * Shared by Expenses API and Analytics so totals stay aligned.
 */
import type { Pool } from 'pg';

/**
 * Payroll dual-writes Staff Salary / Advance / Bonus into `expenses` for audit history.
 * Purchases → Expenses and Analytics expense tiles must exclude these (Staff owns them).
 */
export function isStaffPayrollExpenseCategory(category: string | null | undefined): boolean {
  const c = String(category || '')
    .trim()
    .toLowerCase();
  if (!c) return false;
  if (c.startsWith('staff ')) return true;
  if (c.includes('salary') || c.includes('wages') || /(^|\s)wage(\s|$)/.test(c)) return true;
  return false;
}

/** SQL AND-clause (column alias `category`) matching {@link isStaffPayrollExpenseCategory}. */
export const EXCLUDE_STAFF_PAYROLL_EXPENSE_CATEGORY_SQL = `
  AND LOWER(COALESCE(category, '')) NOT LIKE 'staff %'
  AND LOWER(COALESCE(category, '')) NOT LIKE '%salary%'
  AND LOWER(COALESCE(category, '')) NOT LIKE '%wages%'
  AND LOWER(COALESCE(category, '')) !~ '(^|[^a-z])wage([^a-z]|$)'
`;

/** Payment vouchers that debit an expense-like ledger (Miracle PT/EX + Ops expense dual-write). */
export const BOOKS_EXPENSE_SQL = `
  SELECT
    v.id AS voucher_id,
    v.external_ref,
    v.voucher_date,
    v.voucher_number,
    v.amount::float AS amount,
    v.narration,
    COALESCE(exp_l.name, 'Expense') AS category,
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
        l.nature = 'E'
        OR UPPER(COALESCE(l.ledger_type, '')) IN ('EX', 'PT', 'ET')
        OR COALESCE(l.external_ref, '') LIKE 'ops:EXP:%'
        OR EXISTS (
          SELECT 1 FROM book_account_groups g
          WHERE g.id = l.group_id AND g.tenant_id = l.tenant_id
            AND LOWER(COALESCE(g.name, '')) LIKE '%expense%'
        )
      )
      -- Salary lives under Staff / Staff Salary, not Purchases → Expenses
      AND LOWER(COALESCE(l.name, '')) NOT LIKE '%salary%'
      AND LOWER(COALESCE(l.name, '')) NOT LIKE '%wages%'
      AND LOWER(COALESCE(l.name, '')) NOT LIKE '%wage %'
    ORDER BY e.debit DESC
    LIMIT 1
  ) exp_l ON TRUE
  WHERE v.tenant_id = $1
    AND v.voucher_type = 'payment'
    AND exp_l.name IS NOT NULL
`;

export async function booksDeskHasData(pool: Pool, tenantId: string): Promise<boolean> {
  const row = (
    await pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM book_ledgers WHERE tenant_id = $1) AS ledgers,
         (SELECT COUNT(*)::int FROM book_vouchers WHERE tenant_id = $1) AS vouchers`,
      [tenantId],
    )
  ).rows[0] as { ledgers: number; vouchers: number };
  return (row?.ledgers || 0) + (row?.vouchers || 0) > 0;
}

/** Total Books expense payments in an optional date range (excludes salary/wages). */
export async function sumBooksExpenses(
  pool: Pool,
  tenantId: string,
  from?: string | null,
  to?: string | null,
): Promise<number> {
  const params: unknown[] = [tenantId];
  let where = '';
  if (from) {
    params.push(from);
    where += ` AND voucher_date >= $${params.length}`;
  }
  if (to) {
    params.push(to);
    where += ` AND voucher_date <= $${params.length}`;
  }
  const row = (
    await pool.query(
      `WITH books_exp AS (${BOOKS_EXPENSE_SQL})
       SELECT COALESCE(SUM(amount), 0)::float AS v FROM books_exp WHERE 1=1 ${where}`,
      params,
    )
  ).rows[0] as { v: number };
  return Number(row?.v) || 0;
}

/**
 * Prefer Books expense payments when the desk has data; otherwise ops `expenses`.
 * Keeps Analytics aligned with Purchases → Expenses.
 */
export async function sumTenantExpenses(
  pool: Pool,
  tenantId: string,
  from?: string | null,
  to?: string | null,
): Promise<number> {
  if (await booksDeskHasData(pool, tenantId)) {
    return sumBooksExpenses(pool, tenantId, from, to);
  }
  const params: unknown[] = [tenantId];
  let where = 'WHERE tenant_id = $1';
  if (from) {
    params.push(from);
    where += ` AND expense_date >= $${params.length}`;
  }
  if (to) {
    params.push(to);
    where += ` AND expense_date <= $${params.length}`;
  }
  const row = (await pool.query(`SELECT COALESCE(SUM(amount), 0)::float AS v FROM expenses ${where}`, params))
    .rows[0] as { v: number };
  return Number(row?.v) || 0;
}
