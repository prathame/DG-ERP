/**
 * Books CA statements from book_ledgers + book_voucher_entries (not ops Accounts).
 */
import type { Pool } from 'pg';
import {
  buildStatementLines,
  buildTrialBalanceRow,
  classifyLedger,
  formatBalanceLabel,
  round2,
  signedOpeningBalance,
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
      AND v.voucher_type NOT IN ('pdc_receipt','pdc_payment','memorandum')
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

type TradingLine = {
  name: string;
  groupName: string | null;
  amount: number;
  kind: 'opening_stock' | 'closing_stock' | 'sales' | 'purchase' | 'direct' | 'trading';
};

function stockLike(name: string, groupName: string | null): boolean {
  // Perpetual ops stock stays on the BS; trading uses Purchase Account as COGS.
  if (name.trim().toLowerCase() === 'stock-in-hand') return false;
  return /\bstock\b|\binventory\b/.test(`${name} ${groupName || ''}`.toLowerCase());
}

function salesLike(name: string, groupName: string | null): boolean {
  return /\bsales\b|\brevenue\b/.test(`${name} ${groupName || ''}`.toLowerCase());
}

function purchaseOrDirectLike(name: string, groupName: string | null): boolean {
  const s = `${name} ${groupName || ''}`.toLowerCase();
  return /\bpurchase|\bdirect exp|\bcarriage in|\bfreight in|\bwages\b/.test(s);
}

/**
 * Miracle-style Trading account (gross profit) before P&L.
 * Debit: opening stock, purchases / direct costs, trading debit balances.
 * Credit: sales / trading credit balances, closing stock.
 */
export async function getTradingAccount(pool: Pool, tenantId: string, from: string | null, to: string | null) {
  const rows = toTbRows(await loadLedgerAggregates(pool, tenantId, from, to));
  const debit: TradingLine[] = [];
  const credit: TradingLine[] = [];
  const used = new Set<string>();

  for (const r of rows) {
    if (r.statementClass === 'asset' && stockLike(r.name, r.groupName)) {
      used.add(r.ledgerId);
      if (r.openingDebit >= 0.005) {
        debit.push({
          name: `Opening stock — ${r.name}`,
          groupName: r.groupName,
          amount: r.openingDebit,
          kind: 'opening_stock',
        });
      }
      if (r.closingDebit >= 0.005) {
        credit.push({
          name: `Closing stock — ${r.name}`,
          groupName: r.groupName,
          amount: r.closingDebit,
          kind: 'closing_stock',
        });
      }
    }
  }

  for (const r of rows) {
    if (used.has(r.ledgerId)) continue;
    if (r.statementClass === 'trading') {
      used.add(r.ledgerId);
      const net = periodNetIncome(r);
      if (net > 0.005) {
        credit.push({ name: r.name, groupName: r.groupName, amount: net, kind: 'trading' });
      } else if (net < -0.005) {
        debit.push({ name: r.name, groupName: r.groupName, amount: round2(-net), kind: 'trading' });
      }
      continue;
    }
    if (r.statementClass === 'income' && salesLike(r.name, r.groupName)) {
      used.add(r.ledgerId);
      const amt = periodNetIncome(r);
      if (Math.abs(amt) >= 0.005) {
        credit.push({ name: r.name, groupName: r.groupName, amount: amt, kind: 'sales' });
      }
      continue;
    }
    if (r.statementClass === 'expense' && purchaseOrDirectLike(r.name, r.groupName)) {
      used.add(r.ledgerId);
      const amt = periodNetExpense(r);
      if (Math.abs(amt) >= 0.005) {
        debit.push({
          name: r.name,
          groupName: r.groupName,
          amount: amt,
          kind: /\bpurchase/.test(`${r.name} ${r.groupName || ''}`.toLowerCase()) ? 'purchase' : 'direct',
        });
      }
    }
  }

  const totalDebitRaw = round2(debit.reduce((s, x) => s + x.amount, 0));
  const totalCreditRaw = round2(credit.reduce((s, x) => s + x.amount, 0));
  const grossProfit = round2(totalCreditRaw - totalDebitRaw);

  const debitOut = [...debit].sort((a, b) => b.amount - a.amount);
  const creditOut = [...credit].sort((a, b) => b.amount - a.amount);

  if (grossProfit >= 0.005) {
    debitOut.push({
      name: 'Gross profit c/d',
      groupName: 'Trading',
      amount: grossProfit,
      kind: 'trading',
    });
  } else if (grossProfit <= -0.005) {
    creditOut.push({
      name: 'Gross loss c/d',
      groupName: 'Trading',
      amount: Math.abs(grossProfit),
      kind: 'trading',
    });
  }

  const totalDebit = round2(debitOut.reduce((s, x) => s + x.amount, 0));
  const totalCredit = round2(creditOut.reduce((s, x) => s + x.amount, 0));

  return {
    from,
    to,
    debit: debitOut,
    credit: creditOut,
    totalDebit,
    totalCredit,
    grossProfit,
    grossLabel: grossProfit >= 0 ? 'Gross profit' : 'Gross loss',
  };
}

/** Cash-in-hand (drawer) — never a loan, even when the drawer is overdrawn. Bank OD stays a liability. */
export function isCashInHandLedger(ledgerType?: string | null, groupName?: string | null): boolean {
  const t = String(ledgerType || '')
    .trim()
    .toUpperCase();
  if (t === 'CS') return true;
  const g = String(groupName || '').toLowerCase();
  return /\bcash[\s-]?in[\s-]?hand\b/.test(g);
}

/** Where a non-P&L ledger sits on the balance sheet. Amount is signed for cash (negative = overdrawn drawer). */
export function placeBalanceSheetLine(r: {
  statementClass: StatementClass;
  ledgerType: string | null;
  groupName: string | null;
  closingBalance: number;
}): { side: 'assets' | 'liabilities' | 'capital'; amount: number } | null {
  if (r.statementClass === 'income' || r.statementClass === 'expense' || r.statementClass === 'trading') {
    return null;
  }
  const { debit, credit } = splitDrCr(r.closingBalance);
  if (isCashInHandLedger(r.ledgerType, r.groupName)) {
    const signed = round2(debit - credit);
    if (Math.abs(signed) < 0.005) return null;
    return { side: 'assets', amount: signed };
  }
  if (r.statementClass === 'capital') {
    if (credit >= 0.005) return { side: 'capital', amount: credit };
    if (debit >= 0.005) return { side: 'assets', amount: debit };
    return null;
  }
  if (r.statementClass === 'liability') {
    if (credit >= 0.005) return { side: 'liabilities', amount: credit };
    if (debit >= 0.005) return { side: 'assets', amount: debit };
    return null;
  }
  if (debit >= 0.005) return { side: 'assets', amount: debit };
  if (credit >= 0.005) return { side: 'liabilities', amount: credit };
  return null;
}

/** Period P&L plug on the balance sheet: profit or loss both sit in capital (loss is negative). */
export function periodPnlCapitalPlug(netProfit: number): { name: string; groupName: string; amount: number } | null {
  const n = round2(netProfit);
  if (n >= 0.005) return { name: 'Net profit (current period)', groupName: 'P&L', amount: n };
  if (n <= -0.005) return { name: 'Net loss (current period)', groupName: 'P&L', amount: n };
  return null;
}

export async function getBooksBalanceSheet(pool: Pool, tenantId: string, asOf: string | null) {
  // BS uses all movements through asOf; income/expense closed via net profit plug
  const rows = toTbRows(await loadLedgerAggregates(pool, tenantId, null, asOf));
  const assets: Array<{ name: string; groupName: string | null; amount: number }> = [];
  const liabilities: Array<{ name: string; groupName: string | null; amount: number }> = [];
  const capital: Array<{ name: string; groupName: string | null; amount: number }> = [];
  const pnl = await getBooksProfitLoss(pool, tenantId, null, asOf);

  for (const r of rows) {
    const placed = placeBalanceSheetLine(r);
    if (!placed) continue;
    if (placed.side === 'assets') assets.push({ name: r.name, groupName: r.groupName, amount: placed.amount });
    else if (placed.side === 'liabilities')
      liabilities.push({ name: r.name, groupName: r.groupName, amount: placed.amount });
    else capital.push({ name: r.name, groupName: r.groupName, amount: placed.amount });
  }

  const pnlPlug = periodPnlCapitalPlug(pnl.netProfit);
  if (pnlPlug) capital.push(pnlPlug);

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

export type FundBookKind = 'cash' | 'bank';

/**
 * Miracle-style Cash / Bank book for one CS or BK ledger (picker when multiple).
 * Lines show the fund account’s debit/credit with particulars = other ledgers on the voucher.
 */
export async function getFundBook(
  pool: Pool,
  tenantId: string,
  kind: FundBookKind,
  from: string | null,
  to: string | null,
  ledgerId?: string | null,
) {
  const ledgerType = kind === 'cash' ? 'CS' : 'BK';
  const accounts = (
    await pool.query(
      `SELECT id, name, external_ref, opening_balance, opening_side, ledger_type, group_id
       FROM book_ledgers
       WHERE tenant_id = $1 AND ledger_type = $2
       ORDER BY
         CASE
           WHEN external_ref = 'ACASHACT' THEN 0
           WHEN external_ref IN ('ops:CASH','ops:BANK') THEN 1
           ELSE 2
         END,
         name`,
      [tenantId, ledgerType],
    )
  ).rows as Array<{
    id: string;
    name: string;
    external_ref: string | null;
    opening_balance: number;
    opening_side: string | null;
    ledger_type: string;
  }>;

  const accountList = accounts.map(a => ({
    id: a.id,
    name: a.name,
    externalRef: a.external_ref,
  }));

  if (!accounts.length) {
    return {
      kind,
      accounts: accountList,
      ledger: null,
      from,
      to,
      opening: {
        debit: 0,
        credit: 0,
        balance: 0,
        balanceSide: null as ReturnType<typeof splitDrCr>['side'],
        balanceLabel: '0.00',
      },
      lines: [] as Array<{
        voucherId: string;
        date: string | Date;
        voucherNumber: string | null;
        voucherType: string;
        particulars: string;
        narration: string | null;
        debit: number;
        credit: number;
        balance: number;
        balanceSide: ReturnType<typeof splitDrCr>['side'];
        balanceLabel: string;
      }>,
      totals: { debit: 0, credit: 0 },
      closing: {
        debit: 0,
        credit: 0,
        balance: 0,
        balanceSide: null as ReturnType<typeof splitDrCr>['side'],
        balanceLabel: '0.00',
      },
    };
  }

  const selected =
    (ledgerId && accounts.find(a => a.id === ledgerId)) ||
    accounts.find(a => a.external_ref === 'ACASHACT') ||
    accounts.find(a => a.external_ref === (kind === 'cash' ? 'ops:CASH' : 'ops:BANK')) ||
    accounts[0];

  const bookOpening = signedOpeningBalance(selected.opening_balance, selected.opening_side);

  let priorSigned = 0;
  if (from) {
    const prior = await pool.query(
      `SELECT COALESCE(SUM(e.debit),0)::float AS debit, COALESCE(SUM(e.credit),0)::float AS credit
       FROM book_voucher_entries e
       JOIN book_vouchers v ON v.id = e.voucher_id AND v.tenant_id = e.tenant_id
       WHERE e.tenant_id = $1 AND e.ledger_id = $2 AND v.voucher_date < $3
         AND v.voucher_type NOT IN ('pdc_receipt','pdc_payment','memorandum')`,
      [tenantId, selected.id, from],
    );
    priorSigned = Number(prior.rows[0]?.debit || 0) - Number(prior.rows[0]?.credit || 0);
  }
  const openingSigned = bookOpening + priorSigned;
  const opening = splitDrCr(openingSigned);

  const params: unknown[] = [tenantId, selected.id];
  let sql = `
    SELECT e.voucher_id, v.voucher_date, v.voucher_number, v.voucher_type, v.narration,
           e.debit::float AS debit, e.credit::float AS credit,
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
    WHERE e.tenant_id = $1 AND e.ledger_id = $2
      AND v.voucher_type NOT IN ('pdc_receipt','pdc_payment','memorandum')`;
  if (from) {
    params.push(from);
    sql += ` AND v.voucher_date >= $${params.length}`;
  }
  if (to) {
    params.push(to);
    sql += ` AND v.voucher_date <= $${params.length}`;
  }
  sql += ` ORDER BY v.voucher_date, v.voucher_number NULLS LAST, e.line_no LIMIT 10000`;

  const { rows } = await pool.query(sql, params);
  const built = buildStatementLines(
    openingSigned,
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

  const lines = built.map((l, i) => ({
    voucherId: l.voucherId,
    date: typeof l.voucherDate === 'string' ? l.voucherDate.slice(0, 10) : l.voucherDate,
    voucherNumber: l.voucherNumber,
    voucherType: l.voucherType,
    particulars: String(rows[i]?.particulars || l.narration || '—'),
    narration: l.narration,
    debit: l.debit,
    credit: l.credit,
    balance: l.balance,
    balanceSide: l.balanceSide,
    balanceLabel: l.balanceLabel,
  }));

  const periodDebit = round2(lines.reduce((s, l) => s + l.debit, 0));
  const periodCredit = round2(lines.reduce((s, l) => s + l.credit, 0));
  const closingSigned = lines.length ? lines[lines.length - 1].balance : openingSigned;
  const closing = splitDrCr(closingSigned);

  return {
    kind,
    accounts: accountList,
    ledger: {
      id: selected.id,
      name: selected.name,
      ledgerType: selected.ledger_type,
      externalRef: selected.external_ref,
    },
    from,
    to,
    opening: {
      debit: opening.debit,
      credit: opening.credit,
      balance: openingSigned,
      balanceSide: opening.side,
      balanceLabel: formatBalanceLabel(openingSigned),
    },
    lines,
    totals: { debit: periodDebit, credit: periodCredit },
    closing: {
      debit: closing.debit,
      credit: closing.credit,
      balance: closingSigned,
      balanceSide: closing.side,
      balanceLabel: formatBalanceLabel(closingSigned),
    },
  };
}

export { classifyLedger };
