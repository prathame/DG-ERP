/**
 * Books CA statements from book_ledgers + book_voucher_entries (not ops Accounts).
 */
import type { Pool } from 'pg';
import {
  buildTrialBalanceRow,
  classifyLedger,
  formatBalanceLabel,
  round2,
  splitDrCr,
  type StatementClass,
  type TrialBalanceLedgerRow,
} from './bookReports';

interface LedgerAggRow {
  id: string;
  name: string;
  nature: string | null;
  ledger_type: string | null;
  opening_balance: number;
  opening_side: string | null;
  group_name: string | null;
  prior_debit: number;
  prior_credit: number;
  period_debit: number;
  period_credit: number;
}

async function loadLedgerAggregates(
  pool: Pool,
  tenantId: string,
  from: string | null,
  to: string | null,
): Promise<LedgerAggRow[]> {
  const params: unknown[] = [tenantId];
  let priorPred = 'FALSE';
  let periodPred = 'TRUE';
  if (from) {
    params.push(from);
    const fi = params.length;
    priorPred = `v.voucher_date < $${fi}`;
    periodPred = `v.voucher_date >= $${fi}`;
  }
  if (to) {
    params.push(to);
    const ti = params.length;
    periodPred = from ? `(${periodPred} AND v.voucher_date <= $${ti})` : `v.voucher_date <= $${ti}`;
  }

  const sql = `
    SELECT l.id, l.name, l.nature, l.ledger_type, l.opening_balance, l.opening_side,
           g.name AS group_name,
           COALESCE(SUM(CASE WHEN e.id IS NOT NULL AND (${priorPred}) THEN e.debit ELSE 0 END), 0)::float AS prior_debit,
           COALESCE(SUM(CASE WHEN e.id IS NOT NULL AND (${priorPred}) THEN e.credit ELSE 0 END), 0)::float AS prior_credit,
           COALESCE(SUM(CASE WHEN e.id IS NOT NULL AND (${periodPred}) THEN e.debit ELSE 0 END), 0)::float AS period_debit,
           COALESCE(SUM(CASE WHEN e.id IS NOT NULL AND (${periodPred}) THEN e.credit ELSE 0 END), 0)::float AS period_credit
    FROM book_ledgers l
    LEFT JOIN book_account_groups g ON g.id = l.group_id AND g.tenant_id = l.tenant_id
    LEFT JOIN book_voucher_entries e ON e.ledger_id = l.id AND e.tenant_id = l.tenant_id
    LEFT JOIN book_vouchers v ON v.id = e.voucher_id AND v.tenant_id = e.tenant_id
    WHERE l.tenant_id = $1
    GROUP BY l.id, l.name, l.nature, l.ledger_type, l.opening_balance, l.opening_side, g.name
    ORDER BY l.name`;

  const { rows } = await pool.query(sql, params);
  return rows as LedgerAggRow[];
}

function toTbRows(aggs: LedgerAggRow[]): TrialBalanceLedgerRow[] {
  return aggs
    .map(r =>
      buildTrialBalanceRow({
        ledgerId: r.id,
        name: r.name,
        groupName: r.group_name,
        nature: r.nature,
        ledgerType: r.ledger_type,
        openingBalance: Number(r.opening_balance || 0),
        openingSide: r.opening_side,
        priorDebit: Number(r.prior_debit || 0),
        priorCredit: Number(r.prior_credit || 0),
        periodDebit: Number(r.period_debit || 0),
        periodCredit: Number(r.period_credit || 0),
      }),
    )
    .filter(
      r => r.openingDebit || r.openingCredit || r.periodDebit || r.periodCredit || r.closingDebit || r.closingCredit,
    );
}

export async function getTrialBalance(pool: Pool, tenantId: string, from: string | null, to: string | null) {
  const rows = toTbRows(await loadLedgerAggregates(pool, tenantId, from, to));
  const totals = rows.reduce(
    (acc, r) => {
      acc.openingDebit += r.openingDebit;
      acc.openingCredit += r.openingCredit;
      acc.periodDebit += r.periodDebit;
      acc.periodCredit += r.periodCredit;
      acc.closingDebit += r.closingDebit;
      acc.closingCredit += r.closingCredit;
      return acc;
    },
    {
      openingDebit: 0,
      openingCredit: 0,
      periodDebit: 0,
      periodCredit: 0,
      closingDebit: 0,
      closingCredit: 0,
    },
  );
  for (const k of Object.keys(totals) as (keyof typeof totals)[]) {
    totals[k] = round2(totals[k]);
  }
  return {
    from,
    to,
    rows,
    totals,
    balanced: Math.abs(totals.closingDebit - totals.closingCredit) < 0.02,
    count: rows.length,
  };
}

function periodNetIncome(row: TrialBalanceLedgerRow): number {
  // Income increases on credit
  return round2(row.periodCredit - row.periodDebit);
}

function periodNetExpense(row: TrialBalanceLedgerRow): number {
  return round2(row.periodDebit - row.periodCredit);
}

