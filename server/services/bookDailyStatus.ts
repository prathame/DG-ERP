/**
 * Miracle-style Daily Status — one-day Books snapshot + report shortcuts (UI).
 */
import type { Pool } from 'pg';
import { BOOK_NON_POSTING_TYPES_SQL } from './bookVouchers';
import { getFundBook } from './bookFinancialStatements';

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export interface DailyStatusTypeRow {
  voucherType: string;
  count: number;
  amount: number;
}

export interface BooksDailyStatus {
  date: string;
  voucherCount: number;
  byType: DailyStatusTypeRow[];
  receipts: number;
  payments: number;
  sales: number;
  purchases: number;
  dayBookLines: number;
  openPdcCount: number;
  cashBalance: number | null;
  bankBalance: number | null;
}

export async function getBooksDailyStatus(pool: Pool, tenantId: string, date: string): Promise<BooksDailyStatus> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw Object.assign(new Error('date must be YYYY-MM-DD'), { status: 400 });
  }

  const byTypeRows = (
    await pool.query(
      `SELECT voucher_type,
              COUNT(*)::int AS count,
              COALESCE(SUM(amount),0)::float AS amount
       FROM book_vouchers
       WHERE tenant_id = $1 AND voucher_date = $2
         AND voucher_type NOT IN ${BOOK_NON_POSTING_TYPES_SQL}
       GROUP BY voucher_type
       ORDER BY voucher_type`,
      [tenantId, date],
    )
  ).rows as { voucher_type: string; count: number; amount: number }[];

  const byType: DailyStatusTypeRow[] = byTypeRows.map(r => ({
    voucherType: r.voucher_type,
    count: Number(r.count) || 0,
    amount: round2(Number(r.amount) || 0),
  }));

  const amountOf = (...types: string[]) =>
    round2(byType.filter(r => types.includes(r.voucherType)).reduce((s, r) => s + r.amount, 0));

  const voucherCount = byType.reduce((s, r) => s + r.count, 0);

  const dayBookLines = Number(
    (
      await pool.query(
        `SELECT COUNT(*)::int AS c
         FROM book_voucher_entries e
         JOIN book_vouchers v ON v.id = e.voucher_id AND v.tenant_id = e.tenant_id
         WHERE e.tenant_id = $1 AND v.voucher_date = $2
           AND v.voucher_type NOT IN ${BOOK_NON_POSTING_TYPES_SQL}`,
        [tenantId, date],
      )
    ).rows[0]?.c || 0,
  );

  const openPdcCount = Number(
    (
      await pool.query(
        `SELECT COUNT(*)::int AS c
         FROM book_vouchers
         WHERE tenant_id = $1 AND memo_status = 'open'
           AND voucher_type IN ('pdc_receipt','pdc_payment')`,
        [tenantId],
      )
    ).rows[0]?.c || 0,
  );

  let cashBalance: number | null = null;
  let bankBalance: number | null = null;
  try {
    const cash = await getFundBook(pool, tenantId, 'cash', null, date, null);
    cashBalance = round2(Number(cash.closing?.balance) || 0);
  } catch {
    cashBalance = null;
  }
  try {
    const bank = await getFundBook(pool, tenantId, 'bank', null, date, null);
    bankBalance = round2(Number(bank.closing?.balance) || 0);
  } catch {
    bankBalance = null;
  }

  return {
    date,
    voucherCount,
    byType,
    receipts: amountOf('receipt'),
    payments: amountOf('payment'),
    sales: amountOf('sales'),
    purchases: round2(amountOf('purchase') - amountOf('purchase_return')),
    dayBookLines,
    openPdcCount,
    cashBalance,
    bankBalance,
  };
}
