import { toCsv, r2 } from '../utils/csv-export';
import type {
  getTrialBalance,
  getBooksProfitLoss,
  getTradingAccount,
  getBooksBalanceSheet,
} from './bookFinancialStatements';
import type { getTradeRegister } from './bookTradeRegister';
import type { getFundBook } from './bookFinancialStatements';

type Tb = Awaited<ReturnType<typeof getTrialBalance>>;
type Pnl = Awaited<ReturnType<typeof getBooksProfitLoss>>;
type Trading = Awaited<ReturnType<typeof getTradingAccount>>;
type Bs = Awaited<ReturnType<typeof getBooksBalanceSheet>>;
type Trade = Awaited<ReturnType<typeof getTradeRegister>>;
type Fund = Awaited<ReturnType<typeof getFundBook>>;

function csvDate(value: string | Date | null | undefined): string {
  const toLocalIso = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  if (value instanceof Date) return toLocalIso(value);
  const s = String(value ?? '');
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const t = Date.parse(s);
  return Number.isFinite(t) ? toLocalIso(new Date(t)) : s;
}

export function trialBalanceCsv(data: Tb): string {
  const rows = data.rows.map(r => [
    r.name,
    r.groupName || '',
    r2(r.openingDebit),
    r2(r.openingCredit),
    r2(r.periodDebit),
    r2(r.periodCredit),
    r2(r.closingDebit),
    r2(r.closingCredit),
  ]);
  rows.push([
    'TOTALS',
    '',
    r2(data.totals.openingDebit),
    r2(data.totals.openingCredit),
    r2(data.totals.periodDebit),
    r2(data.totals.periodCredit),
    r2(data.totals.closingDebit),
    r2(data.totals.closingCredit),
  ]);
  return toCsv(
    ['Ledger', 'Group', 'Opening Dr', 'Opening Cr', 'Period Dr', 'Period Cr', 'Closing Dr', 'Closing Cr'],
    rows,
  );
}

export function profitLossCsv(data: Pnl): string {
  const rows: unknown[][] = [['INCOME', '', '']];
  for (const r of data.income) rows.push([r.name, r.groupName || '', r2(r.amount)]);
  rows.push(['Total income', '', r2(data.totalIncome)]);
  rows.push(['', '', '']);
  rows.push(['EXPENSES', '', '']);
  for (const r of data.expenses) rows.push([r.name, r.groupName || '', r2(r.amount)]);
  rows.push(['Total expenses', '', r2(data.totalExpenses)]);
  rows.push(['', '', '']);
  rows.push([data.netLabel, '', r2(Math.abs(data.netProfit))]);
  return toCsv(['Line', 'Group', 'Amount (₹)'], rows);
}

export function tradingAccountCsv(data: Trading): string {
  const rows: unknown[][] = [['DEBIT', '', '']];
  for (const r of data.debit) rows.push([r.name, r.groupName || '', r2(r.amount)]);
  rows.push(['Total debit', '', r2(data.totalDebit)]);
  rows.push(['', '', '']);
  rows.push(['CREDIT', '', '']);
  for (const r of data.credit) rows.push([r.name, r.groupName || '', r2(r.amount)]);
  rows.push(['Total credit', '', r2(data.totalCredit)]);
  rows.push(['', '', '']);
  rows.push([data.grossLabel, '', r2(Math.abs(data.grossProfit))]);
  return toCsv(['Line', 'Group', 'Amount (₹)'], rows);
}

export function balanceSheetCsv(data: Bs): string {
  const rows: unknown[][] = [['ASSETS', '', '']];
  for (const r of data.assets) rows.push([r.name, '', r2(r.amount)]);
  rows.push(['Total assets', '', r2(data.totalAssets)]);
  rows.push(['', '', '']);
  rows.push(['LIABILITIES', '', '']);
  for (const r of data.liabilities) rows.push([r.name, '', r2(r.amount)]);
  rows.push(['Total liabilities', '', r2(data.totalLiabilities)]);
  rows.push(['', '', '']);
  rows.push(['CAPITAL', '', '']);
  for (const r of data.capital) rows.push([r.name, '', r2(r.amount)]);
  rows.push(['Total capital', '', r2(data.totalCapital)]);
  rows.push(['', '', '']);
  rows.push(['Liabilities + Capital', '', r2(data.totalLiabilitiesAndCapital)]);
  return toCsv(['Line', 'Group', 'Amount (₹)'], rows);
}

export function dayBookCsv(
  rows: Array<{
    date: string;
    voucherNumber?: string | null;
    voucherType: string;
    ledgerName: string;
    debit: number;
    credit: number;
    narration?: string | null;
  }>,
): string {
  return toCsv(
    ['Date', 'Voucher No', 'Type', 'Ledger', 'Debit', 'Credit', 'Narration'],
    rows.map(r => [
      csvDate(r.date),
      r.voucherNumber || '',
      r.voucherType,
      r.ledgerName,
      r2(r.debit),
      r2(r.credit),
      r.narration || '',
    ]),
  );
}

export function tradeRegisterCsv(data: Trade): string {
  return toCsv(
    ['Date', 'Voucher No', 'Type', 'Party', 'Contra', 'Amount', 'Taxable', 'CGST', 'SGST', 'IGST', 'Narration'],
    data.rows.map(r => [
      csvDate(r.date),
      r.voucherNumber || '',
      r.voucherType || '',
      r.partyName || '',
      r.contraName || '',
      r2(r.amount),
      r2(r.taxable),
      r2(r.cgst),
      r2(r.sgst),
      r2(r.igst),
      r.narration || '',
    ]),
  );
}

export function fundBookCsv(data: Fund): string {
  return toCsv(
    ['Date', 'Voucher No', 'Type', 'Particulars', 'Debit', 'Credit', 'Balance'],
    data.lines.map(r => [
      csvDate(r.date),
      r.voucherNumber || '',
      r.voucherType,
      r.particulars || '',
      r2(r.debit),
      r2(r.credit),
      r2(r.balance),
    ]),
  );
}