export async function getBooksProfitLoss(pool: Pool, tenantId: string, from: string | null, to: string | null) {
  const rows = toTbRows(await loadLedgerAggregates(pool, tenantId, from, to));
  const income: Array<{ name: string; groupName: string | null; amount: number; statementClass: StatementClass }> = [];
  const expenses: Array<{ name: string; groupName: string | null; amount: number; statementClass: StatementClass }> =
    [];

  for (const r of rows) {
    if (r.statementClass === 'income') {
      const amt = periodNetIncome(r);
      if (Math.abs(amt) >= 0.005)
        income.push({ name: r.name, groupName: r.groupName, amount: amt, statementClass: 'income' });
    } else if (r.statementClass === 'expense') {
      const amt = periodNetExpense(r);
      if (Math.abs(amt) >= 0.005)
        expenses.push({ name: r.name, groupName: r.groupName, amount: amt, statementClass: 'expense' });
    } else if (r.statementClass === 'trading') {
      const net = periodNetIncome(r); // credit-heavy → income
      if (net > 0.005) income.push({ name: r.name, groupName: r.groupName, amount: net, statementClass: 'trading' });
      else if (net < -0.005)
        expenses.push({
          name: r.name,
          groupName: r.groupName,
          amount: round2(-net),
          statementClass: 'trading',
        });
    }
  }

  const totalIncome = round2(income.reduce((s, x) => s + x.amount, 0));
  const totalExpenses = round2(expenses.reduce((s, x) => s + x.amount, 0));
  const netProfit = round2(totalIncome - totalExpenses);

  return {
    from,
    to,
    income: income.sort((a, b) => b.amount - a.amount),
    expenses: expenses.sort((a, b) => b.amount - a.amount),
    totalIncome,
    totalExpenses,
    netProfit,
    netLabel: netProfit >= 0 ? 'Net profit' : 'Net loss',
  };
}

export async function getBooksBalanceSheet(pool: Pool, tenantId: string, asOf: string | null) {
  // BS uses all movements through asOf; income/expense closed via net profit plug
  const rows = toTbRows(await loadLedgerAggregates(pool, tenantId, null, asOf));
  const assets: Array<{ name: string; groupName: string | null; amount: number }> = [];
  const liabilities: Array<{ name: string; groupName: string | null; amount: number }> = [];
  const capital: Array<{ name: string; groupName: string | null; amount: number }> = [];
  const pnl = await getBooksProfitLoss(pool, tenantId, null, asOf);

  for (const r of rows) {
    if (r.statementClass === 'income' || r.statementClass === 'expense' || r.statementClass === 'trading') {
      continue;
    }
    const { debit, credit } = splitDrCr(r.closingBalance);
    if (r.statementClass === 'capital') {
      if (credit >= 0.005) capital.push({ name: r.name, groupName: r.groupName, amount: credit });
      else if (debit >= 0.005) assets.push({ name: r.name, groupName: r.groupName, amount: debit });
      continue;
    }
    if (r.statementClass === 'liability') {
      if (credit >= 0.005) liabilities.push({ name: r.name, groupName: r.groupName, amount: credit });
      else if (debit >= 0.005) assets.push({ name: r.name, groupName: r.groupName, amount: debit });
      continue;
    }
    // asset + other
    if (debit >= 0.005) assets.push({ name: r.name, groupName: r.groupName, amount: debit });
    else if (credit >= 0.005) liabilities.push({ name: r.name, groupName: r.groupName, amount: credit });
  }

  if (pnl.netProfit >= 0.005) {
    capital.push({ name: 'Net profit (current period)', groupName: 'P&L', amount: pnl.netProfit });
  } else if (pnl.netProfit <= -0.005) {
    assets.push({ name: 'Net loss (current period)', groupName: 'P&L', amount: Math.abs(pnl.netProfit) });
  }

  const totalAssets = round2(assets.reduce((s, x) => s + x.amount, 0));
  const totalLiabilities = round2(liabilities.reduce((s, x) => s + x.amount, 0));
  const totalCapital = round2(capital.reduce((s, x) => s + x.amount, 0));
  const totalLiabilitiesAndCapital = round2(totalLiabilities + totalCapital);

  return {
    asOf,
    assets: assets.sort((a, b) => b.amount - a.amount),
    liabilities: liabilities.sort((a, b) => b.amount - a.amount),
    capital: capital.sort((a, b) => b.amount - a.amount),
    totalAssets,
    totalLiabilities,
    totalCapital,
    totalLiabilitiesAndCapital,
    netProfit: pnl.netProfit,
    balanced: Math.abs(totalAssets - totalLiabilitiesAndCapital) < 0.05,
    difference: round2(totalAssets - totalLiabilitiesAndCapital),
  };
}

export function describeBalance(signed: number) {
  return { ...splitDrCr(signed), label: formatBalanceLabel(signed) };
}

export { classifyLedger };
